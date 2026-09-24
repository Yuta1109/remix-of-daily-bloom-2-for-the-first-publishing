import { useMemo, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { UserButton } from "@/components/UserButton";
import { useI18n, type TranslationKeys } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  daysBetween,
  todayLocalDate,
  toLocalDate,
  type LocalDate,
} from "@/lib/v3/local-date";
import {
  ensureCatchUpSessions,
  ensureReflectionSessions,
  getRecentAttentionReflections,
  getReflectionCatchUpSummary,
  getReflections,
  getSettings,
  skipCatchUpReflections,
  skipReflectionSession,
  updateReflectionSchedule,
  type ReflectionCatchUpBucket,
} from "@/lib/v3/repository";
import { isRecentReflectionPeriod } from "@/lib/v3/reflection-catch-up";
import type { ReflectionSession, ReflectionType } from "@/lib/v3/types";

const TYPES: { id: ReflectionType; labelKey: TranslationKeys }[] = [
  { id: "daily", labelKey: "reflectionTypeDaily" },
  { id: "weekly", labelKey: "reflectionTypeWeekly" },
  { id: "monthly", labelKey: "reflectionTypeMonthly" },
  { id: "future", labelKey: "reflectionTypeFuture" },
];

function periodLabel(
  session: ReflectionSession,
  formatDateStr: (iso: string, options?: Intl.DateTimeFormatOptions) => string,
): string {
  const start = session.targetPeriodStart;
  const end = session.targetPeriodEnd ?? start;
  if (session.type === "daily") {
    return formatDateStr(start, { month: "long", day: "numeric" });
  }
  if (session.type === "future") {
    return formatDateStr(start, { month: "long", year: "numeric" });
  }
  if (start === end) return formatDateStr(start, { month: "short", day: "numeric" });
  return `${formatDateStr(start, { month: "short", day: "numeric" })} – ${formatDateStr(end, { month: "short", day: "numeric" })}`;
}

function overdueDays(session: ReflectionSession, today: LocalDate): number {
  const scheduledDay = toLocalDate(new Date(session.scheduledAt));
  return Math.max(1, daysBetween(scheduledDay, today));
}

