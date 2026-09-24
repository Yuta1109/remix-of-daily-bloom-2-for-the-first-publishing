import { beforeEach, describe, expect, it } from "vitest";
import {
  RepositoryError,
  addPointTransaction,
  addStamp,
  allRoutinesCompletedOn,
  archivePlanItem,
  breakdownPlanItem,
  cancelSeriesOccurrence,
  completeReflectionSession,
  completeTask,
  countActivity,
  createCollection,
  createEvent,
  createPlanItem,
  createQuickMemo,
  createReflectionDecision,
  createReflectionSession,
  createRoutine,
  createTask,
  createTaskFromTemplate,
  createTaskSeries,
  ensureDailyChallenges,
  evaluateDailyChallenges,
  getDailyChallenges,
  getEventsForDate,
  getPlanItem,
  getPlanItems,
  getPointBalance,
  getPointTotalsByReason,
  getPointTransactions,
  getReflection,
  getReflectionContext,
  getReflectionDecisions,
  getRoutineCompletions,
  getRoutinesForDate,
  getStampsForDate,
  getTask,
  getTasksForDate,
  getTasksForPlan,
  getTasksInRange,
  hasEquivalentTaskOn,
  markQuickMemoConverted,
  materializeSeriesOccurrence,
  migratePlanToCollection,
  moveTaskToDate,
  recordActivity,
  setDayWallpaper,
  setRoutineCompletion,
  updatePlanItem,
  updateTask,
} from "@/lib/v3/repository";
import { loadEssencesData, resetEssencesDataCache, saveEssencesData } from "@/lib/v3/storage";
import { emptyData } from "@/lib/v3/schema";
import { todayLocalDate } from "@/lib/v3/local-date";
import { NORMAL_CHALLENGE_POINTS } from "@/lib/v3/challenge-definitions";

const TODAY = todayLocalDate();

beforeEach(() => {
  localStorage.clear();
  resetEssencesDataCache();
  saveEssencesData(emptyData());
});

/** Future → Monthly → Weekly chain used by several suites. */
function buildChain() {
  const future = createPlanItem({ level: "future", title: "英語を話せるようになる" });
  const monthly = breakdownPlanItem(future.id, { title: "9月は単語を増やす" });
  const weekly = breakdownPlanItem(monthly.id, { title: "今週は100語" });
  return { future, monthly, weekly };
}

describe("plan creation and breakdown", () => {
  it("creates Future → Monthly → Weekly children without deleting the parent", () => {
    const { future, monthly, weekly } = buildChain();

    expect(monthly.level).toBe("monthly");
    expect(monthly.parentPlanId).toBe(future.id);
    expect(weekly.level).toBe("weekly");
    expect(weekly.parentPlanId).toBe(monthly.id);

    expect(getPlanItem(future.id)?.status).toBe("active");
    expect(getPlanItem(monthly.id)?.status).toBe("active");
    expect(getPlanItems({ level: "future" })).toHaveLength(1);
  });

  it("refuses a Weekly child under a Future plan", () => {
    const future = createPlanItem({ level: "future", title: "f" });
    expect(() =>
      createPlanItem({ level: "weekly", title: "w", parentPlanId: future.id }),
    ).toThrowError(RepositoryError);
  });

  it("refuses to break a Weekly plan into another plan", () => {
    const { weekly } = buildChain();
    expect(() => breakdownPlanItem(weekly.id, { title: "x" })).toThrowError(
      /break down into tasks/,
    );
  });

  it("refuses an invalid reparent on update", () => {
    const { future, weekly } = buildChain();
    expect(() => updatePlanItem(weekly.id, { parentPlanId: future.id })).toThrowError(
      RepositoryError,
    );
  });

  it("records completedAt only while completed", () => {
    const { weekly } = buildChain();
    const done = updatePlanItem(weekly.id, { status: "completed" });
    expect(done.completedAt).toBeTruthy();
    const reopened = updatePlanItem(weekly.id, { status: "active" });
    expect(reopened.completedAt).toBeUndefined();
  });

  it("archives the whole subtree and its tasks instead of deleting", () => {
    const { future, monthly, weekly } = buildChain();
    const task = createTask({ title: "単語10個", date: TODAY, parentPlanId: weekly.id });

    const archived = archivePlanItem(future.id);

    expect(archived.map((p) => p.id).sort()).toEqual([future.id, monthly.id, weekly.id].sort());
    expect(getPlanItem(weekly.id)?.status).toBe("archived");
    expect(getTask(task.id)?.status).toBe("archived");
    expect(getTask(task.id)?.parentPlanId).toBe(weekly.id);
  });
});

