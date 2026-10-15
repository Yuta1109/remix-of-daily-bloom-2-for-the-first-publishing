import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  calendarDays,
  completeReflection,
  createItem,
  dayCompletionKey,
  decodeDocument,
  deleteLevel,
  editLevel,
  editOccurrence,
  editPayload,
  effectiveItems,
  emptyDocument,
  excludeOccurrence,
  applyLegacyCalendarImport,
  importLegacyRecords,
  instancesCovering,
  isScheduledStart,
  LEGACY_COLOR_MAP,
  STORAGE_KEY,
  openCanonicalStore,
  probeLegacyWebViewCalendar,
  productionDocument,
  recordReflectionDecision,
  projectedKeys,
  repeatAllowedForSpan,
  restoreDocument,
  setCompleted,
  setEventCompletion,
  UNRESOLVED_LEGACY_COLORS,
  type CanonicalDocument,
} from "./canonical-planning-foundation";

function store(): CanonicalDocument {
  return emptyDocument();
}

describe("canonical planning foundation", () => {
  it("projects a monthly task into covered weeks and days, once", () => {
    const document = store();
    createItem(document, {
      id: "task-month",
      kind: "task",
      origin: "monthly",
      originPeriodKey: "2026-10",
      title: "Span",
      startDate: "2026-10-30",
      endDate: "2026-11-03",
      todayTaskID: "today-1",
    });
    expect(projectedKeys(document, document.payloads[0], "weekly")).toEqual(["2026-10-26", "2026-11-02"]);
    expect(projectedKeys(document, document.payloads[0], "daily")).toEqual([
      "2026-10-30",
      "2026-10-31",
      "2026-11-01",
      "2026-11-02",
      "2026-11-03",
    ]);
    expect(projectedKeys(document, document.payloads[0], "monthly")).toEqual(["2026-10", "2026-11"]);
    expect(effectiveItems(document, "daily", "2026-10-30")).toHaveLength(1);
  });

  it("keeps a weekly task out of monthly", () => {
    const document = store();
    createItem(document, {
      id: "task-week",
      kind: "task",
      origin: "weekly",
      originPeriodKey: "2026-10-26",
      title: "Week",
      startDate: "2026-10-30",
      endDate: "2026-10-30",
    });
    expect(projectedKeys(document, document.payloads[0], "daily")).toEqual(["2026-10-30"]);
    expect(projectedKeys(document, document.payloads[0], "monthly")).toEqual([]);
    expect(projectedKeys(document, document.payloads[0], "future")).toEqual([]);
  });

  it("shares daily and today completion on one payload", () => {
    const document = store();
    createItem(document, {
      id: "task-day",
      kind: "task",
      origin: "daily",
      originPeriodKey: "2026-10-13",
      title: "Today",
      startDate: "2026-10-13",
      todayTaskID: "shared-today",
    });
    setCompleted(document, "task-day", true);
    const daily = effectiveItems(document, "daily", "2026-10-13")[0];
    expect(daily.completed).toBe(true);
    expect(daily.todayTaskID).toBe("shared-today");
    expect(document.payloads[0].completed).toBe(true);
    expect(projectedKeys(document, document.payloads[0], "weekly")).toEqual([]);
  });

  it("projects a future event through months, weeks, and days, including another year", () => {
    const document = store();
    createItem(document, {
      id: "event-future",
      kind: "event",
      origin: "future",
      originPeriodKey: "2026",
      title: "Cross year",
      startDate: "2026-12-30",
      endDate: "2027-01-02",
    });
    const payload = document.payloads[0];
    expect(projectedKeys(document, payload, "future")).toEqual(["2026", "2027"]);
    expect(projectedKeys(document, payload, "monthly")).toEqual(["2026-12", "2027-01"]);
    expect(projectedKeys(document, payload, "daily")).toContain("2026-12-31");
    expect(projectedKeys(document, payload, "daily")).toContain("2027-01-01");
  });

  it("projects a monthly event into weeks and days without a second daily row", () => {
    const document = store();
    createItem(document, {
      id: "event-month",
      kind: "event",
      origin: "monthly",
      originPeriodKey: "2026-10",
      title: "Trip",
      startDate: "2026-10-30",
      endDate: "2026-11-03",
      startMinutes: 22 * 60,
      endMinutes: 60,
    });
    const payload = document.payloads[0];
    expect(projectedKeys(document, payload, "weekly")).toEqual(["2026-10-26", "2026-11-02"]);
    expect(projectedKeys(document, payload, "daily")).toHaveLength(5);
    expect(calendarDays(document, "2026-10-30")).toHaveLength(1);
    expect(calendarDays(document, "2026-11-03")).toHaveLength(1);
  });

  it("projects a weekly event into days only", () => {
    const document = store();
    createItem(document, {
      id: "event-week",
      kind: "event",
      origin: "weekly",
      originPeriodKey: "2026-10-26",
      title: "Week event",
      startDate: "2026-10-30",
      endDate: "2026-10-31",
    });
    expect(projectedKeys(document, document.payloads[0], "daily")).toEqual(["2026-10-30", "2026-10-31"]);
    expect(projectedKeys(document, document.payloads[0], "monthly")).toEqual([]);
    expect(projectedKeys(document, document.payloads[0], "future")).toEqual([]);
  });

  it("keeps a calendar-created event on daily", () => {
    const document = store();
    createItem(document, {
      id: "event-cal",
      kind: "event",
      origin: "daily",
      originPeriodKey: "2026-10-13",
      title: "Calendar",
      startDate: "2026-10-13",
      endDate: "2026-10-14",
      startMinutes: 22 * 60,
      endMinutes: 60,
    });
    expect(calendarDays(document, "2026-10-13")).toHaveLength(1);
    expect(calendarDays(document, "2026-10-14")).toHaveLength(1);
    expect(projectedKeys(document, document.payloads[0], "weekly")).toEqual([]);
    expect(projectedKeys(document, document.payloads[0], "monthly")).toEqual([]);
    expect(projectedKeys(document, document.payloads[0], "future")).toEqual([]);
  });

  it("leaves an undated task on its origin period", () => {
    const document = store();
    createItem(document, {
      id: "undated",
      kind: "task",
      origin: "monthly",
      originPeriodKey: "2026-10",
      title: "No date",
    });
    expect(projectedKeys(document, document.payloads[0], "monthly")).toEqual(["2026-10"]);
    expect(projectedKeys(document, document.payloads[0], "weekly")).toEqual([]);
    expect(projectedKeys(document, document.payloads[0], "daily")).toEqual([]);
  });

  it("deletes one level and does not recreate it", () => {
    const document = store();
    createItem(document, {
      id: "linked",
      kind: "event",
      origin: "monthly",
      originPeriodKey: "2026-10",
      title: "Linked",
      startDate: "2026-10-13",
      endDate: "2026-10-13",
    });
    deleteLevel(document, "linked", "monthly", "2026-10");
    expect(projectedKeys(document, document.payloads[0], "monthly")).toEqual([]);
    expect(projectedKeys(document, document.payloads[0], "daily")).toEqual(["2026-10-13"]);
    expect(document.payloads).toHaveLength(1);
    deleteLevel(document, "linked", "daily", "2026-10-13");
    expect(projectedKeys(document, document.payloads[0], "daily")).toEqual([]);
    expect(document.payloads).toHaveLength(1);
    deleteLevel(document, "linked", "daily", "2026-10-13");
    expect(document.tombstones).toHaveLength(2);
  });

  it("keeps a daily override when the source title changes", () => {
    const document = store();
    createItem(document, {
      id: "edit",
      kind: "event",
      origin: "monthly",
      originPeriodKey: "2026-10",
      title: "Source",
      startDate: "2026-10-13",
      endDate: "2026-10-13",
    });
    editLevel(document, "edit", "daily", "2026-10-13", { title: "Daily only" });
    editPayload(document, "edit", { title: "Source changed" });
    expect(effectiveItems(document, "monthly", "2026-10")[0].title).toBe("Source changed");
    expect(effectiveItems(document, "daily", "2026-10-13")[0].title).toBe("Daily only");
    expect(document.payloads[0].title).toBe("Source changed");
    expect(calendarDays(document, "2026-10-13")[0].title).toBe(effectiveItems(document, "daily", "2026-10-13")[0].title);
  });

  it("edits or excludes one occurrence and leaves the next one", () => {
    const document = store();
    createItem(document, {
      id: "series",
      kind: "event",
      origin: "daily",
      originPeriodKey: "2026-10-13",
      title: "Standup",
      startDate: "2026-10-13",
      endDate: "2026-10-13",
      recurrence: { frequency: "daily", endDate: "2026-10-15" },
    });
    editOccurrence(document, "series", "2026-10-13", { title: "Moved" });
    expect(calendarDays(document, "2026-10-13")[0].title).toBe("Moved");
    expect(calendarDays(document, "2026-10-14")[0].title).toBe("Standup");
    excludeOccurrence(document, "series", "2026-10-14");
    expect(calendarDays(document, "2026-10-14")).toEqual([]);
    expect(calendarDays(document, "2026-10-15")).toHaveLength(1);
    expect(document.payloads).toHaveLength(1);
    expect(document.payloads[0].recurrence.frequency).toBe("daily");
  });

  it("restores a document idempotently and fills missing fields", () => {
    const document = store();
    createItem(document, {
      id: "keep",
      kind: "task",
      origin: "daily",
      originPeriodKey: "2026-10-13",
      title: "Keep",
      startDate: "2026-10-13",
    });
    const encoded = JSON.stringify(document);
    const first = restoreDocument(encoded);
    const second = restoreDocument(JSON.stringify(first));
    expect(second.payloads.map((row) => row.id)).toEqual(["keep"]);
    const legacy = decodeDocument({
      schemaVersion: 1,
      payloads: [
        {
          id: "old",
          kind: "event",
          origin: "daily",
          originPeriodKey: "2026-01-01",
          title: "Old",
          iconSymbol: "calendar",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    } as unknown as CanonicalDocument);
    expect(legacy.payloads[0].location).toBe("");
    expect(legacy.payloads[0].memo).toBe("");
    expect(legacy.payloads[0].reminders).toEqual([]);
    expect(legacy.payloads[0].recurrence.frequency).toBe("none");
    expect(legacy.payloads[0].allDay).toBe(false);
    expect(restoreDocument("{")).toEqual(emptyDocument());
  });

  it("does not rewrite a completed reflection snapshot", () => {
    const document = store();
    createItem(document, {
      id: "series",
      kind: "event",
      origin: "daily",
      originPeriodKey: "2026-10-13",
      title: "Standup",
      startDate: "2026-10-13",
      recurrence: { frequency: "weekly" },
    });
    expect(completeReflection(document, "daily:2026-10-13", ["series"])).toBe(true);
    expect(completeReflection(document, "daily:2026-10-13", ["other"])).toBe(false);
    editPayload(document, "series", { title: "Renamed" });
    excludeOccurrence(document, "series", "2026-10-13");
    expect(document.reflectionSnapshots).toEqual([{ id: "daily:2026-10-13", completed: true, decisionIDs: ["series"] }]);
    expect(document.payloads).toHaveLength(1);
  });

  it("imports a legacy snapshot once and does not guess unmapped colors", () => {
    expect(probeLegacyWebViewCalendar()).toBe("unresolved");
    const document = store();
    const records = [
      {
        id: "web-1",
        title: "Blue",
        date: "2026-10-13",
        allDay: true,
        color: "blue",
        notes: "memo",
        location: "Hall",
        repeat: "weekly" as const,
      },
      { id: "web-2", title: "Red", date: "2026-10-14", color: "red" },
    ];
    expect(importLegacyRecords(document, records)).toBe(2);
    expect(importLegacyRecords(document, records)).toBe(0);
    expect(document.payloads[0].colorID).toBe(LEGACY_COLOR_MAP.blue);
    expect(document.payloads[0].allDay).toBe(true);
    expect(document.payloads[0].startMinutes).toBeUndefined();
    expect(document.payloads[0].origin).toBe("daily");
    expect(document.payloads[1].colorID).toBeUndefined();
    expect(document.payloads[1].legacyColorKey).toBe("red");
    expect(UNRESOLVED_LEGACY_COLORS).toEqual(["red", "teal", "gray"]);
    createItem(document, {
      id: "native",
      legacyWebID: "web-3",
      kind: "event",
      origin: "daily",
      originPeriodKey: "2026-10-15",
      title: "Native newer",
      startDate: "2026-10-15",
      updatedAt: "2026-10-20T00:00:00.000Z",
    });
    importLegacyRecords(document, [{ id: "web-3", title: "Old web", date: "2026-10-15", updatedAt: "2026-10-01T00:00:00.000Z" }]);
    expect(document.payloads.find((row) => row.legacyWebID === "web-3")?.title).toBe("Native newer");
  });

  it("keeps the live Planning session off this store", () => {
    const session = readFileSync("ios/App/App/Native/Features/Planning/PlanningModels.swift", "utf8");
    const period = readFileSync("ios/App/App/Native/Features/Planning/PlanningPeriod.swift", "utf8");
    const storeSource = readFileSync("ios/App/App/Native/Features/Calendar/CanonicalPlanningStore.swift", "utf8");
    expect(session).toContain("func persist(into navigation: TabNavigationState)");
    expect(session).not.toContain("CanonicalPlanningStore");
    expect(period).toContain("func deleteLiveItem");
    expect(storeSource).toContain("essences.canonical-planning.v1");
    expect(storeSource).toContain("probeLegacyWebViewCalendar");
    expect(storeSource).toContain("unresolved");
    expect(storeSource).not.toMatch(/func deleteLiveItem/);
    expect(storeSource).not.toContain("WKWebsiteDataStore");
  });

  it("completes one displayed day without copying the event or the series", () => {
    const document = store();
    createItem(document, {
      id: "once",
      kind: "event",
      origin: "daily",
      originPeriodKey: "2026-10-13",
      title: "Once",
      startDate: "2026-10-13",
      endDate: "2026-10-13",
    });
    expect(setEventCompletion(document, "once", "2026-10-13", true)).toBe(true);
    expect(setEventCompletion(document, "once", "2026-10-13", true)).toBe(true);
    expect(document.dayCompletions).toHaveLength(1);
    expect(calendarDays(document, "2026-10-13")[0].completed).toBe(true);
    setEventCompletion(document, "once", "2026-10-13", false);
    expect(calendarDays(document, "2026-10-13")[0].completed).toBe(false);
    expect(document.payloads).toHaveLength(1);
    expect(document.payloads[0].title).toBe("Once");
    expect(document.payloads[0].recurrence.frequency).toBe("none");
  });

  it("keeps each day of a span and each recurring date independent", () => {
    const document = store();
    createItem(document, {
      id: "span",
      kind: "event",
      origin: "monthly",
      originPeriodKey: "2026-10",
      title: "Trip",
      startDate: "2026-10-13",
      endDate: "2026-10-15",
    });
    editOccurrence(document, "span", "2026-10-13", { title: "Trip note", location: "Kyoto" });
    setEventCompletion(document, "span", "2026-10-13", true);
    setEventCompletion(document, "span", "2026-10-15", true);
    expect(calendarDays(document, "2026-10-13")[0].completed).toBe(true);
    expect(calendarDays(document, "2026-10-14")[0].completed).toBe(false);
    expect(calendarDays(document, "2026-10-15")[0].completed).toBe(true);
    expect(calendarDays(document, "2026-10-14")[0].location).toBe("Kyoto");
    expect(document.occurrenceOverrides[0].title).toBe("Trip note");
    expect(document.payloads).toHaveLength(1);

    createItem(document, {
      id: "series",
      kind: "event",
      origin: "daily",
      originPeriodKey: "2026-10-13",
      title: "Standup",
      startDate: "2026-10-13",
      endDate: "2026-10-13",
      recurrence: { frequency: "daily", endDate: "2026-10-16" },
    });
    setEventCompletion(document, "series", "2026-10-13", true);
    expect(calendarDays(document, "2026-10-13")[0].completed).toBe(true);
    expect(calendarDays(document, "2026-10-14")[0].completed).toBe(false);
    expect(document.payloads.find((row) => row.id === "series")?.recurrence.frequency).toBe("daily");
    expect(dayCompletionKey("series", "2026-10-13")).toBe("series|day|2026-10-13");
  });

  it("separates overlapping multi-day instances and does not share their checks", () => {
    const document = store();
    createItem(document, {
      id: "overlap",
      kind: "event",
      origin: "daily",
      originPeriodKey: "2026-10-13",
      title: "Block",
      startDate: "2026-10-13",
      endDate: "2026-10-15",
      recurrence: { frequency: "daily", endDate: "2026-10-16" },
    });
    expect(repeatAllowedForSpan("2026-10-13", "2026-10-15", "daily")).toBe(false);
    expect(instancesCovering(document.payloads[0], "2026-10-15")).toEqual(["2026-10-13", "2026-10-14", "2026-10-15"]);
    editOccurrence(document, "overlap", "2026-10-13", { title: "First block" });
    setEventCompletion(document, "overlap", "2026-10-15", true);
    expect(calendarDays(document, "2026-10-15")).toHaveLength(1);
    expect(calendarDays(document, "2026-10-15")[0].completed).toBe(true);
    expect(calendarDays(document, "2026-10-15")[0].title).toBe("Block");
    expect(calendarDays(document, "2026-10-13")[0].completed).toBe(false);
    expect(calendarDays(document, "2026-10-13")[0].title).toBe("First block");
    expect(document.payloads.filter((row) => row.id === "overlap")).toHaveLength(1);
  });

  it("drops overrides outside a shortened span and keeps tombstones, horizon exceptions, and reflection", () => {
    const document = store();
    createItem(document, {
      id: "range",
      kind: "event",
      origin: "monthly",
      originPeriodKey: "2026-10",
      title: "Range",
      startDate: "2026-10-13",
      endDate: "2026-10-15",
    });
    editLevel(document, "range", "daily", "2026-10-15", { memo: "last day" });
    deleteLevel(document, "range", "weekly", "2026-10-12");
    expect(completeReflection(document, "monthly:2026-10", ["range"])).toBe(true);
    editPayload(document, "range", { endDate: "2026-10-14" });
    expect(document.levelOverrides).toEqual([]);
    expect(calendarDays(document, "2026-10-15")).toEqual([]);
    expect(document.tombstones).toEqual([{ logicalID: "range", level: "weekly", periodKey: "2026-10-12" }]);
    expect(document.reflectionSnapshots).toEqual([{ id: "monthly:2026-10", completed: true, decisionIDs: ["range"] }]);
    editPayload(document, "range", { endDate: "2026-10-16" });
    expect(projectedKeys(document, document.payloads[0], "daily").filter((key) => key === "2026-10-16")).toEqual(["2026-10-16"]);
    expect(new Set(projectedKeys(document, document.payloads[0], "daily")).size).toBe(projectedKeys(document, document.payloads[0], "daily").length);

    editPayload(document, "range", { startDate: "2026-10-30", endDate: "2026-11-02" });
    editLevel(document, "range", "daily", "2026-11-02", { memo: "november" });
    editPayload(document, "range", { endDate: "2026-10-31" });
    expect(document.levelOverrides).toEqual([]);
    expect(calendarDays(document, "2026-10-30")).toHaveLength(1);

    editPayload(document, "range", { startDate: "2026-12-30", endDate: "2027-01-02" });
    editLevel(document, "range", "daily", "2027-01-02", { memo: "next year" });
    editPayload(document, "range", { endDate: "2026-12-31" });
    expect(document.levelOverrides).toEqual([]);
    expect(calendarDays(document, "2026-12-30")).toHaveLength(1);
    expect(calendarDays(document, "2027-01-02")).toEqual([]);

    const before = document.payloads[0].endDate;
    editPayload(document, "range", { endDate: "2026-01-01" });
    expect(document.payloads[0].endDate).toBe(before);

    createItem(document, {
      id: "far",
      kind: "event",
      origin: "daily",
      originPeriodKey: "2026-01-01",
      title: "Far",
      startDate: "2026-01-01",
      endDate: "2026-01-01",
      recurrence: { frequency: "daily" },
    });
    editOccurrence(document, "far", "2027-06-01", { title: "Beyond horizon" });
    expect(isScheduledStart(document.payloads.find((row) => row.id === "far")!, "2027-06-01")).toBe(true);
    editPayload(document, "far", { title: "Far renamed" });
    expect(document.occurrenceOverrides.some((row) => row.logicalID === "far" && row.title === "Beyond horizon")).toBe(true);
    editPayload(document, "far", { recurrence: { frequency: "daily", endDate: "2026-06-01" } });
    expect(document.occurrenceOverrides.some((row) => row.logicalID === "far")).toBe(false);
    expect(document.reflectionSnapshots[0].decisionIDs).toEqual(["range"]);
  });

  it("fills day completions when an older document omits them", () => {
    const legacy = decodeDocument({
      schemaVersion: 1,
      payloads: [
        {
          id: "old",
          kind: "event",
          origin: "daily",
          originPeriodKey: "2026-01-01",
          title: "Old",
          iconSymbol: "calendar",
          updatedAt: "2026-01-01T00:00:00.000Z",
          completed: true,
          startDate: "2026-01-01",
          endDate: "2026-01-01",
        },
      ],
    } as unknown as CanonicalDocument);
    expect(legacy.dayCompletions).toEqual([]);
    expect(calendarDays(legacy, "2026-01-01")[0].completed).toBe(false);
    expect(legacy.payloads[0].completed).toBe(true);
  });

  it("persists production rows and leaves samples, corrupt bytes, and migration unresolved", () => {
    const writes: string[] = [];
    const memory = {
      value: undefined as string | undefined,
      read(key: string) {
        return key === STORAGE_KEY ? this.value : undefined;
      },
      write(key: string, value: string) {
        if (key === STORAGE_KEY) {
          this.value = value;
          writes.push(value);
        }
      },
    };
    const opened = openCanonicalStore(memory);
    expect(opened.state).toBe("absent");
    expect(opened.mutate(() => undefined)).toBe(false);
    expect(memory.value).toBeUndefined();

    expect(opened.mutate((document) => {
      createItem(document, {
        id: "real",
        kind: "event",
        origin: "daily",
        originPeriodKey: "2026-10-13",
        title: "夕方の散歩",
        startDate: "2026-10-13",
        endDate: "2026-10-14",
        recurrence: { frequency: "weekly" },
      });
      createItem(document, {
        id: "sample",
        kind: "event",
        origin: "daily",
        originPeriodKey: "2026-10-13",
        title: "夕方の散歩",
        startDate: "2026-10-13",
        isSample: true,
      });
      editOccurrence(document, "real", "2026-10-13", { location: "Park" });
      excludeOccurrence(document, "real", "2026-10-20");
      setEventCompletion(document, "real", "2026-10-13", true);
      deleteLevel(document, "real", "monthly", "2026-10");
      completeReflection(document, "daily:2026-10-13", ["real"]);
    })).toBe(true);
    expect(opened.state).toBe("loaded");
    expect(opened.document.payloads.map((row) => row.id)).toEqual(["real", "sample"]);
    expect(opened.mutate(() => undefined)).toBe(false);
    expect(writes).toHaveLength(1);

    const stored = JSON.parse(memory.value ?? "{}") as { legacyMigration: string; payloads: { id: string }[] };
    expect(stored.legacyMigration).toBe("unresolved");
    expect(stored.payloads.map((row) => row.id)).toEqual(["real"]);

    const restored = openCanonicalStore(memory);
    expect(restored.state).toBe("loaded");
    expect(restored.document.payloads.map((row) => row.id)).toEqual(["real"]);
    expect(restored.document.occurrenceOverrides.map((row) => row.occurrenceDate).sort()).toEqual(["2026-10-13", "2026-10-20"]);
    expect(restored.document.dayCompletions).toEqual([{ logicalID: "real", date: "2026-10-13", completed: true }]);
    expect(restored.document.tombstones).toEqual([{ logicalID: "real", level: "monthly", periodKey: "2026-10" }]);
    expect(restored.document.reflectionSnapshots).toEqual([{ id: "daily:2026-10-13", completed: true, decisionIDs: ["real"] }]);
    expect(restored.document.legacyMigration).toBe("unresolved");
    expect(restored.mutate(() => undefined)).toBe(false);
    expect(writes).toHaveLength(1);

    const corrupt = { value: "{", read(key: string) { return key === STORAGE_KEY ? this.value : undefined; }, write() { throw new Error("must not write"); } };
    const blocked = openCanonicalStore(corrupt);
    expect(blocked.state).toBe("unreadable");
    expect(blocked.mutate((document) => { createItem(document, { id: "x", kind: "task", origin: "daily", originPeriodKey: "2026-10-13", title: "No" }); })).toBe(false);
    expect(corrupt.value).toBe("{");

    const wrongVersion = {
      value: JSON.stringify({ schemaVersion: 99, payloads: [{ id: "keep-me", title: "Real" }] }),
      read(key: string) { return key === STORAGE_KEY ? this.value : undefined; },
      write() { throw new Error("must not write"); },
    };
    expect(openCanonicalStore(wrongVersion).state).toBe("unreadable");
    expect(productionDocument(opened.document).payloads.map((row) => row.title)).toEqual(["夕方の散歩"]);
  });

  it("keeps genuine reflection history and drops only verified sample snapshots", () => {
    const document = store();
    createItem(document, { id: "real", kind: "task", origin: "daily", originPeriodKey: "2026-10-13", title: "夕方の散歩" });
    createItem(document, { id: "sample", kind: "task", origin: "daily", originPeriodKey: "2026-10-13", title: "夕方の散歩", isSample: true });
    completeReflection(document, "sample-only", ["sample"]);
    completeReflection(document, "genuine", ["real"]);
    completeReflection(document, "mixed", ["real", "sample"]);
    completeReflection(document, "unknown", ["already-gone"]);
    completeReflection(document, "empty-decisions", []);
    const produced = productionDocument(document);
    expect(produced.reflectionSnapshots.map((row) => row.id)).toEqual(["genuine", "mixed", "unknown", "empty-decisions"]);
    expect(produced.reflectionSnapshots.find((row) => row.id === "mixed")?.decisionIDs).toEqual(["real"]);
    expect(produced.reflectionSnapshots.find((row) => row.id === "unknown")?.decisionIDs).toEqual(["already-gone"]);
    expect(produced.payloads.map((row) => row.id)).toEqual(["real"]);

    const memory = {
      value: undefined as string | undefined,
      read(key: string) { return key === STORAGE_KEY ? this.value : undefined; },
      write(key: string, value: string) { if (key === STORAGE_KEY) this.value = value; },
    };
    const samplesOnly = openCanonicalStore(memory);
    expect(samplesOnly.mutate((doc) => {
      createItem(doc, { id: "demo", kind: "event", origin: "daily", originPeriodKey: "2026-10-13", title: "Demo", isSample: true });
      completeReflection(doc, "demo-reflection", ["demo"]);
    })).toBe(false);
    expect(memory.value).toBeUndefined();

    const restored = JSON.parse(JSON.stringify(produced));
    expect(productionDocument(decodeDocument(restored)).reflectionSnapshots.map((row) => row.id)).toEqual(["genuine", "mixed", "unknown", "empty-decisions"]);
  });

  it("imports a complete supported series and defers a series with an unsupported day", () => {
    const document = store();
    document.reflectionSnapshots.push({ id: "keep", completed: true, decisionIDs: ["other"] });
    const weekly = { id: "weekly", title: "Weekly", date: "2026-10-07", endDate: "2026-10-07", startTime: "18:00", repeat: "weekly" as const, color: "gray", icon: "calendar", allDay: false, excludeDates: ["2026-10-21", "2027-01-06"] };
    const moved = { id: "edit", title: "Moved", date: "2026-10-28", endDate: "2026-10-28", startTime: "19:00", location: "Hall", recurrenceMasterId: "weekly", recurrenceDate: "2026-10-28", color: "gray", icon: "calendar", allDay: false };
    const first = applyLegacyCalendarImport(document, [
      { id: "once", title: "Once", date: "2026-10-13", startTime: "09:00", endTime: "10:00", color: "red", reminders: ["15m"], allDay: false },
      { id: "span", title: "Span", date: "2026-10-13", endDate: "2026-10-15", allDay: true, color: "teal" },
      weekly,
      moved,
      { id: "recolor", title: "Recolor", date: "2026-11-04", endDate: "2026-11-04", color: "blue", recurrenceMasterId: "paint", recurrenceDate: "2026-11-04" },
      { id: "paint", title: "Paint", date: "2026-10-07", endDate: "2026-10-07", repeat: "weekly", color: "gray" },
    ]);
    expect(first.inserted).toBe(3);
    expect(first.deferred).toBe(1);
    expect(first.overridesAdded).toBe(1);
    expect(first.exclusionsAdded).toBe(2);
    expect(document.payloads.some((row) => row.legacyWebID === "paint")).toBe(false);
    expect(document.payloads.find((row) => row.legacyWebID === "once")?.reminders).toEqual(["15m"]);
    const stored = document.payloads.find((row) => row.legacyWebID === "weekly");
    expect(stored?.legacyColorKey).toBe("gray");
    expect(calendarDays(document, "2026-10-21").some((row) => row.logicalID === stored?.id)).toBe(false);
    expect(calendarDays(document, "2026-10-14").some((row) => row.logicalID === stored?.id)).toBe(true);
    expect(calendarDays(document, "2027-01-06").some((row) => row.logicalID === stored?.id)).toBe(false);
    expect(document.occurrenceOverrides.find((row) => row.occurrenceDate === "2026-10-28")?.title).toBe("Moved");
    expect(document.occurrenceOverrides.find((row) => row.occurrenceDate === "2026-10-28")?.location).toBe("Hall");
    expect(document.reflectionSnapshots).toEqual([{ id: "keep", completed: true, decisionIDs: ["other"] }]);
    expect(document.legacyMigration).toBe("unresolved");
    if (stored) stored.title = "User edit";
    const second = applyLegacyCalendarImport(document, [weekly, moved]);
    expect(second.inserted).toBe(0);
    expect(second.skipped).toBe(1);
    expect(second.exclusionsAdded).toBe(0);
    expect(document.payloads.find((row) => row.legacyWebID === "weekly")?.title).toBe("User edit");
    const orphan = applyLegacyCalendarImport(document, [
      { id: "child", title: "Lost", date: "2026-10-01", recurrenceMasterId: "missing", recurrenceDate: "2026-10-01" },
    ]);
    expect(orphan.unsupported).toBe(1);
    expect(orphan.inserted).toBe(0);
    const partial = store();
    applyLegacyCalendarImport(partial, [weekly]);
    partial.payloads[0].title = "Kept";
    const flagged = applyLegacyCalendarImport(partial, [
      weekly,
      { id: "icon", title: "Icon", date: "2026-10-28", endDate: "2026-10-28", icon: "star", recurrenceMasterId: "weekly", recurrenceDate: "2026-10-28" },
    ]);
    expect(flagged.reconciliation).toBe(1);
    expect(flagged.inserted).toBe(0);
    expect(partial.payloads[0].title).toBe("Kept");
    for (const change of [
      { color: "blue" },
      { icon: "star" },
      { allDay: true },
      { endDate: "2026-10-16" },
    ]) {
      const fresh = store();
      const stats = applyLegacyCalendarImport(fresh, [
        { id: "series", title: "Series", date: "2026-10-07", endDate: "2026-10-07", repeat: "weekly", color: "gray", icon: "calendar", allDay: false },
        { id: "day", title: "Day", date: "2026-10-14", endDate: "2026-10-14", color: "gray", icon: "calendar", allDay: false, recurrenceMasterId: "series", recurrenceDate: "2026-10-14", ...change },
      ]);
      expect(stats.deferred).toBe(1);
      expect(stats.inserted).toBe(0);
      expect(fresh.payloads).toEqual([]);
    }
    const memory = {
      value: "{",
      read(key: string) { return key === STORAGE_KEY ? this.value : undefined; },
      write() { throw new Error("must not write"); },
    };
    const blocked = openCanonicalStore(memory);
    expect(blocked.mutate((doc) => { applyLegacyCalendarImport(doc, [{ id: "once", title: "Once", date: "2026-10-13" }]); })).toBe(false);
    expect(memory.value).toBe("{");
  });

  it("keeps one-level children and reflection decisions apart from completion", () => {
    const doc = emptyDocument();
    createItem(doc, { id: "parent", kind: "task", origin: "monthly", originPeriodKey: "2026-10", title: "Read two books", startDate: "2026-10-14", endDate: "2026-10-14" });
    createItem(doc, { id: "a", kind: "task", origin: "monthly", originPeriodKey: "2026-10", title: "Book 1", parentID: "parent", childOrder: 0, startDate: "2026-10-14", endDate: "2026-10-14" });
    createItem(doc, { id: "b", kind: "task", origin: "monthly", originPeriodKey: "2026-10", title: "Book 2", parentID: "parent", childOrder: 1, completed: true, startDate: "2026-10-14", endDate: "2026-10-14" });
    for (const level of ["weekly", "daily"] as const) {
      const key = level === "weekly" ? "2026-10-12" : "2026-10-14";
      const tree = effectiveItems(doc, level, key).filter((row) => row.parentID === "parent" || row.logicalID === "parent");
      expect(tree.map((row) => row.logicalID)).toEqual(["parent", "a", "b"]);
      expect(tree.find((row) => row.logicalID === "a")?.completed).toBe(false);
      expect(tree.find((row) => row.logicalID === "b")?.completed).toBe(true);
    }
    expect(effectiveItems(doc, "future", "future").some((row) => row.logicalID === "a")).toBe(false);
    editPayload(doc, "a", { title: "Book 1 revised" });
    expect(doc.payloads.find((row) => row.id === "b")?.title).toBe("Book 2");
    deleteLevel(doc, "a", "daily", "2026-10-14");
    expect(effectiveItems(doc, "monthly", "2026-10").some((row) => row.logicalID === "a")).toBe(true);
    expect(effectiveItems(doc, "daily", "2026-10-14").some((row) => row.logicalID === "a")).toBe(false);
    const old = JSON.stringify({ payloads: doc.payloads.map(({ id, parentID }) => ({ id, parentID })) });
    expect(recordReflectionDecision(doc, { id: "d1", level: "daily", periodKey: "2026-10-14", logicalID: "a", disposition: "postpone", completed: false })).toBe(true);
    expect(recordReflectionDecision(doc, { id: "d2", level: "daily", periodKey: "2026-10-14", logicalID: "a", disposition: "stop", completed: true })).toBe(false);
    expect(completeReflection(doc, "daily:2026-10-14", ["a"])).toBe(true);
    expect(completeReflection(doc, "daily:2026-10-14", ["changed"])).toBe(false);
    editPayload(doc, "a", { title: "Later" });
    expect(doc.reflectionDecisions[0].disposition).toBe("postpone");
    expect(doc.reflectionSnapshots[0].decisionIDs).toEqual(["a"]);
    expect(JSON.stringify({ payloads: doc.payloads.map(({ id, parentID }) => ({ id, parentID })) })).toBe(old);
    const sample = emptyDocument();
    createItem(sample, { id: "sample-parent", kind: "task", origin: "daily", originPeriodKey: "2026-10-14", title: "Sample", isSample: true });
    createItem(sample, { id: "sample-child", kind: "task", origin: "daily", originPeriodKey: "2026-10-14", title: "Child", parentID: "sample-parent", isSample: true });
    recordReflectionDecision(sample, { id: "sd", level: "daily", periodKey: "2026-10-14", logicalID: "sample-child", disposition: "keep", completed: false, isSample: true });
    recordReflectionDecision(sample, { id: "real", level: "weekly", periodKey: "2026-W42", logicalID: "unknown", disposition: "stop", completed: false });
    const produced = productionDocument(sample);
    expect(produced.payloads).toEqual([]);
    expect(produced.reflectionDecisions.map((row) => row.id)).toEqual(["real"]);
    const legacy = decodeDocument(JSON.parse('{"schemaVersion":1,"legacyMigration":"unresolved","payloads":[{"id":"e1","legacyWebID":"web-1","kind":"event","origin":"daily","originPeriodKey":"2026-10-01","title":"Kept","location":"","memo":"","allDay":false,"reminders":[],"recurrence":{"frequency":"none"},"liveActivity":false,"updatedAt":"2026-01-01T00:00:00.000Z","completed":false}],"tombstones":[],"levelOverrides":[],"occurrenceOverrides":[],"dayCompletions":[],"reflectionSnapshots":[]}'));
    expect(legacy.payloads[0].legacyWebID).toBe("web-1");
    expect(legacy.reflectionDecisions).toEqual([]);
    expect(legacy.payloads[0].parentID).toBeUndefined();
  });
});
