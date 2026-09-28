/**
 * Progress tab snapshot.
 *
 * Assigns today's Daily Challenges (idempotent), then reads V3 — no parallel
 * Progress store, and no React-localStorage writes.
 */

import {
  ANALYTICS_COMMENT_I18N,
  buildAnalytics,
  type AnalyticsCommentId,
  type AnalyticsSnapshot,
} from "./analytics";
import { challengeDefinition, type ChallengeDefinition } from "./challenge-definitions";
import {
  ensureDailyChallenges,
  getDailyChallenges,
  getPlanItems,
  getPointBalance,
  getPointTransactions,
  getSettings,
  getTaskCompletionRate,
  getTaskStreak,
  getUserProfile,
} from "./repository";
import { localDateOfTransaction } from "./points-series";
import { loadEssencesData } from "./storage";
import { toLocalDate, todayLocalDate, type LocalDate } from "./local-date";
import type { DailyChallengeAssignment, SpecialChallengeState } from "./types";

export interface DailyChallengeView {
  assignment: DailyChallengeAssignment;
  definition: ChallengeDefinition | undefined;
  titleKey: string;
  descriptionKey: string;
  completed: boolean;
  pointsAwarded: number;
}

export interface SpecialChallengeView {
  state: SpecialChallengeState;
  locked: boolean;
  comingSoon: boolean;
  titleKey: string;
  descriptionKey: string;
}

export const PROGRESS_TOP_INCOMPLETE = 3;

/** Today's activity only. Week and month analytics stay on the Analytics block. */
export interface TodayActivitySummary {
  taskCompletionRate: number;
  challengeCompletionRate: number;
  pointsEarned: number;
  plannedCount: number;
}

export function todayActivitySummary(
  date: LocalDate,
  daily: DailyChallengeView[],
): TodayActivitySummary {
  const completed = daily.filter((row) => row.completed).length;
  const pointsEarned = getPointTransactions()
    .filter((tx) => localDateOfTransaction(tx) === date && tx.amount > 0)
    .reduce((sum, tx) => sum + tx.amount, 0);
  const plannedCount = getPlanItems().filter(
    (plan) => !plan.inPostponeBox && toLocalDate(new Date(plan.createdAt)) === date,
  ).length;
  return {
    taskCompletionRate: getTaskCompletionRate(date),
    challengeCompletionRate: daily.length === 0 ? 0 : Math.round((completed / daily.length) * 100),
    pointsEarned,
    plannedCount,
  };
}

export interface ProgressSnapshot {
  date: LocalDate;
  daily: DailyChallengeView[];
  incomplete: DailyChallengeView[];
  completed: DailyChallengeView[];
  topIncomplete: DailyChallengeView[];
  remainingCount: number;
  special: SpecialChallengeView;
  analytics: AnalyticsSnapshot;
  streak: number;
  points: number;
  commentId: AnalyticsCommentId;
  commentKey: string;
  today: TodayActivitySummary;
}

function toDailyView(assignment: DailyChallengeAssignment): DailyChallengeView {
  const definition = challengeDefinition(assignment.challengeDefinitionId);
  return {
    assignment,
    definition,
    titleKey: definition?.titleKey ?? assignment.challengeDefinitionId,
    descriptionKey: definition?.descriptionKey ?? assignment.challengeDefinitionId,
    completed: assignment.status === "completed",
    pointsAwarded: assignment.pointsAwarded,
  };
}

export function specialChallengeView(state: SpecialChallengeState): SpecialChallengeView {
  const comingSoon = state === "comingSoon";
  return {
    state,
    locked: state === "locked",
    comingSoon,
    titleKey: comingSoon
      ? "progressSpecialChallengeComingSoon"
      : "progressSpecialChallengeLocked",
    descriptionKey: comingSoon
      ? "progressSpecialChallengeComingSoonBody"
      : "progressSpecialChallengeLockedBody",
  };
}

export function loadProgressSnapshot(date: LocalDate = todayLocalDate()): ProgressSnapshot {
  ensureDailyChallenges(date);
  const assignments = getDailyChallenges(date);
  const settings = getSettings();
  const data = loadEssencesData();
  const analytics = buildAnalytics(data, date, settings.weekStartsOn);
  const daily = assignments.map(toDailyView);
  const incomplete = daily.filter((row) => !row.completed);
  const completed = daily.filter((row) => row.completed);
  const topIncomplete = incomplete.slice(0, PROGRESS_TOP_INCOMPLETE);
  return {
    date,
    daily,
    incomplete,
    completed,
    topIncomplete,
    remainingCount: Math.max(0, daily.length - topIncomplete.length),
    special: specialChallengeView(getUserProfile().specialChallengeState),
    analytics,
    streak: getTaskStreak(date),
    points: getPointBalance(),
    commentId: analytics.commentId,
    commentKey: ANALYTICS_COMMENT_I18N[analytics.commentId],
    today: todayActivitySummary(date, daily),
  };
}
