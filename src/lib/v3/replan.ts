/**
 * Replan operations on the existing plan / task records.
 *
 * A path may start at Monthly, Weekly, or Daily. These helpers never insert
 * a Future plan to fill a missing level, and they never require a date on
 * something that is only sitting in the Postpone Box.
 */
import { childLevelOf, parentLevelOf, validatePlanParent, validateTaskParent } from "./plan-rules";
import {
  RepositoryError,
  archivePlanItem,
  archiveTask,
  createPlanItem,
  updatePlanItem,
  updateTask,
} from "./repository";
import { loadEssencesData } from "./storage";
import type { PlanItem, PlanLevel, TaskItem } from "./types";

export type ReplanRef = { kind: "plan"; id: string } | { kind: "task"; id: string };

export type ReplanLevel = PlanLevel | "daily";

const PARENT_OF: Record<ReplanLevel, PlanLevel | null> = {
  future: null,
  monthly: "future",
  weekly: "monthly",
  daily: "weekly",
};

function isOpenPlan(plan: PlanItem): boolean {
  return plan.status !== "archived";
}

function isOpenTask(task: TaskItem): boolean {
  return task.status !== "archived";
}

export function replanDecomposeLevel(level: ReplanLevel): ReplanLevel | null {
  if (level === "daily") return null;
  if (level === "weekly") return "daily";
  return childLevelOf(level);
}

/** Listed plans a path can be redesigned around. Postpone Box items stay out. */
export function replanPathChoices(): PlanItem[] {
  return Object.values(loadEssencesData().plans)
    .filter((plan) => isOpenPlan(plan) && !plan.inPostponeBox)
    .sort((a, b) => (a.title < b.title ? -1 : a.title > b.title ? 1 : 0));
}

export function replanParentChoices(ref: ReplanRef): PlanItem[] {
  const data = loadEssencesData();
  if (ref.kind === "task") {
    const task = data.tasks[ref.id];
    if (!task || !isOpenTask(task)) return [];
    return Object.values(data.plans)
      .filter(
        (plan) =>
          isOpenPlan(plan) &&
          !plan.inPostponeBox &&
          plan.level === "weekly" &&
          plan.id !== task.parentPlanId,
      )
      .sort((a, b) => a.order - b.order);
  }
  const plan = data.plans[ref.id];
  const parentLevel = plan ? PARENT_OF[plan.level] : null;
  if (!plan || !isOpenPlan(plan) || !parentLevel) return [];
  return Object.values(data.plans)
    .filter(
      (candidate) =>
        isOpenPlan(candidate) &&
        !candidate.inPostponeBox &&
        candidate.level === parentLevel &&
        candidate.id !== plan.id &&
        candidate.id !== plan.parentPlanId &&
        validatePlanParent(data.plans, plan.level, plan.id, candidate.id).ok,
    )
    .sort((a, b) => a.order - b.order);
}

export function replanCanDetach(ref: ReplanRef): boolean {
  const data = loadEssencesData();
  if (ref.kind === "task") return !!data.tasks[ref.id]?.parentPlanId;
  return !!data.plans[ref.id]?.parentPlanId;
}

/**
 * Moves a plan under another existing parent, or clears the parent.
 * `parentId` undefined keeps a Monthly / Weekly / Future path root as a root.
 */
export function movePlanOnPath(id: string, parentId: string | undefined): PlanItem {
  const plan = loadEssencesData().plans[id];
  if (!plan) throw new RepositoryError(`unknown plan ${id}`, "plan-not-found");
  if (plan.level === "future" && parentId) {
    throw new RepositoryError("future plans have no parent", "plan-parent-invalid-level-pair");
  }
  const check = validatePlanParent(loadEssencesData().plans, plan.level, id, parentId);
  if (!check.ok) {
    throw new RepositoryError(`invalid plan parent (${check.reason})`, `plan-parent-${check.reason}`);
  }
  return updatePlanItem(id, { parentPlanId: parentId });
}

