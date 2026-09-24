import { beforeEach, describe, expect, it } from "vitest";
import {
  RepositoryError,
  archivePlanItem,
  breakdownPlanItem,
  createPlanItem,
  getChildPlanItems,
  getPlanItem,
  getPlanItems,
  getPlanItemsForPeriod,
  getPlanProgress,
  getSettings,
  updatePlanItem,
  updateSettings,
} from "@/lib/v3/repository";
import { resetEssencesDataCache, saveEssencesData } from "@/lib/v3/storage";
import { emptyData } from "@/lib/v3/schema";
import {
  endOfWeek,
  localMonthEnd,
  localMonthStart,
  startOfWeek,
} from "@/lib/v3/local-date";

beforeEach(() => {
  localStorage.clear();
  resetEssencesDataCache();
  saveEssencesData(emptyData());
});

describe("Phase 3A Plan: Future / Monthly / Weekly", () => {
  it("1. creates a Future plan", () => {
    const future = createPlanItem({
      level: "future",
      title: "京都旅行",
      icon: "plane",
      color: "sky",
      futureTarget: { type: "month", value: "2026-10" },
    });

    expect(future.level).toBe("future");
    expect(future.parentPlanId).toBeUndefined();
    expect(future.status).toBe("active");
    expect(getPlanItems({ level: "future" })).toHaveLength(1);
    expect(getPlanItem(future.id)?.title).toBe("京都旅行");
  });

  it("2. creates a Monthly plan with a local month period", () => {
    const monthly = createPlanItem({
      level: "monthly",
      title: "11月中に評論の第一稿を完成させる",
      periodStart: localMonthStart("2026-11"),
      periodEnd: localMonthEnd("2026-11"),
    });

    expect(monthly.level).toBe("monthly");
    expect(monthly.periodStart).toBe("2026-11-01");
    expect(monthly.periodEnd).toBe("2026-11-30");
    expect(
      getPlanItemsForPeriod("monthly", "2026-11-01", "2026-11-30").map((p) => p.id),
    ).toEqual([monthly.id]);
  });

  it("3. creates a Weekly plan for a selected local week, with no parent", () => {
    const start = startOfWeek("2026-09-23", 1);
    const end = endOfWeek("2026-09-23", 1);
    const weekly = createPlanItem({
      level: "weekly",
      title: "第2週までに5冊の書籍・論文を読む",
      periodStart: start,
      periodEnd: end,
    });

    expect(weekly.level).toBe("weekly");
    expect(weekly.parentPlanId).toBeUndefined();
    expect(weekly.periodStart).toBe("2026-09-21");
    expect(weekly.periodEnd).toBe("2026-09-27");
    expect(getPlanItemsForPeriod("weekly", start, end)).toHaveLength(1);
  });

  it("4–7. Future → Monthly breakdown keeps the parent and sets parentPlanId", () => {
    const future = createPlanItem({
      level: "future",
      title: "日本経済について評論を書く",
    });
    const monthly = breakdownPlanItem(future.id, {
      title: "11月中に評論の第一稿を完成させる",
      periodStart: localMonthStart("2026-11"),
      periodEnd: localMonthEnd("2026-11"),
    });

    expect(monthly.level).toBe("monthly");
    expect(monthly.parentPlanId).toBe(future.id);
    expect(getPlanItem(future.id)?.status).toBe("active");
    expect(getPlanItem(future.id)?.title).toBe("日本経済について評論を書く");
    expect(getPlanItems({ level: "future" })).toHaveLength(1);
    expect(getChildPlanItems(future.id).map((p) => p.id)).toEqual([monthly.id]);
  });

  it("5–7. Monthly → Weekly breakdown keeps the parent and sets parentPlanId", () => {
    const monthly = createPlanItem({
      level: "monthly",
      title: "日本経済に関する評論を書く",
      periodStart: localMonthStart("2026-09"),
      periodEnd: localMonthEnd("2026-09"),
    });
    const weekly = breakdownPlanItem(monthly.id, {
      title: "第2週までに5冊の書籍・論文を読む",
      periodStart: "2026-09-21",
      periodEnd: "2026-09-27",
    });

    expect(weekly.level).toBe("weekly");
    expect(weekly.parentPlanId).toBe(monthly.id);
    expect(getPlanItem(monthly.id)?.status).toBe("active");
    expect(getChildPlanItems(monthly.id)).toHaveLength(1);
  });

  it("8. turning Weekly OFF preserves Weekly data and turning it ON reveals the same items", () => {
    const weekly = createPlanItem({
      level: "weekly",
      title: "PDE Chapter 2を完成",
      periodStart: "2026-09-21",
      periodEnd: "2026-09-27",
    });

    expect(getSettings().weeklyPlanningEnabled).toBe(true);
    updateSettings({ weeklyPlanningEnabled: false });
    expect(getSettings().weeklyPlanningEnabled).toBe(false);
    expect(getPlanItem(weekly.id)?.title).toBe("PDE Chapter 2を完成");
    expect(getPlanItem(weekly.id)?.status).toBe("active");
    expect(getPlanItems({ level: "weekly" })).toHaveLength(1);

    updateSettings({ weeklyPlanningEnabled: true });
    expect(getSettings().weeklyPlanningEnabled).toBe(true);
    expect(getPlanItems({ level: "weekly" })[0]?.id).toBe(weekly.id);
  });

  it("9. Monthly and Weekly period queries use local-date bounds, not UTC", () => {
    const inSeptember = createPlanItem({
      level: "monthly",
      title: "September plan",
      periodStart: localMonthStart("2026-09"),
      periodEnd: localMonthEnd("2026-09"),
    });
    createPlanItem({
      level: "monthly",
      title: "October plan",
      periodStart: localMonthStart("2026-10"),
      periodEnd: localMonthEnd("2026-10"),
    });
    const week = createPlanItem({
      level: "weekly",
      title: "week of Sep 21",
      periodStart: "2026-09-21",
      periodEnd: "2026-09-27",
    });

    expect(
      getPlanItemsForPeriod("monthly", "2026-09-01", "2026-09-30").map((p) => p.id),
    ).toEqual([inSeptember.id]);
    expect(getPlanItemsForPeriod("monthly", "2026-10-01", "2026-10-31")).toHaveLength(1);
    expect(
      getPlanItemsForPeriod("weekly", "2026-09-21", "2026-09-27").map((p) => p.id),
    ).toEqual([week.id]);
    expect(getPlanItemsForPeriod("weekly", "2026-09-14", "2026-09-20")).toHaveLength(0);
  });

  it("10. derived child progress is read from children, not stored on the parent", () => {
    const monthly = createPlanItem({
      level: "monthly",
      title: "PDE Project",
      periodStart: localMonthStart("2026-09"),
      periodEnd: localMonthEnd("2026-09"),
    });
    const a = breakdownPlanItem(monthly.id, { title: "milestone A", periodStart: "2026-09-07", periodEnd: "2026-09-13" });
    const b = breakdownPlanItem(monthly.id, { title: "milestone B", periodStart: "2026-09-14", periodEnd: "2026-09-20" });
    const c = breakdownPlanItem(monthly.id, { title: "milestone C", periodStart: "2026-09-21", periodEnd: "2026-09-27" });

    expect(getPlanProgress(monthly.id)).toEqual({ total: 3, completed: 0 });
    updatePlanItem(a.id, { status: "completed" });
    updatePlanItem(b.id, { status: "completed" });
    expect(getPlanProgress(monthly.id)).toEqual({ total: 3, completed: 2 });
    updatePlanItem(c.id, { status: "stopped" });
    expect(getPlanProgress(monthly.id)).toEqual({ total: 2, completed: 2 });
    expect("progress" in (getPlanItem(monthly.id) as object)).toBe(false);
  });

  it("11. stopping and archiving never delete the PlanItem", () => {
    const future = createPlanItem({ level: "future", title: "資格試験" });
    const monthly = breakdownPlanItem(future.id, {
      title: "9月は過去問",
      periodStart: localMonthStart("2026-09"),
      periodEnd: localMonthEnd("2026-09"),
    });

    const stopped = updatePlanItem(future.id, { status: "stopped" });
    expect(stopped.status).toBe("stopped");
    expect(getPlanItem(future.id)).toBeDefined();
    expect(getPlanItems({ level: "future", status: "stopped" })).toHaveLength(1);

    const archived = archivePlanItem(monthly.id);
    expect(archived).toHaveLength(1);
    expect(getPlanItem(monthly.id)?.status).toBe("archived");
    expect(getPlanItemsForPeriod("monthly", "2026-09-01", "2026-09-30")).toHaveLength(0);
    expect(loadStillExists(monthly.id)).toBe(true);
  });

  it("12. does not create a duplicate child with the same title, parent, and period", () => {
    const future = createPlanItem({ level: "future", title: "日本経済について評論を書く" });
    const input = {
      title: "11月中に評論の第一稿を完成させる",
      periodStart: localMonthStart("2026-11"),
      periodEnd: localMonthEnd("2026-11"),
    };
    const first = breakdownPlanItem(future.id, input);

    expect(() => breakdownPlanItem(future.id, input)).toThrowError(RepositoryError);
    expect(() => breakdownPlanItem(future.id, input)).toThrowError(/duplicate child plan/);
    expect(getChildPlanItems(future.id)).toHaveLength(1);
    expect(getPlanItem(first.id)?.parentPlanId).toBe(future.id);
    expect(getPlanItem(future.id)?.status).toBe("active");

    const otherWeek = breakdownPlanItem(future.id, {
      title: "12月中に第二稿を完成させる",
      periodStart: localMonthStart("2026-12"),
      periodEnd: localMonthEnd("2026-12"),
    });
    expect(otherWeek.id).not.toBe(first.id);
    expect(getChildPlanItems(future.id)).toHaveLength(2);
  });
});

function loadStillExists(id: string): boolean {
  return getPlanItem(id) !== undefined;
}
