import { beforeEach, describe, expect, it } from "vitest";
import { planReflectionNotices } from "@/lib/v3/reflection-notices";
import { completeReflectionSession, createReflectionSession } from "@/lib/v3/repository";
import { emptyData } from "@/lib/v3/schema";
import { loadEssencesData, resetEssencesDataCache, saveEssencesData } from "@/lib/v3/storage";

describe("reflection notices", () => {
  beforeEach(() => {
    localStorage.clear();
    resetEssencesDataCache();
    saveEssencesData(emptyData());
  });

  it("schedules the next availability once and skips a completed reflection", () => {
    const now = new Date(2026, 8, 26, 10, 0, 0);
    const notices = planReflectionNotices(loadEssencesData(), now);
    const keys = notices.map((notice) => notice.key);
    expect(new Set(keys).size).toBe(keys.length);
    const daily = notices.find((notice) => notice.type === "daily");
    expect(daily?.key.startsWith("daily:2026-09-26:")).toBe(true);
    expect(daily?.at.getHours()).toBe(17);
    expect(notices.some((notice) => notice.key.includes("2026-12-31"))).toBe(true);

    const session = createReflectionSession({ type: "daily", anchorDate: "2026-09-26" });
    completeReflectionSession(session.id);
    const after = planReflectionNotices(loadEssencesData(), now);
    expect(after.some((notice) => notice.key.startsWith("daily:2026-09-26:"))).toBe(false);
    expect(after.find((notice) => notice.type === "daily")?.key.startsWith("daily:2026-09-27:")).toBe(
      true,
    );
  });
});