export function moveTaskOnPath(id: string, parentId: string | undefined): TaskItem {
  const check = validateTaskParent(loadEssencesData().plans, parentId);
  if (!check.ok) {
    throw new RepositoryError(`invalid task parent (${check.reason})`, `task-parent-${check.reason}`);
  }
  return updateTask(id, { parentPlanId: parentId });
}

function sameParent(a: string | undefined, b: string | undefined): boolean {
  return (a ?? "") === (b ?? "");
}

function planSiblings(plan: PlanItem): PlanItem[] {
  return Object.values(loadEssencesData().plans)
    .filter(
      (item) =>
        isOpenPlan(item) &&
        !item.inPostponeBox &&
        item.level === plan.level &&
        sameParent(item.parentPlanId, plan.parentPlanId),
    )
    .sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : 1));
}

function taskSiblings(task: TaskItem): TaskItem[] {
  return Object.values(loadEssencesData().tasks)
    .filter(
      (item) =>
        isOpenTask(item) &&
        !item.inPostponeBox &&
        item.date === task.date &&
        sameParent(item.parentPlanId, task.parentPlanId),
    )
    .sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : 1));
}

export function replanCanShift(ref: ReplanRef, direction: -1 | 1): boolean {
  const data = loadEssencesData();
  if (ref.kind === "plan") {
    const plan = data.plans[ref.id];
    if (!plan) return false;
    const siblings = planSiblings(plan);
    const index = siblings.findIndex((item) => item.id === plan.id);
    const next = index + direction;
    return index >= 0 && next >= 0 && next < siblings.length;
  }
  const task = data.tasks[ref.id];
  if (!task) return false;
  const siblings = taskSiblings(task);
  const index = siblings.findIndex((item) => item.id === task.id);
  const next = index + direction;
  return index >= 0 && next >= 0 && next < siblings.length;
}

/** Reorders siblings. Does not change parent, level, or dates. */
export function shiftReplanOrder(ref: ReplanRef, direction: -1 | 1): void {
  if (!replanCanShift(ref, direction)) return;
  const data = loadEssencesData();
  if (ref.kind === "plan") {
    const plan = data.plans[ref.id];
    if (!plan) return;
    const ids = planSiblings(plan).map((item) => item.id);
    const index = ids.indexOf(plan.id);
    const swapped = [...ids];
    const next = index + direction;
    [swapped[index], swapped[next]] = [swapped[next], swapped[index]];
    swapped.forEach((id, order) => updatePlanItem(id, { order }));
    return;
  }
  const task = data.tasks[ref.id];
  if (!task) return;
  const ids = taskSiblings(task).map((item) => item.id);
  const index = ids.indexOf(task.id);
  const swapped = [...ids];
  const next = index + direction;
  [swapped[index], swapped[next]] = [swapped[next], swapped[index]];
  swapped.forEach((id, order) => updateTask(id, { order }));
}

export type PostponeGroupShape = {
  child: "monthly" | "weekly" | "daily";
  parent: PlanLevel;
};

/** Items can share a group only when they are the same legal child level. */
export function postponeGroupShape(refs: ReplanRef[]): PostponeGroupShape | null {
  if (refs.length < 2) return null;
  const data = loadEssencesData();
  const levels = new Set<string>();
  for (const ref of refs) {
    if (ref.kind === "task") {
      const task = data.tasks[ref.id];
      if (!task || !task.inPostponeBox || !isOpenTask(task)) return null;
      levels.add("daily");
      continue;
    }
    const plan = data.plans[ref.id];
    if (!plan || !plan.inPostponeBox || !isOpenPlan(plan)) return null;
    if (plan.level === "future") return null;
    levels.add(plan.level);
  }
  if (levels.size !== 1) return null;
  const child = [...levels][0] as PostponeGroupShape["child"];
  const parent = child === "daily" ? "weekly" : parentLevelOf(child);
  if (!parent) return null;
  return { child, parent };
}

