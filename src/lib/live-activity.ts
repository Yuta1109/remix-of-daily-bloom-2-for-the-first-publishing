import { Capacitor, registerPlugin } from "@capacitor/core";
import {
  loadEvents,
  liveActivityLeadMinutes,
  upcomingOccurrenceStarts,
  type CalendarEvent,
} from "./events-store";

/** Up to this many events are shown inside a single Live Activity. */
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
    const [next] = upcomingOccurrenceStarts(event, now, 14, 1);
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
      const boundaries = [start.getTime() - leadMin * 60_000, start.getTime()];
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

let boundaryTimer: ReturnType<typeof setTimeout> | undefined;

function scheduleNextBoundary(): void {
  clearTimeout(boundaryTimer);
  const ms = msUntilNextLiveActivityBoundary();
  if (ms === null) return;
  boundaryTimer = setTimeout(() => {
    void refreshLiveActivities().finally(scheduleNextBoundary);
  }, ms);
}

/** Schedule start/end refreshes only (countdown runs natively in the widget). */
export function scheduleLiveActivityBoundaries(): void {
  if (!isLiveActivitySupported()) return;
  scheduleNextBoundary();
}

export function stopLiveActivityBoundaries(): void {
  if (boundaryTimer) clearTimeout(boundaryTimer);
  boundaryTimer = undefined;
}

/**
 * Starts/updates/end Live Activities for events in their lead window.
 * The widget uses SwiftUI `.timer` — no periodic JS updates for the countdown.
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

  try {
    await LiveActivities.startOrUpdate({
      locale: currentLocale(),
      items,
      overflow,
    });
  } catch (err) {
    console.warn("[LiveActivity] startOrUpdate failed:", err);
  }

  scheduleNextBoundary();
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
