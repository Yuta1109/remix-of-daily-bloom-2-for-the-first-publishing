import { beforeEach, describe, expect, it } from "vitest";
import {
  excludeOccurrence,
  eventsForDate,
  getEvent,
  getReminders,
  upsertEvent,
  type CalendarEvent,
} from "@/lib/events-store";
import { LEGACY_KEYS } from "@/lib/v3/legacy-migration";
import {
  calendarCellMarkers,
  calendarEventsForDate,
  calendarTasksForDate,
  calendarTasksInRange,
  isCalendarDayEmpty,
  monthGridLeadingBlanks,
  shiftCalendarMonth,
} from "@/lib/v3/calendar-view";
import {
  completeTask,
  createTask,
  getListedTasksForDate,
  getTask,
  getTasksForDate,
  updateTask,
} from "@/lib/v3/repository";
import { emptyData } from "@/lib/v3/schema";
import { resetEssencesDataCache, saveEssencesData, loadEssencesData } from "@/lib/v3/storage";
import { todayLocalDate } from "@/lib/v3/local-date";

beforeEach(() => {
  localStorage.clear();
  resetEssencesDataCache();
  saveEssencesData(emptyData());
});

function seminarEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "evt-seminar",
    title: "Seminar",
    date: "2026-09-21",
    allDay: false,
    startTime: "14:00",
    endTime: "15:00",
    color: "blue",
    reminders: ["30m"],
    liveActivity: true,
    liveActivityLead: "1h",
    repeat: "none",
    ...overrides,
  };
}

