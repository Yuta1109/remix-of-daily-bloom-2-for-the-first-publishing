/**
 * V3 repository / data access layer.
 *
 * Future UI components must call these functions instead of `localStorage`.
 * Domain rules (plan nesting, task identity, reflection decisions, challenge
 * completion, point ledger) live here; persistence lives in `storage.ts`.
 */

import {
  addDays,
  addMonths,
  eachLocalDate,
  endOfMonth,
  endOfWeek,
  isValidLocalDate,
  localDateOf,
  nowTimestamp,
  startOfMonth,
  startOfWeek,
  todayLocalDate,
  type LocalDate,
  type Timestamp,
  type Weekday,
} from "./local-date";
import {
  childPlansOf,
  isListedPlanStatus,
  isListedTaskStatus,
  planSubtreeIds,
  validatePlanParent,
  validateTaskParent,
} from "./plan-rules";
import {
  CHALLENGE_DEFINITIONS,
  challengeDefinition,
  selectChallengesForDate,
  type ChallengeDefinition,
} from "./challenge-definitions";
import { isChallengeSatisfied } from "./challenge-rules";
import { hasChallengePointAward, pointBalanceFrom } from "./points";
import {
  completeReflection,
  deriveReflectionStatus,
  keepCarryDate,
  reflectionPeriod,
  scheduleAfterPeriod,
  skipReflection,
  startReflection,
  withDerivedStatus,
} from "./reflection";
import { seriesOccurrencesInRange, seriesOccursOn } from "./task-recurrence";
import {
  DEFAULT_COLOR,
  DEFAULT_PLAN_ICON,
  DEFAULT_ROUTINE_ICON,
  DEFAULT_TASK_ICON,
  convertedTargetsOf,
  newId,
} from "./schema";
import { mergeUserSettings } from "./settings-io";
import { loadEssencesData, saveEssencesData, updateEssencesData, ensureLegacyCatchup } from "./storage";
import { isKnownStampDefinition, isKnownWallpaper } from "./stamp-catalog";
import {
  findEquivalentTaskIn,
  postponeDeltaDays,
  postponeShiftsDescendants,
  shiftPlanSubtree,
  stopPlanSubtree,
} from "./reflection-migration";
import {
  REFLECTION_RECENT_DAILY_DAYS,
  REFLECTION_RECENT_MONTHS,
  catchUpBucket,
  isRecentReflectionPeriod,
  recentWeeklyFrom,
  summarizeReflectionCatchUp,
  type ReflectionCatchUpSummary,
  type ReflectionCatchUpBucket,
} from "./reflection-catch-up";
import {
  clampStampCoord,
  clampStampRotation,
  clampStampScale,
  clampStampZIndex,
  nextStampZIndex,
} from "./stamp-coords";
import type {
  ActivityRecord,
  ActivityType,
  CalendarDayAppearance,
  CalendarEventItem,
  CalendarStamp,
  Collection,
  CollectionEntry,
  DailyChallengeAssignment,
  ImageAttachment,
  EssencesDataV3,
  FutureTarget,
  NotePage,
  PlanItem,
  PlanLevel,
  PointReason,
  PointTransaction,
  QuickMemo,
  QuickMemoConvertedType,
  ReflectionDecision,
  ReflectionDecisionType,
  ReflectionScheduleSettings,
  ReflectionSession,
  ReflectionType,
  RoutineCompletion,
  RoutineItem,
  TaskItem,
  TaskSeries,
  TaskTemplate,
  UserSettings,
} from "./types";

export class RepositoryError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = "RepositoryError";
  }
}

function nextOrder(values: { order: number }[]): number {
  return values.reduce((max, v) => Math.max(max, v.order + 1), 0);
}

/** Firestore must never receive a data-URL / base64 payload on ImageAttachment. */
function rejectInlineImage(image: ImageAttachment | undefined): ImageAttachment | undefined {
  if (!image) return undefined;
  const uri = String(image.localUri || "");
  if (uri.startsWith("data:") || uri.length > 4096) {
    throw new RepositoryError(
      "image localUri must be a short local path, not inline data",
      "image-not-inline",
    );
  }
  if (!uri && !image.storagePath) {
    throw new RepositoryError(
      "image localUri must be a short local path, not inline data",
      "image-not-inline",
    );
  }
  return image;
}

function linkNoteEntry(
  data: EssencesDataV3,
  collectionId: string,
  noteId: string,
  now: Timestamp,
  order?: number,
): CollectionEntry {
  const existing = Object.values(data.collectionEntries).find(
    (e) => e.collectionId === collectionId && e.type === "note" && e.noteId === noteId,
  );
  if (existing) return existing;
  const siblings = Object.values(data.collectionEntries).filter((e) => e.collectionId === collectionId);
  const entry: CollectionEntry = {
    id: newId(),
    collectionId,
    type: "note",
    noteId,
    order: order ?? nextOrder(siblings),
    createdAt: now,
  };
  data.collectionEntries[entry.id] = entry;
  const note = data.notes[noteId];
  if (note && !note.collectionIds.includes(collectionId)) {
    data.notes[noteId] = {
      ...note,
      collectionIds: [...note.collectionIds, collectionId],
      updatedAt: now,
    };
  }
  return entry;
}

function linkQuickMemoEntry(
  data: EssencesDataV3,
  collectionId: string,
  quickMemoId: string,
  now: Timestamp,
  order?: number,
): CollectionEntry {
  const existing = Object.values(data.collectionEntries).find(
    (e) =>
      e.collectionId === collectionId && e.type === "quickMemo" && e.quickMemoId === quickMemoId,
  );
  if (existing) return existing;
  const siblings = Object.values(data.collectionEntries).filter((e) => e.collectionId === collectionId);
  const entry: CollectionEntry = {
    id: newId(),
    collectionId,
    type: "quickMemo",
    quickMemoId,
    order: order ?? nextOrder(siblings),
    createdAt: now,
  };
  data.collectionEntries[entry.id] = entry;
  return entry;
}

/* ------------------------------------------------------------------ Plans */

export function getPlanItems(filter?: {
  level?: PlanLevel;
  status?: PlanItem["status"];
  parentPlanId?: string | null;
}): PlanItem[] {
  const { plans } = loadEssencesData();
  return Object.values(plans)
    .filter((p) => {
      if (filter?.level && p.level !== filter.level) return false;
      if (filter?.status && p.status !== filter.status) return false;
      if (filter?.parentPlanId === null && p.parentPlanId) return false;
      if (typeof filter?.parentPlanId === "string" && p.parentPlanId !== filter.parentPlanId) {
        return false;
      }
      if (p.inPostponeBox) return false;
      return true;
    })
    .sort((a, b) => a.order - b.order);
}

export function getPlanItem(id: string): PlanItem | undefined {
  return loadEssencesData().plans[id];
}

export interface CreatePlanInput {
  level: PlanLevel;
  title: string;
  note?: string;
  icon?: string;
  color?: string;
  parentPlanId?: string;
  periodStart?: LocalDate;
  periodEnd?: LocalDate;
  futureTarget?: PlanItem["futureTarget"];
  createdFrom?: PlanItem["createdFrom"];
}

function isDuplicateChildPlan(
  plans: Record<string, PlanItem>,
  input: Pick<CreatePlanInput, "level" | "title" | "parentPlanId" | "periodStart" | "periodEnd">,
): boolean {
  if (!input.parentPlanId) return false;
  const title = input.title.trim();
  return Object.values(plans).some(
    (p) =>
      p.status !== "archived" &&
      !p.inPostponeBox &&
      p.parentPlanId === input.parentPlanId &&
      p.level === input.level &&
      p.title.trim() === title &&
      (p.periodStart ?? "") === (input.periodStart ?? "") &&
      (p.periodEnd ?? "") === (input.periodEnd ?? ""),
  );
}

export function createPlanItem(input: CreatePlanInput): PlanItem {
  const { result } = updateEssencesData((data) => {
    const check = validatePlanParent(data.plans, input.level, undefined, input.parentPlanId);
    if (!check.ok) {
      throw new RepositoryError(
        `invalid plan parent (${check.reason})`,
        `plan-parent-${check.reason}`,
      );
    }
    if (isDuplicateChildPlan(data.plans, input)) {
      throw new RepositoryError("duplicate child plan", "plan-duplicate-child");
    }
    const now = nowTimestamp();
    const siblings = Object.values(data.plans).filter(
      (p) => p.parentPlanId === input.parentPlanId && p.level === input.level,
    );
    const plan: PlanItem = {
      id: newId(),
      level: input.level,
      title: input.title,
      note: input.note,
      icon: input.icon ?? DEFAULT_PLAN_ICON,
      color: input.color ?? DEFAULT_COLOR,
      parentPlanId: input.parentPlanId,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      futureTarget: input.futureTarget,
      status: "active",
      order: nextOrder(siblings),
      createdAt: now,
      updatedAt: now,
      createdFrom: input.createdFrom ?? "plan",
    };
    data.plans[plan.id] = plan;
    pushActivity(data, {
      type: input.parentPlanId ? "breakdown_created" : "plan_updated",
      entityType: "plan",
      entityId: plan.id,
    });
    return plan;
  });
  return result;
}

export function updatePlanItem(id: string, patch: Partial<Omit<PlanItem, "id">>): PlanItem {
  const { result } = updateEssencesData((data) => {
    const current = data.plans[id];
    if (!current) throw new RepositoryError(`unknown plan ${id}`, "plan-not-found");

    if ("parentPlanId" in patch || "level" in patch) {
      const level = patch.level ?? current.level;
      const check = validatePlanParent(
        data.plans,
        level,
        id,
        "parentPlanId" in patch ? patch.parentPlanId : current.parentPlanId,
      );
      if (!check.ok) {
        throw new RepositoryError(
          `invalid plan parent (${check.reason})`,
          `plan-parent-${check.reason}`,
        );
      }
    }

    const next: PlanItem = { ...current, ...patch, id, updatedAt: nowTimestamp() };
    if (patch.status === "completed" && !next.completedAt) next.completedAt = next.updatedAt;
    if (patch.status && patch.status !== "completed") next.completedAt = undefined;
    data.plans[id] = next;
    pushActivity(data, { type: "plan_updated", entityType: "plan", entityId: id });
    return next;
  });
  return result;
}

/**
 * Breaks a plan down by creating a CHILD one level lower. The parent is never
 * deleted or replaced.
 */
export function breakdownPlanItem(
  parentPlanId: string,
  input: Omit<CreatePlanInput, "level" | "parentPlanId">,
): PlanItem {
  const parent = getPlanItem(parentPlanId);
  if (!parent) throw new RepositoryError(`unknown plan ${parentPlanId}`, "plan-not-found");
  const level = parent.level === "future" ? "monthly" : parent.level === "monthly" ? "weekly" : null;
  if (!level) {
    throw new RepositoryError("weekly plans break down into tasks", "plan-breakdown-invalid");
  }
  return createPlanItem({ ...input, level, parentPlanId, createdFrom: input.createdFrom ?? "plan" });
}

/**
 * Archives a plan and its whole subtree (plus attached tasks) instead of
 * deleting, so a migrated hierarchy stays linked and reconstructable.
 */
export function archivePlanItem(
  id: string,
  opts?: { archiveCompletedTasks?: boolean },
): PlanItem[] {
  const { result } = updateEssencesData((data) => {
    if (!data.plans[id]) throw new RepositoryError(`unknown plan ${id}`, "plan-not-found");
    const now = nowTimestamp();
    const ids = planSubtreeIds(data.plans, id);
    const archived: PlanItem[] = [];
    for (const planId of ids) {
      const next: PlanItem = { ...data.plans[planId], status: "archived", updatedAt: now };
      data.plans[planId] = next;
      archived.push(next);
    }
    const idSet = new Set(ids);
    const archiveCompleted = opts?.archiveCompletedTasks !== false;
    for (const task of Object.values(data.tasks)) {
      if (!task.parentPlanId || !idSet.has(task.parentPlanId)) continue;
      if (task.status === "completed" && !archiveCompleted) continue;
      data.tasks[task.id] = { ...task, status: "archived", updatedAt: now };
    }
    return archived;
  });
  return result;
}

