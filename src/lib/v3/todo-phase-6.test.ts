import { beforeEach, describe, expect, it } from "vitest";
import { calendarTasksForDate } from "@/lib/v3/calendar-view";
import { addDays, todayLocalDate } from "@/lib/v3/local-date";
import {
  archiveTask,
  completeTask,
  createRoutine,
  createTask,
  createTaskFromTemplate,
  createTaskSeries,
  createTaskTemplate,
  deactivateRoutine,
  ensureSeriesOccurrencesForRange,
  getListedTasksForDate,
  getOpenTasksForDate,
  getPlanItems,
  getRoutine,
  getRoutineCompletions,
  getRoutines,
  getRoutinesForDate,
  getTask,
  getTaskSeriesById,
  getTaskTemplates,
  getTasksForDate,
  getUpcomingListedTasks,
  isRoutineCompletedOn,
  materializeSeriesOccurrence,
  setRoutineCompletion,
  stopTaskSeries,
  updateRoutine,
  updateTask,
  updateTaskSeries,
} from "@/lib/v3/repository";
import { emptyData } from "@/lib/v3/schema";
import { loadEssencesData, resetEssencesDataCache, saveEssencesData } from "@/lib/v3/storage";
import { TODO_UPCOMING_HORIZON_DAYS } from "@/lib/v3/todo-view";
import { LEGACY_KEYS } from "@/lib/v3/legacy-migration";

beforeEach(() => {
  localStorage.clear();
  resetEssencesDataCache();
  saveEssencesData(emptyData());
});

describe("Phase 6 Routine", () => {
  it("1. creates a daily Routine without a TaskItem", () => {
    const routine = createRoutine({
      title: "English 30 min",
      icon: "book-open",
      color: "sky",
      frequency: { type: "daily" },
      startDate: "2026-09-01",
    });
    expect(routine.frequency).toEqual({ type: "daily" });
    expect(routine.active).toBe(true);
    expect(Object.keys(loadEssencesData().tasks)).toHaveLength(0);
  });

  it("2–3. creates a weekly Routine with selected weekdays", () => {
    const routine = createRoutine({
      title: "Exercise",
      icon: "dumbbell",
      color: "lime",
      frequency: { type: "weekly", weekdays: [1, 3, 5] },
      startDate: "2026-09-01",
    });
    expect(routine.frequency).toEqual({ type: "weekly", weekdays: [1, 3, 5] });
    // 2026-09-21 is Monday.
    expect(getRoutinesForDate("2026-09-21").map((r) => r.id)).toEqual([routine.id]);
    expect(getRoutinesForDate("2026-09-22")).toHaveLength(0);
    expect(getRoutinesForDate("2026-09-23").map((r) => r.id)).toEqual([routine.id]);
  });

  it("5–6. Routine completion is date-specific and not stored on RoutineItem", () => {
    const routine = createRoutine({
      title: "Reading",
      icon: "book-open",
      color: "orange",
      frequency: { type: "daily" },
      startDate: "2026-09-01",
    });
    setRoutineCompletion(routine.id, "2026-09-24", true);
    expect(isRoutineCompletedOn(routine.id, "2026-09-24")).toBe(true);
    expect(isRoutineCompletedOn(routine.id, "2026-09-25")).toBe(false);
    expect(getRoutine(routine.id)?.active).toBe(true);
    expect("completed" in (getRoutine(routine.id) ?? {})).toBe(false);
  });

  it("7. Routine edit updates the same record", () => {
    const routine = createRoutine({
      title: "Reading",
      icon: "book-open",
      color: "orange",
      frequency: { type: "daily" },
      startDate: "2026-09-01",
    });
    updateRoutine(routine.id, { title: "Reading 20 min", color: "teal" });
    expect(getRoutine(routine.id)?.id).toBe(routine.id);
    expect(getRoutine(routine.id)?.title).toBe("Reading 20 min");
    expect(getRoutine(routine.id)?.color).toBe("teal");
  });

  it("8–9. deactivating a Routine keeps historical RoutineCompletion", () => {
    const routine = createRoutine({
      title: "Reading",
      icon: "book-open",
      color: "orange",
      frequency: { type: "daily" },
      startDate: "2026-09-01",
    });
    setRoutineCompletion(routine.id, "2026-09-20", true);
    deactivateRoutine(routine.id);
    expect(getRoutine(routine.id)?.active).toBe(false);
    expect(getRoutines()).toHaveLength(0);
    expect(getRoutines(true).map((r) => r.id)).toEqual([routine.id]);
    const history = getRoutineCompletions({ routineId: routine.id });
    expect(history).toHaveLength(1);
    expect(history[0].completed).toBe(true);
    expect(history[0].date).toBe("2026-09-20");
  });

  it("10–11. Routine does not appear in Calendar and does not become a TaskItem", () => {
    createRoutine({
      title: "English 30 min",
      icon: "book-open",
      color: "sky",
      frequency: { type: "daily" },
      startDate: "2026-09-01",
    });
    expect(calendarTasksForDate(todayLocalDate())).toHaveLength(0);
    expect(Object.values(loadEssencesData().tasks)).toHaveLength(0);
    expect(Object.values(loadEssencesData().events)).toHaveLength(0);
  });
});

