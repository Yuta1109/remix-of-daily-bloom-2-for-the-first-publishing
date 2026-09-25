import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, Lock } from "lucide-react";
import { UserButton } from "@/components/UserButton";
import { useI18n, type TranslationKeys } from "@/lib/i18n";
import { formatAnalyticsComment } from "@/lib/v3/analytics";
import { loadProgressSnapshot, type DailyChallengeView } from "@/lib/v3/progress";
import { todayLocalDate } from "@/lib/v3/local-date";

/**
 * Progress tab: Daily Challenge, Special Challenge (locked), Analytics, Points.
 *
 * Completion is never toggled from a tap — only V3 activity / state rules.
 */
export default function Progress() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const snapshot = loadProgressSnapshot(todayLocalDate());
  const [challengesOpen, setChallengesOpen] = useState(false);
  const comment = formatAnalyticsComment(
    t(snapshot.commentKey as TranslationKeys),
    snapshot.analytics.commentParams,
  );
  const scores = [
    { label: t("progressScoreToday"), value: snapshot.analytics.todayScore },
    { label: t("progressScoreYesterday"), value: snapshot.analytics.yesterdayScore },
    { label: t("progressScoreWeek"), value: snapshot.analytics.weekScore },
    { label: t("progressScoreMonth"), value: snapshot.analytics.monthScore },
  ];

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

      <div className="app-shell-scroll px-4 space-y-3 pb-8">
        <section>
          <button
            type="button"
            data-testid="daily-challenge-section"
            data-expanded={challengesOpen ? "true" : "false"}
            aria-expanded={challengesOpen}
            onClick={() => setChallengesOpen((open) => !open)}
            className="w-full rounded-2xl bg-card shadow-soft px-4 py-3 text-left"
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">{t("progressDailyChallenge")}</h2>
              <span className="text-xs text-muted-foreground">
                {t("progressDailyIncompleteCount").replace(
                  "{n}",
                  String(snapshot.incomplete.length),
                )}
              </span>
            </div>
            {snapshot.daily.length === 0 ? (
              <p className="text-sm text-muted-foreground mt-2">{t("progressDailyChallengeEmpty")}</p>
            ) : (
              <>
                <ul className="mt-2 divide-y divide-border/60">
                  {snapshot.topIncomplete.map((row) => (
                    <DailyChallengeRow key={row.assignment.id} row={row} t={t} />
                  ))}
                </ul>
                {challengesOpen ? (
                  <>
                    {snapshot.incomplete.slice(snapshot.topIncomplete.length).length > 0 ? (
                      <ul className="mt-1 divide-y divide-border/60">
                        {snapshot.incomplete.slice(snapshot.topIncomplete.length).map((row) => (
                          <DailyChallengeRow key={row.assignment.id} row={row} t={t} />
                        ))}
                      </ul>
                    ) : null}
                    {snapshot.completed.length > 0 ? (
                      <div className="mt-3" data-testid="daily-challenge-cleared">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                          {t("progressDailyClearedGroup")}
                        </p>
                        <ul className="divide-y divide-border/60">
                          {snapshot.completed.map((row) => (
                            <DailyChallengeRow key={row.assignment.id} row={row} t={t} />
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </>
                ) : null}
                {snapshot.daily.length > snapshot.topIncomplete.length ? (
                  <p className="mt-2 text-xs font-medium text-accent">
                    {challengesOpen ? t("progressDailyShowLess") : t("progressDailySeeAll")}
                  </p>
                ) : null}
              </>
            )}
          </button>
        </section>

        <section>
          <div
            className="rounded-2xl bg-card shadow-soft px-4 py-3 opacity-80"
            data-testid="special-challenge"
            data-state={snapshot.special.state}
          >
            <div className="flex items-start gap-3">
              <Lock className="w-4 h-4 shrink-0 mt-0.5 text-muted-foreground" aria-hidden="true" />
              <div className="min-w-0">
                <h2 className="text-sm font-semibold">{t("progressSpecialChallenge")}</h2>
                <p className="text-sm font-medium mt-1">
                  {t(snapshot.special.titleKey as TranslationKeys)}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t(snapshot.special.descriptionKey as TranslationKeys)}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section>
          <button
            type="button"
            data-testid="progress-analytics"
            onClick={() => navigate("/progress/analytics")}
            className="w-full rounded-2xl bg-card shadow-soft px-4 py-3 text-left"
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">{t("progressAnalytics")}</h2>
              <span className="inline-flex items-center gap-0.5 text-xs text-accent">
                {t("progressAnalyticsOpen")}
                <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">{comment}</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {scores.map((row) => (
                <ScoreMeter key={row.label} label={row.label} value={row.value} />
              ))}
            </div>
          </button>
        </section>

        <section>
          <button
            type="button"
            data-testid="progress-points"
            onClick={() => navigate("/progress/points")}
            className="w-full rounded-2xl bg-card shadow-soft px-4 py-3 text-left"
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">{t("progressPointsLabel")}</h2>
              <span className="inline-flex items-center gap-0.5 text-xs text-accent">
                {t("progressPointsOpen")}
                <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
              </span>
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-sm">{t("progressPointsCurrent")}</span>
              <span className="text-lg font-semibold tabular-nums">
                {snapshot.points} {t("progressPts")}
              </span>
            </div>
          </button>
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
  const points = row.completed ? `+${row.pointsAwarded} ${t("progressPts")}` : undefined;

  return (
    <li
      className="flex items-start gap-3 py-2.5"
      data-testid="daily-challenge-row"
      data-challenge-id={row.assignment.challengeDefinitionId}
      data-completed={row.completed ? "true" : "false"}
      aria-label={`${title}, ${status}${points ? `, ${points}` : ""}`}
    >
      <span
        className={`text-[11px] font-semibold shrink-0 mt-0.5 ${
          row.completed ? "text-accent" : "text-muted-foreground"
        }`}
      >
        {row.completed ? t("progressChallengeCompleted") : "·"}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm">{title}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      {row.completed ? (
        <span className="text-xs tabular-nums text-muted-foreground shrink-0 mt-0.5">{points}</span>
      ) : null}
    </li>
  );
}

function ScoreMeter({ label, value }: { label: string; value: number }) {
  const width = Math.max(0, Math.min(100, value));
  return (
    <div>
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold tabular-nums">{value}</span>
      </div>
      <div className="mt-1 h-1.5 rounded-full bg-secondary overflow-hidden">
        <div className="h-full rounded-full bg-accent" style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}
