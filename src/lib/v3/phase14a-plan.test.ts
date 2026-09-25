import { beforeEach, describe, expect, it } from "vitest";
import { addDays, todayLocalDate } from "@/lib/v3/local-date";
import { keepCarryDate } from "@/lib/v3/reflection";
import {
  completeTask,
  createPlanItem,
  createReflectionDecision,
  createReflectionSession,
  createTask,
  getPlanItem,
  getPostponeBoxItems,
  getTask,
  getTasksForDate,
} from "@/lib/v3/repository";
import { emptyData } from "@/lib/v3/schema";
import { resetEssencesDataCache, saveEssencesData } from "@/lib/v3/storage";
import { STORAGE_KEY } from "@/lib/v3/types";

describe("Phase 14-A Plan / Reflection", () => {
  beforeEach(() => {
    localStorage.clear();
    resetEssencesDataCache();
    saveEssencesData(emptyData());
  });

  it("9. Keep from a past daily reflection carries an open task to the next period date", () => {
    const task = createTask({ title: "Carry me", date: "2026-09-20" });
    const session = createReflectionSession({ type: "daily", anchorDate: "2026-09-20" });
    expect(keepCarryDate(session)).toBe("2026-09-21");
    createReflectionDecision({
      reflectionSessionId: session.id,
      subjectType: "task",
      subjectId: task.id,
      decision: "keep",
    });
    expect(getTask(task.id)?.date).toBe("2026-09-21");
    expect(getTasksForDate("2026-09-20")).toHaveLength(0);
    expect(getTasksForDate("2026-09-21")[0]?.id).toBe(task.id);
  });

  it("Keep from several days ago uses the day after that reflection, not today", () => {
    const task = createTask({ title: "Older", date: "2026-09-18" });
    const session = createReflectionSession({ type: "daily", anchorDate: "2026-09-18" });
    createReflectionDecision({
      reflectionSessionId: session.id,
      subjectType: "task",
      subjectId: task.id,
      decision: "keep",
    });
    expect(getTask(task.id)?.date).toBe("2026-09-19");
    expect(getTask(task.id)?.date).not.toBe(todayLocalDate());
  });

  it("Keep from today's reflection carries the open task to the next day", () => {
    const today = todayLocalDate();
    const task = createTask({ title: "Today", date: today });
    const session = createReflectionSession({ type: "daily", anchorDate: today });
    createReflectionDecision({
      reflectionSessionId: session.id,
      subjectType: "task",
      subjectId: task.id,
      decision: "keep",
    });
    expect(getTask(task.id)?.date).toBe(addDays(today, 1));
  });

  it("Postpone Box ignores a second postpone of the same task", () => {
    const task = createTask({ title: "Once", date: "2026-09-21" });
    const session = createReflectionSession({ type: "daily", anchorDate: "2026-09-21" });
    const input = {
      reflectionSessionId: session.id,
      subjectType: "task" as const,
      subjectId: task.id,
      decision: "postpone" as const,
      toBox: true,
    };
    createReflectionDecision(input);
    createReflectionDecision(input);
    expect(getPostponeBoxItems().tasks.filter((t) => t.id === task.id)).toHaveLength(1);
  });

  it("Postpone Box survives a storage reload", () => {
    const task = createTask({ title: "Stored", date: "2026-09-21" });
    const session = createReflectionSession({ type: "daily", anchorDate: "2026-09-21" });
    createReflectionDecision({
      reflectionSessionId: session.id,
      subjectType: "task",
      subjectId: task.id,
      decision: "postpone",
      toBox: true,
    });
    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).toContain(task.id);
    resetEssencesDataCache();
    expect(getPostponeBoxItems().tasks.map((t) => t.id)).toContain(task.id);
    expect(getTask(task.id)?.status).toBe("open");
  });

  it("Keep of a completed task does not move its date", () => {
    const task = createTask({ title: "Done", date: "2026-09-20" });
    completeTask(task.id);
    const session = createReflectionSession({ type: "daily", anchorDate: "2026-09-20" });
    createReflectionDecision({
      reflectionSessionId: session.id,
      subjectType: "task",
      subjectId: task.id,
      decision: "keep",
    });
    expect(getTask(task.id)?.date).toBe("2026-09-20");
    expect(getTask(task.id)?.status).toBe("completed");
  });

  it("10. Postpone Box holds a task without changing its original date", () => {
    const task = createTask({ title: "Later", date: "2026-09-21" });
    const session = createReflectionSession({ type: "daily", anchorDate: "2026-09-21" });
    createReflectionDecision({
      reflectionSessionId: session.id,
      subjectType: "task",
      subjectId: task.id,
      decision: "postpone",
      toBox: true,
    });
    expect(getTask(task.id)?.inPostponeBox).toBe(true);
    expect(getTask(task.id)?.date).toBe("2026-09-21");
    expect(getTasksForDate("2026-09-21")).toHaveLength(0);
    expect(getPostponeBoxItems().tasks.map((t) => t.id)).toContain(task.id);
  });

  it("Postpone Box holds a weekly plan without dropping it from storage", () => {
    const plan = createPlanItem({
      level: "weekly",
      title: "Read 5",
      periodStart: "2026-09-21",
      periodEnd: "2026-09-27",
    });
    const session = createReflectionSession({ type: "weekly", anchorDate: "2026-09-23" });
    createReflectionDecision({
      reflectionSessionId: session.id,
      subjectType: "plan",
      subjectId: plan.id,
      decision: "postpone",
      toBox: true,
    });
    expect(getPlanItem(plan.id)?.inPostponeBox).toBe(true);
    expect(getPlanItem(plan.id)?.periodStart).toBe("2026-09-21");
    expect(getPostponeBoxItems().plans.map((p) => p.id)).toContain(plan.id);
  });
});