describe("Phase 6 Tasks", () => {
  it("12. ToDo reads V3 TaskItem", () => {
    const task = createTask({ title: "Email professor", date: "2026-09-24", createdFrom: "todo" });
    expect(getListedTasksForDate("2026-09-24")[0].id).toBe(task.id);
    expect(getOpenTasksForDate("2026-09-24")[0].id).toBe(task.id);
  });

  it("13–16. create, edit, complete, and archive the same TaskItem", () => {
    const task = createTask({ title: "Buy book", date: "2026-09-24", createdFrom: "todo" });
    updateTask(task.id, { title: "Buy textbook", note: "campus shop" });
    expect(getTask(task.id)?.title).toBe("Buy textbook");
    completeTask(task.id);
    expect(getTask(task.id)?.status).toBe("completed");
    archiveTask(task.id);
    expect(getTask(task.id)?.status).toBe("archived");
    expect(getListedTasksForDate("2026-09-24")).toHaveLength(0);
    expect(getTask(task.id)?.id).toBe(task.id);
  });

  it("17–18. future Task appears in Upcoming and date edits stay on the same id", () => {
    const today = todayLocalDate();
    const future = addDays(today, 3);
    const task = createTask({ title: "Submit application", date: future, createdFrom: "todo" });
    const upcoming = getUpcomingListedTasks(today, TODO_UPCOMING_HORIZON_DAYS);
    expect(upcoming.some((day) => day.tasks.some((item) => item.id === task.id))).toBe(true);
    const later = addDays(today, 4);
    updateTask(task.id, { date: later });
    expect(getTask(task.id)?.id).toBe(task.id);
    expect(getTask(task.id)?.date).toBe(later);
  });

  it("19–20. the same TaskItem id is used in Plan Daily and Calendar", () => {
    const task = createTask({
      title: "Read economics paper",
      date: "2026-09-25",
      createdFrom: "todo",
      icon: "book-open",
      color: "sky",
    });
    expect(getTasksForDate("2026-09-25")[0].id).toBe(task.id);
    expect(getListedTasksForDate("2026-09-25")[0].id).toBe(task.id);
    expect(calendarTasksForDate("2026-09-25")[0].id).toBe(task.id);
  });
});

