import { describe, expect, it } from "vitest";
import { computeLiveActivityWindow } from "@/lib/live-activity-window";
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
  it("starts immediately when already inside the lead window (4h lead, 3h away)", () => {
    const now = new Date();
    const w = computeLiveActivityWindow(eventAt(3, "4h"), now);
    expect(w).not.toBeNull();
    expect(w!.activeNow).toBe(true);
    expect(w!.visibleNow).toBe(true);
    expect(w!.showAtEpochMs).toBe(now.getTime());
    expect(w!.endEpochMs).toBe(w!.startEpochMs + 30 * 60_000);
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
