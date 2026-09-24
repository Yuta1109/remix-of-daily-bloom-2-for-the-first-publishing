import { beforeEach, describe, expect, it } from "vitest";
import { LEGACY_KEYS } from "@/lib/v3/legacy-migration";
import {
  createTaskFromTemplate,
  createTaskTemplate,
  deleteTaskTemplate,
  getTaskTemplates,
  updateTaskTemplate,
} from "@/lib/v3/repository";
import { emptyData } from "@/lib/v3/schema";
import { loadEssencesData, resetEssencesDataCache, saveEssencesData } from "@/lib/v3/storage";

beforeEach(() => {
  localStorage.clear();
  resetEssencesDataCache();
  saveEssencesData(emptyData());
});

describe("Phase 6.1 V3 TaskTemplate", () => {
  it("2. edit updates V3", () => {
    const template = createTaskTemplate({ title: "old" });
    updateTaskTemplate(template.id, { title: "new title", icon: "briefcase" });
    expect(getTaskTemplates()[0].id).toBe(template.id);
    expect(getTaskTemplates()[0].title).toBe("new title");
    expect(getTaskTemplates()[0].icon).toBe("briefcase");
  });

  it("3. deletion updates V3", () => {
    const template = createTaskTemplate({ title: "drop me" });
    deleteTaskTemplate(template.id);
    expect(getTaskTemplates()).toHaveLength(0);
    expect(loadEssencesData().taskTemplates[template.id]).toBeUndefined();
  });

  it("4. Quick Add sees the new V3 template immediately", () => {
    createTaskTemplate({ title: "Buy book" });
    expect(getTaskTemplates().map((item) => item.title)).toEqual(["Buy book"]);
  });

  it("5. template creates an independent TaskItem", () => {
    const template = createTaskTemplate({ title: "Email professor" });
    const task = createTaskFromTemplate(template.id, "2026-09-24");
    expect(task.id).not.toBe(template.id);
    expect(task.title).toBe("Email professor");
    expect(getTaskTemplates()[0].id).toBe(template.id);
  });

  it("6. legacy reusable data is not written back", () => {
    const legacy = JSON.stringify([{ id: "r1", text: "英語を勉強する" }]);
    localStorage.setItem(LEGACY_KEYS.reusable, legacy);
    resetEssencesDataCache();
    createTaskTemplate({ title: "New V3 template" });
    expect(localStorage.getItem(LEGACY_KEYS.reusable)).toBe(legacy);
    expect(getTaskTemplates().some((item) => item.title === "New V3 template")).toBe(true);
  });

  it("7. duplicate legacy catch-up remains idempotent", () => {
    localStorage.setItem(
      LEGACY_KEYS.reusable,
      JSON.stringify([{ id: "r1", text: "英語を勉強する" }]),
    );
    resetEssencesDataCache();
    const first = getTaskTemplates();
    resetEssencesDataCache();
    const second = getTaskTemplates();
    expect(first.map((item) => item.id).sort()).toEqual(second.map((item) => item.id).sort());
    expect(first.filter((item) => item.title === "英語を勉強する")).toHaveLength(1);
  });
});
