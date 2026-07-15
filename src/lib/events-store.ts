export type RepeatFreq = "none" | "daily" | "weekly" | "monthly" | "yearly";

/**
 * Reminder lead-time options — same set as Live Activity leads.
 * Multiple can be selected per event (stored in `reminders`).
 */
export type ReminderOffset =
  | "at" | "5m" | "10m" | "20m" | "30m"
  | "1h" | "2h" | "3h" | "4h" | "6h" | "8h" | "12h" | "24h";

/** Live Activity lead time: how long before the event start it appears on the Lock Screen. */
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

/** Minutes-before-start for each Live Activity lead time. */
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

const KEY = "calendar-events";

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

export function loadEvents(): CalendarEvent[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveEvents(events: CalendarEvent[]) {
  localStorage.setItem(KEY, JSON.stringify(events));
}

export function getEvent(id: string): CalendarEvent | undefined {
  return loadEvents().find((e) => e.id === id);
}

export function upsertEvent(event: CalendarEvent) {
  const events = loadEvents();
  const idx = events.findIndex((e) => e.id === event.id);
  if (idx >= 0) events[idx] = event;
  else events.push(event);
  saveEvents(events);
  return events;
}

export function deleteEvent(id: string) {
  const next = loadEvents().filter((e) => e.id !== id);
  saveEvents(next);
  return next;
}

function parseYMD(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function toYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function diffDays(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / 86400000);
}

/** Returns true if the event (with its recurrence) occurs on `date`. */
export function eventOccursOn(e: CalendarEvent, date: string): boolean {
  const target = parseYMD(date);
  const start = parseYMD(e.date);
  const end = parseYMD(e.endDate || e.date);
  const spanDays = Math.max(0, diffDays(end, start));

  // helper: does an occurrence starting on `occStart` cover target?
  const covers = (occStart: Date) => {
    const occEnd = new Date(occStart);
    occEnd.setDate(occEnd.getDate() + spanDays);
    return target >= occStart && target <= occEnd;
  };

  if (!e.repeat || e.repeat === "none") return covers(start);
  if (target < start) return false;

  switch (e.repeat) {
    case "daily":
      return true;
    case "weekly": {
      const delta = diffDays(target, start);
      // find the occurrence start that could cover target: last multiple of 7 <= delta
      const occOffset = Math.floor(delta / 7) * 7;
      const occStart = new Date(start);
      occStart.setDate(occStart.getDate() + occOffset);
      return covers(occStart);
    }
    case "monthly": {
      // occurrence starts on same day-of-month each month
      const occStart = new Date(target.getFullYear(), target.getMonth(), start.getDate());
      if (occStart.getMonth() !== target.getMonth()) return false;
      if (occStart < start) return false;
      return covers(occStart);
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
  const target = parseYMD(date);
  const start = parseYMD(e.date);
  if (target < start) return false;

  if (!e.repeat || e.repeat === "none") {
    return date === e.date;
  }
  switch (e.repeat) {
    case "daily":
      return true;
    case "weekly":
      return diffDays(target, start) % 7 === 0;
    case "monthly":
      return target.getDate() === start.getDate();
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
