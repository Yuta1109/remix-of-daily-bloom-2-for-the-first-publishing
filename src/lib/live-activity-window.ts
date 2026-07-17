import {
  effectiveLiveActivityLeadMinutes,
  loadEvents,
  upcomingOccurrenceStarts,
  type CalendarEvent,
  type LiveActivityLead,
} from "./events-store";

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
  endEpochMs: number;
  leadMinutes: number;
  /** True when now is already inside [showAt, end). */
  activeNow: boolean;
}

export function computeLiveActivityWindow(
  event: CalendarEvent,
  now = new Date(),
): LiveActivityWindow | null {
  if (!event.liveActivity || event.allDay) return null;
  const leadMinutes = effectiveLiveActivityLeadMinutes(event.liveActivityLead);
  const [next] = upcomingOccurrenceStarts(event, now, 14, 1);
  if (!next) return null;

  const startEpochMs = next.getTime();
  const windowOpen = startEpochMs - leadMinutes * 60_000;
  const nowMs = now.getTime();
  if (nowMs >= startEpochMs) return null;

  // Already inside the lead window → start immediately (not wait until "4h before").
  const showAtEpochMs = Math.max(windowOpen, nowMs);
  return {
    eventId: event.id,
    title: event.title,
    color: event.color || "blue",
    startEpochMs,
    showAtEpochMs,
    endEpochMs: startEpochMs,
    leadMinutes,
    activeNow: nowMs >= showAtEpochMs && nowMs < startEpochMs,
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
