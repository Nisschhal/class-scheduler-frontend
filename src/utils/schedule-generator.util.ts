// import { addMinutes, differenceInDays, differenceInWeeks } from "date-fns"

// /**
//  * INTERFACE: RequiredSessionStructure
//  * Why: This ensures the generator and the database model speak the same language.
//  */
// interface RequiredSessionStructure {
//   sessionStartDateTime: Date
//   sessionEndDateTime: Date
// }

// /**
//  * FUNCTION: calculateAllClassSessions
//  * Purpose: This is the "Engine" that loops through time to find every day a class should occur.
//  */
// export const calculateAllClassSessions = (
//   userRequestPayload: any,
// ): RequiredSessionStructure[] => {
//   const finalGeneratedSessions: RequiredSessionStructure[] = []

//   const {
//     seriesStartDate,
//     seriesEndDate,
//     recurrenceType,
//     dailyTimeSlots,
//     selectedWeekdays,
//     selectedMonthDays,
//     repeatEveryXWeeksOrDays = 1,
//     manuallyChosenDates = [],
//   } = userRequestPayload

//   /**
//    * SCENARIO 1: MANUAL DATE SELECTION (Custom Mode)
//    * Why: Handle users who picked random, non-pattern dates on a calendar.
//    */
//   if (recurrenceType === "custom" && manuallyChosenDates.length > 0) {
//     manuallyChosenDates.forEach((manuallyPickedDateString: string) => {
//       const baseDateObject = new Date(manuallyPickedDateString)
//       dailyTimeSlots.forEach((timeSlotObject: any) => {
//         // We push the result of our helper directly into the array
//         finalGeneratedSessions.push(
//           combineDateWithTime(
//             baseDateObject,
//             timeSlotObject.startTime24h,
//             timeSlotObject.endTime24h,
//           ),
//         )
//       })
//     })
//     return finalGeneratedSessions
//   }

//   /**
//    * SCENARIO 2: PATTERN-BASED GENERATION (Daily, Weekly, Monthly)
//    * Why: We use a 'Cursor' to walk from the start date to the end date.
//    */
//   let currentIterationDateCursor = new Date(seriesStartDate)
//   const scheduleStopBoundaryDate = seriesEndDate
//     ? new Date(seriesEndDate)
//     : currentIterationDateCursor

//   // Requirement: Logical time conflict prevention (Minimum 30 mins lead time)
//   const minimumAllowedFutureBuffer = addMinutes(new Date(), 30)

//   while (currentIterationDateCursor <= scheduleStopBoundaryDate) {
//     let isCurrentDayAMatchingDate = false

//     // A. Logic for DAILY repeat
//     if (recurrenceType === "daily") {
//       const totalDaysSinceStart = differenceInDays(
//         currentIterationDateCursor,
//         new Date(seriesStartDate),
//       )
//       if (totalDaysSinceStart % repeatEveryXWeeksOrDays === 0)
//         isCurrentDayAMatchingDate = true
//     }

//     // B. Logic for WEEKLY or CUSTOM repeat
//     else if (recurrenceType === "weekly" || recurrenceType === "custom") {
//       const totalWeeksSinceStart = differenceInWeeks(
//         currentIterationDateCursor,
//         new Date(seriesStartDate),
//       )
//       // Check if we match the "Every X Weeks" interval AND the correct weekday
//       if (
//         totalWeeksSinceStart % repeatEveryXWeeksOrDays === 0 &&
//         selectedWeekdays.includes(currentIterationDateCursor.getDay())
//       ) {
//         isCurrentDayAMatchingDate = true
//       }
//     }

//     // C. Logic for MONTHLY repeat
//     else if (recurrenceType === "monthly") {
//       if (selectedMonthDays.includes(currentIterationDateCursor.getDate()))
//         isCurrentDayAMatchingDate = true
//     }

//     // D. Logic for NO RECURRENCE (Single Event)
//     else if (recurrenceType === "none") {
//       isCurrentDayAMatchingDate = true
//     }

//     // IF MATCH: Add all time slots for this specific day
//     if (isCurrentDayAMatchingDate) {
//       dailyTimeSlots.forEach((timeSlot: any) => {
//         const generatedDateTimePair = combineDateWithTime(
//           currentIterationDateCursor,
//           timeSlot.startTime24h,
//           timeSlot.endTime24h,
//         )

