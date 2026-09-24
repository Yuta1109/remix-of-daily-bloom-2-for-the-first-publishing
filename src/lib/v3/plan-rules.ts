/**
 * Plan hierarchy constraints.
 *
 * Allowed chain: Future → Monthly → Weekly → Daily Task.
 * Arbitrary level relationships are rejected; a breakdown always creates a
 * CHILD and never deletes the parent.
 */

import type { PlanItem, PlanLevel, TaskItem } from "./types";

/** Level a child must have, given the parent level. */
const CHILD_LEVEL: Record<PlanLevel, PlanLevel | null> = {
  future: "monthly",
  monthly: "weekly",
  weekly: null,
};

/** Level a parent must have, given the child level. */
const PARENT_LEVEL: Record<PlanLevel, PlanLevel | null> = {
  future: null,
  monthly: "future",
  weekly: "monthly",
};

export function childLevelOf(level: PlanLevel): PlanLevel | null {
  return CHILD_LEVEL[level];
}

export function parentLevelOf(level: PlanLevel): PlanLevel | null {
  return PARENT_LEVEL[level];
}

/** Whether `child` may be nested directly under `parent`. */
export function canNestPlanLevels(parent: PlanLevel, child: PlanLevel): boolean {
  return CHILD_LEVEL[parent] === child;
}

/** A weekly plan is the only valid plan parent for a daily task. */
export function canParentTask(level: PlanLevel): boolean {
  return level === "weekly";
}

export interface PlanRelationCheck {
  ok: boolean;
  reason?:
    | "missing-parent"
    | "invalid-level-pair"
    | "self-parent"
    | "cycle"
    | "parent-archived";
}

/**
 * Validates a proposed `child.parentPlanId = parentId` edge.
 * `plans` must contain every plan involved in the chain.
 */
export function validatePlanParent(
  plans: Record<string, PlanItem>,
  childLevel: PlanLevel,
  childId: string | undefined,
  parentId: string | undefined,
): PlanRelationCheck {
  if (!parentId) {
    // Only Future may be a root; Monthly / Weekly require a parent only when
    // the caller asks for one, so a parentless Monthly stays legal.
    return { ok: true };
  }
  if (childId && parentId === childId) return { ok: false, reason: "self-parent" };

  const parent = plans[parentId];
  if (!parent) return { ok: false, reason: "missing-parent" };
  if (!canNestPlanLevels(parent.level, childLevel)) {
    return { ok: false, reason: "invalid-level-pair" };
  }
  if (parent.status === "archived") return { ok: false, reason: "parent-archived" };

  if (childId) {
    let cursor: string | undefined = parent.parentPlanId;
    const seen = new Set<string>([childId, parentId]);
    while (cursor) {
      if (seen.has(cursor)) return { ok: false, reason: "cycle" };
      seen.add(cursor);
      cursor = plans[cursor]?.parentPlanId;
    }
  }

  return { ok: true };
}

/** Validates a proposed `task.parentPlanId`. Tasks hang off Weekly plans only. */
export function validateTaskParent(
  plans: Record<string, PlanItem>,
  parentId: string | undefined,
): PlanRelationCheck {
  if (!parentId) return { ok: true };
  const parent = plans[parentId];
  if (!parent) return { ok: false, reason: "missing-parent" };
  if (!canParentTask(parent.level)) return { ok: false, reason: "invalid-level-pair" };
  if (parent.status === "archived") return { ok: false, reason: "parent-archived" };
  return { ok: true };
}

/** Direct children of a plan, ordered by `order`. */
export function childPlansOf(
  plans: Record<string, PlanItem>,
  parentId: string,
): PlanItem[] {
  return Object.values(plans)
    .filter((p) => p.parentPlanId === parentId)
    .sort((a, b) => a.order - b.order);
}

/** Tasks that hang off a weekly plan, ordered by date then `order`. */
export function tasksOfPlan(
  tasks: Record<string, TaskItem>,
  parentPlanId: string,
): TaskItem[] {
  return Object.values(tasks)
    .filter((t) => t.parentPlanId === parentPlanId)
    .sort((a, b) => (a.date === b.date ? a.order - b.order : a.date < b.date ? -1 : 1));
}

/** Root-to-plan ancestor chain, nearest parent first. */
export function ancestorsOf(
  plans: Record<string, PlanItem>,
  planId: string,
): PlanItem[] {
  const out: PlanItem[] = [];
  const seen = new Set<string>([planId]);
  let cursor = plans[planId]?.parentPlanId;
  while (cursor && !seen.has(cursor)) {
    const parent = plans[cursor];
    if (!parent) break;
    out.push(parent);
    seen.add(cursor);
    cursor = parent.parentPlanId;
  }
  return out;
}

/**
 * Statuses that belong in Plan lists this phase.
 * Stopped / archived stay in V3 storage but leave the active view.
 */
export function isListedPlanStatus(status: PlanItem["status"]): boolean {
  return status === "active" || status === "completed";
}

/** Open and completed tasks belong in Daily; stopped / archived stay stored. */
export function isListedTaskStatus(status: TaskItem["status"]): boolean {
  return status === "open" || status === "completed";
}

/** The plan plus every descendant plan id (used when archiving a hierarchy). */
export function planSubtreeIds(
  plans: Record<string, PlanItem>,
  rootId: string,
): string[] {
  const out: string[] = [];
  const queue = [rootId];
  const seen = new Set<string>();
  while (queue.length) {
    const id = queue.shift() as string;
    if (seen.has(id) || !plans[id]) continue;
    seen.add(id);
    out.push(id);
    for (const child of childPlansOf(plans, id)) queue.push(child.id);
  }
  return out;
}