/**
 * Plans of a level whose stored `[periodStart, periodEnd]` overlaps the given
 * window. Used by the Monthly and Weekly Plan views (Phase 3A) — Monthly
 * passes month bounds, Weekly passes week bounds. Plans without a period are
 * never matched (Future items are grouped by `futureTarget` instead, via
 * plain `getPlanItems`).
 */
export function getPlanItemsForPeriod(
  level: PlanLevel,
  periodStart: LocalDate,
  periodEnd: LocalDate,
  opts?: { status?: PlanItem["status"] },
): PlanItem[] {
  const { plans } = loadEssencesData();
  return Object.values(plans)
    .filter((p) => {
      if (p.level !== level) return false;
      if (opts?.status) {
        if (p.status !== opts.status) return false;
      } else if (!isListedPlanStatus(p.status)) {
        return false;
      }
      if (!p.periodStart) return false;
      if (p.inPostponeBox) return false;
      const end = p.periodEnd ?? p.periodStart;
      return p.periodStart <= periodEnd && end >= periodStart;
    })
    .sort((a, b) => a.order - b.order);
}

/** Direct children of a plan (repository-facade wrapper around `plan-rules`). */
export function getChildPlanItems(
  parentPlanId: string,
  opts?: { status?: PlanItem["status"] },
): PlanItem[] {
  const { plans } = loadEssencesData();
  const children = childPlansOf(plans, parentPlanId);
  return opts?.status ? children.filter((c) => c.status === opts.status) : children;
}

/**
 * Derived on read — never stored as a second source of truth.
 *
 * Counts listed child PlanItems (Future → Monthly → Weekly). For a Weekly
 * parent, Daily TaskItems are the next level, so they are included too.
 * Archived / stopped children are excluded.
 */
export function getPlanProgress(parentPlanId: string): { total: number; completed: number } {
  const planChildren = getChildPlanItems(parentPlanId).filter((c) => isListedPlanStatus(c.status));
  const taskChildren = getTasksForPlan(parentPlanId).filter((t) => isListedTaskStatus(t.status));
  return {
    total: planChildren.length + taskChildren.length,
    completed:
      planChildren.filter((c) => c.status === "completed").length +
      taskChildren.filter((t) => t.status === "completed").length,
  };
}

/* ------------------------------------------------------------------ Tasks */

export function getTasksForDate(date: LocalDate): TaskItem[] {
  const { tasks } = loadEssencesData();
  return Object.values(tasks)
    .filter((t) => t.date === date && t.status !== "archived" && !t.inPostponeBox)
    .sort((a, b) => a.order - b.order);
}

/** Open + completed tasks for a local date (Daily / ToDo list). */
export function getListedTasksForDate(date: LocalDate): TaskItem[] {
  return getTasksForDate(date).filter((t) => isListedTaskStatus(t.status));
}

export function getCompletedTasksForDate(date: LocalDate): TaskItem[] {
  return getListedTasksForDate(date).filter((t) => t.status === "completed");
}

export function getOpenTasksForDate(date: LocalDate): TaskItem[] {
  return getListedTasksForDate(date).filter((t) => t.status === "open");
}

/**
 * Future-dated open TaskItems grouped by local date, newest horizon first
 * caller-chosen. Used by ToDo Upcoming — not a second task store.
 */
export function getUpcomingListedTasks(
  today: LocalDate,
  horizonDays: number,
): { date: LocalDate; tasks: TaskItem[] }[] {
  const from = addDays(today, 1);
  const to = addDays(today, horizonDays);
  const grouped = getTasksInRange(from, to);
  const days: { date: LocalDate; tasks: TaskItem[] }[] = [];
  for (const [date, tasks] of grouped) {
    const open = tasks.filter((t) => t.status === "open");
    if (open.length === 0) continue;
    days.push({ date, tasks: open });
  }
  days.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return days;
}

/** 0–100. Empty days are 0, matching the legacy Today stats card. */
export function getTaskCompletionRate(date: LocalDate): number {
  const tasks = getListedTasksForDate(date);
  if (tasks.length === 0) return 0;
  const done = tasks.filter((t) => t.status === "completed").length;
  return Math.round((done / tasks.length) * 100);
}

/**
 * Consecutive local days (ending today or yesterday) where every listed task
 * is completed. Today with 0% does not break the streak — same skip as the
 * legacy Today card, but day keys come from `local-date`, never UTC.
 */
export function getTaskStreak(today: LocalDate = todayLocalDate()): number {
  let streak = 0;
  for (let i = 0; i < 365; i++) {
    const key = addDays(today, -i);
    const tasks = getListedTasksForDate(key);
    const complete = tasks.length > 0 && tasks.every((t) => t.status === "completed");
    if (complete) streak += 1;
    else if (i === 0) continue;
    else break;
  }
  return streak;
}

/** Distinct local dates that have at least one listed task. */
export function countDaysWithListedTasks(): number {
  const dates = new Set<string>();
  for (const task of Object.values(loadEssencesData().tasks)) {
    if (isListedTaskStatus(task.status)) dates.add(task.date);
  }
  return dates.size;
}

/**
 * Past days in `[oldest, today)` that have listed tasks, newest first.
 * Used by the existing Task History sheet without redesigning it.
 */
export function getPastDaysWithListedTasks(
  today: LocalDate,
  oldest: LocalDate,
): { date: LocalDate; tasks: TaskItem[] }[] {
  const grouped = getTasksInRange(oldest, addDays(today, -1));
  const days: { date: LocalDate; tasks: TaskItem[] }[] = [];
  for (const [date, tasks] of grouped) {
    const listed = tasks.filter((t) => isListedTaskStatus(t.status));
    if (listed.length === 0) continue;
    days.push({ date, tasks: listed });
  }
  days.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return days;
}

/** Inclusive range, grouped by date key. */
export function getTasksInRange(
  from: LocalDate,
  to: LocalDate,
): Map<LocalDate, TaskItem[]> {
  const out = new Map<LocalDate, TaskItem[]>();
  for (const task of Object.values(loadEssencesData().tasks)) {
    if (task.status === "archived") continue;
    if (task.inPostponeBox) continue;
    if (task.date < from || task.date > to) continue;
    const bucket = out.get(task.date) ?? [];
    bucket.push(task);
    out.set(task.date, bucket);
  }
  for (const bucket of out.values()) bucket.sort((a, b) => a.order - b.order);
  return out;
}

/** Tasks and plans sitting in the undated Postpone Box. */
export function getPostponeBoxItems(): { tasks: TaskItem[]; plans: PlanItem[] } {
  const data = loadEssencesData();
  return {
    tasks: Object.values(data.tasks)
      .filter((t) => t.inPostponeBox && t.status !== "archived")
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)),
    plans: Object.values(data.plans)
      .filter((p) => p.inPostponeBox && p.status !== "archived")
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)),
  };
}

export function assignPostponeBoxTask(id: string, date: LocalDate): TaskItem {
  const { result } = updateEssencesData((data) => {
    const task = data.tasks[id];
    if (!task) throw new RepositoryError(`unknown task ${id}`, "task-not-found");
    if (!isValidLocalDate(date)) {
      throw new RepositoryError(`invalid local date ${date}`, "task-invalid-date");
    }
    const existing = findDuplicateTask(data, task, date);
    if (existing) {
      throw new RepositoryError(`task already exists on ${date}`, "task-duplicate-date");
    }
    const sameDay = Object.values(data.tasks).filter((t) => t.date === date && !t.inPostponeBox);
    data.tasks[id] = {
      ...task,
      date,
      inPostponeBox: false,
      order: nextOrder(sameDay),
      updatedAt: nowTimestamp(),
    };
    return data.tasks[id];
  });
  return result;
}

export function assignPostponeBoxPlan(
  id: string,
  dest: { periodStart?: LocalDate; periodEnd?: LocalDate; futureTarget?: FutureTarget },
): PlanItem {
  const { result } = updateEssencesData((data) => {
    const plan = data.plans[id];
    if (!plan) throw new RepositoryError(`unknown plan ${id}`, "plan-not-found");
    const now = nowTimestamp();
    let next: PlanItem = { ...plan, inPostponeBox: false, updatedAt: now };
    if (dest.futureTarget) {
      next = { ...next, futureTarget: dest.futureTarget };
    } else if (dest.periodStart) {
      const periodEnd =
        dest.periodEnd ??
        (plan.level === "monthly"
          ? endOfMonth(dest.periodStart)
          : endOfWeek(dest.periodStart, data.settings.weekStartsOn));
      next = { ...next, periodStart: dest.periodStart, periodEnd };
    }
    data.plans[id] = next;
    return next;
  });
  return result;
}

export function getTask(id: string): TaskItem | undefined {
  return loadEssencesData().tasks[id];
}

export function getTasksForPlan(parentPlanId: string): TaskItem[] {
  return Object.values(loadEssencesData().tasks)
    .filter((t) => t.parentPlanId === parentPlanId && !t.inPostponeBox)
    .sort((a, b) => (a.date === b.date ? a.order - b.order : a.date < b.date ? -1 : 1));
}

export interface CreateTaskInput {
  title: string;
  date: LocalDate;
  note?: string;
  startTime?: string;
  endTime?: string;
  allDay?: boolean;
  icon?: string;
  color?: string;
  parentPlanId?: string;
  seriesId?: string;
  occurrenceDate?: LocalDate;
  createdFrom?: TaskItem["createdFrom"];
  inPostponeBox?: boolean;
}

export function createTask(input: CreateTaskInput): TaskItem {
  const { result } = updateEssencesData((data) => createTaskIn(data, input));
  return result;
}

/**
 * Weekly → Daily Breakdown. Creates a TaskItem under the Weekly plan; the
 * Weekly PlanItem is never deleted or replaced.
 */
export function breakdownWeeklyToTask(
  weeklyPlanId: string,
  input: Omit<CreateTaskInput, "parentPlanId">,
): TaskItem {
  const parent = getPlanItem(weeklyPlanId);
  if (!parent) throw new RepositoryError(`unknown plan ${weeklyPlanId}`, "plan-not-found");
  if (parent.level !== "weekly") {
    throw new RepositoryError("only weekly plans break down into tasks", "plan-breakdown-invalid");
  }
  return createTask({
    ...input,
    parentPlanId: weeklyPlanId,
    createdFrom: input.createdFrom ?? "plan",
  });
}

function createTaskIn(data: EssencesDataV3, input: CreateTaskInput): TaskItem {
  if (!isValidLocalDate(input.date)) {
    throw new RepositoryError(`invalid local date ${input.date}`, "task-invalid-date");
  }
  const check = validateTaskParent(data.plans, input.parentPlanId);
  if (!check.ok) {
    throw new RepositoryError(
      `invalid task parent (${check.reason})`,
      `task-parent-${check.reason}`,
    );
  }
  if (input.parentPlanId && !input.inPostponeBox) {
    const duplicate = findDuplicateTask(
      data,
      {
        id: "",
        title: input.title,
        parentPlanId: input.parentPlanId,
        seriesId: input.seriesId,
      },
      input.date,
    );
    if (duplicate) {
      throw new RepositoryError("duplicate child task", "task-duplicate-child");
    }
  }
  const now = nowTimestamp();
  const sameDay = Object.values(data.tasks).filter((t) => t.date === input.date);
  const task: TaskItem = {
    id: newId(),
    title: input.title,
    note: input.note,
    date: input.date,
    startTime: input.startTime,
    endTime: input.endTime,
    allDay: input.allDay ?? !input.startTime,
    icon: input.icon ?? DEFAULT_TASK_ICON,
    color: input.color ?? DEFAULT_COLOR,
    parentPlanId: input.parentPlanId,
    status: "open",
    order: nextOrder(sameDay),
    seriesId: input.seriesId,
    occurrenceDate: input.occurrenceDate,
    createdAt: now,
    updatedAt: now,
    createdFrom: input.createdFrom ?? "todo",
    inPostponeBox: input.inPostponeBox,
  };
  data.tasks[task.id] = task;
  pushActivity(data, { type: "task_created", entityType: "task", entityId: task.id });
  if (task.parentPlanId && data.plans[task.parentPlanId]?.level === "weekly") {
    pushActivity(data, {
      type: "breakdown_created",
      entityType: "task",
      entityId: task.id,
    });
  }
  if (task.date > todayLocalDate()) {
    pushActivity(data, {
      type: "future_task_scheduled",
      entityType: "task",
      entityId: task.id,
    });
  }
  return task;
}

