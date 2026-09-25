/**
 * Static Challenge catalog.
 *
 * Definitions are predefined code — no AI API is ever called to generate
 * challenges. Each normal daily challenge awards `NORMAL_CHALLENGE_POINTS`.
 *
 * Challenge cadence (`cadence` below) is a SYSTEM concept and is unrelated to
 * `UserSettings.reflectionSchedule`, which is the user's personal reflection
 * rhythm. Cadence only answers "may this challenge be offered today?".
 */

import { daysBetween, type LocalDate } from "./local-date";
import type { ActivityType } from "./types";

export const NORMAL_CHALLENGE_POINTS = 5;

/** Challenges per day selected from the eligible pool. */
export const DAILY_CHALLENGE_COUNT = 6;

export type ChallengeKind = "daily" | "special";

export type ChallengeCategory =
  | "planning"
  | "execution"
  | "reflection"
  | "organization"
  | "calendar"
  | "notes"
  | "routine"
  | "consistency";

/** How often a definition may be offered. */
export type ChallengeCadence =
  | { type: "daily" }
  | { type: "everyNDays"; days: number }
  | { type: "weekly" }
  | { type: "monthly" };

/**
 * Completion condition / auto-complete rule identifier.
 *
 * `activityCount` auto-completes once N matching `ActivityRecord`s exist for the
 * day. State-based rules (`routineAllCompleted`, `taskCompletionRate`,
 * `dueTaskHandled`) recompute from V3 entities. Every challenge is capped at
 * once per day because an assignment exists at most once per (date, definition).
 */
export type ChallengeCondition =
  | { type: "activityCount"; activity: ActivityType; count: number }
  | { type: "routineAllCompleted" }
  | { type: "reflectionCompleted"; reflection: "daily" | "weekly" | "monthly" | "future" }
  | { type: "taskCompletionRate"; percent: number }
  | { type: "dueTaskHandled" }
  | { type: "none" };

export interface ChallengeDefinition {
  id: string;
  /** i18n key for the title. */
  titleKey: string;
  /** i18n key for the "what counts" description. */
  descriptionKey: string;
  category: ChallengeCategory;
  type: ChallengeKind;
  points: number;
  cadence: ChallengeCadence;
  /** Auto-complete rule. Same as `condition` — kept as `condition` for existing callers. */
  condition: ChallengeCondition;
  active: boolean;
  /** Lower sorts first when the eligible pool exceeds the daily count. */
  priority: number;
}

/** Alias required by the Phase 7 spec. */
export type AutoCompleteRule = ChallengeCondition;

export const TASK_COMPLETION_RATE_PERCENT = 70;

function activity(
  id: string,
  titleKey: string,
  descriptionKey: string,
  category: ChallengeCategory,
  type: ActivityType,
  priority: number,
  count = 1,
): ChallengeDefinition {
  return {
    id,
    titleKey,
    descriptionKey,
    category,
    type: "daily",
    points: NORMAL_CHALLENGE_POINTS,
    cadence: { type: "daily" },
    condition: { type: "activityCount", activity: type, count },
    active: true,
    priority,
  };
}

function dailyRule(
  id: string,
  titleKey: string,
  descriptionKey: string,
  category: ChallengeCategory,
  cadence: ChallengeCadence,
  condition: ChallengeCondition,
  priority: number,
): ChallengeDefinition {
  return {
    id,
    titleKey,
    descriptionKey,
    category,
    type: "daily",
    points: NORMAL_CHALLENGE_POINTS,
    cadence,
    condition,
    active: true,
    priority,
  };
}

/**
 * Reflection challenge cadences required by the spec:
 *   daily reflection   → every day
 *   weekly reflection  → every 3 days
 *   monthly reflection → every 1 week
 *   future reflection  → every 1 month
 *
 * These are offer frequencies, not ReflectionSession due/overdue rules.
 */
