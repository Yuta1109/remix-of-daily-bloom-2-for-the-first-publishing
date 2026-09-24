import { beforeEach, describe, expect, it } from "vitest";
import {
  calendarEventToV3Item,
  eventsForDate,
  loadEvents,
  resetCalendarAdapterForTests,
  upsertEvent,
  v3ItemToCalendarEvent,
  type CalendarEvent,
} from "@/lib/events-store";
import { convertQuickMemoToEvent, createQuickMemo, getEvent } from "@/lib/v3/repository";
import { emptyData } from "@/lib/v3/schema";
import { loadEssencesData, resetEssencesDataCache, saveEssencesData } from "@/lib/v3/storage";

function seminar(): CalendarEvent {
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
    repeat: "weekly",
    excludeDates: ["2026-09-28"],
    notes: "Bring slides",
  };
}

describe("Phase 12 Calendar Event adapter", () => {
  beforeEach(() => {
    localStorage.clear();
    resetEssencesDataCache();
    resetCalendarAdapterForTests();
    saveEssencesData(emptyData());
  });

  it("writes EventSheet upserts to V3, not calendar-events", () => {
    upsertEvent(seminar());
    expect(localStorage.getItem("calendar-events")).toBeNull();
    const v3 = loadEssencesData().events["evt-seminar"];
    expect(v3.title).toBe("Seminar");
    expect(v3.startAt).toBe("2026-09-21T14:00");
    expect(v3.endAt).toBe("2026-09-21T15:00");
    expect(v3.recurrence?.freq).toBe("weekly");
    expect(v3.reminders).toEqual(["30m"]);
    expect(v3.liveActivity).toBe(true);
    expect(v3.excludeDates).toEqual(["2026-09-28"]);
    expect(eventsForDate("2026-09-21").map((e) => e.id)).toContain("evt-seminar");
  });

  it("roundtrips recurrence, reminders, and Live Activity through the adapter", () => {
    const original = seminar();
    const v3 = calendarEventToV3Item(original);
    const back = v3ItemToCalendarEvent(v3);
    expect(back.repeat).toBe("weekly");
    expect(back.reminders).toEqual(["30m"]);
    expect(back.liveActivity).toBe(true);
    expect(back.liveActivityLead).toBe("1h");
    expect(back.excludeDates).toEqual(["2026-09-28"]);
    expect(back.startTime).toBe("14:00");
    expect(back.endTime).toBe("15:00");
  });

  it("imports leftover calendar-events once without duplicating V3 ids", () => {
    localStorage.setItem("calendar-events", JSON.stringify([seminar()]));
    const first = loadEvents();
    expect(first.map((e) => e.id)).toContain("evt-seminar");
    localStorage.setItem(
      "calendar-events",
      JSON.stringify([{ ...seminar(), title: "Should not reimport" }]),
    );
    resetCalendarAdapterForTests();
    const second = loadEvents();
    expect(second).toHaveLength(1);
    expect(loadEssencesData().events["evt-seminar"].title).toBe("Seminar");
  });

  it("Quick Memo → Event is visible via loadEvents without dual-write", () => {
    const memo = createQuickMemo({ text: "Dentist" });
    const { event } = convertQuickMemoToEvent(memo.id, {
      date: "2026-09-30",
      startTime: "14:00",
      endTime: "15:00",
      allDay: false,
    });
    expect(localStorage.getItem("calendar-events")).toBeNull();
    expect(getEvent(event.id)?.title).toBe("Dentist");
    expect(loadEvents().some((row) => row.id === event.id && row.title === "Dentist")).toBe(true);
  });
});