describe("Weekly → Daily Task", () => {
  it("accepts a Weekly parent", () => {
    const { weekly } = buildChain();
    const task = createTask({ title: "単語10個", date: TODAY, parentPlanId: weekly.id });
    expect(task.parentPlanId).toBe(weekly.id);
    expect(getTasksForPlan(weekly.id).map((t) => t.id)).toEqual([task.id]);
  });

  it("rejects a Monthly or Future parent", () => {
    const { future, monthly } = buildChain();
    expect(() =>
      createTask({ title: "x", date: TODAY, parentPlanId: monthly.id }),
    ).toThrowError(RepositoryError);
    expect(() =>
      createTask({ title: "x", date: TODAY, parentPlanId: future.id }),
    ).toThrowError(RepositoryError);
  });

  it("rejects a non-local-date key", () => {
    expect(() => createTask({ title: "x", date: "2026-9-1" })).toThrowError(
      /invalid local date/,
    );
    expect(() => createTask({ title: "x", date: "2026-02-30" })).toThrowError(
      /invalid local date/,
    );
  });
});

describe("task identity across screens", () => {
  it("Daily Log, ToDo and Calendar reads resolve to one record", () => {
    const task = createTask({ title: "散歩", date: TODAY });

    const fromDay = getTasksForDate(TODAY);
    const fromRange = getTasksInRange(TODAY, TODAY).get(TODAY) ?? [];
    const direct = getTask(task.id);

    expect(fromDay).toHaveLength(1);
    expect(fromRange).toHaveLength(1);
    expect(fromDay[0].id).toBe(task.id);
    expect(fromRange[0].id).toBe(task.id);
    expect(direct?.id).toBe(task.id);
    expect(Object.keys(loadEssencesData().tasks)).toHaveLength(1);
  });

  it("completing from one surface is visible from every other surface", () => {
    const { weekly } = buildChain();
    const task = createTask({ title: "単語10個", date: TODAY, parentPlanId: weekly.id });

    completeTask(task.id);

    expect(getTask(task.id)?.status).toBe("completed");
    expect(getTasksForDate(TODAY)[0].status).toBe("completed");
    expect(getTasksForPlan(weekly.id)[0].status).toBe("completed");
    const ranged = getTasksInRange(TODAY, TODAY).get(TODAY) ?? [];
    expect(ranged[0].status).toBe("completed");
    // Still exactly one record — no per-screen copy was created.
    expect(Object.keys(loadEssencesData().tasks)).toHaveLength(1);
  });

  it("uncompleting clears completedAt on the same record", () => {
    const task = createTask({ title: "散歩", date: TODAY });
    completeTask(task.id);
    const reopened = completeTask(task.id, false);
    expect(reopened.status).toBe("open");
    expect(reopened.completedAt).toBeUndefined();
    expect(reopened.id).toBe(task.id);
  });

  it("keeps completion separate from a migration decision", () => {
    const task = createTask({ title: "散歩", date: "2026-09-21" });
    completeTask(task.id);
    const session = createReflectionSession({ type: "daily", anchorDate: "2026-09-21" });

    const decision = createReflectionDecision({
      reflectionSessionId: session.id,
      subjectType: "task",
      subjectId: task.id,
      decision: "keep",
    });

    expect(getTask(task.id)?.status).toBe("completed");
    expect(decision.decision).toBe("keep");
  });
});

