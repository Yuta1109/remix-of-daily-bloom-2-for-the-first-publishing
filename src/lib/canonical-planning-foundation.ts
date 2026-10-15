/**
 * Windows-executable twin of
 * `ios/App/App/Native/Features/Calendar/CanonicalPlanningStore.swift`.
 *
 * The Swift store is the native source of truth. This module is not written
 * by the app and is not a second live store. It exists so the projection,
 * tombstone, override, and recurrence rules can be tested here. There is no
 * XCTest target in the Xcode project.
 *
 * Planning screens still use `PlanningSession`. Do not route them here.
 */

export const CANONICAL_SCHEMA_VERSION = 1;
export const PROJECTION_HORIZON_DAYS = 400;
export const STORAGE_KEY = "essences.canonical-planning.v1";

export type PlanningLevel = "future" | "monthly" | "weekly" | "daily";
export type PlanningKind = "task" | "event";
export type RepeatFrequency = "none" | "daily" | "weekly" | "monthly" | "monthlyWeekday" | "yearly";

export interface YMD {
  year: number;
  month: number;
  day: number;
}

export interface RecurrenceRule {
  frequency: RepeatFrequency;
  endDate?: string;
}

export interface CanonicalPayload {
  id: string;
  legacyWebID?: string;
  kind: PlanningKind;
  origin: PlanningLevel;
  originPeriodKey: string;
  title: string;
  iconSymbol: string;
  colorID?: string;
  legacyColorKey?: string;
  location: string;
  memo: string;
  allDay: boolean;
  startDate?: string;
  endDate?: string;
  startMinutes?: number;
  endMinutes?: number;
  reminders: string[];
  recurrence: RecurrenceRule;
  liveActivity: boolean;
  liveActivityLead?: string;
  updatedAt: string;
  todayTaskID?: string;
  completed: boolean;
  /** In-memory tutorial row. Never written to production canonical storage. */
  isSample?: boolean;
  parentID?: string;
  childOrder?: number;
}

export interface Tombstone {
  logicalID: string;
  level: PlanningLevel;
  periodKey: string;
}

export interface LevelOverride {
  logicalID: string;
  level: PlanningLevel;
  periodKey: string;
  title?: string;
  iconSymbol?: string;
  colorID?: string;
  location?: string;
  memo?: string;
  reminders?: string[];
  liveActivity?: boolean;
  liveActivityLead?: string;
}

export interface OccurrenceOverride {
  logicalID: string;
  /** Scheduled instance start, not every covered day. */
  occurrenceDate: string;
  excluded: boolean;
  title?: string;
  location?: string;
  memo?: string;
  startMinutes?: number;
  endMinutes?: number;
  reminders?: string[];
  liveActivity?: boolean;
  liveActivityLead?: string;
}

/** Completion for one displayed local day. Independent of the scheduled instance start. */
export interface DayCompletion {
  logicalID: string;
  date: string;
  completed: boolean;
}

export interface ReflectionSnapshot {
  id: string;
  completed: true;
  decisionIDs: string[];
  level?: PlanningLevel;
  completedAt?: string;
}

export type ReflectionDisposition = "keep" | "postpone" | "stop";

/** One item decision inside a completed reflection. Separate from task completion. */
export interface ReflectionDecision {
  id: string;
  level: PlanningLevel;
  periodKey: string;
  logicalID: string;
  occurrenceDate?: string;
  disposition: ReflectionDisposition;
  completed: boolean;
  isSample?: boolean;
}

export interface CanonicalDocument {
  schemaVersion: number;
  /** Stays unresolved until a native reader for WebKit localStorage exists. */
  legacyMigration: "unresolved";
  payloads: CanonicalPayload[];
  tombstones: Tombstone[];
  levelOverrides: LevelOverride[];
  occurrenceOverrides: OccurrenceOverride[];
  dayCompletions: DayCompletion[];
  reflectionSnapshots: ReflectionSnapshot[];
  reflectionDecisions: ReflectionDecision[];
  postponeEntries: PostponeEntry[];
  plans: PlanRecord[];
  planBullets: PlanBulletRecord[];
  appliedTransfers: string[];
}

export interface PlanRecord {
  id: string;
  title: string;
  memo: string;
  replanCount: number;
  createdAt: string;
  updatedAt: string;
  hasBeenSaved: boolean;
  iconID: string;
  iconColorID: string;
  isSample?: boolean;
}

/** One brainstorm row. A child points at a root. Grandchildren are not stored. */
export interface PlanBulletRecord {
  id: string;
  planID: string;
  text: string;
  parentID?: string;
  order: number;
  isSample?: boolean;
}

/** Box row. Display fields can diverge from the payload. The payload is not copied. */
export interface PostponeEntry {
  id: string;
  logicalID: string;
  kind: PlanningKind;
  section: PlanningLevel;
  originLevel: PlanningLevel;
  originPeriodKey: string;
  occurrenceDate?: string;
  title: string;
  iconSymbol: string;
  colorID?: string;
  reflectionDecisionID?: string;
  todayTaskID?: string;
  eventID?: string;
  order: number;
  isSample?: boolean;
}

export interface EffectiveItem {
  logicalID: string;
  kind: PlanningKind;
  level: PlanningLevel;
  periodKey: string;
  occurrenceKey: string;
  title: string;
  iconSymbol: string;
  colorID?: string;
  location: string;
  memo: string;
  allDay: boolean;
  startDate?: string;
  endDate?: string;
  startMinutes?: number;
  endMinutes?: number;
  reminders: string[];
  liveActivity: boolean;
  liveActivityLead?: string;
  completed: boolean;
  todayTaskID?: string;
  parentID?: string;
  childOrder?: number;
}

export interface CreateInput {
  id?: string;
  legacyWebID?: string;
  kind: PlanningKind;
  origin: PlanningLevel;
  originPeriodKey: string;
  title: string;
  iconSymbol?: string;
  colorID?: string;
  legacyColorKey?: string;
  location?: string;
  memo?: string;
  allDay?: boolean;
  startDate?: string;
  endDate?: string;
  startMinutes?: number;
  endMinutes?: number;
  reminders?: string[];
  recurrence?: RecurrenceRule;
  liveActivity?: boolean;
  liveActivityLead?: string;
  updatedAt?: string;
  todayTaskID?: string;
  completed?: boolean;
  isSample?: boolean;
  parentID?: string;
  childOrder?: number;
}

/**
 * Hue families shared by `EVENT_COLORS` and `PlanIconColor`.
 * red (0°), teal (180°), and gray have no Planning pastel. They stay unresolved.
 */
