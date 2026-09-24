import { beforeEach, describe, expect, it } from "vitest";
import {
  createPlanItem,
  createReflectionDecision,
  createTask,
  ensureCatchUpSessions,
  ensureReflectionSessions,
  getPlanItem,
  getReflection,
  getReflectionCatchUpSummary,
  getTask,
  skipCatchUpReflections,
  startCatchUpReview,
  startReflectionSession,
} from "@/lib/v3/repository";
import { postponeShiftsDescendants } from "@/lib/v3/reflection-migration";
import { emptyData } from "@/lib/v3/schema";
import { resetEssencesDataCache, saveEssencesData } from "@/lib/v3/storage";

const RETURNED = new Date("2026-09-23T12:00:00");

beforeEach(() => {
  localStorage.clear();
  resetEssencesDataCache();
  saveEssencesData(emptyData());
});

function somedayTree() {
  const future = createPlanItem({
    level: "future",
    title: "日本経済",
    futureTarget: { type: "someday" },
  });
  const monthly = createPlanItem({
    level: "monthly",
    title: "評論を書く",
    parentPlanId: future.id,
    periodStart: "2026-09-01",
    periodEnd: "2026-09-30",
  });
  const weekly = createPlanItem({
    level: "weekly",
    title: "5冊読む",
    parentPlanId: monthly.id,
    periodStart: "2026-09-07",
    periodEnd: "2026-09-13",
  });
  const task = createTask({
    title: "1冊目",
    date: "2026-09-09",
    parentPlanId: weekly.id,
  });
  return { future, monthly, weekly, task };
}

describe("Phase 5.1 catch-up after a long absence", () => {
  it("1. summarizes Daily reviews older than 30 days instead of listing every session", () => {
    createTask({ title: "August paper", date: "2026-08-01" });
    createTask({ title: "Mid August", date: "2026-08-15" });
    const created = ensureReflectionSessions(RETURNED);
    const oldDaily = created.filter(
      (s) => s.type === "daily" && s.targetPeriodStart < "2026-09-02",
    );
    expect(oldDaily).toHaveLength(0);

    const summary = getReflectionCatchUpSummary(RETURNED);
    const daily = summary.buckets.find((b) => b.type === "daily");
    expect(daily?.pendingCount).toBeGreaterThanOrEqual(2);
    expect(daily?.periodStarts).toEqual(expect.arrayContaining(["2026-08-01", "2026-08-15"]));
    expect(daily?.pendingCount).toBeLessThan(40);
  });

  it("2. can start a review from the catch-up summary", () => {
    createTask({ title: "August paper", date: "2026-08-01" });
    ensureReflectionSessions(RETURNED);
    const sessions = startCatchUpReview("daily", RETURNED);
    expect(sessions.length).toBeGreaterThan(0);
    const started = startReflectionSession(sessions[0].id);
    expect(started.startedAt).toBeTruthy();
    expect(["due", "overdue", "scheduled"]).toContain(started.status);
    expect(ensureCatchUpSessions("daily", RETURNED).map((s) => s.id)).toContain(sessions[0].id);
  });

  it("3. skipping past catch-up does not delete Plan or Task data", () => {
    const future = createPlanItem({ level: "future", title: "英語" });
    const task = createTask({ title: "August paper", date: "2026-08-01" });
    ensureReflectionSessions(RETURNED);
    const skipped = skipCatchUpReflections("daily", RETURNED);
    expect(skipped.length).toBeGreaterThan(0);
    expect(skipped.every((s) => s.status === "skipped")).toBe(true);
    expect(getTask(task.id)?.status).toBe("open");
    expect(getPlanItem(future.id)?.status).toBe("active");
    expect(getTask(task.id)?.title).toBe("August paper");
    const after = getReflectionCatchUpSummary(RETURNED).buckets.find((b) => b.type === "daily");
    expect(after).toBeUndefined();
    expect(getReflection(skipped[0].id)?.status).toBe("skipped");
  });
});