//         // EDGE CASE: Ensure we aren't scheduling something in the past
//         if (
//           generatedDateTimePair.sessionStartDateTime >=
//           minimumAllowedFutureBuffer
//         ) {
//           finalGeneratedSessions.push(generatedDateTimePair)
//         }
//       })
//     }

//     // Move the cursor to the next day
//     currentIterationDateCursor = new Date(
//       currentIterationDateCursor.setDate(
//         currentIterationDateCursor.getDate() + 1,
//       ),
//     )

//     // If it's a one-time class, kill the loop immediately
//     if (recurrenceType === "none") break
//   }

//   return finalGeneratedSessions
// }

// /**
//  * HELPER: combineDateWithTime
//  * Why: Merges a "Day" (Date object) with "Clock Time" (String).
//  * Explicitly returns the property names requested by the interface.
//  */
// function combineDateWithTime(
//   baseDate: Date,
//   startTime24h: string,
//   endTime24h: string,
// ): RequiredSessionStructure {
//   const [startHour, startMinute] = startTime24h.split(":").map(Number)
//   const [endHour, endMinute] = endTime24h.split(":").map(Number)

//   const startDateTimeObject = new Date(baseDate)
//   startDateTimeObject.setHours(startHour, startMinute, 0, 0)

//   const endDateTimeObject = new Date(baseDate)
//   endDateTimeObject.setHours(endHour, endMinute, 0, 0)

//   return {
//     sessionStartDateTime: startDateTimeObject,
//     sessionEndDateTime: endDateTimeObject,
//   }
// }
import {
  addMinutes,
  differenceInDays,
  differenceInWeeks,
  isLastDayOfMonth,
  lastDayOfMonth,
  addDays,
} from "date-fns"

interface ClassSession {
  sessionStartDateTime: Date
  sessionEndDateTime: Date
}

/**
 * Helper function: Creates a valid class session object from a base date and 24-hour time strings.
 *
 * What it does:
 * 1. Parses start and end time strings (expected format: "HH:mm")
 * 2. Combines them with the base date to create full Date objects
 * 3. Validates that end time is strictly after start time
 * 4. Enforces a minimum class duration (to prevent meaningless ultra-short sessions)
 * 5. Throws descriptive errors on any validation failure
 *
 * Why we throw instead of returning null:
 * - We want the calling code to know immediately that something is wrong
 * - Silent failures lead to confusing empty results or half-generated schedules
 * - Descriptive errors help frontend/Postman users fix their input quickly
 */
function createValidClassSessionFromDateAndTimes(
  baseDate: Date,
  startTime24h: string,
  endTime24h: string,
): ClassSession {
  // Step 1: Parse the time strings into numbers
  const [startHour, startMinute] = startTime24h.split(":").map(Number)
  const [endHour, endMinute] = endTime24h.split(":").map(Number)

  // Early validation: make sure parsing succeeded
  if ([startHour, startMinute, endHour, endMinute].some(isNaN)) {
    throw new Error(
      `Invalid time format received. ` +
        `Expected "HH:mm" but got start="${startTime24h}" and end="${endTime24h}"`,
    )
  }

  // Step 2: Build full Date objects by combining base date + parsed times
  const sessionStart = new Date(baseDate)
  sessionStart.setHours(startHour, startMinute, 0, 0)

  const sessionEnd = new Date(baseDate)
  sessionEnd.setHours(endHour, endMinute, 0, 0)

  // Step 3: Ensure end time is strictly after start time (same-day assumption)
  if (sessionEnd <= sessionStart) {
    throw new Error(
      `Invalid time range: end time must be after start time. ` +
        `Received: ${startTime24h} → ${endTime24h} on ${baseDate.toDateString()}`,
    )
  }

  // Step 4: Enforce minimum class duration
  // Why 30 minutes? Prevents 1-minute or 5-minute "classes" which are usually mistakes
  // You can change this value based on your domain (e.g., 45 or 60 minutes for lectures)
  const MINIMUM_ALLOWED_DURATION_MINUTES = 30
  const actualDurationMinutes =
    (sessionEnd.getTime() - sessionStart.getTime()) / (1000 * 60)

  if (actualDurationMinutes < MINIMUM_ALLOWED_DURATION_MINUTES) {
    throw new Error(
      `Class duration is too short. ` +
        `Minimum allowed: ${MINIMUM_ALLOWED_DURATION_MINUTES} minutes. ` +
        `Received: ~${Math.round(actualDurationMinutes)} minutes (${startTime24h} → ${endTime24h})`,
    )
  }

  // All validations passed → return valid session
  return {
    sessionStartDateTime: sessionStart,
    sessionEndDateTime: sessionEnd,
  }
}

