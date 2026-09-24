/**
 * ToDo presentation helpers.
 *
 * Keep these three entities distinct — never merge them into a generic
 * "recurring task":
 *
 * - RoutineItem: habit / recurring behavior (daily or weekly). ToDo only.
 *   Completion lives in RoutineCompletion, never on the RoutineItem itself.
 * - TaskSeries: date-based Repeat Log (monthly / yearly / monthly-weekday).
 *   Generates TaskItem occurrences; the series itself is not a CalendarEvent.
 * - TaskItem: the actual actionable instance. Plan Daily, ToDo and Calendar
 *   all read this same record. Reflection reviews TaskItems, not Routine
 *   definitions or TaskSeries definitions.
 */

import { addDays, type LocalDate } from "./local-date";
import { isListedTaskStatus } from "./plan-rules";
import type { TaskItem } from "./types";

/** Visible Upcoming window. Later this may become a user setting. */
export const TODO_UPCOMING_HORIZON_DAYS = 7;
/** Wider materialize / "See all upcoming" window — still not unlimited. */
export const TODO_UPCOMING_EXPANDED_DAYS = 90;

export function upcomingHorizonDays(expanded: boolean): number {
  return expanded ? TODO_UPCOMING_EXPANDED_DAYS : TODO_UPCOMING_HORIZON_DAYS;
}

export function upcomingEndDate(today: LocalDate, expanded: boolean): LocalDate {
  return addDays(today, upcomingHorizonDays(expanded));
}

export function splitListedTasks(tasks: TaskItem[]): {
  open: TaskItem[];
  completed: TaskItem[];
} {
  const listed = tasks.filter((t) => isListedTaskStatus(t.status));
  return {
    open: listed.filter((t) => t.status === "open"),
    completed: listed.filter((t) => t.status === "completed"),
  };
}
