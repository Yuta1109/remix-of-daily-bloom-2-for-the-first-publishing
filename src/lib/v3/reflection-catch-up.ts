/**
 * Long-absence Reflection catch-up.
 *
 * Recent periods are still materialized as individual sessions. Older
 * unfinished periods are summarized so a 30+ day gap never dumps hundreds
 * of Daily rows. No second Reflection model — pending periods become
 * ordinary ReflectionSession rows only when the user reviews or skips them.
 */

import {
  addDays,
  addMonths,
  eachLocalDate,
  endOfMonth,
  endOfWeek,
  startOfMonth,
  startOfWeek,
  todayLocalDate,
  type LocalDate,
  type WeekStartsOn,
} from "./local-date";
import { isListedPlanStatus, isListedTaskStatus } from "./plan-rules";
import { isTerminalReflectionStatus, withDerivedStatus } from "./reflection";
import type { EssencesDataV3, PlanItem, ReflectionType } from "./types";

export const REFLECTION_RECENT_DAILY_DAYS = 21;
export const REFLECTION_RECENT_WEEKLY_WEEKS = 8;
export const REFLECTION_RECENT_MONTHS = 6;
export const REFLECTION_CATCH_UP_LOOKBACK_DAYS = 365;

export interface ReflectionCatchUpBucket {
  type: ReflectionType;
  pendingCount: number;
  from: LocalDate;
  to: LocalDate;
  /** Period starts, oldest first. UI should not dump this as a giant list. */
  periodStarts: LocalDate[];
}

export interface ReflectionCatchUpSummary {
  buckets: ReflectionCatchUpBucket[];
  totalPending: number;
}

export function recentDailyFrom(today: LocalDate): LocalDate {
  return addDays(today, -REFLECTION_RECENT_DAILY_DAYS);
}

export function recentWeeklyFrom(today: LocalDate, weekStartsOn: WeekStartsOn): LocalDate {
  return startOfWeek(addDays(today, -7 * REFLECTION_RECENT_WEEKLY_WEEKS), weekStartsOn);
}

export function recentMonthlyFrom(today: LocalDate): LocalDate {
  return startOfMonth(addMonths(today, -REFLECTION_RECENT_MONTHS));
}

function periodEndOf(
  type: ReflectionType,
  periodStart: LocalDate,
  weekStartsOn: WeekStartsOn,
): LocalDate {
  if (type === "daily") return periodStart;
  if (type === "weekly") return endOfWeek(periodStart, weekStartsOn);
  return endOfMonth(periodStart);
}

function findSession(
  data: EssencesDataV3,
  type: ReflectionType,
  periodStart: LocalDate,
) {
  return Object.values(data.reflections).find(
    (s) => s.type === type && s.targetPeriodStart === periodStart,
  );
}

function isTerminalSession(
  data: EssencesDataV3,
  type: ReflectionType,
  periodStart: LocalDate,
  now: Date,
): boolean {
  const session = findSession(data, type, periodStart);
  if (!session) return false;
  return isTerminalReflectionStatus(withDerivedStatus(session, now).status);
}

function isOpenSession(
  data: EssencesDataV3,
  type: ReflectionType,
  periodStart: LocalDate,
  now: Date,
): boolean {
  const session = findSession(data, type, periodStart);
  if (!session) return false;
  return !isTerminalReflectionStatus(withDerivedStatus(session, now).status);
}

function listedTasksOn(data: EssencesDataV3, date: LocalDate): boolean {
  return Object.values(data.tasks).some(
    (t) => t.date === date && isListedTaskStatus(t.status),
  );
}

function listedPlansOverlap(
  data: EssencesDataV3,
  level: PlanItem["level"],
  from: LocalDate,
  to: LocalDate,
): boolean {
  return Object.values(data.plans).some((p) => {
    if (p.level !== level || !isListedPlanStatus(p.status) || !p.periodStart) return false;
    const end = p.periodEnd ?? p.periodStart;
    return p.periodStart <= to && end >= from;
  });
}

