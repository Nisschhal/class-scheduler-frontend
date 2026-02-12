import { Schema, model, Document, Types } from "mongoose"

/**
 * RECURRENCE PATTERN ENUM
 * Why: To strictly define how the schedule generator should loop through dates.
 */
export enum RecurrenceStrategy {
  SINGLE_INSTANCE = "none", // Occurs once
  EVERY_DAY = "daily", // repeats every X days
  SPECIFIC_WEEKDAYS = "weekly", // repeats on Mon, Wed, etc.
  SPECIFIC_MONTH_DAYS = "monthly", // repeats on 1st, 15th, etc.
  CUSTOM_LOGIC = "custom", // manual date selection or complex patterns
}

/**
 * Single scheduled session instance
 * Why: We pre-generate these so that the Calendar UI doesn't have to
 * calculate dates on the fly. This makes the system extremely fast.
 */
interface IIndividualClassSession {
  _id: Types.ObjectId // Critical for "Edit Single Instance" lookup
  sessionStartDateTime: Date
  sessionEndDateTime: Date
}

/**
 * Exception entry
 * Why: If a user moves a class from 9am to 11am, we store that here.
 * If the user later changes the "Class Title" for the whole series,
 * we use this array to make sure the 11am change isn't overwritten.
 */
interface IInstanceException {
  originalStart: Date // The "Anchor": Used to identify which session was changed
  status: "cancelled" | "modified"
  reason?: string
  newStart?: Date // The manual override start time
  newEnd?: Date // The manual override end time
}

export interface IClassSchedule extends Document {
  classTitle: string
  assignedInstructor: Types.ObjectId
  assignedRoom: Types.ObjectId
  recurrenceType: RecurrenceStrategy
  seriesStartDate: Date
  seriesEndDate?: Date
  repeatEveryXWeeksOrDays: number
  selectedWeekdays: number[]
  selectedMonthDays: number[]
  manuallyChosenDates: Date[]
  dailyTimeSlots: { startTime24h: string; endTime24h: string }[]
  preGeneratedClassSessions: Types.DocumentArray<IIndividualClassSession>
  exceptions: IInstanceException[]
}

const ClassScheduleSchema = new Schema<IClassSchedule>(
  {
    classTitle: { type: String, required: true, trim: true, index: true },
    assignedInstructor: {
      type: Schema.Types.ObjectId,
      ref: "Instructor",
      required: true,
      index: true,
    },
    assignedRoom: {
      type: Schema.Types.ObjectId,
      ref: "PhysicalRoom",
      required: true,
      index: true,
    },
    recurrenceType: {
      type: String,
      enum: Object.values(RecurrenceStrategy),
      required: true,
    },

    seriesStartDate: { type: Date, required: true },
    seriesEndDate: { type: Date },

    repeatEveryXWeeksOrDays: { type: Number, default: 1 },
    selectedWeekdays: [{ type: Number }],
    selectedMonthDays: [{ type: Number }],
    manuallyChosenDates: [{ type: Date }],

    dailyTimeSlots: [
      {
        startTime24h: { type: String, required: true },
        endTime24h: { type: String, required: true },
      },
    ],

    // THE SOURCE OF TRUTH: All queries look at this array
    preGeneratedClassSessions: [
      {
        sessionStartDateTime: { type: Date, required: true },
        sessionEndDateTime: { type: Date, required: true },
      },
    ],

    // THE MEMORY: Keeps track of manual overrides to allow re-editing
    exceptions: [
      {
        originalStart: { type: Date, required: true },
        status: {
          type: String,
          enum: ["modified", "cancelled"],
          default: "modified",
        },
        reason: { type: String, default: "" },
        newStart: { type: Date },
        newEnd: { type: Date },
      },
    ],
  },
  { timestamps: true },
)

// Compound indexes for ultra-fast conflict detection queries
ClassScheduleSchema.index({
  assignedRoom: 1,
  "preGeneratedClassSessions.sessionStartDateTime": 1,
})
ClassScheduleSchema.index({
  assignedInstructor: 1,
  "preGeneratedClassSessions.sessionStartDateTime": 1,
})

export const ClassSchedule = model<IClassSchedule>(
  "ClassSchedule",
  ClassScheduleSchema,
)
