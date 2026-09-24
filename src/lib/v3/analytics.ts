/**
 * Deterministic Progress analytics.
 *
 * Scores are recomputed from `ActivityRecord` (and never invented). There is
 * no AI copy — comments are the first matching rule below.
 */

import {
  addDays,
  eachLocalDate,
  startOfMonth,
  startOfWeek,
  type LocalDate,
  type WeekStartsOn,
} from "./local-date";
import type { ActivityRecord, ActivityType, EssencesDataV3, ReflectionSession } from "./types";

export const SCORE_EXECUTION_CAP = 40;
export const SCORE_PLANNING_CAP = 25;
export const SCORE_REFLECTION_CAP = 25;
export const SCORE_CONSISTENCY_CAP = 10;

export type AnalyticsCommentId =
  | "quiet"
  | "fewReflections"
  | "routineConsistent"
  | "planningBusy"
  | "taskStable"
  | "onTrack";

export const ANALYTICS_COMMENT_I18N: Record<AnalyticsCommentId, string> = {
  quiet: "progressAnalyticsCommentQuiet",
  fewReflections: "progressAnalyticsCommentFewReflections",
  routineConsistent: "progressAnalyticsCommentRoutineConsistent",
  planningBusy: "progressAnalyticsCommentPlanningBusy",
  taskStable: "progressAnalyticsCommentTaskStable",
  onTrack: "progressAnalyticsCommentOnTrack",
};

export interface DayScoreInputs {
  taskCompleted: number;
  routineCompleted: number;
  planUpdated: number;
  breakdownCreated: number;
  futureTaskScheduled: number;
  reflectionCompleted: number;
  active: boolean;
}

const PLANNING_TYPES: ReadonlySet<ActivityType> = new Set([
  "plan_updated",
  "breakdown_created",
  "future_task_scheduled",
]);

export function countActivityOnDate(
  records: Iterable<ActivityRecord>,
  date: LocalDate,
  type?: ActivityType,
): number {
  let count = 0;
  for (const record of records) {
    if (record.localDate !== date) continue;
    if (type && record.type !== type) continue;
    count += 1;
  }
  return count;
}

export function dayScoreInputsFromRecords(
  records: Iterable<ActivityRecord>,
  date: LocalDate,
): DayScoreInputs {
  const inputs: DayScoreInputs = {
    taskCompleted: 0,
    routineCompleted: 0,
    planUpdated: 0,
    breakdownCreated: 0,
    futureTaskScheduled: 0,
    reflectionCompleted: 0,
    active: false,
  };
  for (const record of records) {
    if (record.localDate !== date) continue;
    inputs.active = true;
    switch (record.type) {
      case "task_completed":
        inputs.taskCompleted += 1;
        break;
      case "routine_completed":
        inputs.routineCompleted += 1;
        break;
      case "plan_updated":
        inputs.planUpdated += 1;
        break;
      case "breakdown_created":
        inputs.breakdownCreated += 1;
        break;
      case "future_task_scheduled":
        inputs.futureTaskScheduled += 1;
        break;
      case "reflection_completed":
        inputs.reflectionCompleted += 1;
        break;
      default:
        break;
    }
  }
  return inputs;
}

/**
 * 0–100. execution ≤40, planning ≤25, reflection ≤25, consistency ≤10.
 * Weights follow V3 activity types; empty days are 0.
 */
export function computeDayScore(inputs: DayScoreInputs): number {
  const execution = Math.min(
    SCORE_EXECUTION_CAP,
    inputs.taskCompleted * 12 + inputs.routineCompleted * 10,
  );
  const planning = Math.min(
    SCORE_PLANNING_CAP,
    inputs.planUpdated * 10 + inputs.breakdownCreated * 12 + inputs.futureTaskScheduled * 8,
  );
  const reflection = Math.min(SCORE_REFLECTION_CAP, inputs.reflectionCompleted * 20);
  const consistency = inputs.active ? SCORE_CONSISTENCY_CAP : 0;
  return execution + planning + reflection + consistency;
}

export function dayScoreFromData(data: EssencesDataV3, date: LocalDate): number {
  return computeDayScore(dayScoreInputsFromRecords(Object.values(data.activityRecords), date));
}

/** Inclusive local-date range for "this week", clamped so future days are not scored. */
export function thisWeekRange(
  today: LocalDate,
  weekStartsOn: WeekStartsOn,
): { start: LocalDate; end: LocalDate } {
  return { start: startOfWeek(today, weekStartsOn), end: today };
}

/** Inclusive local-date range for "this month", clamped to `today`. */
export function thisMonthRange(today: LocalDate): { start: LocalDate; end: LocalDate } {
  return { start: startOfMonth(today), end: today };
}