export function updateTask(id: string, patch: Partial<Omit<TaskItem, "id">>): TaskItem {
  const { result } = updateEssencesData((data) => {
    const current = data.tasks[id];
    if (!current) throw new RepositoryError(`unknown task ${id}`, "task-not-found");
    if (patch.date && !isValidLocalDate(patch.date)) {
      throw new RepositoryError(`invalid local date ${patch.date}`, "task-invalid-date");
    }
    if ("parentPlanId" in patch) {
      const check = validateTaskParent(data.plans, patch.parentPlanId);
      if (!check.ok) {
        throw new RepositoryError(
          `invalid task parent (${check.reason})`,
          `task-parent-${check.reason}`,
        );
      }
    }
    const next: TaskItem = { ...current, ...patch, id, updatedAt: nowTimestamp() };
    data.tasks[id] = next;
    return next;
  });
  return result;
}

/**
 * Sets completion on the single shared TaskItem. Daily Log, ToDo and Calendar
 * all render this same record, so no screen ever needs its own copy.
 */
export function completeTask(id: string, completed = true): TaskItem {
  const { result } = updateEssencesData((data) => {
    const current = data.tasks[id];
    if (!current) throw new RepositoryError(`unknown task ${id}`, "task-not-found");
    const now = nowTimestamp();
    const next: TaskItem = {
      ...current,
      status: completed ? "completed" : "open",
      completedAt: completed ? now : undefined,
      updatedAt: now,
    };
    data.tasks[id] = next;
    if (completed) {
      pushActivity(data, { type: "task_completed", entityType: "task", entityId: id });
    }
    return next;
  });
  return result;
}

export function archiveTask(id: string): TaskItem {
  return updateTask(id, { status: "archived" });
}

/**
 * Moves a task to another date. Refuses when an equivalent task already exists
 * there, which is what keeps reflection migration from creating duplicates.
 */
export function moveTaskToDate(id: string, toDate: LocalDate): TaskItem {
  const { result } = updateEssencesData((data) => {
    const current = data.tasks[id];
    if (!current) throw new RepositoryError(`unknown task ${id}`, "task-not-found");
    if (!isValidLocalDate(toDate)) {
      throw new RepositoryError(`invalid local date ${toDate}`, "task-invalid-date");
    }
    if (current.date === toDate) return current;
    const duplicate = findDuplicateTask(data, current, toDate);
    if (duplicate) {
      throw new RepositoryError(
        `task already exists on ${toDate}`,
        "task-duplicate-on-target-date",
      );
    }
    const sameDay = Object.values(data.tasks).filter((t) => t.date === toDate);
    const next: TaskItem = {
      ...current,
      date: toDate,
      order: nextOrder(sameDay),
      updatedAt: nowTimestamp(),
    };
    data.tasks[id] = next;
    return next;
  });
  return result;
}

function findDuplicateTask(
  data: EssencesDataV3,
  task: Pick<TaskItem, "id" | "title" | "parentPlanId" | "seriesId">,
  date: LocalDate,
): TaskItem | undefined {
  return findEquivalentTaskIn(data, task, date);
}

/** True when an equivalent open/completed task already occupies `date`. */
export function hasEquivalentTaskOn(taskId: string, date: LocalDate): boolean {
  return !!getEquivalentTaskOn(taskId, date);
}

export function getEquivalentTaskOn(taskId: string, date: LocalDate): TaskItem | undefined {
  const data = loadEssencesData();
  const task = data.tasks[taskId];
  if (!task) return undefined;
  return findEquivalentTaskIn(data, task, date);
}

/* ------------------------------------------------------------ Task series */

export function getTaskSeries(): TaskSeries[] {
  return Object.values(loadEssencesData().taskSeries).sort((a, b) =>
    a.startDate < b.startDate ? -1 : 1,
  );
}

export function getTaskSeriesById(id: string): TaskSeries | undefined {
  return loadEssencesData().taskSeries[id];
}

export function createTaskSeries(
  input: Omit<TaskSeries, "id" | "createdAt" | "updatedAt" | "active"> & { active?: boolean },
): TaskSeries {
  const { result } = updateEssencesData((data) => {
    const now = nowTimestamp();
    const series: TaskSeries = {
      ...input,
      id: newId(),
      active: input.active ?? true,
      createdAt: now,
      updatedAt: now,
    };
    data.taskSeries[series.id] = series;
    return series;
  });
  return result;
}

/**
 * Updates the Repeat Log rule only. Existing TaskItem occurrences — especially
 * completed historical ones — are never rewritten from this patch.
 */
export function updateTaskSeries(
  id: string,
  patch: Partial<Omit<TaskSeries, "id">>,
): TaskSeries {
  const { result } = updateEssencesData((data) => {
    const current = data.taskSeries[id];
    if (!current) throw new RepositoryError(`unknown series ${id}`, "series-not-found");
    const next: TaskSeries = { ...current, ...patch, id, updatedAt: nowTimestamp() };
    data.taskSeries[id] = next;
    return next;
  });
  return result;
}

/**
 * Stops future Repeat Log occurrences without deleting history.
 * Completed (and today's still-open) TaskItems stay; later open occurrences
 * are marked stopped so they leave ToDo / Calendar lists.
 */
export function stopTaskSeries(id: string): TaskSeries {
  const { result } = updateEssencesData((data) => {
    const current = data.taskSeries[id];
    if (!current) throw new RepositoryError(`unknown series ${id}`, "series-not-found");
    const now = nowTimestamp();
    const today = todayLocalDate();
    const next: TaskSeries = { ...current, active: false, updatedAt: now };
    data.taskSeries[id] = next;
    for (const task of Object.values(data.tasks)) {
      if (task.seriesId !== id) continue;
      if (task.status !== "open") continue;
      if (task.date <= today) continue;
      data.tasks[task.id] = { ...task, status: "stopped", updatedAt: now };
    }
    return next;
  });
  return result;
}

/**
 * Materialize TaskSeries occurrences inside an inclusive window.
 * Does not create unlimited future TaskItems — only dates in `[from, to]`.
 */
export function ensureSeriesOccurrencesForRange(
  from: LocalDate,
  to: LocalDate,
): TaskItem[] {
  const { result } = updateEssencesData((data) => {
    const out: TaskItem[] = [];
    for (const series of Object.values(data.taskSeries)) {
      if (!series.active) continue;
      for (const date of seriesOccurrencesInRange(series, from, to)) {
        const existing = Object.values(data.tasks).find(
          (t) => t.seriesId === series.id && (t.occurrenceDate ?? t.date) === date,
        );
        if (existing) {
          out.push(existing);
          continue;
        }
        out.push(
          createTaskIn(data, {
            title: series.title,
            note: series.note,
            date,
            startTime: series.defaultTime,
            allDay: !series.defaultTime,
            icon: series.icon,
            color: series.color,
            parentPlanId: series.parentPlanId,
            seriesId: series.id,
            occurrenceDate: date,
            createdFrom: "todo",
          }),
        );
      }
    }
    return out;
  });
  return result;
}

/**
 * Materializes one series occurrence into a real TaskItem so it can later be
 * completed, moved or cancelled on its own. Returns the existing instance when
 * the occurrence was already materialized.
 */
export function materializeSeriesOccurrence(
  seriesId: string,
  date: LocalDate,
): TaskItem {
  const { result } = updateEssencesData((data) => {
    const series = data.taskSeries[seriesId];
    if (!series) throw new RepositoryError(`unknown series ${seriesId}`, "series-not-found");
    const existing = Object.values(data.tasks).find(
      (t) => t.seriesId === seriesId && (t.occurrenceDate ?? t.date) === date,
    );
    if (existing) return existing;
    if (!seriesOccursOn(series, date)) {
      throw new RepositoryError(
        `series ${seriesId} has no occurrence on ${date}`,
        "series-no-occurrence",
      );
    }
    return createTaskIn(data, {
      title: series.title,
      note: series.note,
      date,
      startTime: series.defaultTime,
      allDay: !series.defaultTime,
      icon: series.icon,
      color: series.color,
      parentPlanId: series.parentPlanId,
      seriesId,
      occurrenceDate: date,
      createdFrom: "todo",
    });
  });
  return result;
}

/** Cancels a single occurrence without touching the rest of the series. */
export function cancelSeriesOccurrence(seriesId: string, date: LocalDate): TaskSeries {
  const { result } = updateEssencesData((data) => {
    const series = data.taskSeries[seriesId];
    if (!series) throw new RepositoryError(`unknown series ${seriesId}`, "series-not-found");
    const excludeDates = Array.from(new Set([...(series.excludeDates ?? []), date]));
    const next: TaskSeries = { ...series, excludeDates, updatedAt: nowTimestamp() };
    data.taskSeries[seriesId] = next;
    const instance = Object.values(data.tasks).find(
      (t) => t.seriesId === seriesId && (t.occurrenceDate ?? t.date) === date,
    );
    if (instance) {
      data.tasks[instance.id] = { ...instance, status: "stopped", updatedAt: next.updatedAt };
    }
    return next;
  });
  return result;
}

/* ----------------------------------------------------------------- Events */

/** Events overlapping `date`, using local wall-clock day boundaries. */
export function getEventsForDate(date: LocalDate): CalendarEventItem[] {
  return Object.values(loadEssencesData().events)
    .filter((e) => {
      if (e.status !== "scheduled") return false;
      const start = localDateOf(e.startAt);
      const end = e.endAt ? localDateOf(e.endAt) : start;
      return date >= start && date <= end;
    })
    .sort((a, b) => (a.startAt < b.startAt ? -1 : 1));
}

export function getEvent(id: string): CalendarEventItem | undefined {
  return loadEssencesData().events[id];
}

export function createEvent(
  input: Omit<CalendarEventItem, "id" | "createdAt" | "updatedAt" | "status"> & {
    status?: CalendarEventItem["status"];
  },
): CalendarEventItem {
  const { result } = updateEssencesData((data) => {
    const now = nowTimestamp();
    const event: CalendarEventItem = {
      ...input,
      id: newId(),
      status: input.status ?? "scheduled",
      createdAt: now,
      updatedAt: now,
    };
    data.events[event.id] = event;
    pushActivity(data, { type: "event_created", entityType: "event", entityId: event.id });
    return event;
  });
  return result;
}

export function updateEvent(
  id: string,
  patch: Partial<Omit<CalendarEventItem, "id">>,
): CalendarEventItem {
  const { result } = updateEssencesData((data) => {
    const current = data.events[id];
    if (!current) throw new RepositoryError(`unknown event ${id}`, "event-not-found");
    const next: CalendarEventItem = { ...current, ...patch, id, updatedAt: nowTimestamp() };
    data.events[id] = next;
    return next;
  });
  return result;
}

/* --------------------------------------------------------------- Routines */

export function getRoutines(includeInactive = false): RoutineItem[] {
  return Object.values(loadEssencesData().routines)
    .filter((r) => includeInactive || r.active)
    .sort((a, b) => a.order - b.order);
}

export function getRoutine(id: string): RoutineItem | undefined {
  return loadEssencesData().routines[id];
}

/** Prefer deactivation so RoutineCompletion history is never erased. */
export function deactivateRoutine(id: string): RoutineItem {
  return updateRoutine(id, { active: false });
}

export function createRoutine(
  input: Omit<RoutineItem, "id" | "createdAt" | "updatedAt" | "order" | "active"> & {
    active?: boolean;
  },
): RoutineItem {
  const { result } = updateEssencesData((data) => {
    const now = nowTimestamp();
    const routine: RoutineItem = {
      ...input,
      id: newId(),
      icon: input.icon ?? DEFAULT_ROUTINE_ICON,
      color: input.color ?? DEFAULT_COLOR,
      active: input.active ?? true,
      order: nextOrder(Object.values(data.routines)),
      createdAt: now,
      updatedAt: now,
    };
    data.routines[routine.id] = routine;
    pushActivity(data, {
      type: "routine_created",
      entityType: "routine",
      entityId: routine.id,
    });
    return routine;
  });
  return result;
}

export function updateRoutine(
  id: string,
  patch: Partial<Omit<RoutineItem, "id">>,
): RoutineItem {
  const { result } = updateEssencesData((data) => {
    const current = data.routines[id];
    if (!current) throw new RepositoryError(`unknown routine ${id}`, "routine-not-found");
    const next: RoutineItem = { ...current, ...patch, id, updatedAt: nowTimestamp() };
    data.routines[id] = next;
    return next;
  });
  return result;
}

