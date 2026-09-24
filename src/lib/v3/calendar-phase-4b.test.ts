import { beforeEach, describe, expect, it } from "vitest";
import {
  localDateFromPoint,
  normalizedPointInDateCell,
} from "@/lib/calendar-stamp-drag";
import { eventsForDate, upsertEvent } from "@/lib/events-store";
import { TUTORIAL_STEPS } from "@/lib/tutorial";
import {
  calendarEventsForDate,
  calendarTasksForDate,
} from "@/lib/v3/calendar-view";
import {
  addStamp,
  completeTask,
  createStamp,
  createTask,
  deleteStamp,
  getStamp,
  getStampsForDate,
  getWallpaperForDate,
  removeWallpaper,
  setWallpaperForDate,
  updateStamp,
} from "@/lib/v3/repository";
import { emptyData } from "@/lib/v3/schema";
import {
  clampStampCoord,
  nextStampZIndex,
  pointToNormalized,
} from "@/lib/v3/stamp-coords";
import { loadEssencesData, resetEssencesDataCache, saveEssencesData } from "@/lib/v3/storage";

beforeEach(() => {
  localStorage.clear();
  resetEssencesDataCache();
  saveEssencesData(emptyData());
});

describe("Phase 4B Calendar wallpaper and stamps", () => {
  it("1. keeps at most one wallpaper per date", () => {
    setWallpaperForDate("2026-09-25", "birthday_01");
    setWallpaperForDate("2026-09-25", "travel_01");
    const appearances = Object.values(loadEssencesData().calendarDayAppearances).filter(
      (a) => a.date === "2026-09-25",
    );
    expect(appearances).toHaveLength(1);
    expect(getWallpaperForDate("2026-09-25")).toBe("travel_01");
  });

  it("2. replacing wallpaper updates the same date record", () => {
    const first = setWallpaperForDate("2026-09-25", "birthday_01");
    const second = setWallpaperForDate("2026-09-25", "seasonal_01");
    expect(second?.id).toBe(first?.id);
    expect(getWallpaperForDate("2026-09-25")).toBe("seasonal_01");
  });

  it("3. removing wallpaper clears the date", () => {
    setWallpaperForDate("2026-09-25", "celebration_01");
    removeWallpaper("2026-09-25");
    expect(getWallpaperForDate("2026-09-25")).toBeUndefined();
    expect(Object.values(loadEssencesData().calendarDayAppearances)).toHaveLength(0);
  });

  it("4. wallpaper remains date-specific", () => {
    setWallpaperForDate("2026-09-25", "birthday_01");
    setWallpaperForDate("2026-09-26", "travel_01");
    expect(getWallpaperForDate("2026-09-25")).toBe("birthday_01");
    expect(getWallpaperForDate("2026-09-26")).toBe("travel_01");
    removeWallpaper("2026-09-25");
    expect(getWallpaperForDate("2026-09-26")).toBe("travel_01");
  });

  it("5. multiple stamps can share a date", () => {
    createStamp({ date: "2026-09-25", stampDefinitionId: "stamp.star", x: 0.2, y: 0.3 });
    createStamp({ date: "2026-09-25", stampDefinitionId: "stamp.heart", x: 0.7, y: 0.8 });
    createStamp({ date: "2026-09-25", stampDefinitionId: "stamp.coffee", x: 0.5, y: 0.6 });
    expect(getStampsForDate("2026-09-25")).toHaveLength(3);
  });

  it("6–7. stamp coordinates are preserved as normalized 0–1 values", () => {
    const stamp = createStamp({
      date: "2026-09-25",
      stampDefinitionId: "stamp.star",
      x: 0.25,
      y: 0.8,
    });
    expect(stamp.x).toBe(0.25);
    expect(stamp.y).toBe(0.8);
    expect(getStamp(stamp.id)?.x).toBe(0.25);

    const clamped = createStamp({
      date: "2026-09-25",
      stampDefinitionId: "stamp.heart",
      x: 4,
      y: -2,
    });
    expect(clamped.x).toBe(1);
    expect(clamped.y).toBe(0);
    expect(clampStampCoord(0.4)).toBe(0.4);
    expect(pointToNormalized(25, 40, { left: 0, top: 0, width: 100, height: 80 })).toEqual({
      x: 0.25,
      y: 0.5,
    });
  });

  it("8. deleting a stamp removes only that stamp", () => {
    const a = createStamp({ date: "2026-09-25", stampDefinitionId: "stamp.star", x: 0.2, y: 0.2 });
    const b = createStamp({ date: "2026-09-25", stampDefinitionId: "stamp.heart", x: 0.8, y: 0.8 });
    deleteStamp(a.id);
    expect(getStamp(a.id)).toBeUndefined();
    expect(getStampsForDate("2026-09-25").map((s) => s.id)).toEqual([b.id]);
  });

  it("9. zIndex increases for each new stamp and never goes negative", () => {
    const a = createStamp({ date: "2026-09-25", stampDefinitionId: "stamp.star", x: 0.2, y: 0.2 });
    const b = createStamp({ date: "2026-09-25", stampDefinitionId: "stamp.heart", x: 0.4, y: 0.4 });
    expect(a.zIndex).toBe(0);
    expect(b.zIndex).toBe(1);
    expect(nextStampZIndex([0, 1])).toBe(2);
    expect(nextStampZIndex([])).toBe(0);
    const moved = updateStamp(a.id, { zIndex: -3 });
    expect(moved.zIndex).toBe(0);
  });

  it("10. different dates do not share stamps", () => {
    const a = createStamp({ date: "2026-09-25", stampDefinitionId: "stamp.star", x: 0.2, y: 0.2 });
    const b = createStamp({ date: "2026-09-26", stampDefinitionId: "stamp.star", x: 0.2, y: 0.2 });
    expect(getStampsForDate("2026-09-25").map((s) => s.id)).toEqual([a.id]);
    expect(getStampsForDate("2026-09-26").map((s) => s.id)).toEqual([b.id]);
  });

  it("11. a drop onto a date creates the stamp on that local date", () => {
    const cell = document.createElement("div");
    cell.dataset.calendarDate = "2026-09-28";
    Object.defineProperty(cell, "getBoundingClientRect", {
      value: () => ({ left: 0, top: 0, width: 100, height: 80, right: 100, bottom: 80 }),
    });
    document.body.appendChild(cell);
    Object.defineProperty(document, "elementsFromPoint", {
      configurable: true,
      writable: true,
      value: () => [cell],
    });

    const droppedOn = localDateFromPoint(50, 56);
    expect(droppedOn).toBe("2026-09-28");
    const coords = normalizedPointInDateCell(50, 56, "2026-09-28");
    expect(coords).toEqual({ x: 0.5, y: 0.7 });

    const stamp = createStamp({
      date: droppedOn!,
      stampDefinitionId: "stamp.travel",
      x: coords!.x,
      y: coords!.y,
    });
    expect(stamp.date).toBe("2026-09-28");
    expect(stamp.x).toBe(0.5);
    expect(stamp.y).toBe(0.7);
    expect(getStampsForDate("2026-09-25")).toHaveLength(0);
    expect(getStampsForDate(droppedOn!)[0].id).toBe(stamp.id);

    cell.remove();
  });

  it("12. adding a stamp does not overwrite another stamp", () => {
    const first = createStamp({
      date: "2026-09-25",
      stampDefinitionId: "stamp.star",
      x: 0.2,
      y: 0.2,
    });
    const second = createStamp({
      date: "2026-09-25",
      stampDefinitionId: "stamp.star",
      x: 0.2,
      y: 0.2,
    });
    expect(first.id).not.toBe(second.id);
    expect(getStampsForDate("2026-09-25")).toHaveLength(2);
  });

  it("13. wallpaper and stamps coexist on the same date", () => {
    setWallpaperForDate("2026-09-25", "birthday_01");
    createStamp({ date: "2026-09-25", stampDefinitionId: "stamp.birthday", x: 0.3, y: 0.7 });
    expect(getWallpaperForDate("2026-09-25")).toBe("birthday_01");
    expect(getStampsForDate("2026-09-25")).toHaveLength(1);
  });

  it("14. Calendar Task and Event behavior is unchanged", () => {
    const task = createTask({
      title: "Read economics paper",
      date: "2026-09-25",
      createdFrom: "calendar",
    });
    upsertEvent({
      id: "evt-seminar",
      title: "Seminar",
      date: "2026-09-25",
      startTime: "14:00",
    });
    setWallpaperForDate("2026-09-25", "travel_01");
    createStamp({ date: "2026-09-25", stampDefinitionId: "stamp.star", x: 0.5, y: 0.5 });

    expect(calendarTasksForDate("2026-09-25")[0].id).toBe(task.id);
    expect(calendarEventsForDate("2026-09-25")[0].title).toBe("Seminar");
    expect(eventsForDate("2026-09-25")).toHaveLength(1);
    completeTask(task.id);
    expect(calendarTasksForDate("2026-09-25")[0].status).toBe("completed");
  });

  it("15. tutorial no longer targets deleted Month Goals UI", () => {
    expect(TUTORIAL_STEPS.some((s) => s.target === "month-goals")).toBe(false);
    expect(TUTORIAL_STEPS.map((s) => s.id)).toEqual(
      expect.not.arrayContaining(["monthGoals", "monthGoalsClose"]),
    );
    const afterCalendarNav = TUTORIAL_STEPS.findIndex((s) => s.id === "navCalendar");
    const monthly = TUTORIAL_STEPS.find((s) => s.id === "planMonthly");
    expect(monthly?.target).toBe("plan-level-monthly");
    expect(monthly?.route).toBe("/plan");
    expect(TUTORIAL_STEPS.findIndex((s) => s.id === "planMonthly")).toBe(afterCalendarNav + 1);
  });
});

describe("addStamp alias", () => {
  it("createStamp and addStamp write the same collection", () => {
    addStamp({ date: "2026-09-25", stampDefinitionId: "stamp.star", x: 0.1, y: 0.2 });
    expect(getStampsForDate("2026-09-25")).toHaveLength(1);
  });
});
