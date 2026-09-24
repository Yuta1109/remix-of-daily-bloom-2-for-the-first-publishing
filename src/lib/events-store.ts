/**
 * Calendar event compatibility adapter.
 *
 * Canonical source: V3 `CalendarEventItem` in `essences-app-data-v3`.
 * This module keeps the `CalendarEvent` shape used by EventSheet, recurrence,
 * reminders, notifications, and Live Activity.
 *
 * Sync direction:
 *   UI / EventSheet → upsertEvent / saveEvents → V3 events map
 *   loadEvents → V3 events map → CalendarEvent[]
 *
 * `calendar-events` localStorage is READ-ONLY leftover import. New writes go
 * to V3 only. Recurrence math in this file is unchanged.
 */
import { nowTimestamp } from "@/lib/v3/local-date";
import { loadEssencesData, updateEssencesData } from "@/lib/v3/storage";
import type {
  CalendarEventItem,
  EventLiveActivityLead,
  EventRecurrenceFreq,
  EventReminderOffset,
} from "@/lib/v3/types";

export type RepeatFreq =
  | "none"
  | "daily"
  | "weekly"
  | "monthly"
  | "monthlyWeekday"
  | "yearly";

/**
 * Reminder lead-time options — same set as Live Activity leads.
 * Multiple can be selected per event (stored in `reminders`).
 */
export type ReminderOffset =
  | "at" | "5m" | "10m" | "20m" | "30m"
  | "1h" | "2h" | "3h" | "4h" | "6h" | "8h" | "12h" | "24h";

/**
 * Live Activity lead time: how long before the event start it appears.
 * Apple keeps a Live Activity *active* for at most 8 hours (Lock Screen can
 * linger up to 12 hours total). Options above 8h are accepted for migration
 * but clamped by `effectiveLiveActivityLeadMinutes`.
 */
export type LiveActivityLead =
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

/** ActivityKit active-window ceiling (Lock Screen Live Activity updates). */
export const LIVE_ACTIVITY_MAX_ACTIVE_MINUTES = 8 * 60;

/** Lock Screen visibility ceiling after the activity becomes inactive. */
export const LIVE_ACTIVITY_MAX_LOCK_SCREEN_HOURS = 12;

export interface CalendarEvent {
  id: string;
  title: string;
  date: string;         // YYYY-MM-DD (start date)
  endDate?: string;     // YYYY-MM-DD (end date, defaults to date)
  allDay?: boolean;
  startTime?: string;   // HH:mm (when !allDay)
  endTime?: string;     // HH:mm (when !allDay)
  color?: string;       // token key: 'blue' | 'green' | 'orange' | 'pink' | 'purple' | 'red'
  /** Multiple reminder offsets. Replaces the old single `reminder` field. */
  reminders?: ReminderOffset[];
  /** @deprecated Use `reminders` instead. Kept for backward-compat migration. */
  reminder?: string;
  repeat?: RepeatFreq;
  location?: string;
  notes?: string;
  /** Whether this event shows a Lock Screen Live Activity (iOS only). */
  liveActivity?: boolean;
  /** How long before start the Live Activity begins. Defaults to "1h". */
  liveActivityLead?: LiveActivityLead;
  /**
   * Occurrence start dates (YYYY-MM-DD) skipped in a repeating series
   * (deleted this day only, or replaced by a detached exception).
   */
  excludeDates?: string[];
  /**
   * No series occurrences on or after this YYYY-MM-DD
   * (“delete this and all future”).
   */
  repeatEndDate?: string;
  /** Detached single-day copy of a repeating series. */
  recurrenceMasterId?: string;
  /** Series occurrence date this exception replaces. */
  recurrenceDate?: string;
}

/** Minutes-before-start for each reminder offset. Returns null when disabled. */
export function reminderOffsetMinutes(r?: ReminderOffset | string): number | null {
  switch (r) {
    case "at":   return 0;
    case "5m":   return 5;
    case "10m":  return 10;
    case "15m":  return 15; // legacy
    case "20m":  return 20;
    case "30m":  return 30;
    case "1h":   return 60;
    case "2h":   return 120;
    case "3h":   return 180;
    case "4h":   return 240;
    case "6h":   return 360;
    case "8h":   return 480;
    case "12h":  return 720;
    case "24h":  return 1440;
    case "1d":   return 1440; // legacy alias
    default:     return null;
  }
}

