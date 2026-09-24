import { describe, expect, it } from "vitest";
import {
  describeRecurrence,
  nextSeriesOccurrence,
  parseTaskRecurrence,
  recurrenceMatchesDate,
  seriesOccurrencesInRange,
  seriesOccursOn,
} from "@/lib/v3/task-recurrence";
import type { TaskRecurrence, TaskSeries } from "@/lib/v3/types";

function series(recurrence: TaskRecurrence, overrides: Partial<TaskSeries> = {}): TaskSeries {
  return {
    id: "s1",
    title: "series",
    icon: "circle",
    color: "orange",
    recurrence,
    startDate: "2026-01-01",
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("parseTaskRecurrence", () => {
  it("accepts monthlyDay", () => {
    expect(parseTaskRecurrence({ type: "monthlyDay", day: 15 })).toEqual({
      ok: true,
      recurrence: { type: "monthlyDay", day: 15 },
    });
  });

  it("accepts yearlyDate", () => {
    expect(parseTaskRecurrence({ type: "yearlyDate", month: 9, day: 21 })).toEqual({
      ok: true,
      recurrence: { type: "yearlyDate", month: 9, day: 21 },
    });
  });

  it("accepts monthlyWeekday including the last-weekday form", () => {
    expect(parseTaskRecurrence({ type: "monthlyWeekday", week: 3, weekday: 1 })).toEqual({
      ok: true,
      recurrence: { type: "monthlyWeekday", week: 3, weekday: 1 },
    });
    expect(parseTaskRecurrence({ type: "monthlyWeekday", week: -1, weekday: 5 })).toEqual({
      ok: true,
      recurrence: { type: "monthlyWeekday", week: -1, weekday: 5 },
    });
  });

  it("rejects Routine cadences", () => {
    expect(parseTaskRecurrence({ type: "daily" })).toEqual({
      ok: false,
      reason: "routine-cadence-not-allowed",
    });
    expect(parseTaskRecurrence({ type: "weekly", weekdays: [1] })).toEqual({
      ok: false,
      reason: "routine-cadence-not-allowed",
    });
  });

  it("rejects malformed rules", () => {
    expect(parseTaskRecurrence(null).ok).toBe(false);
    expect(parseTaskRecurrence({ type: "monthlyDay", day: 0 })).toEqual({
      ok: false,
      reason: "invalid-day",
    });
    expect(parseTaskRecurrence({ type: "monthlyDay", day: 32 })).toEqual({
      ok: false,
      reason: "invalid-day",
    });
    expect(parseTaskRecurrence({ type: "yearlyDate", month: 13, day: 1 })).toEqual({
      ok: false,
      reason: "invalid-month",
    });
    expect(parseTaskRecurrence({ type: "monthlyWeekday", week: 6, weekday: 1 })).toEqual({
      ok: false,
      reason: "invalid-week",
    });
    expect(parseTaskRecurrence({ type: "monthlyWeekday", week: 1, weekday: 7 })).toEqual({
      ok: false,
      reason: "invalid-weekday",
    });
    expect(parseTaskRecurrence({ type: "hourly" })).toEqual({
      ok: false,
      reason: "unknown-type",
    });
  });
});

describe("recurrenceMatchesDate", () => {
  it("matches a monthly day and clamps to short months", () => {
    const rule: TaskRecurrence = { type: "monthlyDay", day: 31 };
    expect(recurrenceMatchesDate(rule, "2026-01-31")).toBe(true);
    expect(recurrenceMatchesDate(rule, "2026-02-28")).toBe(true);
    expect(recurrenceMatchesDate(rule, "2026-02-27")).toBe(false);
    expect(recurrenceMatchesDate(rule, "2028-02-29")).toBe(true);
  });

  it("matches a yearly date", () => {
    const rule: TaskRecurrence = { type: "yearlyDate", month: 9, day: 21 };
    expect(recurrenceMatchesDate(rule, "2026-09-21")).toBe(true);
    expect(recurrenceMatchesDate(rule, "2027-09-21")).toBe(true);
    expect(recurrenceMatchesDate(rule, "2026-09-20")).toBe(false);
  });

  it("matches the nth weekday of a month", () => {
    // 2026-09-21 is the 3rd Monday of September 2026.
    const rule: TaskRecurrence = { type: "monthlyWeekday", week: 3, weekday: 1 };
    expect(recurrenceMatchesDate(rule, "2026-09-21")).toBe(true);
    expect(recurrenceMatchesDate(rule, "2026-09-14")).toBe(false);
  });

  it("matches the last weekday of a month", () => {
    const rule: TaskRecurrence = { type: "monthlyWeekday", week: -1, weekday: 1 };
    expect(recurrenceMatchesDate(rule, "2026-09-28")).toBe(true);
    expect(recurrenceMatchesDate(rule, "2026-09-21")).toBe(false);
  });

  it("rejects invalid dates", () => {
    expect(recurrenceMatchesDate({ type: "monthlyDay", day: 1 }, "2026-02-30")).toBe(false);
  });
});

describe("series occurrences", () => {
  it("honours start, end, active and excluded dates", () => {
    const s = series({ type: "monthlyDay", day: 15 }, {
      startDate: "2026-02-01",
      endDate: "2026-05-31",
      excludeDates: ["2026-04-15"],
    });
    expect(seriesOccursOn(s, "2026-01-15")).toBe(false);
    expect(seriesOccursOn(s, "2026-02-15")).toBe(true);
    expect(seriesOccursOn(s, "2026-04-15")).toBe(false);
    expect(seriesOccursOn(s, "2026-06-15")).toBe(false);
    expect(seriesOccursOn({ ...s, active: false }, "2026-02-15")).toBe(false);
  });

  it("lists occurrences in a window", () => {
    const s = series({ type: "monthlyDay", day: 1 });
    expect(seriesOccurrencesInRange(s, "2026-01-01", "2026-04-30")).toEqual([
      "2026-01-01",
      "2026-02-01",
      "2026-03-01",
      "2026-04-01",
    ]);
    expect(seriesOccurrencesInRange(s, "2026-04-30", "2026-01-01")).toEqual([]);
  });

  it("finds the next occurrence", () => {
    const s = series({ type: "monthlyWeekday", week: 3, weekday: 1 });
    expect(nextSeriesOccurrence(s, "2026-09-01")).toBe("2026-09-21");
    expect(nextSeriesOccurrence(s, "2026-09-22")).toBe("2026-10-19");
  });

  it("returns null past the series end", () => {
    const s = series({ type: "monthlyDay", day: 1 }, { endDate: "2026-02-01" });
    expect(nextSeriesOccurrence(s, "2026-03-01")).toBeNull();
  });
});

describe("describeRecurrence", () => {
  it("labels rules in both locales", () => {
    expect(describeRecurrence({ type: "monthlyDay", day: 15 }, "ja")).toBe("毎月15日");
    expect(describeRecurrence({ type: "monthlyDay", day: 15 }, "en")).toBe("Monthly on day 15");
    expect(describeRecurrence({ type: "yearlyDate", month: 9, day: 21 }, "ja")).toBe(
      "毎年9月21日",
    );
    expect(describeRecurrence({ type: "monthlyWeekday", week: 3, weekday: 1 }, "ja")).toBe(
      "毎月第3月曜日",
    );
    expect(describeRecurrence({ type: "monthlyWeekday", week: -1, weekday: 1 }, "en")).toBe(
      "Monthly on the last Monday",
    );
  });
});
