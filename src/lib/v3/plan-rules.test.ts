import { describe, expect, it } from "vitest";
import {
  ancestorsOf,
  canNestPlanLevels,
  canParentTask,
  childLevelOf,
  childPlansOf,
  isListedPlanStatus,
  isListedTaskStatus,
  parentLevelOf,
  planSubtreeIds,
  validatePlanParent,
  validateTaskParent,
} from "@/lib/v3/plan-rules";
import type { PlanItem, PlanLevel } from "@/lib/v3/types";

function plan(id: string, level: PlanLevel, parentPlanId?: string, order = 0): PlanItem {
  return {
    id,
    level,
    title: id,
    icon: "target",
    color: "orange",
    parentPlanId,
    status: "active",
    order,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    createdFrom: "plan",
  };
}

function plansOf(items: PlanItem[]): Record<string, PlanItem> {
  return Object.fromEntries(items.map((p) => [p.id, p]));
}

describe("plan hierarchy levels", () => {
  it("allows only Future → Monthly → Weekly", () => {
    expect(childLevelOf("future")).toBe("monthly");
    expect(childLevelOf("monthly")).toBe("weekly");
    expect(childLevelOf("weekly")).toBeNull();

    expect(parentLevelOf("monthly")).toBe("future");
    expect(parentLevelOf("weekly")).toBe("monthly");
    expect(parentLevelOf("future")).toBeNull();

    expect(canNestPlanLevels("future", "monthly")).toBe(true);
    expect(canNestPlanLevels("monthly", "weekly")).toBe(true);
  });

  it("rejects arbitrary level relationships", () => {
    expect(canNestPlanLevels("future", "weekly")).toBe(false);
    expect(canNestPlanLevels("future", "future")).toBe(false);
    expect(canNestPlanLevels("monthly", "monthly")).toBe(false);
    expect(canNestPlanLevels("monthly", "future")).toBe(false);
    expect(canNestPlanLevels("weekly", "weekly")).toBe(false);
    expect(canNestPlanLevels("weekly", "monthly")).toBe(false);
  });

  it("only Weekly may parent a Daily Task", () => {
    expect(canParentTask("weekly")).toBe(true);
    expect(canParentTask("monthly")).toBe(false);
    expect(canParentTask("future")).toBe(false);
  });

  it("lists active and completed plans, not stopped or archived", () => {
    expect(isListedPlanStatus("active")).toBe(true);
    expect(isListedPlanStatus("completed")).toBe(true);
    expect(isListedPlanStatus("stopped")).toBe(false);
    expect(isListedPlanStatus("archived")).toBe(false);
  });

  it("lists open and completed tasks, not stopped or archived", () => {
    expect(isListedTaskStatus("open")).toBe(true);
    expect(isListedTaskStatus("completed")).toBe(true);
    expect(isListedTaskStatus("stopped")).toBe(false);
    expect(isListedTaskStatus("archived")).toBe(false);
  });
});

describe("validatePlanParent", () => {
  const plans = plansOf([
    plan("f1", "future"),
    plan("m1", "monthly", "f1"),
    plan("w1", "weekly", "m1"),
  ]);

  it("accepts Future → Monthly", () => {
    expect(validatePlanParent(plans, "monthly", undefined, "f1")).toEqual({ ok: true });
  });

  it("accepts Monthly → Weekly", () => {
    expect(validatePlanParent(plans, "weekly", undefined, "m1")).toEqual({ ok: true });
  });

  it("rejects skipping a level", () => {
    expect(validatePlanParent(plans, "weekly", undefined, "f1")).toEqual({
      ok: false,
      reason: "invalid-level-pair",
    });
  });

  it("rejects a Weekly parent for a Weekly plan", () => {
    expect(validatePlanParent(plans, "weekly", undefined, "w1")).toEqual({
      ok: false,
      reason: "invalid-level-pair",
    });
  });

  it("treats a missing parent as an error and no parent as a root", () => {
    expect(validatePlanParent(plans, "monthly", undefined, "nope")).toEqual({
      ok: false,
      reason: "missing-parent",
    });
    expect(validatePlanParent(plans, "future", undefined, undefined)).toEqual({ ok: true });
  });

  it("rejects self-parenting and archived parents", () => {
    expect(validatePlanParent(plans, "monthly", "f1", "f1")).toEqual({
      ok: false,
      reason: "self-parent",
    });
    const archived = plansOf([{ ...plan("f2", "future"), status: "archived" }]);
    expect(validatePlanParent(archived, "monthly", undefined, "f2")).toEqual({
      ok: false,
      reason: "parent-archived",
    });
  });

  it("rejects a cycle", () => {
    // f1 already points at m1, so nesting m1 under f1 would close a loop.
    const looped = plansOf([plan("f1", "future", "m1"), plan("m1", "monthly")]);
    expect(validatePlanParent(looped, "monthly", "m1", "f1")).toEqual({
      ok: false,
      reason: "cycle",
    });
  });
});

describe("validateTaskParent", () => {
  const plans = plansOf([
    plan("f1", "future"),
    plan("m1", "monthly", "f1"),
    plan("w1", "weekly", "m1"),
  ]);

  it("accepts Weekly → Daily Task", () => {
    expect(validateTaskParent(plans, "w1")).toEqual({ ok: true });
  });

  it("rejects Monthly and Future task parents", () => {
    expect(validateTaskParent(plans, "m1")).toEqual({
      ok: false,
      reason: "invalid-level-pair",
    });
    expect(validateTaskParent(plans, "f1")).toEqual({
      ok: false,
      reason: "invalid-level-pair",
    });
  });

  it("allows a task with no plan parent", () => {
    expect(validateTaskParent(plans, undefined)).toEqual({ ok: true });
  });
});

describe("hierarchy traversal", () => {
  const plans = plansOf([
    plan("f1", "future"),
    plan("m1", "monthly", "f1", 1),
    plan("m2", "monthly", "f1", 0),
    plan("w1", "weekly", "m1"),
  ]);

  it("lists children in order", () => {
    expect(childPlansOf(plans, "f1").map((p) => p.id)).toEqual(["m2", "m1"]);
  });

  it("walks ancestors nearest-first", () => {
    expect(ancestorsOf(plans, "w1").map((p) => p.id)).toEqual(["m1", "f1"]);
  });

  it("collects the whole subtree for archiving", () => {
    expect(planSubtreeIds(plans, "f1").sort()).toEqual(["f1", "m1", "m2", "w1"]);
  });
});