/**
 * Returns the effective reminders array for an event, supporting
 * both the new `reminders[]` field and the legacy `reminder` string.
 */
export function getReminders(e: CalendarEvent): ReminderOffset[] {
  if (e.reminders && e.reminders.length > 0) return e.reminders;
  const legacy = e.reminder;
  if (legacy && legacy !== "none" && reminderOffsetMinutes(legacy) !== null) {
    return [legacy as ReminderOffset];
  }
  return [];
}

/** Minutes-before-start for each Live Activity lead time (unclamped). */
export function liveActivityLeadMinutes(l?: LiveActivityLead): number {
  switch (l) {
    case "24h":
      return 1440;
    case "12h":
      return 720;
    case "8h":
      return 480;
    case "6h":
      return 360;
    case "4h":
      return 240;
    case "3h":
      return 180;
    case "2h":
      return 120;
    case "1h":
      return 60;
    case "30m":
      return 30;
    case "20m":
      return 20;
    case "10m":
      return 10;
    case "5m":
      return 5;
    default:
      return 60;
  }
}

/** Lead minutes clamped to Apple's 8-hour active Live Activity limit. */
export function effectiveLiveActivityLeadMinutes(l?: LiveActivityLead): number {
  return Math.min(liveActivityLeadMinutes(l), LIVE_ACTIVITY_MAX_ACTIVE_MINUTES);
}

const LEGACY_KEY = "calendar-events";
const LEFTOVER_IMPORT_MARKER = "essences-calendar-adapter-imported-v1";

let leftoverImportAttempted = false;

export function resetCalendarAdapterForTests(): void {
  leftoverImportAttempted = false;
}

function clockOf(localDateTime: string | undefined, fallback = "00:00"): string {
  if (!localDateTime || localDateTime.length < 16) return fallback;
  return localDateTime.slice(11, 16);
}

function dateOf(localDateTime: string | undefined, fallback: string): string {
  if (!localDateTime || localDateTime.length < 10) return fallback;
  return localDateTime.slice(0, 10);
}

export function v3ItemToCalendarEvent(item: CalendarEventItem): CalendarEvent {
  const date = dateOf(item.startAt, "");
  const endDateRaw = item.endAt ? dateOf(item.endAt, date) : undefined;
  return {
    id: item.id,
    title: item.title,
    date,
    endDate: endDateRaw && endDateRaw !== date ? endDateRaw : undefined,
    allDay: item.allDay,
    startTime: item.allDay ? undefined : clockOf(item.startAt),
    endTime: item.allDay || !item.endAt ? undefined : clockOf(item.endAt),
    color: item.color,
    reminders: item.reminders as ReminderOffset[] | undefined,
    repeat: (item.recurrence?.freq ?? "none") as RepeatFreq,
    location: item.location,
    notes: item.note,
    liveActivity: item.liveActivity,
    liveActivityLead: item.liveActivityLead as LiveActivityLead | undefined,
    excludeDates: item.excludeDates,
    repeatEndDate: item.repeatEndDate,
    recurrenceMasterId: item.recurrenceMasterId,
    recurrenceDate: item.recurrenceDate,
  };
}

export function calendarEventToV3Item(
  event: CalendarEvent,
  existing?: CalendarEventItem,
): CalendarEventItem {
  const allDay = event.allDay ?? !event.startTime;
  const startClock = allDay ? "00:00" : event.startTime || "00:00";
  const endDate = event.endDate || event.date;
  const endClock = allDay ? "00:00" : event.endTime || startClock;
  const hasEnd =
    (!allDay && !!event.endTime) || (!!event.endDate && event.endDate !== event.date);
  const repeat = (event.repeat ?? existing?.recurrence?.freq ?? "none") as EventRecurrenceFreq;
  const now = nowTimestamp();
  const reminders = getReminders(event) as EventReminderOffset[];
  return {
    id: event.id,
    title: event.title,
    note: event.notes,
    startAt: `${event.date}T${startClock}`,
    endAt: hasEnd ? `${endDate}T${endClock}` : undefined,
    allDay,
    icon: existing?.icon,
    color: event.color ?? existing?.color,
    recurrence: repeat !== "none" ? { freq: repeat } : undefined,
    recurrenceMasterId: event.recurrenceMasterId,
    recurrenceDate: event.recurrenceDate,
    excludeDates: event.excludeDates,
    repeatEndDate: event.repeatEndDate,
    reminders: reminders.length ? reminders : undefined,
    liveActivity: event.liveActivity,
    liveActivityLead: event.liveActivityLead as EventLiveActivityLead | undefined,
    location: event.location,
    status: existing?.status && existing.status !== "archived" ? existing.status : "scheduled",
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    createdFrom: existing?.createdFrom ?? "calendar",
  };
}

