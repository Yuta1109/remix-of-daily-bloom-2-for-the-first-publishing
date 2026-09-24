import { beforeEach, describe, expect, it } from "vitest";
import {
  RepositoryError,
  archiveTask,
  breakdownWeeklyToTask,
  completeTask,
  createPlanItem,
  createTask,
  getPlanItem,
  getPlanProgress,
  getTask,
  getTasksForDate,
  getTasksForPlan,
  updateTask,
} from "@/lib/v3/repository";
import { resetEssencesDataCache, saveEssencesData } from "@/lib/v3/storage";
import { emptyData } from "@/lib/v3/schema";
import { addDays, endOfWeek, startOfWeek } from "@/lib/v3/local-date";

beforeEach(() => {
  localStorage.clear();
  resetEssencesDataCache();
  saveEssencesData(emptyData());
});

function weeklyFor(title = "第2週までに5冊の書籍・論文を読む") {
  return createPlanItem({
    level: "weekly",
    title,
    periodStart: "2026-09-21",
    periodEnd: "2026-09-27",
  });
}

describe("Phase 3B-1 Daily tasks", () => {
  it("1–2. creates a Daily task on the selected local date", () => {
    const task = createTask({
      title: "Buy groceries",
      date: "2026-09-25",
      createdFrom: "plan",
    });
    expect(task.date).toBe("2026-09-25");
    expect(task.status).toBe("open");
    expect(task.parentPlanId).toBeUndefined();
    expect(getTasksForDate("2026-09-25").map((t) => t.id)).toEqual([task.id]);
  });

  it("3. future-date tasks are already active scheduled records", () => {
    const task = createTask({
      title: "Email professor",
      date: "2026-09-28",
      createdFrom: "plan",
    });
    expect(task.date).toBe("2026-09-28");
    expect(task.status).toBe("open");
    expect(task.completedAt).toBeUndefined();
    expect(getTask(task.id)?.date).toBe("2026-09-28");
  });

  it("4–5. completion updates the same TaskItem and sets completedAt", () => {
    const task = createTask({ title: "Read economics paper", date: "2026-09-23" });
    const done = completeTask(task.id);
    expect(done.id).toBe(task.id);
    expect(done.status).toBe("completed");
    expect(done.completedAt).toBeTruthy();
    expect(getTask(task.id)?.completedAt).toBe(done.completedAt);

    const reopened = completeTask(task.id, false);
    expect(reopened.status).toBe("open");
    expect(reopened.completedAt).toBeUndefined();
  });

  it("6–7. persists the selected icon and color token", () => {
    const task = createTask({
      title: "Read economics paper",
      date: "2026-09-23",
      icon: "book-open",
      color: "sky",
    });
    expect(getTask(task.id)?.icon).toBe("book-open");
    expect(getTask(task.id)?.color).toBe("sky");
    const updated = updateTask(task.id, { icon: "briefcase", color: "violet" });
    expect(updated.icon).toBe("briefcase");
    expect(updated.color).toBe("violet");
    expect(getTask(task.id)?.icon).toBe("briefcase");
    expect(getTask(task.id)?.color).toBe("violet");
  });

  it("8–10. Weekly → Daily Breakdown keeps the parent and sets parentPlanId", () => {
    const weekly = weeklyFor();
    const task = breakdownWeeklyToTask(weekly.id, {
      title: "本を買う",
      date: "2026-09-23",
    });

    expect(task.parentPlanId).toBe(weekly.id);
    expect(task.createdFrom).toBe("plan");
    expect(getPlanItem(weekly.id)?.status).toBe("active");
    expect(getPlanItem(weekly.id)?.title).toBe("第2週までに5冊の書籍・論文を読む");
    expect(getTasksForPlan(weekly.id)).toHaveLength(1);
  });

  it("11. a direct Daily Task may have no Weekly parent", () => {
    const task = createTask({ title: "Buy groceries", date: "2026-09-25" });
    expect(task.parentPlanId).toBeUndefined();
    expect(getTasksForDate("2026-09-25")[0].parentPlanId).toBeUndefined();
  });

  it("12. does not create a duplicate Breakdown task for the same parent, date, and title", () => {
    const weekly = weeklyFor();
    const first = breakdownWeeklyToTask(weekly.id, {
      title: "論文①を読む",
      date: "2026-09-25",
    });
    expect(() =>
      breakdownWeeklyToTask(weekly.id, { title: "論文①を読む", date: "2026-09-25" }),
    ).toThrowError(RepositoryError);
    expect(() =>
      breakdownWeeklyToTask(weekly.id, { title: "論文①を読む", date: "2026-09-25" }),
    ).toThrowError(/duplicate child task/);
    expect(getTasksForPlan(weekly.id)).toHaveLength(1);
    expect(getTask(first.id)?.parentPlanId).toBe(weekly.id);
    expect(getPlanItem(weekly.id)?.status).toBe("active");

    const otherDay = breakdownWeeklyToTask(weekly.id, {
      title: "論文①を読む",
      date: "2026-09-26",
    });
    expect(otherDay.id).not.toBe(first.id);
    expect(getTasksForPlan(weekly.id)).toHaveLength(2);
  });

  it("13–14. filters by local date and appends multiple tasks on the same day", () => {
    const a = createTask({ title: "本を買う", date: "2026-09-23" });
    const b = createTask({ title: "先生にメールする", date: "2026-09-23" });
    createTask({ title: "論文①を読む", date: "2026-09-25" });

    const day = getTasksForDate("2026-09-23");
    expect(day.map((t) => t.id)).toEqual([a.id, b.id]);
    expect(day[0].order).toBeLessThan(day[1].order);
    expect(getTasksForDate("2026-09-25")).toHaveLength(1);
    expect(getTasksForDate("2026-09-24")).toHaveLength(0);
  });

  it("15. date navigation uses local-date day boundaries, not UTC", () => {
    const start = "2026-09-30";
    expect(addDays(start, 1)).toBe("2026-10-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(startOfWeek("2026-09-23", 1)).toBe("2026-09-21");
    expect(endOfWeek("2026-09-23", 1)).toBe("2026-09-27");

    createTask({ title: "month-end", date: "2026-09-30" });
    createTask({ title: "next-month", date: "2026-10-01" });
    expect(getTasksForDate("2026-09-30")).toHaveLength(1);
    expect(getTasksForDate("2026-10-01")).toHaveLength(1);
    expect(getTasksForDate(addDays("2026-09-30", 1))[0].title).toBe("next-month");
  });

  it("derives Weekly progress from Daily Task children without storing it", () => {
    const weekly = weeklyFor();
    const a = breakdownWeeklyToTask(weekly.id, { title: "本を買う", date: "2026-09-23" });
    const b = breakdownWeeklyToTask(weekly.id, { title: "論文①", date: "2026-09-25" });
    breakdownWeeklyToTask(weekly.id, { title: "論文②", date: "2026-09-26" });

    expect(getPlanProgress(weekly.id)).toEqual({ total: 3, completed: 0 });
    completeTask(a.id);
    completeTask(b.id);
    expect(getPlanProgress(weekly.id)).toEqual({ total: 3, completed: 2 });
    expect("progress" in (getPlanItem(weekly.id) as object)).toBe(false);
  });

  it("delete archives the TaskItem instead of removing the record", () => {
    const task = createTask({ title: "Buy book", date: "2026-09-23" });
    archiveTask(task.id);
    expect(getTask(task.id)?.status).toBe("archived");
    expect(getTasksForDate("2026-09-23")).toHaveLength(0);
    expect(getTask(task.id)).toBeDefined();
  });
});
