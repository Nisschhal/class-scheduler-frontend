import type { Request, Response } from "express"
import { RoomType } from "../models/room.model.js"
import { sendSuccess, sendError } from "../utils/api-response.js"
import { invalidateResourceCache } from "../utils/index.js"

/**
 * @description Creates a new category for rooms (e.g., "Computer Lab").
 */
export const createNewRoomType = async (req: Request, res: Response) => {
  try {
    const newlyCreatedRoomType = await RoomType.create(req.body)
    console.log("New Room Type Created:", newlyCreatedRoomType)

    // IMPORTANT: Clear/invalidate cache so GET /api/rooms returns the new data
    await invalidateResourceCache("ROOMS")

    return sendSuccess(
      res,
      "Room Type Created",
      "The new room category has been added successfully.",
      newlyCreatedRoomType,
    )
  } catch (error: any) {
    console.error("Error Creating Room Type:", error)
    return sendError(
      res,
      "Validation Error",
      "Check if the room type name is unique.",
      [{ field: "name", message: error.message }],
    )
  }
}

/**
 * @description Retrieves all available room types.
 */
export const fetchAllRoomTypes = async (req: Request, res: Response) => {
  try {
    const listOfRoomTypes = await RoomType.find()

    return sendSuccess(
      res,
      "Room Types Fetched",
      "Successfully loaded the list of room categories.",
      listOfRoomTypes,
    )
  } catch (error: any) {
    return sendError(
      res,
      "Server Error",
      "Unable to load room types at this time.",
    )
  }
}

/**
 * @description Updates a room type name (e.g., renaming "Lab" to "Science Lab").
 */
export const updateRoomTypeDetails = async (req: Request, res: Response) => {
  try {
    const targetRoomTypeId = req.params.id as string

    const updatedRoomTypeRecord = await RoomType.findByIdAndUpdate(
      targetRoomTypeId,
      req.body,
      { new: true, runValidators: true },
    )

    if (!updatedRoomTypeRecord) {
      return sendError(
        res,
        "Not Found",
        "The room type you are trying to update does not exist.",
      )
    }

    // IMPORTANT: Clear/invalidate cache so GET /api/rooms returns the new data
    await invalidateResourceCache("ROOMS")

    return sendSuccess(
      res,
      "Updated",
      "Room type updated successfully.",
      updatedRoomTypeRecord,
    )
  } catch (error: any) {
    return sendError(res, "Update Error", error.message)
  }
}

/**
 * @description Deletes a room type category.
 */
export const removeRoomTypeFromSystem = async (req: Request, res: Response) => {
  try {
    const targetRoomTypeId = req.params.id as string

    const deletedRecord = await RoomType.findByIdAndDelete(targetRoomTypeId)

    if (!deletedRecord) {
      return sendError(res, "Not Found", "Room type not found.")
    }

    // IMPORTANT: Clear/invalidate cache so GET /api/rooms returns the new data
    await invalidateResourceCache("ROOMS")

    return sendSuccess(res, "Deleted", "The room type has been removed.", {})
  } catch (error: any) {
    return sendError(res, "Delete Error", "Could not remove room type.")
  }
}