function importLeftoverCalendarEvents(): void {
  if (leftoverImportAttempted) return;
  leftoverImportAttempted = true;
  try {
    if (localStorage.getItem(LEFTOVER_IMPORT_MARKER) === "1") return;
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) {
      localStorage.setItem(LEFTOVER_IMPORT_MARKER, "1");
      return;
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) {
      localStorage.setItem(LEFTOVER_IMPORT_MARKER, "1");
      return;
    }
    updateEssencesData((data) => {
      for (const entry of parsed) {
        if (!entry || typeof entry !== "object") continue;
        const legacy = entry as CalendarEvent;
        if (!legacy.id) continue;
        if (data.events[legacy.id]) continue;
        if (data.events[`legacy-event:${legacy.id}`]) continue;
        data.events[legacy.id] = calendarEventToV3Item(legacy);
      }
    });
    localStorage.setItem(LEFTOVER_IMPORT_MARKER, "1");
  } catch {
    leftoverImportAttempted = false;
  }
}

export function loadEvents(): CalendarEvent[] {
  importLeftoverCalendarEvents();
  return Object.values(loadEssencesData().events)
    .filter((event) => event.status !== "archived")
    .map(v3ItemToCalendarEvent);
}

export function saveEvents(events: CalendarEvent[]) {
  importLeftoverCalendarEvents();
  updateEssencesData((data) => {
    const next: Record<string, CalendarEventItem> = {};
    for (const event of events) {
      next[event.id] = calendarEventToV3Item(event, data.events[event.id]);
    }
    data.events = next;
  });
}

export function getEvent(id: string): CalendarEvent | undefined {
  return loadEvents().find((e) => e.id === id);
}

export function upsertEvent(event: CalendarEvent) {
  importLeftoverCalendarEvents();
  updateEssencesData((data) => {
    data.events[event.id] = calendarEventToV3Item(event, data.events[event.id]);
  });
  return loadEvents();
}

export function deleteEvent(id: string) {
  importLeftoverCalendarEvents();
  updateEssencesData((data) => {
    delete data.events[id];
  });
  return loadEvents();
}

export const EVENT_COLORS: { key: string; label: string; hsl: string }[] = [
  { key: "blue", label: "Blue", hsl: "212 90% 55%" },
  { key: "green", label: "Green", hsl: "145 60% 45%" },
  { key: "orange", label: "Orange", hsl: "25 90% 55%" },
  { key: "pink", label: "Pink", hsl: "335 78% 62%" },
  { key: "purple", label: "Purple", hsl: "265 65% 60%" },
  { key: "red", label: "Red", hsl: "0 75% 58%" },
  { key: "teal", label: "Teal", hsl: "180 60% 42%" },
  { key: "gray", label: "Gray", hsl: "220 8% 55%" },
];

export function colorHslFor(key?: string): string {
  return EVENT_COLORS.find((c) => c.key === key)?.hsl ?? "212 90% 55%";
}

export function parseYMD(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
export function toYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function diffDays(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / 86400000);
}

export function addDaysYMD(ymd: string, days: number): string {
  const d = parseYMD(ymd);
  d.setDate(d.getDate() + days);
  return toYMD(d);
}

/** 1-based index of this weekday in the month (1=first, 5=fifth/last-ish). */
export function weekdayOccurrenceInMonth(d: Date): number {
  return Math.floor((d.getDate() - 1) / 7) + 1;
}

