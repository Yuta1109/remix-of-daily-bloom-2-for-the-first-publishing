import { beforeEach, describe, expect, it } from "vitest";
import {
  convertQuickMemoToEvent,
  convertQuickMemoToPlan,
  convertQuickMemoToTask,
  createQuickMemo,
  getEvent,
  getPlanItem,
  getQuickMemo,
  getTask,
} from "@/lib/v3/repository";
import { convertedTargetsOf, emptyData } from "@/lib/v3/schema";
import { loadEssencesData, resetEssencesDataCache, saveEssencesData } from "@/lib/v3/storage";
import { STORAGE_KEY, type QuickMemo } from "@/lib/v3/types";

describe("Phase 12 Quick Memo conversion metadata", () => {
  beforeEach(() => {
    localStorage.clear();
    resetEssencesDataCache();
    saveEssencesData(emptyData());
  });

  it("1. Task then Plan keeps both conversion targets", () => {
    const memo = createQuickMemo({ text: "Ship and schedule" });
    const { task } = convertQuickMemoToTask(memo.id, { date: "2026-09-24" });
    const { plan } = convertQuickMemoToPlan(memo.id, { level: "future" });
    const stored = getQuickMemo(memo.id);
    expect(stored?.convertedTargets?.task).toBe(task.id);
    expect(stored?.convertedTargets?.plan).toBe(plan.id);
    expect(getTask(task.id)?.title).toBe("Ship and schedule");
    expect(getPlanItem(plan.id)?.title).toBe("Ship and schedule");
    expect(stored?.status).toBe("inbox");
  });

  it("2. old single-pointer payloads remain readable and hydrate", () => {
    const data = emptyData();
    const memo: QuickMemo = {
      id: "qm-legacy-pointer",
      text: "Old pointer",
      status: "inbox",
      createdAt: "2026-09-20T00:00:00.000Z",
      updatedAt: "2026-09-20T00:00:00.000Z",
      convertedToType: "task",
      convertedToId: "task-from-v11",
    };
    data.quickMemos[memo.id] = memo;
    data.tasks["task-from-v11"] = {
      id: "task-from-v11",
      title: "Old pointer",
      date: "2026-09-20",
      allDay: true,
      icon: "circle",
      color: "orange",
      status: "open",
      order: 0,
      createdFrom: "quickMemo",
      createdAt: "2026-09-20T00:00:00.000Z",
      updatedAt: "2026-09-20T00:00:00.000Z",
    };
    saveEssencesData(data);
    resetEssencesDataCache();
    const hydrated = getQuickMemo("qm-legacy-pointer");
    expect(convertedTargetsOf(hydrated!).task).toBe("task-from-v11");
    const { plan } = convertQuickMemoToPlan("qm-legacy-pointer", { level: "monthly" });
    const after = getQuickMemo("qm-legacy-pointer");
    expect(after?.convertedTargets?.task).toBe("task-from-v11");
    expect(after?.convertedTargets?.plan).toBe(plan.id);
    expect(getTask("task-from-v11")?.title).toBe("Old pointer");
  });

  it("Task + Plan + Event all coexist on one memo", () => {
    const memo = createQuickMemo({ text: "All three" });
    const { task } = convertQuickMemoToTask(memo.id, { date: "2026-09-24" });
    const { plan } = convertQuickMemoToPlan(memo.id, { level: "future" });
    const { event } = convertQuickMemoToEvent(memo.id, { date: "2026-09-30", allDay: true });
    const stored = getQuickMemo(memo.id);
    expect(stored?.convertedTargets).toEqual({
      task: task.id,
      plan: plan.id,
      event: event.id,
    });
    expect(getEvent(event.id)?.title).toBe("All three");
    expect(getQuickMemo(memo.id)?.text).toBe("All three");
  });

  it("repeated same-type conversion is idempotent", () => {
    const memo = createQuickMemo({ text: "Once" });
    const first = convertQuickMemoToTask(memo.id, { date: "2026-09-24" }).task;
    const second = convertQuickMemoToTask(memo.id, { date: "2026-09-25" }).task;
    expect(second.id).toBe(first.id);
    expect(Object.values(loadEssencesData().tasks).filter((t) => t.createdFrom === "quickMemo")).toHaveLength(1);
  });

  it("persists convertedTargets in essences-app-data-v3", () => {
    const memo = createQuickMemo({ text: "Persist" });
    convertQuickMemoToTask(memo.id, { date: "2026-09-24" });
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) as string) as {
      quickMemos: Record<string, QuickMemo>;
    };
    expect(raw.quickMemos[memo.id].convertedTargets?.task).toBeTruthy();
  });
});