describe("Phase 5.1 Future someday postpone", () => {
  it("4. someday → someday does not move descendants", () => {
    const { future, monthly, weekly, task } = somedayTree();
    const futureSession = ensureReflectionSessions(RETURNED).find((s) => s.type === "future")!;
    createReflectionDecision({
      reflectionSessionId: futureSession.id,
      subjectType: "plan",
      subjectId: future.id,
      decision: "postpone",
      futureTarget: { type: "someday" },
    });
    expect(getPlanItem(future.id)?.futureTarget?.type).toBe("someday");
    expect(getPlanItem(monthly.id)?.periodStart).toBe("2026-09-01");
    expect(getPlanItem(weekly.id)?.periodStart).toBe("2026-09-07");
    expect(getTask(task.id)?.date).toBe("2026-09-09");
  });

  it("5. someday → month updates only the Future parent", () => {
    const { future, monthly, weekly, task } = somedayTree();
    const futureSession = ensureReflectionSessions(RETURNED).find((s) => s.type === "future")!;
    expect(
      postponeShiftsDescendants(getPlanItem(future.id)!, {
        futureTarget: { type: "month", value: "2026-11" },
      }),
    ).toBe(false);
    createReflectionDecision({
      reflectionSessionId: futureSession.id,
      subjectType: "plan",
      subjectId: future.id,
      decision: "postpone",
      futureTarget: { type: "month", value: "2026-11" },
    });
    expect(getPlanItem(future.id)?.futureTarget).toEqual({ type: "month", value: "2026-11" });
    expect(getPlanItem(monthly.id)?.periodStart).toBe("2026-09-01");
    expect(getPlanItem(weekly.id)?.periodStart).toBe("2026-09-07");
    expect(getPlanItem(weekly.id)?.periodEnd).toBe("2026-09-13");
    expect(getTask(task.id)?.date).toBe("2026-09-09");
  });

  it("6. someday → date updates only the Future parent", () => {
    const { future, monthly, task } = somedayTree();
    const futureSession = ensureReflectionSessions(RETURNED).find((s) => s.type === "future")!;
    createReflectionDecision({
      reflectionSessionId: futureSession.id,
      subjectType: "plan",
      subjectId: future.id,
      decision: "postpone",
      futureTarget: { type: "date", value: "2026-12-01" },
    });
    expect(getPlanItem(future.id)?.futureTarget).toEqual({ type: "date", value: "2026-12-01" });
    expect(getPlanItem(monthly.id)?.periodStart).toBe("2026-09-01");
    expect(getTask(task.id)?.date).toBe("2026-09-09");
  });

  it("7. specific month → specific month still shifts descendants", () => {
    const future = createPlanItem({
      level: "future",
      title: "日本経済",
      futureTarget: { type: "month", value: "2026-09" },
    });
    const monthly = createPlanItem({
      level: "monthly",
      title: "評論を書く",
      parentPlanId: future.id,
      periodStart: "2026-09-01",
      periodEnd: "2026-09-30",
    });
    const weekly = createPlanItem({
      level: "weekly",
      title: "5冊読む",
      parentPlanId: monthly.id,
      periodStart: "2026-09-07",
      periodEnd: "2026-09-13",
    });
    const task = createTask({
      title: "1冊目",
      date: "2026-09-09",
      parentPlanId: weekly.id,
    });
    const futureSession = ensureReflectionSessions(RETURNED).find((s) => s.type === "future")!;
    expect(
      postponeShiftsDescendants(getPlanItem(future.id)!, {
        futureTarget: { type: "month", value: "2026-10" },
      }),
    ).toBe(true);
    createReflectionDecision({
      reflectionSessionId: futureSession.id,
      subjectType: "plan",
      subjectId: future.id,
      decision: "postpone",
      futureTarget: { type: "month", value: "2026-10" },
    });
    expect(getPlanItem(future.id)?.futureTarget).toEqual({ type: "month", value: "2026-10" });
    expect(getPlanItem(monthly.id)?.periodStart).toBe("2026-10-01");
    expect(getPlanItem(monthly.id)?.periodEnd).toBe("2026-10-30");
    expect(getPlanItem(weekly.id)?.periodStart).toBe("2026-10-07");
    expect(getPlanItem(weekly.id)?.periodEnd).toBe("2026-10-13");
    expect(getTask(task.id)?.date).toBe("2026-10-09");
  });
});