export function matchesMonthlyWeekday(seriesStart: Date, target: Date): boolean {
  if (target.getDay() !== seriesStart.getDay()) return false;
  const want = weekdayOccurrenceInMonth(seriesStart);
  const got = weekdayOccurrenceInMonth(target);
  if (got === want) return true;
  // If series is 5th weekday and month has only 4, treat last as match when want===5.
  if (want >= 5) {
    const next = new Date(target);
    next.setDate(next.getDate() + 7);
    return next.getMonth() !== target.getMonth() && got === weekdayOccurrenceInMonth(target);
  }
  return false;
}

export function isRepeating(e: CalendarEvent): boolean {
  return !!e.repeat && e.repeat !== "none" && !e.recurrenceMasterId;
}

export function eventSpanDays(e: CalendarEvent): number {
  return Math.max(0, diffDays(parseYMD(e.endDate || e.date), parseYMD(e.date)));
}

/** Whether a repeat rule is allowed for this event's length. */
export function repeatAllowedForEvent(
  e: Pick<CalendarEvent, "date" | "endDate">,
  repeat: RepeatFreq,
): boolean {
  const span = Math.max(
    0,
    diffDays(parseYMD(e.endDate || e.date), parseYMD(e.date)),
  );
  if (repeat === "daily" && span >= 1) return false;
  if (repeat === "weekly" && span >= 7) return false;
  return true;
}


/** Find a detached exception for a series occurrence. */
export function findExceptionFor(
  masterId: string,
  occurrenceDate: string,
  events?: CalendarEvent[],
): CalendarEvent | undefined {
  return (events ?? loadEvents()).find(
    (e) => e.recurrenceMasterId === masterId && e.recurrenceDate === occurrenceDate,
  );
}

/**
 * Start date (YYYY-MM-DD) of the series occurrence that covers `viewDate`,
 * or null if the series does not cover that day.
 */
export function occurrenceStartForDate(e: CalendarEvent, viewDate: string): string | null {
  if (!eventOccursOn(e, viewDate)) return null;
  if (!isRepeating(e)) return e.date;

  const target = parseYMD(viewDate);
  const start = parseYMD(e.date);
  const span = eventSpanDays(e);

  switch (e.repeat) {
    case "daily": {
      // Occurrences start every day from series start; the one covering target
      // starts at most `span` days before target, on/after series start.
      const earliest = new Date(target);
      earliest.setDate(earliest.getDate() - span);
      const occ = earliest < start ? new Date(start) : earliest;
      return toYMD(occ);
    }
    case "weekly": {
      const delta = diffDays(target, start);
      const occOffset = Math.floor(delta / 7) * 7;
      const occStart = new Date(start);
      occStart.setDate(occStart.getDate() + occOffset);
      return toYMD(occStart);
    }
    case "monthly": {
      const occStart = new Date(target.getFullYear(), target.getMonth(), start.getDate());
      if (occStart.getMonth() !== target.getMonth()) return null;
      return toYMD(occStart);
    }
    case "monthlyWeekday": {
      for (let back = 0; back <= span; back++) {
        const cand = new Date(target);
        cand.setDate(cand.getDate() - back);
        if (cand < start) break;
        if (matchesMonthlyWeekday(start, cand)) return toYMD(cand);
      }
      return null;
    }
    case "yearly": {
      const occStart = new Date(target.getFullYear(), start.getMonth(), start.getDate());
      return toYMD(occStart);
    }
    default:
      return e.date;
  }
}

/** Concrete copy of a series occurrence with dates shifted to that instance. */
export function materializeOccurrence(
  e: CalendarEvent,
  occurrenceStartYmd: string,
): CalendarEvent {
  const span = eventSpanDays(e);
  return {
    ...e,
    date: occurrenceStartYmd,
    endDate: addDaysYMD(occurrenceStartYmd, span),
  };
}