export const LEGACY_COLOR_MAP: Record<string, string> = {
  blue: "sky",
  green: "mint",
  orange: "peach",
  pink: "rose",
  purple: "lavender",
};

export const UNRESOLVED_LEGACY_COLORS = ["red", "teal", "gray"] as const;

export function emptyDocument(): CanonicalDocument {
  return {
    schemaVersion: CANONICAL_SCHEMA_VERSION,
    legacyMigration: "unresolved",
    payloads: [],
    tombstones: [],
    levelOverrides: [],
    occurrenceOverrides: [],
    dayCompletions: [],
    reflectionSnapshots: [],
    reflectionDecisions: [],
    postponeEntries: [],
    plans: [],
    planBullets: [],
    appliedTransfers: [],
  };
}

export function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function ymdKey(date: YMD): string {
  return `${pad(date.year)}-${pad(date.month)}-${pad(date.day)}`;
}

export function parseYMD(key: string): YMD {
  const [year, month, day] = key.split("-").map(Number);
  return { year, month, day };
}

export function addDays(date: YMD, days: number): YMD {
  const value = new Date(date.year, date.month - 1, date.day);
  value.setDate(value.getDate() + days);
  return { year: value.getFullYear(), month: value.getMonth() + 1, day: value.getDate() };
}

export function compareYMD(left: YMD, right: YMD): number {
  return ymdKey(left).localeCompare(ymdKey(right));
}

export function weekStart(date: YMD): YMD {
  const value = new Date(date.year, date.month - 1, date.day);
  const delta = value.getDay() === 0 ? 6 : value.getDay() - 1;
  return addDays(date, -delta);
}

export function periodKey(level: PlanningLevel, date: YMD): string {
  if (level === "future") return String(date.year);
  if (level === "monthly") return `${pad(date.year)}-${pad(date.month)}`;
  if (level === "weekly") return ymdKey(weekStart(date));
  return ymdKey(date);
}

/** Scheduled instance. A multi-day instance shares this key across its covered days. */
export function occurrenceKey(logicalID: string, occurrenceDate: string): string {
  return `${logicalID}|${occurrenceDate}`;
}

/** Displayed local day. Completion uses this, so overlapping instances do not share a check. */
export function dayCompletionKey(logicalID: string, date: string): string {
  return `${logicalID}|day|${date}`;
}

function flows(kind: PlanningKind, origin: PlanningLevel, level: PlanningLevel): boolean {
  const task: Record<PlanningLevel, PlanningLevel[]> = {
    future: ["future"],
    monthly: ["monthly", "weekly", "daily"],
    weekly: ["weekly", "daily"],
    daily: ["daily"],
  };
  const event: Record<PlanningLevel, PlanningLevel[]> = {
    future: ["future", "monthly", "weekly", "daily"],
    monthly: ["monthly", "weekly", "daily"],
    weekly: ["weekly", "daily"],
    daily: ["daily"],
  };
  return (kind === "task" ? task : event)[origin].includes(level);
}

function spanDays(start: string, end: string): number {
  let count = 0;
  let cursor = parseYMD(start);
  const last = parseYMD(end);
  while (compareYMD(cursor, last) < 0) {
    count += 1;
    cursor = addDays(cursor, 1);
  }
  return count;
}

function weekdayOccurrence(date: YMD): number {
  return Math.floor((date.day - 1) / 7) + 1;
}

function matchesMonthlyWeekday(seriesStart: YMD, target: YMD): boolean {
  const start = new Date(seriesStart.year, seriesStart.month - 1, seriesStart.day);
  const day = new Date(target.year, target.month - 1, target.day);
  if (day.getDay() !== start.getDay()) return false;
  const want = weekdayOccurrence(seriesStart);
  const got = weekdayOccurrence(target);
  if (got === want) return true;
  if (want >= 5) {
    const next = addDays(target, 7);
    return next.month !== target.month;
  }
  return false;
}

function matchesFrequency(start: YMD, cursor: YMD, frequency: RepeatFrequency): boolean {
  if (frequency === "daily") return true;
  if (frequency === "weekly") {
    const left = new Date(start.year, start.month - 1, start.day).getDay();
    const right = new Date(cursor.year, cursor.month - 1, cursor.day).getDay();
    return left === right;
  }
  if (frequency === "monthly") return cursor.day === start.day;
  if (frequency === "monthlyWeekday") return matchesMonthlyWeekday(start, cursor);
  if (frequency === "yearly") return cursor.month === start.month && cursor.day === start.day;
  return ymdKey(cursor) === ymdKey(start);
}

/** Editor gate from the WebView. The store still keeps a rule that fails this check. */
export function repeatAllowedForSpan(start: string, end: string, frequency: RepeatFrequency): boolean {
  const span = spanDays(start, end);
  if (frequency === "daily" && span >= 1) return false;
  if (frequency === "weekly" && span >= 7) return false;
  return true;
}

/** Instance starts inside the projection window. The stored rule is not truncated to this window. */
function occurrenceStarts(payload: CanonicalPayload): string[] {
  if (!payload.startDate) return [];
  const end = payload.endDate ?? payload.startDate;
  if (compareYMD(parseYMD(end), parseYMD(payload.startDate)) < 0) return [];
  const frequency = payload.recurrence.frequency;
  if (frequency === "none") return [payload.startDate];
  const limit = payload.recurrence.endDate ?? ymdKey(addDays(parseYMD(payload.startDate), PROJECTION_HORIZON_DAYS));
  const starts: string[] = [];
  let cursor = parseYMD(payload.startDate);
  const last = parseYMD(limit);
  while (compareYMD(cursor, last) <= 0 && starts.length < PROJECTION_HORIZON_DAYS) {
    if (matchesFrequency(parseYMD(payload.startDate), cursor, frequency)) starts.push(ymdKey(cursor));
    cursor = addDays(cursor, 1);
  }
  return starts;
}

/** True when `date` is a generated instance start, including dates past the projection horizon. */
export function isScheduledStart(payload: CanonicalPayload, date: string): boolean {
  if (!payload.startDate || date < payload.startDate) return false;
  const end = payload.endDate ?? payload.startDate;
  if (end < payload.startDate) return false;
  if (payload.recurrence.frequency === "none") return date === payload.startDate;
  if (payload.recurrence.endDate && date > payload.recurrence.endDate) return false;
  return matchesFrequency(parseYMD(payload.startDate), parseYMD(date), payload.recurrence.frequency);
}

