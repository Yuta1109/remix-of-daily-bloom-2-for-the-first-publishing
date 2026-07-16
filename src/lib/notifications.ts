import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { LocalNotifications, type PermissionStatus } from "@capacitor/local-notifications";
import {
  loadEvents,
  reminderOffsetMinutes,
  getReminders,
  upcomingOccurrenceStarts,
  type CalendarEvent,
} from "./events-store";
import { liveActivityWakeTimes } from "./live-activity";
import { formatEventSchedule } from "./event-display";

const MAX_SCHEDULED = 60;
const HORIZON_DAYS = 120;
const NOTIF_PREF_KEY = "essences-notif-user-enabled";

export type NotificationPermissionState = PermissionStatus["display"];

export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

/** User-level preference (separate from OS permission). Defaults to true. */
export function getNotificationsUserEnabled(): boolean {
  try {
    return localStorage.getItem(NOTIF_PREF_KEY) !== "false";
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

export async function checkPermission(): Promise<NotificationPermissionState> {
  if (!isNative()) return "denied";
  const status = await LocalNotifications.checkPermissions();
  return status.display;
}

/**
 * Requests notification permission when possible.
 * Always calls `requestPermissions` unless already granted — never permanently
 * blocks the UI after a single deny (iOS may still no-op if Settings locked).
 */
export async function ensurePermission(): Promise<boolean> {
  if (!isNative()) return false;
  const status = await LocalNotifications.checkPermissions();
  if (status.display === "granted") return true;

  try {
    const req = await LocalNotifications.requestPermissions();
    return req.display === "granted";
  } catch {
    return false;
  }
}

/** Open the system Settings page for this app (iOS `app-settings:`). */
export async function openAppSettings(): Promise<void> {
  if (!isNative()) return;
  try {
    await App.openUrl({ url: "app-settings:" });
  } catch {
    /* ignore */
  }
}

function buildTitle(e: CalendarEvent): string {
  return `予定：${e.title}`;
}

function buildBody(e: CalendarEvent): string {
  const parts: string[] = [];
  const schedule = formatEventSchedule(e, "ja");
  if (schedule) parts.push(schedule);
  if (e.location) parts.push(e.location);
  return parts.join("  ·  ");
}

interface ScheduledItem {
  at: Date;
  event: CalendarEvent;
  kind: "reminder" | "liveActivityWake";
}

function currentLocale(): "en" | "ja" {
  try {
    const saved = localStorage.getItem("growth-app-lang");
    if (saved === "ja" || saved === "en") return saved;
  } catch {
    /* ignore */
  }
  return (navigator.language || "en").startsWith("ja") ? "ja" : "en";
}

function buildLaWakeTitle(e: CalendarEvent): string {
  const locale = currentLocale();
  return locale === "ja" ? `予定：${e.title}` : `Event: ${e.title}`;
}

function buildLaWakeBody(): string {
  const locale = currentLocale();
  return locale === "ja"
    ? "タップしてロック画面にカウントダウンを表示"
    : "Tap to show the countdown on your Lock Screen";
}

/**
 * Cancels all pending notifications and reschedules them based on current events.
 * Respects the user-level toggle (getNotificationsUserEnabled).
 */
export async function rescheduleAll(): Promise<void> {
  if (!isNative()) return;

  const perm = await LocalNotifications.checkPermissions();
  if (perm.display !== "granted") return;

  const pending = await LocalNotifications.getPending();
  if (pending.notifications.length) {
    await LocalNotifications.cancel({
      notifications: pending.notifications.map((n) => ({ id: n.id })),
    });
  }

  if (!getNotificationsUserEnabled()) return;

  const now = new Date();
  const items: ScheduledItem[] = [];

  for (const event of loadEvents()) {
    const reminders = getReminders(event);
    if (reminders.length === 0) continue;

    const starts = upcomingOccurrenceStarts(event, now, HORIZON_DAYS, 20);
    for (const start of starts) {
      for (const reminder of reminders) {
        const offset = reminderOffsetMinutes(reminder);
        if (offset === null) continue;
        const at = new Date(start.getTime() - offset * 60_000);
        if (at.getTime() > now.getTime()) {
          items.push({ at, event, kind: "reminder" });
        }
      }
    }
  }

  if (Capacitor.getPlatform() === "ios") {
    for (const { at, event } of liveActivityWakeTimes(now, HORIZON_DAYS)) {
      items.push({ at, event, kind: "liveActivityWake" });
    }
  }

  items.sort((a, b) => a.at.getTime() - b.at.getTime());
  const slice = items.slice(0, MAX_SCHEDULED);
  if (slice.length === 0) return;

  let id = 1;
  await LocalNotifications.schedule({
    notifications: slice.map(({ at, event, kind }) => ({
      id: id++,
      title: kind === "liveActivityWake" ? buildLaWakeTitle(event) : buildTitle(event),
      body: kind === "liveActivityWake" ? buildLaWakeBody() : buildBody(event),
      schedule: { at, allowWhileIdle: true },
    })),
  });
}