/** Exclude one occurrence from a repeating master (delete this day only). */
export function excludeOccurrence(masterId: string, occurrenceDate: string) {
  const master = getEvent(masterId);
  if (!master) return loadEvents();
  const excludeDates = Array.from(
    new Set([...(master.excludeDates ?? []), occurrenceDate]),
  );
  // Drop a detached exception for that day if present.
  let events = loadEvents().filter(
    (e) => !(e.recurrenceMasterId === masterId && e.recurrenceDate === occurrenceDate),
  );
  events = events.map((e) =>
    e.id === masterId ? { ...e, excludeDates } : e,
  );
  saveEvents(events);
  return events;
}

/**
 * End the series on/after `occurrenceDate` (delete this and future).
 * Past occurrences before that date remain.
 */
export function endSeriesOn(masterId: string, occurrenceDate: string) {
  const master = getEvent(masterId);
  if (!master) return loadEvents();
  let events = loadEvents().filter((e) => {
    if (e.recurrenceMasterId !== masterId) return true;
    // Remove exceptions on/after the cut date.
    return (e.recurrenceDate ?? e.date) < occurrenceDate;
  });
  events = events.map((e) => {
    if (e.id !== masterId) return e;
    const excludeDates = (e.excludeDates ?? []).filter((d) => d < occurrenceDate);
    return {
      ...e,
      repeatEndDate: occurrenceDate,
      excludeDates: excludeDates.length ? excludeDates : undefined,
    };
  });
  saveEvents(events);
  return events;
}

/**
 * End the old series on `fromDate` (keep earlier occurrences) and create a new
 * master starting at `fromDate` with `next` fields (avoids double-booking).
 */
export function replaceSeriesFromDate(
  masterId: string,
  fromDate: string,
  next: CalendarEvent,
): CalendarEvent {
  endSeriesOn(masterId, fromDate);
  // Drop exceptions on/after fromDate that belonged to the old master (endSeriesOn already does).
  const created: CalendarEvent = {
    ...next,
    id: crypto.randomUUID(),
    date: fromDate,
    endDate: addDaysYMD(fromDate, eventSpanDays(next)),
    recurrenceMasterId: undefined,
    recurrenceDate: undefined,
    excludeDates: undefined,
    repeatEndDate: undefined,
  };
  upsertEvent(created);
  return created;
}

/** Label helpers for monthly weekday (ja/en). */
export function monthlyWeekdayLabel(ymd: string, locale: "en" | "ja"): string {
  const d = parseYMD(ymd);
  const n = weekdayOccurrenceInMonth(d);
  const weekday = d.getDay();
  if (locale === "ja") {
    const days = ["日", "月", "火", "水", "木", "金", "土"];
    const nth = ["", "第1", "第2", "第3", "第4", "第5"];
    return `毎月${nth[n] ?? `第${n}`}${days[weekday]}曜日`;
  }
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const nth = ["", "1st", "2nd", "3rd", "4th", "5th"];
  return `Monthly on the ${nth[n] ?? `${n}th`} ${days[weekday]}`;
}

export function monthlyDayLabel(ymd: string, locale: "en" | "ja"): string {
  const d = parseYMD(ymd);
  const day = d.getDate();
  return locale === "ja" ? `毎月${day}日` : `Monthly on day ${day}`;
}

/**
 * Save edits to a single series occurrence as a detached copy (repeat: none)
 * and exclude that date from the master.
 */
export function saveOccurrenceException(
  masterId: string,
  occurrenceDate: string,
  patched: CalendarEvent,
): CalendarEvent {
  const master = getEvent(masterId);
  if (!master) {
    upsertEvent(patched);
    return patched;
  }
  const existing = findExceptionFor(masterId, occurrenceDate);
  const exception: CalendarEvent = {
    ...patched,
    id: existing?.id ?? crypto.randomUUID(),
    repeat: "none",
    excludeDates: undefined,
    repeatEndDate: undefined,
    recurrenceMasterId: masterId,
    recurrenceDate: occurrenceDate,
  };
  const excludeDates = Array.from(
    new Set([...(master.excludeDates ?? []), occurrenceDate]),
  );
  const events = loadEvents()
    .filter((e) => e.id !== exception.id)
    .map((e) => (e.id === masterId ? { ...e, excludeDates } : e));
  events.push(exception);
  saveEvents(events);
  return exception;
}

