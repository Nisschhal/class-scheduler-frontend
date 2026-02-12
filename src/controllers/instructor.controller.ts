import type { Request, Response } from "express"
import { Instructor } from "../models/instructor.model.js"
import { sendSuccess, sendError } from "../utils/api-response.js"
import { clearCache } from "../middleware/cache.middleware.js"
import { CACHE_KEYS } from "../utils/constants/cache-key.constant.js"
import { invalidateResourceCache } from "../utils/index.js"
/**
 * @description Creates a new instructor record in the database.
 * @logic       Invalidates any cached instructor lists to ensure data consistency.
 */
export const createNewInstructor = async (req: Request, res: Response) => {
  try {
    const newlyCreatedInstructor = await Instructor.create(req.body)

    // IMPORTANT: Clear/invalidate cache so GET /api/instructors returns the new data
    await invalidateResourceCache("INSTRUCTORS")

    return sendSuccess(
      res,
      "Instructor Created",
      "The new instructor has been successfully added to the system.",
      newlyCreatedInstructor,
    )
  } catch (error: any) {
    // We provide a field-specific error for the email to help the frontend highlight the input
    return sendError(
      res,
      "Validation Error",
      "The instructor details provided are invalid.",
      [{ field: "email", message: error.message }],
    )
  }
}

/**
 * @description Retrieves all instructors.
 * @logic       In a full implementation, this should check Redis before hitting MongoDB.
 */
export const fetchAllInstructors = async (req: Request, res: Response) => {
  try {
    const listOfAllInstructors = await Instructor.find()

    return sendSuccess(
      res,
      "Instructors Fetched",
      "The complete list of instructors has been loaded.",
      listOfAllInstructors,
    )
  } catch (error: any) {
    return sendError(
      res,
      "Server Error",
      "An internal error occurred while fetching the instructor list.",
    )
  }
}

/**
 * @description Updates an existing instructor's profile.
 */
export const updateInstructorDetails = async (req: Request, res: Response) => {
  try {
    const targetInstructorId = req.params.id as string

    const successfullyUpdatedInstructor = await Instructor.findByIdAndUpdate(
      targetInstructorId,
      req.body,
      { new: true, runValidators: true },
    )

    if (!successfullyUpdatedInstructor) {
      return sendError(
        res,
        "Not Found",
        "We could not find an instructor with the provided ID.",
      )
    }

    // IMPORTANT: Clear/invalidate cache so GET /api/instructors returns the new data
    await invalidateResourceCache("INSTRUCTORS")

    return sendSuccess(
      res,
      "Instructor Updated",
      "The instructor's information has been successfully updated.",
      successfullyUpdatedInstructor,
    )
  } catch (error: any) {
    return sendError(
      res,
      "Update Failed",
      "We were unable to save the changes to the instructor profile.",
    )
  }
}

/**
 * @description Removes an instructor from the system.
 */
export const removeInstructorFromSystem = async (
  req: Request,
  res: Response,
) => {
  try {
    const targetInstructorId = req.params.id as string

    const deletedInstructorRecord =
      await Instructor.findByIdAndDelete(targetInstructorId)

    if (!deletedInstructorRecord) {
      return sendError(
        res,
        "Not Found",
        "The instructor you are trying to delete does not exist.",
      )
    }

    // IMPORTANT: Clear/invalidate cache so GET /api/instructors returns the new data
    await invalidateResourceCache("INSTRUCTORS")

    return sendSuccess(
      res,
      "Instructor Deleted",
      "The instructor has been removed from the database.",
      {},
    )
  } catch (error: any) {
    return sendError(
      res,
      "Delete Error",
      "An error occurred while trying to remove the instructor.",
    )
  }
}
