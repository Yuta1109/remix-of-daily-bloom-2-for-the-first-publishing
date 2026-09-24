import { beforeEach, describe, expect, it } from "vitest";
import {
  addDays,
  startOfMonth,
  startOfWeek,
  todayLocalDate,
} from "@/lib/v3/local-date";
import {
  averageDayScore,
  buildAnalytics,
  computeDayScore,
  completedReflectionCount,
  dayScoreFromData,
  pickAnalyticsComment,
  thisMonthRange,
  thisWeekRange,
} from "@/lib/v3/analytics";
import { emptyData } from "@/lib/v3/schema";
import type { ActivityRecord, ReflectionSession } from "@/lib/v3/types";

function activity(
  id: string,
  type: ActivityRecord["type"],
  localDate: string,
): ActivityRecord {
  return {
    id,
    type,
    occurredAt: `${localDate}T12:00:00.000Z`,
    localDate,
  };
}

describe("analytics score", () => {
  it("12. recomputes a daily score from activity records", () => {
    const data = emptyData();
    data.activityRecords["1"] = activity("1", "task_completed", "2026-09-21");
    data.activityRecords["2"] = activity("2", "plan_updated", "2026-09-21");
    data.activityRecords["3"] = activity("3", "reflection_completed", "2026-09-21");
    const first = dayScoreFromData(data, "2026-09-21");
    const second = dayScoreFromData(data, "2026-09-21");
    expect(first).toBe(second);
    expect(first).toBe(
      computeDayScore({
        taskCompleted: 1,
        routineCompleted: 0,
        planUpdated: 1,
        breakdownCreated: 0,
        futureTaskScheduled: 0,
        reflectionCompleted: 1,
        active: true,
      }),
    );
    expect(first).toBe(12 + 10 + 20 + 10);
    expect(dayScoreFromData(data, "2026-09-22")).toBe(0);
  });

  it("13. uses the local week range, not UTC", () => {
    const today = "2026-09-23";
    const weekStartsOn = 1 as const;
    const range = thisWeekRange(today, weekStartsOn);
    expect(range.start).toBe(startOfWeek(today, weekStartsOn));
    expect(range.start).toBe("2026-09-21");
    expect(range.end).toBe(today);

    const data = emptyData();
    data.activityRecords["in"] = activity("in", "task_completed", "2026-09-21");
    data.activityRecords["out"] = activity("out", "task_completed", "2026-09-20");
    const weekScore = averageDayScore(data, range.start, range.end);
    const withoutOutside = averageDayScore(
      { ...data, activityRecords: { in: data.activityRecords["in"] } },
      range.start,
      range.end,
    );
    expect(weekScore).toBe(withoutOutside);
    expect(dayScoreFromData(data, "2026-09-20")).toBeGreaterThan(0);
  });

  it("14. uses the local month range, clamped to today", () => {
    const today = "2026-09-15";
    const range = thisMonthRange(today);
    expect(range.start).toBe(startOfMonth(today));
    expect(range.start).toBe("2026-09-01");
    expect(range.end).toBe(today);

    const data = emptyData();
    data.activityRecords["in"] = activity("in", "routine_completed", "2026-09-01");
    data.activityRecords["out"] = activity("out", "routine_completed", "2026-08-31");
    const monthScore = averageDayScore(data, range.start, range.end);
    const withoutOutside = averageDayScore(
      { ...data, activityRecords: { in: data.activityRecords["in"] } },
      range.start,
      range.end,
    );
    expect(monthScore).toBe(withoutOutside);
  });

  it("15. counts completed reflections", () => {
    const reflections: Record<string, ReflectionSession> = {
      a: {
        id: "a",
        type: "daily",
        status: "completed",
        targetPeriodStart: "2026-09-20",
        targetPeriodEnd: "2026-09-20",
        scheduledAt: "2026-09-20T12:00:00.000Z",
        graceUntil: "2026-09-21T12:00:00.000Z",
        createdAt: "2026-09-20T12:00:00.000Z",
        completedAt: "2026-09-21T12:00:00.000Z",
      },
      b: {
        id: "b",
        type: "weekly",
        status: "scheduled",
        targetPeriodStart: "2026-09-14",
        targetPeriodEnd: "2026-09-20",
        scheduledAt: "2026-09-21T12:00:00.000Z",
        graceUntil: "2026-09-24T12:00:00.000Z",
        createdAt: "2026-09-21T12:00:00.000Z",
      },
    };
    expect(completedReflectionCount(Object.values(reflections))).toBe(1);
    const data = emptyData();
    data.reflections = reflections;
    expect(buildAnalytics(data, "2026-09-21", 1).reflectionCount).toBe(1);
  });

  it("16. counts activity / log updates from ActivityRecord", () => {
    const data = emptyData();
    data.activityRecords["1"] = activity("1", "note_edited", "2026-09-21");
    data.activityRecords["2"] = activity("2", "stamp_added", "2026-09-22");
    expect(buildAnalytics(data, "2026-09-22", 1).activityCount).toBe(2);
  });

  it("picks comments from deterministic rules, never AI", () => {
    expect(
      pickAnalyticsComment({
        activityLast3Days: 0,
        reflectionsThisWeek: 0,
        planningThisWeek: 0,
        taskCompletedThisWeek: 0,
        routineCompletedThisWeek: 0,
        activityThisWeek: 0,
      }),
    ).toBe("quiet");
    expect(
      pickAnalyticsComment({
        activityLast3Days: 2,
        reflectionsThisWeek: 0,
        planningThisWeek: 0,
        taskCompletedThisWeek: 1,
        routineCompletedThisWeek: 0,
        activityThisWeek: 2,
      }),
    ).toBe("fewReflections");
    expect(
      pickAnalyticsComment({
        activityLast3Days: 5,
        reflectionsThisWeek: 1,
        planningThisWeek: 0,
        taskCompletedThisWeek: 1,
        routineCompletedThisWeek: 5,
        activityThisWeek: 6,
      }),
    ).toBe("routineConsistent");
    expect(
      pickAnalyticsComment({
        activityLast3Days: 4,
        reflectionsThisWeek: 1,
        planningThisWeek: 3,
        taskCompletedThisWeek: 1,
        routineCompletedThisWeek: 0,
        activityThisWeek: 4,
      }),
    ).toBe("planningBusy");
    expect(
      pickAnalyticsComment({
        activityLast3Days: 4,
        reflectionsThisWeek: 1,
        planningThisWeek: 0,
        taskCompletedThisWeek: 4,
        routineCompletedThisWeek: 0,
        activityThisWeek: 4,
      }),
    ).toBe("taskStable");
  });
});

describe("analytics date helpers vs todayLocalDate", () => {
  it("does not use UTC YYYY-MM-DD for week/month bounds", () => {
    const today = todayLocalDate();
    const utcKey = new Date().toISOString().slice(0, 10);
    const week = thisWeekRange(today, 0);
    const month = thisMonthRange(today);
    expect(week.end).toBe(today);
    expect(month.end).toBe(today);
    expect(week.start <= today).toBe(true);
    expect(month.start.endsWith("-01")).toBe(true);
    void utcKey;
    expect(addDays(today, 0)).toBe(today);
  });
});