describe("task moving and duplicate protection", () => {
  it("moves the same record instead of copying", () => {
    const task = createTask({ title: "散歩", date: "2026-09-21" });
    const moved = moveTaskToDate(task.id, "2026-09-22");
    expect(moved.id).toBe(task.id);
    expect(getTasksForDate("2026-09-21")).toHaveLength(0);
    expect(getTasksForDate("2026-09-22")).toHaveLength(1);
    expect(Object.keys(loadEssencesData().tasks)).toHaveLength(1);
  });

  it("refuses to move onto an equivalent existing task", () => {
    const a = createTask({ title: "散歩", date: "2026-09-21" });
    createTask({ title: "散歩", date: "2026-09-22" });
    expect(hasEquivalentTaskOn(a.id, "2026-09-22")).toBe(true);
    expect(() => moveTaskToDate(a.id, "2026-09-22")).toThrowError(/already exists/);
  });

  it("allows a move when the target holds a different task", () => {
    const a = createTask({ title: "散歩", date: "2026-09-21" });
    createTask({ title: "買い物", date: "2026-09-22" });
    expect(moveTaskToDate(a.id, "2026-09-22").date).toBe("2026-09-22");
  });
});

describe("reflection decisions", () => {
  it("persists decisions per session", () => {
    const task = createTask({ title: "散歩", date: "2026-09-21" });
    const session = createReflectionSession({ type: "daily", anchorDate: "2026-09-21" });

    createReflectionDecision({
      reflectionSessionId: session.id,
      subjectType: "task",
      subjectId: task.id,
      decision: "postpone",
      toDate: "2026-09-22",
    });

    resetEssencesDataCache();
    const stored = getReflectionDecisions(session.id);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      subjectType: "task",
      subjectId: task.id,
      decision: "postpone",
      fromDate: "2026-09-21",
      toDate: "2026-09-22",
    });
    expect(getTask(task.id)?.date).toBe("2026-09-22");
  });

  it("does not create a duplicate task when one already exists on the target date", () => {
    const task = createTask({ title: "散歩", date: "2026-09-21" });
    const existing = createTask({ title: "散歩", date: "2026-09-22" });
    const session = createReflectionSession({ type: "daily", anchorDate: "2026-09-21" });

    const decision = createReflectionDecision({
      reflectionSessionId: session.id,
      subjectType: "task",
      subjectId: task.id,
      decision: "postpone",
      toDate: "2026-09-22",
    });

    expect(decision.toDate).toBe("2026-09-22");
    expect(Object.keys(loadEssencesData().tasks)).toHaveLength(2);
    expect(getTask(existing.id)?.status).toBe("open");
    expect(getTask(task.id)?.status).toBe("stopped");
    expect(getReflectionDecisions(session.id)).toHaveLength(1);
  });

  it("requires a valid date for postpone", () => {
    const task = createTask({ title: "散歩", date: "2026-09-21" });
    const session = createReflectionSession({ type: "daily", anchorDate: "2026-09-21" });
    expect(() =>
      createReflectionDecision({
        reflectionSessionId: session.id,
        subjectType: "task",
        subjectId: task.id,
        decision: "postpone",
      }),
    ).toThrowError(/postpone requires/);
  });

  it("stops a plan subtree on a stop decision", () => {
    const { future, weekly } = buildChain();
    const session = createReflectionSession({ type: "future", anchorDate: "2026-09-01" });

    const decision = createReflectionDecision({
      reflectionSessionId: session.id,
      subjectType: "plan",
      subjectId: future.id,
      decision: "stop",
    });

    expect(decision.fromLevel).toBe("future");
    expect(getPlanItem(future.id)?.status).toBe("stopped");
    expect(getPlanItem(weekly.id)?.status).toBe("stopped");
  });
});

