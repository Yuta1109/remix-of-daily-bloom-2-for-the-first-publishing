/**
 * Reflection session lifecycle.
 *
 * Reflection is NOT a hard deadline. Once `graceUntil` passes, the status
 * becomes `overdue` but the session stays fully executable — a late reflection
 * must never become unusable.
 */

import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  parseLocalDateTime,
  startOfMonth,
  startOfWeek,
  nowTimestamp,
  weekdayOf,
  type LocalDate,
  type Timestamp,
  type Weekday,
} from "./local-date";
import type {
  ReflectionScheduleRule,
  ReflectionSession,
  ReflectionStatus,
  ReflectionType,
} from "./types";

/** Terminal statuses are never recomputed from the clock. */
export function isTerminalReflectionStatus(status: ReflectionStatus): boolean {
  return status === "completed" || status === "skipped";
}

/**
 * Clock-derived status.
 *
 * before `scheduledAt`          → `scheduled`
 * between scheduled and grace   → `due`
 * after `graceUntil`            → `overdue` (still executable)
 */
export function deriveReflectionStatus(
  session: Pick<ReflectionSession, "status" | "scheduledAt" | "graceUntil">,
  now: Date = new Date(),
): ReflectionStatus {
  if (isTerminalReflectionStatus(session.status)) return session.status;
  const nowMs = now.getTime();
  if (nowMs < Date.parse(session.scheduledAt)) return "scheduled";
  if (nowMs <= Date.parse(session.graceUntil)) return "due";
  return "overdue";
}

/** An overdue session is late, never locked. */
export function isReflectionExecutable(
  session: Pick<ReflectionSession, "status" | "scheduledAt" | "graceUntil">,
  now: Date = new Date(),
): boolean {
  const status = deriveReflectionStatus(session, now);
  return status === "due" || status === "overdue" || status === "scheduled";
}

export function isReflectionOverdue(
  session: Pick<ReflectionSession, "status" | "scheduledAt" | "graceUntil">,
  now: Date = new Date(),
): boolean {
  return deriveReflectionStatus(session, now) === "overdue";
}

/** Refreshes non-terminal statuses against the clock. */
export function withDerivedStatus(
  session: ReflectionSession,
  now: Date = new Date(),
): ReflectionSession {
  const status = deriveReflectionStatus(session, now);
  return status === session.status ? session : { ...session, status };
}

export function startReflection(
  session: ReflectionSession,
  now: Date = new Date(),
): ReflectionSession {
  if (isTerminalReflectionStatus(session.status)) return session;
  return {
    ...withDerivedStatus(session, now),
    startedAt: session.startedAt ?? nowTimestamp(now),
  };
}

export function completeReflection(
  session: ReflectionSession,
  now: Date = new Date(),
): ReflectionSession {
  if (session.status === "completed") return session;
  const at = nowTimestamp(now);
  return {
    ...session,
    status: "completed",
    startedAt: session.startedAt ?? at,
    completedAt: at,
  };
}

export function skipReflection(
  session: ReflectionSession,
  now: Date = new Date(),
): ReflectionSession {
  if (isTerminalReflectionStatus(session.status)) return session;
  return { ...session, status: "skipped", completedAt: nowTimestamp(now) };
}

/** Target window a session reviews, given its type and anchor day. */
export function reflectionPeriod(
  type: ReflectionType,
  anchorDate: LocalDate,
  weekStartsOn: 0 | 1 = 0,
): { start: LocalDate; end?: LocalDate } {
  switch (type) {
    case "daily":
      return { start: anchorDate, end: anchorDate };
    case "weekly":
      return {
        start: startOfWeek(anchorDate, weekStartsOn),
        end: endOfWeek(anchorDate, weekStartsOn),
      };
    case "monthly":
      return { start: startOfMonth(anchorDate), end: endOfMonth(anchorDate) };
    case "future":
      // Cadence identity is the month of the review (`future` + YYYY-MM-01).
      // Subjects are active Future PlanItems, not a three-month date window.
      return { start: startOfMonth(anchorDate), end: endOfMonth(anchorDate) };
    default:
      return { start: anchorDate };
  }
}

