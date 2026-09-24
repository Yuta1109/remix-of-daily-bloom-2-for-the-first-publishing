import { beforeEach, describe, expect, it } from "vitest";
import {
  calendarTasksForDate,
  ensureCalendarVisibleOccurrences,
} from "@/lib/v3/calendar-view";
import { endOfMonth, startOfMonth } from "@/lib/v3/local-date";
import {
  completeTask,
  createTaskSeries,
  getListedTasksForDate,
  getTask,
  getTasksForDate,
  materializeSeriesOccurrence,
  stopTaskSeries,
  updateTaskSeries,
} from "@/lib/v3/repository";
import { emptyData } from "@/lib/v3/schema";
import { loadEssencesData, resetEssencesDataCache, saveEssencesData } from "@/lib/v3/storage";

beforeEach(() => {
  localStorage.clear();
  resetEssencesDataCache();
  saveEssencesData(emptyData());
});

describe("Phase 6.1 Calendar TaskSeries materialization", () => {
  it("1. Calendar month causes the needed monthly occurrence to materialize", () => {
    const series = createTaskSeries({
      title: "Pay rent",
      icon: "wallet",
      color: "orange",
      recurrence: { type: "monthlyDay", day: 15 },
      startDate: "2026-01-01",
    });
    expect(calendarTasksForDate("2027-03-15")).toHaveLength(0);

    ensureCalendarVisibleOccurrences("2027-03-01", "2027-03-31");

    const onCalendar = calendarTasksForDate("2027-03-15");
    expect(onCalendar).toHaveLength(1);
    expect(onCalendar[0].seriesId).toBe(series.id);
    expect(onCalendar[0].occurrenceDate).toBe("2027-03-15");
    expect(calendarTasksForDate("2027-04-15")).toHaveLength(0);
  });

  it("2. Calendar week causes the needed occurrence to materialize", () => {
    const series = createTaskSeries({
      title: "Pay rent",
      icon: "wallet",
      color: "orange",
      recurrence: { type: "monthlyDay", day: 15 },
      startDate: "2026-01-01",
    });
    // 2026-09-14 is Monday; the 15th falls in this week.
    ensureCalendarVisibleOccurrences("2026-09-14", "2026-09-20");
    const weekHit = calendarTasksForDate("2026-09-15");
    expect(weekHit).toHaveLength(1);
    expect(weekHit[0].seriesId).toBe(series.id);
    expect(calendarTasksForDate("2026-10-15")).toHaveLength(0);
  });

  it("3. an already existing occurrence is not duplicated", () => {
    const series = createTaskSeries({
      title: "Pay rent",
      icon: "wallet",
      color: "orange",
      recurrence: { type: "monthlyDay", day: 15 },
      startDate: "2026-01-01",
    });
    const first = ensureCalendarVisibleOccurrences("2026-09-01", endOfMonth("2026-09-01"));
    const second = ensureCalendarVisibleOccurrences("2026-09-01", endOfMonth("2026-09-01"));
    expect(first).toHaveLength(1);
    expect(second[0].id).toBe(first[0].id);
    const seriesTasks = Object.values(loadEssencesData().tasks).filter(
      (t) => t.seriesId === series.id,
    );
    expect(seriesTasks).toHaveLength(1);
  });

  it("4. a stopped series creates no new occurrence", () => {
    const series = createTaskSeries({
      title: "Pay rent",
      icon: "wallet",
      color: "orange",
      recurrence: { type: "monthlyDay", day: 15 },
      startDate: "2026-01-01",
    });
    stopTaskSeries(series.id);
    ensureCalendarVisibleOccurrences("2026-09-01", "2026-09-30");
    expect(calendarTasksForDate("2026-09-15")).toHaveLength(0);
    expect(Object.values(loadEssencesData().tasks)).toHaveLength(0);
  });

  it("5. completed historical occurrence remains unchanged", () => {
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

    ensureCalendarVisibleOccurrences(startOfMonth("2026-09-01"), endOfMonth("2026-09-01"));

    expect(getTask(past.id)?.status).toBe("completed");
    expect(getTask(past.id)?.title).toBe("Pay rent");
    expect(getTask(past.id)?.date).toBe("2026-08-15");
    expect(calendarTasksForDate("2026-09-15")[0]?.title).toBe("Pay apartment rent");
  });

  it("6. Calendar and ToDo point to the same occurrence TaskItem", () => {
    const series = createTaskSeries({
      title: "Pay rent",
      icon: "wallet",
      color: "orange",
      recurrence: { type: "monthlyDay", day: 15 },
      startDate: "2026-01-01",
    });
    ensureCalendarVisibleOccurrences("2026-09-01", "2026-09-30");
    const todo = getListedTasksForDate("2026-09-15")[0];
    const daily = getTasksForDate("2026-09-15")[0];
    const calendar = calendarTasksForDate("2026-09-15")[0];
    expect(todo.id).toBe(daily.id);
    expect(todo.id).toBe(calendar.id);
    expect(todo.seriesId).toBe(series.id);
  });

  it("does not materialize a 90-day window just because a month opened", () => {
    createTaskSeries({
      title: "Pay rent",
      icon: "wallet",
      color: "orange",
      recurrence: { type: "monthlyDay", day: 15 },
      startDate: "2026-01-01",
    });
    ensureCalendarVisibleOccurrences("2026-09-01", "2026-09-30");
    expect(calendarTasksForDate("2026-09-15")).toHaveLength(1);
    expect(calendarTasksForDate("2026-10-15")).toHaveLength(0);
  });
});
