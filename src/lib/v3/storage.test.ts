import { beforeEach, describe, expect, it } from "vitest";
import { emptyData, normalizeData } from "@/lib/v3/schema";
import {
  SCHEMA_MIGRATIONS,
  loadEssencesData,
  resetEssencesDataCache,
  saveEssencesData,
  updateEssencesData,
  upgradeSchema,
} from "@/lib/v3/storage";
import { SCHEMA_VERSION, STORAGE_KEY } from "@/lib/v3/types";

beforeEach(() => {
  localStorage.clear();
  resetEssencesDataCache();
});

describe("schema version handling", () => {
  it("uses key essences-app-data-v3 and schemaVersion 3", () => {
    expect(STORAGE_KEY).toBe("essences-app-data-v3");
    expect(SCHEMA_VERSION).toBe(3);
    loadEssencesData();
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) as string);
    expect(raw.schemaVersion).toBe(3);
  });

  it("passes a current-version payload through unchanged", () => {
    const result = upgradeSchema({ schemaVersion: 3, tasks: {} });
    expect(result).toMatchObject({ ok: true, from: 3, to: 3 });
  });

  it("treats an unversioned payload as the current version", () => {
    const result = upgradeSchema({ tasks: {} });
    expect(result).toMatchObject({ ok: true, from: 0, to: 3 });
  });

  it("refuses to downgrade a newer payload", () => {
    const result = upgradeSchema({ schemaVersion: 4, tasks: {} });
    expect(result).toEqual({ ok: false, reason: "future-version", from: 4 });
  });

  it("never overwrites stored data from a newer schema", () => {
    const future = JSON.stringify({ schemaVersion: 99, tasks: { keep: { id: "keep" } } });
    localStorage.setItem(STORAGE_KEY, future);
    const data = loadEssencesData();
    expect(data.tasks.keep).toBeTruthy();
    expect(localStorage.getItem(STORAGE_KEY)).toBe(future);
  });

  it("exposes an empty forward migration chain until v4 exists", () => {
    expect(Object.keys(SCHEMA_MIGRATIONS)).toEqual([]);
  });

  it("runs a registered forward step", () => {
    SCHEMA_MIGRATIONS[2] = (data) => ({ ...data, migrated: true });
    try {
      const result = upgradeSchema({ schemaVersion: 2 });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.migrated).toBe(true);
        expect(result.data.schemaVersion).toBe(3);
      }
    } finally {
      delete SCHEMA_MIGRATIONS[2];
    }
  });

  it("reports a missing step instead of guessing", () => {
    expect(upgradeSchema({ schemaVersion: 1 })).toEqual({
      ok: false,
      reason: "missing-step",
      from: 1,
    });
  });
});

describe("normalizeData", () => {
  it("fills every collection and keeps defaults for user / settings", () => {
    const data = normalizeData({ schemaVersion: 3 });
    expect(data.plans).toEqual({});
    expect(data.calendarStamps).toEqual({});
    expect(data.settings.weeklyPlanningEnabled).toBe(true);
    expect(data.settings.reflectionSchedule.weekly.graceHours).toBe(72);
    expect(data.user.specialChallengeState).toBe("locked");
  });

  it("survives a corrupt payload without throwing", () => {
    expect(() => normalizeData("garbage")).not.toThrow();
    expect(() => normalizeData(null)).not.toThrow();
    expect(normalizeData({ tasks: [] }).tasks).toEqual({});
  });

  it("merges partial settings over the defaults", () => {
    const data = normalizeData({
      schemaVersion: 3,
      settings: { language: "en", notifications: { enabled: false } },
    });
    expect(data.settings.language).toBe("en");
    expect(data.settings.notifications.enabled).toBe(false);
    expect(data.settings.notifications.taskReminders).toBe(true);
  });

  it("recovers from unparsable stored JSON", () => {
    localStorage.setItem(STORAGE_KEY, "{not json");
    expect(() => loadEssencesData()).not.toThrow();
    expect(loadEssencesData().schemaVersion).toBe(3);
  });
});

describe("persistence", () => {
  it("saves and reloads through the cache", () => {
    const data = emptyData();
    data.settings.language = "en";
    saveEssencesData(data);
    resetEssencesDataCache();
    expect(loadEssencesData().settings.language).toBe("en");
  });

  it("does not mutate the cached object when an update throws", () => {
    loadEssencesData();
    expect(() =>
      updateEssencesData(() => {
        throw new Error("boom");
      }),
    ).toThrow("boom");
    expect(loadEssencesData().schemaVersion).toBe(3);
  });
});
