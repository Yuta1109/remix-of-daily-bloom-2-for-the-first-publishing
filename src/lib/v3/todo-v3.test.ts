import { beforeEach, describe, expect, it } from "vitest";
import {
  archiveTask,
  completeTask,
  countDaysWithListedTasks,
  createTask,
  createTaskFromTemplate,
  getListedTasksForDate,
  getPastDaysWithListedTasks,
  getTask,
  getTaskCompletionRate,
  getTaskStreak,
  getTaskTemplates,
  getTasksForDate,
  updateTask,
} from "@/lib/v3/repository";
import {
  ensureLegacyCatchup,
  loadEssencesData,
  resetEssencesDataCache,
  saveEssencesData,
} from "@/lib/v3/storage";
import { emptyData } from "@/lib/v3/schema";
import { LEGACY_KEYS } from "@/lib/v3/legacy-migration";
import { STORAGE_KEY } from "@/lib/v3/types";
import { addDays, todayLocalDate } from "@/lib/v3/local-date";

const LEGACY_TODO = {
  "2026-09-20": {
    tasks: [
      { id: "t1", text: "買い物", completed: false, date: "2026-09-20" },
      { id: "t2", text: "掃除", completed: true, date: "2026-09-20" },
    ],
    reflection: "よい一日だった",
  },
};

beforeEach(() => {
  localStorage.clear();
  resetEssencesDataCache();
});

