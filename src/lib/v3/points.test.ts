import { describe, expect, it } from "vitest";
import { NORMAL_CHALLENGE_POINTS, hasChallengePointAward, pointBalanceFrom } from "@/lib/v3/points";
import type { PointTransaction } from "@/lib/v3/types";

function tx(
  id: string,
  amount: number,
  extra: Partial<PointTransaction> = {},
): PointTransaction {
  return {
    id,
    amount,
    reason: extra.reason ?? "challenge",
    sourceId: extra.sourceId,
    assignmentId: extra.assignmentId,
    challengeId: extra.challengeId,
    assignmentDate: extra.assignmentDate,
    createdAt: extra.createdAt ?? "2026-09-21T12:00:00.000Z",
  };
}

describe("points ledger helpers", () => {
  it("9. normal daily challenges are worth 5 points", () => {
    expect(NORMAL_CHALLENGE_POINTS).toBe(5);
  });

  it("11. recomputes balance from PointTransaction rows", () => {
    const rows = [
      tx("a", 5, { reason: "challenge" }),
      tx("b", 5, { reason: "challenge" }),
      tx("c", -8, { reason: "store_purchase" }),
      tx("d", 3, { reason: "bonus" }),
    ];
    expect(pointBalanceFrom(rows)).toBe(5);
    expect(pointBalanceFrom([])).toBe(0);
  });

  it("does not treat a second row as a duplicate award for the same assignment", () => {
    const rows = [tx("a", 5, { sourceId: "assign-1", challengeId: "challenge.task_created" })];
    expect(hasChallengePointAward(rows, "assign-1")).toBe(true);
    expect(hasChallengePointAward(rows, "assign-2")).toBe(false);
  });

  it("treats assignmentId as the challenge award key when sourceId is absent", () => {
    const rows = [tx("a", 5, { assignmentId: "assign-1", challengeId: "challenge.task_created" })];
    expect(hasChallengePointAward(rows, "assign-1")).toBe(true);
  });
});
