import { Capacitor, registerPlugin } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import {
  collectLiveActivityWindows,
  LIVE_ACTIVITY_ARRIVED_MS,
  selectLiveActivityRows,
} from "./live-activity-window";
import { getLiveActivityUserEnabled } from "./live-activity-prefs";

/**
 * Live Activity design (ActivityKit / Apple HIG):
 *
 * - Minimum iOS 17.2 (ActivityKit push-to-start; no wake-notification fallback).
 * - One shared Lock Screen activity (max 3 event rows).
 * - showAt = start − lead (stable). If already past showAt on save → appear now.
 * - Kill / lock screen: Cloud Functions push-to-start (FCM).
 * - Arrived ("It's time"): keep up to 1 hour (or until app open / displaced when >3).
 * - No OS "request permission" API — first-run demo + Settings toggle prime / gate LA.
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
  getAuthState(): Promise<{
    enabled: boolean;
    frequentPushesEnabled: boolean;
    activityCount: number;
  }>;
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
  opts: { dismissArrived?: boolean; allowEarlyShowMs?: number } = {},
): {
  items: LiveActivityItem[];
  overflow: number;
  phase: "countdown" | "arrived";
} {
  const nowMs = now.getTime();
  const earlyMs = opts.allowEarlyShowMs ?? 0;
  const windows = collectLiveActivityWindows(now)
    .filter((w) => {
      // Kill-path belt: when backgrounding, arm LA a bit before showAt so a
      // subsequent force-quit still leaves a Lock Screen card (PTS remains primary).
      const early =
        earlyMs > 0 &&
        w.showAtEpochMs > nowMs &&
        w.showAtEpochMs - nowMs <= earlyMs &&
        nowMs < w.endEpochMs;
      if (!w.visibleNow && !early) return false;
      if (opts.dismissArrived && nowMs >= w.startEpochMs) return false;
      return true;
    })
    .map((w) => ({
      title: w.title,
      startEpochMs: w.startEpochMs,
      color: w.color,
    }));

  const { items, overflow } = selectLiveActivityRows(windows, nowMs, MAX_ITEMS);
  const anyCounting = items.some((w) => nowMs < w.startEpochMs);
  return {
    items,
    overflow,
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
/** Soft lock so refreshLiveActivities does not endAll during the first-run demo. */
let demoUntilMs = 0;
let demoEndTimer: ReturnType<typeof setTimeout> | undefined;

export function isDemoLiveActivityActive(): boolean {
  return Date.now() < demoUntilMs;
}

export function getLiveActivityLocalStatus(): LiveActivityLocalStatus {
  return {
    supported: isLiveActivitySupported(),
    systemEnabled: lastSystemEnabled,
    activeCount: lastActiveCount,
    lastError: lastLocalError,
  };
}

/**
 * Short Lock Screen demo. Primes ActivityKit / push-to-start after reinstall.
 * Apple has no requestPermissions() for Live Activities — starting one is the way.
 */
export async function startDemoLiveActivity(opts?: {
  title?: string;
  durationMs?: number;
}): Promise<{ ok: boolean; systemEnabled: boolean }> {
  if (!isLiveActivitySupported()) return { ok: false, systemEnabled: false };

  try {
    const { enabled } = await LiveActivities.areEnabled();
    lastSystemEnabled = enabled;
    if (!enabled) {
      lastLocalError =
        "Live Activities are off for Essences in iOS Settings → Essences → Live Activities";
      return { ok: false, systemEnabled: false };
    }
  } catch (err) {
    lastLocalError = err instanceof Error ? err.message : String(err);
    return { ok: false, systemEnabled: false };
  }

  const now = Date.now();
  const durationMs = opts?.durationMs ?? 45_000;
  const locale = currentLocale();
  const title =
    opts?.title || (locale === "ja" ? "デモ：Essences" : "Demo: Essences");

  try {
    await LiveActivities.startOrUpdate({
      locale,
      items: [
        {
          title,
          startEpochMs: now + 10 * 60_000,
          color: "orange",
        },
      ],
      overflow: 0,
      endEpochMs: now + durationMs + 5_000,
      phase: "countdown",
    });
    lastLocalError = null;
    lastActiveCount = 1;
    demoUntilMs = now + durationMs;
    clearTimeout(demoEndTimer);
    demoEndTimer = setTimeout(() => {
      demoUntilMs = 0;
      void refreshLiveActivities({ dismissArrived: true }).catch(() => {});
    }, durationMs);
    return { ok: true, systemEnabled: true };
  } catch (err) {
    lastLocalError = err instanceof Error ? err.message : String(err);
    return { ok: false, systemEnabled: true };
  }
}

export async function refreshLiveActivities(
  opts: { dismissArrived?: boolean; allowEarlyShowMs?: number } = {},
): Promise<void> {
  if (!isLiveActivitySupported()) return;

  if (!getLiveActivityUserEnabled()) {
    if (!isDemoLiveActivityActive()) {
      try {
        await LiveActivities.endAll();
        lastActiveCount = 0;
        lastLocalError = null;
      } catch {
        /* ignore */
      }
    }
    scheduleNextBoundary();
    return;
  }

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
  const { items: visible, overflow, phase } = collectVisibleItems(now, {
    dismissArrived,
    allowEarlyShowMs: opts.allowEarlyShowMs,
  });
  lastActiveCount = visible.length;

  if (visible.length === 0) {
    if (isDemoLiveActivityActive()) {
      scheduleNextBoundary();
      return;
    }
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

  const items = visible;
  // Keep the Activity alive until the last *shown* row's arrived linger ends.
  const matchingWindows = collectLiveActivityWindows(now).filter((w) =>
    items.some((v) => v.startEpochMs === w.startEpochMs && v.title === w.title),
  );
  const endEpochMs =
    matchingWindows.length > 0
      ? Math.max(...matchingWindows.map((w) => w.endEpochMs))
      : (items[0]?.startEpochMs ?? now.getTime()) + LIVE_ACTIVITY_ARRIVED_MS;
  // Only nudge a tiny bit if end is already past (ActivityKit rejects staleDate ≤ now).
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
