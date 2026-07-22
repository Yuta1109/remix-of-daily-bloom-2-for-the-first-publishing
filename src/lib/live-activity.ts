import { Capacitor, registerPlugin } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import {
  collectLiveActivityWindows,
  LIVE_ACTIVITY_ARRIVED_MS,
} from "./live-activity-window";

/**
 * Live Activity design (ActivityKit / Apple HIG):
 *
 * - Minimum iOS 17.2 (ActivityKit push-to-start; no wake-notification fallback).
 * - One shared Lock Screen activity (max 3 event rows).
 * - showAt = start − lead (stable). If already past showAt on save → appear now.
 * - Kill / lock screen: Cloud Functions push-to-start + local wake notifications.
 * - After event start, show "It's time" for 1 minute, then drop that row.
 * - Opening the app dismisses arrived rows immediately.
 */

const MAX_ITEMS = 3;
/** Local notification id range reserved for LA wake/dismiss (avoid reminder ids). */
const LA_NOTIF_ID_BASE = 50_000;
const LA_NOTIF_ID_MAX = 59_999;

export interface LiveActivityItem {
  title: string;
  startEpochMs: number;
  color: string;
}

export interface LiveActivityPayload {
  locale: "en" | "ja";
  items: LiveActivityItem[];
  overflow: number;
  endEpochMs: number;
  /** "countdown" | "arrived" — Lock Screen copy after event start. */
  phase?: "countdown" | "arrived";
}

export interface LiveActivitiesPlugin {
  areEnabled(): Promise<{ enabled: boolean }>;
  startOrUpdate(payload: LiveActivityPayload): Promise<{ activityId: string | null }>;
  endAll(): Promise<void>;
  startPushToStartTokenUpdates(): Promise<void>;
  getPushToStartToken(): Promise<{ token: string | null }>;
  getUpdateToken(): Promise<{ token: string | null }>;
  getTokenDebugInfo(): Promise<{
    apnsCacheBytes?: number;
    apnsRegisterError?: string | null;
    hasGoogleServiceInfoPlist?: boolean;
    activitiesEnabled?: boolean;
    activeActivityCount?: number;
    hasPushToStartToken?: boolean;
    hasUpdateToken?: boolean;
    laStartedWithoutPush?: boolean;
    iosVersion?: string;
    [key: string]: unknown;
  }>;
  rebroadcastApnsToken(): Promise<{
    rebroadcast: boolean;
    apnsCacheBytes: number;
    apnsRegisterError?: string;
  }>;
}

export const LiveActivities = registerPlugin<LiveActivitiesPlugin>("LiveActivities");