export function averageDayScore(
  data: EssencesDataV3,
  start: LocalDate,
  end: LocalDate,
): number {
  const days = eachLocalDate(start, end);
  if (days.length === 0) return 0;
  const sum = days.reduce((acc, date) => acc + dayScoreFromData(data, date), 0);
  return Math.round(sum / days.length);
}

export function completedReflectionCount(
  reflections: Iterable<ReflectionSession>,
  filter?: { from?: LocalDate; to?: LocalDate },
): number {
  let count = 0;
  for (const session of reflections) {
    if (session.status !== "completed") continue;
    if (filter?.from || filter?.to) {
      const day = session.targetPeriodStart;
      if (filter.from && day < filter.from) continue;
      if (filter.to && day > filter.to) continue;
    }
    count += 1;
  }
  return count;
}

export function activityRecordCount(
  records: Iterable<ActivityRecord>,
  filter?: { from?: LocalDate; to?: LocalDate },
): number {
  let count = 0;
  for (const record of records) {
    if (filter?.from && record.localDate < filter.from) continue;
    if (filter?.to && record.localDate > filter.to) continue;
    count += 1;
  }
  return count;
}

function countTypesInRange(
  records: ActivityRecord[],
  start: LocalDate,
  end: LocalDate,
  types: ReadonlySet<ActivityType>,
): number {
  let count = 0;
  for (const record of records) {
    if (record.localDate < start || record.localDate > end) continue;
    if (types.has(record.type)) count += 1;
  }
  return count;
}

export function pickAnalyticsComment(input: {
  activityLast3Days: number;
  reflectionsThisWeek: number;
  planningThisWeek: number;
  taskCompletedThisWeek: number;
  routineCompletedThisWeek: number;
  activityThisWeek: number;
}): AnalyticsCommentId {
  if (input.activityLast3Days === 0) return "quiet";
  if (input.activityThisWeek > 0 && input.reflectionsThisWeek === 0) return "fewReflections";
  if (input.routineCompletedThisWeek >= 5) return "routineConsistent";
  if (input.planningThisWeek >= 3) return "planningBusy";
  if (input.taskCompletedThisWeek >= 4) return "taskStable";
  return "onTrack";
}

export interface AnalyticsSnapshot {
  todayScore: number;
  yesterdayScore: number;
  weekScore: number;
  monthScore: number;
  weekRange: { start: LocalDate; end: LocalDate };
  monthRange: { start: LocalDate; end: LocalDate };
  reflectionCount: number;
  activityCount: number;
  commentId: AnalyticsCommentId;
}

export function buildAnalytics(
  data: EssencesDataV3,
  today: LocalDate,
  weekStartsOn: WeekStartsOn,
): AnalyticsSnapshot {
  const records = Object.values(data.activityRecords);
  const yesterday = addDays(today, -1);
  const week = thisWeekRange(today, weekStartsOn);
  const month = thisMonthRange(today);
  const last3Start = addDays(today, -2);

  const activityLast3Days = activityRecordCount(records, { from: last3Start, to: today });
  const activityThisWeek = activityRecordCount(records, { from: week.start, to: week.end });
  const reflectionsThisWeek = records.filter(
    (r) =>
      r.type === "reflection_completed" &&
      r.localDate >= week.start &&
      r.localDate <= week.end,
  ).length;

  return {
    todayScore: dayScoreFromData(data, today),
    yesterdayScore: dayScoreFromData(data, yesterday),
    weekScore: averageDayScore(data, week.start, week.end),
    monthScore: averageDayScore(data, month.start, month.end),
    weekRange: week,
    monthRange: month,
    reflectionCount: completedReflectionCount(Object.values(data.reflections)),
    activityCount: activityRecordCount(records),
    commentId: pickAnalyticsComment({
      activityLast3Days,
      reflectionsThisWeek,
      planningThisWeek: countTypesInRange(records, week.start, week.end, PLANNING_TYPES),
      taskCompletedThisWeek: countActivityInRange(
        records,
        week.start,
        week.end,
        "task_completed",
      ),
      routineCompletedThisWeek: countActivityInRange(
        records,
        week.start,
        week.end,
        "routine_completed",
      ),
      activityThisWeek,
    }),
  };
}

function countActivityInRange(
  records: ActivityRecord[],
  start: LocalDate,
  end: LocalDate,
  type: ActivityType,
): number {
  let count = 0;
  for (const record of records) {
    if (record.localDate < start || record.localDate > end) continue;
    if (record.type === type) count += 1;
  }
  return count;
}
