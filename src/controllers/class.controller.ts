import { Request, Response } from "express"
import { ClassSchedule } from "../models/class.model.js"
import { sendSuccess, sendError } from "../utils/api-response.js"
import { format } from "date-fns"
import { invalidateResourceCache } from "../utils/cache-helper.js"
import { generateAllClassSessions } from "../utils/schedule-generator.util.js"

/**
 * ATOMIC CONFLICT FINDER
 * Why: We need to know exactly which person/room is busy and at what time.
 * Logic: Checks if any existing session's START is before our NEW END,
 * and existing session's END is after our NEW START.
 */
/**
 * FUNCTION: findDetailedSchedulingConflict
 * Purpose: This identifies exactly which class, person, or room is causing a conflict.
 * Improvement: Now includes Year and a Time Range (Start to End) for better user clarity.
 */
const findDetailedSchedulingConflict = async (
  requestedSessionsByUser: any[],
  targetRoomId: string,
  targetInstructorId: string,
  ignoreCurrentClassId?: string,
) => {
  const conflictSearchQuery: any = {
    // We look for any class already using the requested Room OR Instructor
    $or: [
      { assignedRoom: targetRoomId },
      { assignedInstructor: targetInstructorId },
    ],
    // We look inside the individual sessions of those classes
    preGeneratedClassSessions: {
      $elemMatch: {
        $or: requestedSessionsByUser.map((newSession) => ({
          // OVERLAP LOGIC: Conflict exists if (NewStart < ExistingEnd) AND (NewEnd > ExistingStart)
          sessionStartDateTime: { $lt: newSession.sessionEndDateTime },
          sessionEndDateTime: { $gt: newSession.sessionStartDateTime },
        })),
      },
    },
  }

  // If we are updating an existing class, we ignore its own ID so it doesn't conflict with itself
  if (ignoreCurrentClassId) {
    conflictSearchQuery._id = { $ne: ignoreCurrentClassId }
  }

  const existingConflictingDocument = await ClassSchedule.findOne(
    conflictSearchQuery,
  ).populate("assignedRoom assignedInstructor")

  if (!existingConflictingDocument) return null

  // STEP: Identify the EXACT session that caused the overlap
  const exactProblematicSession =
    existingConflictingDocument.preGeneratedClassSessions.find(
      (existingSession) =>
        requestedSessionsByUser.some(
          (newlyRequestedSession) =>
            newlyRequestedSession.sessionStartDateTime <
              existingSession.sessionEndDateTime &&
            newlyRequestedSession.sessionEndDateTime >
              existingSession.sessionStartDateTime,
        ),
    )

  /**
   * FORMATTING THE EXPLICIT MESSAGE:
   * "EEEE, MMMM do, yyyy" -> Wednesday, February 18th, 2026
   * "p" -> 2:00 PM
   * Result: "Wednesday, February 18th, 2026 from 2:00 PM to 4:00 PM"
   */
  const formattedStartTime = format(
    exactProblematicSession!.sessionStartDateTime,
    "EEEE, MMMM do, yyyy 'at' p",
  )
  const formattedEndTime = format(
    exactProblematicSession!.sessionEndDateTime,
    "p",
  )

  const fullHumanReadableTimeRange = `${formattedStartTime} to ${formattedEndTime}`

  const conflictingInstructorName = (
    existingConflictingDocument.assignedInstructor as any
  ).name
  const conflictingRoomName = (existingConflictingDocument.assignedRoom as any)
    .roomName

  // Determine if the logic hit a Teacher conflict or a Room conflict
  const isInstructorTheProblem =
    existingConflictingDocument.assignedInstructor._id.toString() ===
    targetInstructorId

  const finalDetailField = isInstructorTheProblem
    ? "assignedInstructor"
    : "assignedRoom"

  /**
   * EXPLICIT MESSAGE EXAMPLE:
   * "Instructor Dr. Sarah Connor-Sky is already teaching "Physics 101 Lab" on Wednesday, February 18th, 2026 from 2:00 PM to 4:00 PM."
   */
  const finalErrorMessage = isInstructorTheProblem
    ? `Instructor ${conflictingInstructorName} is already teaching "${existingConflictingDocument.classTitle}" on ${fullHumanReadableTimeRange}.`
    : `Room ${conflictingRoomName} is already reserved for "${existingConflictingDocument.classTitle}" on ${fullHumanReadableTimeRange}.`

  return {
    field: finalDetailField,
    message: finalErrorMessage,
  }
}

/**
 * CREATE CLASS SERIES
 * Logic Update: Now automatically calculates 'seriesEndDate' if the user provides manual dates.
 */
