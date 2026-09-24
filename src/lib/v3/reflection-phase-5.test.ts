import { beforeEach, describe, expect, it } from "vitest";
import { eventsForDate, upsertEvent } from "@/lib/events-store";
import {
  RepositoryError,
  completeReflectionSession,
  completeTask,
  createCollection,
  createPlanItem,
  createReflectionDecision,
  createReflectionSession,
  createTask,
  ensureReflectionSessions,
  getAttentionReflections,
  getEquivalentTaskOn,
  getPlanItem,
  getReflection,
  getReflectionContext,
  getTask,
  getTasksForDate,
  migratePlanToCollection,
  skipReflectionSession,
  startReflectionSession,
  updateReflectionSchedule,
  updateSettings,
} from "@/lib/v3/repository";
import { defaultReflectionSchedule, emptyData } from "@/lib/v3/schema";
import { addDays, endOfMonth, startOfMonth, startOfWeek } from "@/lib/v3/local-date";
import { loadEssencesData, resetEssencesDataCache, saveEssencesData } from "@/lib/v3/storage";
import { deriveReflectionStatus, scheduleAfterPeriod } from "@/lib/v3/reflection";

beforeEach(() => {
  localStorage.clear();
  resetEssencesDataCache();
  saveEssencesData(emptyData());
});

function keepAll(sessionId: string) {
  const ctx = getReflectionContext(sessionId);
  for (const task of ctx.tasks) {
    createReflectionDecision({
      reflectionSessionId: sessionId,
      subjectType: "task",
      subjectId: task.id,
      decision: "keep",
    });
  }
  for (const plan of ctx.plans) {
    createReflectionDecision({
      reflectionSessionId: sessionId,
      subjectType: "plan",
      subjectId: plan.id,
      decision: "keep",
    });
  }
}

describe("Phase 5 Reflection sessions", () => {
  it("1. creates a Daily Reflection session for a local day", () => {
    const session = createReflectionSession({ type: "daily", anchorDate: "2026-09-23" });
    expect(session.type).toBe("daily");
    expect(session.targetPeriodStart).toBe("2026-09-23");
    expect(session.targetPeriodEnd).toBe("2026-09-23");
  });

  it("2. creates a Weekly Reflection session for the week of the anchor", () => {
    const session = createReflectionSession({ type: "weekly", anchorDate: "2026-09-23" });
    expect(session.type).toBe("weekly");
    expect(session.targetPeriodStart).toBe(startOfWeek("2026-09-23", 0));
    expect(session.targetPeriodEnd).toBe(addDays(session.targetPeriodStart, 6));
  });

  it("3. creates a Monthly Reflection session for the calendar month", () => {
    const session = createReflectionSession({ type: "monthly", anchorDate: "2026-09-23" });
    expect(session.targetPeriodStart).toBe("2026-09-01");
    expect(session.targetPeriodEnd).toBe("2026-09-30");
  });

  it("4. creates a Future Reflection session keyed by month", () => {
    const session = createReflectionSession({ type: "future", anchorDate: "2026-10-01" });
    expect(session.type).toBe("future");
    expect(session.targetPeriodStart).toBe("2026-10-01");
    expect(session.targetPeriodEnd).toBe("2026-10-31");
  });

  it("5. uses deterministic session identity", () => {
    const a = createReflectionSession({ type: "daily", anchorDate: "2026-09-23" });
    const b = createReflectionSession({ type: "daily", anchorDate: "2026-09-23" });
    expect(a.id).toBe(b.id);
    expect(Object.keys(loadEssencesData().reflections)).toHaveLength(1);
    createReflectionSession({ type: "weekly", anchorDate: "2026-09-23" });
    expect(Object.keys(loadEssencesData().reflections)).toHaveLength(2);
  });

  it("6–8. derives due / overdue and stays executable late", () => {
    const session = createReflectionSession({ type: "daily", anchorDate: "2020-01-01" });
    expect(getReflection(session.id)?.status).toBe("overdue");
    expect(deriveReflectionStatus(session, new Date("2019-12-01T00:00:00.000Z"))).toBe(
      "scheduled",
    );
    const completed = completeReflectionSession(session.id);
    expect(completed.status).toBe("completed");
    expect(completed.completedAt).toBeTruthy();
  });

  it("9. completed status is terminal", () => {
    const session = createReflectionSession({ type: "daily", anchorDate: "2026-09-23" });
    keepAll(session.id);
    const done = completeReflectionSession(session.id);
    expect(done.status).toBe("completed");
    expect(getReflection(session.id)?.status).toBe("completed");
  });

  it("10. skipped status does not delete plans or tasks", () => {
    const plan = createPlanItem({ level: "future", title: "英語" });
    const task = createTask({ title: "単語", date: "2026-09-23" });
    const session = createReflectionSession({ type: "daily", anchorDate: "2026-09-23" });
    const skipped = skipReflectionSession(session.id);
    expect(skipped.status).toBe("skipped");
    expect(getPlanItem(plan.id)?.status).toBe("active");
    expect(getTask(task.id)?.status).toBe("open");
  });
});