export function postponeGroupParents(parentLevel: PlanLevel): PlanItem[] {
  return Object.values(loadEssencesData().plans)
    .filter((plan) => isOpenPlan(plan) && !!plan.inPostponeBox && plan.level === parentLevel)
    .sort((a, b) => a.order - b.order);
}

export function postponeIncorporateChoices(ref: ReplanRef): PlanItem[] {
  const data = loadEssencesData();
  if (ref.kind === "task") {
    return Object.values(data.plans)
      .filter((plan) => isOpenPlan(plan) && !plan.inPostponeBox && plan.level === "weekly")
      .sort((a, b) => a.order - b.order);
  }
  const plan = data.plans[ref.id];
  const parentLevel = plan ? PARENT_OF[plan.level] : null;
  if (!plan || !parentLevel) return [];
  return Object.values(data.plans)
    .filter(
      (candidate) =>
        isOpenPlan(candidate) &&
        !candidate.inPostponeBox &&
        candidate.level === parentLevel &&
        validatePlanParent(data.plans, plan.level, plan.id, candidate.id).ok,
    )
    .sort((a, b) => a.order - b.order);
}

/**
 * Puts a postponed item back on a plan path.
 * `parentId` undefined returns it as a root and does not write a date.
 */
export function incorporatePostponeItem(ref: ReplanRef, parentId: string | undefined): void {
  const data = loadEssencesData();
  if (ref.kind === "plan") {
    const plan = data.plans[ref.id];
    if (!plan) throw new RepositoryError(`unknown plan ${ref.id}`, "plan-not-found");
    const check = validatePlanParent(data.plans, plan.level, plan.id, parentId);
    if (!check.ok) {
      throw new RepositoryError(`invalid plan parent (${check.reason})`, `plan-parent-${check.reason}`);
    }
    updatePlanItem(plan.id, { parentPlanId: parentId, inPostponeBox: false });
    return;
  }
  const task = data.tasks[ref.id];
  if (!task) throw new RepositoryError(`unknown task ${ref.id}`, "task-not-found");
  const check = validateTaskParent(data.plans, parentId);
  if (!check.ok) {
    throw new RepositoryError(`invalid task parent (${check.reason})`, `task-parent-${check.reason}`);
  }
  updateTask(task.id, { parentPlanId: parentId, inPostponeBox: false });
}

/**
 * Groups postponed items under one parent that also stays in the Postpone Box.
 * No period or future date is written.
 */
export function groupPostponeItems(
  refs: ReplanRef[],
  dest: { parentId: string } | { title: string },
): PlanItem {
  const shape = postponeGroupShape(refs);
  if (!shape) {
    throw new RepositoryError("postpone items cannot share a group", "postpone-group-invalid");
  }
  const data = loadEssencesData();
  let parent: PlanItem;
  if ("parentId" in dest) {
    const existing = data.plans[dest.parentId];
    if (!existing || existing.level !== shape.parent || !existing.inPostponeBox) {
      throw new RepositoryError("postpone group parent is missing", "postpone-group-parent");
    }
    if (refs.some((ref) => ref.kind === "plan" && ref.id === existing.id)) {
      throw new RepositoryError("postpone group parent is one of the items", "postpone-group-parent");
    }
    parent = existing;
  } else {
    const title = dest.title.trim();
    if (!title) throw new RepositoryError("postpone group needs a name", "postpone-group-title");
    parent = createPlanItem({ level: shape.parent, title, createdFrom: "plan" });
    parent = updatePlanItem(parent.id, { inPostponeBox: true });
  }
  for (const ref of refs) {
    if (ref.kind === "plan") {
      updatePlanItem(ref.id, { parentPlanId: parent.id });
    } else {
      updateTask(ref.id, { parentPlanId: parent.id });
    }
  }
  return loadEssencesData().plans[parent.id] ?? parent;
}

export function deletePostponeItem(ref: ReplanRef): void {
  if (ref.kind === "plan") archivePlanItem(ref.id);
  else archiveTask(ref.id);
}
