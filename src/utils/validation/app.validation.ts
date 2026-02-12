import { z } from "zod"
import { RecurrenceStrategy } from "../../models/class.model.js"

// Helper for MongoDB ID validation
const objectIdSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, "Invalid ID format")

/**
 * FIXED DATE SCHEMA
 * Handles: Date objects, ISO strings, empty strings (""), and nulls.
 * Result: Returns a valid Date object or undefined.
 */
const safeDateSchema = z
  .union([
    z.date(),
    z
      .string()
      .transform((val) => (val.trim() === "" ? undefined : new Date(val))),
    z.null().transform(() => undefined),
  ])
  .pipe(
    z
      .date()
      .optional()
      .refine((d) => !d || !isNaN(d.getTime()), "Invalid date format"),
  )

/**
 * INSTRUCTOR VALIDATION
 */
export const instructorSchema = z.object({
  body: z.object({
    name: z.string().min(2, "Name must be at least 2 characters").trim(),
    email: z.string().email("Invalid email format").lowercase().trim(),
  }),
})

/**
 * ROOM TYPE VALIDATION
 */
export const roomTypeSchema = z.object({
  body: z.object({
    roomTypeName: z.string().min(2, "Room type name is required").trim(),
  }),
})

/**
 * PHYSICAL ROOM VALIDATION
 */
export const physicalRoomSchema = z.object({
  body: z.object({
    roomName: z.string().min(1, "Room name is required").trim(),
    roomTypeReference: objectIdSchema,
    seatingCapacity: z.number().int().positive("Capacity must be positive"),
  }),
})

/**
 * CLASS SCHEDULE VALIDATION
 */
export const classScheduleSchema = z.object({
  body: z.object({
    classTitle: z.string().min(3, "Class title is required").trim(),
    assignedInstructor: objectIdSchema,
    assignedRoom: objectIdSchema,
    recurrenceType: z.nativeEnum(RecurrenceStrategy),

    seriesStartDate: safeDateSchema,
    seriesEndDate: safeDateSchema, // Now handles the "" correctly

    repeatEveryXWeeksOrDays: z.number().int().min(1).default(1),
    selectedWeekdays: z.array(z.number().min(0).max(6)).optional().default([]),
    selectedMonthDays: z
      .array(z.number().min(1).max(31))
      .optional()
      .default([]),
    manuallyChosenDates: z.array(safeDateSchema).optional().default([]),

    dailyTimeSlots: z
      .array(
        z.object({
          _id: z.string().optional(), // Added this to prevent stripping existing IDs during PUT
          startTime24h: z
            .string()
            .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Format: HH:mm"),
          endTime24h: z
            .string()
            .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Format: HH:mm"),
        }),
      )
      .min(1, "At least one time slot is required"),
  }),
})

/**
 * DETACH SINGLE INSTANCE VALIDATION
 */
export const detachInstanceSchema = z.object({
  params: z.object({
    seriesId: objectIdSchema,
    sessionId: objectIdSchema,
  }),
  body: z.object({
    // These are optional: if not provided, we keep the original values
    newStart: safeDateSchema.optional(),
    newEnd: safeDateSchema.optional(),
    classTitle: z.string().min(3).optional(),
    assignedInstructor: objectIdSchema.optional(),
    assignedRoom: objectIdSchema.optional(),
    reason: z.string().optional().default("Detached from series"),
  }),
})

/**
 * PAGINATION QUERY VALIDATION
 */
export const paginationQuerySchema = z.object({
  query: z.object({
    page: z.preprocess(
      (val) => parseInt(val as string) || 1,
      z.number().min(1),
    ),
    limit: z.preprocess(
      (val) => parseInt(val as string) || 10,
      z.number().min(1),
    ),
  }),
})