export function isLiveActivitySupported(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
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

/**
 * Items still on the Lock Screen: lead window through short post-start linger.
 * When dismissArrived is true (app became active), drop rows at/after start.
 */
function collectVisibleItems(
  now: Date,
  opts: { dismissArrived?: boolean } = {},
): {
  items: LiveActivityItem[];
  phase: "countdown" | "arrived";
} {
  const nowMs = now.getTime();
  const windows = collectLiveActivityWindows(now)
    .filter((w) => {
      if (!w.visibleNow) return false;
      if (opts.dismissArrived && nowMs >= w.startEpochMs) return false;
      return true;
    })
    .sort((a, b) => a.startEpochMs - b.startEpochMs);
  const anyCounting = windows.some((w) => nowMs < w.startEpochMs);
  return {
    items: windows.map((w) => ({
      title: w.title,
      startEpochMs: w.startEpochMs,
      color: w.color,
    })),
    phase: anyCounting ? "countdown" : "arrived",
  };
}

/** Milliseconds until the next Live Activity window opens, starts, or ends. */
export function msUntilNextLiveActivityBoundary(from = new Date()): number | null {
  const now = from.getTime();
  let nextMs: number | null = null;

  for (const w of collectLiveActivityWindows(from)) {
    for (const boundary of [w.showAtEpochMs, w.startEpochMs, w.endEpochMs]) {
      if (boundary > now) {
        nextMs = nextMs === null ? boundary : Math.min(nextMs, boundary);
      }
    }
  }

  if (nextMs === null) return null;
  return Math.max(nextMs - now + 300, 1000);
}

let boundaryTimer: ReturnType<typeof setTimeout> | undefined;
let preferDismissArrived = false;

function scheduleNextBoundary(): void {
  clearTimeout(boundaryTimer);
  const ms = msUntilNextLiveActivityBoundary();
  if (ms === null) return;
  boundaryTimer = setTimeout(() => {
    void refreshLiveActivities().finally(scheduleNextBoundary);
  }, ms);
}

export function scheduleLiveActivityBoundaries(): void {
  if (!isLiveActivitySupported()) return;
  scheduleNextBoundary();
}

export function stopLiveActivityBoundaries(): void {
  if (boundaryTimer) clearTimeout(boundaryTimer);
  boundaryTimer = undefined;
}

/** Next refresh should hide arrived rows (user opened the app). */
export function setLiveActivityDismissArrivedOnRefresh(value: boolean): void {
  preferDismissArrived = value;
}

export type LiveActivityLocalStatus = {
  supported: boolean;
  systemEnabled: boolean | null;
  activeCount: number;
  lastError: string | null;
};

let lastLocalError: string | null = null;
let lastSystemEnabled: boolean | null = null;
let lastActiveCount = 0;

export function getLiveActivityLocalStatus(): LiveActivityLocalStatus {
  return {
    supported: isLiveActivitySupported(),
    systemEnabled: lastSystemEnabled,
    activeCount: lastActiveCount,
    lastError: lastLocalError,
  };
}

export async function refreshLiveActivities(
  opts: { dismissArrived?: boolean } = {},
): Promise<void> {
  if (!isLiveActivitySupported()) return;

  const dismissArrived = opts.dismissArrived ?? preferDismissArrived;
  if (opts.dismissArrived) preferDismissArrived = true;

  try {
    const { enabled } = await LiveActivities.areEnabled();
    lastSystemEnabled = enabled;
    if (!enabled) {
      lastLocalError =
        "Live Activities are off for Essences in iOS Settings → Essences → Live Activities";
      scheduleNextBoundary();
      return;
    }
  } catch (err) {
    lastLocalError = err instanceof Error ? err.message : String(err);
    scheduleNextBoundary();
    return;
  }

  const now = new Date();
  const { items: visible, phase } = collectVisibleItems(now, { dismissArrived });
  lastActiveCount = visible.length;

  if (visible.length === 0) {
    try {
      await LiveActivities.endAll();
      lastLocalError = null;
    } catch {
      /* ignore */
    }
    scheduleNextBoundary();
    void rescheduleLiveActivityWakes();
    void import("./la-remote")
      .then((m) => m.syncLiveActivitySchedulesRemote())
      .catch(() => {});
    return;
  }

  const items = visible.slice(0, MAX_ITEMS);
  const overflow = visible.length - items.length;
  // Keep the Activity alive until the last visible row's arrived linger ends.
  const matchingWindows = collectLiveActivityWindows(now).filter((w) =>
    visible.some((v) => v.startEpochMs === w.startEpochMs && v.title === w.title),
  );
  const endEpochMs =
    matchingWindows.length > 0
      ? Math.max(...matchingWindows.map((w) => w.endEpochMs))
      : (items[0]?.startEpochMs ?? now.getTime()) + LIVE_ACTIVITY_ARRIVED_MS;
  // Only nudge a tiny bit if end is already past (ActivityKit rejects staleDate ≤ now).
  // Do NOT extend by minutes — that kept "予定時間になりました" on screen forever.
  const safeEndEpochMs = Math.max(endEpochMs, now.getTime() + 1_500);

  try {
    await LiveActivities.startOrUpdate({
      locale: currentLocale(),
      items,
      overflow,
      endEpochMs: safeEndEpochMs,
      phase,
    });
    lastLocalError = null;
    // Tell Firestore this device already has a card so remote won't push-to-start
    // a duplicate (boundary timer refresh does not go through native-bootstrap sync).
    void import("./la-remote")
      .then((m) => m.syncLiveActivitySchedulesRemote())
      .catch(() => {});
  } catch (err) {
    lastLocalError = err instanceof Error ? err.message : String(err);
    console.warn("[LiveActivity] startOrUpdate failed:", err);
  }

  scheduleNextBoundary();
  void rescheduleLiveActivityWakes();
}

/**
 * Cancel leftover LA wake local-notifications from older builds.
 * We no longer schedule them: blank banners showed on Lock Screen, and firing
 * at showAt caused a local Activity.request racing remote push-to-start
 * (duplicate cards, only one counting down). Kill/lock start is FCM-only.
 */
export async function rescheduleLiveActivityWakes(): Promise<void> {
  if (!isLiveActivitySupported()) return;
  try {
    const pending = await LocalNotifications.getPending();
    const laPending = pending.notifications.filter(
      (n) => n.id >= LA_NOTIF_ID_BASE && n.id <= LA_NOTIF_ID_MAX,
    );
    if (laPending.length) {
      await LocalNotifications.cancel({
        notifications: laPending.map((n) => ({ id: n.id })),
      });
    }
    try {
      const delivered = await LocalNotifications.getDeliveredNotifications();
      const laDelivered = delivered.notifications.filter(
        (n) => n.id >= LA_NOTIF_ID_BASE && n.id <= LA_NOTIF_ID_MAX,
      );
      if (laDelivered.length) {
        await LocalNotifications.removeDeliveredNotifications({
          notifications: laDelivered,
        });
      }
    } catch {
      /* older plugin / platform */
    }
  } catch (err) {
    console.warn("[LiveActivity] rescheduleLiveActivityWakes cleanup failed:", err);
  }
}

export { currentLocale, LIVE_ACTIVITY_ARRIVED_MS };
