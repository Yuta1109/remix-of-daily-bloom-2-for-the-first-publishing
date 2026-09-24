/**
 * V3 schema defaults and normalization.
 *
 * `normalizeData` is intentionally forgiving: unknown collections are recreated
 * as empty maps rather than throwing, so a partially written payload can never
 * make the app unbootable.
 */

import { nowTimestamp } from "./local-date";
import {
  SCHEMA_VERSION,
  type EssencesDataV3,
  type QuickMemo,
  type QuickMemoConvertedTargets,
  type ReflectionScheduleSettings,
  type UserProfile,
  type UserSettings,
} from "./types";

export function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `id_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

export const DEFAULT_PLAN_ICON = "target";
export const DEFAULT_TASK_ICON = "circle";
export const DEFAULT_ROUTINE_ICON = "repeat";
/** Matches the default `--accent` token in `src/index.css`. */
export const DEFAULT_COLOR = "orange";

export function defaultReflectionSchedule(): ReflectionScheduleSettings {
  return {
    daily: { enabled: true, graceHours: 24, timeOfDay: "21:00" },
    weekly: { enabled: true, graceHours: 72, timeOfDay: "20:00", weekday: 0 },
    monthly: { enabled: true, graceHours: 168, timeOfDay: "20:00", dayOfMonth: 1 },
    future: { enabled: true, graceHours: 336, timeOfDay: "20:00", dayOfMonth: 1 },
  };
}

export function defaultSettings(): UserSettings {
  return {
    weeklyPlanningEnabled: true,
    reflectionSchedule: defaultReflectionSchedule(),
    language: "ja",
    accentColor: DEFAULT_COLOR,
    appearance: "light",
    notifications: {
      enabled: true,
      routineReminders: true,
      taskReminders: true,
      reflectionReminders: true,
    },
    weekStartsOn: 0,
  };
}

export function defaultUser(now = nowTimestamp()): UserProfile {
  return {
    id: newId(),
    specialChallengeState: "locked",
    createdAt: now,
    updatedAt: now,
  };
}

export function emptyData(now = nowTimestamp()): EssencesDataV3 {
  return {
    schemaVersion: SCHEMA_VERSION,

    plans: {},
    tasks: {},
    taskSeries: {},
    taskTemplates: {},

    events: {},

    routines: {},
    routineCompletions: {},

    notes: {},
    quickMemos: {},
    collections: {},
    collectionEntries: {},

    reflections: {},
    reflectionDecisions: {},

    activityRecords: {},

    dailyChallenges: {},
    pointTransactions: {},

    calendarDayAppearances: {},
    calendarStamps: {},

    user: defaultUser(now),
    settings: defaultSettings(),
  };
}

export const V3_RECORD_KEYS = [
  "plans",
  "tasks",
  "taskSeries",
  "taskTemplates",
  "events",
  "routines",
  "routineCompletions",
  "notes",
  "quickMemos",
  "collections",
  "collectionEntries",
  "reflections",
  "reflectionDecisions",
  "activityRecords",
  "dailyChallenges",
  "pointTransactions",
  "calendarDayAppearances",
  "calendarStamps",
] as const;

export type V3RecordKey = (typeof V3_RECORD_KEYS)[number];

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** Fills in missing collections / user / settings without discarding data. */
export function normalizeData(raw: unknown): EssencesDataV3 {
  const base = emptyData();
  const input = asRecord(raw);
  const out = { ...base } as Record<string, unknown>;

  for (const key of V3_RECORD_KEYS) {
    out[key] = asRecord(input[key]);
  }

  out.schemaVersion = SCHEMA_VERSION;
  out.user = { ...base.user, ...asRecord(input.user) };

  const settings = asRecord(input.settings);
  out.settings = {
    ...base.settings,
    ...settings,
    reflectionSchedule: {
      ...base.settings.reflectionSchedule,
      ...asRecord(settings.reflectionSchedule),
    },
    notifications: {
      ...base.settings.notifications,
      ...asRecord(settings.notifications),
    },
  };

  if (input.legacyImport) out.legacyImport = input.legacyImport;

  const normalized = out as unknown as EssencesDataV3;
  hydrateQuickMemoConversionMetadata(normalized);
  return normalized;
}

/** Merge a legacy single pointer into `convertedTargets` without dropping either. */
export function convertedTargetsOf(memo: QuickMemo): QuickMemoConvertedTargets {
  const targets: QuickMemoConvertedTargets = { ...memo.convertedTargets };
  if (memo.convertedToType && memo.convertedToId && !targets[memo.convertedToType]) {
    targets[memo.convertedToType] = memo.convertedToId;
  }
  return targets;
}

/**
 * Backward-compatible hydrate. Mutates memos in place. Returns true when a
 * persist is useful (legacy pointer copied into `convertedTargets`).
 */
export function hydrateQuickMemoConversionMetadata(data: EssencesDataV3): boolean {
  let changed = false;
  for (const id of Object.keys(data.quickMemos)) {
    const memo = data.quickMemos[id];
    if (!memo) continue;
    const targets = convertedTargetsOf(memo);
    const sameKeys =
      Object.keys(targets).length === Object.keys(memo.convertedTargets ?? {}).length &&
      Object.entries(targets).every(([key, value]) => memo.convertedTargets?.[key as keyof QuickMemoConvertedTargets] === value);
    if (sameKeys) continue;
    data.quickMemos[id] = { ...memo, convertedTargets: targets };
    changed = true;
  }
  return changed;
}
