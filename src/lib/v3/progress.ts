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
  getPointBalance,
  getSettings,
  getTaskStreak,
  getUserProfile,
} from "./repository";
import { loadEssencesData } from "./storage";
import { todayLocalDate, type LocalDate } from "./local-date";
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

export interface ProgressSnapshot {
  date: LocalDate;
  daily: DailyChallengeView[];
  special: SpecialChallengeView;
  analytics: AnalyticsSnapshot;
  streak: number;
  points: number;
  commentId: AnalyticsCommentId;
  commentKey: string;
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
  return {
    date,
    daily: assignments.map(toDailyView),
    special: specialChallengeView(getUserProfile().specialChallengeState),
    analytics,
    streak: getTaskStreak(date),
    points: getPointBalance(),
    commentId: analytics.commentId,
    commentKey: ANALYTICS_COMMENT_I18N[analytics.commentId],
  };
}
