import { beforeEach, describe, expect, it } from "vitest";
import {
  LEGACY_KEYS,
  convertLegacyEvents,
  convertLegacyMemos,
  convertLegacyMonthGoals,
  convertLegacyReusable,
  convertLegacyTodo,
  hasLegacyData,
  migrateLegacyInto,
  readLegacySnapshot,
} from "@/lib/v3/legacy-migration";
import { emptyData } from "@/lib/v3/schema";
import { loadEssencesData, resetEssencesDataCache, runLegacyImport } from "@/lib/v3/storage";
import { STORAGE_KEY } from "@/lib/v3/types";

const NOW = "2026-09-21T00:00:00.000Z";

const LEGACY_TODO = {
  // Deliberately mixed: a UTC-shifted bucket and a matching one.
  "2026-09-20": {
    tasks: [
      { id: "t1", text: "買い物", completed: false, date: "2026-09-20" },
      { id: "t2", text: "掃除", completed: true, date: "2026-09-20" },
    ],
    reflection: "よい一日だった",
  },
  "2026-09-21": {
    tasks: [{ id: "t3", text: "散歩", completed: false, date: "2026-09-21" }],
    reflection: "",
  },
};

const LEGACY_EVENTS = [
  {
    id: "e1",
    title: "歯医者",
    date: "2026-09-22",
    startTime: "10:00",
    endTime: "11:00",
    allDay: false,
    color: "blue",
    repeat: "none",
    reminders: ["30m", "1h"],
    liveActivity: true,
    liveActivityLead: "1h",
    location: "駅前",
    notes: "保険証",
  },
  {
    id: "e2",
    title: "旅行",
    date: "2026-10-01",
    endDate: "2026-10-03",
    allDay: true,
    repeat: "yearly",
    reminder: "1d",
    excludeDates: ["2027-10-01"],
    repeatEndDate: "2030-01-01",
  },
  {
    id: "e3",
    title: "例外の回",
    date: "2026-11-01",
    allDay: true,
    recurrenceMasterId: "e2",
    recurrenceDate: "2026-11-01",
  },
];

const LEGACY_MONTH_GOALS = {
  // Legacy month keys are 0-based: "2026-8" means September 2026.
  "2026-8": {
    goals: [
      { id: "g1", text: "毎日歩く", completed: false },
      { id: "g2", text: "本を読む", completed: true, completedAt: "2026-09-10T00:00:00.000Z" },
    ],
    minimized: false,
  },
};

const LEGACY_MEMOS = {
  categories: [
    { id: "c1", name: "仕事", pageIds: ["p2", "p1"], collapsed: false, color: "#C8E8D4" },
    { id: "c2", name: "", pageIds: [], collapsed: false },
  ],
  pages: [
    { id: "p1", title: "会議", html: "<div>メモ</div>", updatedAt: 1758412800000 },
    { id: "p2", title: "", html: "<div>あとで</div>", updatedAt: 1758326400000 },
  ],
};

function seedLegacy() {
  localStorage.setItem(LEGACY_KEYS.todo, JSON.stringify(LEGACY_TODO));
  localStorage.setItem(LEGACY_KEYS.reusable, JSON.stringify([{ id: "r1", text: "ゴミ出し" }]));
  localStorage.setItem(LEGACY_KEYS.events, JSON.stringify(LEGACY_EVENTS));
  localStorage.setItem(LEGACY_KEYS.monthGoals, JSON.stringify(LEGACY_MONTH_GOALS));
  localStorage.setItem(LEGACY_KEYS.memos, JSON.stringify(LEGACY_MEMOS));
}

beforeEach(() => {
  localStorage.clear();
  resetEssencesDataCache();
});

