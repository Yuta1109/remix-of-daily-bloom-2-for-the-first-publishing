/**
 * Reflection decision side effects (Keep / Postpone / Stop).
 *
 * Completion status and the review decision stay independent. These helpers
 * mutate an in-memory V3 payload; the repository wraps them in a write.
 */

import { addDays, daysBetween, isValidLocalDate, type LocalDate } from "./local-date";
import { planSubtreeIds } from "./plan-rules";
import type {
  EssencesDataV3,
  FutureTarget,
  PlanItem,
  TaskItem,
} from "./types";

export function shiftLocalDate(date: LocalDate | undefined, deltaDays: number): LocalDate | undefined {
  if (!date || !isValidLocalDate(date) || deltaDays === 0) return date;
  return addDays(date, deltaDays);
}

export function shiftFutureTarget(
  target: FutureTarget | undefined,
  deltaDays: number,
): FutureTarget | undefined {
  if (!target || deltaDays === 0) return target;
  if (target.type === "date" && target.value && isValidLocalDate(target.value)) {
    return { type: "date", value: addDays(target.value, deltaDays) };
  }
  if (target.type === "month" && target.value) {
    const start = `${target.value}-01`;
    if (!isValidLocalDate(start)) return target;
    return { type: "month", value: addDays(start, deltaDays).slice(0, 7) };
  }
  return target;
}

/**
 * Moves a plan and its descendants by `deltaDays`.
 *
 * Open descendant tasks move. Completed / stopped / archived tasks stay on
 * their original local dates so history is not rewritten.
 */
export function shiftPlanSubtree(
  data: EssencesDataV3,
  rootId: string,
  deltaDays: number,
  now: string,
): PlanItem {
  const root = data.plans[rootId];
  const ids = planSubtreeIds(data.plans, rootId);
  const idSet = new Set(ids);
  for (const id of ids) {
    const plan = data.plans[id];
    data.plans[id] = {
      ...plan,
      periodStart: shiftLocalDate(plan.periodStart, deltaDays),
      periodEnd: shiftLocalDate(plan.periodEnd, deltaDays),
      futureTarget: shiftFutureTarget(plan.futureTarget, deltaDays),
      updatedAt: now,
    };
  }
  if (deltaDays !== 0) {
    for (const task of Object.values(data.tasks)) {
      if (!task.parentPlanId || !idSet.has(task.parentPlanId)) continue;
      if (task.status !== "open") continue;
      data.tasks[task.id] = {
        ...task,
        date: addDays(task.date, deltaDays),
        updatedAt: now,
      };
    }
  }
  return data.plans[rootId] ?? root;
}

/** Stop active planning without deleting records or completed task history. */
export function stopPlanSubtree(data: EssencesDataV3, rootId: string, now: string): void {
  const ids = planSubtreeIds(data.plans, rootId);
  const idSet = new Set(ids);
  for (const id of ids) {
    data.plans[id] = { ...data.plans[id], status: "stopped", updatedAt: now };
  }
  for (const task of Object.values(data.tasks)) {
    if (!task.parentPlanId || !idSet.has(task.parentPlanId)) continue;
    if (task.status !== "open") continue;
    data.tasks[task.id] = { ...task, status: "stopped", updatedAt: now };
  }
}

export function futureTargetDate(target: FutureTarget | undefined): LocalDate | undefined {
  if (!target) return undefined;
  if (target.type === "date" && target.value && isValidLocalDate(target.value)) return target.value;
  if (target.type === "month" && target.value) {
    const start = `${target.value}-01`;
    return isValidLocalDate(start) ? start : undefined;
  }
  return undefined;
}

/**
 * Descendants move only when both the current target and the destination
 * have an absolute date. `someday` has none, so Someday → Month/Date updates
 * the parent Future only.
 */
export function postponeShiftsDescendants(
  plan: PlanItem,
  dest: { periodStart?: LocalDate; futureTarget?: FutureTarget },
): boolean {
  if (dest.periodStart && plan.periodStart) return true;
  const from = futureTargetDate(plan.futureTarget);
  const to = futureTargetDate(dest.futureTarget);
  return !!from && !!to;
}

export function postponeDeltaDays(
  plan: PlanItem,
  dest: { periodStart?: LocalDate; futureTarget?: FutureTarget },
): number {
  if (!postponeShiftsDescendants(plan, dest)) return 0;
  if (dest.periodStart && plan.periodStart) {
    return daysBetween(plan.periodStart, dest.periodStart);
  }
  const from = futureTargetDate(plan.futureTarget);
  const to = futureTargetDate(dest.futureTarget);
  if (from && to) return daysBetween(from, to);
  return 0;
}

export function findEquivalentTaskIn(
  data: EssencesDataV3,
  task: Pick<TaskItem, "id" | "title" | "parentPlanId" | "seriesId">,
  date: LocalDate,
): TaskItem | undefined {
  const title = task.title.trim();
  return Object.values(data.tasks).find(
    (t) =>
      t.id !== task.id &&
      t.date === date &&
      t.status !== "archived" &&
      t.status !== "stopped" &&
      (t.seriesId && task.seriesId
        ? t.seriesId === task.seriesId
        : t.title.trim() === title && t.parentPlanId === task.parentPlanId),
  );
}
