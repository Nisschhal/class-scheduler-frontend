import { Request, Response } from "express"
import { ClassSchedule, RecurrenceStrategy } from "../models/class.model.js"
import { Instructor } from "../models/instructor.model.js"
import { PhysicalRoom } from "../models/room.model.js"
import { sendSuccess, sendError } from "../utils/api-response.js"
import { format } from "date-fns"
import { invalidateResourceCache } from "../utils/cache-helper.js"
import { generateAllClassSessions } from "../utils/schedule-generator.util.js"

/**
 * HELPER: EXPLICIT CONFLICT DETECTOR
 * @description Checks if an Instructor or Room is already booked for the proposed times.
 * @returns An explicit error message detailing WHO, WHERE, and WHEN the conflict is.
 */
const findDetailedSchedulingConflict = async (
  requestedSessions: { sessionStartDateTime: Date; sessionEndDateTime: Date }[],
  targetRoomId: string,
  targetInstructorId: string,
  ignoreSeriesId?: string,
) => {
  // 1. Prepare query logic: Check if any existing session overlaps with our proposed time slots
  const baseQuery = (field: string, id: string) => ({
    [field]: id,
    ...(ignoreSeriesId && { _id: { $ne: ignoreSeriesId } }), // Don't conflict with itself during updates
    preGeneratedClassSessions: {
      $elemMatch: {
        $or: requestedSessions.map((newSess) => ({
          sessionStartDateTime: { $lt: newSess.sessionEndDateTime },
          sessionEndDateTime: { $gt: newSess.sessionStartDateTime },
        })),
      },
    },
  })

  // 2. Run Instructor and Room checks simultaneously
  const [instructorConflict, roomConflict] = await Promise.all([
    ClassSchedule.findOne(
      baseQuery("assignedInstructor", targetInstructorId),
    ).populate("assignedInstructor"),
    ClassSchedule.findOne(baseQuery("assignedRoom", targetRoomId)).populate(
      "assignedRoom",
    ),
  ])

  if (!instructorConflict && !roomConflict) return null

  // 3. Identify the exact session that caused the overlap for the error message
  const conflictSource = instructorConflict || roomConflict
  const overlappingSession = conflictSource!.preGeneratedClassSessions.find(
    (existing) =>
      requestedSessions.some(
        (proposed) =>
          proposed.sessionStartDateTime < existing.sessionEndDateTime &&
          proposed.sessionEndDateTime > existing.sessionStartDateTime,
      ),
  )

  // 4. Format human-readable date and time
  const dateStr = format(
    overlappingSession!.sessionStartDateTime,
    "EEEE, MMM do, yyyy",
  )
  const timeStart = format(overlappingSession!.sessionStartDateTime, "hh:mm a")
  const timeEnd = format(overlappingSession!.sessionEndDateTime, "hh:mm a")

  // 5. Build the Explicit Message
  let entityName = ""
  let field = ""

  if (instructorConflict && roomConflict) {
    const teacher = (instructorConflict.assignedInstructor as any).name
    const room = (roomConflict.assignedRoom as any).roomName
    entityName = `Instructor "${teacher}" AND Room "${room}" are both`
    field = "assignedInstructor"
  } else if (instructorConflict) {
    const teacher = (instructorConflict.assignedInstructor as any).name
    entityName = `Instructor "${teacher}" is`
    field = "assignedInstructor"
  } else {
    const room = (roomConflict!.assignedRoom as any).roomName
    entityName = `Room "${room}" is`
    field = "assignedRoom"
  }

  return {
    field,
    message: `Conflict Detected: ${entityName} occupied on ${dateStr} from ${timeStart} to ${timeEnd}.`,
  }
}

/**
 * CREATE CLASS SERIES
 * @logic Generates all session dates based on rules and checks for overlaps before saving.
 */
export const createClassSeries = async (req: Request, res: Response) => {
  try {
    // Generate the array of sessions (Source of Truth)
    const generatedSessions = generateAllClassSessions(req.body)

    // Explicit overlap check
    const conflict = await findDetailedSchedulingConflict(
      generatedSessions,
      req.body.assignedRoom,
      req.body.assignedInstructor,
    )

    if (conflict)
      return sendError(res, "Scheduling Conflict", conflict.message, [conflict])

    const newClass = await ClassSchedule.create({
      ...req.body,
      preGeneratedClassSessions: generatedSessions,
    })

    await invalidateResourceCache("CLASSES")

    return sendSuccess(
      res,
      "Series Created",
      "The new class schedule and sessions have been generated.",
      newClass,
    )
  } catch (error: any) {
    return sendError(res, "Validation Error", error.message)
  }
}

