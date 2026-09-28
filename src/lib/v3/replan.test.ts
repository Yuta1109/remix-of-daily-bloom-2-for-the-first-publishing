import { beforeEach, describe, expect, it } from "vitest";
import { emptyData } from "@/lib/v3/schema";
import { localMonthEnd, localMonthStart } from "@/lib/v3/local-date";
import {
  groupPostponeItems,
  incorporatePostponeItem,
  movePlanOnPath,
  postponeGroupShape,
  shiftReplanOrder,
} from "@/lib/v3/replan";
import {
  breakdownPlanItem,
  createPlanItem,
  createTask,
  getPlanItem,
  getPlanItems,
  getTask,
  updatePlanItem,
} from "@/lib/v3/repository";
import { resetEssencesDataCache, saveEssencesData } from "@/lib/v3/storage";

beforeEach(() => {
  localStorage.clear();
  resetEssencesDataCache();
  saveEssencesData(emptyData());
});

describe("Replan path operations", () => {
  it("detaches a weekly plan without inserting a Future parent", () => {
    const monthly = createPlanItem({
      level: "monthly",
      title: "September",
      periodStart: localMonthStart("2026-09"),
      periodEnd: localMonthEnd("2026-09"),
    });
    const weekly = breakdownPlanItem(monthly.id, {
      title: "Read",
      periodStart: "2026-09-21",
      periodEnd: "2026-09-27",
    });

    movePlanOnPath(weekly.id, undefined);

    expect(getPlanItem(weekly.id)?.parentPlanId).toBeUndefined();
    expect(getPlanItem(weekly.id)?.periodStart).toBe("2026-09-21");
    expect(getPlanItem(monthly.id)?.status).toBe("active");
    expect(getPlanItems({ level: "future" })).toHaveLength(0);
  });

  it("reorders siblings and leaves their parents alone", () => {
    const monthly = createPlanItem({
      level: "monthly",
      title: "September",
      periodStart: localMonthStart("2026-09"),
      periodEnd: localMonthEnd("2026-09"),
    });
    const first = breakdownPlanItem(monthly.id, {
      title: "First",
      periodStart: "2026-09-07",
      periodEnd: "2026-09-13",
    });
    const second = breakdownPlanItem(monthly.id, {
      title: "Second",
      periodStart: "2026-09-14",
      periodEnd: "2026-09-20",
    });

    shiftReplanOrder({ kind: "plan", id: second.id }, -1);

    expect(getPlanItem(second.id)?.order).toBeLessThan(getPlanItem(first.id)?.order ?? 0);
    expect(getPlanItem(first.id)?.parentPlanId).toBe(monthly.id);
    expect(getPlanItem(second.id)?.parentPlanId).toBe(monthly.id);
  });
});

describe("Postpone Box flow", () => {
  it("returns an item to a plan without writing a new date", () => {
    const monthly = createPlanItem({
      level: "monthly",
      title: "September",
      periodStart: localMonthStart("2026-09"),
      periodEnd: localMonthEnd("2026-09"),
    });
    const weekly = createPlanItem({
      level: "weekly",
      title: "Read",
      periodStart: "2026-09-21",
      periodEnd: "2026-09-27",
    });
    updatePlanItem(weekly.id, { inPostponeBox: true });

    incorporatePostponeItem({ kind: "plan", id: weekly.id }, monthly.id);

    expect(getPlanItem(weekly.id)?.inPostponeBox).toBe(false);
    expect(getPlanItem(weekly.id)?.parentPlanId).toBe(monthly.id);
    expect(getPlanItem(weekly.id)?.periodStart).toBe("2026-09-21");
  });

  it("releases a future plan from the box without a parent or a date", () => {
    const future = createPlanItem({
      level: "future",
      title: "Someday",
      futureTarget: { type: "someday" },
    });
    updatePlanItem(future.id, { inPostponeBox: true });

    incorporatePostponeItem({ kind: "plan", id: future.id }, undefined);

    expect(getPlanItem(future.id)?.inPostponeBox).toBeFalsy();
    expect(getPlanItem(future.id)?.parentPlanId).toBeUndefined();
    expect(getPlanItem(future.id)?.futureTarget).toEqual({ type: "someday" });
  });

  it("keeps a task date when it leaves the box without a parent", () => {
    const task = createTask({ title: "Later", date: "2026-09-03", inPostponeBox: true });

    incorporatePostponeItem({ kind: "task", id: task.id }, undefined);

    expect(getTask(task.id)?.inPostponeBox).toBeFalsy();
    expect(getTask(task.id)?.date).toBe("2026-09-03");
    expect(getTask(task.id)?.parentPlanId).toBeUndefined();
  });

  it("groups postponed weeklies under an undated monthly plan that stays in the box", () => {
    const first = createPlanItem({
      level: "weekly",
      title: "First",
      periodStart: "2026-09-07",
      periodEnd: "2026-09-13",
    });
    const second = createPlanItem({
      level: "weekly",
      title: "Second",
      periodStart: "2026-09-14",
      periodEnd: "2026-09-20",
    });
    updatePlanItem(first.id, { inPostponeBox: true });
    updatePlanItem(second.id, { inPostponeBox: true });

    const parent = groupPostponeItems(
      [
        { kind: "plan", id: first.id },
        { kind: "plan", id: second.id },
      ],
      { title: "Held" },
    );

    expect(parent.level).toBe("monthly");
    expect(parent.inPostponeBox).toBe(true);
    expect(parent.periodStart).toBeUndefined();
    expect(parent.futureTarget).toBeUndefined();
    expect(getPlanItem(first.id)?.parentPlanId).toBe(parent.id);
    expect(getPlanItem(first.id)?.inPostponeBox).toBe(true);
    expect(getPlanItem(first.id)?.periodStart).toBe("2026-09-07");
    expect(getPlanItems({ level: "future" })).toHaveLength(0);
  });

  it("refuses to group different levels", () => {
    const weekly = createPlanItem({
      level: "weekly",
      title: "Week",
      periodStart: "2026-09-21",
      periodEnd: "2026-09-27",
    });
    const monthly = createPlanItem({
      level: "monthly",
      title: "Month",
      periodStart: localMonthStart("2026-09"),
      periodEnd: localMonthEnd("2026-09"),
    });
    updatePlanItem(weekly.id, { inPostponeBox: true });
    updatePlanItem(monthly.id, { inPostponeBox: true });

    expect(
      postponeGroupShape([
        { kind: "plan", id: weekly.id },
        { kind: "plan", id: monthly.id },
      ]),
    ).toBeNull();
  });
});