describe("convertLegacyTodo", () => {
  it("maps tasks and preserves legacy date keys verbatim", () => {
    const { tasks } = convertLegacyTodo(LEGACY_TODO, NOW);
    expect(tasks).toHaveLength(3);
    // The legacy Today store built keys with toISOString() (UTC). Migration must
    // not reinterpret them, or a user's tasks would silently move a day.
    expect(tasks.map((t) => t.date)).toEqual(["2026-09-20", "2026-09-20", "2026-09-21"]);
    expect(tasks[1].status).toBe("completed");
    expect(tasks[0].status).toBe("open");
    expect(tasks[0].createdFrom).toBe("todo");
    expect(tasks[0].allDay).toBe(true);
  });

  it("falls back to the bucket key when the record has no usable date", () => {
    const { tasks } = convertLegacyTodo(
      { "2026-09-19": { tasks: [{ id: "x", text: "no date" }], reflection: "" } },
      NOW,
    );
    expect(tasks[0].date).toBe("2026-09-19");
  });

  it("counts per-day reflection texts as unmapped", () => {
    expect(convertLegacyTodo(LEGACY_TODO, NOW).reflectionCount).toBe(1);
  });

  it("skips blank titles and malformed input", () => {
    expect(convertLegacyTodo({ "2026-09-21": { tasks: [{ text: "  " }] } }, NOW).tasks).toEqual([]);
    expect(convertLegacyTodo(null, NOW).tasks).toEqual([]);
    expect(convertLegacyTodo("garbage", NOW).tasks).toEqual([]);
  });
});

describe("convertLegacyMonthGoals", () => {
  it("maps goals to Monthly plans with 1-based month boundaries", () => {
    const plans = convertLegacyMonthGoals(LEGACY_MONTH_GOALS, NOW);
    expect(plans).toHaveLength(2);
    expect(plans[0].level).toBe("monthly");
    expect(plans[0].periodStart).toBe("2026-09-01");
    expect(plans[0].periodEnd).toBe("2026-09-30");
    expect(plans[0].parentPlanId).toBeUndefined();
    expect(plans[1].status).toBe("completed");
    expect(plans[1].completedAt).toBe("2026-09-10T00:00:00.000Z");
  });

  it("ignores out-of-range month indexes", () => {
    expect(convertLegacyMonthGoals({ "2026-12": { goals: [{ text: "x" }] } }, NOW)).toEqual([]);
  });
});

describe("convertLegacyEvents", () => {
  it("maps a timed event to local wall-clock start/end", () => {
    const [timed] = convertLegacyEvents(LEGACY_EVENTS, NOW);
    expect(timed.startAt).toBe("2026-09-22T10:00");
    expect(timed.endAt).toBe("2026-09-22T11:00");
    expect(timed.allDay).toBe(false);
    expect(timed.reminders).toEqual(["30m", "1h"]);
    expect(timed.liveActivity).toBe(true);
    expect(timed.liveActivityLead).toBe("1h");
    expect(timed.location).toBe("駅前");
    expect(timed.note).toBe("保険証");
    expect(timed.recurrence).toBeUndefined();
    expect(timed.status).toBe("scheduled");
  });

  it("preserves multi-day all-day spans and recurrence metadata", () => {
    const [, span, exception] = convertLegacyEvents(LEGACY_EVENTS, NOW);
    expect(span.startAt).toBe("2026-10-01T00:00");
    expect(span.endAt).toBe("2026-10-03T00:00");
    expect(span.recurrence).toEqual({ freq: "yearly" });
    expect(span.excludeDates).toEqual(["2027-10-01"]);
    expect(span.repeatEndDate).toBe("2030-01-01");
    // Legacy "1d" is not a valid reminder token, so it is dropped rather than guessed.
    expect(span.reminders).toBeUndefined();
    expect(exception.recurrenceMasterId).toBe("legacy-event:e2");
    expect(exception.recurrenceDate).toBe("2026-11-01");
  });

  it("falls back to the deprecated single reminder field", () => {
    const [event] = convertLegacyEvents(
      [{ id: "e9", title: "x", date: "2026-09-21", allDay: true, reminder: "30m" }],
      NOW,
    );
    expect(event.reminders).toEqual(["30m"]);
  });

  it("drops events with an unusable date", () => {
    expect(convertLegacyEvents([{ id: "bad", title: "x", date: "nope" }], NOW)).toEqual([]);
  });
});

