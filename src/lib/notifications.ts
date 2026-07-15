import { Capacitor } from "@capacitor/core";
import { LocalNotifications, type PermissionStatus } from "@capacitor/local-notifications";
import {
  loadEvents,
  reminderOffsetMinutes,
  upcomingOccurrenceStarts,
  type CalendarEvent,
} from "./events-store";

/**
 * iOS allows at most 64 pending local notifications. We keep a safety margin
 * and distribute the budget across events by soonest fire time.
 */
const MAX_SCHEDULED = 60;
const HORIZON_DAYS = 120;

const NOTIF_PREF_KEY = "essences-notif-user-enabled";

export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

/** User-level preference (independent of OS permission). Defaults to true. */
export function getNotificationsUserEnabled(): boolean {
  try {
    const stored = localStorage.getItem(NOTIF_PREF_KEY);
    return stored !== "false";
  } catch {
    return true;
  }
}

export function setNotificationsUserEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(NOTIF_PREF_KEY, enabled ? "true" : "false");
  } catch {
    /* ignore */
  }
}

export async function checkPermission(): Promise<PermissionStatus["display"]> {
  if (!isNative()) return "denied";
  const status = await LocalNotifications.checkPermissions();
  return status.display;
}

/** Requests notification permission if not yet granted. Returns true when granted. */
export async function ensurePermission(): Promise<boolean> {
  if (!isNative()) return false;
  const status = await LocalNotifications.checkPermissions();
  if (status.display === "granted") return true;
  if (status.display === "denied") return false;
  const req = await LocalNotifications.requestPermissions();
  return req.display === "granted";
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function timeRangeLabel(e: CalendarEvent): string {
  if (e.allDay || !e.startTime) return "";
  const start = e.startTime; // "HH:mm"
  const end = e.endTime ?? "";
  return end ? `⏰ ${start} - ${end}` : `⏰ ${start}`;
}

function buildTitle(e: CalendarEvent): string {
  return `予定：${e.title}`;
}

function buildBody(e: CalendarEvent): string {
  const timeRange = timeRangeLabel(e);
  const parts: string[] = [];
  if (timeRange) parts.push(timeRange);
  if (e.location) parts.push(e.location);
  return parts.join("  ·  ");
}

interface ScheduledItem {
  at: Date;
  event: CalendarEvent;
}

/**
 * Cancels all pending notifications and reschedules them from the current
 * event list. Call after any event add/edit/delete and on app resume.
 *
 * If the user has toggled notifications off (user preference), all pending
 * notifications are cancelled and nothing new is scheduled.
 */
export async function rescheduleAll(): Promise<void> {
  if (!isNative()) return;
  const perm = await LocalNotifications.checkPermissions();
  if (perm.display !== "granted") return;

  // Cancel everything first regardless of user preference.
  const pending = await LocalNotifications.getPending();
  if (pending.notifications.length) {
    await LocalNotifications.cancel({
      notifications: pending.notifications.map((n) => ({ id: n.id })),
    });
  }

  // Respect the user-level toggle.
  if (!getNotificationsUserEnabled()) return;

  const now = new Date();
  const items: ScheduledItem[] = [];

  for (const event of loadEvents()) {
    const offset = reminderOffsetMinutes(event.reminder);
    if (offset === null) continue;
    const starts = upcomingOccurrenceStarts(event, now, HORIZON_DAYS, 20);
    for (const start of starts) {
      const at = new Date(start.getTime() - offset * 60_000);
      if (at.getTime() > now.getTime()) items.push({ at, event });
    }
  }

  items.sort((a, b) => a.at.getTime() - b.at.getTime());
  const slice = items.slice(0, MAX_SCHEDULED);
  if (slice.length === 0) return;

  let id = 1;
  await LocalNotifications.schedule({
    notifications: slice.map(({ at, event }) => ({
      id: id++,
      title: buildTitle(event),
      body: buildBody(event),
      schedule: { at, allowWhileIdle: true },
    })),
  });
}
