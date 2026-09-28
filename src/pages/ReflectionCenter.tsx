import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ConfirmMessage } from "@/components/notes/ConfirmMessage";
import { PlanningShell } from "@/components/plan/PlanningHeader";
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
  getReflectionCatchUpSummary,
  getReflections,
  getSettings,
  skipCatchUpReflections,
  skipReflectionSession,
  type ReflectionCatchUpBucket,
} from "@/lib/v3/repository";
import { isRecentReflectionPeriod } from "@/lib/v3/reflection-catch-up";
import type { ReflectionSession, ReflectionType } from "@/lib/v3/types";
import { useSessionView } from "@/hooks/use-session-view";
import { PLANNING_VIEW } from "@/lib/session-nav";

const TYPES: { id: ReflectionType; labelKey: TranslationKeys }[] = [
  { id: "future", labelKey: "planFuture" },
  { id: "monthly", labelKey: "planMonthly" },
  { id: "weekly", labelKey: "planWeekly" },
  { id: "daily", labelKey: "planDaily" },
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

/** Due, overdue, or the review the schedule places on today (including tonight). */
function isSelectableTarget(session: ReflectionSession, today: LocalDate): boolean {
  if (session.status === "completed" || session.status === "skipped") return false;
  if (session.status === "due" || session.status === "overdue") return true;
  const scheduleDay = toLocalDate(new Date(session.scheduledAt));
  return session.status === "scheduled" && scheduleDay === today;
}

export default function ReflectionCenter() {
  const { t, formatDateStr } = useI18n();
  const navigate = useNavigate();
  const today = todayLocalDate();
  const weekStartsOn = getSettings().weekStartsOn;
  const [type, setType] = useSessionView<ReflectionType>("planning", PLANNING_VIEW.reflectionType, "daily");
  const [tick, setTick] = useState(0);
  const [history, setHistory] = useSessionView("planning", PLANNING_VIEW.reflectionHistory, false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [oneByOne, setOneByOne] = useState<ReflectionType | null>(null);
  const [oneByOneLimit, setOneByOneLimit] = useState(12);

  const sessions = useMemo(() => {
    ensureReflectionSessions();
    return getReflections({ type }).filter((s) =>
      isRecentReflectionPeriod(s.type, s.targetPeriodStart, today, weekStartsOn),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, tick]);

  const catchUp = useMemo(() => {
    ensureReflectionSessions();
    return getReflectionCatchUpSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  const past = useMemo(() => {
    return getReflections({ type })
      .filter((session) => session.status === "completed")
      .sort((a, b) => ((a.completedAt ?? "") < (b.completedAt ?? "") ? 1 : -1))
      .slice(0, 5);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, tick, history]);

  const oneByOneSessions = useMemo(() => {
    if (!oneByOne) return [];
    return ensureCatchUpSessions(oneByOne);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oneByOne, tick]);

  const refresh = () => setTick((n) => n + 1);
  const targets = sessions.filter((session) => isSelectableTarget(session, today));
  const inTime = targets.filter((session) => session.status !== "overdue");
  const overdue = targets.filter((session) => session.status === "overdue");
  const bucket = catchUp.buckets.find((item) => item.type === type);

  const typeTabs = (
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
  );

  return (
    <PlanningShell current="reflection">
      {history ? (
        <div>
          <button
            type="button"
            onClick={() => setHistory(false)}
            className="mb-3 text-sm font-medium text-accent"
          >
            {t("back")}
          </button>
          <h2 className="text-base font-semibold mb-3">{t("reflectionPast")}</h2>
          {typeTabs}
          {past.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("reflectionPastEmpty")}</p>
          ) : (
            <div className="rounded-2xl bg-card shadow-card divide-y divide-border/50 overflow-hidden">
              {past.map((session) => (
                <button
                  key={session.id}
                  type="button"
                  data-testid="reflection-past-item"
                  onClick={() => navigate(`/plan/reflection/${session.id}`)}
                  className="w-full px-4 py-3 text-left"
                >
                  <p className="text-sm font-medium">{periodLabel(session, formatDateStr)}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{t("reflectionCompletedStatus")}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div>
          {typeTabs}

          <section className="mb-6">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-1">
              {t("reflectionNeedsAttention")}
            </h2>
            {bucket ? (
              <CatchUpCard
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
            ) : null}
            {oneByOne === type && oneByOneSessions.length > 0 ? (
              <div className="rounded-2xl bg-card shadow-card divide-y divide-border/50 overflow-hidden mb-3">
                {oneByOneSessions.slice(0, oneByOneLimit).map((session) => (
                  <SessionRow
                    key={session.id}
                    session={session}
                    today={today}
                    formatDateStr={formatDateStr}
                    t={t}
                    onReview={() => setPendingId(session.id)}
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
            {targets.length === 0 && !bucket ? (
              <p className="px-1 text-sm text-muted-foreground">{t("reflectionNoTargets")}</p>
            ) : null}
            <TargetGroup
              title={t("reflectionWithinDeadline")}
              sessions={inTime}
              today={today}
              formatDateStr={formatDateStr}
              t={t}
              onPick={setPendingId}
              onSkip={(id) => {
                skipReflectionSession(id);
                refresh();
              }}
            />
            <TargetGroup
              title={t("reflectionOverdueGroup")}
              sessions={overdue}
              today={today}
              formatDateStr={formatDateStr}
              t={t}
              onPick={setPendingId}
              onSkip={(id) => {
                skipReflectionSession(id);
                refresh();
              }}
            />
          </section>

          <section className="mb-6 rounded-2xl bg-card p-4 shadow-card">
            <p className="text-sm font-semibold">{t("reflectionTimingTitle")}</p>
            <button
              type="button"
              data-testid="reflection-timing-settings"
              onClick={() => navigate("/settings#reflection")}
              className="mt-2 text-sm font-medium text-accent"
            >
              {t("reflectionTimingChange")}
            </button>
          </section>

          <button
            type="button"
            data-testid="reflection-past"
            onClick={() => setHistory(true)}
            className="w-full text-left text-base font-semibold px-1 mb-4"
          >
            {t("reflectionPast")}
          </button>
        </div>
      )}

      <ConfirmMessage
        open={pendingId != null}
        testId="reflection-start-confirm"
        message={t("reflectionStartConfirm")}
        confirmLabel={t("yes")}
        cancelLabel={t("cancel")}
        onConfirm={() => {
          const id = pendingId;
          setPendingId(null);
          if (id) navigate(`/plan/reflection/${id}`);
        }}
        onCancel={() => setPendingId(null)}
      />
    </PlanningShell>
  );
}

function TargetGroup({
  title,
  sessions,
  today,
  formatDateStr,
  t,
  onPick,
  onSkip,
}: {
  title: string;
  sessions: ReflectionSession[];
  today: LocalDate;
  formatDateStr: (iso: string, options?: Intl.DateTimeFormatOptions) => string;
  t: (key: TranslationKeys) => string;
  onPick: (id: string) => void;
  onSkip: (id: string) => void;
}) {
  if (sessions.length === 0) return null;
  return (
    <div className="mb-3">
      <p className="text-xs font-medium text-muted-foreground mb-1 px-1">{title}</p>
      <div className="rounded-2xl bg-card shadow-card divide-y divide-border/50 overflow-hidden">
        {sessions.map((session) => (
          <SessionRow
            key={session.id}
            session={session}
            today={today}
            formatDateStr={formatDateStr}
            t={t}
            onReview={() => onPick(session.id)}
            onSkip={() => onSkip(session.id)}
          />
        ))}
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
        <button type="button" onClick={onTogether} className="w-full min-h-11 rounded-xl bg-accent/10 text-sm font-semibold">
          {t("reflectionCatchUpTogether")}
        </button>
        <button type="button" onClick={onOneByOne} className="w-full min-h-11 rounded-xl bg-secondary/50 text-sm font-medium">
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
      <button
        type="button"
        onClick={onReview}
        className="flex-1 min-w-0 text-left"
        data-testid="reflection-target"
        data-period={session.targetPeriodStart}
      >
        <p className="text-sm font-medium truncate">{periodLabel(session, formatDateStr)}</p>
        <p className={cn("text-xs mt-0.5", overdue ? "text-foreground/70" : "text-muted-foreground")}>
          {overdue ? `${t("reflectionOverdue")} · ${statusText}` : statusText}
        </p>
      </button>
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
