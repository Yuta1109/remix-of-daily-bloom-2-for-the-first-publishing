/**
 * Canonical Essences V3 data model.
 *
 * Storage rules:
 *  - Day-based fields are LOCAL `YYYY-MM-DD` (see `local-date.ts`).
 *  - `createdAt` / `updatedAt` / `occurredAt` are ISO-8601 UTC instants.
 *  - Event `startAt` / `endAt` are LOCAL wall-clock `YYYY-MM-DDTHH:mm` (no
 *    offset) so migrating legacy `date` + `startTime` never shifts a day.
 */

import type { LocalDate, LocalDateTime, LocalTime, Timestamp, Weekday } from "./local-date";

export const SCHEMA_VERSION = 3;
export const STORAGE_KEY = "essences-app-data-v3";

/* ------------------------------------------------------------------ Plans */

export type PlanLevel = "future" | "monthly" | "weekly";

export type PlanStatus = "active" | "completed" | "stopped" | "archived";

export type CreatedFromPlan =
  | "plan"
  | "quickMemo"
  | "note"
  | "reflection"
  | "collection";

export interface FutureTarget {
  type: "month" | "date" | "someday";
  /** `YYYY-MM` for `month`, `YYYY-MM-DD` for `date`, omitted for `someday`. */
  value?: string;
}

/** One model for Future / Monthly / Weekly. */
export interface PlanItem {
  id: string;
  level: PlanLevel;

  title: string;
  note?: string;

  icon: string;
  color: string;

  parentPlanId?: string;

  periodStart?: LocalDate;
  periodEnd?: LocalDate;

  futureTarget?: FutureTarget;

  status: PlanStatus;

  order: number;

  createdAt: Timestamp;
  updatedAt: Timestamp;
  completedAt?: Timestamp;

  createdFrom: CreatedFromPlan;
}

/* ------------------------------------------------------------------ Tasks */

export type TaskStatus = "open" | "completed" | "stopped" | "archived";

export type CreatedFromTask =
  | "plan"
  | "todo"
  | "calendar"
  | "note"
  | "quickMemo"
  | "reflection";

/**
 * Single source of truth for a day-level task.
 *
 * Daily Log, ToDo and Calendar all read the SAME record by id. A task must
 * never be duplicated just because another screen renders it.
 */
export interface TaskItem {
  id: string;

  title: string;
  note?: string;

  /** Local `YYYY-MM-DD`. */
  date: LocalDate;

  startTime?: LocalTime;
  endTime?: LocalTime;
  allDay: boolean;

  icon: string;
  color: string;

  parentPlanId?: string;

  status: TaskStatus;

  order: number;

  /** Set when this task is an occurrence of a `TaskSeries`. */
  seriesId?: string;
  /** Original series occurrence date, kept when the instance is moved. */
  occurrenceDate?: LocalDate;

  createdAt: Timestamp;
  updatedAt: Timestamp;
  completedAt?: Timestamp;

  createdFrom: CreatedFromTask;
}

/* ----------------------------------------------------------- Task series */

/**
 * User-facing Repeat Log recurrence. Daily and weekly-weekday cadences are
 * deliberately NOT here — those belong to `RoutineItem`.
 */
export type TaskRecurrence =
  | { type: "monthlyDay"; day: number }
  | { type: "yearlyDate"; month: number; day: number }
  | {
      type: "monthlyWeekday";
      week: 1 | 2 | 3 | 4 | 5 | -1;
      weekday: Weekday;
    };

/**
 * Repeat Log rule. Generates TaskItem occurrences (monthly / yearly /
 * monthly-weekday). Never a CalendarEvent. Daily / weekly cadences are Routine.
 */
export interface TaskSeries {
  id: string;

  title: string;
  note?: string;

  icon: string;
  color: string;

  recurrence: TaskRecurrence;

  startDate: LocalDate;
  endDate?: LocalDate;

  defaultTime?: LocalTime;

  parentPlanId?: string;

  active: boolean;

  createdAt: Timestamp;
  updatedAt: Timestamp;

  /**
   * Occurrence dates suppressed for this series (cancelled or replaced by a
   * materialized `TaskItem` that was moved). Lets a single occurrence be
   * changed without touching the rest of the series.
   */
  excludeDates?: LocalDate[];
}

/* ----------------------------------------------------------------- Events */

/** Mirrors the legacy `RepeatFreq` union so no recurrence capability is lost. */
export type EventRecurrenceFreq =
  | "none"
  | "daily"
  | "weekly"
  | "monthly"
  | "monthlyWeekday"
  | "yearly";