export const CHALLENGE_DEFINITIONS: ChallengeDefinition[] = [
  dailyRule(
    "challenge.reflection_daily",
    "challengeReflectionDaily",
    "challengeReflectionDailyDesc",
    "reflection",
    { type: "daily" },
    { type: "reflectionCompleted", reflection: "daily" },
    1,
  ),
  dailyRule(
    "challenge.reflection_weekly",
    "challengeReflectionWeekly",
    "challengeReflectionWeeklyDesc",
    "reflection",
    { type: "everyNDays", days: 3 },
    { type: "reflectionCompleted", reflection: "weekly" },
    2,
  ),
  dailyRule(
    "challenge.reflection_monthly",
    "challengeReflectionMonthly",
    "challengeReflectionMonthlyDesc",
    "reflection",
    { type: "weekly" },
    { type: "reflectionCompleted", reflection: "monthly" },
    3,
  ),
  dailyRule(
    "challenge.reflection_future",
    "challengeReflectionFuture",
    "challengeReflectionFutureDesc",
    "reflection",
    { type: "monthly" },
    { type: "reflectionCompleted", reflection: "future" },
    4,
  ),
  dailyRule(
    "challenge.routine_all_completed",
    "challengeRoutineAllCompleted",
    "challengeRoutineAllCompletedDesc",
    "routine",
    { type: "daily" },
    { type: "routineAllCompleted" },
    5,
  ),
  dailyRule(
    "challenge.task_completion_rate",
    "challengeTaskCompletionRate",
    "challengeTaskCompletionRateDesc",
    "execution",
    { type: "daily" },
    { type: "taskCompletionRate", percent: TASK_COMPLETION_RATE_PERCENT },
    6,
  ),
  dailyRule(
    "challenge.due_task_handled",
    "challengeDueTaskHandled",
    "challengeDueTaskHandledDesc",
    "execution",
    { type: "daily" },
    { type: "dueTaskHandled" },
    7,
  ),
  activity(
    "challenge.task_created",
    "challengeTaskCreated",
    "challengeTaskCreatedDesc",
    "execution",
    "task_created",
    10,
  ),
  activity(
    "challenge.task_completed",
    "challengeTaskCompleted",
    "challengeTaskCompletedDesc",
    "execution",
    "task_completed",
    11,
  ),
  activity(
    "challenge.calendar_viewed",
    "challengeCalendarViewed",
    "challengeCalendarViewedDesc",
    "calendar",
    "calendar_viewed",
    12,
  ),
  activity(
    "challenge.routine_created",
    "challengeRoutineCreated",
    "challengeRoutineCreatedDesc",
    "routine",
    "routine_created",
    13,
  ),
  activity(
    "challenge.routine_completed",
    "challengeRoutineCompleted",
    "challengeRoutineCompletedDesc",
    "routine",
    "routine_completed",
    14,
  ),
  activity(
    "challenge.stamp_added",
    "challengeStampAdded",
    "challengeStampAddedDesc",
    "calendar",
    "stamp_added",
    15,
  ),
  activity(
    "challenge.note_edited",
    "challengeNoteEdited",
    "challengeNoteEditedDesc",
    "notes",
    "note_edited",
    16,
  ),
  activity(
    "challenge.plan_updated",
    "challengePlanUpdated",
    "challengePlanUpdatedDesc",
    "planning",
    "plan_updated",
    17,
  ),
  activity(
    "challenge.breakdown_created",
    "challengeBreakdownCreated",
    "challengeBreakdownCreatedDesc",
    "planning",
    "breakdown_created",
    18,
  ),
  activity(
    "challenge.event_created",
    "challengeEventCreated",
    "challengeEventCreatedDesc",
    "calendar",
    "event_created",
    19,
  ),
  activity(
    "challenge.quick_memo_created",
    "challengeQuickMemoCreated",
    "challengeQuickMemoCreatedDesc",
    "notes",
    "quick_memo_created",
    20,
  ),
  activity(
    "challenge.future_task_scheduled",
    "challengeFutureTaskScheduled",
    "challengeFutureTaskScheduledDesc",
    "planning",
    "future_task_scheduled",
    21,
  ),
];

/**
 * Special Challenge catalog. Distinct `type: "special"` — never mixed into the
 * Daily Challenge assignment pool. Phase 7 only models locked / coming soon.
 */
export const SPECIAL_CHALLENGE_DEFINITIONS: ChallengeDefinition[] = [
  {
    id: "special.coming_soon",
    titleKey: "specialChallengePlaceholderTitle",
    descriptionKey: "specialChallengePlaceholderDesc",
    category: "consistency",
    type: "special",
    points: 20,
    cadence: { type: "daily" },
    condition: { type: "none" },
    active: false,
    priority: 0,
  },
];

export function challengeDefinition(id: string): ChallengeDefinition | undefined {
  return (
    CHALLENGE_DEFINITIONS.find((d) => d.id === id) ??
    SPECIAL_CHALLENGE_DEFINITIONS.find((d) => d.id === id)
  );
}

/**
 * Cadence epoch. Challenge cadences are counted from a fixed anchor so the
 * schedule is deterministic and independent of install date.
 */
export const CHALLENGE_CADENCE_EPOCH: LocalDate = "2026-01-01";

/** Whether a definition may be offered on `date` by cadence alone. */
export function isCadenceEligible(
  definition: ChallengeDefinition,
  date: LocalDate,
): boolean {
  const offset = daysBetween(CHALLENGE_CADENCE_EPOCH, date);
  switch (definition.cadence.type) {
    case "daily":
      return true;
    case "everyNDays":
      return offset >= 0 && offset % definition.cadence.days === 0;
    case "weekly":
      return offset >= 0 && offset % 7 === 0;
    case "monthly":
      return date.endsWith("-01");
    default:
      return false;
  }
}

/** Daily-pool eligibility: active daily type + cadence. Special never qualifies. */
export function isDailyChallengeEligible(
  definition: ChallengeDefinition,
  date: LocalDate,
): boolean {
  return (
    definition.type === "daily" &&
    definition.active &&
    isCadenceEligible(definition, date)
  );
}

/**
 * Deterministic daily selection: cadence-eligible daily definitions sorted by
 * priority, capped at `DAILY_CHALLENGE_COUNT`. Same date always yields the same
 * set, so re-running assignment is idempotent. No `Math.random()`.
 */
export function selectChallengesForDate(
  date: LocalDate,
  pool: ChallengeDefinition[] = CHALLENGE_DEFINITIONS,
): ChallengeDefinition[] {
  return pool
    .filter((d) => isDailyChallengeEligible(d, date))
    .sort((a, b) => (a.priority === b.priority ? a.id.localeCompare(b.id) : a.priority - b.priority))
    .slice(0, DAILY_CHALLENGE_COUNT);
}
