/**
 * Calendar presentation helpers for Phase 4A.
 *
 * Tasks stay V3 `TaskItem` records. Events are V3 `CalendarEventItem`
 * records; `events-store` is the CalendarEvent compatibility adapter
 * (recurrence / reminders / Live Activity). This module never copies
 * tasks into events and never writes a Calendar-specific task store.
 */

import { eventsForDate, type CalendarEvent } from "@/lib/events-store";
import { isListedTaskStatus } from "@/lib/v3/plan-rules";
import {
  ensureSeriesOccurrencesForRange,
  getListedTasksForDate,
  getTasksInRange,
} from "@/lib/v3/repository";
import type { LocalDate } from "@/lib/v3/local-date";
import type { TaskItem } from "@/lib/v3/types";

/** Month cells show at most this many compact markers per kind. */
export const CALENDAR_CELL_MARKER_LIMIT = 3;

export function calendarTasksForDate(date: LocalDate): TaskItem[] {
  return getListedTasksForDate(date);
}

/**
 * Materialize TaskSeries occurrences for a Calendar visible range only.
 * Month view should pass that month; week view should pass that week.
 * Does not create a Calendar-specific store — occurrences are V3 TaskItems.
 */
export function ensureCalendarVisibleOccurrences(
  from: LocalDate,
  to: LocalDate,
): TaskItem[] {
  return ensureSeriesOccurrencesForRange(from, to);
}

export function calendarTasksInRange(
  from: LocalDate,
  to: LocalDate,
): Map<LocalDate, TaskItem[]> {
  const grouped = getTasksInRange(from, to);
  const out = new Map<LocalDate, TaskItem[]>();
  for (const [date, tasks] of grouped) {
    const listed = tasks.filter((t) => isListedTaskStatus(t.status));
    if (listed.length) out.set(date, listed);
  }
  return out;
}

export function calendarEventsForDate(
  date: LocalDate,
  events?: CalendarEvent[],
): CalendarEvent[] {
  return eventsForDate(date, events);
}

export function isCalendarDayEmpty(
  tasks: TaskItem[],
  events: CalendarEvent[],
): boolean {
  return tasks.length === 0 && events.length === 0;
}

export type CalendarCellMarkers = {
  taskColors: string[];
  taskCompleted: boolean[];
  taskCount: number;
  eventCount: number;
  shownEventCount: number;
  allTasksComplete: boolean;
};

export function calendarCellMarkers(
  tasks: TaskItem[],
  events: CalendarEvent[],
): CalendarCellMarkers {
  const shownTasks = tasks.slice(0, CALENDAR_CELL_MARKER_LIMIT);
  return {
    taskColors: shownTasks.map((t) => t.color),
    taskCompleted: shownTasks.map((t) => t.status === "completed"),
    taskCount: tasks.length,
    eventCount: events.length,
    shownEventCount: Math.min(events.length, CALENDAR_CELL_MARKER_LIMIT),
    allTasksComplete: tasks.length > 0 && tasks.every((t) => t.status === "completed"),
  };
}

/** Empty cells before day 1 in a Sun=0 / Mon=1 week grid. */
export function monthGridLeadingBlanks(
  year: number,
  month0: number,
  weekStartsOn: 0 | 1,
): number {
  const firstWeekday = new Date(year, month0, 1).getDay();
  return (firstWeekday - weekStartsOn + 7) % 7;
}

export function shiftCalendarMonth(
  year: number,
  month0: number,
  delta: number,
): { year: number; month: number } {
  const d = new Date(year, month0 + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
}
