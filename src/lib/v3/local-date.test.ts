import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  compareLocalDates,
  daysBetween,
  eachLocalDate,
  endOfMonth,
  endOfWeek,
  isLastWeekdayOfMonth,
  isValidLocalDate,
  isValidLocalTime,
  isWithin,
  localDateOf,
  parseLocalDate,
  parseLocalDateTime,
  splitLocalDateTime,
  startOfMonth,
  startOfWeek,
  toLocalDate,
  toLocalDateTime,
  toLocalMonth,
  weekdayOccurrenceInMonth,
  weekdayOf,
  weeksOverlappingMonth,
} from "@/lib/v3/local-date";

/** The legacy Today key builder, replicated to document the old behavior. */
function legacyUtcKey(d: Date): string {
  return d.toISOString().split("T")[0];
}

describe("v3 local date keys", () => {
  it("formats from local calendar components, never the UTC instant", () => {
    const instants = [
      Date.UTC(2026, 8, 21, 15, 0),
      Date.UTC(2026, 0, 1, 0, 30),
      Date.UTC(2026, 11, 31, 23, 45),
    ];
    for (const ms of instants) {
      const d = new Date(ms);
      const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
        d.getDate(),
      ).padStart(2, "0")}`;
      expect(toLocalDate(d)).toBe(expected);
    }
  });

  it("documents that the legacy UTC key can disagree with the local date", () => {
    const justAfterMidnight = new Date(2026, 8, 21, 0, 30);
    expect(toLocalDate(justAfterMidnight)).toBe("2026-09-21");
    // Timezones ahead of UTC (e.g. JST) push the legacy key to the day before.
    if (justAfterMidnight.getTimezoneOffset() < -30) {
      expect(legacyUtcKey(justAfterMidnight)).not.toBe(toLocalDate(justAfterMidnight));
    }
  });

  it("validates date and time strings", () => {
    expect(isValidLocalDate("2026-09-21")).toBe(true);
    expect(isValidLocalDate("2026-02-30")).toBe(false);
    expect(isValidLocalDate("2026-9-21")).toBe(false);
    expect(isValidLocalDate(20260921)).toBe(false);
    expect(isValidLocalTime("07:05")).toBe(true);
    expect(isValidLocalTime("24:00")).toBe(false);
    expect(isValidLocalTime("7:05")).toBe(false);
  });

  it("parses to local midnight and round-trips", () => {
    const d = parseLocalDate("2026-09-21");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(8);
    expect(d.getDate()).toBe(21);
    expect(d.getHours()).toBe(0);
    expect(toLocalDate(d)).toBe("2026-09-21");
  });

  it("parses a date plus wall-clock time in local time", () => {
    const d = parseLocalDateTime("2026-09-21", "08:30");
    expect(d.getHours()).toBe(8);
    expect(d.getMinutes()).toBe(30);
  });

  it("builds and splits local wall-clock strings", () => {
    expect(toLocalDateTime("2026-09-21", "08:30")).toBe("2026-09-21T08:30");
    expect(toLocalDateTime("2026-09-21")).toBe("2026-09-21T00:00");
    expect(splitLocalDateTime("2026-09-21T08:30")).toEqual({
      date: "2026-09-21",
      time: "08:30",
    });
    expect(localDateOf("2026-09-21T00:00")).toBe("2026-09-21");
  });

  it("adds days across month and year boundaries", () => {
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });

  it("clamps month arithmetic to the last valid day", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonths("2026-03-15", -1)).toBe("2026-02-15");
  });

  it("computes month and week boundaries", () => {
    expect(startOfMonth("2026-09-21")).toBe("2026-09-01");
    expect(endOfMonth("2026-09-21")).toBe("2026-09-30");
    expect(endOfMonth("2028-02-01")).toBe("2028-02-29");
    expect(toLocalMonth("2026-09-21")).toBe("2026-09");
    // 2026-09-21 is a Monday.
    expect(weekdayOf("2026-09-21")).toBe(1);
    expect(startOfWeek("2026-09-21", 1)).toBe("2026-09-21");
    expect(startOfWeek("2026-09-21", 0)).toBe("2026-09-20");
    expect(endOfWeek("2026-09-21", 1)).toBe("2026-09-27");
  });

  it("lists local weeks overlapping a month without UTC conversion", () => {
    const weeks = weeksOverlappingMonth("2026-09-01", 1);
    expect(weeks[0]).toEqual({ start: "2026-08-31", end: "2026-09-06" });
    expect(weeks[weeks.length - 1]).toEqual({ start: "2026-09-28", end: "2026-10-04" });
    expect(weeks.some((w) => w.start === "2026-09-21" && w.end === "2026-09-27")).toBe(true);
    expect(weeks.every((w) => w.start <= "2026-09-30")).toBe(true);
  });

  it("compares and ranges dates", () => {
    expect(compareLocalDates("2026-09-01", "2026-09-02")).toBe(-1);
    expect(compareLocalDates("2026-09-02", "2026-09-02")).toBe(0);
    expect(compareLocalDates("2026-09-03", "2026-09-02")).toBe(1);
    expect(isWithin("2026-09-02", "2026-09-01", "2026-09-03")).toBe(true);
    expect(isWithin("2026-09-04", "2026-09-01", "2026-09-03")).toBe(false);
    expect(daysBetween("2026-09-01", "2026-09-21")).toBe(20);
    expect(eachLocalDate("2026-09-01", "2026-09-03")).toEqual([
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
    ]);
    expect(eachLocalDate("2026-09-03", "2026-09-01")).toEqual([]);
  });

  it("identifies weekday occurrences within a month", () => {
    expect(weekdayOccurrenceInMonth("2026-09-21")).toBe(3);
    expect(isLastWeekdayOfMonth("2026-09-28")).toBe(true);
    expect(isLastWeekdayOfMonth("2026-09-21")).toBe(false);
  });
});