export default function ReflectionCenter() {
  const { t, formatDateStr } = useI18n();
  const navigate = useNavigate();
  const today = todayLocalDate();
  const weekStartsOn = getSettings().weekStartsOn;
  const [type, setType] = useState<ReflectionType>("daily");
  const [tick, setTick] = useState(0);
  const [oneByOne, setOneByOne] = useState<ReflectionType | null>(null);
  const [oneByOneLimit, setOneByOneLimit] = useState(12);
  const [attentionLimit, setAttentionLimit] = useState(8);

  const sessions = useMemo(() => {
    ensureReflectionSessions();
    return getReflections({ type }).filter((s) =>
      isRecentReflectionPeriod(s.type, s.targetPeriodStart, today, weekStartsOn),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, tick]);

  const attention = useMemo(() => {
    ensureReflectionSessions();
    return getRecentAttentionReflections();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  const catchUp = useMemo(() => {
    ensureReflectionSessions();
    return getReflectionCatchUpSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  const oneByOneSessions = useMemo(() => {
    if (!oneByOne) return [];
    return ensureCatchUpSessions(oneByOne);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oneByOne, tick]);

  const refresh = () => setTick((n) => n + 1);
  const settings = getSettings().reflectionSchedule;

  return (
    <div className="app-shell-page">
      <div className="app-shell-header px-2 pb-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 min-w-0">
            <button
              type="button"
              onClick={() => navigate("/plan")}
              aria-label={t("back")}
              className="p-2 rounded-full text-foreground/70 hover:bg-secondary/70"
            >
              <ChevronLeft className="w-5 h-5" aria-hidden="true" />
            </button>
            <h1 className="text-[28px] font-bold tracking-tight leading-tight">
              {t("reflectionTitle")}
            </h1>
          </div>
          <UserButton />
        </div>
      </div>

      <div className="app-shell-scroll px-4">
        <div
          role="tablist"
          aria-label={t("reflectionTitle")}
          className="flex items-center gap-0.5 bg-secondary/60 rounded-xl p-0.5 mb-5"
        >
          {TYPES.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={type === item.id}
              onClick={() => setType(item.id)}
              className={cn(
                "flex-1 rounded-[10px] px-2 py-1.5 text-[13px] font-medium",
                type === item.id ? "bg-card text-foreground shadow-soft" : "text-muted-foreground",
              )}
            >
              {t(item.labelKey)}
            </button>
          ))}
        </div>

        <section className="mb-6">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-1">
            {t("reflectionNeedsAttention")}
          </h2>
          {catchUp.buckets.map((bucket) => (
            <CatchUpCard
              key={bucket.type}
              bucket={bucket}
              t={t}
              onTogether={() => navigate(`/plan/reflection/catch-up/${bucket.type}`)}
              onOneByOne={() => {
                setOneByOne(bucket.type);
                setOneByOneLimit(12);
                refresh();
              }}
              onSkipPast={() => {
                skipCatchUpReflections(bucket.type);
                if (oneByOne === bucket.type) setOneByOne(null);
                refresh();
              }}
            />
          ))}
          {oneByOne && oneByOneSessions.length > 0 ? (
            <div className="rounded-2xl bg-card shadow-card divide-y divide-border/50 overflow-hidden mb-3">
              {oneByOneSessions.slice(0, oneByOneLimit).map((session) => (
                <SessionRow
                  key={session.id}
                  session={session}
                  today={today}
                  formatDateStr={formatDateStr}
                  t={t}
                  onReview={() => navigate(`/plan/reflection/${session.id}`)}
                  onSkip={() => {
                    skipReflectionSession(session.id);
                    refresh();
                  }}
                />
              ))}
              {oneByOneSessions.length > oneByOneLimit ? (
                <button
                  type="button"
                  onClick={() => setOneByOneLimit((n) => n + 12)}
                  className="w-full min-h-11 text-sm font-medium text-accent"
                >
                  {t("reflectionCatchUpShowMore")}
                </button>
              ) : null}
            </div>
          ) : null}
          {attention.length === 0 && catchUp.totalPending === 0 ? (
            <p className="px-1 text-sm text-muted-foreground">{t("reflectionNoneAttention")}</p>
          ) : attention.length === 0 ? null : (
            <div className="rounded-2xl bg-card shadow-card divide-y divide-border/50 overflow-hidden">
              {attention.slice(0, attentionLimit).map((session) => (
                <SessionRow
                  key={session.id}
                  session={session}
                  today={today}
                  formatDateStr={formatDateStr}
                  t={t}
                  onReview={() => navigate(`/plan/reflection/${session.id}`)}
                  onSkip={() => {
                    skipReflectionSession(session.id);
                    refresh();
                  }}
                />
              ))}
              {attention.length > attentionLimit ? (
                <button
                  type="button"
                  onClick={() => setAttentionLimit((n) => n + 8)}
                  className="w-full min-h-11 text-sm font-medium text-accent"
                >
                  {t("reflectionCatchUpShowMore")}
                </button>
              ) : null}
            </div>
          )}
        </section>

        <section className="mb-6">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-1">
            {t(TYPES.find((x) => x.id === type)!.labelKey)}
          </h2>
          <div className="rounded-2xl bg-card shadow-card divide-y divide-border/50 overflow-hidden">
            {sessions
              .filter((s) => s.status !== "skipped")
              .slice()
              .reverse()
              .slice(0, 12)
              .map((session) => (
                <SessionRow
                  key={session.id}
                  session={session}
                  today={today}
                  formatDateStr={formatDateStr}
                  t={t}
                  onReview={() => navigate(`/plan/reflection/${session.id}`)}
                  onSkip={
                    session.status === "completed"
                      ? undefined
                      : () => {
                          skipReflectionSession(session.id);
                          refresh();
                        }
                  }
                />
              ))}
          </div>
        </section>

        <section className="mb-10">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-1">
            {t("reflectionSchedule")}
          </h2>
          <div className="rounded-2xl bg-card shadow-card p-4 space-y-3">
            {type === "daily" ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    updateReflectionSchedule({
                      daily: { ...settings.daily, timeOfDay: "21:00", scheduleOffsetDays: 0 },
                    });
                    refresh();
                  }}
                  className={cn(
                    "flex-1 min-h-11 rounded-xl text-sm font-medium",
                    (settings.daily.scheduleOffsetDays ?? 0) === 0
                      ? "bg-accent/10"
                      : "bg-secondary/50 text-muted-foreground",
                  )}
                >
                  {t("reflectionDailyEvening")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    updateReflectionSchedule({
                      daily: { ...settings.daily, timeOfDay: "08:00", scheduleOffsetDays: 1 },
                    });
                    refresh();
                  }}
                  className={cn(
                    "flex-1 min-h-11 rounded-xl text-sm font-medium",
                    settings.daily.scheduleOffsetDays === 1
                      ? "bg-accent/10"
                      : "bg-secondary/50 text-muted-foreground",
                  )}
                >
                  {t("reflectionDailyMorning")}
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                {type === "weekly" ? (
                  <select
                    aria-label={t("reflectionWeekday")}
                    value={settings.weekly.weekday ?? 0}
                    onChange={(e) => {
                      updateReflectionSchedule({
                        weekly: {
                          ...settings.weekly,
                          weekday: Number(e.target.value) as 0 | 1 | 2 | 3 | 4 | 5 | 6,
                        },
                      });
                      refresh();
                    }}
                    className="flex-1 rounded-xl bg-secondary/50 px-3 py-3 text-sm"
                  >
                    {Array.from({ length: 7 }, (_, d) => (
                      <option key={d} value={d}>
                        {formatDateStr(`2026-09-${String(6 + d).padStart(2, "0")}`, {
                          weekday: "long",
                        })}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="number"
                    min={1}
                    max={31}
                    aria-label={t("reflectionDayOfMonth")}
                    value={settings[type].dayOfMonth ?? 1}
                    onChange={(e) => {
                      updateReflectionSchedule({
                        [type]: { ...settings[type], dayOfMonth: Number(e.target.value) },
                      });
                      refresh();
                    }}
                    className="w-20 rounded-xl bg-secondary/50 px-3 py-3 text-sm"
                  />
                )}
                <input
                  type="time"
                  aria-label={t("reflectionTime")}
                  value={settings[type].timeOfDay}
                  onChange={(e) => {
                    updateReflectionSchedule({
                      [type]: { ...settings[type], timeOfDay: e.target.value },
                    });
                    refresh();
                  }}
                  className="flex-1 rounded-xl bg-secondary/50 px-3 py-3 text-sm"
                />
              </div>
            )}
          </div>
        </section>
        <div className="h-20" aria-hidden="true" />
      </div>
    </div>
  );
}

function catchUpCopy(type: ReflectionType): TranslationKeys {
  if (type === "weekly") return "reflectionCatchUpWeekly";
  if (type === "monthly") return "reflectionCatchUpMonthly";
  return "reflectionCatchUpDaily";
}

function CatchUpCard({
  bucket,
  t,
  onTogether,
  onOneByOne,
  onSkipPast,
}: {
  bucket: ReflectionCatchUpBucket;
  t: (key: TranslationKeys) => string;
  onTogether: () => void;
  onOneByOne: () => void;
  onSkipPast: () => void;
}) {
  return (
    <div className="rounded-2xl bg-card shadow-card p-4 mb-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
        {t("reflectionCatchUpHeading")}
      </p>
      <p className="text-sm font-medium mb-3">
        {t(catchUpCopy(bucket.type)).replace("{n}", String(bucket.pendingCount))}
      </p>
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={onTogether}
          className="w-full min-h-11 rounded-xl bg-accent/10 text-sm font-semibold"
        >
          {t("reflectionCatchUpTogether")}
        </button>
        <button
          type="button"
          onClick={onOneByOne}
          className="w-full min-h-11 rounded-xl bg-secondary/50 text-sm font-medium"
        >
          {t("reflectionCatchUpOneByOne")}
        </button>
        <button
          type="button"
          onClick={onSkipPast}
          className="w-full min-h-11 rounded-xl text-sm font-medium text-muted-foreground"
        >
          {t("reflectionCatchUpSkipPast")}
        </button>
      </div>
    </div>
  );
}

function SessionRow({
  session,
  today,
  formatDateStr,
  t,
  onReview,
  onSkip,
}: {
  session: ReflectionSession;
  today: LocalDate;
  formatDateStr: (iso: string, options?: Intl.DateTimeFormatOptions) => string;
  t: (key: TranslationKeys) => string;
  onReview: () => void;
  onSkip?: () => void;
}) {
  const overdue = session.status === "overdue";
  const statusText =
    session.status === "due"
      ? t("reflectionDueToday")
      : session.status === "overdue"
        ? t("reflectionDaysOverdue").replace("{n}", String(overdueDays(session, today)))
        : session.status === "completed"
          ? t("reflectionCompletedStatus")
          : session.status === "skipped"
            ? t("reflectionSkippedStatus")
            : t("reflectionScheduled");

  return (
    <div className="px-4 py-3 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {t(
            session.type === "daily"
              ? "reflectionTypeDaily"
              : session.type === "weekly"
                ? "reflectionTypeWeekly"
                : session.type === "monthly"
                  ? "reflectionTypeMonthly"
                  : "reflectionTypeFuture",
          )}
        </p>
        <p className="text-sm font-medium truncate">{periodLabel(session, formatDateStr)}</p>
        <p className={cn("text-xs mt-0.5", overdue ? "text-foreground/70" : "text-muted-foreground")}>
          {overdue ? `${t("reflectionOverdue")} · ${statusText}` : statusText}
        </p>
      </div>
      {session.status !== "completed" ? (
        <button
          type="button"
          onClick={onReview}
          className="shrink-0 min-h-11 px-3 rounded-xl bg-accent/10 text-sm font-semibold"
        >
          {overdue || session.status === "due" ? t("reflectionReviewNow") : t("reflectionReview")}
        </button>
      ) : null}
      {onSkip && session.status !== "completed" ? (
        <button
          type="button"
          onClick={onSkip}
          aria-label={t("reflectionSkip")}
          className="shrink-0 min-h-11 px-3 rounded-xl text-xs font-medium text-muted-foreground"
        >
          {t("reflectionSkipShort")}
        </button>
      ) : null}
    </div>
  );
}
