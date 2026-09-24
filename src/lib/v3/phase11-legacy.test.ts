import { beforeEach, describe, expect, it } from "vitest";
import { createQuickMemo, createTask, getSettings, updateSettings } from "@/lib/v3/repository";
import { emptyData } from "@/lib/v3/schema";
import { loadEssencesData, resetEssencesDataCache, saveEssencesData } from "@/lib/v3/storage";
import { SETTINGS_SIDECAR_MIGRATED_KEY } from "@/lib/v3/settings-io";
import { LEGACY_KEYS } from "@/lib/v3/legacy-migration";
import { hasLegacyData, migrateLegacyInto, readLegacySnapshot } from "@/lib/v3/legacy-migration";
import { STORAGE_KEY } from "@/lib/v3/types";

describe("Phase 11 legacy writes + migration", () => {
  beforeEach(() => {
    localStorage.clear();
    resetEssencesDataCache();
    saveEssencesData(emptyData());
  });

  it("13. current conversion / settings paths do not write legacy keys", () => {
    updateSettings({ weeklyPlanningEnabled: false, language: "en" });
    createQuickMemo({ text: "x" });
    createTask({ title: "y", date: "2026-09-24" });
    expect(localStorage.getItem(LEGACY_KEYS.todo)).toBeNull();
    expect(localStorage.getItem(LEGACY_KEYS.reusable)).toBeNull();
    expect(localStorage.getItem("essences-memo-library-v2")).toBeNull();
    expect(localStorage.getItem("essences-memos")).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeTruthy();
  });

  it("14. old ToDo migration still works after settings hydrate", () => {
    localStorage.clear();
    resetEssencesDataCache();
    localStorage.setItem(
      LEGACY_KEYS.todo,
      JSON.stringify({
        "2026-09-24": { tasks: [{ id: "t1", text: "Legacy task", completed: false, date: "2026-09-24" }], reflection: "" },
      }),
    );
    const data = emptyData();
    expect(hasLegacyData()).toBe(true);
    migrateLegacyInto(data, readLegacySnapshot());
    saveEssencesData(data);
    expect(Object.values(loadEssencesData().tasks).some((t) => t.title === "Legacy task")).toBe(true);
  });

  it("one-time sidecar language hydrate does not keep writing growth-app-lang", () => {
    localStorage.clear();
    resetEssencesDataCache();
    localStorage.setItem("growth-app-lang", "en");
    saveEssencesData(emptyData());
    expect(getSettings().language).toBe("en");
    expect(localStorage.getItem(SETTINGS_SIDECAR_MIGRATED_KEY)).toBe("1");
    updateSettings({ language: "ja" });
    expect(getSettings().language).toBe("ja");
  });
});