describe("Phase 5 decisions", () => {
  it("11. Keep records a decision without changing completion", () => {
    const task = createTask({ title: "Email professor", date: "2026-09-23" });
    completeTask(task.id);
    const session = createReflectionSession({ type: "daily", anchorDate: "2026-09-23" });
    const decision = createReflectionDecision({
      reflectionSessionId: session.id,
      subjectType: "task",
      subjectId: task.id,
      decision: "keep",
    });
    expect(decision.decision).toBe("keep");
    expect(getTask(task.id)?.status).toBe("completed");
  });

  it("12. Postpone moves an incomplete Task", () => {
    const task = createTask({ title: "Read paper", date: "2026-09-23" });
    const session = createReflectionSession({ type: "daily", anchorDate: "2026-09-23" });
    createReflectionDecision({
      reflectionSessionId: session.id,
      subjectType: "task",
      subjectId: task.id,
      decision: "postpone",
      toDate: "2026-09-28",
    });
    expect(getTask(task.id)?.date).toBe("2026-09-28");
    expect(getTask(task.id)?.status).toBe("open");
    expect(getTasksForDate("2026-09-23")).toHaveLength(0);
  });

  it("13. Postpone keeps a completed Task and creates a follow-up", () => {
    const task = createTask({ title: "Read 20 pages", date: "2026-09-23" });
    completeTask(task.id);
    const session = createReflectionSession({ type: "daily", anchorDate: "2026-09-23" });
    createReflectionDecision({
      reflectionSessionId: session.id,
      subjectType: "task",
      subjectId: task.id,
      decision: "postpone",
      toDate: "2026-09-28",
    });
    expect(getTask(task.id)?.status).toBe("completed");
    expect(getTask(task.id)?.date).toBe("2026-09-23");
    const follow = getTasksForDate("2026-09-28").find((t) => t.title === "Read 20 pages");
    expect(follow?.status).toBe("open");
    expect(follow?.id).not.toBe(task.id);
  });

  it("14. existing future Task prevents a duplicate follow-up", () => {
    const original = createTask({ title: "Read paper", date: "2026-09-23" });
    const existing = createTask({ title: "Read paper", date: "2026-09-28" });
    expect(getEquivalentTaskOn(original.id, "2026-09-28")?.id).toBe(existing.id);
    const session = createReflectionSession({ type: "daily", anchorDate: "2026-09-23" });
    createReflectionDecision({
      reflectionSessionId: session.id,
      subjectType: "task",
      subjectId: original.id,
      decision: "postpone",
      toDate: "2026-09-28",
    });
    expect(Object.keys(loadEssencesData().tasks)).toHaveLength(2);
    expect(getTask(existing.id)?.status).toBe("open");
  });

  it("15. Stop archives an incomplete Task but keeps completed history", () => {
    const open = createTask({ title: "Buy book", date: "2026-09-23" });
    const done = createTask({ title: "Email professor", date: "2026-09-23" });
    completeTask(done.id);
    const session = createReflectionSession({ type: "daily", anchorDate: "2026-09-23" });
    createReflectionDecision({
      reflectionSessionId: session.id,
      subjectType: "task",
      subjectId: open.id,
      decision: "stop",
    });
    createReflectionDecision({
      reflectionSessionId: session.id,
      subjectType: "task",
      subjectId: done.id,
      decision: "stop",
    });
    expect(getTask(open.id)?.status).toBe("stopped");
    expect(getTask(done.id)?.status).toBe("completed");
  });

  it("16–17. Stop PlanItem cascades to active descendants, not completed tasks", () => {
    const future = createPlanItem({ level: "future", title: "日本経済" });
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
      periodStart: "2026-09-21",
      periodEnd: "2026-09-27",
    });
    const openTask = createTask({
      title: "1冊目",
      date: "2026-09-23",
      parentPlanId: weekly.id,
    });
    const doneTask = createTask({
      title: "メモ",
      date: "2026-09-22",
      parentPlanId: weekly.id,
    });
    completeTask(doneTask.id);
    const session = createReflectionSession({ type: "future", anchorDate: "2026-10-01" });
    createReflectionDecision({
      reflectionSessionId: session.id,
      subjectType: "plan",
      subjectId: future.id,
      decision: "stop",
    });
    expect(getPlanItem(future.id)?.status).toBe("stopped");
    expect(getPlanItem(monthly.id)?.status).toBe("stopped");
    expect(getPlanItem(weekly.id)?.status).toBe("stopped");
    expect(getTask(openTask.id)?.status).toBe("stopped");
    expect(getTask(doneTask.id)?.status).toBe("completed");
  });

  it("18. Postpone Weekly shifts descendant Daily tasks by the same delta", () => {
    updateSettings({ weekStartsOn: 1 });
    const weekly = createPlanItem({
      level: "weekly",
      title: "論文週",
      periodStart: "2026-09-21",
      periodEnd: "2026-09-27",
    });
    const child = createTask({
      title: "Read paper",
      date: "2026-09-23",
      parentPlanId: weekly.id,
    });
    const session = createReflectionSession({ type: "weekly", anchorDate: "2026-09-23" });
    createReflectionDecision({
      reflectionSessionId: session.id,
      subjectType: "plan",
      subjectId: weekly.id,
      decision: "postpone",
      toDate: "2026-09-28",
    });
    expect(getPlanItem(weekly.id)?.periodStart).toBe("2026-09-28");
    expect(getPlanItem(weekly.id)?.periodEnd).toBe("2026-10-04");
    expect(getTask(child.id)?.date).toBe("2026-09-30");
  });

  it("19. Postpone Monthly shifts descendant weeks by the month delta", () => {
    const monthly = createPlanItem({
      level: "monthly",
      title: "9月の評論",
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
    const session = createReflectionSession({ type: "monthly", anchorDate: "2026-09-15" });
    createReflectionDecision({
      reflectionSessionId: session.id,
      subjectType: "plan",
      subjectId: monthly.id,
      decision: "postpone",
      toDate: "2026-10-01",
    });
    expect(getPlanItem(monthly.id)?.periodStart).toBe("2026-10-01");
    expect(getPlanItem(monthly.id)?.periodEnd).toBe("2026-10-31");
    expect(getPlanItem(weekly.id)?.periodStart).toBe("2026-10-07");
    expect(getPlanItem(weekly.id)?.periodEnd).toBe("2026-10-13");
  });
});