describe("Phase 4A Calendar core", () => {
  it("1. a TaskItem appears on Calendar for its local date", () => {
    const task = createTask({
      title: "Read economics paper",
      date: "2026-09-25",
      createdFrom: "plan",
      icon: "book-open",
      color: "sky",
    });
    const onCalendar = calendarTasksForDate("2026-09-25");
    expect(onCalendar).toHaveLength(1);
    expect(onCalendar[0].id).toBe(task.id);
    expect(calendarTasksForDate("2026-09-24")).toHaveLength(0);
  });

  it("2. a future TaskItem appears on that future date, not today", () => {
    const task = createTask({
      title: "Email professor",
      date: "2026-09-28",
      createdFrom: "todo",
    });
    expect(calendarTasksForDate("2026-09-28").map((t) => t.id)).toEqual([task.id]);
    expect(calendarTasksForDate("2026-09-23")).toHaveLength(0);
    expect(getTask(task.id)?.date).toBe("2026-09-28");
  });

  it("3. a Calendar-created Task is stored in V3, not calendar-events or the legacy ToDo store", () => {
    const task = createTask({
      title: "Buy books",
      date: "2026-09-25",
      createdFrom: "calendar",
    });
    expect(loadEssencesData().tasks[task.id]?.id).toBe(task.id);
    expect(loadEssencesData().tasks[task.id]?.createdFrom).toBe("calendar");
    expect(localStorage.getItem(LEGACY_KEYS.events)).toBeNull();
    expect(localStorage.getItem(LEGACY_KEYS.todo)).toBeNull();
    expect(JSON.parse(localStorage.getItem("calendar-events") || "[]")).toEqual([]);
  });

  it("4. a Calendar-created Task uses the selected date, not today", () => {
    const selected = "2026-12-01";
    const task = createTask({
      title: "Buy books",
      date: selected,
      createdFrom: "calendar",
    });
    expect(task.date).toBe(selected);
    expect(task.date).not.toBe(todayLocalDate());
    expect(calendarTasksForDate(selected)[0].id).toBe(task.id);
    expect(calendarTasksForDate(todayLocalDate()).some((t) => t.id === task.id)).toBe(false);
  });

  it("5. completing a Calendar task updates the same V3 TaskItem", () => {
    const task = createTask({
      title: "Read economics paper",
      date: "2026-09-25",
      createdFrom: "calendar",
    });
    const done = completeTask(task.id);
    expect(done.id).toBe(task.id);
    expect(done.status).toBe("completed");
    expect(done.completedAt).toBeTruthy();
    expect(getTask(task.id)?.status).toBe("completed");
    expect(calendarTasksForDate("2026-09-25")[0].status).toBe("completed");
  });

  it("6–7. Calendar, Plan Daily, and ToDo share the same TaskItem id", () => {
    const task = createTask({
      title: "Email professor",
      date: "2026-09-28",
      icon: "mail",
      color: "sky",
      createdFrom: "plan",
    });
    const daily = getTasksForDate("2026-09-28");
    const todo = getListedTasksForDate("2026-09-28");
    const calendar = calendarTasksForDate("2026-09-28");
    expect(daily.map((t) => t.id)).toEqual([task.id]);
    expect(todo.map((t) => t.id)).toEqual([task.id]);
    expect(calendar.map((t) => t.id)).toEqual([task.id]);
    expect(new Set([daily[0].id, todo[0].id, calendar[0].id]).size).toBe(1);
  });

  it("8. task icon and color persist on the Calendar read of the same record", () => {
    const task = createTask({
      title: "Read economics paper",
      date: "2026-09-25",
      icon: "book-open",
      color: "sky",
      createdFrom: "calendar",
    });
    updateTask(task.id, { icon: "mail", color: "violet" });
    const shown = calendarTasksForDate("2026-09-25")[0];
    expect(shown.id).toBe(task.id);
    expect(shown.icon).toBe("mail");
    expect(shown.color).toBe("violet");
  });

  it("9. Events remain a separate domain from Tasks", () => {
    const task = createTask({
      title: "Buy books",
      date: "2026-09-25",
      createdFrom: "calendar",
    });
    upsertEvent(seminarEvent({ date: "2026-09-25" }));

    const tasks = calendarTasksForDate("2026-09-25");
    const events = calendarEventsForDate("2026-09-25");
    expect(tasks.map((t) => t.title)).toEqual(["Buy books"]);
    expect(events.map((e) => e.title)).toEqual(["Seminar"]);
    expect(tasks[0].id).not.toBe(events[0].id);
    expect(loadEssencesData().tasks[task.id]?.title).toBe("Buy books");
    expect(loadEssencesData().tasks[events[0].id]).toBeUndefined();
    expect(getEvent("evt-seminar")?.title).toBe("Seminar");
  });

  it("10. existing weekly recurrence and one-day exclusion stay intact", () => {
    upsertEvent(
      seminarEvent({
        date: "2026-09-21",
        repeat: "weekly",
      }),
    );
    expect(eventsForDate("2026-09-21")).toHaveLength(1);
    expect(eventsForDate("2026-09-28")).toHaveLength(1);
    expect(eventsForDate("2026-09-22")).toHaveLength(0);

    excludeOccurrence("evt-seminar", "2026-09-28");
    expect(eventsForDate("2026-09-21")).toHaveLength(1);
    expect(eventsForDate("2026-09-28")).toHaveLength(0);
    expect(eventsForDate("2026-10-05")).toHaveLength(1);

    const master = getEvent("evt-seminar");
    expect(master?.reminders).toEqual(["30m"]);
    expect(getReminders(master!)).toEqual(["30m"]);
    expect(master?.liveActivity).toBe(true);
    expect(master?.liveActivityLead).toBe("1h");
  });

  it("11. an Event created for a selected day uses that date, not today", () => {
    const selected = "2026-12-01";
    upsertEvent(seminarEvent({ id: "evt-from-day", date: selected }));
    const onSelected = eventsForDate(selected);
    expect(onSelected).toHaveLength(1);
    expect(onSelected[0].date).toBe(selected);
    expect(onSelected[0].date).not.toBe(todayLocalDate());
    expect(eventsForDate(todayLocalDate()).every((e) => e.id !== "evt-from-day")).toBe(true);
  });

  it("12. month navigation crosses the year boundary", () => {
    expect(shiftCalendarMonth(2026, 11, 1)).toEqual({ year: 2027, month: 0 });
    expect(shiftCalendarMonth(2027, 0, -1)).toEqual({ year: 2026, month: 11 });
    // 1 Jan 2027 is a Friday. Sunday-start grid has 5 leading blanks.
    expect(monthGridLeadingBlanks(2027, 0, 0)).toBe(5);
    expect(monthGridLeadingBlanks(2027, 0, 1)).toBe(4);
  });

  it("13. local-date midnight / 00:00–00:59 keys match Calendar, not UTC ISO", () => {
    const justAfterMidnight = new Date(2026, 8, 23, 0, 15);
    const localKey = todayLocalDate(justAfterMidnight);
    expect(localKey).toBe("2026-09-23");
    const utcKey = justAfterMidnight.toISOString().split("T")[0];

    const task = createTask({
      title: "Midnight note",
      date: localKey,
      createdFrom: "calendar",
    });
    expect(calendarTasksForDate(localKey)[0].id).toBe(task.id);

    if (utcKey !== localKey) {
      expect(calendarTasksForDate(utcKey)).toHaveLength(0);
    }
  });

  it("14. an empty day has neither tasks nor events", () => {
    expect(isCalendarDayEmpty([], [])).toBe(true);
    expect(calendarTasksForDate("2026-09-28")).toHaveLength(0);
    expect(calendarEventsForDate("2026-09-28")).toHaveLength(0);
    const task = createTask({ title: "x", date: "2026-09-28", createdFrom: "calendar" });
    expect(isCalendarDayEmpty(calendarTasksForDate("2026-09-28"), [])).toBe(false);
    expect(task.id).toBeTruthy();
  });

  it("15. Calendar task creation does not recreate Month Goals storage", () => {
    const existing = {
      "2026-8": { goals: [{ id: "g1", text: "legacy goal", completed: false }], minimized: false },
    };
    localStorage.setItem(LEGACY_KEYS.monthGoals, JSON.stringify(existing));
    createTask({ title: "Buy books", date: "2026-09-25", createdFrom: "calendar" });
    expect(JSON.parse(localStorage.getItem(LEGACY_KEYS.monthGoals)!)).toEqual(existing);

    localStorage.removeItem(LEGACY_KEYS.monthGoals);
    createTask({ title: "Email professor", date: "2026-09-28", createdFrom: "calendar" });
    expect(localStorage.getItem(LEGACY_KEYS.monthGoals)).toBeNull();
  });

  it("month-cell markers stay compact and keep task color without copying into events", () => {
    const task = createTask({
      title: "Read economics paper",
      date: "2026-09-25",
      color: "sky",
      createdFrom: "plan",
    });
    upsertEvent(seminarEvent({ date: "2026-09-25" }));
    const markers = calendarCellMarkers(
      calendarTasksForDate("2026-09-25"),
      calendarEventsForDate("2026-09-25"),
    );
    expect(markers.taskCount).toBe(1);
    expect(markers.eventCount).toBe(1);
    expect(markers.taskColors).toEqual(["sky"]);
    expect(markers.allTasksComplete).toBe(false);
    expect(getEvent("evt-seminar")?.title).not.toBe(task.title);
  });

  it("range reads group the same TaskItem by local date", () => {
    const a = createTask({ title: "A", date: "2026-09-01", createdFrom: "calendar" });
    const b = createTask({ title: "B", date: "2026-10-01", createdFrom: "calendar" });
    const grouped = calendarTasksInRange("2026-09-01", "2026-09-30");
    expect(grouped.get("2026-09-01")?.map((t) => t.id)).toEqual([a.id]);
    expect(grouped.has("2026-10-01")).toBe(false);
    expect(calendarTasksInRange("2026-10-01", "2026-10-31").get("2026-10-01")?.[0].id).toBe(b.id);
  });
});