/**
 * GET PAGINATED CLASSES
 * @logic Uses aggregation $facet to return data and total record count in a single request.
 */
export const getPaginatedClasses = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1
    const limit = parseInt(req.query.limit as string) || 10

    const results = await ClassSchedule.aggregate([
      {
        $facet: {
          metadata: [{ $count: "total" }],
          data: [
            { $sort: { createdAt: -1 } },
            { $skip: (page - 1) * limit },
            { $limit: limit },
            {
              $lookup: {
                from: "instructors",
                localField: "assignedInstructor",
                foreignField: "_id",
                as: "instructor",
              },
            },
            {
              $lookup: {
                from: "physicalrooms",
                localField: "assignedRoom",
                foreignField: "_id",
                as: "room",
              },
            },
            { $unwind: "$instructor" },
            { $unwind: "$room" },
          ],
        },
      },
    ])

    const total = results[0].metadata[0]?.total || 0

    return sendSuccess(
      res,
      "Classes Fetched",
      "Class list loaded successfully",
      results[0].data,
      {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    )
  } catch (error: any) {
    return sendError(res, "Server Error", "Unable to load class schedules.")
  }
}

/**
 * UPDATE ENTIRE SERIES (Bulk Edit)
 * @logic Re-generates sessions but protects manual overrides stored in 'exceptions'.
 */
export const updateEntireClassSeries = async (req: Request, res: Response) => {
  try {
    let id = req.params.id
    if (Array.isArray(id)) id = id[0]
    const series = await ClassSchedule.findById(id)
    if (!series) return sendError(res, "Not Found", "Series not found")

    // 1. Generate new sessions from the updated rules
    let newSessions = generateAllClassSessions(req.body)

    // 2. PROTECTION: Apply existing manual edits/cancellations to the new set
    newSessions = newSessions
      .map((sess) => {
        const manualEdit = series.exceptions.find(
          (ex) =>
            ex.originalStart.getTime() ===
              sess.sessionStartDateTime.getTime() && ex.status === "modified",
        )
        return manualEdit
          ? {
              ...sess,
              sessionStartDateTime: manualEdit.newStart!,
              sessionEndDateTime: manualEdit.newEnd!,
            }
          : sess
      })
      .filter(
        (sess) =>
          !series.exceptions.some(
            (ex) =>
              ex.originalStart.getTime() ===
                sess.sessionStartDateTime.getTime() &&
              ex.status === "cancelled",
          ),
      )

    // 3. Conflict Check the merged schedule
    const conflict = await findDetailedSchedulingConflict(
      newSessions,
      req.body.assignedRoom,
      req.body.assignedInstructor,
      id,
    )
    if (conflict)
      return sendError(res, "Conflict", conflict.message, [conflict])

    const updated = await ClassSchedule.findByIdAndUpdate(
      id,
      { ...req.body, preGeneratedClassSessions: newSessions },
      { new: true },
    )

    await invalidateResourceCache("CLASSES")
    return sendSuccess(
      res,
      "Series Updated",
      "The entire series and its sessions have been updated.",
      updated,
    )
  } catch (error: any) {
    return sendError(res, "Update Error", error.message)
  }
}

// class.controller.ts

