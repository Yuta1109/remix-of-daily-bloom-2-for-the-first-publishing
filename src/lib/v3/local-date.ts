/**
 * Canonical date utility for the V3 data model.
 *
 * Every user-facing day key in V3 is a LOCAL calendar date (`YYYY-MM-DD`).
 * `new Date().toISOString().split("T")[0]` is UTC-based and must never be used
 * for day keys: in JST it rolls over at 09:00 local time, which is why the
 * legacy Today store (`mindful-todo-data`) and Calendar disagreed.
 *
 * Instants (`createdAt` / `updatedAt` / `occurredAt`) are a different concept
 * and intentionally keep full ISO-8601 UTC timestamps.
 */

/** Local calendar date, `YYYY-MM-DD`. */
export type LocalDate = string;
/** Local wall-clock time, `HH:mm`. */
export type LocalTime = string;
/** Local wall-clock date+time without offset, `YYYY-MM-DDTHH:mm`. */
export type LocalDateTime = string;
/** Local month, `YYYY-MM` (1-based month, unlike legacy month-goals keys). */
export type LocalMonth = string;
/** Instant, ISO-8601 UTC (e.g. `2026-09-21T06:00:00.000Z`). */
export type Timestamp = string;

/** Sunday = 0 … Saturday = 6. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type WeekStartsOn = 0 | 1;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^(\d{2}):(\d{2})$/;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Local `YYYY-MM-DD` for a Date. Never UTC. */
export function toLocalDate(d: Date): LocalDate {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Today as a local date key. */
export function todayLocalDate(now: Date = new Date()): LocalDate {
  return toLocalDate(now);
}

/** Current instant as an ISO-8601 UTC timestamp. */
export function nowTimestamp(now: Date = new Date()): Timestamp {
  return now.toISOString();
}

export function isValidLocalDate(value: unknown): value is LocalDate {
  if (typeof value !== "string") return false;
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const [, y, mo, d] = m;
  const date = new Date(Number(y), Number(mo) - 1, Number(d));
  return (
    date.getFullYear() === Number(y) &&
    date.getMonth() === Number(mo) - 1 &&
    date.getDate() === Number(d)
  );
}

export function isValidLocalTime(value: unknown): value is LocalTime {
  if (typeof value !== "string") return false;
  const m = TIME_RE.exec(value);
  if (!m) return false;
  return Number(m[1]) <= 23 && Number(m[2]) <= 59;
}

/** Local midnight Date for a date key. Throws on malformed input. */
export function parseLocalDate(date: LocalDate): Date {
  const m = DATE_RE.exec(date);
  if (!m) throw new Error(`invalid local date: ${date}`);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** Local Date for a date key plus optional `HH:mm`. */
export function parseLocalDateTime(date: LocalDate, time?: LocalTime): Date {
  const base = parseLocalDate(date);
  if (!time || !isValidLocalTime(time)) return base;
  const [h, min] = time.split(":").map(Number);
  base.setHours(h, min, 0, 0);
  return base;
}

/** `YYYY-MM-DDTHH:mm` (local wall clock, no offset). All-day uses `00:00`. */
export function toLocalDateTime(date: LocalDate, time?: LocalTime): LocalDateTime {
  return `${date}T${time && isValidLocalTime(time) ? time : "00:00"}`;
}

/** Split a local wall-clock string back into date + optional time. */
export function splitLocalDateTime(value: LocalDateTime): {
  date: LocalDate;
  time?: LocalTime;
} {
  const [datePart, timePart] = String(value).split("T");
  return {
    date: datePart,
    time: isValidLocalTime(timePart) ? timePart : undefined,
  };
}

/** Date part of a local wall-clock string. */
export function localDateOf(value: LocalDateTime): LocalDate {
  return splitLocalDateTime(value).date;
}

export function addDays(date: LocalDate, days: number): LocalDate {
  const d = parseLocalDate(date);
  d.setDate(d.getDate() + days);
  return toLocalDate(d);
}

/** Adds months, clamping to the last valid day (Jan 31 + 1 month = Feb 28/29). */
export function addMonths(date: LocalDate, months: number): LocalDate {
  const d = parseLocalDate(date);
  const targetDay = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const lastDay = daysInMonth(d.getFullYear(), d.getMonth() + 1);
  d.setDate(Math.min(targetDay, lastDay));
  return toLocalDate(d);
}

export function daysInMonth(year: number, month1Based: number): number {
  return new Date(year, month1Based, 0).getDate();
}

/** Lexicographic comparison is safe for `YYYY-MM-DD`. */
export function compareLocalDates(a: LocalDate, b: LocalDate): -1 | 0 | 1 {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

export function isBefore(a: LocalDate, b: LocalDate): boolean {
  return a < b;
}

export function isAfter(a: LocalDate, b: LocalDate): boolean {
  return a > b;
}

export function isSameLocalDate(a: LocalDate, b: LocalDate): boolean {
  return a === b;
}

/** Inclusive on both ends. */
export function isWithin(date: LocalDate, start: LocalDate, end: LocalDate): boolean {
  return date >= start && date <= end;
}

export function daysBetween(from: LocalDate, to: LocalDate): number {
  const a = parseLocalDate(from).getTime();
  const b = parseLocalDate(to).getTime();
  return Math.round((b - a) / 86_400_000);
}

export function startOfMonth(date: LocalDate): LocalDate {
  return `${date.slice(0, 7)}-01`;
}

export function endOfMonth(date: LocalDate): LocalDate {
  const d = parseLocalDate(date);
  return toLocalDate(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

/** `YYYY-MM` with a 1-based month. */
export function toLocalMonth(date: LocalDate): LocalMonth {
  return date.slice(0, 7);
}

/** First day of a `YYYY-MM` month. */
export function localMonthStart(month: LocalMonth): LocalDate {
  return `${month}-01`;
}

export function localMonthEnd(month: LocalMonth): LocalDate {
  return endOfMonth(localMonthStart(month));
}

export function startOfWeek(date: LocalDate, weekStartsOn: WeekStartsOn = 1): LocalDate {
  const d = parseLocalDate(date);
  const diff = (d.getDay() - weekStartsOn + 7) % 7;
  d.setDate(d.getDate() - diff);
  return toLocalDate(d);
}

export function endOfWeek(date: LocalDate, weekStartsOn: WeekStartsOn = 1): LocalDate {
  return addDays(startOfWeek(date, weekStartsOn), 6);
}

export function weekdayOf(date: LocalDate): Weekday {
  return parseLocalDate(date).getDay() as Weekday;
}

/** 1-based index of this weekday within its month (1 = first). */
export function weekdayOccurrenceInMonth(date: LocalDate): number {
  return Math.floor((parseLocalDate(date).getDate() - 1) / 7) + 1;
}

/** True when no later date in the month shares this weekday. */
export function isLastWeekdayOfMonth(date: LocalDate): boolean {
  const d = parseLocalDate(date);
  const next = new Date(d);
  next.setDate(next.getDate() + 7);
  return next.getMonth() !== d.getMonth();
}

/** Inclusive list of date keys. Returns `[]` when `to < from`. */
export function eachLocalDate(from: LocalDate, to: LocalDate): LocalDate[] {
  if (to < from) return [];
  const out: LocalDate[] = [];
  let cursor = from;
  while (cursor <= to) {
    out.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return out;
}

/**
 * Calendar weeks that overlap a given month, clamped to `weekStartsOn`.
 *
 * Used by the Plan feature's Monthly → Weekly breakdown flow to offer the
 * candidate weeks inside a target month, without introducing a second
 * date-math utility — every boundary here is computed from the primitives
 * above.
 */
export function weeksOverlappingMonth(
  monthAnchor: LocalDate,
  weekStartsOn: WeekStartsOn = 1,
): Array<{ start: LocalDate; end: LocalDate }> {
  const monthStart = startOfMonth(monthAnchor);
  const monthEnd = endOfMonth(monthAnchor);
  const weeks: Array<{ start: LocalDate; end: LocalDate }> = [];
  let cursor = startOfWeek(monthStart, weekStartsOn);
  let guard = 0;
  while (cursor <= monthEnd && guard < 8) {
    weeks.push({ start: cursor, end: endOfWeek(cursor, weekStartsOn) });
    cursor = addDays(cursor, 7);
    guard += 1;
  }
  return weeks;
}

/**
 * Locale-aware display string. Formatting-only helper; storage always keeps the
 * raw `YYYY-MM-DD` key.
 */
export function formatLocalDate(
  date: LocalDate,
  locale: "en" | "ja",
  options: Intl.DateTimeFormatOptions = { year: "numeric", month: "short", day: "numeric" },
): string {
  return parseLocalDate(date).toLocaleDateString(locale === "ja" ? "ja-JP" : "en-US", options);
}
