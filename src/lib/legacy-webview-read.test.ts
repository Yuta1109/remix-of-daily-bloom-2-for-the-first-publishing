import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { STORAGE_KEY } from "./canonical-planning-foundation";
import { classifyLegacyOwner, classifyLegacyStorage, legacyDiagnosticReport, LEGACY_ORIGIN, LEGACY_V3_KEY } from "./legacy-webview-read";

describe("legacy webview read classification", () => {
  it("treats two missing keys as accessible and empty", () => {
    const result = classifyLegacyStorage(null, null);
    expect(result.status).toBe("accessibleButEmpty");
    expect(result.records).toEqual([]);
  });

  it("reads a version 3 event and keeps color, recurrence, and the original startAt", () => {
    const raw = JSON.stringify({
      schemaVersion: 3,
      tasks: { t1: { id: "t1", title: "Not an event" } },
      events: {
        e1: {
          id: "e1",
          title: "Seminar",
          color: "red",
          location: "Hall",
          note: "Bring notes",
          startAt: "2026-10-13T09:00",
          endAt: "2026-10-13T10:00",
          allDay: false,
          reminders: ["15m"],
          recurrence: { freq: "weekly" },
          excludeDates: ["2026-10-20"],
          repeatEndDate: "2026-12-01",
        },
      },
    });
    const result = classifyLegacyStorage(raw, null);
    expect(result.status).toBe("availableWithData");
    expect(result.ignoredCollections).toContain("tasks");
    expect(result.records).toEqual([
      expect.objectContaining({
        source: "v3",
        id: "e1",
        color: "red",
        startAt: "2026-10-13T09:00",
        recurrence: { freq: "weekly" },
        excludeDates: ["2026-10-20"],
        reminders: ["15m"],
      }),
    ]);
    expect(JSON.stringify(result)).not.toContain(STORAGE_KEY);
  });

  it("rejects malformed JSON and a non-v3 schema without inventing events", () => {
    expect(classifyLegacyStorage("{", null).status).toBe("malformedData");
    expect(classifyLegacyStorage(JSON.stringify({ schemaVersion: 2, events: {} }), null).status).toBe("unsupportedFormat");
    expect(classifyLegacyStorage(JSON.stringify({ schemaVersion: 2, events: {} }), null).records).toEqual([]);
  });

  it("lets V3 win on the same id and keeps a leftover calendar-events id", () => {
    const v3 = JSON.stringify({
      schemaVersion: 3,
      events: { e1: { id: "e1", title: "From V3", color: "teal", startAt: "2026-10-01T00:00", allDay: true } },
    });
    const leftover = JSON.stringify([
      { id: "e1", title: "Older", date: "2026-09-01", color: "gray" },
      { id: "e2", title: "Leftover", date: "2026-09-02", startTime: "18:30", color: "gray", repeat: "daily", isSample: false },
      { id: "demo", title: "夕方の散歩", date: "2026-09-03", isSample: true },
    ]);
    const result = classifyLegacyStorage(v3, leftover);
    expect(result.status).toBe("availableWithData");
    expect(result.duplicateCount).toBe(1);
    expect(result.records.map((row) => row.id)).toEqual(["e1", "e2"]);
    expect(result.records[0].title).toBe("From V3");
    expect(result.records[0].color).toBe("teal");
    expect(result.records[1]).toEqual(expect.objectContaining({ source: "calendar-events", date: "2026-09-02", startTime: "18:30", color: "gray", recurrence: "daily" }));
  });

  it("does not write the canonical key from this module", () => {
    const source = readFileSync("src/lib/legacy-webview-read.ts", "utf8");
    expect(source).not.toContain("localStorage.setItem");
    expect(source).not.toContain(STORAGE_KEY);
    expect(LEGACY_ORIGIN).toBe("capacitor://localhost");
    expect(LEGACY_V3_KEY).toBe("essences-app-data-v3");
    const reader = readFileSync("ios/App/App/Native/Features/Calendar/LegacyWebViewDataReader.swift", "utf8");
    expect(reader).not.toContain("localStorage.setItem");
    expect(reader).not.toContain("localStorage.removeItem");
    expect(reader).not.toContain("localStorage.clear");
    expect(reader).not.toContain("removeData");
    expect(reader).not.toContain("CanonicalPlanningPersistence.save");
    expect(reader).not.toContain("importLegacy");
  });

  it("classifies owner match, mismatch, absence, invalid marker, and signed-out", () => {
    expect(classifyLegacyOwner("uid-a", "uid-a")).toBe("matchingOwner");
    expect(classifyLegacyOwner("uid-a", "uid-b")).toBe("differentOwner");
    expect(classifyLegacyOwner(null, "uid-a")).toBe("missingOwner");
    expect(classifyLegacyOwner("   ", "uid-a")).toBe("invalidOwnerMarker");
    expect(classifyLegacyOwner("uid-a", null)).toBe("unauthenticated");
    expect(classifyLegacyOwner("uid-a", "  ")).toBe("unauthenticated");
  });

  it("marks only a matching owner with valid events as eligible, and never imports", () => {
    const v3 = JSON.stringify({ schemaVersion: 3, events: { e1: { id: "e1", title: "A", color: "gray" } } });
    const ready = legacyDiagnosticReport(v3, null, "uid-a", "uid-a");
    expect(ready.eligibleForFutureImport).toBe(true);
    expect(ready.importExecuted).toBe(false);
    expect(ready.candidateCount).toBe(1);
    expect(legacyDiagnosticReport(v3, null, "uid-b", "uid-a").eligibleForFutureImport).toBe(true);
    expect(legacyDiagnosticReport(v3, null, "uid-b", "uid-a").owner).toBe("differentOwner");
    expect(legacyDiagnosticReport(v3, null, null, null).eligibleForFutureImport).toBe(true);
    expect(legacyDiagnosticReport(v3, null, null, "uid-a").owner).toBe("missingOwner");
    expect(legacyDiagnosticReport(null, null, "uid-a", "uid-a").status).toBe("accessibleButEmpty");
    expect(legacyDiagnosticReport(null, "[]", "uid-a", null).owner).toBe("unauthenticated");
  });
});
