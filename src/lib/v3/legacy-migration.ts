/**
 * Legacy → V3 migration.
 *
 * Guarantees:
 *  - Legacy stores are READ ONLY. Nothing is written back or deleted, and
 *    `notes-store` / `store` helpers are bypassed because their loaders rewrite
 *    (and in the memo case delete) legacy keys as a side effect.
 *  - Deterministic ids derived from legacy ids make the migration idempotent:
 *    re-running merges instead of duplicating.
 *  - Legacy task date keys are preserved VERBATIM. The Today store built them
 *    with `toISOString()` (UTC), so some are shifted relative to local time.
 *    Re-interpreting them here would silently move a user's tasks, so V3 keeps
 *    the stored value and only uses local dates for newly created data.
 */

import {
  endOfMonth,
  isValidLocalDate,
  isValidLocalTime,
  nowTimestamp,
  toLocalDateTime,
  type LocalDate,
  type Timestamp,
} from "./local-date";
import { DEFAULT_COLOR, DEFAULT_PLAN_ICON, DEFAULT_TASK_ICON } from "./schema";
import type {
  CalendarEventItem,
  Collection,
  CollectionEntry,
  EssencesDataV3,
  EventLiveActivityLead,
  EventRecurrenceFreq,
  EventReminderOffset,
  LegacyImportRecord,
  NotePage,
  PlanItem,
  TaskItem,
  TaskTemplate,
} from "./types";

export const LEGACY_KEYS = {
  todo: "mindful-todo-data",
  reusable: "reusable-tasks",
  events: "calendar-events",
  monthGoals: "essences-month-goals",
  memos: "essences-memo-library-v2",
} as const;

/* ------------------------------------------------------- id derivation */

const ID_PREFIX = {
  task: "legacy-task",
  template: "legacy-template",
  plan: "legacy-plan",
  event: "legacy-event",
  note: "legacy-note",
  collection: "legacy-collection",
  entry: "legacy-entry",
} as const;

function legacyId(prefix: string, ...parts: (string | number)[]): string {
  return [prefix, ...parts.map((p) => String(p))].join(":");
}

/* ------------------------------------------------------------ raw reads */

