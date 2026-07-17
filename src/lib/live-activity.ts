import { Capacitor, registerPlugin } from "@capacitor/core";
import { collectLiveActivityWindows } from "./live-activity-window";
import { loadEvents, upcomingOccurrenceStarts, effectiveLiveActivityLeadMinutes } from "./events-store";

/**
 * Live Activity design (ActivityKit / Apple HIG):
 *
 * - Minimum iOS 17.2 (ActivityKit push-to-start; no wake-notification fallback).
 * - One shared Lock Screen + Dynamic Island activity (max 3 event rows).
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

  for (const event of loadEvents()) {
    if (!event.liveActivity || event.allDay) continue;
    const leadMin = effectiveLiveActivityLeadMinutes(event.liveActivityLead);
    const starts = upcomingOccurrenceStarts(event, from, 14, 5);
    for (const start of starts) {
      const windowOpen = start.getTime() - leadMin * 60_000;
      // Boundary at window open (may be in the past → skip) and at start.
      for (const boundary of [windowOpen, start.getTime()]) {
        if (boundary > now) {
          nextMs = nextMs === null ? boundary : Math.min(nextMs, boundary);
        }
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
export async function refreshLiveActivities(): Promise<void> {
  if (!isLiveActivitySupported()) return;

  try {
    const { enabled } = await LiveActivities.areEnabled();
    if (!enabled) return;
  } catch {
    return;
  }

  const now = new Date();
  const active = collectActiveItems(now);

  if (active.length === 0) {
    try {
      await LiveActivities.endAll();
    } catch {
      /* ignore */
    }
    scheduleNextBoundary();
    return;
  }

  const items = active.slice(0, MAX_ITEMS);
  const overflow = active.length - items.length;
  const endEpochMs = items[0]?.startEpochMs ?? now.getTime();

  try {
    await LiveActivities.startOrUpdate({
      locale: currentLocale(),
      items,
      overflow,
      endEpochMs,
    });
  } catch (err) {
    console.warn("[LiveActivity] startOrUpdate failed:", err);
  }

  scheduleNextBoundary();
}

export { currentLocale };
