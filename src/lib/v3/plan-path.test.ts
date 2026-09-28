import { describe, expect, it } from "vitest";
import { buildPlanPath, derivePathStatus } from "./plan-path";
import type { PlanItem, ReflectionDecision, TaskItem } from "./types";

function plan(partial: Partial<PlanItem> & Pick<PlanItem, "id" | "level" | "title">): PlanItem {
  return {
    icon: "target",
    color: "blue",
    status: "active",
    order: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    createdFrom: "plan",
    ...partial,
  };
}

function task(partial: Partial<TaskItem> & Pick<TaskItem, "id" | "title">): TaskItem {
  return {
    date: "2026-09-26",
    allDay: true,
    icon: "target",
    color: "blue",
    status: "open",
    order: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    createdFrom: "plan",
    ...partial,
  };
}

function decision(
  subjectId: string,
  kind: ReflectionDecision["decision"],
  decidedAt: string,
): ReflectionDecision {
  return {
    id: `${subjectId}-${decidedAt}`,
    reflectionSessionId: "session",
    subjectType: "plan",
    subjectId,
    decision: kind,
    decidedAt,
  };
}

describe("buildPlanPath", () => {
  it("keeps only levels that exist, including a path that starts at monthly", () => {
    const monthly = plan({ id: "m", level: "monthly", title: "September" });
    const weekly = plan({
      id: "w",
      level: "weekly",
      title: "This week",
      parentPlanId: "m",
    });
    const daily = task({ id: "d", title: "Write", parentPlanId: "w" });
    const path = buildPlanPath({
      plans: { m: monthly, w: weekly },
      tasks: { d: daily },
      decisions: [],
      selection: { subjectType: "plan", subjectId: "m" },
    });
    expect(path.map((node) => node.level)).toEqual(["monthly", "weekly", "daily"]);
    expect(path.map((node) => node.title)).toEqual(["September", "This week", "Write"]);
  });

  it("omits sibling branches and still includes a future ancestor when one exists", () => {
    const future = plan({ id: "f", level: "future", title: "Degree" });
    const september = plan({
      id: "sep",
      level: "monthly",
      title: "September",
      parentPlanId: "f",
    });
    const october = plan({
      id: "oct",
      level: "monthly",
      title: "October",
      parentPlanId: "f",
      order: 1,
    });
    const path = buildPlanPath({
      plans: { f: future, sep: september, oct: october },
      tasks: {},
      decisions: [],
      selection: { subjectType: "plan", subjectId: "sep" },
    });
    expect(path.map((node) => node.title)).toEqual(["Degree", "September"]);
    expect(path.find((node) => node.id === "sep")?.selected).toBe(true);
  });

  it("starts at a daily task and does not pull in sibling tasks", () => {
    const weekly = plan({ id: "w", level: "weekly", title: "Week" });
    const mine = task({ id: "mine", title: "Mine", parentPlanId: "w" });
    const other = task({ id: "other", title: "Other", parentPlanId: "w", order: 1 });
    const path = buildPlanPath({
      plans: { w: weekly },
      tasks: { mine, other },
      decisions: [],
      selection: { subjectType: "task", subjectId: "mine" },
    });
    expect(path.map((node) => node.title)).toEqual(["Week", "Mine"]);
    expect(path.map((node) => node.level)).toEqual(["weekly", "daily"]);
  });

  it("shows a parentless daily task on its own", () => {
    const daily = task({ id: "d", title: "Alone" });
    const path = buildPlanPath({
      plans: {},
      tasks: { d: daily },
      decisions: [],
      selection: { subjectType: "task", subjectId: "d" },
    });
    expect(path.map((node) => node.level)).toEqual(["daily"]);
  });

  it("nests daily steps under the daily log", () => {
    const weekly = plan({ id: "w", level: "weekly", title: "Week" });
    const daily = task({ id: "shop", title: "Shopping", parentPlanId: "w" });
    const milk = task({ id: "milk", title: "Buy milk", parentPlanId: "w", parentTaskId: "shop", order: 0 });
    const points = task({ id: "points", title: "Use points", parentPlanId: "w", parentTaskId: "shop", order: 1 });
    const path = buildPlanPath({
      plans: { w: weekly },
      tasks: { shop: daily, milk, points },
      decisions: [],
      selection: { subjectType: "plan", subjectId: "w" },
    });
    expect(path.map((node) => node.title)).toEqual(["Week", "Shopping", "Buy milk", "Use points"]);
    expect(path.map((node) => node.depth)).toEqual([0, 1, 2, 2]);
  });

  it("reads completion, postpone, stop, and keep from existing fields", () => {
    const parent = plan({ id: "m", level: "monthly", title: "Month" });
    const done = plan({
      id: "done",
      level: "weekly",
      title: "Done",
      parentPlanId: "m",
      status: "completed",
    });
    const held = plan({
      id: "held",
      level: "weekly",
      title: "Held",
      parentPlanId: "m",
      order: 1,
    });
    const path = buildPlanPath({
      plans: { m: parent, done, held },
      tasks: {},
      decisions: [
        decision("held", "keep", "2026-09-01T00:00:00.000Z"),
        decision("held", "stop", "2026-09-02T00:00:00.000Z"),
        decision("m", "postpone", "2026-09-03T00:00:00.000Z"),
      ],
      selection: { subjectType: "plan", subjectId: "m" },
    });
    const byId = Object.fromEntries(path.map((node) => [node.id, node.status.kind]));
    expect(byId.m).toBe("postponed");
    expect(byId.done).toBe("completed");
    expect(byId.held).toBe("stopped");
    expect(path.find((node) => node.id === "m")?.status).toEqual({ kind: "postponed" });
  });

  it("counts listed child completion when no reflection decision exists", () => {
    const parent = plan({ id: "m", level: "monthly", title: "Month" });
    const open = plan({ id: "a", level: "weekly", title: "Open", parentPlanId: "m" });
    const done = plan({
      id: "b",
      level: "weekly",
      title: "Done",
      parentPlanId: "m",
      status: "completed",
      order: 1,
    });
    const path = buildPlanPath({
      plans: { m: parent, a: open, b: done },
      tasks: {},
      decisions: [],
      selection: { subjectType: "plan", subjectId: "m" },
    });
    expect(path[0]?.status).toEqual({ kind: "progress", completed: 1, total: 2 });
  });
});

describe("derivePathStatus", () => {
  it("lets a postpone-box flag stand in for a postpone decision", () => {
    expect(derivePathStatus({ status: "active", inPostponeBox: true })).toEqual({
      kind: "postponed",
    });
  });

  it("keeps a keep decision beside child progress", () => {
    expect(
      derivePathStatus({
        status: "active",
        decision: "keep",
        progress: { completed: 1, total: 2 },
      }),
    ).toEqual({ kind: "keep", progress: { completed: 1, total: 2 } });
  });
});
