import {
  effectiveLiveActivityLeadMinutes,
  loadEvents,
  upcomingOccurrenceStarts,
  type CalendarEvent,
  type LiveActivityLead,
} from "./events-store";

/**
 * After event start, keep "It's time" briefly, then drop that row.
 * Cleared sooner when the user opens the app (see dismissArrived).
 */
export const LIVE_ACTIVITY_ARRIVED_MS = 60 * 1000;

/** @deprecated Use LIVE_ACTIVITY_ARRIVED_MS — kept for older imports/tests. */
export const LIVE_ACTIVITY_LINGER_MS = LIVE_ACTIVITY_ARRIVED_MS;

/**
 * Live Activity lead window for one occurrence.
 *
 * Example: lead = 1h, event at 15:00 → showAt = 14:00 (stable).
 * If the user saves at 14:30, the window is already open → appear immediately.
 */
export interface LiveActivityWindow {
  eventId: string;
  title: string;
  color: string;
  startEpochMs: number;
  /** When the LA should appear: always start − lead (never clamped to "now"). */
  showAtEpochMs: number;
  /** Drop this row after start + arrived linger. */
  endEpochMs: number;
  leadMinutes: number;
  /** True when inside [showAt, start). */
  activeNow: boolean;
  /** True when the Lock Screen should still show (includes short post-start linger). */
  visibleNow: boolean;
}

export function computeLiveActivityWindow(
  event: CalendarEvent,
  now = new Date(),
): LiveActivityWindow | null {
  if (!event.liveActivity || event.allDay) return null;
  const leadMinutes = effectiveLiveActivityLeadMinutes(event.liveActivityLead);
  // Include current occurrence even if start just passed (arrived linger).
  const [next] = upcomingOccurrenceStarts(
    event,
    new Date(now.getTime() - LIVE_ACTIVITY_ARRIVED_MS),
    14,
    1,
  );
  if (!next) return null;

  const startEpochMs = next.getTime();
  const endEpochMs = startEpochMs + LIVE_ACTIVITY_ARRIVED_MS;
  const showAtEpochMs = startEpochMs - leadMinutes * 60_000;
  const nowMs = now.getTime();
  if (nowMs >= endEpochMs) return null;

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

/** Minimal row shape for Lock Screen selection. */
export type LiveActivityRowLike = {
  startEpochMs: number;
  title: string;
  color: string;
};

/**
 * Pick up to `maxItems` rows for the shared Live Activity card.
 *
 * - ≤ maxItems: keep all (including "予定時間になりました" arrived rows).
 * - > maxItems: drop earliest arrived first so countdown rows keep slots;
 *   if still over capacity, keep the soonest countdowns.
 */
export function selectLiveActivityRows<T extends LiveActivityRowLike>(
  rows: T[],
  nowMs: number,
  maxItems = 3,
): { items: T[]; overflow: number } {
  const countdown = rows
    .filter((r) => r.startEpochMs > nowMs)
    .sort((a, b) => a.startEpochMs - b.startEpochMs);
  const arrived = rows
    .filter((r) => r.startEpochMs <= nowMs)
    .sort((a, b) => a.startEpochMs - b.startEpochMs);

  if (rows.length <= maxItems) {
    const items = [...rows].sort((a, b) => a.startEpochMs - b.startEpochMs);
    return { items, overflow: 0 };
  }

  const keptArrived = [...arrived];
  while (countdown.length + keptArrived.length > maxItems && keptArrived.length > 0) {
    keptArrived.shift(); // earliest arrived first
  }
  const keptCountdown =
    countdown.length + keptArrived.length > maxItems
      ? countdown.slice(0, maxItems - keptArrived.length)
      : countdown;

  const items = [...keptCountdown, ...keptArrived].sort(
    (a, b) => a.startEpochMs - b.startEpochMs,
  );
  return { items, overflow: Math.max(0, rows.length - items.length) };
}
