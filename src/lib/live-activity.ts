import { Capacitor, registerPlugin } from "@capacitor/core";
import { collectLiveActivityWindows } from "./live-activity-window";

/**
 * Live Activity design (ActivityKit / Apple HIG):
 *
 * - Minimum iOS 17.2 (ActivityKit push-to-start; no wake-notification fallback).
 * - One shared Lock Screen activity (max 3 event rows).
 * - If the user enables LA while already inside the lead window (e.g. lead=4h
 *   but event is in 3h), we start **immediately** on save (and remote push
 *   uses showAt=now). Future windows are scheduled for start − lead.
 * - Target path: Firebase / APNs push-to-start when killed.
 * - Active ≤ 8h; Lock Screen may linger ≤ 12h total.
 */

const MAX_ITEMS = 3;

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
}

export interface LiveActivitiesPlugin {
  areEnabled(): Promise<{ enabled: boolean }>;
  startOrUpdate(payload: LiveActivityPayload): Promise<{ activityId: string | null }>;
  endAll(): Promise<void>;
  /** Observe ActivityKit push-to-start token (iOS 17.2+). */
  startPushToStartTokenUpdates(): Promise<void>;
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
 * Items to show while managing from the app.
 * Only pre-start windows — arrived events are dropped so opening the app
 * (or tapping the Live Activity) clears "予定時間になりました" rows.
 */
function collectActiveItems(now: Date): LiveActivityItem[] {
  return collectLiveActivityWindows(now)
    .filter((w) => w.activeNow)
    .map((w) => ({
      title: w.title,
      startEpochMs: w.startEpochMs,
      color: w.color,
    }))
    .sort((a, b) => a.startEpochMs - b.startEpochMs);
}

/** Milliseconds until the next Live Activity window opens or closes. */
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

/**
 * Starts/updates/ends Live Activities for events already in their lead window.
 * Called after save: if lead=4h and event is in 3h, starts immediately.
 */
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

export async function refreshLiveActivities(): Promise<void> {
  if (!isLiveActivitySupported()) return;

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
  const active = collectActiveItems(now);
  lastActiveCount = active.length;

  if (active.length === 0) {
    try {
      await LiveActivities.endAll();
      lastLocalError = null;
    } catch {
      /* ignore */
    }
    scheduleNextBoundary();
    return;
  }

  const items = active.slice(0, MAX_ITEMS);
  const overflow = active.length - items.length;
  // Keep ActivityKit alive a bit past each start so Lock Screen can show
  // "It's time" until the user opens/taps the app (then this refresh ends it).
  const endEpochMs =
    collectLiveActivityWindows(now)
      .filter((w) => w.activeNow)
      .map((w) => w.endEpochMs)
      .sort((a, b) => a - b)[0] ??
    (items[0]?.startEpochMs ?? now.getTime()) + 30 * 60_000;

  try {
    await LiveActivities.startOrUpdate({
      locale: currentLocale(),
      items,
      overflow,
      endEpochMs,
    });
    lastLocalError = null;
  } catch (err) {
    lastLocalError = err instanceof Error ? err.message : String(err);
    console.warn("[LiveActivity] startOrUpdate failed:", err);
  }

  scheduleNextBoundary();
}

export { currentLocale };