export const createClassSeries = async (req: Request, res: Response) => {
  try {
    const {
      assignedRoom,
      assignedInstructor,
      recurrenceType,
      seriesEndDate,
      manuallyChosenDates,
    } = req.body

    /**
     * LOGIC FOR MANUAL MODE:
     * If the user picks specific dates but forgets to provide a "seriesEndDate",
     * we find the latest date in their list and use that as the boundary.
     * This satisfies the requirement that all recurring classes must have a boundary.
     */
    if (
      recurrenceType === "custom" &&
      manuallyChosenDates &&
      manuallyChosenDates.length > 0
    ) {
      if (!seriesEndDate) {
        // We sort the dates to find the one furthest in the future
        const sortedDates = [...manuallyChosenDates].sort(
          (firstDate, secondDate) =>
            new Date(firstDate).getTime() - new Date(secondDate).getTime(),
        )
        // We assign the last date in the sorted list to the request body
        req.body.seriesEndDate = sortedDates[sortedDates.length - 1]
        console.log(`Auto-assigned seriesEndDate: ${req.body.seriesEndDate}`)
      }
    }

    /**
     * 1. RECURRENCE BOUNDARY VALIDATION
     * Why: Now that we auto-calculate for manual mode, this will only
     * trigger if the user picks 'Daily/Weekly/Monthly' but forgets the end date.
     */
    if (recurrenceType !== "none" && !req.body.seriesEndDate) {
      return sendError(
        res,
        "Validation Error",
        "Repeating schedules require an End Date.",
        [
          {
            field: "seriesEndDate",
            message:
              "Please specify when this series stops or pick specific dates.",
          },
        ],
      )
    }

    // 2. GENERATE ALL SESSIONS
    // This calls your utility which handles the manual dates or pattern loops
    const allCalculatedSessions = generateAllClassSessions(req.body)

    if (allCalculatedSessions.length === 0) {
      return sendError(
        res,
        "Scheduling Error",
        "No future sessions were created. Ensure your selected dates and time are at least 30 minutes in the future.",
      )
    }

    // 3. ATOMIC CONFLICT CHECK (All or Nothing)
    const conflictResult = await findDetailedSchedulingConflict(
      allCalculatedSessions,
      assignedRoom,
      assignedInstructor,
    )

    if (conflictResult) {
      return sendError(res, "Scheduling Conflict", conflictResult.message, [
        conflictResult,
      ])
    }

    // 4. PERSIST TO DATABASE
    const newlyCreatedClass = await ClassSchedule.create({
      ...req.body,
      preGeneratedClassSessions: allCalculatedSessions,
    })

    // IMPORTANT: Clear/invalidate cache so GET /api/classes returns the new data
    await invalidateResourceCache("CLASSES")

    return sendSuccess(
      res,
      "Success",
      "Class series scheduled successfully.",
      newlyCreatedClass,
    )
  } catch (error: any) {
    return sendError(res, "Server Error", error.message)
  }
}

/**
 * GET CLASSES (With Aggregation and Pagination)
 */
export const getPaginatedClasses = async (req: Request, res: Response) => {
  try {
    const pageNumber = parseInt(req.query.page as string) || 1
    const itemsPerPage = parseInt(req.query.limit as string) || 10
    const skipCount = (pageNumber - 1) * itemsPerPage

    const aggregationResult = await ClassSchedule.aggregate([
      {
        $facet: {
          totalCountMetadata: [{ $count: "totalDocuments" }],
          paginatedData: [
            { $sort: { createdAt: -1 } },
            { $skip: skipCount },
            { $limit: itemsPerPage },
            {
              $lookup: {
                from: "instructors",
                localField: "assignedInstructor",
                foreignField: "_id",
                as: "instructorDetails",
              },
            },
            {
              $lookup: {
                from: "physicalrooms",
                localField: "assignedRoom",
                foreignField: "_id",
                as: "roomDetails",
              },
            },
            { $unwind: "$instructorDetails" },
            { $unwind: "$roomDetails" },
          ],
        },
      },
    ])

    console.log(
      "Aggregation Result:",
      JSON.stringify(aggregationResult, null, 2),
    )

    const finalDataList = aggregationResult[0].paginatedData
    const totalRecords =
      aggregationResult[0].totalCountMetadata[0]?.totalDocuments || 0

    const paginationResponse = {
      total: totalRecords,
      page: pageNumber,
      limit: itemsPerPage,
      totalPages: Math.ceil(totalRecords / itemsPerPage),
    }

    return sendSuccess(
      res,
      "Fetched",
      "Class list loaded.",
      finalDataList,
      paginationResponse,
    )
  } catch (error: any) {
    return sendError(res, "Server Error", error.message)
  }
}

/**
 * UPDATE CLASS SERIES
 */
export const updateClassSeries = async (req: Request, res: Response) => {
  try {
    /**
     * FIX: Use type casting to ensure TypeScript knows 'id' is a string.
     * req.params.id is standard, but some TS configs see it as string | string[].
     */
    const classIdToUpdate = req.params.id as string

    const newRequestedSessionsList = generateAllClassSessions(req.body)

    // 1. Conflict Check (Ignoring the current class ID)
    const conflictDetail = await findDetailedSchedulingConflict(
      newRequestedSessionsList,
      req.body.assignedRoom,
      req.body.assignedInstructor,
      classIdToUpdate, // We pass the ID here to IGNORE it in the search
    )

    if (conflictDetail) {
      return sendError(res, "Update Conflict", conflictDetail.message, [
        conflictDetail,
      ])
    }

    // 2. Perform Update
    const successfullyUpdatedDocument = await ClassSchedule.findByIdAndUpdate(
      classIdToUpdate,
      { ...req.body, preGeneratedClassSessions: newRequestedSessionsList },
      { new: true },
    )

    if (!successfullyUpdatedDocument) {
      return sendError(
        res,
        "Not Found",
        "The class you want to update does not exist.",
      )
    }

    // IMPORTANT: Clear/invalidate cache so GET /api/classes returns the new data
    await invalidateResourceCache("CLASSES")

    return sendSuccess(
      res,
      "Success",
      "Class updated successfully",
      successfullyUpdatedDocument,
    )
  } catch (error: any) {
    return sendError(res, "Server Error", error.message)
  }
}