export interface EventRecurrence {
  freq: EventRecurrenceFreq;
}

/** Same option set as the legacy `ReminderOffset`. */
export type EventReminderOffset =
  | "at"
  | "5m"
  | "10m"
  | "20m"
  | "30m"
  | "1h"
  | "2h"
  | "3h"
  | "4h"
  | "6h"
  | "8h"
  | "12h"
  | "24h";

/** Same option set as the legacy `LiveActivityLead`. */
export type EventLiveActivityLead =
  | "24h"
  | "12h"
  | "8h"
  | "6h"
  | "4h"
  | "3h"
  | "2h"
  | "1h"
  | "30m"
  | "20m"
  | "10m"
  | "5m";

export type EventStatus = "scheduled" | "cancelled" | "archived";

export type CreatedFromEvent = "calendar" | "note" | "quickMemo";

/**
 * Calendar event — intentionally separate from `TaskItem`.
 * Events are context in Reflection, never migration subjects.
 */
export interface CalendarEventItem {
  id: string;

  title: string;
  note?: string;

  /** Local wall-clock `YYYY-MM-DDTHH:mm`. All-day events use `T00:00`. */
  startAt: LocalDateTime;
  /** Inclusive end. All-day multi-day events keep the last day at `T00:00`. */
  endAt?: LocalDateTime;
  allDay: boolean;

  icon?: string;
  color?: string;

  recurrence?: EventRecurrence;
  recurrenceMasterId?: string;
  recurrenceDate?: LocalDate;
  excludeDates?: LocalDate[];
  repeatEndDate?: LocalDate;

  reminders?: EventReminderOffset[];

  /** Live Activity integration (iOS). Preserved from the legacy event model. */
  liveActivity?: boolean;
  liveActivityLead?: EventLiveActivityLead;

  location?: string;

  status: EventStatus;

  createdAt: Timestamp;
  updatedAt: Timestamp;

  createdFrom: CreatedFromEvent;
}

/* --------------------------------------------------------------- Routines */

export type RoutineFrequency =
  | { type: "daily" }
  | { type: "weekly"; weekdays: Weekday[] };

/**
 * Habit / recurring behavior. Daily or weekly only. Shown on ToDo, never on
 * Calendar, never materialized as a TaskItem, never a Reflection subject.
 * Completions live in RoutineCompletion per local date.
 */
export interface RoutineItem {
  id: string;

  title: string;

  icon: string;
  color: string;

  frequency: RoutineFrequency;

  startDate: LocalDate;
  endDate?: LocalDate;

  defaultTime?: LocalTime;

  active: boolean;
  order: number;

  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** Per-day history record. Completion is never a boolean on `RoutineItem`. */
export interface RoutineCompletion {
  id: string;
  routineId: string;
  date: LocalDate;
  completed: boolean;
  completedAt?: Timestamp;
}

/* ------------------------------------------------------------ Reflections */

export type ReflectionType = "daily" | "weekly" | "monthly" | "future";

export type ReflectionStatus =
  | "scheduled"
  | "due"
  | "overdue"
  | "completed"
  | "skipped";

/**
 * Reflection is never a hard deadline. Past `graceUntil` the status becomes
 * `overdue` but the session stays executable.
 */
export interface ReflectionSession {
  id: string;

  type: ReflectionType;

  targetPeriodStart: LocalDate;
  targetPeriodEnd?: LocalDate;

  scheduledAt: Timestamp;
  graceUntil: Timestamp;

  status: ReflectionStatus;

  startedAt?: Timestamp;
  completedAt?: Timestamp;

  createdAt: Timestamp;
}

export type ReflectionDecisionType = "keep" | "postpone" | "stop";

export type ReflectionSubjectType = "plan" | "task";

/**
 * A migration/review decision. Completely independent of completion status:
 * a task may be `completed` and still receive a decision.
 */
export interface ReflectionDecision {
  id: string;

  reflectionSessionId: string;

  subjectType: ReflectionSubjectType;
  subjectId: string;

  decision: ReflectionDecisionType;

  fromLevel?: PlanLevel;
  toLevel?: PlanLevel;

  fromDate?: LocalDate;
  toDate?: LocalDate;

  collectionId?: string;