describe("convertLegacyMemos", () => {
  it("maps pages to notes and categories to collections with order", () => {
    const { notes, collections, entries } = convertLegacyMemos(LEGACY_MEMOS, NOW);
    expect(notes).toHaveLength(2);
    expect(collections.map((c) => c.name)).toEqual(["仕事", ""]);

    const work = collections[0];
    const workEntries = entries.filter((e) => e.collectionId === work.id);
    expect(workEntries.map((e) => e.order)).toEqual([0, 1]);
    // Legacy pageIds order is ["p2", "p1"], which must survive.
    expect(workEntries[0].noteId).toBe("legacy-note:p2");
    expect(workEntries[1].noteId).toBe("legacy-note:p1");
    expect(workEntries[0].type).toBe("note");

    const p1 = notes.find((n) => n.id === "legacy-note:p1");
    expect(p1?.collectionIds).toEqual([work.id]);
    expect(p1?.title).toBe("会議");
    expect(p1?.updatedAt).toBe(new Date(1758412800000).toISOString());
    expect(p1?.image).toBeUndefined();
  });

  it("keeps an empty collection", () => {
    const { collections, entries } = convertLegacyMemos(LEGACY_MEMOS, NOW);
    const empty = collections[1];
    expect(entries.filter((e) => e.collectionId === empty.id)).toEqual([]);
  });
});

describe("convertLegacyReusable", () => {
  it("maps reusable tasks to task templates", () => {
    const templates = convertLegacyReusable([{ id: "r1", text: "ゴミ出し" }], NOW);
    expect(templates).toEqual([
      {
        id: "legacy-template:r1",
        title: "ゴミ出し",
        icon: "circle",
        color: "orange",
        order: 0,
        createdAt: NOW,
        updatedAt: NOW,
      },
    ]);
  });
});

describe("migrateLegacyInto", () => {
  it("detects legacy data", () => {
    expect(hasLegacyData(readLegacySnapshot())).toBe(false);
    seedLegacy();
    expect(hasLegacyData(readLegacySnapshot())).toBe(true);
  });

  it("produces a complete V3 structure", () => {
    seedLegacy();
    const data = migrateLegacyInto(emptyData(NOW), readLegacySnapshot(), NOW);

    expect(Object.keys(data.tasks)).toHaveLength(3);
    expect(Object.keys(data.plans)).toHaveLength(2);
    expect(Object.keys(data.events)).toHaveLength(3);
    expect(Object.keys(data.notes)).toHaveLength(2);
    expect(Object.keys(data.collections)).toHaveLength(2);
    expect(Object.keys(data.collectionEntries)).toHaveLength(2);
    expect(Object.keys(data.taskTemplates)).toHaveLength(1);
    expect(data.schemaVersion).toBe(3);

    expect(data.legacyImport?.sources).toEqual([
      LEGACY_KEYS.todo,
      LEGACY_KEYS.reusable,
      LEGACY_KEYS.events,
      LEGACY_KEYS.monthGoals,
      LEGACY_KEYS.memos,
    ]);
    expect(data.legacyImport?.counts.tasks).toBe(3);
    expect(data.legacyImport?.unmapped?.dailyReflectionTexts).toBe(1);
  });

  it("is idempotent", () => {
    seedLegacy();
    const snapshot = readLegacySnapshot();
    const data = migrateLegacyInto(emptyData(NOW), snapshot, NOW);
    const firstIds = Object.keys(data.tasks).sort();

    migrateLegacyInto(data, snapshot, NOW);

    expect(Object.keys(data.tasks).sort()).toEqual(firstIds);
    expect(Object.keys(data.events)).toHaveLength(3);
    expect(Object.keys(data.notes)).toHaveLength(2);
    expect(data.legacyImport?.counts.tasks).toBe(0);
  });

  it("never modifies or deletes the legacy stores", () => {
    seedLegacy();
    const before = Object.fromEntries(
      Object.values(LEGACY_KEYS).map((key) => [key, localStorage.getItem(key)]),
    );

    loadEssencesData();
    runLegacyImport();

    for (const [key, value] of Object.entries(before)) {
      expect(localStorage.getItem(key)).toBe(value);
    }
  });

  it("runs automatically on the first V3 load", () => {
    seedLegacy();
    const data = loadEssencesData();
    expect(Object.keys(data.tasks)).toHaveLength(3);
    expect(localStorage.getItem(STORAGE_KEY)).toBeTruthy();
  });

  it("does not duplicate on a second load", () => {
    seedLegacy();
    loadEssencesData();
    resetEssencesDataCache();
    const data = loadEssencesData();
    expect(Object.keys(data.tasks)).toHaveLength(3);
  });
});