/** Whether a routine is scheduled on a local date. */
export function routineOccursOn(routine: RoutineItem, date: LocalDate): boolean {
  if (!routine.active) return false;
  if (date < routine.startDate) return false;
  if (routine.endDate && date > routine.endDate) return false;
  if (routine.frequency.type === "daily") return true;
  const weekday = new Date(
    Number(date.slice(0, 4)),
    Number(date.slice(5, 7)) - 1,
    Number(date.slice(8, 10)),
  ).getDay() as Weekday;
  return routine.frequency.weekdays.includes(weekday);
}

export function getRoutinesForDate(date: LocalDate): RoutineItem[] {
  return getRoutines().filter((r) => routineOccursOn(r, date));
}

export function getRoutineCompletions(filter?: {
  date?: LocalDate;
  routineId?: string;
}): RoutineCompletion[] {
  return Object.values(loadEssencesData().routineCompletions).filter((c) => {
    if (filter?.date && c.date !== filter.date) return false;
    if (filter?.routineId && c.routineId !== filter.routineId) return false;
    return true;
  });
}

/** One completion record per (routine, date) — history is never a boolean. */
export function setRoutineCompletion(
  routineId: string,
  date: LocalDate,
  completed: boolean,
): RoutineCompletion {
  const { result } = updateEssencesData((data) => {
    if (!data.routines[routineId]) {
      throw new RepositoryError(`unknown routine ${routineId}`, "routine-not-found");
    }
    if (!isValidLocalDate(date)) {
      throw new RepositoryError(`invalid local date ${date}`, "routine-invalid-date");
    }
    const existing = Object.values(data.routineCompletions).find(
      (c) => c.routineId === routineId && c.date === date,
    );
    const now = nowTimestamp();
    const record: RoutineCompletion = {
      id: existing?.id ?? newId(),
      routineId,
      date,
      completed,
      completedAt: completed ? (existing?.completedAt ?? now) : undefined,
    };
    data.routineCompletions[record.id] = record;
    if (completed) {
      pushActivity(data, {
        type: "routine_completed",
        entityType: "routine",
        entityId: routineId,
        localDate: date,
      });
    }
    return record;
  });
  return result;
}

export function isRoutineCompletedOn(routineId: string, date: LocalDate): boolean {
  return getRoutineCompletions({ routineId, date }).some((c) => c.completed);
}

/** True when every scheduled routine for the day is completed (min. one). */
export function allRoutinesCompletedOn(date: LocalDate): boolean {
  const scheduled = getRoutinesForDate(date);
  if (scheduled.length === 0) return false;
  const completions = getRoutineCompletions({ date });
  return scheduled.every((r) =>
    completions.some((c) => c.routineId === r.id && c.completed),
  );
}

/* ------------------------------------------------------------ Reflections */

function findSessionByPeriod(
  data: EssencesDataV3,
  type: ReflectionType,
  targetPeriodStart: LocalDate,
): ReflectionSession | undefined {
  return Object.values(data.reflections).find(
    (s) => s.type === type && s.targetPeriodStart === targetPeriodStart,
  );
}

function upsertSessionIn(
  data: EssencesDataV3,
  type: ReflectionType,
  periodStart: LocalDate,
  periodEnd: LocalDate,
  now: Timestamp,
): ReflectionSession {
  const existing = findSessionByPeriod(data, type, periodStart);
  if (existing) {
    const next = withDerivedStatus(existing);
    data.reflections[existing.id] = next;
    return next;
  }
  const rule = data.settings.reflectionSchedule[type];
  const { scheduledAt, graceUntil } = scheduleAfterPeriod(type, periodStart, periodEnd, rule);
  const session: ReflectionSession = {
    id: newId(),
    type,
    targetPeriodStart: periodStart,
    targetPeriodEnd: periodEnd,
    scheduledAt,
    graceUntil,
    status: deriveReflectionStatus({ status: "scheduled", scheduledAt, graceUntil }),
    createdAt: now,
  };
  data.reflections[session.id] = session;
  return session;
}

function subjectsForSessionIn(
  data: EssencesDataV3,
  session: ReflectionSession,
): { tasks: TaskItem[]; plans: PlanItem[] } {
  const from = session.targetPeriodStart;
  const to = session.targetPeriodEnd ?? from;
  const sortPlans = (a: PlanItem, b: PlanItem) => a.order - b.order;
  const sortTasks = (a: TaskItem, b: TaskItem) =>
    a.date === b.date ? a.order - b.order : a.date < b.date ? -1 : 1;

  if (session.type === "daily") {
    return {
      tasks: Object.values(data.tasks)
        .filter((t) => t.date === from && isListedTaskStatus(t.status) && !t.inPostponeBox)
        .sort(sortTasks),
      plans: [],
    };
  }

  if (session.type === "future") {
    return {
      tasks: [],
      plans: Object.values(data.plans)
        .filter((p) => p.level === "future" && isListedPlanStatus(p.status) && !p.inPostponeBox)
        .sort(sortPlans),
    };
  }

  const level = session.type === "weekly" ? "weekly" : "monthly";
  return {
    tasks: [],
    plans: Object.values(data.plans)
      .filter((p) => {
        if (p.level !== level || !isListedPlanStatus(p.status) || !p.periodStart || p.inPostponeBox) {
          return false;
        }
        const end = p.periodEnd ?? p.periodStart;
        return p.periodStart <= to && end >= from;
      })
      .sort(sortPlans),
  };
}

function relatedTasksForPlans(data: EssencesDataV3, plans: PlanItem[]): TaskItem[] {
  const ids = new Set<string>();
  for (const plan of plans) {
    ids.add(plan.id);
    for (const child of childPlansOf(data.plans, plan.id)) ids.add(child.id);
  }
  return Object.values(data.tasks)
    .filter(
      (t) =>
        t.parentPlanId &&
        ids.has(t.parentPlanId) &&
        isListedTaskStatus(t.status) &&
        !t.inPostponeBox,
    )
    .sort((a, b) => (a.date === b.date ? a.order - b.order : a.date < b.date ? -1 : 1));
}

export function getReflections(filter?: { type?: ReflectionType }): ReflectionSession[] {
  const now = new Date();
  return Object.values(loadEssencesData().reflections)
    .filter((s) => !filter?.type || s.type === filter.type)
    .map((s) => withDerivedStatus(s, now))
    .sort((a, b) => (a.scheduledAt < b.scheduledAt ? -1 : 1));
}

/** One session, with a clock-derived status applied. */
export function getReflection(id: string): ReflectionSession | undefined {
  const session = loadEssencesData().reflections[id];
  return session ? withDerivedStatus(session) : undefined;
}

/**
 * Get-or-create a session for a type + period. Identity is
 * `(type, targetPeriodStart)` so catch-up never duplicates.
 */
export function createReflectionSession(input: {
  type: ReflectionType;
  anchorDate: LocalDate;
}): ReflectionSession {
  const { result } = updateEssencesData((data) => {
    const period = reflectionPeriod(input.type, input.anchorDate, data.settings.weekStartsOn);
    const now = nowTimestamp();
    return upsertSessionIn(data, input.type, period.start, period.end ?? period.start, now);
  });
  return result;
}

/**
 * Lazily materializes the *recent* window so a week away still surfaces
 * overdue reviews. Older unfinished periods are summarized instead of
 * being created as hundreds of Daily rows — see getReflectionCatchUpSummary.
 */
export function ensureReflectionSessions(now: Date = new Date()): ReflectionSession[] {
  const { result } = updateEssencesData((data) => {
    const today = todayLocalDate(now);
    const weekStartsOn = data.settings.weekStartsOn;
    const stamp = nowTimestamp(now);

    for (const date of eachLocalDate(addDays(today, -REFLECTION_RECENT_DAILY_DAYS), today)) {
      upsertSessionIn(data, "daily", date, date, stamp);
    }

    const firstWeek = recentWeeklyFrom(today, weekStartsOn);
    const lastWeek = startOfWeek(today, weekStartsOn);
    for (const start of eachLocalDate(firstWeek, lastWeek)) {
      if (start !== startOfWeek(start, weekStartsOn)) continue;
      upsertSessionIn(data, "weekly", start, endOfWeek(start, weekStartsOn), stamp);
    }

    for (let i = 0; i <= REFLECTION_RECENT_MONTHS; i += 1) {
      const monthStart = startOfMonth(addMonths(today, -i));
      const monthEnd = endOfMonth(monthStart);
      upsertSessionIn(data, "monthly", monthStart, monthEnd, stamp);
      upsertSessionIn(data, "future", monthStart, monthEnd, stamp);
    }

    return Object.values(data.reflections).map((s) => withDerivedStatus(s, now));
  });
  return result.sort((a, b) => (a.scheduledAt < b.scheduledAt ? -1 : 1));
}

export function getAttentionReflections(): ReflectionSession[] {
  return getReflections().filter((s) => s.status === "due" || s.status === "overdue");
}

/** Due / overdue sessions inside the recent materialization window. */
export function getRecentAttentionReflections(now: Date = new Date()): ReflectionSession[] {
  const today = todayLocalDate(now);
  const weekStartsOn = loadEssencesData().settings.weekStartsOn;
  return getAttentionReflections().filter((s) =>
    isRecentReflectionPeriod(s.type, s.targetPeriodStart, today, weekStartsOn),
  );
}

export function getReflectionCatchUpSummary(now: Date = new Date()): ReflectionCatchUpSummary {
  return summarizeReflectionCatchUp(loadEssencesData(), now);
}

/**
 * Badge count: recent due/overdue sessions plus collapsed older periods.
 */
export function getReflectionAttentionCount(now: Date = new Date()): number {
  ensureReflectionSessions(now);
  return getRecentAttentionReflections(now).length + getReflectionCatchUpSummary(now).totalPending;
}

/**
 * Materializes one ordinary session per collapsed pending period so a review
 * can start. Does not create empty calendar days.
 */
export function ensureCatchUpSessions(
  type: ReflectionType,
  now: Date = new Date(),
): ReflectionSession[] {
  const { result } = updateEssencesData((data) => {
    const summary = summarizeReflectionCatchUp(data, now);
    const group = catchUpBucket(summary, type);
    if (!group) return [] as ReflectionSession[];
    const stamp = nowTimestamp(now);
    const weekStartsOn = data.settings.weekStartsOn;
    return group.periodStarts.map((start) => {
      const period = reflectionPeriod(type, start, weekStartsOn);
      return upsertSessionIn(data, type, period.start, period.end ?? period.start, stamp);
    });
  });
  return result;
}

/** Opens every collapsed pending session of `type` so review can begin. */
export function startCatchUpReview(
  type: ReflectionType,
  now: Date = new Date(),
): ReflectionSession[] {
  return ensureCatchUpSessions(type, now).map((session) => startReflectionSession(session.id));
}

/**
 * Skip older pending reviews of `type`. Never deletes Plan / Task data.
 */
export function skipCatchUpReflections(
  type: ReflectionType,
  now: Date = new Date(),
): ReflectionSession[] {
  return ensureCatchUpSessions(type, now).map((session) => skipReflectionSession(session.id));
}

export type { ReflectionCatchUpSummary, ReflectionCatchUpBucket };

/** Persists the status refresh so callers observe a stable session. */
export function refreshReflectionStatus(id: string): ReflectionSession {
  const { result } = updateEssencesData((data) => {
    const current = data.reflections[id];
    if (!current) throw new RepositoryError(`unknown reflection ${id}`, "reflection-not-found");
    const next = withDerivedStatus(current);
    data.reflections[id] = next;
    return next;
  });
  return result;
}

export function startReflectionSession(id: string): ReflectionSession {
  const { result } = updateEssencesData((data) => {
    const current = data.reflections[id];
    if (!current) throw new RepositoryError(`unknown reflection ${id}`, "reflection-not-found");
    const next = startReflection(current);
    data.reflections[id] = next;
    return next;
  });
  return result;
}

/**
 * Skip means "I am not doing this review." It never deletes Plan / Task data.
 */
export function skipReflectionSession(id: string): ReflectionSession {
  const { result } = updateEssencesData((data) => {
    const current = data.reflections[id];
    if (!current) throw new RepositoryError(`unknown reflection ${id}`, "reflection-not-found");
    const next = skipReflection(current);
    data.reflections[id] = next;
    return next;
  });
  return result;
}