/** Scheduled starts whose span includes this local day. Not limited to the projection horizon. */
export function instancesCovering(payload: CanonicalPayload, day: string): string[] {
  if (!payload.startDate) return [];
  const end = payload.endDate ?? payload.startDate;
  if (end < payload.startDate) return [];
  const span = spanDays(payload.startDate, end);
  const frequency = payload.recurrence.frequency;
  if (frequency === "none") {
    return day >= payload.startDate && day <= end ? [payload.startDate] : [];
  }
  let cursor = addDays(parseYMD(day), -span);
  const seriesStart = parseYMD(payload.startDate);
  if (compareYMD(cursor, seriesStart) < 0) cursor = seriesStart;
  const last = parseYMD(day);
  const starts: string[] = [];
  while (compareYMD(cursor, last) <= 0) {
    const key = ymdKey(cursor);
    if (isScheduledStart(payload, key)) starts.push(key);
    cursor = addDays(cursor, 1);
  }
  return starts;
}

export function dayIsCovered(payload: CanonicalPayload, day: string): boolean {
  return instancesCovering(payload, day).length > 0;
}

function isExcluded(logicalID: string, occurrenceDate: string, overrides: OccurrenceOverride[]): boolean {
  return overrides.some((row) => row.logicalID === logicalID && row.occurrenceDate === occurrenceDate && row.excluded);
}

function coveredDatesFor(document: CanonicalDocument, payload: CanonicalPayload): { date: string; occurrenceDate: string }[] {
  if (!payload.startDate) return [];
  const end = payload.endDate ?? payload.startDate;
  if (end < payload.startDate) return [];
  const length = spanDays(payload.startDate, end);
  const rows: { date: string; occurrenceDate: string }[] = [];
  for (const start of occurrenceStarts(payload)) {
    if (isExcluded(payload.id, start, document.occurrenceOverrides)) continue;
    let cursor = parseYMD(start);
    for (let index = 0; index <= length; index += 1) {
      rows.push({ date: ymdKey(cursor), occurrenceDate: start });
      cursor = addDays(cursor, 1);
    }
  }
  return rows;
}

function tombstoned(document: CanonicalDocument, logicalID: string, level: PlanningLevel, key: string): boolean {
  return document.tombstones.some((row) => row.logicalID === logicalID && row.level === level && row.periodKey === key);
}

export function projectedKeys(document: CanonicalDocument, payload: CanonicalPayload, level: PlanningLevel): string[] {
  if (!flows(payload.kind, payload.origin, level)) return [];
  if (!payload.startDate) {
    return level === payload.origin && !tombstoned(document, payload.id, level, payload.originPeriodKey)
      ? [payload.originPeriodKey]
      : [];
  }
  const keys = new Set<string>();
  for (const row of coveredDatesFor(document, payload)) {
    const key = periodKey(level, parseYMD(row.date));
    if (!tombstoned(document, payload.id, level, key)) keys.add(key);
  }
  return [...keys];
}

function defined<T>(value: T | undefined, fallback: T): T {
  return value === undefined ? fallback : value;
}

export function effectiveItems(document: CanonicalDocument, level: PlanningLevel, key: string): EffectiveItem[] {
  const items: EffectiveItem[] = [];
  for (const payload of document.payloads) {
    if (!projectedKeys(document, payload, level).includes(key)) continue;
    const levelOverride = document.levelOverrides.find(
      (row) => row.logicalID === payload.id && row.level === level && row.periodKey === key,
    );
    const displayedDay = level === "daily" ? key : undefined;
    const covering = displayedDay ? instancesCovering(payload, displayedDay).filter((start) => !isExcluded(payload.id, start, document.occurrenceOverrides)) : [];
    const occurrenceDate = covering.length === 1
      ? covering[0]
      : payload.startDate
        ? coveredDatesFor(document, payload).find((row) => periodKey(level, parseYMD(row.date)) === key)?.occurrenceDate
        : payload.originPeriodKey;
    const occurrence = covering.length === 1
      ? document.occurrenceOverrides.find((row) => row.logicalID === payload.id && row.occurrenceDate === occurrenceDate && !row.excluded)
      : covering.length > 1
        ? undefined
        : document.occurrenceOverrides.find((row) => row.logicalID === payload.id && row.occurrenceDate === occurrenceDate && !row.excluded);
    items.push({
      logicalID: payload.id,
      kind: payload.kind,
      level,
      periodKey: key,
      occurrenceKey: occurrenceKey(payload.id, occurrenceDate ?? payload.originPeriodKey),
      title: defined(occurrence?.title, defined(levelOverride?.title, payload.title)),
      iconSymbol: defined(levelOverride?.iconSymbol, payload.iconSymbol),
      colorID: defined(levelOverride?.colorID, payload.colorID),
      location: defined(occurrence?.location, defined(levelOverride?.location, payload.location)),
      memo: defined(occurrence?.memo, defined(levelOverride?.memo, payload.memo)),
      allDay: payload.allDay,
      startDate: payload.startDate,
      endDate: payload.endDate,
      startMinutes: defined(occurrence?.startMinutes, payload.startMinutes),
      endMinutes: defined(occurrence?.endMinutes, payload.endMinutes),
      reminders: defined(occurrence?.reminders, defined(levelOverride?.reminders, payload.reminders)),
      liveActivity: defined(occurrence?.liveActivity, defined(levelOverride?.liveActivity, payload.liveActivity)),
      liveActivityLead: defined(occurrence?.liveActivityLead, defined(levelOverride?.liveActivityLead, payload.liveActivityLead)),
      completed: payload.kind === "event"
        ? displayedDay ? document.dayCompletions.some((row) => row.logicalID === payload.id && row.date === displayedDay && row.completed) : false
        : payload.completed,
      todayTaskID: payload.todayTaskID,
      parentID: payload.parentID,
      childOrder: payload.childOrder,
    });
  }
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.logicalID)) return false;
    seen.add(item.logicalID);
    return true;
  });
}

export function createItem(document: CanonicalDocument, input: CreateInput): CanonicalPayload | null {
  if (input.startDate && input.endDate && input.endDate < input.startDate) return null;
  const payload: CanonicalPayload = {
    id: input.id ?? crypto.randomUUID(),
    legacyWebID: input.legacyWebID,
    kind: input.kind,
    origin: input.origin,
    originPeriodKey: input.originPeriodKey,
    title: input.title,
    iconSymbol: input.iconSymbol ?? "calendar",
    colorID: input.colorID,
    legacyColorKey: input.legacyColorKey,
    location: input.location ?? "",
    memo: input.memo ?? "",
    allDay: input.allDay ?? false,
    startDate: input.startDate,
    endDate: input.endDate ?? input.startDate,
    startMinutes: input.allDay ? undefined : input.startMinutes,
    endMinutes: input.allDay ? undefined : input.endMinutes,
    reminders: input.reminders ?? [],
    recurrence: input.recurrence ?? { frequency: "none" },
    liveActivity: input.liveActivity ?? false,
    liveActivityLead: input.liveActivityLead,
    updatedAt: input.updatedAt ?? new Date(0).toISOString(),
    todayTaskID: input.todayTaskID,
    completed: input.completed ?? false,
    isSample: input.isSample ?? false,
    parentID: input.parentID,
    childOrder: input.childOrder,
  };
  document.payloads.push(payload);
  return payload;
}

