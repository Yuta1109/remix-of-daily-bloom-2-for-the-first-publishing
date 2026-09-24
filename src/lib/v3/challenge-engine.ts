/**
 * Daily Challenge assignment engine.
 *
 * Pure / deterministic: same local date + same catalog → same ids. Persistence
 * lives in the repository (`ensureDailyChallenges`); this module does not
 * touch storage.
 */

import {
  CHALLENGE_DEFINITIONS,
  DAILY_CHALLENGE_COUNT,
  challengeDefinition,
  isCadenceEligible,
  isDailyChallengeEligible,
  selectChallengesForDate,
  type ChallengeDefinition,
} from "./challenge-definitions";
import type { LocalDate } from "./local-date";
import type { DailyChallengeAssignment } from "./types";

export {
  CHALLENGE_DEFINITIONS,
  DAILY_CHALLENGE_COUNT,
  challengeDefinition,
  isCadenceEligible,
  isDailyChallengeEligible,
  selectChallengesForDate,
};

export function dailyChallengeIdsForDate(
  date: LocalDate,
  pool: ChallengeDefinition[] = CHALLENGE_DEFINITIONS,
): string[] {
  return selectChallengesForDate(date, pool).map((d) => d.id);
}

export function assignmentIdsAreUnique(ids: readonly string[]): boolean {
  return new Set(ids).size === ids.length;
}

/** True when this date already has a persisted assignment set that must not change. */
export function dateHasFrozenAssignments(
  assignments: readonly DailyChallengeAssignment[],
  date: LocalDate,
): boolean {
  return assignments.some((a) => a.date === date);
}