describe("Phase 3B-2 ToDo reads V3 TaskItem", () => {
  it("1, 10. legacy tasks appear in V3 with stable ids and preserved date/completion", () => {
    localStorage.setItem(LEGACY_KEYS.todo, JSON.stringify(LEGACY_TODO));
    const data = loadEssencesData();
    expect(data.tasks["legacy-task:t1"]?.title).toBe("買い物");
    expect(data.tasks["legacy-task:t1"]?.date).toBe("2026-09-20");
    expect(data.tasks["legacy-task:t1"]?.status).toBe("open");
    expect(data.tasks["legacy-task:t2"]?.status).toBe("completed");
    expect(data.tasks["legacy-task:t2"]?.date).toBe("2026-09-20");
  });

  it("2. ToDo-style listed reads return the V3 record", () => {
    const task = createTask({ title: "論文①を読む", date: "2026-09-25", createdFrom: "todo" });
    const listed = getListedTasksForDate("2026-09-25");
    expect(listed).toHaveLength(1);
    expect(listed[0].id).toBe(task.id);
    expect(getTask(task.id)?.title).toBe("論文①を読む");
  });

  it("3. create from ToDo uses createTask and local date", () => {
    const today = todayLocalDate();
    const task = createTask({ title: "Buy groceries", date: today, createdFrom: "todo" });
    expect(task.date).toBe(today);
    expect(task.createdFrom).toBe("todo");
    expect(task.status).toBe("open");
    expect(task.date).not.toMatch(/T/);
  });

  it("4. edit from ToDo persists on the same TaskItem", () => {
    const task = createTask({ title: "old", date: "2026-09-25", createdFrom: "todo" });
    updateTask(task.id, { title: "new title" });
    expect(getTask(task.id)?.title).toBe("new title");
    expect(getTask(task.id)?.id).toBe(task.id);
  });

  it("5. complete from ToDo updates status and completedAt", () => {
    const task = createTask({ title: "論文①を読む", date: "2026-09-25", createdFrom: "todo" });
    completeTask(task.id);
    expect(getTask(task.id)?.status).toBe("completed");
    expect(getTask(task.id)?.completedAt).toBeTruthy();
  });

  it("6. archive from ToDo hides the task without deleting the record", () => {
    const task = createTask({ title: "drop", date: "2026-09-25", createdFrom: "todo" });
    archiveTask(task.id);
    expect(getTask(task.id)?.status).toBe("archived");
    expect(getListedTasksForDate("2026-09-25")).toHaveLength(0);
  });

  it("7–8. Daily and ToDo refer to the same TaskItem; completion syncs", () => {
    const task = createTask({ title: "論文①を読む", date: "2026-09-25", createdFrom: "plan" });
    const todoView = getListedTasksForDate("2026-09-25");
    const dailyView = getTasksForDate("2026-09-25");
    expect(todoView[0].id).toBe(task.id);
    expect(dailyView[0].id).toBe(task.id);
    expect(todoView[0].id).toBe(dailyView[0].id);

    completeTask(task.id);
    expect(getListedTasksForDate("2026-09-25")[0].status).toBe("completed");
    expect(getTasksForDate("2026-09-25")[0].status).toBe("completed");
    expect(getTask(task.id)?.id).toBe(task.id);
  });

  it("9. listed queries key off the local date, not a UTC slice", () => {
    createTask({ title: "month-end", date: "2026-09-30", createdFrom: "todo" });
    createTask({ title: "next-month", date: "2026-10-01", createdFrom: "todo" });
    expect(getListedTasksForDate("2026-09-30").map((t) => t.title)).toEqual(["month-end"]);
    expect(getListedTasksForDate(addDays("2026-09-30", 1)).map((t) => t.title)).toEqual([
      "next-month",
    ]);
  });

  it("11. does not duplicate legacy tasks on reload or catch-up", () => {
    localStorage.setItem(LEGACY_KEYS.todo, JSON.stringify(LEGACY_TODO));
    loadEssencesData();
    resetEssencesDataCache();
    loadEssencesData();
    ensureLegacyCatchup();
    expect(Object.keys(loadEssencesData().tasks).sort()).toEqual(
      ["legacy-task:t1", "legacy-task:t2"].sort(),
    );
    expect(localStorage.getItem(LEGACY_KEYS.todo)).toBeTruthy();
  });

  it("catches leftover legacy writes after V3 already existed", () => {
    saveEssencesData(emptyData());
    localStorage.setItem(LEGACY_KEYS.todo, JSON.stringify(LEGACY_TODO));
    resetEssencesDataCache();
    loadEssencesData();
    expect(Object.keys(loadEssencesData().tasks)).toHaveLength(2);
  });

  it("12. history lists past V3 days and not today", () => {
    const today = todayLocalDate();
    const yesterday = addDays(today, -1);
    createTask({ title: "yesterday", date: yesterday, createdFrom: "todo" });
    createTask({ title: "today", date: today, createdFrom: "todo" });
    const past = getPastDaysWithListedTasks(today, addDays(today, -40));
    expect(past.some((d) => d.date === yesterday)).toBe(true);
    expect(past.some((d) => d.date === today)).toBe(false);
    expect(past.find((d) => d.date === yesterday)?.tasks[0]?.title).toBe("yesterday");
  });

  it("13. TaskTemplate creates an independent TaskItem", () => {
    localStorage.setItem(
      LEGACY_KEYS.reusable,
      JSON.stringify([{ id: "r1", text: "英語を勉強する" }]),
    );
    loadEssencesData();
    const template = getTaskTemplates().find((item) => item.title === "英語を勉強する");
    expect(template).toBeTruthy();
    const task = createTaskFromTemplate(template!.id, "2026-09-25");
    expect(task.id).not.toBe(template!.id);
    expect(task.title).toBe("英語を勉強する");
    expect(task.date).toBe("2026-09-25");
    expect(getTaskTemplates()[0]?.id).toBe(template!.id);
  });

  it("derives streak and completion from local V3 tasks, not UTC keys", () => {
    const today = todayLocalDate();
    const yesterday = addDays(today, -1);
    const y = createTask({ title: "a", date: yesterday, createdFrom: "todo" });
    completeTask(y.id);
    expect(getTaskCompletionRate(yesterday)).toBe(100);
    expect(getTaskStreak(today)).toBe(1);
    expect(countDaysWithListedTasks()).toBe(1);
    expect(localStorage.getItem(STORAGE_KEY)).toBeTruthy();
  });
});
