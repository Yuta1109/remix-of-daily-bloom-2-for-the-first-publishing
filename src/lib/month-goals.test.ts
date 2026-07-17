import { describe, expect, it } from "vitest";
import { monthGoalsHeading, monthKeyFromDate } from "@/lib/month-goals";

const labels = {
  this: "今月の目標",
  next: "来月の目標",
  last: "先月の目標",
  named: "{m}月の目標",
};

const enLabels = {
  this: "This month's goals",
  next: "Next month's goals",
  last: "Last month's goals",
  named: "{m} goals",
};

describe("monthGoalsHeading", () => {
  const now = new Date(2026, 6, 17); // July 2026

  it("uses 今月 for the month that contains today", () => {
    expect(monthGoalsHeading(monthKeyFromDate(now), "ja", labels, now)).toBe(
      "今月の目標",
    );
  });

  it("uses 来月 / 先月 for adjacent months", () => {
    expect(
      monthGoalsHeading(monthKeyFromDate(new Date(2026, 7, 1)), "ja", labels, now),
    ).toBe("来月の目標");
    expect(
      monthGoalsHeading(monthKeyFromDate(new Date(2026, 5, 1)), "ja", labels, now),
    ).toBe("先月の目標");
  });

  it("uses N月の目標 for farther months", () => {
    expect(
      monthGoalsHeading(monthKeyFromDate(new Date(2026, 2, 1)), "ja", labels, now),
    ).toBe("3月の目標");
    expect(
      monthGoalsHeading(monthKeyFromDate(new Date(2025, 11, 1)), "ja", labels, now),
    ).toBe("12月の目標");
  });

  it("uses English relative / named forms", () => {
    expect(monthGoalsHeading(monthKeyFromDate(now), "en", enLabels, now)).toBe(
      "This month's goals",
    );
    expect(
      monthGoalsHeading(monthKeyFromDate(new Date(2026, 2, 1)), "en", enLabels, now),
    ).toBe("March goals");
  });
});