  decidedAt: Timestamp;
}

/* ------------------------------------------------------- Notes / capture */

/**
 * One attached image. Bytes never live in Firestore — only metadata + a short
 * local URI. Cloud bytes live in Firebase Storage (`storagePath`).
 */
export interface ImageAttachment {
  id: string;
  /** Device-local URI (blob / Capacitor webPath). Empty after restore until hydrated. */
  localUri: string;
  width?: number;
  height?: number;
  createdAt: Timestamp;
  /** Firebase Storage object path under `users/{uid}/...`. Never contains email. */
  storagePath?: string;
  /** Optional download URL for display before a local copy is hydrated. */
  downloadUrl?: string;
  uploadedAt?: Timestamp;
  contentType?: string;
  /** True until the local file has been uploaded (or when a retry is due). */
  pendingUpload?: boolean;
}

/** Provenance from `essences-memo-library-v2` / `essences-memos`. */
export interface NoteLegacySource {
  memoId: string;
  categories: Array<{
    id: string;
    name: string;
    color?: string;
    collapsed?: boolean;
  }>;
}

/** At most one image per note — intentionally not an array in V3. */
export interface NotePage {
  id: string;

  title: string;
  html: string;

  image?: ImageAttachment;

  collectionIds: string[];

  createdAt: Timestamp;
  updatedAt: Timestamp;

  /** Present on notes imported from the pre-V3 memo library. */
  legacySource?: NoteLegacySource;
}

export type QuickMemoStatus = "inbox" | "converted" | "archived";

export type QuickMemoConvertedType = "task" | "event" | "plan" | "note" | "collection";

/** Per-type conversion targets. Independent ids so Task + Plan + Event can coexist. */
export type QuickMemoConvertedTargets = Partial<Record<QuickMemoConvertedType, string>>;

export interface QuickMemo {
  id: string;

  text: string;

  image?: ImageAttachment;

  status: QuickMemoStatus;

  createdAt: Timestamp;
  updatedAt: Timestamp;

  /**
   * Last conversion pointer. Kept so Phase 11 payloads remain readable.
   * Canonical per-type map is `convertedTargets`.
   */
  convertedToType?: QuickMemoConvertedType;
  convertedToId?: string;
  convertedAt?: Timestamp;
  convertedTargets?: QuickMemoConvertedTargets;
}

/* ----------------------------------------------------------- Collections */

export interface Collection {
  id: string;

  name: string;

  icon?: string;
  color?: string;

  /** Soft-hide. Entries and linked notes stay in V3 until a hard delete. */
  archivedAt?: Timestamp;

  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type CollectionEntryType = "note" | "quickMemo" | "migratedPlan";

/**
 * A `migratedPlan` entry points at the ROOT `PlanItem` of an archived
 * hierarchy. The original PlanItems and TaskItems stay linked and archived —
 * never flattened into text and never deleted.
 */
export interface CollectionEntry {
  id: string;

  collectionId: string;

  type: CollectionEntryType;

  noteId?: string;
  quickMemoId?: string;
  migratedPlanRootId?: string;

  order: number;

  createdAt: Timestamp;
}

/* ------------------------------------------------- Calendar decorations */

/** One wallpaper maximum per day. */
export interface CalendarDayAppearance {
  id: string;
  date: LocalDate;
  wallpaperId?: string;
  updatedAt: Timestamp;
}

/**
   * A user-placed stamp. The stamp CATALOG (`stampDefinitionId` targets) is
   * static code in `stamp-catalog.ts` and is not stored per user.
   *
   * `x` / `y` are normalized 0–1 coordinates inside the target day cell
   * (see `stamp-coords.ts`). Do not store screen pixels.
   */
export interface CalendarStamp {
  id: string;

  date: LocalDate;

  stampDefinitionId: string;

  /** 0 = left edge of the day cell, 1 = right edge. */
  x: number;
  /** 0 = top edge of the day cell, 1 = bottom edge. */
  y: number;

  scale: number;
  rotation: number;

  zIndex: number;

  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/* ------------------------------------------------------------- Activity */

export type ActivityType =
  | "task_created"
  | "task_completed"
  | "calendar_viewed"
  | "routine_created"
  | "routine_completed"
  | "stamp_added"
  | "note_edited"
  | "plan_updated"
  | "breakdown_created"
  | "reflection_completed"
  | "event_created"
  | "quick_memo_created"
  | "quick_memo_converted"
  | "future_task_scheduled";

/**
 * Generic activity log. Challenge and Analytics read this instead of hooking
 * into individual UI components.
 */
export interface ActivityRecord {
  id: string;

  type: ActivityType;

  occurredAt: Timestamp;

  entityType?: string;
  entityId?: string;

  metadata?: Record<string, string | number | boolean>;

  /** Local day the activity belongs to, for once-per-day challenge caps. */
  localDate: LocalDate;
}

/* ------------------------------------------------- Challenges and points */

export interface DailyChallengeAssignment {
  id: string;

