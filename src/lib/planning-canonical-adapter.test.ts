import { describe, expect, it } from "vitest";
import { calendarDays, createItem, STORAGE_KEY } from "./canonical-planning-foundation";
import {
  completeEventDay,
  completeTask,
  deleteAppearance,
  effectivePeriod,
  emptyCanonical,
  previewNativeHandoff,
} from "./planning-canonical-adapter";

function sixImported() {
  const document = emptyCanonical();
  for (let index = 1; index <= 6; index += 1) {
    createItem(document, {
      id: `canonical-${index}`,
      legacyWebID: `legacy-${index}`,
      kind: "event",
      origin: "daily",
      originPeriodKey: "2026-10-13",
      title: `Event ${index}`,
      startDate: "2026-10-13",
      colorID: index === 1 ? undefined : "rose",
      legacyColorKey: index === 1 ? "red" : "blue",
    });
  }
  return document;
}

describe("planning canonical adapter", () => {
  it("leaves six imported events unchanged and does not project them upward", () => {
    const document = sixImported();
    const before = JSON.stringify(document);
    const preview = previewNativeHandoff(document, [
      { id: "legacy-1", kind: "event", origin: "daily", originPeriodKey: "2026-10-13", title: "Event 1" },
      { id: "sample", kind: "task", origin: "daily", originPeriodKey: "2026-10-13", title: "Event 1", isSample: true },
      { id: "real-task", kind: "task", origin: "monthly", originPeriodKey: "2026-10", title: "Event 1" },
    ]);
    expect(preview).toEqual({ samplesExcluded: 1, collisions: 1, blocked: 0, ready: 1, writes: 0, activationAllowed: true });
    expect(JSON.stringify(document)).toBe(before);
    expect(document.payloads.map((row) => row.legacyWebID)).toEqual(["legacy-1", "legacy-2", "legacy-3", "legacy-4", "legacy-5", "legacy-6"]);
    expect(effectivePeriod(document, "monthly", "2026-10").map((row) => row.logicalID)).toEqual([]);
    expect(effectivePeriod(document, "daily", "2026-10-13")).toHaveLength(6);
    expect(JSON.stringify(preview)).not.toContain("setItem");
    expect(STORAGE_KEY).toBe("essences.canonical-planning.v1");
  });

  it("projects tasks and events in the agreed direction and keeps one payload", () => {
    const document = emptyCanonical();
    createItem(document, { id: "month-task", kind: "task", origin: "monthly", originPeriodKey: "2026-10", title: "Month", startDate: "2026-10-14" });
    createItem(document, { id: "week-task", kind: "task", origin: "weekly", originPeriodKey: "2026-10-12", title: "Week", startDate: "2026-10-14" });
    createItem(document, { id: "day-task", kind: "task", origin: "daily", originPeriodKey: "2026-10-14", title: "Day", startDate: "2026-10-14" });
    createItem(document, { id: "future", kind: "event", origin: "future", originPeriodKey: "2026", title: "Future", startDate: "2026-10-13", endDate: "2026-10-15" });
    createItem(document, { id: "month-event", kind: "event", origin: "monthly", originPeriodKey: "2026-10", title: "Month event", startDate: "2026-10-14" });
    createItem(document, { id: "week-event", kind: "event", origin: "weekly", originPeriodKey: "2026-10-12", title: "Week event", startDate: "2026-10-14", recurrence: { frequency: "weekly" } });
    expect(document.payloads).toHaveLength(6);
    expect(effectivePeriod(document, "weekly", "2026-10-12").some((row) => row.logicalID === "month-task")).toBe(true);
    expect(effectivePeriod(document, "daily", "2026-10-14").some((row) => row.logicalID === "month-task")).toBe(true);
    expect(effectivePeriod(document, "monthly", "2026-10").some((row) => row.logicalID === "week-task")).toBe(false);
    expect(effectivePeriod(document, "daily", "2026-10-14").some((row) => row.logicalID === "week-task")).toBe(true);
    expect(effectivePeriod(document, "monthly", "2026-10").some((row) => row.logicalID === "day-task")).toBe(false);
    expect(effectivePeriod(document, "monthly", "2026-10").some((row) => row.logicalID === "future")).toBe(true);
    expect(effectivePeriod(document, "daily", "2026-10-13").some((row) => row.logicalID === "future")).toBe(true);
    expect(effectivePeriod(document, "daily", "2026-10-15").some((row) => row.logicalID === "future")).toBe(true);
    expect(effectivePeriod(document, "weekly", "2026-10-12").some((row) => row.logicalID === "month-event")).toBe(true);
    expect(effectivePeriod(document, "daily", "2026-10-21").some((row) => row.logicalID === "week-event")).toBe(true);
    deleteAppearance(document, "month-task", "daily", "2026-10-14");
    expect(effectivePeriod(document, "daily", "2026-10-14").some((row) => row.logicalID === "month-task")).toBe(false);
    expect(effectivePeriod(document, "monthly", "2026-10").some((row) => row.logicalID === "month-task")).toBe(true);
    completeTask(document, "day-task", true);
    expect(effectivePeriod(document, "daily", "2026-10-14").find((row) => row.logicalID === "day-task")?.completed).toBe(true);
    expect(completeEventDay(document, "future", "2026-10-13", true)).toBe(true);
    expect(calendarDays(document, "2026-10-14").find((row) => row.logicalID === "future")?.completed).toBe(false);
    expect(document.payloads).toHaveLength(6);
    const beforeBlock = JSON.stringify(document);
    const blocked = previewNativeHandoff(document, [
      { id: "parent", kind: "task", origin: "monthly", originPeriodKey: "2026-10", title: "Parent", parentID: undefined },
      { id: "child", kind: "task", origin: "monthly", originPeriodKey: "2026-10", title: "Child", parentID: "parent" },
      { id: "plan", kind: "task", origin: "monthly", originPeriodKey: "2026-10", title: "Plan", planDocument: true },
      { id: "box", kind: "task", origin: "daily", originPeriodKey: "2026-10-14", title: "Box", postponeBox: true },
    ]);
    expect(blocked.blocked).toBe(2);
    expect(blocked.ready).toBe(2);
    expect(blocked.activationAllowed).toBe(false);
    expect(JSON.stringify(document)).toBe(beforeBlock);
  });
});