/** `scheduledAt` / `graceUntil` for a session, derived from the user's rule. */
export function reflectionSchedule(
  rule: ReflectionScheduleRule,
  anchorDate: LocalDate,
): { scheduledAt: Timestamp; graceUntil: Timestamp } {
  const scheduled = parseLocalDateTime(anchorDate, rule.timeOfDay);
  const grace = new Date(scheduled.getTime() + rule.graceHours * 3_600_000);
  return { scheduledAt: scheduled.toISOString(), graceUntil: grace.toISOString() };
}

/** Next anchor day after `fromDate` for a reflection type. */
export function nextReflectionAnchor(
  type: ReflectionType,
  rule: ReflectionScheduleRule,
  fromDate: LocalDate,
  weekStartsOn: 0 | 1 = 0,
): LocalDate {
  switch (type) {
    case "daily":
      return addDays(fromDate, 1);
    case "weekly":
      return addDays(endOfWeek(fromDate, weekStartsOn), 7);
    case "monthly":
    case "future": {
      const nextMonth = addMonths(startOfMonth(fromDate), 1);
      const day = rule.dayOfMonth ?? 1;
      const clamped = Math.max(1, Math.min(day, Number(endOfMonth(nextMonth).slice(8))));
      return `${nextMonth.slice(0, 7)}-${String(clamped).padStart(2, "0")}`;
    }
    default:
      return addDays(fromDate, 1);
  }
}

/** First local date on or after `date` that falls on `weekday`. */
export function nextWeekdayOnOrAfter(date: LocalDate, weekday: Weekday): LocalDate {
  const current = weekdayOf(date);
  return addDays(date, (weekday - current + 7) % 7);
}

/**
 * Preferred review instant for a target period. Daily may fire the same
 * evening or the next morning (`scheduleOffsetDays`). Weekly / monthly fire
 * after the period ends. Future fires on the 1st of its cadence month.
 *
 * These times are preferences, not hard deadlines.
 */
export function scheduleAfterPeriod(
  type: ReflectionType,
  periodStart: LocalDate,
  periodEnd: LocalDate,
  rule: ReflectionScheduleRule,
): { scheduledAt: Timestamp; graceUntil: Timestamp } {
  let scheduleDate: LocalDate;
  switch (type) {
    case "daily":
      scheduleDate = addDays(periodStart, rule.scheduleOffsetDays ?? 0);
      break;
    case "weekly":
      scheduleDate = nextWeekdayOnOrAfter(addDays(periodEnd, 1), (rule.weekday ?? 0) as Weekday);
      break;
    case "monthly": {
      const nextMonth = addMonths(startOfMonth(periodStart), 1);
      const day = rule.dayOfMonth ?? 1;
      const last = Number(endOfMonth(nextMonth).slice(8));
      scheduleDate = `${nextMonth.slice(0, 7)}-${String(Math.max(1, Math.min(day, last))).padStart(2, "0")}`;
      break;
    }
    case "future": {
      const day = rule.dayOfMonth ?? 1;
      const last = Number(endOfMonth(periodStart).slice(8));
      scheduleDate = `${periodStart.slice(0, 7)}-${String(Math.max(1, Math.min(day, last))).padStart(2, "0")}`;
      break;
    }
    default:
      scheduleDate = periodStart;
  }
  return reflectionSchedule(rule, scheduleDate);
}

/** Deterministic identity for lazy session creation. */
export function reflectionSessionKey(type: ReflectionType, targetPeriodStart: LocalDate): string {
  return `${type}:${targetPeriodStart}`;
}

/**
 * Next period start for Keep.
 *
 * Uses the reflection session's reviewed window — never `today` and never the
 * subject's original date by itself. Daily Keep lands on the day after the
 * reviewed day; weekly/monthly/future Keep land on the start of the next period.
 */
export function keepCarryDate(session: Pick<ReflectionSession, "type" | "targetPeriodStart" | "targetPeriodEnd">): LocalDate {
  const start = session.targetPeriodStart;
  const end = session.targetPeriodEnd ?? start;
  switch (session.type) {
    case "daily":
      return addDays(end, 1);
    case "weekly":
      return addDays(end, 1);
    case "monthly":
    case "future":
      return addMonths(startOfMonth(start), 1);
    default:
      return addDays(end, 1);
  }
}