export function completeReflectionSession(id: string): ReflectionSession {
  const { result } = updateEssencesData((data) => {
    const current = data.reflections[id];
    if (!current) throw new RepositoryError(`unknown reflection ${id}`, "reflection-not-found");
    if (current.status === "skipped") {
      throw new RepositoryError("skipped reflection cannot be completed", "reflection-skipped");
    }
    const { tasks, plans } = subjectsForSessionIn(data, current);
    const decided = new Set(
      Object.values(data.reflectionDecisions)
        .filter((d) => d.reflectionSessionId === id)
        .map((d) => d.subjectId),
    );
    const missing = [...tasks.map((t) => t.id), ...plans.map((p) => p.id)].filter(
      (sid) => !decided.has(sid),
    );
    if (missing.length > 0) {
      throw new RepositoryError(
        "every subject needs a Keep / Postpone / Stop decision",
        "reflection-incomplete",
      );
    }
    const next = completeReflection(current);
    data.reflections[id] = next;
    pushActivity(data, {
      type: "reflection_completed",
      entityType: "reflection",
      entityId: id,
      metadata: { reflectionType: next.type },
    });
    return next;
  });
  return result;
}

export function getReflectionDecisions(sessionId?: string): ReflectionDecision[] {
  return Object.values(loadEssencesData().reflectionDecisions)
    .filter((d) => !sessionId || d.reflectionSessionId === sessionId)
    .sort((a, b) => (a.decidedAt < b.decidedAt ? -1 : 1));
}

export interface CreateReflectionDecisionInput {
  reflectionSessionId: string;
  subjectType: ReflectionDecision["subjectType"];
  subjectId: string;
  decision: ReflectionDecisionType;
  toLevel?: PlanLevel;
  toDate?: LocalDate;
  periodEnd?: LocalDate;
  futureTarget?: FutureTarget;
  collectionId?: string;
  /** Postpone without a date — send the subject to the Postpone Box. */
  toBox?: boolean;
}

function moveOpenTaskToDate(
  data: EssencesDataV3,
  task: TaskItem,
  toDate: LocalDate,
  now: Timestamp,
): void {
  const existing = findDuplicateTask(data, task, toDate);
  if (existing) {
    data.tasks[task.id] = { ...task, status: "stopped", updatedAt: now };
    return;
  }
  const sameDay = Object.values(data.tasks).filter((t) => t.date === toDate && !t.inPostponeBox);
  data.tasks[task.id] = {
    ...task,
    date: toDate,
    inPostponeBox: false,
    order: nextOrder(sameDay),
    updatedAt: now,
  };
}

function putTaskInPostponeBox(data: EssencesDataV3, task: TaskItem, now: Timestamp): void {
  if (task.status === "completed") {
    createTaskIn(data, {
      title: task.title,
      date: task.date,
      note: task.note,
      icon: task.icon,
      color: task.color,
      parentPlanId: task.parentPlanId,
      createdFrom: "reflection",
      inPostponeBox: true,
    });
    return;
  }
  data.tasks[task.id] = { ...task, inPostponeBox: true, updatedAt: now };
}

function applyKeepToOpenTask(
  data: EssencesDataV3,
  session: ReflectionSession,
  task: TaskItem,
  decision: ReflectionDecision,
  now: Timestamp,
): void {
  if (task.status !== "open") return;
  const toDate = keepCarryDate(session);
  if (task.date === toDate) return;
  decision.toDate = toDate;
  moveOpenTaskToDate(data, task, toDate, now);
}

function applyKeepToActivePlan(
  data: EssencesDataV3,
  session: ReflectionSession,
  plan: PlanItem,
  decision: ReflectionDecision,
  now: Timestamp,
): void {
  if (plan.status !== "active") return;
  const toDate = keepCarryDate(session);
  if (plan.level === "future") {
    if (!plan.futureTarget || plan.futureTarget.type === "someday") return;
    const futureTarget: FutureTarget =
      plan.futureTarget.type === "date"
        ? { type: "date", value: toDate }
        : { type: "month", value: toDate.slice(0, 7) };
    const delta = postponeDeltaDays(plan, { futureTarget });
    if (postponeShiftsDescendants(plan, { futureTarget })) {
      shiftPlanSubtree(data, plan.id, delta, now);
    }
    data.plans[plan.id] = { ...data.plans[plan.id], futureTarget, updatedAt: now };
    decision.toDate = toDate;
    return;
  }
  if (!plan.periodStart) return;
  if (plan.periodStart === toDate) return;
  const nextEnd =
    plan.level === "monthly"
      ? endOfMonth(toDate)
      : endOfWeek(toDate, data.settings.weekStartsOn);
  const delta = postponeDeltaDays(plan, { periodStart: toDate });
  if (postponeShiftsDescendants(plan, { periodStart: toDate })) {
    shiftPlanSubtree(data, plan.id, delta, now);
  }
  data.plans[plan.id] = {
    ...data.plans[plan.id],
    periodStart: toDate,
    periodEnd: nextEnd,
    updatedAt: now,
  };
  decision.toDate = toDate;
}

/**
 * Records a review decision and applies its side effect.
 *
 * Completion and the decision are independent. Postpone of a completed task
 * keeps the completed row and creates (or reuses) an open follow-up.
 */
export function createReflectionDecision(
  input: CreateReflectionDecisionInput,
): ReflectionDecision {
  const { result } = updateEssencesData((data) => {
    const session = data.reflections[input.reflectionSessionId];
    if (!session) {
      throw new RepositoryError(
        `unknown reflection ${input.reflectionSessionId}`,
        "reflection-not-found",
      );
    }

    const now = nowTimestamp();
    const previous = Object.values(data.reflectionDecisions).find(
      (d) =>
        d.reflectionSessionId === input.reflectionSessionId && d.subjectId === input.subjectId,
    );
    const decision: ReflectionDecision = {
      id: previous?.id ?? newId(),
      reflectionSessionId: input.reflectionSessionId,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      decision: input.decision,
      collectionId: input.collectionId,
      decidedAt: now,
      toBox: input.toBox ? true : undefined,
    };

    if (input.subjectType === "task") {
      const task = data.tasks[input.subjectId];
      if (!task) throw new RepositoryError(`unknown task ${input.subjectId}`, "task-not-found");
      decision.fromDate = previous?.fromDate ?? task.date;

      if (input.decision === "keep") {
        applyKeepToOpenTask(data, session, task, decision, now);
      } else if (input.decision === "postpone") {
        if (input.toBox) {
          putTaskInPostponeBox(data, task, now);
        } else {
          const toDate = input.toDate;
          if (!toDate || !isValidLocalDate(toDate)) {
            throw new RepositoryError("postpone requires a valid toDate", "decision-missing-date");
          }
          decision.toDate = toDate;
          const existing = findDuplicateTask(data, task, toDate);
          if (existing) {
            if (task.status === "open") {
              data.tasks[task.id] = { ...task, status: "stopped", updatedAt: now };
            }
          } else if (task.status === "completed") {
            createTaskIn(data, {
              title: task.title,
              date: toDate,
              note: task.note,
              icon: task.icon,
              color: task.color,
              parentPlanId: task.parentPlanId,
              createdFrom: "reflection",
            });
          } else {
            moveOpenTaskToDate(data, task, toDate, now);
          }
        }
      } else if (input.decision === "stop") {
        if (task.status !== "completed") {
          data.tasks[task.id] = { ...task, status: "stopped", updatedAt: now };
        }
      }
    } else {
      const plan = data.plans[input.subjectId];
      if (!plan) throw new RepositoryError(`unknown plan ${input.subjectId}`, "plan-not-found");
      decision.fromLevel = plan.level;
      decision.toLevel = input.toLevel ?? plan.level;

      if (input.decision === "keep") {
        applyKeepToActivePlan(data, session, plan, decision, now);
      } else if (input.decision === "postpone") {
        if (input.toBox) {
          data.plans[plan.id] = { ...plan, inPostponeBox: true, updatedAt: now };
        } else if (plan.level === "future") {
          const futureTarget = input.futureTarget;
          if (!futureTarget) {
            throw new RepositoryError(
              "future postpone requires a target",
              "decision-missing-target",
            );
          }
          const delta = postponeDeltaDays(plan, { futureTarget });
          if (postponeShiftsDescendants(plan, { futureTarget })) {
            shiftPlanSubtree(data, plan.id, delta, now);
          }
          data.plans[plan.id] = {
            ...data.plans[plan.id],
            futureTarget,
            updatedAt: now,
          };
          decision.toDate =
            futureTarget.type === "date"
              ? futureTarget.value
              : futureTarget.type === "month" && futureTarget.value
                ? `${futureTarget.value}-01`
                : undefined;
        } else {
          const toDate = input.toDate;
          if (!toDate || !isValidLocalDate(toDate)) {
            throw new RepositoryError("postpone requires a valid toDate", "decision-missing-date");
          }
          const periodEnd =
            input.periodEnd ??
            (plan.level === "monthly"
              ? endOfMonth(toDate)
              : endOfWeek(toDate, data.settings.weekStartsOn));
          const delta = postponeDeltaDays(plan, { periodStart: toDate });
          if (postponeShiftsDescendants(plan, { periodStart: toDate })) {
            shiftPlanSubtree(data, plan.id, delta, now);
          }
          data.plans[plan.id] = {
            ...data.plans[plan.id],
            periodStart: toDate,
            periodEnd,
            updatedAt: now,
          };
          decision.toDate = toDate;
        }
      } else if (input.decision === "stop") {
        if (!input.collectionId) {
          stopPlanSubtree(data, plan.id, now);
        }
      }
    }

    data.reflectionDecisions[decision.id] = decision;
    return decision;
  });
  return result;
}

export function postponePlanItem(
  id: string,
  dest: { periodStart?: LocalDate; periodEnd?: LocalDate; futureTarget?: FutureTarget },
): PlanItem {
  const { result } = updateEssencesData((data) => {
    const plan = data.plans[id];
    if (!plan) throw new RepositoryError(`unknown plan ${id}`, "plan-not-found");
    const now = nowTimestamp();
    if (dest.futureTarget) {
      if (postponeShiftsDescendants(plan, { futureTarget: dest.futureTarget })) {
        const delta = postponeDeltaDays(plan, { futureTarget: dest.futureTarget });
        shiftPlanSubtree(data, id, delta, now);
      }
      data.plans[id] = { ...data.plans[id], futureTarget: dest.futureTarget, updatedAt: now };
    } else if (dest.periodStart) {
      const periodEnd =
        dest.periodEnd ??
        (plan.level === "monthly"
          ? endOfMonth(dest.periodStart)
          : endOfWeek(dest.periodStart, data.settings.weekStartsOn));
      if (postponeShiftsDescendants(plan, { periodStart: dest.periodStart })) {
        const delta = postponeDeltaDays(plan, { periodStart: dest.periodStart });
        shiftPlanSubtree(data, id, delta, now);
      }
      data.plans[id] = {
        ...data.plans[id],
        periodStart: dest.periodStart,
        periodEnd,
        updatedAt: now,
      };
    }
    return data.plans[id];
  });
  return result;
}

/**
 * Context for a reflection session.
 *
 * Tasks and Plans are review SUBJECTS. Events are context only.
 * Weekly / Monthly related tasks are available on demand, not as subjects.
 */
export function getReflectionContext(sessionId: string): {
  session: ReflectionSession;
  tasks: TaskItem[];
  plans: PlanItem[];
  relatedTasks: TaskItem[];
  relatedPlans: PlanItem[];
  events: CalendarEventItem[];
} {
  const data = loadEssencesData();
  const raw = data.reflections[sessionId];
  if (!raw) throw new RepositoryError(`unknown reflection ${sessionId}`, "reflection-not-found");
  const session = withDerivedStatus(raw);
  const from = session.targetPeriodStart;
  const to = session.targetPeriodEnd ?? session.targetPeriodStart;
  const { tasks, plans } = subjectsForSessionIn(data, session);
  const relatedTasks = relatedTasksForPlans(data, plans);
  const relatedPlans = plans.flatMap((p) =>
    childPlansOf(data.plans, p.id).filter((c) => isListedPlanStatus(c.status)),
  );

  const events = Object.values(data.events).filter((e) => {
    if (e.status !== "scheduled") return false;
    const start = localDateOf(e.startAt);
    const end = e.endAt ? localDateOf(e.endAt) : start;
    return start <= to && end >= from;
  });

  return { session, tasks, plans, relatedTasks, relatedPlans, events };
}