/** Returns true if the event (with its recurrence) occurs on `date`. */
export function eventOccursOn(e: CalendarEvent, date: string): boolean {
  if (e.excludeDates?.includes(date)) return false;
  if (e.repeatEndDate && date >= e.repeatEndDate) return false;

  const target = parseYMD(date);
  const start = parseYMD(e.date);
  const end = parseYMD(e.endDate || e.date);
  const spanDays = Math.max(0, diffDays(end, start));

  const covers = (occStart: Date) => {
    const occEnd = new Date(occStart);
    occEnd.setDate(occEnd.getDate() + spanDays);
    return target >= occStart && target <= occEnd;
  };

  // Detached exceptions / non-repeating.
  if (!isRepeating(e)) return covers(start);
  if (target < start) return false;

  switch (e.repeat) {
    case "daily":
      return true;
    case "weekly": {
      const delta = diffDays(target, start);
      const occOffset = Math.floor(delta / 7) * 7;
      const occStart = new Date(start);
      occStart.setDate(occStart.getDate() + occOffset);
      return covers(occStart);
    }
    case "monthly": {
      const occStart = new Date(target.getFullYear(), target.getMonth(), start.getDate());
      if (occStart.getMonth() !== target.getMonth()) return false;
      if (occStart < start) return false;
      return covers(occStart);
    }
    case "monthlyWeekday": {
      for (let back = 0; back <= spanDays; back++) {
        const cand = new Date(target);
        cand.setDate(cand.getDate() - back);
        if (cand < start) break;
        if (matchesMonthlyWeekday(start, cand)) return covers(cand);
      }
      return false;
    }
    case "yearly": {
      const occStart = new Date(target.getFullYear(), start.getMonth(), start.getDate());
      if (occStart < start) return false;
      return covers(occStart);
    }
  }
}

/** Returns true if a fresh occurrence of `e` *starts* on `date` (not just spans it). */
export function isOccurrenceStart(e: CalendarEvent, date: string): boolean {
  if (e.excludeDates?.includes(date)) return false;
  if (e.repeatEndDate && date >= e.repeatEndDate) return false;

  const target = parseYMD(date);
  const start = parseYMD(e.date);
  if (target < start) return false;

  if (!isRepeating(e)) {
    return date === e.date;
  }
  switch (e.repeat) {
    case "daily":
      return true;
    case "weekly":
      return diffDays(target, start) % 7 === 0;
    case "monthly":
      return target.getDate() === start.getDate();
    case "monthlyWeekday":
      return matchesMonthlyWeekday(start, target);
    case "yearly":
      return target.getDate() === start.getDate() && target.getMonth() === start.getMonth();
    default:
      return false;
  }
}

/**
 * Concrete start Date/times of upcoming occurrences of `e`, within `horizonDays`
 * from `from`. All-day events anchor to 09:00 local time.
 */
export function upcomingOccurrenceStarts(
  e: CalendarEvent,
  from: Date,
  horizonDays = 120,
  max = 30,
): Date[] {
  const results: Date[] = [];
  const cursor = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const [sh, sm] = (e.allDay ? "09:00" : e.startTime || "09:00")
    .split(":")
    .map(Number);

  for (let i = 0; i <= horizonDays && results.length < max; i++) {
    const ymd = toYMD(cursor);
    if (isOccurrenceStart(e, ymd)) {
      const d = new Date(cursor);
      d.setHours(sh, sm, 0, 0);
      if (d.getTime() > from.getTime()) results.push(d);
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return results;
}

export function eventsForDate(date: string, events?: CalendarEvent[]): CalendarEvent[] {
  const list = (events ?? loadEvents()).filter((e) => eventOccursOn(e, date));
  return list.sort((a, b) => {
    if (a.allDay && !b.allDay) return -1;
    if (!a.allDay && b.allDay) return 1;
    return (a.startTime || "").localeCompare(b.startTime || "");
  });
}

export function eventsInRange(fromDate: string, toDate: string, events?: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const list = events ?? loadEvents();
  const from = parseYMD(fromDate);
  const to = parseYMD(toDate);
  const map = new Map<string, CalendarEvent[]>();
  for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
    const key = toYMD(d);
    const day = eventsForDate(key, list);
    if (day.length) map.set(key, day);
  }
  return map;
}
