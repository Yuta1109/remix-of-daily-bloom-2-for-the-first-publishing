import {
  effectiveLiveActivityLeadMinutes,
  loadEvents,
  upcomingOccurrenceStarts,
  type CalendarEvent,
  type LiveActivityLead,
} from "./events-store";

/**
 * After event start, keep the Lock Screen card briefly so the widget can show
 * "It's time" instead of the system stale spinner. Cleared when the user opens
 * the app (refresh ends activities with no visible windows) or linger elapses.
 */
export const LIVE_ACTIVITY_LINGER_MS = 30 * 60_000;

/**
 * Live Activity lead window for one occurrence.
 *
 * Example: lead = 4h, event starts in 3h → window already open → showAt = now
 * (display immediately on save / push). If the event is 5h away, showAt =
 * start − 4h (future), and the activity starts then (push-to-start when killed).
 */
export interface LiveActivityWindow {
  eventId: string;
  title: string;
  color: string;
  startEpochMs: number;
  /** When the LA should appear (never after start; never before window open). */
  showAtEpochMs: number;
  /** When the LA should dismiss if the app never opens (start + linger). */
  endEpochMs: number;
  leadMinutes: number;
  /** True when inside [showAt, start) — schedule push / local start. */
  activeNow: boolean;
  /** True when the Lock Screen should still show (includes post-start linger). */
  visibleNow: boolean;
}

export function computeLiveActivityWindow(
  event: CalendarEvent,
  now = new Date(),
): LiveActivityWindow | null {
  if (!event.liveActivity || event.allDay) return null;
  const leadMinutes = effectiveLiveActivityLeadMinutes(event.liveActivityLead);
  // Include current occurrence even if start just passed (linger window).
  const [next] = upcomingOccurrenceStarts(event, new Date(now.getTime() - LIVE_ACTIVITY_LINGER_MS), 14, 1);
  if (!next) return null;

  const startEpochMs = next.getTime();
  const endEpochMs = startEpochMs + LIVE_ACTIVITY_LINGER_MS;
  const windowOpen = startEpochMs - leadMinutes * 60_000;
  const nowMs = now.getTime();
  if (nowMs >= endEpochMs) return null;

  // Already inside the lead window → start immediately (not wait until "4h before").
  const showAtEpochMs = Math.max(windowOpen, Math.min(nowMs, startEpochMs));
  return {
    eventId: event.id,
    title: event.title,
    color: event.color || "blue",
    startEpochMs,
    showAtEpochMs,
    endEpochMs,
    leadMinutes,
    activeNow: nowMs >= showAtEpochMs && nowMs < startEpochMs,
    visibleNow: nowMs >= showAtEpochMs && nowMs < endEpochMs,
  };
}

/** All LA-enabled events with a future (or current) display window. */
export function collectLiveActivityWindows(now = new Date()): LiveActivityWindow[] {
  const windows: LiveActivityWindow[] = [];
  for (const event of loadEvents()) {
    const w = computeLiveActivityWindow(event, now);
    if (w) windows.push(w);
  }
  windows.sort((a, b) => a.showAtEpochMs - b.showAtEpochMs);
  return windows;
}

/** Clamp a stored lead for UI / remote sync (max 8h). */
export function clampedLead(lead?: LiveActivityLead): LiveActivityLead {
  const mins = effectiveLiveActivityLeadMinutes(lead);
  if (mins >= 480) return "8h";
  return lead ?? "1h";
}