export function updateReflectionSchedule(
  patch: Partial<ReflectionScheduleSettings>,
): ReflectionScheduleSettings {
  const { result } = updateEssencesData((data) => {
    const current = data.settings.reflectionSchedule;
    data.settings = {
      ...data.settings,
      reflectionSchedule: {
        daily: { ...current.daily, ...patch.daily },
        weekly: { ...current.weekly, ...patch.weekly },
        monthly: { ...current.monthly, ...patch.monthly },
        future: { ...current.future, ...patch.future },
      },
    };
    return data.settings.reflectionSchedule;
  });
  return result;
}

/* ----------------------------------------------------- Notes and capture */

export function getNotes(): NotePage[] {
  return Object.values(loadEssencesData().notes).sort((a, b) =>
    a.updatedAt < b.updatedAt ? 1 : -1,
  );
}

export function getNote(id: string): NotePage | undefined {
  return loadEssencesData().notes[id];
}

export function createNote(
  input: Partial<Omit<NotePage, "id" | "createdAt" | "updatedAt">> = {},
): NotePage {
  const { result } = updateEssencesData((data) => {
    const now = nowTimestamp();
    const collectionIds = [...new Set(input.collectionIds ?? [])].filter(
      (cid) => !!data.collections[cid],
    );
    const note: NotePage = {
      id: newId(),
      title: input.title ?? "",
      html: input.html ?? "",
      image: rejectInlineImage(input.image),
      collectionIds,
      createdAt: now,
      updatedAt: now,
      legacySource: input.legacySource,
    };
    data.notes[note.id] = note;
    for (const collectionId of collectionIds) {
      linkNoteEntry(data, collectionId, note.id, now);
    }
    return note;
  });
  return result;
}

export function updateNote(id: string, patch: Partial<Omit<NotePage, "id">>): NotePage {
  const { result } = updateEssencesData((data) => {
    const current = data.notes[id];
    if (!current) throw new RepositoryError(`unknown note ${id}`, "note-not-found");
    const next: NotePage = {
      ...current,
      ...patch,
      id,
      image: "image" in patch ? rejectInlineImage(patch.image) : current.image,
      legacySource: patch.legacySource ?? current.legacySource,
      updatedAt: nowTimestamp(),
    };
    data.notes[id] = next;
    pushActivity(data, { type: "note_edited", entityType: "note", entityId: id });
    return next;
  });
  return result;
}

export function deleteNote(id: string): void {
  updateEssencesData((data) => {
    if (!data.notes[id]) throw new RepositoryError(`unknown note ${id}`, "note-not-found");
    delete data.notes[id];
    for (const [entryId, entry] of Object.entries(data.collectionEntries)) {
      if (entry.noteId === id) delete data.collectionEntries[entryId];
    }
  });
}

export function getQuickMemos(status?: QuickMemo["status"]): QuickMemo[] {
  return Object.values(loadEssencesData().quickMemos)
    .filter((m) => !status || m.status === status)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function getQuickMemo(id: string): QuickMemo | undefined {
  return loadEssencesData().quickMemos[id];
}

export function createQuickMemo(
  input: Pick<QuickMemo, "text"> & Partial<Pick<QuickMemo, "image">>,
): QuickMemo {
  const { result } = updateEssencesData((data) => {
    const now = nowTimestamp();
    const memo: QuickMemo = {
      id: newId(),
      text: input.text,
      image: rejectInlineImage(input.image),
      status: "inbox",
      createdAt: now,
      updatedAt: now,
    };
    data.quickMemos[memo.id] = memo;
    pushActivity(data, {
      type: "quick_memo_created",
      entityType: "quickMemo",
      entityId: memo.id,
    });
    return memo;
  });
  return result;
}

export function updateQuickMemo(
  id: string,
  patch: Partial<Pick<QuickMemo, "text" | "image" | "status">>,
): QuickMemo {
  const { result } = updateEssencesData((data) => {
    const current = data.quickMemos[id];
    if (!current) throw new RepositoryError(`unknown quick memo ${id}`, "quick-memo-not-found");
    const next: QuickMemo = {
      ...current,
      ...patch,
      id,
      image: "image" in patch ? rejectInlineImage(patch.image) : current.image,
      updatedAt: nowTimestamp(),
    };
    data.quickMemos[id] = next;
    return next;
  });
  return result;
}

export function deleteQuickMemo(id: string): void {
  updateEssencesData((data) => {
    if (!data.quickMemos[id]) {
      throw new RepositoryError(`unknown quick memo ${id}`, "quick-memo-not-found");
    }
    delete data.quickMemos[id];
    for (const [entryId, entry] of Object.entries(data.collectionEntries)) {
      if (entry.quickMemoId === id) delete data.collectionEntries[entryId];
    }
  });
}

export function archiveQuickMemo(id: string): QuickMemo {
  return updateQuickMemo(id, { status: "archived" });
}

function escapePlainTextAsHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\n/g, "<br>");
}

type QuickMemoTargetType = QuickMemoConvertedType;

function titleFromQuickMemoText(text: string): string {
  const line = text.trim().split("\n")[0]?.trim() ?? "";
  return line.slice(0, 120) || "Quick Memo";
}

function conversionEntityExists(
  data: EssencesDataV3,
  type: QuickMemoTargetType,
  targetId: string,
): boolean {
  if (type === "task") {
    const task = data.tasks[targetId];
    return !!task && task.status !== "archived";
  }
  if (type === "plan") {
    const plan = data.plans[targetId];
    return !!plan && plan.status !== "archived";
  }
  if (type === "event") {
    const event = data.events[targetId];
    return !!event && event.status !== "cancelled" && event.status !== "archived";
  }
  if (type === "note") return !!data.notes[targetId];
  if (type === "collection") {
    const collection = data.collections[targetId];
    return !!collection && !collection.archivedAt;
  }
  return false;
}

function findQuickMemoConversionIdIn(
  data: EssencesDataV3,
  memoId: string,
  type: QuickMemoTargetType,
): string | undefined {
  const memo = data.quickMemos[memoId];
  if (!memo) return undefined;
  const targets = convertedTargetsOf(memo);
  const fromTargets = targets[type];
  if (fromTargets && conversionEntityExists(data, type, fromTargets)) {
    return fromTargets;
  }
  if (
    memo.convertedToType === type &&
    memo.convertedToId &&
    conversionEntityExists(data, type, memo.convertedToId)
  ) {
    return memo.convertedToId;
  }
  for (const record of Object.values(data.activityRecords)) {
    if (record.type !== "quick_memo_converted") continue;
    if (record.metadata?.quickMemoId !== memoId) continue;
    if (record.metadata?.targetType !== type) continue;
    const entityId = record.entityId;
    if (entityId && conversionEntityExists(data, type, entityId)) return entityId;
  }
  return undefined;
}

function attachQuickMemoConversion(
  data: EssencesDataV3,
  memo: QuickMemo,
  type: QuickMemoTargetType,
  targetId: string,
): QuickMemo {
  const now = nowTimestamp();
  const convertedTargets = { ...convertedTargetsOf(memo), [type]: targetId };
  const next: QuickMemo = {
    ...memo,
    status: memo.status === "archived" ? "archived" : "inbox",
    convertedTargets,
    convertedToType: type,
    convertedToId: targetId,
    convertedAt: now,
    updatedAt: now,
  };
  data.quickMemos[memo.id] = next;
  pushActivity(data, {
    type: "quick_memo_converted",
    entityType: type,
    entityId: targetId,
    metadata: { quickMemoId: memo.id, targetType: type },
  });
  return next;
}

export function getQuickMemoConversion(
  memoId: string,
  type: QuickMemoTargetType,
): string | undefined {
  return findQuickMemoConversionIdIn(loadEssencesData(), memoId, type);
}

export function convertQuickMemoToNote(id: string): { note: NotePage; memo: QuickMemo } {
  const { result } = updateEssencesData((data) => {
    const current = data.quickMemos[id];
    if (!current) throw new RepositoryError(`unknown quick memo ${id}`, "quick-memo-not-found");
    const existingId = findQuickMemoConversionIdIn(data, id, "note");
    if (existingId) {
      const existing = data.notes[existingId];
      if (existing) return { note: existing, memo: current };
    }
    const now = nowTimestamp();
    const note: NotePage = {
      id: newId(),
      title: "",
      html: current.text.trim() ? `<div>${escapePlainTextAsHtml(current.text)}</div>` : "",
      image: current.image,
      collectionIds: [],
      createdAt: now,
      updatedAt: now,
    };
    data.notes[note.id] = note;
    const memo = attachQuickMemoConversion(data, current, "note", note.id);
    return { note, memo };
  });
  return result;
}

export function convertQuickMemoToTask(
  id: string,
  input: Omit<CreateTaskInput, "createdFrom" | "title"> & { title?: string },
): { task: TaskItem; memo: QuickMemo } {
  const { result } = updateEssencesData((data) => {
    const current = data.quickMemos[id];
    if (!current) throw new RepositoryError(`unknown quick memo ${id}`, "quick-memo-not-found");
    const existingId = findQuickMemoConversionIdIn(data, id, "task");
    if (existingId) {
      const existing = data.tasks[existingId];
      if (existing) return { task: existing, memo: current };
    }
    const title = (input.title ?? titleFromQuickMemoText(current.text)).trim();
    const task = createTaskIn(data, {
      ...input,
      title,
      note: input.note ?? (current.text.trim() ? current.text : undefined),
      createdFrom: "quickMemo",
    });
    const memo = attachQuickMemoConversion(data, current, "task", task.id);
    return { task, memo };
  });
  return result;
}

export function convertQuickMemoToPlan(
  id: string,
  input: Omit<CreatePlanInput, "createdFrom" | "title"> & { title?: string },
): { plan: PlanItem; memo: QuickMemo } {
  const { result } = updateEssencesData((data) => {
    const current = data.quickMemos[id];
    if (!current) throw new RepositoryError(`unknown quick memo ${id}`, "quick-memo-not-found");
    if (input.level === "weekly" && !data.settings.weeklyPlanningEnabled) {
      throw new RepositoryError("weekly planning is off", "plan-weekly-disabled");
    }
    const existingId = findQuickMemoConversionIdIn(data, id, "plan");
    if (existingId) {
      const existing = data.plans[existingId];
      if (existing) return { plan: existing, memo: current };
    }
    const title = (input.title ?? titleFromQuickMemoText(current.text)).trim();
    const check = validatePlanParent(data.plans, input.level, undefined, input.parentPlanId);
    if (!check.ok) {
      throw new RepositoryError(
        `invalid plan parent (${check.reason})`,
        `plan-parent-${check.reason}`,
      );
    }
    if (
      isDuplicateChildPlan(data.plans, {
        level: input.level,
        title,
        parentPlanId: input.parentPlanId,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
      })
    ) {
      throw new RepositoryError("duplicate child plan", "plan-duplicate-child");
    }
    const now = nowTimestamp();
    const siblings = Object.values(data.plans).filter(
      (p) => p.parentPlanId === input.parentPlanId && p.level === input.level,
    );
    const plan: PlanItem = {
      id: newId(),
      level: input.level,
      title,
      note: input.note ?? (current.text.trim() ? current.text : undefined),
      icon: input.icon ?? DEFAULT_PLAN_ICON,
      color: input.color ?? DEFAULT_COLOR,
      parentPlanId: input.parentPlanId,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      futureTarget: input.futureTarget,
      status: "active",
      order: nextOrder(siblings),
      createdAt: now,
      updatedAt: now,
      createdFrom: "quickMemo",
    };
    data.plans[plan.id] = plan;
    pushActivity(data, {
      type: input.parentPlanId ? "breakdown_created" : "plan_updated",
      entityType: "plan",
      entityId: plan.id,
    });
    const memo = attachQuickMemoConversion(data, current, "plan", plan.id);
    return { plan, memo };
  });
  return result;
}

