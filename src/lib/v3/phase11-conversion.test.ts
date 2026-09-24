import { beforeEach, describe, expect, it } from "vitest";
import {
  convertQuickMemoToEvent,
  convertQuickMemoToNote,
  convertQuickMemoToPlan,
  convertQuickMemoToTask,
  createQuickMemo,
  getActivityRecords,
  getEvent,
  getPlanItem,
  getQuickMemo,
  getSettings,
  getTask,
  updateSettings,
} from "@/lib/v3/repository";
import { emptyData } from "@/lib/v3/schema";
import { resetEssencesDataCache, saveEssencesData } from "@/lib/v3/storage";
import { dayScoreFromData } from "@/lib/v3/analytics";
import { loadEssencesData } from "@/lib/v3/storage";
import { todayLocalDate } from "@/lib/v3/local-date";

describe("Phase 11 Quick Memo conversions", () => {
  beforeEach(() => {
    localStorage.clear();
    resetEssencesDataCache();
    saveEssencesData(emptyData());
  });

  it("8. converts Quick Memo to Task and keeps the original", () => {
    const memo = createQuickMemo({ text: "Buy milk\n2 bottles" });
    const { task } = convertQuickMemoToTask(memo.id, { date: "2026-09-24" });
    expect(task.title).toBe("Buy milk");
    expect(task.note).toBe("Buy milk\n2 bottles");
    expect(task.createdFrom).toBe("quickMemo");
    expect(getQuickMemo(memo.id)?.text).toBe("Buy milk\n2 bottles");
    expect(getQuickMemo(memo.id)?.status).toBe("inbox");
    expect(getQuickMemo(memo.id)?.convertedToType).toBe("task");
    expect(getQuickMemo(memo.id)?.convertedToId).toBe(task.id);
  });

  it("9. converts Quick Memo to Plan with a chosen level", () => {
    const memo = createQuickMemo({ text: "Ship v1" });
    const { plan } = convertQuickMemoToPlan(memo.id, { level: "future" });
    expect(plan.level).toBe("future");
    expect(plan.createdFrom).toBe("quickMemo");
    expect(getQuickMemo(memo.id)?.status).toBe("inbox");
    expect(getPlanItem(plan.id)?.title).toBe("Ship v1");
  });

  it("blocks Weekly conversion when Weekly Planning is off", () => {
    updateSettings({ weeklyPlanningEnabled: false });
    const memo = createQuickMemo({ text: "Week item" });
    expect(() => convertQuickMemoToPlan(memo.id, { level: "weekly" })).toThrow(/weekly planning is off/);
    expect(getSettings().weeklyPlanningEnabled).toBe(false);
    expect(getQuickMemo(memo.id)).toBeTruthy();
  });

  it("10. converts Quick Memo to a Calendar Event", () => {
    const memo = createQuickMemo({ text: "Dentist" });
    const { event } = convertQuickMemoToEvent(memo.id, {
      date: "2026-09-30",
      startTime: "14:00",
      endTime: "15:00",
      allDay: false,
    });
    expect(event.startAt).toBe("2026-09-30T14:00");
    expect(event.endAt).toBe("2026-09-30T15:00");
    expect(event.createdFrom).toBe("quickMemo");
    expect(getEvent(event.id)?.title).toBe("Dentist");
    expect(getQuickMemo(memo.id)?.convertedToType).toBe("event");
  });

  it("11. conversion is idempotent per type", () => {
    const memo = createQuickMemo({ text: "Same task" });
    const first = convertQuickMemoToTask(memo.id, { date: "2026-09-24" }).task;
    const second = convertQuickMemoToTask(memo.id, { date: "2026-09-25" }).task;
    expect(second.id).toBe(first.id);
    expect(Object.values(loadEssencesData().tasks).filter((t) => t.createdFrom === "quickMemo")).toHaveLength(1);
  });

  it("12. original Quick Memo is retained after note conversion", () => {
    const memo = createQuickMemo({ text: "Keep me" });
    convertQuickMemoToNote(memo.id);
    expect(getQuickMemo(memo.id)?.text).toBe("Keep me");
    expect(getQuickMemo(memo.id)?.status).toBe("inbox");
  });

  it("does not inflate day score for quick_memo_converted", () => {
    const memo = createQuickMemo({ text: "score" });
    convertQuickMemoToTask(memo.id, { date: todayLocalDate() });
    const converted = getActivityRecords({ type: "quick_memo_converted" });
    expect(converted.length).toBe(1);
    const score = dayScoreFromData(loadEssencesData(), todayLocalDate());
    expect(score).toBeLessThanOrEqual(10);
  });
});