export function deleteLevel(document: CanonicalDocument, logicalID: string, level: PlanningLevel, key: string): void {
  if (tombstoned(document, logicalID, level, key)) return;
  document.tombstones.push({ logicalID, level, periodKey: key });
}

export function editPayload(document: CanonicalDocument, logicalID: string, patch: Partial<CanonicalPayload>): void {
  const payload = document.payloads.find((row) => row.id === logicalID);
  if (!payload) return;
  const next = { ...payload, ...patch, id: payload.id, origin: payload.origin, kind: payload.kind };
  if (next.startDate && next.endDate && next.endDate < next.startDate) return;
  Object.assign(payload, next);
  pruneStaleDateOverrides(document, logicalID);
}

function periodStillCovered(payload: CanonicalPayload, level: PlanningLevel, key: string): boolean {
  if (!payload.startDate) return level === payload.origin && key === payload.originPeriodKey;
  if (level === "daily") return dayIsCovered(payload, key);
  if (level === "monthly" && /^\d{4}-\d{2}$/.test(key)) {
    const [year, month] = key.split("-").map(Number);
    const last = new Date(year, month, 0).getDate();
    for (let day = 1; day <= last; day += 1) {
      if (dayIsCovered(payload, `${key}-${pad(day)}`)) return true;
    }
    return false;
  }
  if (level === "weekly" && /^\d{4}-\d{2}-\d{2}$/.test(key)) {
    for (let offset = 0; offset < 7; offset += 1) {
      if (dayIsCovered(payload, ymdKey(addDays(parseYMD(key), offset)))) return true;
    }
    return false;
  }
  if (level === "future" && /^\d{4}$/.test(key)) {
    for (let month = 1; month <= 12; month += 1) {
      if (periodStillCovered(payload, "monthly", `${key}-${pad(month)}`)) return true;
    }
    return false;
  }
  return true;
}

/** Drops date-scoped overrides the new span no longer covers. Tombstones and reflection stay. */
export function pruneStaleDateOverrides(document: CanonicalDocument, logicalID: string): void {
  const payload = document.payloads.find((row) => row.id === logicalID);
  if (!payload) return;
  document.occurrenceOverrides = document.occurrenceOverrides.filter(
    (row) => row.logicalID !== logicalID || isScheduledStart(payload, row.occurrenceDate),
  );
  document.dayCompletions = document.dayCompletions.filter(
    (row) => row.logicalID !== logicalID || dayIsCovered(payload, row.date),
  );
  document.levelOverrides = document.levelOverrides.filter(
    (row) => row.logicalID !== logicalID || periodStillCovered(payload, row.level, row.periodKey),
  );
}

export function editLevel(
  document: CanonicalDocument,
  logicalID: string,
  level: PlanningLevel,
  key: string,
  patch: Omit<LevelOverride, "logicalID" | "level" | "periodKey">,
): void {
  const existing = document.levelOverrides.find(
    (row) => row.logicalID === logicalID && row.level === level && row.periodKey === key,
  );
  if (existing) Object.assign(existing, patch);
  else document.levelOverrides.push({ logicalID, level, periodKey: key, ...patch });
}

export function editOccurrence(
  document: CanonicalDocument,
  logicalID: string,
  occurrenceDate: string,
  patch: Omit<OccurrenceOverride, "logicalID" | "occurrenceDate" | "excluded">,
): void {
  const existing = document.occurrenceOverrides.find(
    (row) => row.logicalID === logicalID && row.occurrenceDate === occurrenceDate,
  );
  if (existing) Object.assign(existing, patch, { excluded: false });
  else document.occurrenceOverrides.push({ logicalID, occurrenceDate, excluded: false, ...patch });
}

export function excludeOccurrence(document: CanonicalDocument, logicalID: string, occurrenceDate: string): void {
  const existing = document.occurrenceOverrides.find(
    (row) => row.logicalID === logicalID && row.occurrenceDate === occurrenceDate,
  );
  if (existing) existing.excluded = true;
  else document.occurrenceOverrides.push({ logicalID, occurrenceDate, excluded: true });
}

/** Task completion shared by Today and Planning Daily. Events use `setEventCompletion`. */
export function setCompleted(document: CanonicalDocument, logicalID: string, completed: boolean): void {
  const payload = document.payloads.find((row) => row.id === logicalID);
  if (!payload || payload.kind !== "task") return;
  payload.completed = completed;
}

/** One displayed local day. Does not change the series, other days, or instance overrides. */
export function setEventCompletion(document: CanonicalDocument, logicalID: string, date: string, completed: boolean): boolean {
  const payload = document.payloads.find((row) => row.id === logicalID);
  if (!payload || payload.kind !== "event" || !dayIsCovered(payload, date)) return false;
  const existing = document.dayCompletions.find((row) => row.logicalID === logicalID && row.date === date);
  if (existing) {
    existing.completed = completed;
    return true;
  }
  document.dayCompletions.push({ logicalID, date, completed });
  return true;
}

/** Records one decision. A second write of the same period, item, and occurrence is refused. */
export function recordReflectionDecision(document: CanonicalDocument, decision: ReflectionDecision): boolean {
  const exists = document.reflectionDecisions.some((row) =>
    row.level === decision.level && row.periodKey === decision.periodKey && row.logicalID === decision.logicalID && row.occurrenceDate === decision.occurrenceDate);
  if (exists) return false;
  document.reflectionDecisions.push({ ...decision });
  return true;
}

export function completeReflection(document: CanonicalDocument, id: string, decisionIDs: string[]): boolean {
  if (document.reflectionSnapshots.some((row) => row.id === id)) return false;
  document.reflectionSnapshots.push({ id, completed: true, decisionIDs: [...decisionIDs] });
  return true;
}

function postponeKey(logicalID: string, occurrenceDate?: string): string {
  return `${logicalID}|${occurrenceDate ?? ""}`;
}

