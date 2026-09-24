/**
 * Point ledger helpers.
 *
 * Balance is always the sum of `PointTransaction` rows. There is no stored
 * mutable balance. Challenge awards are keyed by assignment id (`sourceId`)
 * so the same assignment can never pay twice.
 *
 * This module is not connected to Store / ads / subscription.
 */

import { NORMAL_CHALLENGE_POINTS } from "./challenge-definitions";
import type { PointTransaction } from "./types";

export { NORMAL_CHALLENGE_POINTS };

export function pointBalanceFrom(transactions: Iterable<PointTransaction>): number {
  let sum = 0;
  for (const t of transactions) sum += t.amount;
  return sum;
}

export function hasChallengePointAward(
  transactions: Iterable<PointTransaction>,
  assignmentId: string,
): boolean {
  for (const t of transactions) {
    if (t.reason !== "challenge") continue;
    if (t.sourceId === assignmentId || t.assignmentId === assignmentId) return true;
  }
  return false;
}