describe("reflection context", () => {
  it("exposes tasks and plans as subjects and events only as context", () => {
    const { monthly } = buildChain();
    updatePlanItem(monthly.id, { periodStart: "2026-09-01", periodEnd: "2026-09-30" });
    const task = createTask({ title: "散歩", date: "2026-09-21" });
    const birthday = createEvent({
      title: "誕生日",
      startAt: "2026-09-21T00:00",
      endAt: "2026-09-21T00:00",
      allDay: true,
      recurrence: { freq: "yearly" },
      createdFrom: "calendar",
    });

    const session = createReflectionSession({ type: "monthly", anchorDate: "2026-09-21" });
    const context = getReflectionContext(session.id);

    expect(context.plans.map((p) => p.id)).toContain(monthly.id);
    expect(context.tasks.map((t) => t.id)).not.toContain(task.id);
    expect(context.relatedTasks.map((t) => t.id)).not.toContain(task.id);
    expect(context.events.map((e) => e.id)).toEqual([birthday.id]);
    // The recurring event is never turned into a task subject.
    expect(context.tasks.map((t) => t.title)).not.toContain("誕生日");
  });

  it("marks an overdue session executable", () => {
    const session = createReflectionSession({ type: "daily", anchorDate: "2020-01-01" });
    const stored = getReflection(session.id);
    expect(stored?.status).toBe("overdue");
    const completed = completeReflectionSession(session.id);
    expect(completed.status).toBe("completed");
  });
});

describe("task series occurrences", () => {
  it("materializes one occurrence into an independent task", () => {
    const series = createTaskSeries({
      title: "家賃を払う",
      icon: "circle",
      color: "orange",
      recurrence: { type: "monthlyDay", day: 1 },
      startDate: "2026-01-01",
    });

    const first = materializeSeriesOccurrence(series.id, "2026-09-01");
    expect(first.seriesId).toBe(series.id);
    expect(first.occurrenceDate).toBe("2026-09-01");

    // Idempotent: the same occurrence is never materialized twice.
    expect(materializeSeriesOccurrence(series.id, "2026-09-01").id).toBe(first.id);
    expect(Object.keys(loadEssencesData().tasks)).toHaveLength(1);

    completeTask(first.id);
    expect(getTask(first.id)?.status).toBe("completed");
    // The series itself is untouched by a single occurrence completion.
    expect(loadEssencesData().taskSeries[series.id].excludeDates).toBeUndefined();
  });

  it("refuses a date the series does not cover", () => {
    const series = createTaskSeries({
      title: "家賃",
      icon: "circle",
      color: "orange",
      recurrence: { type: "monthlyDay", day: 1 },
      startDate: "2026-01-01",
    });
    expect(() => materializeSeriesOccurrence(series.id, "2026-09-02")).toThrowError(
      /no occurrence/,
    );
  });

  it("cancels one occurrence without ending the series", () => {
    const series = createTaskSeries({
      title: "家賃",
      icon: "circle",
      color: "orange",
      recurrence: { type: "monthlyDay", day: 1 },
      startDate: "2026-01-01",
    });
    const task = materializeSeriesOccurrence(series.id, "2026-09-01");

    const updated = cancelSeriesOccurrence(series.id, "2026-09-01");

    expect(updated.excludeDates).toEqual(["2026-09-01"]);
    expect(updated.active).toBe(true);
    expect(getTask(task.id)?.status).toBe("stopped");
    expect(materializeSeriesOccurrence(series.id, "2026-10-01").occurrenceDate).toBe(
      "2026-10-01",
    );
  });
});

describe("events", () => {
  it("resolves events by local day, including multi-day spans", () => {
    createEvent({
      title: "旅行",
      startAt: "2026-10-01T00:00",
      endAt: "2026-10-03T00:00",
      allDay: true,
      createdFrom: "calendar",
    });
    expect(getEventsForDate("2026-10-02")).toHaveLength(1);
    expect(getEventsForDate("2026-10-04")).toHaveLength(0);
  });

  it("hides cancelled events", () => {
    const event = createEvent({
      title: "x",
      startAt: "2026-10-01T09:00",
      allDay: false,
      status: "cancelled",
      createdFrom: "calendar",
    });
    expect(getEventsForDate("2026-10-01")).toHaveLength(0);
    expect(loadEssencesData().events[event.id]).toBeTruthy();
  });
});