function lookbackStart(data: EssencesDataV3, today: LocalDate): LocalDate | undefined {
  const cap = addDays(today, -REFLECTION_CATCH_UP_LOOKBACK_DAYS);
  let oldest: LocalDate | undefined;
  const consider = (date: LocalDate | undefined) => {
    if (!date || date < cap || date >= today) return;
    if (!oldest || date < oldest) oldest = date;
  };
  for (const task of Object.values(data.tasks)) {
    if (!isListedTaskStatus(task.status)) continue;
    consider(task.date);
  }
  for (const plan of Object.values(data.plans)) {
    if (!isListedPlanStatus(plan.status)) continue;
    consider(plan.periodStart);
  }
  for (const session of Object.values(data.reflections)) {
    consider(session.targetPeriodStart);
  }
  return oldest;
}

function bucket(
  type: ReflectionType,
  periodStarts: LocalDate[],
  weekStartsOn: WeekStartsOn,
): ReflectionCatchUpBucket | undefined {
  if (periodStarts.length === 0) return undefined;
  const from = periodStarts[0];
  const lastStart = periodStarts[periodStarts.length - 1];
  return {
    type,
    pendingCount: periodStarts.length,
    from,
    to: periodEndOf(type, lastStart, weekStartsOn),
    periodStarts,
  };
}

/**
 * Pending review periods older than the recent materialization window.
 * Empty calendar days with no Task / Plan / session are not counted.
 */
export function summarizeReflectionCatchUp(
  data: EssencesDataV3,
  now: Date = new Date(),
): ReflectionCatchUpSummary {
  const today = todayLocalDate(now);
  const weekStartsOn = data.settings.weekStartsOn;
  const oldest = lookbackStart(data, today);
  if (!oldest) return { buckets: [], totalPending: 0 };

  const dailyCutoff = addDays(recentDailyFrom(today), -1);
  const weeklyRecent = recentWeeklyFrom(today, weekStartsOn);
  const monthlyRecent = recentMonthlyFrom(today);

  const dailyStarts: LocalDate[] = [];
  if (oldest <= dailyCutoff) {
    for (const date of eachLocalDate(oldest, dailyCutoff)) {
      if (isTerminalSession(data, "daily", date, now)) continue;
      if (isOpenSession(data, "daily", date, now) || listedTasksOn(data, date)) {
        dailyStarts.push(date);
      }
    }
  }

  const weeklyStarts: LocalDate[] = [];
  const weeklyLast = addDays(weeklyRecent, -7);
  let week = startOfWeek(oldest, weekStartsOn);
  while (week <= weeklyLast) {
    const end = endOfWeek(week, weekStartsOn);
    if (!isTerminalSession(data, "weekly", week, now)) {
      if (isOpenSession(data, "weekly", week, now) || listedPlansOverlap(data, "weekly", week, end)) {
        weeklyStarts.push(week);
      }
    }
    week = addDays(week, 7);
  }

  const monthlyStarts: LocalDate[] = [];
  const monthlyLast = startOfMonth(addMonths(monthlyRecent, -1));
  let month = startOfMonth(oldest);
  while (month <= monthlyLast) {
    const end = endOfMonth(month);
    if (!isTerminalSession(data, "monthly", month, now)) {
      if (
        isOpenSession(data, "monthly", month, now) ||
        listedPlansOverlap(data, "monthly", month, end)
      ) {
        monthlyStarts.push(month);
      }
    }
    month = startOfMonth(addMonths(month, 1));
  }

  const buckets = [
    bucket("daily", dailyStarts, weekStartsOn),
    bucket("weekly", weeklyStarts, weekStartsOn),
    bucket("monthly", monthlyStarts, weekStartsOn),
  ].filter((b): b is ReflectionCatchUpBucket => !!b);

  return {
    buckets,
    totalPending: buckets.reduce((n, b) => n + b.pendingCount, 0),
  };
}

export function catchUpBucket(
  summary: ReflectionCatchUpSummary,
  type: ReflectionType,
): ReflectionCatchUpBucket | undefined {
  return summary.buckets.find((b) => b.type === type);
}

export function isRecentReflectionPeriod(
  type: ReflectionType,
  periodStart: LocalDate,
  today: LocalDate,
  weekStartsOn: WeekStartsOn,
): boolean {
  if (type === "daily") return periodStart >= recentDailyFrom(today);
  if (type === "weekly") return periodStart >= recentWeeklyFrom(today, weekStartsOn);
  if (type === "monthly" || type === "future") return periodStart >= recentMonthlyFrom(today);
  return true;
}
