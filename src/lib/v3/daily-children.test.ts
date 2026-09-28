import { beforeEach, describe, expect, it } from "vitest";
import { emptyData } from "@/lib/v3/schema";
import {
  completeTask,
  createChildTask,
  createReflectionSession,
  createTask,
  getChildTasks,
  getReflectionContext,
  getTask,
  moveTaskToDate,
} from "@/lib/v3/repository";
import { resetEssencesDataCache, saveEssencesData } from "@/lib/v3/storage";

beforeEach(() => {
  localStorage.clear();
  resetEssencesDataCache();
  saveEssencesData(emptyData());
});

describe("Daily log steps", () => {
  it("keeps steps on the same task, date, and plan without completing them together", () => {
    const parent = createTask({
      title: "Shopping",
      date: "2026-09-26",
      parentPlanId: undefined,
      createdFrom: "plan",
    });
    const milk = createChildTask(parent.id, { title: "Buy milk" });
    const points = createChildTask(parent.id, { title: "Use points" });

    expect(milk.parentTaskId).toBe(parent.id);
    expect(milk.date).toBe(parent.date);
    expect(points.parentTaskId).toBe(parent.id);
    expect(() => createChildTask(milk.id, { title: "Check the date" })).toThrow(/cannot contain/);

    completeTask(parent.id);
    expect(getTask(parent.id)?.status).toBe("completed");
    expect(getTask(milk.id)?.status).toBe("open");
    expect(getTask(points.id)?.status).toBe("open");

    completeTask(milk.id);
    expect(getTask(parent.id)?.status).toBe("completed");
    expect(getChildTasks(parent.id).map((task) => task.status)).toEqual(["completed", "open"]);
  });

  it("moves steps with the daily log and leaves them out of the reflection decision", () => {
    const parent = createTask({ title: "Shopping", date: "2026-09-26", createdFrom: "todo" });
    const milk = createChildTask(parent.id, { title: "Buy milk" });
    moveTaskToDate(parent.id, "2026-09-27");
    expect(getTask(milk.id)?.date).toBe("2026-09-27");

    const session = createReflectionSession({ type: "daily", anchorDate: "2026-09-27" });
    const context = getReflectionContext(session.id);
    expect(context.tasks.map((task) => task.id)).toEqual([parent.id]);
    expect(getChildTasks(parent.id).map((task) => task.id)).toEqual([milk.id]);
  });
});
