import { Schema, model, Document, Types } from "mongoose"

/**
 * 4. CLASS SCHEDULE SCHEMA (THE CORE LOGIC)
 */

/**
 * ENUM: Recurrence Types
 * Why: Ensures type safety. 'NONE' handles the "Normal Class" requirement,
 * while the others handle the "Advanced Scheduling Mode".
 */
export enum RecurrenceType {
  NONE = "none",
  DAILY = "daily",
  WEEKLY = "weekly",
  MONTHLY = "monthly",
  CUSTOM = "custom",
}

// Time Slot Interface
// Why: We store strings (HH:mm) for easy UI manipulation, but
// use them to generate real Date objects in 'scheduleInstances'.
interface ITimeSlot {
  startTime: string // e.g., "09:00"
  endTime: string // e.g., "10:30"
}

// Actual instance of a class on the calendar
// Why: Crucial for the Aggregation Pipeline. Instead of calculating dates
// every time a user views the calendar, we query these pre-calculated dates.
interface IScheduleInstance {
  start: Date // Full Date object (e.g., 2023-10-25T09:00:00)
  end: Date // Full Date object (e.g., 2023-10-25T10:30:00)
}

export interface IClassSchedule extends Document {
  title: string
  instructor: Types.ObjectId
  room: Types.ObjectId
  recurrenceType: RecurrenceType

  // Recurrence Boundaries
  startDate: Date // The very first day classes begin
  endDate?: Date // The date the recurrence stops (Optional for 'none')

  // Rule Definitions
  timeSlots: ITimeSlot[] // Supports multiple slots per day (Req: 9AM, 2PM, 6PM)
  daysOfWeek: number[] // 0-6 (Sun-Sat) - Used for Weekly/Custom
  daysOfMonth: number[] // 1-31 - Used for Monthly

  // The "Source of Truth" for Calendar UI
  // Why: Storing individual instances allows us to use $unwind in Aggregation
  // to find conflicts and populate the calendar extremely fast.
  scheduleInstances: IScheduleInstance[]
}

/**
 * INTERFACE: ITimeSlot
 * Why: Users can define multiple slots per day (e.g., 9 AM and 2 PM).
 * We store them as strings ("HH:mm") to make it easy for the UI to display
 * and for the backend to calculate the actual dates.
 */
interface ITimeSlot {
  startTime: string // Format: "09:00"
  endTime: string // Format: "10:00"
}

/**
 * INTERFACE: IScheduleInstance
 * Why: This is the "Secret Sauce" for your Aggregation Pipeline.
 * Instead of calculating recurrence logic every time a user views the calendar,
 * we store the pre-calculated dates. This makes fetching 1000s of events instant.
 */
interface IScheduleInstance {
  start: Date // Full ISO Date + Time
  end: Date // Full ISO Date + Time
}

export interface IClassSchedule extends Document {
  title: string
  instructor: Types.ObjectId
  room: Types.ObjectId
  recurrenceType: RecurrenceType
  startDate: Date
  endDate?: Date // Boundary for the loop (e.g., "Repeat until Dec 31st")
  timeSlots: ITimeSlot[]
  daysOfWeek: number[] // Used for Weekly (0-6)
  daysOfMonth: number[] // Used for Monthly (1-31)
  scheduleInstances: IScheduleInstance[]
}

const ClassScheduleSchema = new Schema<IClassSchedule>(
  {
    // Basic Info: Indexed for faster title searching
    title: { type: String, required: true, index: true },

    // Relationships: References to Instructor and Room models
    instructor: {
      type: Schema.Types.ObjectId,
      ref: "Instructor",
      required: true,
      index: true,
    },
    room: {
      type: Schema.Types.ObjectId,
      ref: "Room",
      required: true,
      index: true,
    },

    // Scheduling Strategy
    recurrenceType: {
      type: String,
      enum: Object.values(RecurrenceType),
      default: RecurrenceType.NONE,
      required: true,
    },

    // Boundaries: startDate is the first day; endDate is when the pattern stops
    startDate: { type: Date, required: true },
    endDate: { type: Date },

    // The raw slots (e.g., 9 AM, 2 PM).
    // Allowing multiple slots per day satisfies the "Example: 9 AM, 2 PM" requirement.
    timeSlots: [
      {
        startTime: { type: String, required: true },
        endTime: { type: String, required: true },
      },
    ],

    // Specific logic arrays for Weekly/Monthly recurrence
    daysOfWeek: [{ type: Number, min: 0, max: 6 }],
    daysOfMonth: [{ type: Number, min: 1, max: 31 }],

    /**
     * scheduleInstances:
     * This array is the key to the whole project.
     * 1. On Save: Your helper function generates every date in the pattern.
     * 2. On Fetch: Your Aggregation Pipeline uses $unwind on this array to show
     *    individual boxes on the Calendar UI.
     * 3. On Conflict: You check if any 'start' or 'end' overlaps with a new class.
     */
    scheduleInstances: [
      {
        start: { type: Date, required: true },
        end: { type: Date, required: true },
      },
    ],
  },
  { timestamps: true },
)

/**
 * INDEXES (CRITICAL FOR PERFORMANCE)
 *
 * 1. Conflict Prevention: This index allows MongoDB to instantly check
 * if a Room is booked at a specific time across ALL documents.
 */
ClassScheduleSchema.index({
  room: 1,
  "scheduleInstances.start": 1,
  "scheduleInstances.end": 1,
})

/**
 * 2. Calendar View Performance: When fetching classes for a specific month,
 * this index ensures the Aggregation Pipeline doesn't perform a "Full Collection Scan".
 */
ClassScheduleSchema.index({
  "scheduleInstances.start": 1,
  "scheduleInstances.end": 1,
})

export const ClassSchedule = model<IClassSchedule>(
  "ClassSchedule",
  ClassScheduleSchema,
)