describe("Phase 5 collection migration and catch-up", () => {
  it("20–22. migrated Plan preserves hierarchy and archive status", () => {
    const future = createPlanItem({ level: "future", title: "日本経済について評論を書く" });
    const monthly = createPlanItem({
      level: "monthly",
      title: "9月は調査",
      parentPlanId: future.id,
    });
    const weekly = createPlanItem({
      level: "weekly",
      title: "5冊読む",
      parentPlanId: monthly.id,
    });
    const task = createTask({ title: "1冊目", date: "2026-09-23", parentPlanId: weekly.id });
    const done = createTask({ title: "メモ", date: "2026-09-22", parentPlanId: weekly.id });
    completeTask(done.id);
    const collection = createCollection({ name: "2026 archive" });
    const { entry, archivedPlanIds } = migratePlanToCollection(future.id, collection.id);
    expect(entry.type).toBe("migratedPlan");
    expect(entry.migratedPlanRootId).toBe(future.id);
    expect(archivedPlanIds).toEqual(expect.arrayContaining([future.id, monthly.id, weekly.id]));
    expect(getPlanItem(monthly.id)?.parentPlanId).toBe(future.id);
    expect(getPlanItem(weekly.id)?.parentPlanId).toBe(monthly.id);
    expect(getTask(task.id)?.parentPlanId).toBe(weekly.id);
    expect(getTask(task.id)?.status).toBe("archived");
    expect(getTask(done.id)?.status).toBe("completed");
    expect(getPlanItem(future.id)?.status).toBe("archived");
  });

  it("23. a late overdue session can still be completed", () => {
    const session = createReflectionSession({ type: "daily", anchorDate: "2020-06-01" });
    expect(getReflection(session.id)?.status).toBe("overdue");
    startReflectionSession(session.id);
    keepAll(session.id);
    expect(completeReflectionSession(session.id).status).toBe("completed");
  });

  it("24. pending Reflection does not block Plan editing", () => {
    const session = createReflectionSession({ type: "monthly", anchorDate: "2026-09-23" });
    expect(session.status === "completed").toBe(false);
    const added = createPlanItem({
      level: "monthly",
      title: "Read another paper",
      periodStart: "2026-09-01",
      periodEnd: "2026-09-30",
    });
    expect(getPlanItem(added.id)?.title).toBe("Read another paper");
    expect(getReflection(session.id)?.status).not.toBe("completed");
  });

  it("25. completing a Reflection emits reflection_completed", () => {
    const session = createReflectionSession({ type: "daily", anchorDate: "2026-09-23" });
    keepAll(session.id);
    completeReflectionSession(session.id);
    const records = Object.values(loadEssencesData().activityRecords).filter(
      (r) => r.type === "reflection_completed",
    );
    expect(records).toHaveLength(1);
    expect(records[0].entityId).toBe(session.id);
    expect(records[0].metadata?.reflectionType).toBe("daily");
  });

  it("26–29. target queries are type-specific", () => {
    const future = createPlanItem({ level: "future", title: "英語" });
    const monthly = createPlanItem({
      level: "monthly",
      title: "単語",
      parentPlanId: future.id,
      periodStart: "2026-09-01",
      periodEnd: "2026-09-30",
    });
    const weekly = createPlanItem({
      level: "weekly",
      title: "100語",
      parentPlanId: monthly.id,
      periodStart: "2026-09-21",
      periodEnd: "2026-09-27",
    });
    const task = createTask({ title: "Email professor", date: "2026-09-23", parentPlanId: weekly.id });
    upsertEvent({ id: "evt-1", title: "Seminar", date: "2026-09-23", startTime: "14:00" });

    const daily = createReflectionSession({ type: "daily", anchorDate: "2026-09-23" });
    const dailyCtx = getReflectionContext(daily.id);
    expect(dailyCtx.tasks.map((t) => t.id)).toEqual([task.id]);
    expect(dailyCtx.plans).toHaveLength(0);

    const weeklyS = createReflectionSession({ type: "weekly", anchorDate: "2026-09-23" });
    const weeklyCtx = getReflectionContext(weeklyS.id);
    expect(weeklyCtx.plans.map((p) => p.id)).toEqual([weekly.id]);
    expect(weeklyCtx.tasks).toHaveLength(0);
    expect(weeklyCtx.relatedTasks.map((t) => t.id)).toEqual([task.id]);

    const monthlyS = createReflectionSession({ type: "monthly", anchorDate: "2026-09-10" });
    const monthlyCtx = getReflectionContext(monthlyS.id);
    expect(monthlyCtx.plans.map((p) => p.id)).toEqual([monthly.id]);
    expect(monthlyCtx.relatedPlans.map((p) => p.id)).toContain(weekly.id);

    const futureS = createReflectionSession({ type: "future", anchorDate: "2026-10-01" });
    const futureCtx = getReflectionContext(futureS.id);
    expect(futureCtx.plans.map((p) => p.id)).toEqual([future.id]);
    expect(eventsForDate("2026-09-23")).toHaveLength(1);
  });

  it("30. local-date boundaries stay on the intended month/week", () => {
    const monthEnd = createReflectionSession({ type: "daily", anchorDate: "2026-09-30" });
    const nextMonth = createReflectionSession({ type: "daily", anchorDate: "2026-10-01" });
    expect(monthEnd.id).not.toBe(nextMonth.id);
    expect(monthEnd.targetPeriodStart).toBe("2026-09-30");
    expect(nextMonth.targetPeriodStart).toBe("2026-10-01");
    const monthly = createReflectionSession({ type: "monthly", anchorDate: "2026-09-30" });
    expect(monthly.targetPeriodEnd).toBe(endOfMonth("2026-09-30"));
    expect(startOfMonth("2026-10-01")).toBe("2026-10-01");
  });

  it("catch-up materializes overdue sessions without duplicates", () => {
    const created = ensureReflectionSessions(new Date("2026-09-23T12:00:00"));
    expect(created.some((s) => s.type === "daily" && s.targetPeriodStart === "2026-09-23")).toBe(
      true,
    );
    const again = ensureReflectionSessions(new Date("2026-09-23T12:00:00"));
    expect(again.filter((s) => s.type === "daily" && s.targetPeriodStart === "2026-09-23")).toHaveLength(
      1,
    );
    expect(getAttentionReflections().length).toBeGreaterThan(0);
  });

  it("schedule preferences stay editable and are not hard deadlines", () => {
    const rules = defaultReflectionSchedule();
    const daily = scheduleAfterPeriod("daily", "2026-09-23", "2026-09-23", rules.daily);
    expect(new Date(daily.scheduledAt).getHours()).toBe(21);
    updateReflectionSchedule({
      daily: { ...rules.daily, timeOfDay: "08:00", scheduleOffsetDays: 1 },
    });
    const morning = createReflectionSession({ type: "daily", anchorDate: "2026-09-24" });
    expect(new Date(morning.scheduledAt).getHours()).toBe(8);
  });

  it("refuses to complete until every subject has a decision", () => {
    createTask({ title: "Read paper", date: "2026-09-23" });
    const session = createReflectionSession({ type: "daily", anchorDate: "2026-09-23" });
    expect(() => completeReflectionSession(session.id)).toThrow(RepositoryError);
    keepAll(session.id);
    expect(completeReflectionSession(session.id).status).toBe("completed");
  });
});