/** Adds a box entry. Does not remove the source payload. A recurring series without an occurrence date is rejected. */
export function postponeItem(
  document: CanonicalDocument,
  input: Omit<PostponeEntry, "order" | "kind" | "title" | "iconSymbol"> & Partial<Pick<PostponeEntry, "title" | "iconSymbol" | "order">>,
): boolean {
  const payload = document.payloads.find((row) => row.id === input.logicalID);
  if (!payload || payload.isSample) return false;
  if (payload.recurrence.frequency !== "none" && !input.occurrenceDate) return false;
  if (document.postponeEntries.some((row) => postponeKey(row.logicalID, row.occurrenceDate) === postponeKey(input.logicalID, input.occurrenceDate))) {
    return true;
  }
  document.postponeEntries.push({
    id: input.id,
    logicalID: input.logicalID,
    kind: payload.kind,
    section: input.section,
    originLevel: input.originLevel,
    originPeriodKey: input.originPeriodKey,
    occurrenceDate: input.occurrenceDate,
    title: input.title ?? payload.title,
    iconSymbol: input.iconSymbol ?? payload.iconSymbol,
    colorID: input.colorID ?? payload.colorID,
    reflectionDecisionID: input.reflectionDecisionID,
    order: input.order ?? document.postponeEntries.length,
    isSample: false,
  });
  return true;
}