describe("routines", () => {
  it("schedules daily and weekly routines by local date", () => {
    createRoutine({
      title: "ストレッチ",
      icon: "repeat",
      color: "orange",
      frequency: { type: "daily" },
      startDate: "2026-09-01",
    });
    createRoutine({
      title: "ジム",
      icon: "repeat",
      color: "orange",
      // 2026-09-21 is a Monday.
      frequency: { type: "weekly", weekdays: [1] },
      startDate: "2026-09-01",
    });

    expect(getRoutinesForDate("2026-09-21").map((r) => r.title).sort()).toEqual([
      "ジム",
      "ストレッチ",
    ]);
    expect(getRoutinesForDate("2026-09-22").map((r) => r.title)).toEqual(["ストレッチ"]);
    expect(getRoutinesForDate("2026-08-31")).toHaveLength(0);
  });

  it("stores one completion record per routine and day", () => {
    const routine = createRoutine({
      title: "ストレッチ",
      icon: "repeat",
      color: "orange",
      frequency: { type: "daily" },
      startDate: "2026-09-01",
    });

    setRoutineCompletion(routine.id, "2026-09-21", true);
    setRoutineCompletion(routine.id, "2026-09-21", true);
    setRoutineCompletion(routine.id, "2026-09-22", false);

    const all = getRoutineCompletions({ routineId: routine.id });
    expect(all).toHaveLength(2);

    const day = getRoutineCompletions({ date: "2026-09-21" });
    expect(day).toHaveLength(1);
    expect(day[0].completed).toBe(true);
    expect(day[0].completedAt).toBeTruthy();
    expect(getRoutineCompletions({ date: "2026-09-22" })[0].completedAt).toBeUndefined();
  });

  it("keeps history when a completion is toggled off", () => {
    const routine = createRoutine({
      title: "ストレッチ",
      icon: "repeat",
      color: "orange",
      frequency: { type: "daily" },
      startDate: "2026-09-01",
    });
    setRoutineCompletion(routine.id, "2026-09-21", true);
    setRoutineCompletion(routine.id, "2026-09-21", false);
    const records = getRoutineCompletions({ routineId: routine.id });
    expect(records).toHaveLength(1);
    expect(records[0].completed).toBe(false);
  });

  it("detects a fully completed routine day", () => {
    const a = createRoutine({
      title: "a",
      icon: "repeat",
      color: "orange",
      frequency: { type: "daily" },
      startDate: "2026-09-01",
    });
    const b = createRoutine({
      title: "b",
      icon: "repeat",
      color: "orange",
      frequency: { type: "daily" },
      startDate: "2026-09-01",
    });

    setRoutineCompletion(a.id, "2026-09-21", true);
    expect(allRoutinesCompletedOn("2026-09-21")).toBe(false);
    setRoutineCompletion(b.id, "2026-09-21", true);
    expect(allRoutinesCompletedOn("2026-09-21")).toBe(true);
  });

  it("is false when no routine is scheduled", () => {
    expect(allRoutinesCompletedOn("2026-09-21")).toBe(false);
  });
});

describe("activity log", () => {
  it("records activity for task creation and completion", () => {
    const task = createTask({ title: "散歩", date: TODAY });
    completeTask(task.id);
    expect(countActivity("task_created", TODAY)).toBe(1);
    expect(countActivity("task_completed", TODAY)).toBe(1);
  });

  it("flags a task scheduled for a future day", () => {
    createTask({ title: "先の予定", date: "2099-01-01" });
    expect(countActivity("future_task_scheduled", TODAY)).toBe(1);
  });

  it("accepts an explicit local date", () => {
    recordActivity({ type: "calendar_viewed", localDate: "2026-09-21" });
    expect(countActivity("calendar_viewed", "2026-09-21")).toBe(1);
    expect(countActivity("calendar_viewed", "2026-09-22")).toBe(0);
  });
});