export const updateSingleInstance = async (req: Request, res: Response) => {
  try {
    // Because of your middleware, these are already validated and cleaned
    const { seriesId, sessionId } = req.params
    const {
      newStart,
      newEnd,
      reason,
      classTitle,
      assignedInstructor,
      assignedRoom,
    } = req.body

    // 1. Fetch the parent series
    const series = await ClassSchedule.findById(seriesId)
    if (!series) return sendError(res, "Not Found", "Series not found")

    // 2. If it's already 'none', we don't detach, we just update normally
    if (series.recurrenceType === RecurrenceStrategy.SINGLE_INSTANCE) {
      // Logic for updating a standalone class (simple update)
      series.classTitle = classTitle || series.classTitle
      series.assignedInstructor =
        assignedInstructor || series.assignedInstructor
      series.assignedRoom = assignedRoom || series.assignedRoom

      if (newStart)
        series.preGeneratedClassSessions[0].sessionStartDateTime = newStart
      if (newEnd)
        series.preGeneratedClassSessions[0].sessionEndDateTime = newEnd

      await series.save()
      return sendSuccess(res, "Updated", "Standalone class updated", series)
    }

    // 3. DETACH LOGIC: Find the specific session
    const session = series.preGeneratedClassSessions.id(sessionId)
    if (!session)
      return sendError(res, "Not Found", "Session instance not found")

    const finalStart = newStart || session.sessionStartDateTime
    const finalEnd = newEnd || session.sessionEndDateTime

    // 4. Conflict Check for the new detached slot
    // We ignore the current seriesId to allow moving a session within its own time
    const conflict = await findDetailedSchedulingConflict(
      [{ sessionStartDateTime: finalStart, sessionEndDateTime: finalEnd }],
      assignedRoom || series.assignedRoom.toString(),
      assignedInstructor || series.assignedInstructor.toString(),
      seriesId,
    )
    if (conflict)
      return sendError(res, "Conflict", conflict.message, [conflict])

    /**
     * TRANSACTION-LIKE EXECUTION
     */

    // 5. Create the new Independent Class (None Strategy)
    const newStandaloneClass = await ClassSchedule.create({
      classTitle: classTitle || series.classTitle,
      assignedInstructor: assignedInstructor || series.assignedInstructor,
      assignedRoom: assignedRoom || series.assignedRoom,
      recurrenceType: RecurrenceStrategy.SINGLE_INSTANCE,
      seriesStartDate: finalStart,
      seriesEndDate: finalEnd,
      // Create the single session
      preGeneratedClassSessions: [
        {
          sessionStartDateTime: finalStart,
          sessionEndDateTime: finalEnd,
        },
      ],
      // Initialize other fields
      repeatEveryXWeeksOrDays: 1,
      selectedWeekdays: [],
      selectedMonthDays: [],
      manuallyChosenDates: [],
      dailyTimeSlots: [
        {
          startTime24h: format(finalStart, "HH:mm"),
          endTime24h: format(finalEnd, "HH:mm"),
        },
      ],
    })

    // 6. Update the original series:
    // Add to 'exceptions' so bulk-update doesn't recreate it
    series.exceptions.push({
      originalStart: session.sessionStartDateTime,
      status: "cancelled",
      reason: reason,
    })

    // 7. Remove from original series array
    series.preGeneratedClassSessions.pull(sessionId)

    await series.save()
    await invalidateResourceCache("CLASSES")

    return sendSuccess(
      res,
      "Detached Successfully",
      "Instance moved to independent schedule.",
      {
        newClass: newStandaloneClass,
        parentSeriesId: series._id,
      },
    )
  } catch (error: any) {
    return sendError(res, "Update Error", error.message)
  }
}
/**
 * CANCEL SINGLE INSTANCE
 * @logic Removes a session from the active list and marks it as cancelled in exceptions.
 */
export const cancelSingleInstance = async (req: Request, res: Response) => {
  try {
    const { seriesId, sessionId } = req.params
    const series = await ClassSchedule.findById(seriesId)
    if (!series) return sendError(res, "Not Found", "Series not found")

    const normalizedSessionId = Array.isArray(sessionId)
      ? sessionId[0]
      : sessionId
    const session = series.preGeneratedClassSessions.id(normalizedSessionId)
    if (!session) return sendError(res, "Not Found", "Session not found")

    series.exceptions.push({
      originalStart: session.sessionStartDateTime,
      status: "cancelled",
      reason: req.body?.reason ?? "Cancelled by user",
    })

    series.preGeneratedClassSessions.pull(sessionId)

    await series.save()
    await invalidateResourceCache("CLASSES")
    return sendSuccess(
      res,
      "Session Cancelled",
      "The session has been removed from the schedule.",
      { sessionId },
    )
  } catch (error: any) {
    return sendError(res, "Cancellation Error", error.message)
  }
}

/**
 * DELETE ENTIRE SERIES
 */
export const deleteEntireClassSeries = async (req: Request, res: Response) => {
  try {
    await ClassSchedule.findByIdAndDelete(req.params.id)
    await invalidateResourceCache("CLASSES")
    return sendSuccess(
      res,
      "Series Deleted",
      "The entire class series has been removed.",
      {},
    )
  } catch (error: any) {
    return sendError(
      res,
      "Delete Error",
      "An error occurred while deleting the series.",
    )
  }
}
