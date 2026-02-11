/**
 * 2. INSTRUCTOR SCHEMA
 * Requirement: "CRUD for Instructor"
 */

import { model, Schema } from "mongoose"

export interface IInstructor extends Document {
  name: string
  email: string
}

const InstructorSchema = new Schema<IInstructor>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true },
  },
  { timestamps: true },
)

export const Instructor = model<IInstructor>("Instructor", InstructorSchema)
