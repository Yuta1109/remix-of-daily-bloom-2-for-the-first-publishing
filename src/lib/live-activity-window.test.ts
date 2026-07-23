import { describe, expect, it } from "vitest";
import {
  computeLiveActivityWindow,
  LIVE_ACTIVITY_ARRIVED_MS,
  selectLiveActivityRows,
} from "@/lib/live-activity-window";
import type { CalendarEvent } from "@/lib/events-store";

function eventAt(hoursFromNow: number, lead: CalendarEvent["liveActivityLead"]): CalendarEvent {
  const start = new Date(Date.now() + hoursFromNow * 3600_000);
  const y = start.getFullYear();
  const m = String(start.getMonth() + 1).padStart(2, "0");
  const d = String(start.getDate()).padStart(2, "0");
  const hh = String(start.getHours()).padStart(2, "0");
  const mm = String(start.getMinutes()).padStart(2, "0");
  return {
    id: "e1",
    title: "Test",
    date: `${y}-${m}-${d}`,
    startTime: `${hh}:${mm}`,
    endTime: `${hh}:${mm}`,
    liveActivity: true,
    liveActivityLead: lead,
  };
}

describe("computeLiveActivityWindow", () => {
  it("is active when already inside the lead window (4h lead, 3h away)", () => {
    const now = new Date();
    const w = computeLiveActivityWindow(eventAt(3, "4h"), now);
    expect(w).not.toBeNull();
    expect(w!.activeNow).toBe(true);
    expect(w!.visibleNow).toBe(true);
    // showAt is start − lead (in the past), not clamped to now
    expect(w!.showAtEpochMs).toBeLessThanOrEqual(now.getTime());
    expect(w!.endEpochMs).toBe(w!.startEpochMs + LIVE_ACTIVITY_ARRIVED_MS);
  });

  it("schedules a future showAt when outside the lead window (4h lead, 5h away)", () => {
    const now = new Date();
    const w = computeLiveActivityWindow(eventAt(5, "4h"), now);
    expect(w).not.toBeNull();
    expect(w!.activeNow).toBe(false);
    expect(w!.visibleNow).toBe(false);
    expect(w!.showAtEpochMs).toBeGreaterThan(now.getTime());
    // ~1 hour from now (5h − 4h), allow clock skew
    expect(w!.showAtEpochMs - now.getTime()).toBeGreaterThan(50 * 60_000);
    expect(w!.showAtEpochMs - now.getTime()).toBeLessThan(70 * 60_000);
  });
});

describe("selectLiveActivityRows", () => {
  const now = 1_000_000;

  it("keeps all rows when 3 or fewer (including arrived)", () => {
    const rows = [
      { title: "A", startEpochMs: now - 30_000, color: "blue" },
      { title: "B", startEpochMs: now + 60_000, color: "green" },
      { title: "C", startEpochMs: now + 120_000, color: "red" },
    ];
    const { items, overflow } = selectLiveActivityRows(rows, now, 3);
    expect(items).toHaveLength(3);
    expect(overflow).toBe(0);
    expect(items.map((i) => i.title)).toEqual(["A", "B", "C"]);
  });

  it("drops earliest arrived first when more than 3", () => {
    const rows = [
      { title: "Arr1", startEpochMs: now - 50_000, color: "blue" },
      { title: "Arr2", startEpochMs: now - 20_000, color: "green" },
      { title: "Soon", startEpochMs: now + 60_000, color: "red" },
      { title: "Later", startEpochMs: now + 120_000, color: "orange" },
    ];
    const { items, overflow } = selectLiveActivityRows(rows, now, 3);
    expect(overflow).toBe(1);
    expect(items.map((i) => i.title)).toEqual(["Arr2", "Soon", "Later"]);
  });

  it("keeps soonest countdowns when only countdowns overflow", () => {
    const rows = [
      { title: "1", startEpochMs: now + 10_000, color: "blue" },
      { title: "2", startEpochMs: now + 20_000, color: "green" },
      { title: "3", startEpochMs: now + 30_000, color: "red" },
      { title: "4", startEpochMs: now + 40_000, color: "orange" },
    ];
    const { items, overflow } = selectLiveActivityRows(rows, now, 3);
    expect(overflow).toBe(1);
    expect(items.map((i) => i.title)).toEqual(["1", "2", "3"]);
  });
});