/**
 * Main function: Generates an array of class sessions based on the user's recurrence rules.
 *
 * Supported recurrence types:
 * - "none"           → single instance on seriesStartDate
 * - "daily"          → every X days
 * - "weekly"         → every X weeks on selected weekdays
 * - "monthly"        → on specific days of the month (or last day fallback)
 * - "custom"         → two modes:
 *     1. Manual date selection (when manuallyChosenDates is provided)
 *     2. Pattern-based repetition (when manuallyChosenDates is empty)
 *        → uses seriesStartDate → seriesEndDate + repeatEveryXWeeksOrDays + selectedWeekdays
 *
 * Throws descriptive errors when:
 * - Required fields are missing
 * - Dates are invalid
 * - Time slots are invalid or too short
 * - No valid future sessions could be generated
 */
export function generateAllClassSessions(payload: any): ClassSession[] {
  const generatedSessions: ClassSession[] = []

  // ── Extract and provide defaults for all expected fields ────────────────────────
  const {
    seriesStartDate,
    seriesEndDate,
    recurrenceType,
    dailyTimeSlots = [], // array of { startTime24h, endTime24h }
    selectedWeekdays = [], // 0=Sun ... 6=Sat
    selectedMonthDays = [], // 1..31
    repeatEveryXWeeksOrDays = 1, // interval (days or weeks depending on type)
    manuallyChosenDates = [], // array of "YYYY-MM-DD" strings
  } = payload

  // Early exit if no time slots at all (required for any session)
  if (dailyTimeSlots.length === 0) {
    throw new Error("At least one time slot (dailyTimeSlots) is required")
  }

  // Calculate the earliest allowed start time (now + 30 minutes buffer)
  const earliestAllowedStart = addMinutes(new Date(), 30)

  // ──────────────────────────────────────────────────────────────
  // CUSTOM RECURRENCE LOGIC – supports two mutually exclusive modes
  // ──────────────────────────────────────────────────────────────
  if (recurrenceType === "custom") {
    // ── MODE 1: MANUAL DATE SELECTION ───────────────────────────
    // Used when user explicitly picks individual dates (e.g. via calendar)
    if (manuallyChosenDates.length > 0) {
      manuallyChosenDates.forEach((dateString: string, index: number) => {
        const baseDate = new Date(dateString)

        // Skip invalid dates but log warning (don't crash whole request)
        if (isNaN(baseDate.getTime())) {
          console.warn(
            `Invalid manual date at index ${index}: "${dateString}" – skipping`,
          )
          return
        }

        dailyTimeSlots.forEach((slot: any) => {
          try {
            const session = createValidClassSessionFromDateAndTimes(
              baseDate,
              slot.startTime24h,
              slot.endTime24h,
            )

            // Only include sessions that start in the future (after buffer)
            if (session.sessionStartDateTime >= earliestAllowedStart) {
              generatedSessions.push(session)
            }
          } catch (err: any) {
            console.warn(
              `Manual date "${dateString}" skipped due to invalid time slot: ${err.message}`,
            )
          }
        })
      })
    }

    // ── MODE 2: PATTERN-BASED CUSTOM REPETITION ──────────────────
    // Used when no manual dates are given → fall back to interval pattern
    else {
      // These fields become mandatory in pattern mode
      if (!seriesStartDate || !seriesEndDate) {
        throw new Error(
          "Custom pattern mode requires both seriesStartDate and seriesEndDate",
        )
      }

      let currentDate = new Date(seriesStartDate)
      const patternEndDate = new Date(seriesEndDate)

      // Validate dates
      if (isNaN(currentDate.getTime()) || isNaN(patternEndDate.getTime())) {
        throw new Error("Invalid date format in custom pattern mode")
      }
      if (currentDate > patternEndDate) {
        throw new Error("seriesStartDate cannot be after seriesEndDate")
      }

      while (currentDate <= patternEndDate) {
        const weeksSincePatternStart = differenceInWeeks(
          currentDate,
          new Date(seriesStartDate),
        )
        const intervalWeeks = Math.max(1, repeatEveryXWeeksOrDays || 1)

        const isMatchingInterval = weeksSincePatternStart % intervalWeeks === 0
        const isMatchingWeekday =
          selectedWeekdays.length === 0 ||
          selectedWeekdays.includes(currentDate.getDay())

        if (isMatchingInterval && isMatchingWeekday) {
          dailyTimeSlots.forEach((slot: any) => {
            try {
              const session = createValidClassSessionFromDateAndTimes(
                currentDate,
                slot.startTime24h,
                slot.endTime24h,
              )

              if (session.sessionStartDateTime >= earliestAllowedStart) {
                generatedSessions.push(session)
              }
            } catch (err: any) {
              console.warn(
                `Custom pattern skipped on ${currentDate.toDateString()}: ${err.message}`,
              )
            }
          })
        }

        currentDate = addDays(currentDate, 1)
      }
    }

    // Safety net: custom should always produce something
    if (generatedSessions.length === 0) {
      throw new Error(
        "No valid sessions generated in custom mode. " +
          "Check: manual dates, or pattern settings (start/end dates, interval, weekdays).",
      )
    }

    return generatedSessions
  }

  // ──────────────────────────────────────────────────────────────
  // STANDARD RECURRENCE TYPES (none, daily, weekly, monthly)
  // ──────────────────────────────────────────────────────────────
  let currentDateCursor = new Date(seriesStartDate)
  const recurrenceEndBoundary = seriesEndDate
    ? new Date(seriesEndDate)
    : currentDateCursor

  if (isNaN(currentDateCursor.getTime())) {
    throw new Error(`Invalid seriesStartDate: "${seriesStartDate}"`)
  }

  while (currentDateCursor <= recurrenceEndBoundary) {
    let shouldIncludeThisDay = false

    if (recurrenceType === "daily") {
      const daysSinceStart = differenceInDays(
        currentDateCursor,
        new Date(seriesStartDate),
      )
      shouldIncludeThisDay = daysSinceStart % repeatEveryXWeeksOrDays === 0
    } else if (recurrenceType === "weekly") {
      const weeksSinceStart = differenceInWeeks(
        currentDateCursor,
        new Date(seriesStartDate),
      )
      shouldIncludeThisDay =
        weeksSinceStart % repeatEveryXWeeksOrDays === 0 &&
        selectedWeekdays.includes(currentDateCursor.getDay())
    } else if (recurrenceType === "monthly") {
      const currentDayOfMonth = currentDateCursor.getDate()
      const isLastDayOfCurrentMonth = isLastDayOfMonth(currentDateCursor)

      shouldIncludeThisDay =
        selectedMonthDays.includes(currentDayOfMonth) ||
        (isLastDayOfCurrentMonth &&
          selectedMonthDays.some(
            (d: number) => d > lastDayOfMonth(currentDateCursor).getDate(),
          ))
    } else if (recurrenceType === "none") {
      shouldIncludeThisDay = true
    }

    if (shouldIncludeThisDay) {
      dailyTimeSlots.forEach((slot: any) => {
        try {
          const session = createValidClassSessionFromDateAndTimes(
            currentDateCursor,
            slot.startTime24h,
            slot.endTime24h,
          )

          if (session.sessionStartDateTime >= earliestAllowedStart) {
            generatedSessions.push(session)
          }
        } catch (err: any) {
          console.warn(
            `Skipped invalid slot on ${currentDateCursor.toDateString()}: ${err.message}`,
          )
        }
      })
    }

    currentDateCursor = addDays(currentDateCursor, 1)

    // "none" should only process one day
    if (recurrenceType === "none") break
  }

  // Final safety net for all modes
  if (generatedSessions.length === 0) {
    throw new Error(
      "No future sessions could be generated. " +
        "Possible causes: past dates, invalid times, no matching days, or too short duration.",
    )
  }

  return generatedSessions
}