describe("Phase 6 Repeat Log / TaskSeries", () => {
  it("21. creates a monthly-day series", () => {
    const series = createTaskSeries({
      title: "Pay rent",
      icon: "wallet",
      color: "orange",
      recurrence: { type: "monthlyDay", day: 15 },
      startDate: "2026-01-01",
    });
    expect(series.recurrence).toEqual({ type: "monthlyDay", day: 15 });
    expect(getPlanItems()).toHaveLength(0);
  });

  it("22. creates a yearly-date series", () => {
    const series = createTaskSeries({
      title: "Anniversary",
      icon: "gift",
      color: "rose",
      recurrence: { type: "yearlyDate", month: 9, day: 22 },
      startDate: "2026-01-01",
    });
    expect(series.recurrence).toEqual({ type: "yearlyDate", month: 9, day: 22 });
  });

  it("23. creates a monthly-weekday series", () => {
    const series = createTaskSeries({
      title: "Monthly report",
      icon: "briefcase",
      color: "teal",
      recurrence: { type: "monthlyWeekday", week: 2, weekday: 1 },
      startDate: "2026-01-01",
    });
    expect(series.recurrence).toEqual({ type: "monthlyWeekday", week: 2, weekday: 1 });
  });

  it("24–26. occurrence generation uses a TaskItem with seriesId", () => {
    const series = createTaskSeries({
      title: "Pay rent",
      icon: "wallet",
      color: "orange",
      recurrence: { type: "monthlyDay", day: 15 },
      startDate: "2026-01-01",
    });
    const created = ensureSeriesOccurrencesForRange("2026-09-01", "2026-09-30");
    expect(created).toHaveLength(1);
    expect(created[0].date).toBe("2026-09-15");
    expect(created[0].seriesId).toBe(series.id);
    expect(created[0].occurrenceDate).toBe("2026-09-15");
    expect(getTask(created[0].id)?.id).toBe(created[0].id);
    expect(calendarTasksForDate("2026-09-15")[0].id).toBe(created[0].id);
  });

  it("27. stopping a series preserves historical completed occurrences", () => {
    const today = todayLocalDate();
    const series = createTaskSeries({
      title: "Pay rent",
      icon: "wallet",
      color: "orange",
      recurrence: { type: "monthlyDay", day: 15 },
      startDate: "2020-01-01",
    });
    const past = materializeSeriesOccurrence(series.id, "2026-08-15");
    completeTask(past.id);
    const futureYear = String(Number(today.slice(0, 4)) + 1);
    const future = materializeSeriesOccurrence(series.id, `${futureYear}-03-15`);
    stopTaskSeries(series.id);
    expect(getTaskSeriesById(series.id)?.active).toBe(false);
    expect(getTask(past.id)?.status).toBe("completed");
    expect(getTask(past.id)?.id).toBe(past.id);
    expect(getTask(future.id)?.status).toBe("stopped");
  });

  it("28. editing a series does not rewrite completed historical occurrences", () => {
    const series = createTaskSeries({
      title: "Pay rent",
      icon: "wallet",
      color: "orange",
      recurrence: { type: "monthlyDay", day: 15 },
      startDate: "2026-01-01",
    });
    const past = materializeSeriesOccurrence(series.id, "2026-08-15");
    completeTask(past.id);
    updateTaskSeries(series.id, { title: "Pay apartment rent" });
    expect(getTaskSeriesById(series.id)?.title).toBe("Pay apartment rent");
    expect(getTask(past.id)?.title).toBe("Pay rent");
    expect(getTask(past.id)?.status).toBe("completed");
  });
});

describe("Phase 6 TaskTemplate", () => {
  it("29–30. V3 TaskTemplate is preferred and creates an independent TaskItem", () => {
    const template = createTaskTemplate({ title: "Email professor", icon: "briefcase" });
    expect(getTaskTemplates().map((item) => item.id)).toEqual([template.id]);
    const task = createTaskFromTemplate(template.id, "2026-09-24");
    expect(task.id).not.toBe(template.id);
    expect(task.title).toBe("Email professor");
    expect(task.date).toBe("2026-09-24");
    expect(getTaskTemplates()[0].id).toBe(template.id);
  });

  it("legacy reusable-tasks remain readable for catch-up, not a write path", () => {
    localStorage.setItem(
      LEGACY_KEYS.reusable,
      JSON.stringify([{ id: "r1", text: "英語を勉強する" }]),
    );
    resetEssencesDataCache();
    const migrated = loadEssencesData().taskTemplates;
    expect(Object.values(migrated).some((item) => item.title === "英語を勉強する")).toBe(true);
    expect(localStorage.getItem(LEGACY_KEYS.reusable)).toBeTruthy();
  });
});
