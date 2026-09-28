import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useI18n, type TranslationKeys } from "@/lib/i18n";
import { pickReflectionAnnouncement } from "@/lib/v3/reflection-announcement";
import {
  ensureReflectionSessions,
  getReflectionCatchUpSummary,
  getReflections,
} from "@/lib/v3/repository";
import type { ReflectionType } from "@/lib/v3/types";

const READY_KEY: Record<ReflectionType, TranslationKeys> = {
  daily: "reflectionAnnounceDailyReady",
  weekly: "reflectionAnnounceWeeklyReady",
  monthly: "reflectionAnnounceMonthlyReady",
  future: "reflectionAnnounceFutureReady",
};

/**
 * Quiet reminder beside the account button. It repeats the reflection
 * clock already used for notifications, and opens that reflection.
 */
export function ReflectionAnnouncement() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const announcement = useMemo(() => {
    ensureReflectionSessions();
    return pickReflectionAnnouncement({
      sessions: getReflections(),
      catchUpPending: getReflectionCatchUpSummary().totalPending,
      now: new Date(),
    });
  }, []);
  if (!announcement) return null;
  const label =
    announcement.tone === "overdue"
      ? t("reflectionAnnounceOverdue").replace("{n}", String(announcement.count))
      : announcement.tone === "available"
        ? t(READY_KEY[announcement.type])
        : t("reflectionAnnounceSoon");
  return (
    <button
      type="button"
      data-testid="reflection-announcement"
      onClick={() => navigate(announcement.to)}
      className="max-w-[18rem] rounded-2xl bg-secondary/70 px-3 py-1.5 text-right text-[12px] font-medium leading-snug text-foreground/80"
    >
      {label}
    </button>
  );
}