describe("daily challenges", () => {
  it("assigns about ten challenges per day, idempotently", () => {
    const first = ensureDailyChallenges("2026-09-21");
    expect(first.length).toBe(10);
    const second = ensureDailyChallenges("2026-09-21");
    expect(second).toHaveLength(first.length);
  });

  it("auto-completes from activity and awards points once per day", () => {
    ensureDailyChallenges(TODAY);
    createTask({ title: "a", date: TODAY });
    createTask({ title: "b", date: TODAY });

    const taskChallenges = getDailyChallenges(TODAY).filter(
      (a) => a.challengeDefinitionId === "challenge.task_created",
    );
    expect(taskChallenges).toHaveLength(1);
    expect(taskChallenges[0].status).toBe("completed");
    expect(taskChallenges[0].pointsAwarded).toBe(NORMAL_CHALLENGE_POINTS);

    const paid = getPointTransactions().filter((t) => t.sourceId === taskChallenges[0].id);
    expect(paid).toHaveLength(1);
    expect(paid[0].amount).toBe(NORMAL_CHALLENGE_POINTS);
  });

  it("does not award points for a challenge that was never assigned", () => {
    createTask({ title: "a", date: TODAY });
    expect(getPointBalance()).toBe(0);
  });

  it("completes the all-routines challenge only once every routine is done", () => {
    ensureDailyChallenges(TODAY);
    const routine = createRoutine({
      title: "ストレッチ",
      icon: "repeat",
      color: "orange",
      frequency: { type: "daily" },
      startDate: "2020-01-01",
    });

    const before = getDailyChallenges(TODAY).find(
      (a) => a.challengeDefinitionId === "challenge.routine_all_completed",
    );
    expect(before?.status).toBe("pending");

    setRoutineCompletion(routine.id, TODAY, true);
    evaluateDailyChallenges(TODAY);

    const after = getDailyChallenges(TODAY).find(
      (a) => a.challengeDefinitionId === "challenge.routine_all_completed",
    );
    expect(after?.status).toBe("completed");
  });

  it("5. keeps completed challenges after a storage reload", () => {
    ensureDailyChallenges(TODAY);
    createTask({ title: "a", date: TODAY });
    const before = getDailyChallenges(TODAY).find(
      (a) => a.challengeDefinitionId === "challenge.task_created",
    );
    expect(before?.status).toBe("completed");
    resetEssencesDataCache();
    const after = getDailyChallenges(TODAY).find(
      (a) => a.challengeDefinitionId === "challenge.task_created",
    );
    expect(after?.status).toBe("completed");
    expect(after?.id).toBe(before?.id);
  });

  it("6/10. awards points once for one assignment even after re-evaluate", () => {
    ensureDailyChallenges(TODAY);
    createTask({ title: "a", date: TODAY });
    evaluateDailyChallenges(TODAY);
    evaluateDailyChallenges(TODAY);
    const assignment = getDailyChallenges(TODAY).find(
      (a) => a.challengeDefinitionId === "challenge.task_created",
    );
    expect(assignment).toBeTruthy();
    const paid = getPointTransactions().filter((t) => t.sourceId === assignment?.id);
    expect(paid).toHaveLength(1);
    expect(paid[0].amount).toBe(NORMAL_CHALLENGE_POINTS);
    expect(paid[0].challengeId).toBe("challenge.task_created");
    expect(paid[0].assignmentDate).toBe(TODAY);
  });

  it("completes the 70% rate challenge from listed task state", () => {
    ensureDailyChallenges(TODAY);
    const a = createTask({ title: "a", date: TODAY });
    const b = createTask({ title: "b", date: TODAY });
    const c = createTask({ title: "c", date: TODAY });
    completeTask(a.id);
    completeTask(b.id);
    evaluateDailyChallenges(TODAY);
    expect(
      getDailyChallenges(TODAY).find((x) => x.challengeDefinitionId === "challenge.task_completion_rate")
        ?.status,
    ).toBe("pending");
    completeTask(c.id);
    evaluateDailyChallenges(TODAY);
    expect(
      getDailyChallenges(TODAY).find((x) => x.challengeDefinitionId === "challenge.task_completion_rate")
        ?.status,
    ).toBe("completed");
  });
});

describe("point ledger", () => {
  it("derives the balance by summation", () => {
    addPointTransaction({ amount: 5, reason: "challenge" });
    addPointTransaction({ amount: 5, reason: "challenge" });
    addPointTransaction({ amount: -8, reason: "store_purchase" });
    addPointTransaction({ amount: 3, reason: "bonus" });

    expect(getPointBalance()).toBe(5);
    expect(getPointTransactions()).toHaveLength(4);
    expect(getPointTotalsByReason()).toEqual({
      challenge: 10,
      store_purchase: -8,
      bonus: 3,
    });
  });

  it("starts at zero and never stores a mutable balance", () => {
    expect(getPointBalance()).toBe(0);
    expect("pointBalance" in loadEssencesData()).toBe(false);
  });

  it("supports a refund", () => {
    addPointTransaction({ amount: -8, reason: "store_purchase", sourceId: "item-1" });
    addPointTransaction({ amount: 8, reason: "refund", sourceId: "item-1" });
    expect(getPointBalance()).toBe(0);
  });
});