export function convertQuickMemoToEvent(
  id: string,
  input: {
    title?: string;
    note?: string;
    date: LocalDate;
    startTime?: string;
    endTime?: string;
    allDay?: boolean;
  },
): { event: CalendarEventItem; memo: QuickMemo } {
  const { result } = updateEssencesData((data) => {
    const current = data.quickMemos[id];
    if (!current) throw new RepositoryError(`unknown quick memo ${id}`, "quick-memo-not-found");
    if (!isValidLocalDate(input.date)) {
      throw new RepositoryError(`invalid local date ${input.date}`, "event-invalid-date");
    }
    const existingId = findQuickMemoConversionIdIn(data, id, "event");
    if (existingId) {
      const existing = data.events[existingId];
      if (existing) return { event: existing, memo: current };
    }
    const allDay = input.allDay ?? !input.startTime;
    const startClock = allDay ? "00:00" : input.startTime || "00:00";
    const now = nowTimestamp();
    const event: CalendarEventItem = {
      title: (input.title ?? titleFromQuickMemoText(current.text)).trim() || "Quick Memo",
      note: input.note ?? (current.text.trim() ? current.text : undefined),
      startAt: `${input.date}T${startClock}`,
      endAt: !allDay && input.endTime ? `${input.date}T${input.endTime}` : undefined,
      allDay,
      status: "scheduled",
      id: newId(),
      createdAt: now,
      updatedAt: now,
      createdFrom: "quickMemo",
    };
    data.events[event.id] = event;
    pushActivity(data, { type: "event_created", entityType: "event", entityId: event.id });
    const memo = attachQuickMemoConversion(data, current, "event", event.id);
    return { event, memo };
  });
  return result;
}

/** Records conversion metadata. Keeps the original Quick Memo in the inbox. */
export function markQuickMemoConverted(
  id: string,
  target: { type: NonNullable<QuickMemo["convertedToType"]>; id: string },
): QuickMemo {
  const { result } = updateEssencesData((data) => {
    const current = data.quickMemos[id];
    if (!current) throw new RepositoryError(`unknown quick memo ${id}`, "quick-memo-not-found");
    const existingId = findQuickMemoConversionIdIn(data, id, target.type);
    if (existingId === target.id) {
      return data.quickMemos[id];
    }
    return attachQuickMemoConversion(data, current, target.type, target.id);
  });
  return result;
}

/* ------------------------------------------------------------ Collections */

export function getCollections(): Collection[] {
  return Object.values(loadEssencesData().collections).sort((a, b) =>
    a.createdAt < b.createdAt ? -1 : 1,
  );
}

export function getCollectionEntries(collectionId: string): CollectionEntry[] {
  return Object.values(loadEssencesData().collectionEntries)
    .filter((e) => e.collectionId === collectionId)
    .sort((a, b) => a.order - b.order);
}

export function getCollection(id: string): Collection | undefined {
  return loadEssencesData().collections[id];
}

export function createCollection(
  input: Pick<Collection, "name"> & Partial<Pick<Collection, "icon" | "color">>,
): Collection {
  const { result } = updateEssencesData((data) => {
    const now = nowTimestamp();
    const collection: Collection = {
      id: newId(),
      name: input.name,
      icon: input.icon,
      color: input.color,
      createdAt: now,
      updatedAt: now,
    };
    data.collections[collection.id] = collection;
    return collection;
  });
  return result;
}

export function renameCollection(id: string, name: string): Collection {
  const { result } = updateEssencesData((data) => {
    const current = data.collections[id];
    if (!current) throw new RepositoryError(`unknown collection ${id}`, "collection-not-found");
    const next: Collection = { ...current, name, updatedAt: nowTimestamp() };
    data.collections[id] = next;
    return next;
  });
  return result;
}

export function archiveCollection(id: string): Collection {
  const { result } = updateEssencesData((data) => {
    const current = data.collections[id];
    if (!current) throw new RepositoryError(`unknown collection ${id}`, "collection-not-found");
    const now = nowTimestamp();
    const next: Collection = { ...current, archivedAt: now, updatedAt: now };
    data.collections[id] = next;
    return next;
  });
  return result;
}

export function deleteCollection(id: string): void {
  updateEssencesData((data) => {
    if (!data.collections[id]) {
      throw new RepositoryError(`unknown collection ${id}`, "collection-not-found");
    }
    delete data.collections[id];
    for (const [entryId, entry] of Object.entries(data.collectionEntries)) {
      if (entry.collectionId === id) delete data.collectionEntries[entryId];
    }
    for (const note of Object.values(data.notes)) {
      if (!note.collectionIds.includes(id)) continue;
      data.notes[note.id] = {
        ...note,
        collectionIds: note.collectionIds.filter((cid) => cid !== id),
        updatedAt: nowTimestamp(),
      };
    }
  });
}

export function addCollectionEntry(
  input: Omit<CollectionEntry, "id" | "order" | "createdAt"> & { order?: number },
): CollectionEntry {
  const { result } = updateEssencesData((data) => {
    if (!data.collections[input.collectionId]) {
      throw new RepositoryError(
        `unknown collection ${input.collectionId}`,
        "collection-not-found",
      );
    }
    const now = nowTimestamp();
    if (input.type === "note" && input.noteId) {
      return linkNoteEntry(data, input.collectionId, input.noteId, now, input.order);
    }
    if (input.type === "quickMemo" && input.quickMemoId) {
      return linkQuickMemoEntry(data, input.collectionId, input.quickMemoId, now, input.order);
    }
    const siblings = Object.values(data.collectionEntries).filter(
      (e) => e.collectionId === input.collectionId,
    );
    const entry: CollectionEntry = {
      ...input,
      id: newId(),
      order: input.order ?? nextOrder(siblings),
      createdAt: now,
    };
    data.collectionEntries[entry.id] = entry;
    return entry;
  });
  return result;
}

export function addNoteToCollection(collectionId: string, noteId: string): CollectionEntry {
  const { result } = updateEssencesData((data) => {
    if (!data.collections[collectionId]) {
      throw new RepositoryError(`unknown collection ${collectionId}`, "collection-not-found");
    }
    if (!data.notes[noteId]) {
      throw new RepositoryError(`unknown note ${noteId}`, "note-not-found");
    }
    return linkNoteEntry(data, collectionId, noteId, nowTimestamp());
  });
  return result;
}

export function addQuickMemoToCollection(
  collectionId: string,
  quickMemoId: string,
): CollectionEntry {
  const { result } = updateEssencesData((data) => {
    if (!data.collections[collectionId]) {
      throw new RepositoryError(`unknown collection ${collectionId}`, "collection-not-found");
    }
    if (!data.quickMemos[quickMemoId]) {
      throw new RepositoryError(`unknown quick memo ${quickMemoId}`, "quick-memo-not-found");
    }
    return linkQuickMemoEntry(data, collectionId, quickMemoId, nowTimestamp());
  });
  return result;
}

export function removeCollectionEntry(entryId: string): void {
  updateEssencesData((data) => {
    const entry = data.collectionEntries[entryId];
    if (!entry) throw new RepositoryError(`unknown entry ${entryId}`, "collection-entry-not-found");
    delete data.collectionEntries[entryId];
    if (entry.type === "note" && entry.noteId) {
      const note = data.notes[entry.noteId];
      if (note?.collectionIds.includes(entry.collectionId)) {
        data.notes[note.id] = {
          ...note,
          collectionIds: note.collectionIds.filter((cid) => cid !== entry.collectionId),
          updatedAt: nowTimestamp(),
        };
      }
    }
  });
}

export function reorderCollectionEntries(
  collectionId: string,
  orderedEntryIds: string[],
): CollectionEntry[] {
  const { result } = updateEssencesData((data) => {
    if (!data.collections[collectionId]) {
      throw new RepositoryError(`unknown collection ${collectionId}`, "collection-not-found");
    }
    const siblings = Object.values(data.collectionEntries).filter(
      (e) => e.collectionId === collectionId,
    );
    const remaining = siblings
      .filter((e) => !orderedEntryIds.includes(e.id))
      .sort((a, b) => a.order - b.order);
    const nextIds = [
      ...orderedEntryIds.filter((id) => siblings.some((s) => s.id === id)),
      ...remaining.map((e) => e.id),
    ];
    nextIds.forEach((id, order) => {
      data.collectionEntries[id] = { ...data.collectionEntries[id], order };
    });
    data.collections[collectionId] = {
      ...data.collections[collectionId],
      updatedAt: nowTimestamp(),
    };
    return nextIds.map((id) => data.collectionEntries[id]);
  });
  return result;
}

/**
 * Files a plan hierarchy into a collection: the root and every descendant become
 * `archived` and stay linked. Nothing is flattened into text or deleted.
 */
export function migratePlanToCollection(
  rootPlanId: string,
  collectionId: string,
): { entry: CollectionEntry; archivedPlanIds: string[] } {
  const archived = archivePlanItem(rootPlanId, { archiveCompletedTasks: false });
  const entry = addCollectionEntry({
    collectionId,
    type: "migratedPlan",
    migratedPlanRootId: rootPlanId,
  });
  return { entry, archivedPlanIds: archived.map((p) => p.id) };
}

/* --------------------------------------------------------------- Activity */

interface ActivityInput {
  type: ActivityType;
  entityType?: string;
  entityId?: string;
  metadata?: ActivityRecord["metadata"];
  localDate?: LocalDate;
  occurredAt?: Timestamp;
}

function pushActivity(data: EssencesDataV3, input: ActivityInput): ActivityRecord {
  const occurredAt = input.occurredAt ?? nowTimestamp();
  const record: ActivityRecord = {
    id: newId(),
    type: input.type,
    occurredAt,
    entityType: input.entityType,
    entityId: input.entityId,
    metadata: input.metadata,
    localDate: input.localDate ?? todayLocalDate(new Date(occurredAt)),
  };
  data.activityRecords[record.id] = record;
  autoCompleteChallenges(data, record.localDate);
  return record;
}

/**
 * Centralized activity entry point for UI actions. Challenge and Analytics read
 * these records instead of hooking into components.
 */
export function recordActivity(input: ActivityInput): ActivityRecord {
  const { result } = updateEssencesData((data) => pushActivity(data, input));
  return result;
}

export function getActivityRecords(filter?: {
  date?: LocalDate;
  type?: ActivityType;
}): ActivityRecord[] {
  return Object.values(loadEssencesData().activityRecords)
    .filter((r) => {
      if (filter?.date && r.localDate !== filter.date) return false;
      if (filter?.type && r.type !== filter.type) return false;
      return true;
    })
    .sort((a, b) => (a.occurredAt < b.occurredAt ? -1 : 1));
}

export function countActivity(type: ActivityType, date: LocalDate): number {
  let count = 0;
  for (const record of Object.values(loadEssencesData().activityRecords)) {
    if (record.type === type && record.localDate === date) count += 1;
  }
  return count;
}

/* ------------------------------------------------------------ Challenges */

/**
 * Ensures the day's assignments exist. Idempotent: selection is deterministic
 * and an assignment exists at most once per (date, definition), which is what
 * caps every activity challenge at one award per day.
 */
export function ensureDailyChallenges(
  date: LocalDate = todayLocalDate(),
): DailyChallengeAssignment[] {
  const { result } = updateEssencesData((data) => {
    const existingForDate = Object.values(data.dailyChallenges).filter((a) => a.date === date);
    if (existingForDate.length === 0) {
      const selected = selectChallengesForDate(date);
      for (const definition of selected) {
        const assignment: DailyChallengeAssignment = {
          id: newId(),
          date,
          challengeDefinitionId: definition.id,
          status: "pending",
          pointsAwarded: 0,
        };
        data.dailyChallenges[assignment.id] = assignment;
      }
    }
    autoCompleteChallenges(data, date);
    return Object.values(data.dailyChallenges).filter((a) => a.date === date);
  });
  return result;
}

export function getDailyChallenges(
  date: LocalDate = todayLocalDate(),
): DailyChallengeAssignment[] {
  return Object.values(loadEssencesData().dailyChallenges)
    .filter((a) => a.date === date)
    .sort((a, b) => {
      const pa = challengeDefinition(a.challengeDefinitionId)?.priority ?? 999;
      const pb = challengeDefinition(b.challengeDefinitionId)?.priority ?? 999;
      return pa - pb;
    });
}

function conditionSatisfied(
  data: EssencesDataV3,
  definition: ChallengeDefinition,
  date: LocalDate,
): boolean {
  return isChallengeSatisfied(definition, date, {
    activities: Object.values(data.activityRecords),
    tasks: Object.values(data.tasks),
    routines: Object.values(data.routines),
    routineCompletions: Object.values(data.routineCompletions),
    reflections: Object.values(data.reflections),
    routineOccursOn,
  });
}

