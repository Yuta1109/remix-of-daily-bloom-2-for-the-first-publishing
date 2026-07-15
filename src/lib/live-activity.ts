import { Capacitor, registerPlugin } from "@capacitor/core";
import {
  loadEvents,
  liveActivityLeadMinutes,
  upcomingOccurrenceStarts,
  type CalendarEvent,
} from "./events-store";

/** Up to this many events are shown inside a single Live Activity. */
const MAX_ITEMS = 3;

/** How often to poll while the app is in the foreground (ms). */
const FOREGROUND_POLL_MS = 30_000;

export interface LiveActivityItem {
  title: string;
  startEpochMs: number;
  color: string;
}

export interface LiveActivityPayload {
  locale: "en" | "ja";
  items: LiveActivityItem[];
  overflow: number;
}

export interface LiveActivitiesPlugin {
  areEnabled(): Promise<{ enabled: boolean }>;
  startOrUpdate(payload: LiveActivityPayload): Promise<{ activityId: string | null }>;
  endAll(): Promise<void>;
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
  const active: LiveActivityItem[] = [];

  for (const event of loadEvents()) {
    if (!event.liveActivity || event.allDay) continue;
    const leadMin = liveActivityLeadMinutes(event.liveActivityLead);
    const [next] = upcomingOccurrenceStarts(event, now, 7, 1);
    if (!next) continue;
    const windowStart = next.getTime() - leadMin * 60_000;
    if (now.getTime() >= windowStart && now.getTime() < next.getTime()) {
      active.push({
        title: event.title,
        startEpochMs: next.getTime(),
        color: event.color || "blue",
      });
    }
  }

  active.sort((a, b) => a.startEpochMs - b.startEpochMs);
  return active;
}

/** Milliseconds until the next Live Activity window opens or closes. */
export function msUntilNextLiveActivityBoundary(from = new Date()): number | null {
  const now = from.getTime();
  let nextMs: number | null = null;

  for (const event of loadEvents()) {
    if (!event.liveActivity || event.allDay) continue;
    const leadMin = liveActivityLeadMinutes(event.liveActivityLead);
    const starts = upcomingOccurrenceStarts(event, from, 14, 5);
    for (const start of starts) {
      const boundaries = [
        start.getTime() - leadMin * 60_000,
        start.getTime(),
      ];
      for (const boundary of boundaries) {
        if (boundary > now) {
          nextMs = nextMs === null ? boundary : Math.min(nextMs, boundary);
        }
      }
    }
  }

  if (nextMs === null) return null;
  return Math.max(nextMs - now + 300, 1000);
}

let pollTimer: ReturnType<typeof setInterval> | undefined;
let boundaryTimer: ReturnType<typeof setTimeout> | undefined;

function scheduleBoundaryRefresh(): void {
  clearTimeout(boundaryTimer);
  const ms = msUntilNextLiveActivityBoundary();
  if (ms === null) return;
  boundaryTimer = setTimeout(() => {
    void refreshLiveActivities().finally(scheduleBoundaryRefresh);
  }, ms);
}

/**
 * Keeps Live Activities in sync while the app stays open (start/end at exact times).
 * Call when the app enters the foreground; pair with `stopLiveActivityRefreshLoop`.
 */
export function startLiveActivityRefreshLoop(): void {
  if (!isLiveActivitySupported()) return;
  stopLiveActivityRefreshLoop();
  pollTimer = setInterval(() => void refreshLiveActivities(), FOREGROUND_POLL_MS);
  scheduleBoundaryRefresh();
}

export function stopLiveActivityRefreshLoop(): void {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = undefined;
  if (boundaryTimer) clearTimeout(boundaryTimer);
  boundaryTimer = undefined;
}

/**
 * Computes events currently inside their Live Activity lead window and updates
 * the Live Activity accordingly. Ends the activity when none are active.
 *
 * iOS only allows *starting* a Live Activity from the foreground (without push).
 * A local notification at the lead window reminds the user to open the app.
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
    scheduleBoundaryRefresh();
    return;
  }

  const items = active.slice(0, MAX_ITEMS);
  const overflow = active.length - items.length;

  try {
    await LiveActivities.startOrUpdate({
      locale: currentLocale(),
      items,
      overflow,
    });
  } catch {
    /* plugin unavailable or ActivityKit rejected the request */
  }

  scheduleBoundaryRefresh();
}

/** Events with Live Activity enabled that are eligible for a wake notification. */
export function liveActivityWakeTimes(
  from: Date,
  horizonDays = 14,
): { at: Date; event: CalendarEvent }[] {
  const results: { at: Date; event: CalendarEvent }[] = [];
  const now = from.getTime();

  for (const event of loadEvents()) {
    if (!event.liveActivity || event.allDay) continue;
    const leadMin = liveActivityLeadMinutes(event.liveActivityLead);
    const starts = upcomingOccurrenceStarts(event, from, horizonDays, 10);
    for (const start of starts) {
      const at = new Date(start.getTime() - leadMin * 60_000);
      if (at.getTime() > now) {
        results.push({ at, event });
      }
    }
  }

  results.sort((a, b) => a.at.getTime() - b.at.getTime());
  return results;
}
