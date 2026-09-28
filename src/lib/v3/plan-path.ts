/**
 * Plan Path is derived from existing parent links.
 * Missing levels are omitted. Nothing here is stored.
 */
import {
  childPlansOf,
  isListedPlanStatus,
  isListedTaskStatus,
  tasksOfPlan,
} from "./plan-rules";
import type {
  MainPlanSelection,
  PlanItem,
  PlanLevel,
  ReflectionDecision,
  TaskItem,
} from "./types";

export type PlanPathLevel = PlanLevel | "daily";

/** View of an existing outcome. Not a new status field. */
export type PlanPathStatus =
  | { kind: "stopped" }
  | { kind: "postponed" }
  | { kind: "completed" }
  | { kind: "keep"; progress: { completed: number; total: number } | null }
  | { kind: "progress"; completed: number; total: number }
  | { kind: "open" };

export interface PlanPathEntry {
  kind: "plan" | "task";
  id: string;
  title: string;
  level: PlanPathLevel;
  depth: number;
  selected: boolean;
  status: PlanPathStatus;
  icon: string;
  color: string;
}

/**
 * Same direct-child count as `getPlanProgress`: listed plans, and listed
 * tasks when this plan is their parent. Stopped / archived children are out.
 */
function listedProgress(
  plans: Record<string, PlanItem>,
  tasks: Record<string, TaskItem>,
  parentId: string,
): { completed: number; total: number } {
  const planChildren = childPlansOf(plans, parentId).filter((c) => isListedPlanStatus(c.status));
  const taskChildren = tasksOfPlan(tasks, parentId).filter((t) => isListedTaskStatus(t.status));
  return {
    total: planChildren.length + taskChildren.length,
    completed:
      planChildren.filter((c) => c.status === "completed").length +
      taskChildren.filter((t) => t.status === "completed").length,
  };
}

function latestDecision(
  decisions: ReflectionDecision[],
  subjectId: string,
): ReflectionDecision["decision"] | null {
  let best: ReflectionDecision | undefined;
  for (const decision of decisions) {
    if (decision.subjectId !== subjectId) continue;
    if (!best || decision.decidedAt > best.decidedAt) best = decision;
  }
  return best?.decision ?? null;
}

export function derivePathStatus(input: {
  status: PlanItem["status"] | TaskItem["status"];
  inPostponeBox?: boolean;
  decision?: ReflectionDecision["decision"] | null;
  progress?: { completed: number; total: number } | null;
}): PlanPathStatus {
  const progress = input.progress && input.progress.total > 0 ? input.progress : null;
  if (input.status === "stopped" || input.decision === "stop") return { kind: "stopped" };
  if (input.inPostponeBox || input.decision === "postpone") return { kind: "postponed" };
  if (input.status === "completed") return { kind: "completed" };
  if (input.decision === "keep") return { kind: "keep", progress };
  if (progress) return { kind: "progress", completed: progress.completed, total: progress.total };
  return { kind: "open" };
}

/** Ancestors that still exist, root first. An archived parent ends the chain. */
function visibleAncestors(plans: Record<string, PlanItem>, startId: string | undefined): PlanItem[] {
  const nearestFirst: PlanItem[] = [];
  const seen = new Set<string>();
  let cursor = startId;
  while (cursor && !seen.has(cursor)) {
    const parent = plans[cursor];
    if (!parent || parent.status === "archived") break;
    nearestFirst.push(parent);
    seen.add(cursor);
    cursor = parent.parentPlanId;
  }
  return nearestFirst.reverse();
}

function planEntry(
  plan: PlanItem,
  depth: number,
  selected: boolean,
  plans: Record<string, PlanItem>,
  tasks: Record<string, TaskItem>,
  decisions: ReflectionDecision[],
): PlanPathEntry {
  return {
    kind: "plan",
    id: plan.id,
    title: plan.title,
    level: plan.level,
    depth,
    selected,
    icon: plan.icon,
    color: plan.color,
    status: derivePathStatus({
      status: plan.status,
      inPostponeBox: plan.inPostponeBox,
      decision: latestDecision(decisions, plan.id),
      progress: listedProgress(plans, tasks, plan.id),
    }),
  };
}