/**
 * Completes pending assignments whose condition now holds and writes exactly one
 * point transaction per assignment.
 */
function autoCompleteChallenges(data: EssencesDataV3, date: LocalDate): void {
  for (const assignment of Object.values(data.dailyChallenges)) {
    if (assignment.date !== date || assignment.status === "completed") continue;
    const definition = challengeDefinition(assignment.challengeDefinitionId);
    if (!definition) continue;
    if (!conditionSatisfied(data, definition, date)) continue;

    const now = nowTimestamp();
    data.dailyChallenges[assignment.id] = {
      ...assignment,
      status: "completed",
      completedAt: now,
      pointsAwarded: definition.points,
    };
    if (!hasChallengePointAward(Object.values(data.pointTransactions), assignment.id)) {
      const transaction: PointTransaction = {
        id: newId(),
        amount: definition.points,
        reason: "challenge",
        sourceId: assignment.id,
        assignmentId: assignment.id,
        challengeId: definition.id,
        assignmentDate: date,
        createdAt: now,
      };
      data.pointTransactions[transaction.id] = transaction;
    }
  }
}

/** Re-evaluates a day's challenges (e.g. after a routine completion). */
export function evaluateDailyChallenges(
  date: LocalDate = todayLocalDate(),
): DailyChallengeAssignment[] {
  const { result } = updateEssencesData((data) => {
    autoCompleteChallenges(data, date);
    return Object.values(data.dailyChallenges).filter((a) => a.date === date);
  });
  return result;
}

export const ALL_CHALLENGE_DEFINITIONS = CHALLENGE_DEFINITIONS;

/* --------------------------------------------------------------- Points */

export function getPointTransactions(): PointTransaction[] {
  return Object.values(loadEssencesData().pointTransactions).sort((a, b) =>
    a.createdAt < b.createdAt ? -1 : 1,
  );
}

export function addPointTransaction(input: {
  amount: number;
  reason: PointReason;
  sourceId?: string;
}): PointTransaction {
  const { result } = updateEssencesData((data) => {
    const transaction: PointTransaction = {
      id: newId(),
      amount: input.amount,
      reason: input.reason,
      sourceId: input.sourceId,
      createdAt: nowTimestamp(),
    };
    data.pointTransactions[transaction.id] = transaction;
    return transaction;
  });
  return result;
}

/** Balance is always derived from the ledger, never stored. */
export function getPointBalance(): number {
  return pointBalanceFrom(Object.values(loadEssencesData().pointTransactions));
}

export function getPointTotalsByReason(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of Object.values(loadEssencesData().pointTransactions)) {
    out[t.reason] = (out[t.reason] ?? 0) + t.amount;
  }
  return out;
}

/* ------------------------------------------------- Calendar decorations */

export function getDayAppearance(date: LocalDate): CalendarDayAppearance | undefined {
  return Object.values(loadEssencesData().calendarDayAppearances).find((a) => a.date === date);
}

export function getWallpaperForDate(date: LocalDate): string | undefined {
  return getDayAppearance(date)?.wallpaperId;
}

function appearanceForDate(
  data: EssencesDataV3,
  date: LocalDate,
): CalendarDayAppearance | undefined {
  return Object.values(data.calendarDayAppearances).find((a) => a.date === date);
}

/** One wallpaper maximum per day: the record is replaced, never appended. */
export function setDayWallpaper(
  date: LocalDate,
  wallpaperId?: string,
): CalendarDayAppearance | undefined {
  if (!wallpaperId || wallpaperId === "none" || wallpaperId === "wallpaper.none") {
    removeWallpaper(date);
    return undefined;
  }
  if (!isKnownWallpaper(wallpaperId)) {
    throw new RepositoryError(`unknown wallpaper ${wallpaperId}`, "wallpaper-unknown");
  }
  if (!isValidLocalDate(date)) {
    throw new RepositoryError(`invalid local date ${date}`, "wallpaper-invalid-date");
  }
  const { result } = updateEssencesData((data) => {
    const existing = appearanceForDate(data, date);
    const record: CalendarDayAppearance = {
      id: existing?.id ?? newId(),
      date,
      wallpaperId,
      updatedAt: nowTimestamp(),
    };
    data.calendarDayAppearances[record.id] = record;
    return record;
  });
  return result;
}

export function setWallpaperForDate(
  date: LocalDate,
  wallpaperId?: string | null,
): CalendarDayAppearance | undefined {
  return setDayWallpaper(date, wallpaperId ?? undefined);
}

export function removeWallpaper(date: LocalDate): void {
  updateEssencesData((data) => {
    const existing = appearanceForDate(data, date);
    if (existing) delete data.calendarDayAppearances[existing.id];
  });
}

export function getAppearancesInRange(
  from: LocalDate,
  to: LocalDate,
): Map<LocalDate, CalendarDayAppearance> {
  const out = new Map<LocalDate, CalendarDayAppearance>();
  for (const appearance of Object.values(loadEssencesData().calendarDayAppearances)) {
    if (appearance.date < from || appearance.date > to) continue;
    if (!appearance.wallpaperId) continue;
    out.set(appearance.date, appearance);
  }
  return out;
}

export function getStampsForDate(date: LocalDate): CalendarStamp[] {
  return Object.values(loadEssencesData().calendarStamps)
    .filter((s) => s.date === date)
    .sort((a, b) => a.zIndex - b.zIndex);
}

export function getStampsInRange(from: LocalDate, to: LocalDate): Map<LocalDate, CalendarStamp[]> {
  const out = new Map<LocalDate, CalendarStamp[]>();
  for (const stamp of Object.values(loadEssencesData().calendarStamps)) {
    if (stamp.date < from || stamp.date > to) continue;
    const bucket = out.get(stamp.date) ?? [];
    bucket.push(stamp);
    out.set(stamp.date, bucket);
  }
  for (const bucket of out.values()) bucket.sort((a, b) => a.zIndex - b.zIndex);
  return out;
}

export function getStamp(id: string): CalendarStamp | undefined {
  return loadEssencesData().calendarStamps[id];
}

/** Multiple stamps may share a day. Never overwrites an existing stamp. */
export function addStamp(input: {
  date: LocalDate;
  stampDefinitionId: string;
  x: number;
  y: number;
  scale?: number;
  rotation?: number;
}): CalendarStamp {
  if (!isValidLocalDate(input.date)) {
    throw new RepositoryError(`invalid local date ${input.date}`, "stamp-invalid-date");
  }
  if (!isKnownStampDefinition(input.stampDefinitionId)) {
    throw new RepositoryError(
      `unknown stamp ${input.stampDefinitionId}`,
      "stamp-unknown-definition",
    );
  }
  const { result } = updateEssencesData((data) => {
    const sameDay = Object.values(data.calendarStamps).filter((s) => s.date === input.date);
    const now = nowTimestamp();
    const stamp: CalendarStamp = {
      id: newId(),
      date: input.date,
      stampDefinitionId: input.stampDefinitionId,
      x: clampStampCoord(input.x),
      y: clampStampCoord(input.y),
      scale: clampStampScale(input.scale),
      rotation: clampStampRotation(input.rotation),
      zIndex: nextStampZIndex(sameDay.map((s) => s.zIndex)),
      createdAt: now,
      updatedAt: now,
    };
    data.calendarStamps[stamp.id] = stamp;
    pushActivity(data, {
      type: "stamp_added",
      entityType: "stamp",
      entityId: stamp.id,
      localDate: input.date,
    });
    return stamp;
  });
  return result;
}

export function createStamp(input: Parameters<typeof addStamp>[0]): CalendarStamp {
  return addStamp(input);
}

export function updateStamp(
  id: string,
  patch: {
    date?: LocalDate;
    x?: number;
    y?: number;
    scale?: number;
    rotation?: number;
    zIndex?: number;
  },
): CalendarStamp {
  const { result } = updateEssencesData((data) => {
    const existing = data.calendarStamps[id];
    if (!existing) {
      throw new RepositoryError(`unknown stamp ${id}`, "stamp-not-found");
    }
    const nextDate = patch.date ?? existing.date;
    if (!isValidLocalDate(nextDate)) {
      throw new RepositoryError(`invalid local date ${nextDate}`, "stamp-invalid-date");
    }
    const movedDays = nextDate !== existing.date;
    const sameDay = Object.values(data.calendarStamps).filter(
      (s) => s.date === nextDate && s.id !== id,
    );
    const stamp: CalendarStamp = {
      ...existing,
      date: nextDate,
      x: patch.x === undefined ? existing.x : clampStampCoord(patch.x),
      y: patch.y === undefined ? existing.y : clampStampCoord(patch.y),
      scale: patch.scale === undefined ? existing.scale : clampStampScale(patch.scale),
      rotation:
        patch.rotation === undefined ? existing.rotation : clampStampRotation(patch.rotation),
      zIndex:
        patch.zIndex !== undefined
          ? clampStampZIndex(patch.zIndex)
          : movedDays
            ? nextStampZIndex(sameDay.map((s) => s.zIndex))
            : existing.zIndex,
      updatedAt: nowTimestamp(),
    };
    data.calendarStamps[id] = stamp;
    return stamp;
  });
  return result;
}

/** Physical delete — stamps are decorative, not reflection subjects. */
export function deleteStamp(id: string): void {
  updateEssencesData((data) => {
    delete data.calendarStamps[id];
  });
}

/* ------------------------------------------------------- User / settings */

export function getUserProfile() {
  return loadEssencesData().user;
}

export function getSettings(): UserSettings {
  return loadEssencesData().settings;
}

export function updateSettings(patch: Partial<UserSettings>): UserSettings {
  const { result } = updateEssencesData((data) => {
    data.settings = mergeUserSettings(data.settings, patch);
    return data.settings;
  });
  return result;
}

export function getTaskTemplates(): TaskTemplate[] {
  ensureLegacyCatchup();
  return Object.values(loadEssencesData().taskTemplates).sort((a, b) => a.order - b.order);
}

/** Preferred write path for reusable templates. Do not write `reusable-tasks`. */
export function createTaskTemplate(input: {
  title: string;
  icon?: string;
  color?: string;
}): TaskTemplate {
  const title = input.title.trim();
  if (!title) {
    throw new RepositoryError("template title is required", "template-title-required");
  }
  const { result } = updateEssencesData((data) => {
    const now = nowTimestamp();
    const template: TaskTemplate = {
      id: newId(),
      title,
      icon: input.icon,
      color: input.color,
      order: nextOrder(Object.values(data.taskTemplates)),
      createdAt: now,
      updatedAt: now,
    };
    data.taskTemplates[template.id] = template;
    return template;
  });
  return result;
}

export function updateTaskTemplate(
  id: string,
  patch: Partial<Pick<TaskTemplate, "title" | "icon" | "color">>,
): TaskTemplate {
  const { result } = updateEssencesData((data) => {
    const current = data.taskTemplates[id];
    if (!current) throw new RepositoryError(`unknown template ${id}`, "template-not-found");
    const nextTitle = patch.title !== undefined ? patch.title.trim() : current.title;
    if (!nextTitle) {
      throw new RepositoryError("template title is required", "template-title-required");
    }
    const next: TaskTemplate = {
      ...current,
      ...patch,
      title: nextTitle,
      id,
      updatedAt: nowTimestamp(),
    };
    data.taskTemplates[id] = next;
    return next;
  });
  return result;
}

/** Removes the template from V3. Does not write `reusable-tasks`. */
export function deleteTaskTemplate(id: string): void {
  updateEssencesData((data) => {
    if (!data.taskTemplates[id]) {
      throw new RepositoryError(`unknown template ${id}`, "template-not-found");
    }
    delete data.taskTemplates[id];
  });
}

/** Creates a task from a reusable template on a local date. */
export function createTaskFromTemplate(templateId: string, date: LocalDate): TaskItem {
  const template = loadEssencesData().taskTemplates[templateId];
  if (!template) {
    throw new RepositoryError(`unknown template ${templateId}`, "template-not-found");
  }
  return createTask({
    title: template.title,
    date,
    icon: template.icon,
    color: template.color,
    createdFrom: "todo",
  });
}

export { loadEssencesData, saveEssencesData };