function readRaw(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function epochToTimestamp(value: unknown, fallback: Timestamp): Timestamp {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return new Date(n).toISOString();
}

function textOf(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/* -------------------------------------------------- mindful-todo-data */

const REMINDER_OFFSETS: EventReminderOffset[] = [
  "at",
  "5m",
  "10m",
  "20m",
  "30m",
  "1h",
  "2h",
  "3h",
  "4h",
  "6h",
  "8h",
  "12h",
  "24h",
];

const LA_LEADS: EventLiveActivityLead[] = [
  "24h",
  "12h",
  "8h",
  "6h",
  "4h",
  "3h",
  "2h",
  "1h",
  "30m",
  "20m",
  "10m",
  "5m",
];

const EVENT_FREQS: EventRecurrenceFreq[] = [
  "none",
  "daily",
  "weekly",
  "monthly",
  "monthlyWeekday",
  "yearly",
];

interface TodoConversion {
  tasks: TaskItem[];
  /** Per-day free-text reflections found in the legacy store (not mapped). */
  reflectionCount: number;
}

export function convertLegacyTodo(raw: unknown, now: Timestamp): TodoConversion {
  const buckets = asObject(raw);
  const tasks: TaskItem[] = [];
  let reflectionCount = 0;

  for (const bucketKey of Object.keys(buckets).sort()) {
    const day = asObject(buckets[bucketKey]);
    if (textOf(day.reflection).trim()) reflectionCount += 1;

    asArray(day.tasks).forEach((entry, index) => {
      const legacy = asObject(entry);
      const title = textOf(legacy.text).trim();
      if (!title) return;
      const sourceId = textOf(legacy.id) || `${bucketKey}#${index}`;
      // Preserve the legacy date exactly; fall back to the bucket key only when
      // the record has no usable date of its own.
      const storedDate = textOf(legacy.date);
      const date = (isValidLocalDate(storedDate) ? storedDate : bucketKey) as LocalDate;
      if (!isValidLocalDate(date)) return;
      const completed = legacy.completed === true;

      tasks.push({
        id: legacyId(ID_PREFIX.task, sourceId),
        title,
        date,
        allDay: true,
        icon: DEFAULT_TASK_ICON,
        color: DEFAULT_COLOR,
        status: completed ? "completed" : "open",
        order: index,
        createdAt: now,
        updatedAt: now,
        completedAt: completed ? now : undefined,
        createdFrom: "todo",
      });
    });
  }

  return { tasks, reflectionCount };
}

/* -------------------------------------------------------- reusable-tasks */

export function convertLegacyReusable(raw: unknown, now: Timestamp): TaskTemplate[] {
  return asArray(raw)
    .map((entry, index): TaskTemplate | null => {
      const legacy = asObject(entry);
      const title = textOf(legacy.text).trim();
      if (!title) return null;
      return {
        id: legacyId(ID_PREFIX.template, textOf(legacy.id) || `#${index}`),
        title,
        icon: DEFAULT_TASK_ICON,
        color: DEFAULT_COLOR,
        order: index,
        createdAt: now,
        updatedAt: now,
      };
    })
    .filter((t): t is TaskTemplate => !!t);
}

/* --------------------------------------------------- essences-month-goals */

/**
 * Legacy month keys are `YYYY-{0-based month}` (`monthKeyFromDate` uses
 * `Date#getMonth()`), so `2026-8` means September 2026. V3 stores 1-based
 * `periodStart` / `periodEnd` date keys instead.
 */
export function convertLegacyMonthGoals(raw: unknown, now: Timestamp): PlanItem[] {
  const store = asObject(raw);
  const plans: PlanItem[] = [];

  for (const monthKey of Object.keys(store).sort()) {
    const [yearPart, monthPart] = monthKey.split("-");
    const year = Number(yearPart);
    const monthIndex = Number(monthPart);
    if (!Number.isInteger(year) || !Number.isInteger(monthIndex)) continue;
    if (monthIndex < 0 || monthIndex > 11) continue;

    const periodStart = `${year}-${String(monthIndex + 1).padStart(2, "0")}-01` as LocalDate;
    if (!isValidLocalDate(periodStart)) continue;
    const periodEnd = endOfMonth(periodStart);

    const bundle = asObject(store[monthKey]);
    asArray(bundle.goals).forEach((entry, index) => {
      const legacy = asObject(entry);
      const title = textOf(legacy.text).trim();
      if (!title) return;
      const completed = legacy.completed === true;
      const completedAtRaw = textOf(legacy.completedAt);
      const completedAt = completedAtRaw && !Number.isNaN(Date.parse(completedAtRaw))
        ? new Date(completedAtRaw).toISOString()
        : completed
          ? now
          : undefined;

      plans.push({
        id: legacyId(ID_PREFIX.plan, monthKey, textOf(legacy.id) || `#${index}`),
        level: "monthly",
        title,
        icon: DEFAULT_PLAN_ICON,
        color: DEFAULT_COLOR,
        periodStart,
        periodEnd,
        status: completed ? "completed" : "active",
        order: index,
        createdAt: now,
        updatedAt: now,
        completedAt,
        createdFrom: "plan",
      });
    });
  }

  return plans;
}

/* ------------------------------------------------------- calendar-events */

export function convertLegacyEvents(raw: unknown, now: Timestamp): CalendarEventItem[] {
  return asArray(raw)
    .map((entry, index): CalendarEventItem | null => {
      const legacy = asObject(entry);
      const startDate = textOf(legacy.date);
      if (!isValidLocalDate(startDate)) return null;

      const allDay = legacy.allDay === true;
      const endDateRaw = textOf(legacy.endDate);
      const endDate = isValidLocalDate(endDateRaw) ? endDateRaw : startDate;
      const startTime = textOf(legacy.startTime);
      const endTime = textOf(legacy.endTime);

      const repeat = textOf(legacy.repeat) as EventRecurrenceFreq;
      const recurrence =
        EVENT_FREQS.includes(repeat) && repeat !== "none" ? { freq: repeat } : undefined;

      // Prefer the modern `reminders[]`, fall back to the deprecated single
      // `reminder` string (same rule as `events-store.getReminders`).
      const remindersArray = asArray(legacy.reminders)
        .map((r) => textOf(r) as EventReminderOffset)
        .filter((r) => REMINDER_OFFSETS.includes(r));
      const legacyReminder = textOf(legacy.reminder) as EventReminderOffset;
      const reminders = remindersArray.length
        ? remindersArray
        : REMINDER_OFFSETS.includes(legacyReminder)
          ? [legacyReminder]
          : undefined;

      const lead = textOf(legacy.liveActivityLead) as EventLiveActivityLead;
      const excludeDates = asArray(legacy.excludeDates)
        .map((d) => textOf(d))
        .filter((d) => isValidLocalDate(d)) as LocalDate[];
      const repeatEndDate = textOf(legacy.repeatEndDate);
      const recurrenceDate = textOf(legacy.recurrenceDate);
      const masterId = textOf(legacy.recurrenceMasterId);

      return {
        id: legacyId(ID_PREFIX.event, textOf(legacy.id) || `#${index}`),
        title: textOf(legacy.title),
        note: textOf(legacy.notes) || undefined,
        startAt: toLocalDateTime(
          startDate,
          !allDay && isValidLocalTime(startTime) ? startTime : undefined,
        ),
        endAt: toLocalDateTime(
          endDate,
          !allDay && isValidLocalTime(endTime) ? endTime : undefined,
        ),
        allDay,
        color: textOf(legacy.color) || undefined,
        recurrence,
        recurrenceMasterId: masterId ? legacyId(ID_PREFIX.event, masterId) : undefined,
        recurrenceDate: isValidLocalDate(recurrenceDate) ? recurrenceDate : undefined,
        excludeDates: excludeDates.length ? excludeDates : undefined,
        repeatEndDate: isValidLocalDate(repeatEndDate) ? repeatEndDate : undefined,
        reminders,
        liveActivity: legacy.liveActivity === true ? true : undefined,
        liveActivityLead: LA_LEADS.includes(lead) ? lead : undefined,
        location: textOf(legacy.location) || undefined,
        status: "scheduled",
        createdAt: now,
        updatedAt: now,
        createdFrom: "calendar",
      };
    })
    .filter((e): e is CalendarEventItem => !!e);
}

/* -------------------------------------------- essences-memo-library-v2 */

interface MemoConversion {
  notes: NotePage[];
  collections: Collection[];
  entries: CollectionEntry[];
}

/**
 * Memo categories become Collections; memo pages become NotePages linked
 * through CollectionEntry, preserving the legacy `pageIds` order.
 */
export function convertLegacyMemos(raw: unknown, now: Timestamp): MemoConversion {
  const library = asObject(raw);
  const notes: NotePage[] = [];
  const collections: Collection[] = [];
  const entries: CollectionEntry[] = [];

  const notesById = new Map<string, NotePage>();
  asArray(library.pages).forEach((entry, index) => {
    const legacy = asObject(entry);
    const sourceId = textOf(legacy.id) || `#${index}`;
    const updatedAt = epochToTimestamp(legacy.updatedAt, now);
    const note: NotePage = {
      id: legacyId(ID_PREFIX.note, sourceId),
      title: textOf(legacy.title),
      html: textOf(legacy.html),
      collectionIds: [],
      createdAt: updatedAt,
      updatedAt,
    };
    notes.push(note);
    notesById.set(sourceId, note);
  });

  asArray(library.categories).forEach((entry, categoryIndex) => {
    const legacy = asObject(entry);
    const sourceId = textOf(legacy.id) || `#${categoryIndex}`;
    const collectionId = legacyId(ID_PREFIX.collection, sourceId);
    collections.push({
      id: collectionId,
      name: textOf(legacy.name),
      color: textOf(legacy.color) || undefined,
      createdAt: now,
      updatedAt: now,
    });

    asArray(legacy.pageIds).forEach((pageIdRaw, order) => {
      const pageSourceId = textOf(pageIdRaw);
      const note = notesById.get(pageSourceId);
      if (!note) return;
      if (!note.collectionIds.includes(collectionId)) note.collectionIds.push(collectionId);
      entries.push({
        id: legacyId(ID_PREFIX.entry, sourceId, pageSourceId),
        collectionId,
        type: "note",
        noteId: note.id,
        order,
        createdAt: now,
      });
    });
  });

  return { notes, collections, entries };
}

/* ------------------------------------------------------------- migration */

function mergeById<T extends { id: string }>(
  target: Record<string, T>,
  items: T[],
): number {
  let added = 0;
  for (const item of items) {
    if (target[item.id]) continue;
    target[item.id] = item;
    added += 1;
  }
  return added;
}

export interface LegacySnapshot {
  todo: unknown;
  reusable: unknown;
  events: unknown;
  monthGoals: unknown;
  memos: unknown;
}

/** Reads every legacy key without writing anything back. */
export function readLegacySnapshot(): LegacySnapshot {
  return {
    todo: readRaw(LEGACY_KEYS.todo),
    reusable: readRaw(LEGACY_KEYS.reusable),
    events: readRaw(LEGACY_KEYS.events),
    monthGoals: readRaw(LEGACY_KEYS.monthGoals),
    memos: readRaw(LEGACY_KEYS.memos),
  };
}

export function hasLegacyData(snapshot: LegacySnapshot = readLegacySnapshot()): boolean {
  return Object.values(snapshot).some((v) => v !== null && v !== undefined);
}

/**
 * Merges legacy data into `data` and returns it.
 *
 * Idempotent: deterministic ids mean a second run adds nothing. The returned
 * `legacyImport` record is refreshed each run so the provenance stays accurate.
 */
export function migrateLegacyInto(
  data: EssencesDataV3,
  snapshot: LegacySnapshot = readLegacySnapshot(),
  now: Timestamp = nowTimestamp(),
): EssencesDataV3 {
  const sources: string[] = [];
  if (snapshot.todo) sources.push(LEGACY_KEYS.todo);
  if (snapshot.reusable) sources.push(LEGACY_KEYS.reusable);
  if (snapshot.events) sources.push(LEGACY_KEYS.events);
  if (snapshot.monthGoals) sources.push(LEGACY_KEYS.monthGoals);
  if (snapshot.memos) sources.push(LEGACY_KEYS.memos);

  const todo = convertLegacyTodo(snapshot.todo, now);
  const templates = convertLegacyReusable(snapshot.reusable, now);
  const plans = convertLegacyMonthGoals(snapshot.monthGoals, now);
  const events = convertLegacyEvents(snapshot.events, now);
  const memos = convertLegacyMemos(snapshot.memos, now);

  const counts: Record<string, number> = {
    tasks: mergeById(data.tasks, todo.tasks),
    taskTemplates: mergeById(data.taskTemplates, templates),
    plans: mergeById(data.plans, plans),
    events: mergeById(data.events, events),
    notes: mergeById(data.notes, memos.notes),
    collections: mergeById(data.collections, memos.collections),
    collectionEntries: mergeById(data.collectionEntries, memos.entries),
  };

  const record: LegacyImportRecord = {
    importedAt: now,
    sources,
    counts,
    unmapped: {
      // Per-day free-text reflections have no V3 home yet. The legacy store is
      // untouched, so the text remains recoverable.
      dailyReflectionTexts: todo.reflectionCount,
    },
  };

  data.legacyImport = record;
  return data;
}