describe("collections and capture", () => {
  it("files a plan hierarchy while keeping it linked and archived", () => {
    const { future, monthly, weekly } = buildChain();
    const task = createTask({ title: "単語10個", date: TODAY, parentPlanId: weekly.id });
    const collection = createCollection({ name: "2026年の記録" });

    const { entry, archivedPlanIds } = migratePlanToCollection(future.id, collection.id);

    expect(entry.type).toBe("migratedPlan");
    expect(entry.migratedPlanRootId).toBe(future.id);
    expect(archivedPlanIds.sort()).toEqual([future.id, monthly.id, weekly.id].sort());

    // Hierarchy survives: nothing was flattened into text or deleted.
    expect(getPlanItem(monthly.id)?.parentPlanId).toBe(future.id);
    expect(getPlanItem(weekly.id)?.parentPlanId).toBe(monthly.id);
    expect(getTask(task.id)?.parentPlanId).toBe(weekly.id);
  });

  it("tracks a quick memo conversion source", () => {
    const memo = createQuickMemo({ text: "牛乳を買う" });
    expect(memo.status).toBe("inbox");
    const task = createTask({ title: "牛乳を買う", date: TODAY, createdFrom: "quickMemo" });
    const converted = markQuickMemoConverted(memo.id, { type: "task", id: task.id });
    expect(converted.status).toBe("inbox");
    expect(converted.convertedToId).toBe(task.id);
    expect(converted.convertedToType).toBe("task");
  });

  it("creates a task from a migrated reusable template", () => {
    const data = loadEssencesData();
    data.taskTemplates["legacy-template:r1"] = {
      id: "legacy-template:r1",
      title: "ゴミ出し",
      order: 0,
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
    };
    saveEssencesData(data);

    const task = createTaskFromTemplate("legacy-template:r1", "2026-09-21");
    expect(task.title).toBe("ゴミ出し");
    expect(task.date).toBe("2026-09-21");
  });
});

describe("calendar decorations", () => {
  it("keeps at most one wallpaper per day", () => {
    setDayWallpaper("2026-09-21", "seasonal_01");
    setDayWallpaper("2026-09-21", "travel_01");
    const appearances = Object.values(loadEssencesData().calendarDayAppearances).filter(
      (a) => a.date === "2026-09-21",
    );
    expect(appearances).toHaveLength(1);
    expect(appearances[0].wallpaperId).toBe("travel_01");
  });

  it("allows multiple stamps on one day with increasing z-index", () => {
    addStamp({ date: "2026-09-21", stampDefinitionId: "stamp.star", x: 10, y: 20 });
    addStamp({ date: "2026-09-21", stampDefinitionId: "stamp.heart", x: 30, y: 40 });
    const stamps = getStampsForDate("2026-09-21");
    expect(stamps).toHaveLength(2);
    expect(stamps.map((s) => s.zIndex)).toEqual([0, 1]);
    expect(countActivity("stamp_added", "2026-09-21")).toBe(2);
  });
});

describe("task ordering", () => {
  it("appends new tasks after existing ones on the same day", () => {
    const a = createTask({ title: "a", date: "2026-09-21" });
    const b = createTask({ title: "b", date: "2026-09-21" });
    expect(a.order).toBe(0);
    expect(b.order).toBe(1);
    expect(getTasksForDate("2026-09-21").map((t) => t.title)).toEqual(["a", "b"]);
  });

  it("hides archived tasks from day reads but keeps the record", () => {
    const task = createTask({ title: "a", date: "2026-09-21" });
    updateTask(task.id, { status: "archived" });
    expect(getTasksForDate("2026-09-21")).toHaveLength(0);
    expect(getTask(task.id)).toBeTruthy();
  });
});
