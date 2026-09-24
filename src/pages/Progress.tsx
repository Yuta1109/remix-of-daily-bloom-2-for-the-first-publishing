import { Check, Circle, Flame, Lock, MessageCircleHeart, ScrollText } from "lucide-react";
import { UserButton } from "@/components/UserButton";
import { useI18n, type TranslationKeys } from "@/lib/i18n";
import { loadProgressSnapshot, type DailyChallengeView } from "@/lib/v3/progress";
import { todayLocalDate } from "@/lib/v3/local-date";

/**
 * Progress tab: Daily Challenge, Special Challenge (locked), Analytics, Points.
 *
 * Completion is never toggled from a tap — only V3 activity / state rules.
 */
export default function Progress() {
  const { t } = useI18n();
  const snapshot = loadProgressSnapshot(todayLocalDate());

  return (
    <div className="app-shell-page">
      <div className="app-shell-header px-4 pb-2">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-[28px] font-bold tracking-tight leading-tight">
            {t("progressPageTitle")}
          </h1>
          <UserButton />
        </div>
      </div>

      <div className="app-shell-scroll px-4">
        <section className="mb-6">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-1">
            {t("progressDailyChallenge")}
          </h2>
          {snapshot.daily.length === 0 ? (
            <p className="text-sm text-muted-foreground px-1">{t("progressDailyChallengeEmpty")}</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {snapshot.daily.map((row) => (
                <DailyChallengeRow key={row.assignment.id} row={row} t={t} />
              ))}
            </ul>
          )}
        </section>

        <section className="mb-6">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-1">
            {t("progressSpecialChallenge")}
          </h2>
          <div
            className="flex items-start gap-3 py-3 px-1 opacity-70"
            data-testid="special-challenge"
            data-state={snapshot.special.state}
          >
            <Lock className="w-4 h-4 shrink-0 mt-0.5 text-muted-foreground" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-sm font-medium">
                {t(snapshot.special.titleKey as TranslationKeys)}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t(snapshot.special.descriptionKey as TranslationKeys)}
              </p>
            </div>
          </div>
        </section>

        <section className="mb-6">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-1">
            {t("progressAnalytics")}
          </h2>
          <p className="text-sm text-muted-foreground px-1 mb-2">
            {t(snapshot.commentKey as TranslationKeys)}
          </p>
          <div className="divide-y divide-border/60">
            <AnalyticsRow label={t("progressScoreToday")} value={String(snapshot.analytics.todayScore)} />
            <AnalyticsRow
              label={t("progressScoreYesterday")}
              value={String(snapshot.analytics.yesterdayScore)}
            />
            <AnalyticsRow label={t("progressScoreWeek")} value={String(snapshot.analytics.weekScore)} />
            <AnalyticsRow label={t("progressScoreMonth")} value={String(snapshot.analytics.monthScore)} />
            <AnalyticsRow
              icon={Flame}
              label={t("progressStreakLabel")}
              value={String(snapshot.streak)}
            />
            <AnalyticsRow
              icon={MessageCircleHeart}
              label={t("progressReflectionLabel")}
              value={String(snapshot.analytics.reflectionCount)}
            />
            <AnalyticsRow
              icon={ScrollText}
              label={t("progressLogUpdates")}
              value={String(snapshot.analytics.activityCount)}
            />
          </div>
        </section>

        <section className="mb-6">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-1">
            {t("progressPointsLabel")}
          </h2>
          <div
            className="flex items-center justify-between py-3 px-1"
            data-testid="progress-points"
          >
            <span className="text-sm">{t("progressPointsCurrent")}</span>
            <span className="text-sm font-semibold tabular-nums">
              {snapshot.points} {t("progressPts")}
            </span>
          </div>
        </section>
      </div>
    </div>
  );
}

function DailyChallengeRow({
  row,
  t,
}: {
  row: DailyChallengeView;
  t: (key: TranslationKeys) => string;
}) {
  const title = t(row.titleKey as TranslationKeys);
  const description = t(row.descriptionKey as TranslationKeys);
  const status = row.completed ? t("progressChallengeCompleted") : t("progressChallengePending");
  const points = row.completed
    ? `+${row.pointsAwarded} ${t("progressPts")}`
    : undefined;

  return (
    <li
      className="flex items-start gap-3 py-3 px-1"
      data-testid="daily-challenge-row"
      data-challenge-id={row.assignment.challengeDefinitionId}
      data-completed={row.completed ? "true" : "false"}
      aria-label={`${title}, ${status}${points ? `, ${points}` : ""}`}
    >
      {row.completed ? (
        <Check className="w-4 h-4 text-accent shrink-0 mt-0.5" aria-hidden="true" />
      ) : (
        <Circle className="w-4 h-4 text-muted-foreground/40 shrink-0 mt-0.5" aria-hidden="true" />
      )}
      <div className="min-w-0 flex-1">
        <p className={`text-sm ${row.completed ? "text-foreground" : "text-foreground"}`}>
          {title}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      {row.completed && (
        <span className="text-xs tabular-nums text-muted-foreground shrink-0 mt-0.5">
          {points}
        </span>
      )}
    </li>
  );
}

function AnalyticsRow({
  icon: Icon,
  label,
  value,
}: {
  icon?: typeof Flame;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 py-3 px-1">
      {Icon ? (
        <Icon className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />
      ) : null}
      <span className="text-sm flex-1">{label}</span>
      <span className="text-sm font-semibold tabular-nums">{value}</span>
    </div>
  );
}
