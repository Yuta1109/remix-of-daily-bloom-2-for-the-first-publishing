import type { CalendarEvent } from "./events-store";
import { eventSpanDays } from "./events-store";

export type TimedPlacement = {
  event: CalendarEvent;
  startMin: number;
  endMin: number;
  col: number;
  cols: number;
};

function parseHm(hm?: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hm || ""));
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

function ymdToUtcDays(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
}

/** Clip a timed event onto one calendar day (handles overnight / multi-day). */
export function timedSliceOnDate(e: CalendarEvent, date: string): { startMin: number; endMin: number } | null {
  if (e.allDay) return null;
  const startHm = parseHm(e.startTime) ?? 9 * 60;
  let endHm = parseHm(e.endTime);
  const span = eventSpanDays(e);
  if (endHm == null) {
    endHm = Math.min(24 * 60, startHm + 60);
  }
  const overnight = span === 0 && endHm <= startHm;
  const startDay = e.date;
  const offset = Math.round(ymdToUtcDays(date) - ymdToUtcDays(startDay));
  const maxOffset = span + (overnight ? 1 : 0);
  if (offset < 0 || offset > maxOffset) return null;

  const absStart = startHm;
  let absEnd = span * 24 * 60 + endHm;
  if (overnight) absEnd = 24 * 60 + endHm;
  const dayStart = offset * 24 * 60;
  const dayEnd = dayStart + 24 * 60;
  const clipStart = Math.max(absStart, dayStart);
  const clipEnd = Math.min(absEnd, dayEnd);
  if (clipEnd <= clipStart) return null;
  return { startMin: clipStart - dayStart, endMin: clipEnd - dayStart };
}

export function floorToHalfHour(min: number) {
  return Math.floor(min / 30) * 30;
}

export function ceilToHalfHour(min: number) {
  return Math.ceil(min / 30) * 30;
}

export function timelineWindow(slices: { startMin: number; endMin: number }[]) {
  if (!slices.length) {
    return { start: 8 * 60, end: 18 * 60 };
  }
  const start = Math.max(0, floorToHalfHour(Math.min(...slices.map((s) => s.startMin)) - 30));
  const end = Math.min(24 * 60, ceilToHalfHour(Math.max(...slices.map((s) => s.endMin)) + 30));
  return { start, end: Math.max(end, start + 60) };
}

function overlaps(a: { startMin: number; endMin: number }, b: { startMin: number; endMin: number }) {
  return a.startMin < b.endMin && b.startMin < a.endMin;
}

export function placeTimedEvents(items: { event: CalendarEvent; startMin: number; endMin: number }[]): TimedPlacement[] {
  const sorted = [...items].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
  const placed: TimedPlacement[] = [];
  const clusters: typeof sorted[] = [];

  for (const item of sorted) {
    const last = clusters[clusters.length - 1];
    if (!last) {
      clusters.push([item]);
      continue;
    }
    const clusterEnd = Math.max(...last.map((x) => x.endMin));
    if (item.startMin < clusterEnd) last.push(item);
    else clusters.push([item]);
  }

  for (const cluster of clusters) {
    const cols: { startMin: number; endMin: number }[][] = [];
    const colOf = new Map<CalendarEvent, number>();
    for (const item of cluster) {
      let col = cols.findIndex((lane) => lane.every((x) => !overlaps(x, item)));
      if (col < 0) {
        col = cols.length;
        cols.push([]);
      }
      cols[col].push(item);
      colOf.set(item.event, col);
    }
    for (const item of cluster) {
      placed.push({
        ...item,
        col: colOf.get(item.event) ?? 0,
        cols: cols.length,
      });
    }
  }
  return placed;
}
