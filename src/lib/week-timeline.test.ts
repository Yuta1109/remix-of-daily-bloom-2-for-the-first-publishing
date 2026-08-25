import { describe, expect, it } from "vitest";
import { isJapaneseHoliday } from "./jp-holidays";
import { placeTimedEvents, timedSliceOnDate, timelineWindow } from "./week-timeline";

describe("japanese holidays", () => {
  it("marks New Year and Constitution Memorial Day", () => {
    expect(isJapaneseHoliday("2026-01-01")).toBe(true);
    expect(isJapaneseHoliday("2026-05-03")).toBe(true);
    expect(isJapaneseHoliday("2026-08-25")).toBe(false);
  });
});

describe("week timeline", () => {
  it("clips overnight events across midnight", () => {
    const e = {
      id: "1",
      title: "late",
      date: "2026-08-25",
      startTime: "22:00",
      endTime: "02:00",
    };
    const a = timedSliceOnDate(e, "2026-08-25");
    const b = timedSliceOnDate(e, "2026-08-26");
    expect(a?.startMin).toBe(22 * 60);
    expect(a?.endMin).toBe(24 * 60);
    expect(b?.startMin).toBe(0);
    expect(b?.endMin).toBe(2 * 60);
  });

  it("places two overlapping events in two columns", () => {
    const placed = placeTimedEvents([
      { event: { id: "a", title: "a", date: "2026-08-25" }, startMin: 60, endMin: 120 },
      { event: { id: "b", title: "b", date: "2026-08-25" }, startMin: 90, endMin: 150 },
    ]);
    expect(placed).toHaveLength(2);
    expect(Math.max(...placed.map((p) => p.cols))).toBe(2);
  });

  it("expands timeline to first start and last end", () => {
    const win = timelineWindow([
      { startMin: 9 * 60 + 10, endMin: 10 * 60 },
      { startMin: 14 * 60, endMin: 15 * 60 + 20 },
    ]);
    expect(win.start % 30).toBe(0);
    expect(win.end % 30).toBe(0);
    expect(win.start).toBeLessThanOrEqual(9 * 60);
    expect(win.end).toBeGreaterThanOrEqual(15 * 60 + 30);
  });
});
