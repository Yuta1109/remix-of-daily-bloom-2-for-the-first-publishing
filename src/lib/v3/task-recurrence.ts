/**
 * TaskSeries (Repeat Log) recurrence evaluation.
 *
 * Only monthly-day, yearly-date and monthly-weekday cadences exist here.
 * Daily and weekly-weekday cadences belong to `RoutineItem` and are rejected.
 */

import {
  addDays,
  daysInMonth,
  endOfMonth,
  isLastWeekdayOfMonth,
  isValidLocalDate,
  parseLocalDate,
  startOfMonth,
  toLocalDate,
  weekdayOccurrenceInMonth,
  weekdayOf,
  type LocalDate,
} from "./local-date";
import type { TaskRecurrence, TaskSeries } from "./types";

export type RecurrenceParseResult =
  | { ok: true; recurrence: TaskRecurrence }
  | { ok: false; reason: string };

/**
 * Validates an untrusted recurrence payload.
 * `daily` / `weekly` are explicitly refused — those are Routine cadences.
 */
export function parseTaskRecurrence(raw: unknown): RecurrenceParseResult {
  if (!raw || typeof raw !== "object") return { ok: false, reason: "not-an-object" };
  const value = raw as Record<string, unknown>;

  switch (value.type) {
    case "monthlyDay": {
      const day = Number(value.day);
      if (!Number.isInteger(day) || day < 1 || day > 31) {
        return { ok: false, reason: "invalid-day" };
      }
      return { ok: true, recurrence: { type: "monthlyDay", day } };
    }
    case "yearlyDate": {
      const month = Number(value.month);
      const day = Number(value.day);
      if (!Number.isInteger(month) || month < 1 || month > 12) {
        return { ok: false, reason: "invalid-month" };
      }
      if (!Number.isInteger(day) || day < 1 || day > 31) {
        return { ok: false, reason: "invalid-day" };
      }
      return { ok: true, recurrence: { type: "yearlyDate", month, day } };
    }
    case "monthlyWeekday": {
      const week = Number(value.week);
      const weekday = Number(value.weekday);
      if (![1, 2, 3, 4, 5, -1].includes(week)) return { ok: false, reason: "invalid-week" };
      if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
        return { ok: false, reason: "invalid-weekday" };
      }
      return {
        ok: true,
        recurrence: {
          type: "monthlyWeekday",
          week: week as 1 | 2 | 3 | 4 | 5 | -1,
          weekday: weekday as 0 | 1 | 2 | 3 | 4 | 5 | 6,
        },
      };
    }
    case "daily":
    case "weekly":
      return { ok: false, reason: "routine-cadence-not-allowed" };
    default:
      return { ok: false, reason: "unknown-type" };
  }
}

/** Whether a recurrence rule alone (ignoring series bounds) matches a date. */
export function recurrenceMatchesDate(
  recurrence: TaskRecurrence,
  date: LocalDate,
): boolean {
  if (!isValidLocalDate(date)) return false;
  const d = parseLocalDate(date);

  switch (recurrence.type) {
    case "monthlyDay": {
      const last = daysInMonth(d.getFullYear(), d.getMonth() + 1);
      // Day 31 in a 30-day month falls on the last day of that month.
      const target = Math.min(recurrence.day, last);
      return d.getDate() === target;
    }
    case "yearlyDate": {
      if (d.getMonth() + 1 !== recurrence.month) return false;
      const last = daysInMonth(d.getFullYear(), recurrence.month);
      return d.getDate() === Math.min(recurrence.day, last);
    }
    case "monthlyWeekday": {
      if (weekdayOf(date) !== recurrence.weekday) return false;
      if (recurrence.week === -1) return isLastWeekdayOfMonth(date);
      const nth = weekdayOccurrenceInMonth(date);
      if (nth === recurrence.week) return true;
      // A 5th weekday that does not exist falls back to the last one.
      return recurrence.week === 5 && isLastWeekdayOfMonth(date) && nth === 4;
    }
    default:
      return false;
  }
}

/** Whether a series produces an occurrence on `date`, honouring bounds. */
export function seriesOccursOn(series: TaskSeries, date: LocalDate): boolean {
  if (!series.active) return false;
  if (date < series.startDate) return false;
  if (series.endDate && date > series.endDate) return false;
  if (series.excludeDates?.includes(date)) return false;
  return recurrenceMatchesDate(series.recurrence, date);
}

/** Occurrence dates within an inclusive window. */
export function seriesOccurrencesInRange(
  series: TaskSeries,
  from: LocalDate,
  to: LocalDate,
): LocalDate[] {
  if (to < from) return [];
  const out: LocalDate[] = [];
  let cursor = from < series.startDate ? series.startDate : from;
  const limit = series.endDate && series.endDate < to ? series.endDate : to;
  let guard = 0;
  while (cursor <= limit && guard < 4000) {
    if (seriesOccursOn(series, cursor)) out.push(cursor);
    cursor = addDays(cursor, 1);
    guard += 1;
  }
  return out;
}

/** Next occurrence on or after `from`, scanning at most `horizonDays`. */
export function nextSeriesOccurrence(
  series: TaskSeries,
  from: LocalDate,
  horizonDays = 800,
): LocalDate | null {
  let cursor = from < series.startDate ? series.startDate : from;
  for (let i = 0; i <= horizonDays; i++) {
    if (series.endDate && cursor > series.endDate) return null;
    if (seriesOccursOn(series, cursor)) return cursor;
    cursor = addDays(cursor, 1);
  }
  return null;
}

/** Human-readable label. Display helper only; storage keeps the rule object. */
export function describeRecurrence(
  recurrence: TaskRecurrence,
  locale: "en" | "ja",
): string {
  const jaWeekdays = ["日", "月", "火", "水", "木", "金", "土"];
  const enWeekdays = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];

  switch (recurrence.type) {
    case "monthlyDay":
      return locale === "ja"
        ? `毎月${recurrence.day}日`
        : `Monthly on day ${recurrence.day}`;
    case "yearlyDate":
      return locale === "ja"
        ? `毎年${recurrence.month}月${recurrence.day}日`
        : `Yearly on ${recurrence.month}/${recurrence.day}`;
    case "monthlyWeekday": {
      if (locale === "ja") {
        const nth = recurrence.week === -1 ? "最終" : `第${recurrence.week}`;
        return `毎月${nth}${jaWeekdays[recurrence.weekday]}曜日`;
      }
      const nth =
        recurrence.week === -1
          ? "last"
          : ["", "1st", "2nd", "3rd", "4th", "5th"][recurrence.week];
      return `Monthly on the ${nth} ${enWeekdays[recurrence.weekday]}`;
    }
    default:
      return "";
  }
}

/** First day of the month containing `date` (re-exported for series callers). */
export { startOfMonth, endOfMonth, toLocalDate };
