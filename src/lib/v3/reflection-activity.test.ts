import { beforeEach, describe, expect, it } from "vitest";
import { reflectionPointsForScore } from "@/lib/v3/reflection-activity";
import {
  completeReflectionSession,
  completeTask,
  createReflectionDecision,
  createReflectionSession,
  createTask,
  getPointBalance,
  getPointTransactions,
  getReflectionAward,
} from "@/lib/v3/repository";
import { emptyData } from "@/lib/v3/schema";
import { resetEssencesDataCache, saveEssencesData } from "@/lib/v3/storage";
import { todayLocalDate } from "@/lib/v3/local-date";

describe("reflection points", () => {
  beforeEach(() => {
    localStorage.clear();
    resetEssencesDataCache();
    saveEssencesData(emptyData());
  });

  it("rounds score / 100 * 10 to an integer, capped at 10", () => {
    expect(reflectionPointsForScore(100)).toBe(10);
    expect(reflectionPointsForScore(95)).toBe(10);
    expect(reflectionPointsForScore(94)).toBe(9);
    expect(reflectionPointsForScore(5)).toBe(1);
    expect(reflectionPointsForScore(4)).toBe(0);
    expect(reflectionPointsForScore(0)).toBe(0);
    expect(reflectionPointsForScore(140)).toBe(10);
  });

  it("awards the score once and leaves the existing ledger additive", () => {
    const today = todayLocalDate();
    const task = createTask({ title: "Done", date: today });
    completeTask(task.id);
    const session = createReflectionSession({ type: "daily", anchorDate: today });
    createReflectionDecision({
      reflectionSessionId: session.id,
      subjectType: "task",
      subjectId: task.id,
      decision: "keep",
    });
    completeReflectionSession(session.id);
    completeReflectionSession(session.id);
    expect(getReflectionAward(session.id)).toBe(10);
    expect(getPointBalance()).toBe(10);
    expect(getPointTransactions().filter((tx) => tx.reason === "reflection")).toHaveLength(1);
  });
});
