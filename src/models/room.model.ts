import { Schema, model, Document, Types } from "mongoose"

/**
 * 1. ROOM TYPE SCHEMA
 * Requirement: "CRUD for room type"
 * Why: Separating Room Type allows for filtering rooms by their capabilities (e.g., "Lab" vs "Lecture Hall").
 */
export interface IRoomType extends Document {
  name: string // e.g., "Laboratory", "Conference Room"
}

const RoomTypeSchema = new Schema<IRoomType>(
  {
    name: { type: String, required: true, unique: true, trim: true },
  },
  { timestamps: true },
)

/**
 * 3. ROOM SCHEMA
 * Why: Includes a reference to RoomType for structured data.
 */
export interface IRoom extends Document {
  roomName: string
  roomType: Types.ObjectId // Reference to RoomType model
  capacity: number
}

const RoomSchema = new Schema<IRoom>(
  {
    roomName: { type: String, required: true },
    roomType: { type: Schema.Types.ObjectId, ref: "RoomType", required: true },
    capacity: { type: Number, required: true },
  },
  { timestamps: true },
)

export const Room = model<IRoom>("Room", RoomSchema)
export const RoomType = model<IRoomType>("RoomType", RoomTypeSchema)