  date: LocalDate;

  challengeDefinitionId: string;

  status: "pending" | "completed";

  completedAt?: Timestamp;

  pointsAwarded: number;
}

export type PointReason =
  | "challenge"
  | "special_challenge"
  | "store_purchase"
  | "bonus"
  | "refund";

/** Ledger entry. Balance is always derived, never stored as a mutable field. */
export interface PointTransaction {
  id: string;

  amount: number;

  reason: PointReason;

  sourceId?: string;

  /** Challenge assignment id. Same as `sourceId` for challenge awards. */
  assignmentId?: string;

  /** Challenge definition id when `reason` is `challenge` / `special_challenge`. */
  challengeId?: string;

  /** Local assignment date for a challenge award. */
  assignmentDate?: LocalDate;

  createdAt: Timestamp;
}

/** Special Challenge is intentionally not implemented yet. */
export type SpecialChallengeState = "locked" | "comingSoon";

/* ------------------------------------------------------------ Templates */

/**
 * Migrated from the legacy `reusable-tasks` store. Not part of the original
 * spec root, added so legacy data is never silently dropped.
 */
export interface TaskTemplate {
  id: string;

  title: string;

  icon?: string;
  color?: string;

  order: number;

  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/* ------------------------------------------------------ User / settings */

export interface UserProfile {
  id: string;
  displayName?: string;
  specialChallengeState: SpecialChallengeState;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** A user's personal reflection cadence — distinct from Challenge cadence. */
export interface ReflectionScheduleRule {
  enabled: boolean;
  /** Hours after `scheduledAt` before the session becomes `overdue`. */
  graceHours: number;
  /** Local `HH:mm` the session becomes due. */
  timeOfDay: LocalTime;
  /** `weekly` only: which weekday the session targets. */
  weekday?: Weekday;
  /** `monthly` / `future` only: day of month (clamped to month length). */
  dayOfMonth?: number;
  /**
   * Daily only. `0` (default) = same local day as the review target
   * (evening). `1` = next morning. Preferred time, not a deadline.
   */
  scheduleOffsetDays?: 0 | 1;
}

export interface ReflectionScheduleSettings {
  daily: ReflectionScheduleRule;
  weekly: ReflectionScheduleRule;
  monthly: ReflectionScheduleRule;
  future: ReflectionScheduleRule;
}

export interface NotificationSettings {
  enabled: boolean;
  routineReminders: boolean;
  taskReminders: boolean;
  reflectionReminders: boolean;
  /** Local `HH:mm` for the daily summary, when enabled. */
  dailySummaryTime?: LocalTime;
}

export interface UserSettings {
  weeklyPlanningEnabled: boolean;

  reflectionSchedule: ReflectionScheduleSettings;

  language: string;

  accentColor: string;

  appearance: "system" | "light" | "dark";

  notifications: NotificationSettings;

  /** 0 = Sunday, 1 = Monday. Mirrors the legacy calendar preference. */
  weekStartsOn: 0 | 1;
}

/* ----------------------------------------------------------------- Root */

export interface EssencesDataV3 {
  schemaVersion: 3;

  plans: Record<string, PlanItem>;
  tasks: Record<string, TaskItem>;
  taskSeries: Record<string, TaskSeries>;
  taskTemplates: Record<string, TaskTemplate>;

  events: Record<string, CalendarEventItem>;

  routines: Record<string, RoutineItem>;
  routineCompletions: Record<string, RoutineCompletion>;

  notes: Record<string, NotePage>;
  quickMemos: Record<string, QuickMemo>;
  collections: Record<string, Collection>;
  collectionEntries: Record<string, CollectionEntry>;

  reflections: Record<string, ReflectionSession>;
  reflectionDecisions: Record<string, ReflectionDecision>;

  activityRecords: Record<string, ActivityRecord>;

  dailyChallenges: Record<string, DailyChallengeAssignment>;
  pointTransactions: Record<string, PointTransaction>;

  calendarDayAppearances: Record<string, CalendarDayAppearance>;
  calendarStamps: Record<string, CalendarStamp>;

  user: UserProfile;
  settings: UserSettings;

  /** Provenance of the one-time legacy import. Absent until it runs. */
  legacyImport?: LegacyImportRecord;
}

export interface LegacyImportRecord {
  importedAt: Timestamp;
  /** Legacy localStorage keys that were present and read. */
  sources: string[];
  counts: Record<string, number>;
  /**
   * Legacy fields deliberately not mapped in this phase. The legacy stores are
   * never modified, so the original values remain readable.
   */
  unmapped?: Record<string, number>;
}