function taskEntry(
  task: TaskItem,
  depth: number,
  selected: boolean,
  decisions: ReflectionDecision[],
): PlanPathEntry {
  return {
    kind: "task",
    id: task.id,
    title: task.title,
    level: "daily",
    depth,
    selected,
    icon: task.icon,
    color: task.color,
    status: derivePathStatus({
      status: task.status,
      inPostponeBox: task.inPostponeBox,
      decision: latestDecision(decisions, task.id),
    }),
  };
}

function childTasksOf(tasks: Record<string, TaskItem>, parentTaskId: string): TaskItem[] {
  return Object.values(tasks)
    .filter((task) => task.parentTaskId === parentTaskId && task.status !== "archived")
    .sort((a, b) => a.order - b.order);
}

function appendTaskSteps(
  tasks: Record<string, TaskItem>,
  decisions: ReflectionDecision[],
  parentTaskId: string,
  depth: number,
  selectedId: string | undefined,
  out: PlanPathEntry[],
) {
  for (const child of childTasksOf(tasks, parentTaskId)) {
    out.push(taskEntry(child, depth, child.id === selectedId, decisions));
  }
}
function appendDescendants(
  plans: Record<string, PlanItem>,
  tasks: Record<string, TaskItem>,
  decisions: ReflectionDecision[],
  parentId: string,
  depth: number,
  out: PlanPathEntry[],
) {
  for (const child of childPlansOf(plans, parentId)) {
    if (child.status === "archived") continue;
    out.push(planEntry(child, depth, false, plans, tasks, decisions));
    appendDescendants(plans, tasks, decisions, child.id, depth + 1, out);
  }
  for (const task of tasksOfPlan(tasks, parentId)) {
    if (task.status === "archived" || task.parentTaskId) continue;
    out.push(taskEntry(task, depth, false, decisions));
    appendTaskSteps(tasks, decisions, task.id, depth + 1, undefined, out);
  }
}

/**
 * The chain that actually exists around `selection`:
 * visible ancestors, the selection, then its descendants.
 * Siblings of the selection are left out. Empty levels are not inserted.
 */
export function buildPlanPath(input: {
  plans: Record<string, PlanItem>;
  tasks: Record<string, TaskItem>;
  decisions: ReflectionDecision[];
  selection: MainPlanSelection;
}): PlanPathEntry[] {
  const { plans, tasks, decisions, selection } = input;

  if (selection.subjectType === "task") {
    const task = tasks[selection.subjectId];
    if (!task || task.status === "archived") return [];
    const ancestors = visibleAncestors(plans, task.parentPlanId);
    const out: PlanPathEntry[] = ancestors.map((plan, index) =>
      planEntry(plan, index, false, plans, tasks, decisions),
    );
    const parentTask = task.parentTaskId ? tasks[task.parentTaskId] : undefined;
    if (parentTask && parentTask.status !== "archived") {
      out.push(taskEntry(parentTask, ancestors.length, false, decisions));
      appendTaskSteps(tasks, decisions, parentTask.id, ancestors.length + 1, task.id, out);
      return out;
    }
    out.push(taskEntry(task, ancestors.length, true, decisions));
    appendTaskSteps(tasks, decisions, task.id, ancestors.length + 1, undefined, out);
    return out;
  }

  const plan = plans[selection.subjectId];
  if (!plan || plan.status === "archived") return [];
  const ancestors = visibleAncestors(plans, plan.parentPlanId);
  const out: PlanPathEntry[] = ancestors.map((item, index) =>
    planEntry(item, index, false, plans, tasks, decisions),
  );
  const depth = ancestors.length;
  out.push(planEntry(plan, depth, true, plans, tasks, decisions));
  appendDescendants(plans, tasks, decisions, plan.id, depth + 1, out);
  return out;
}