export function listPostponed(document: CanonicalDocument): PostponeEntry[] {
  return [...document.postponeEntries].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

export function removePostponedEntry(document: CanonicalDocument, id: string): boolean {
  const before = document.postponeEntries.length;
  document.postponeEntries = document.postponeEntries.filter((row) => row.id !== id);
  return document.postponeEntries.length !== before;
}

/** Appends a childless destination copy and removes the box row. The source payload stays put. */
export function restorePostponedItem(document: CanonicalDocument, entryID: string, level: PlanningLevel, periodKey: string): boolean {
  const entry = document.postponeEntries.find((row) => row.id === entryID);
  if (!entry) return false;
  const source = document.payloads.find((row) => row.id === entry.logicalID);
  if (!source) return false;
  if (source.recurrence.frequency !== "none") return false;
  const copyID = `restore:${entryID}:${level}:${periodKey}`;
  const linkedToday = entry.todayTaskID;
  const linkedEvent = entry.eventID;
  const conflict = document.payloads.some((row) =>
    row.id !== copyID && row.origin === level && row.originPeriodKey === periodKey && (
      (linkedToday !== undefined && row.todayTaskID === linkedToday) ||
      (linkedEvent !== undefined && row.id === linkedEvent)
    ));
  if (conflict) return false;
  if (!document.payloads.some((row) => row.id === copyID)) {
    const day = periodKey.length === 7 ? `${periodKey}-01` : periodKey;
    document.payloads.push({
      ...source,
      id: copyID,
      origin: level,
      originPeriodKey: periodKey,
      startDate: day,
      endDate: day,
      title: entry.title,
      parentID: undefined,
      childOrder: undefined,
      completed: false,
      todayTaskID: linkedToday,
      legacyWebID: undefined,
      isSample: false,
    });
  }
  document.postponeEntries = document.postponeEntries.filter((row) => row.id !== entryID);
  return true;
}

const reflectionEditLimit: Record<Exclude<PlanningLevel, "future">, number> = { daily: 7, weekly: 4, monthly: 1 };

/** Revises one decision on a reflection inside the live edit window. Older rows and Future stay unchanged. */
export function reviseLatestReflectionDecision(
  document: CanonicalDocument,
  snapshotID: string,
  decisionID: string,
  disposition: ReflectionDisposition,
): boolean {
  const snapshot = document.reflectionSnapshots.find((row) => row.id === snapshotID);
  const decision = document.reflectionDecisions.find((row) => row.id === decisionID);
  if (!snapshot || !decision || !snapshot.decisionIDs.includes(decision.logicalID)) return false;
  if (decision.level === "future" || !snapshot.completedAt || !snapshot.level) return false;
  const level = snapshot.level;
  if (level === "future" || decision.level !== level) return false;
  const editable = document.reflectionSnapshots
    .filter((row) => row.level === level && row.completedAt)
    .sort((a, b) => (a.completedAt! < b.completedAt! ? 1 : -1))
    .slice(0, reflectionEditLimit[level]);
  if (!editable.some((row) => row.id === snapshotID)) return false;
  if (decision.disposition === disposition) return true;
  const box = document.postponeEntries.find((row) => row.logicalID === decision.logicalID && row.occurrenceDate === decision.occurrenceDate);
  if (decision.disposition === "postpone" && disposition !== "postpone" && box) {
    document.postponeEntries = document.postponeEntries.filter((row) => row.id !== box.id);
  }
  if (disposition === "postpone" && decision.disposition !== "postpone") {
    postponeItem(document, {
      id: `box:${decision.id}`,
      logicalID: decision.logicalID,
      section: decision.level,
      originLevel: decision.level,
      originPeriodKey: decision.periodKey,
      occurrenceDate: decision.occurrenceDate,
      reflectionDecisionID: decision.id,
      todayTaskID: decision.level === "daily" ? decision.logicalID : undefined,
    });
  }
  decision.disposition = disposition;
  return true;
}

/** Writes the snapshot and postpone rows together. A failed check writes nothing. A second call writes nothing. */
export function completeReflectionWithPostponements(
  document: CanonicalDocument,
  snapshotID: string,
  decisions: ReflectionDecision[],
): boolean {
  if (document.reflectionSnapshots.some((row) => row.id === snapshotID)) return false;
  for (const decision of decisions) {
    if (decision.disposition !== "postpone") continue;
    const payload = document.payloads.find((row) => row.id === decision.logicalID);
    if (!payload || payload.isSample) return false;
    if (payload.recurrence.frequency !== "none" && !decision.occurrenceDate) return false;
  }
  for (const decision of decisions) {
    recordReflectionDecision(document, decision);
    if (decision.disposition !== "postpone") continue;
    postponeItem(document, {
      id: `box:${decision.id}`,
      logicalID: decision.logicalID,
      section: decision.level === "future" ? "monthly" : decision.level,
      originLevel: decision.level === "future" ? "monthly" : decision.level,
      originPeriodKey: decision.periodKey,
      occurrenceDate: decision.occurrenceDate,
      reflectionDecisionID: decision.id,
    });
  }
  document.reflectionSnapshots.push({
    id: snapshotID,
    completed: true,
    decisionIDs: decisions.map((row) => row.logicalID),
    level: decisions[0]?.level,
    completedAt: "2026-10-15T00:00:00.000Z",
  });
  return true;
}

export function listPlans(document: CanonicalDocument): PlanRecord[] {
  return document.plans.filter((row) => row.hasBeenSaved).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

export function createPlan(document: CanonicalDocument, plan: PlanRecord): boolean {
  if (document.plans.some((row) => row.id === plan.id)) return false;
  document.plans.unshift(plan);
  return true;
}

export function savePlan(document: CanonicalDocument, id: string, patch: Partial<Pick<PlanRecord, "title" | "memo" | "iconID" | "iconColorID">>): boolean {
  const plan = document.plans.find((row) => row.id === id);
  if (!plan) return false;
  if (plan.hasBeenSaved) plan.replanCount += 1;
  plan.title = patch.title ?? plan.title;
  plan.memo = patch.memo ?? plan.memo;
  plan.iconID = patch.iconID ?? plan.iconID;
  plan.iconColorID = patch.iconColorID ?? plan.iconColorID;
  plan.updatedAt = "2026-10-15T00:00:00.000Z";
  plan.hasBeenSaved = true;
  return true;
}

export function deletePlan(document: CanonicalDocument, id: string): boolean {
  const before = document.plans.length;
  document.plans = document.plans.filter((row) => row.id !== id);
  document.planBullets = document.planBullets.filter((row) => row.planID !== id);
  return document.plans.length !== before;
}

export function planTree(document: CanonicalDocument, planID: string): PlanBulletRecord[] {
  return document.planBullets.filter((row) => row.planID === planID).sort((a, b) => a.order - b.order);
}

export function addPlanBullet(document: CanonicalDocument, bullet: PlanBulletRecord): boolean {
  if (document.planBullets.some((row) => row.id === bullet.id)) return false;
  if (!document.plans.some((row) => row.id === bullet.planID)) return false;
  if (bullet.parentID) {
    const parent = document.planBullets.find((row) => row.id === bullet.parentID && row.planID === bullet.planID);
    if (!parent || parent.parentID) return false;
  }
  document.planBullets.push(bullet);
  return true;
}

export function editPlanBullet(document: CanonicalDocument, id: string, text: string): boolean {
  const bullet = document.planBullets.find((row) => row.id === id);
  if (!bullet) return false;
  bullet.text = text;
  return true;
}

export function deletePlanBullet(document: CanonicalDocument, id: string): boolean {
  const bullet = document.planBullets.find((row) => row.id === id);
  if (!bullet) return false;
  document.planBullets = document.planBullets.filter((row) => row.id !== id && row.parentID !== id);
  return true;
}

function transferPayloadID(bulletID: string, level: PlanningLevel, periodKey: string, kind: PlanningKind): string {
  return `plan-copy:${bulletID}:${level}:${periodKey}:${kind}`;
}

/** Copies selected bullets. The plan stays. The same destination is not copied again. */
export function transferPlan(
  document: CanonicalDocument,
  input: { operationID: string; planID: string; bulletIDs: string[]; includeChildren: boolean; level: PlanningLevel; kind: PlanningKind; periodKey: string },
): boolean {
  if (document.appliedTransfers.includes(input.operationID)) return true;
  const bullets = document.planBullets.filter((row) => row.planID === input.planID);
  if (!document.plans.some((row) => row.id === input.planID) || bullets.length === 0) return false;
  const selected = bullets.filter((row) => input.bulletIDs.includes(row.id));
  if (selected.length === 0) return false;
  if (selected.some((row) => row.parentID && bullets.some((parent) => parent.id === row.parentID && parent.parentID))) return false;
  const stamp = "2026-10-15T00:00:00.000Z";
  const day = input.periodKey.length === 7 ? `${input.periodKey}-01` : input.periodKey;
  const created: CanonicalPayload[] = [];
  for (const bullet of selected.filter((row) => !row.parentID)) {
    const id = transferPayloadID(bullet.id, input.level, input.periodKey, input.kind);
    if (document.payloads.some((row) => row.id === id)) continue;
    created.push({
      id, kind: input.kind, origin: input.level, originPeriodKey: input.periodKey, title: bullet.text,
      iconSymbol: "circle", location: "", memo: "", allDay: false, startDate: day, endDate: day,
      reminders: [], recurrence: { frequency: "none" }, liveActivity: false, updatedAt: stamp, completed: false,
    });
    if (!input.includeChildren) continue;
    for (const child of bullets.filter((row) => row.parentID === bullet.id)) {
      const childID = transferPayloadID(child.id, input.level, input.periodKey, input.kind);
      if (document.payloads.some((row) => row.id === childID) || created.some((row) => row.id === childID)) continue;
      created.push({
        id: childID, kind: input.kind, origin: input.level, originPeriodKey: input.periodKey, title: child.text,
        iconSymbol: "circle", location: "", memo: "", allDay: false, startDate: day, endDate: day,
        reminders: [], recurrence: { frequency: "none" }, liveActivity: false, updatedAt: stamp, completed: false,
        parentID: id, childOrder: child.order,
      });
    }
  }
  for (const bullet of selected.filter((row) => row.parentID && !selected.some((parent) => parent.id === row.parentID))) {
    const id = transferPayloadID(bullet.id, input.level, input.periodKey, input.kind);
    if (document.payloads.some((row) => row.id === id) || created.some((row) => row.id === id)) continue;
    created.push({
      id, kind: input.kind, origin: input.level, originPeriodKey: input.periodKey, title: bullet.text,
      iconSymbol: "circle", location: "", memo: "", allDay: false, startDate: day, endDate: day,
      reminders: [], recurrence: { frequency: "none" }, liveActivity: false, updatedAt: stamp, completed: false,
    });
  }
  document.payloads.push(...created);
  document.appliedTransfers.push(input.operationID);
  return true;
}

export function decodeDocument(raw: Partial<CanonicalDocument> | null | undefined): CanonicalDocument {
  const document = emptyDocument();
  if (!raw || raw.schemaVersion !== CANONICAL_SCHEMA_VERSION) return document;
  document.legacyMigration = "unresolved";
  document.payloads = (raw.payloads ?? []).map((row) => ({
    ...row,
    location: row.location ?? "",
    memo: row.memo ?? "",
    allDay: row.allDay ?? false,
    reminders: row.reminders ?? [],
    recurrence: row.recurrence ?? { frequency: "none" },
    liveActivity: row.liveActivity ?? false,
    completed: row.completed ?? false,
    iconSymbol: row.iconSymbol ?? "calendar",
    isSample: row.isSample ?? false,
    parentID: row.parentID,
    childOrder: row.childOrder,
  }));
  document.reflectionDecisions = raw.reflectionDecisions ?? [];
  document.postponeEntries = raw.postponeEntries ?? [];
  document.plans = raw.plans ?? [];
  document.planBullets = raw.planBullets ?? [];
  document.appliedTransfers = raw.appliedTransfers ?? [];
  document.tombstones = raw.tombstones ?? [];
  document.levelOverrides = raw.levelOverrides ?? [];
  document.occurrenceOverrides = raw.occurrenceOverrides ?? [];
  document.dayCompletions = raw.dayCompletions ?? [];
  document.reflectionSnapshots = raw.reflectionSnapshots ?? [];
  return document;
}

export function restoreDocument(encoded: string): CanonicalDocument {
  try {
    return decodeDocument(JSON.parse(encoded) as Partial<CanonicalDocument>);
  } catch {
    return emptyDocument();
  }
}

/**
 * Native Swift does not read WKWebView localStorage.
 * `AppDelegate` installs `NativeAppRoot` and never creates the Capacitor web view.
 * V3 data lives under the WebKit key `essences-app-data-v3`; leftover events use `calendar-events`.
 * Both are LevelDB website data, not a JSON file. This probe stays unresolved and does not invent an empty import.
 */
export function probeLegacyWebViewCalendar(): "unresolved" {
  return "unresolved";
}

export interface LegacyCalendarRecord {
  id: string;
  title: string;
  date: string;
  endDate?: string;
  allDay?: boolean;
  startTime?: string;
  endTime?: string;
  color?: string;
  location?: string;
  notes?: string;
  reminders?: string[];
  repeat?: RepeatFrequency;
  repeatEndDate?: string;
  liveActivity?: boolean;
  liveActivityLead?: string;
  updatedAt?: string;
  excludeDates?: string[];
  recurrenceMasterId?: string;
  recurrenceDate?: string;
  icon?: string;
}

function minutesOf(clock?: string): number | undefined {
  if (!clock || clock.length < 4) return undefined;
  const [hour, minute] = clock.split(":").map(Number);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return undefined;
  return hour * 60 + minute;
}

export function importLegacyRecords(document: CanonicalDocument, records: LegacyCalendarRecord[]): number {
  let inserted = 0;
  for (const record of records) {
    if (document.payloads.some((row) => row.legacyWebID === record.id || row.id === record.id)) continue;
    const mapped = record.color ? LEGACY_COLOR_MAP[record.color] : undefined;
    const created = createItem(document, {
      legacyWebID: record.id,
      kind: "event",
      origin: "daily",
      originPeriodKey: record.date,
      title: record.title,
      iconSymbol: record.icon,
      colorID: mapped,
      legacyColorKey: record.color,
      location: record.location,
      memo: record.notes,
      allDay: record.allDay ?? false,
      startDate: record.date,
      endDate: record.endDate ?? record.date,
      startMinutes: minutesOf(record.startTime),
      endMinutes: minutesOf(record.endTime),
      reminders: record.reminders,
      recurrence: { frequency: record.repeat ?? "none", endDate: record.repeatEndDate },
      liveActivity: record.liveActivity,
      liveActivityLead: record.liveActivityLead,
      updatedAt: record.updatedAt,
    });
    if (created) inserted += 1;
  }
  return inserted;
}

export interface LegacyImportStats {
  inserted: number;
  skipped: number;
  /** Orphan children and rows that are not a usable series. */
  unsupported: number;
  /** Recurring series left unwritten because one day cannot be represented. */
  deferred: number;
  /** An older import exists and this pass will not rewrite it. */
  reconciliation: number;
  exclusionsAdded: number;
  overridesAdded: number;
}

export type SeriesPreflight =
  | "fullySupported"
  | "unsupportedOccurrenceChanges"
  | "malformedSeries"
  | "alreadyImported"
  | "requiresReconciliation";

export interface LegacyPreflightSummary {
  /** Series and one-time rows. Occurrence children are not counted again. */
  candidates: number;
  importable: number;
  alreadyImported: number;
  deferred: number;
  malformed: number;
  reconciliation: number;
}

function sameList(left?: string[], right?: string[]): boolean {
  const a = left ?? [];
  const b = right ?? [];
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function exceptionUnsupported(series: LegacyCalendarRecord, child: LegacyCalendarRecord): boolean {
  const colorMismatch = child.color !== undefined && child.color !== series.color;
  const iconMismatch = child.icon !== undefined && child.icon !== series.icon;
  const allDayMismatch = child.allDay !== undefined && child.allDay !== series.allDay;
  const seriesEnd = series.endDate ?? series.date;
  const childEnd = child.endDate ?? child.date;
  const seriesSpan = spanDays(series.date, seriesEnd);
  const childSpan = spanDays(child.date, childEnd);
  const spanMismatch = childEnd < child.date || seriesEnd < series.date || childSpan !== seriesSpan;
  return colorMismatch || iconMismatch || allDayMismatch || spanMismatch;
}

function seriesVerdict(
  document: CanonicalDocument,
  row: LegacyCalendarRecord,
  children: LegacyCalendarRecord[],
): SeriesPreflight {
  const exists = document.payloads.some((payload) => payload.legacyWebID === row.id || payload.id === row.id);
  if (children.some((child) => !child.recurrenceDate) || children.some((child) => exceptionUnsupported(row, child))) {
    return exists ? "requiresReconciliation" : "unsupportedOccurrenceChanges";
  }
  return exists ? "alreadyImported" : "fullySupported";
}

/** Counts series rows only. Does not write. */
export function summarizeLegacyImport(document: CanonicalDocument, records: LegacyCalendarRecord[]): LegacyPreflightSummary {
  const series = records.filter((row) => !row.recurrenceMasterId);
  const known = new Set(series.map((row) => row.id));
  const summary: LegacyPreflightSummary = {
    candidates: series.length,
    importable: 0,
    alreadyImported: 0,
    deferred: 0,
    malformed: records.filter((row) => row.recurrenceMasterId && !known.has(row.recurrenceMasterId)).length,
    reconciliation: 0,
  };
  for (const row of series) {
    const children = records.filter((child) => child.recurrenceMasterId === row.id);
    switch (seriesVerdict(document, row, children)) {
      case "fullySupported":
        summary.importable += 1;
        break;
      case "alreadyImported":
        summary.alreadyImported += 1;
        break;
      case "unsupportedOccurrenceChanges":
        summary.deferred += 1;
        break;
      case "requiresReconciliation":
        summary.reconciliation += 1;
        break;
      default:
        summary.malformed += 1;
    }
  }
  return summary;
}

/**
 * A recurring series is written only when every one-day change fits the
 * occurrence model. An unsupported day defers the whole series.
 * An existing payload is not rewritten.
 */
export function applyLegacyCalendarImport(document: CanonicalDocument, records: LegacyCalendarRecord[]): LegacyImportStats {
  const series = records.filter((row) => !row.recurrenceMasterId);
  const known = new Set(series.map((row) => row.id));
  const stats: LegacyImportStats = {
    inserted: 0,
    skipped: 0,
    unsupported: records.filter((row) => row.recurrenceMasterId && !known.has(row.recurrenceMasterId)).length,
    deferred: 0,
    reconciliation: 0,
    exclusionsAdded: 0,
    overridesAdded: 0,
  };
  for (const row of series) {
    const children = records.filter((child) => child.recurrenceMasterId === row.id);
    const verdict = seriesVerdict(document, row, children);
    if (verdict === "unsupportedOccurrenceChanges") {
      stats.deferred += 1;
      continue;
    }
    if (verdict === "requiresReconciliation") {
      stats.reconciliation += 1;
      continue;
    }
    if (verdict === "malformedSeries") {
      stats.unsupported += 1;
      continue;
    }
    if (verdict === "fullySupported") {
      if (importLegacyRecords(document, [row]) === 1) stats.inserted += 1;
      else stats.unsupported += 1;
    } else {
      stats.skipped += 1;
    }
    const master = document.payloads.find((payload) => payload.legacyWebID === row.id || payload.id === row.id);
    if (!master) continue;
    for (const child of children) {
      const date = child.recurrenceDate;
      if (!date) continue;
      if (document.occurrenceOverrides.some((item) => item.logicalID === master.id && item.occurrenceDate === date)) continue;
      editOccurrence(document, master.id, date, {
        title: child.title !== master.title ? child.title : undefined,
        location: child.location !== master.location ? child.location : undefined,
        memo: child.notes !== master.memo ? child.notes : undefined,
        startMinutes: minutesOf(child.startTime),
        endMinutes: minutesOf(child.endTime),
        reminders: sameList(child.reminders, master.reminders) ? undefined : child.reminders,
        liveActivity: child.liveActivity,
        liveActivityLead: child.liveActivityLead,
      });
      stats.overridesAdded += 1;
    }
    for (const date of row.excludeDates ?? []) {
      if (children.some((child) => child.recurrenceDate === date)) continue;
      if (document.occurrenceOverrides.some((item) => item.logicalID === master.id && item.occurrenceDate === date)) continue;
      excludeOccurrence(document, master.id, date);
      stats.exclusionsAdded += 1;
    }
  }
  document.legacyMigration = "unresolved";
  return stats;
}

export function calendarDays(document: CanonicalDocument, day: string): EffectiveItem[] {
  return effectiveItems(document, "daily", day);
}

export type CanonicalLoadState = "absent" | "loaded" | "unreadable";

export interface CanonicalMemory {
  read(key: string): string | undefined;
  write(key: string, value: string): void;
}

/** Drops explicit sample rows. Titles are never used as the signal. */
export function productionDocument(document: CanonicalDocument): CanonicalDocument {
  const sampleIDs = new Set(document.payloads.filter((row) => row.isSample).map((row) => row.id));
  return {
    schemaVersion: CANONICAL_SCHEMA_VERSION,
    legacyMigration: "unresolved",
    payloads: document.payloads.filter((row) => !row.isSample).map((row) => ({ ...row, isSample: false })),
    tombstones: document.tombstones.filter((row) => !sampleIDs.has(row.logicalID)),
    levelOverrides: document.levelOverrides.filter((row) => !sampleIDs.has(row.logicalID)),
    occurrenceOverrides: document.occurrenceOverrides.filter((row) => !sampleIDs.has(row.logicalID)),
    dayCompletions: document.dayCompletions.filter((row) => !sampleIDs.has(row.logicalID)),
    reflectionSnapshots: productionReflectionSnapshots(document, sampleIDs),
    reflectionDecisions: document.reflectionDecisions.filter((row) => !row.isSample && !sampleIDs.has(row.logicalID)),
    postponeEntries: document.postponeEntries.filter((row) => !row.isSample && !sampleIDs.has(row.logicalID)),
    plans: document.plans.filter((row) => !row.isSample),
    planBullets: document.planBullets.filter((row) => !row.isSample && !document.plans.some((plan) => plan.id === row.planID && plan.isSample)),
    appliedTransfers: document.appliedTransfers,
  };
}

/**
 * A snapshot is sample-only when every decision id is a payload still marked `isSample`.
 * Mixed snapshots keep the other ids. Empty or unknown ids stay: they are not sample proof.
 */
function productionReflectionSnapshots(document: CanonicalDocument, sampleIDs: Set<string>): ReflectionSnapshot[] {
  return document.reflectionSnapshots.flatMap((row) => {
    const decisionIDs = row.decisionIDs.filter((id) => !sampleIDs.has(id));
    if (row.decisionIDs.length > 0 && decisionIDs.length === 0) return [];
    return [{ ...row, decisionIDs }];
  });
}

function productionIsEmpty(document: CanonicalDocument): boolean {
  const produced = productionDocument(document);
  return (
    produced.payloads.length === 0 &&
    produced.tombstones.length === 0 &&
    produced.levelOverrides.length === 0 &&
    produced.occurrenceOverrides.length === 0 &&
    produced.dayCompletions.length === 0 &&
    produced.reflectionSnapshots.length === 0 &&
    produced.reflectionDecisions.length === 0 &&
    produced.postponeEntries.length === 0 &&
    produced.plans.length === 0 &&
    produced.planBullets.length === 0
  );
}

export interface OpenCanonicalStore {
  state: CanonicalLoadState;
  document: CanonicalDocument;
  /** False when the bytes were unreadable or the production snapshot did not change. */
  mutate(change: (document: CanonicalDocument) => void): boolean;
}

/**
 * Loads `essences.canonical-planning.v1` without writing.
 * Absent and unreadable stay distinct. Unreadable bytes are never replaced.
 */
export function openCanonicalStore(memory: CanonicalMemory): OpenCanonicalStore {
  const raw = memory.read(STORAGE_KEY);
  let state: CanonicalLoadState = "absent";
  let document = emptyDocument();
  if (raw !== undefined) {
    try {
      const parsed = JSON.parse(raw) as Partial<CanonicalDocument>;
      if (parsed.schemaVersion !== CANONICAL_SCHEMA_VERSION) state = "unreadable";
      else {
        state = "loaded";
        document = decodeDocument(parsed);
      }
    } catch {
      state = "unreadable";
    }
  }
  let lastWritten = state === "loaded" ? JSON.stringify(productionDocument(document)) : undefined;
  return {
    get state() {
      return state;
    },
    get document() {
      return document;
    },
    mutate(change) {
      if (state === "unreadable") return false;
      change(document);
      document.legacyMigration = "unresolved";
      const produced = productionDocument(document);
      if (state === "absent" && productionIsEmpty(produced)) return false;
      const encoded = JSON.stringify(produced);
      if (encoded === lastWritten) return false;
      memory.write(STORAGE_KEY, encoded);
      lastWritten = encoded;
      state = "loaded";
      return true;
    },
  };
}
