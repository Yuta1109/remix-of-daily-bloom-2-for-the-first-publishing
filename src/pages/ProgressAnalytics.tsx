import { ChevronLeft, Flame, MessageCircleHeart, ScrollText } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useI18n, type TranslationKeys } from "@/lib/i18n";
import { dayScoreInputsFromRecords, dayScoreParts, formatAnalyticsComment } from "@/lib/v3/analytics";
import { loadProgressSnapshot } from "@/lib/v3/progress";
import { todayLocalDate } from "@/lib/v3/local-date";
import { loadEssencesData } from "@/lib/v3/storage";

export default function ProgressAnalytics() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const snapshot = loadProgressSnapshot(todayLocalDate());
  const parts = dayScoreParts(
    dayScoreInputsFromRecords(Object.values(loadEssencesData().activityRecords), todayLocalDate()),
  );
  const comment = formatAnalyticsComment(
    t(snapshot.commentKey as TranslationKeys),
    snapshot.analytics.commentParams,
  );
  const rows = [
    { label: t("progressScoreToday"), value: snapshot.analytics.todayScore },
    { label: t("progressScoreYesterday"), value: snapshot.analytics.yesterdayScore },
    { label: t("progressScoreWeek"), value: snapshot.analytics.weekScore },
    { label: t("progressScoreMonth"), value: snapshot.analytics.monthScore },
    { label: t("progressStreakLabel"), value: snapshot.streak, icon: Flame },
    { label: t("progressReflectionLabel"), value: snapshot.analytics.reflectionCount, icon: MessageCircleHeart },
    { label: t("progressLogUpdates"), value: snapshot.analytics.activityCount, icon: ScrollText },
    { label: t("progressScoreExecution"), value: parts.execution },
    { label: t("progressScorePlanning"), value: parts.planning },
    { label: t("progressScoreReflection"), value: parts.reflection },
    { label: t("progressScoreConsistency"), value: parts.consistency },
  ];

  return (
    <div className="app-shell-page">
      <div className="app-shell-header px-4 pb-2">
        <button
          type="button"
          onClick={() => navigate("/progress")}
          className="flex items-center gap-1.5 text-sm text-muted-foreground mb-2"
        >
          <ChevronLeft className="w-4 h-4" />
          {t("back")}
        </button>
        <h1 className="text-[28px] font-bold tracking-tight">{t("progressAnalyticsDetailTitle")}</h1>
      </div>
      <div className="app-shell-scroll px-4 pb-8">
        <p className="text-sm text-muted-foreground mb-4">{comment}</p>
        <div className="rounded-2xl bg-card shadow-soft divide-y divide-border/60">
          {rows.map((row) => (
            <div key={row.label} className="flex items-center gap-3 px-4 py-3">
              {row.icon ? (
                <row.icon className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />
              ) : (
                <span className="w-4" />
              )}
              <span className="text-sm flex-1">{row.label}</span>
              <span className="text-sm font-semibold tabular-nums">{row.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
