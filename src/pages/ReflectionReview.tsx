import { useEffect, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Drawer as DrawerPrimitive } from "vaul";
import { useNavigate, useParams } from "react-router-dom";
import { GlassControl } from "@/components/GlassControl";
import { PlanningShell } from "@/components/plan/PlanningHeader";
import {
  ReflectionPostponeSheet,
  type PostponeResult,
} from "@/components/plan/ReflectionPostponeSheet";
import { ReflectionStopSheet, type StopResult } from "@/components/plan/ReflectionStopSheet";
import { PlanIconGlyph } from "@/components/plan/plan-icon-registry";
import { useI18n } from "@/lib/i18n";
import { setOverlayChrome } from "@/lib/overlay-chrome";
import { eventsInRange, loadEvents, type CalendarEvent } from "@/lib/events-store";
import { addDays, todayLocalDate } from "@/lib/v3/local-date";
import {
  createReflectionDecision,
  completeReflectionSession,
  getChildTasks,
  getEquivalentTaskOn,
  getPlanItem,
  getReflection,
  getReflectionAward,
  getReflectionContext,
  getReflectionDecisions,
  migratePlanToCollection,
  startReflectionSession,
} from "@/lib/v3/repository";
import { reflectionActivityFromData, type ReflectionActivity } from "@/lib/v3/reflection-activity";
import { postponeShiftsDescendants } from "@/lib/v3/reflection-migration";
import { loadEssencesData } from "@/lib/v3/storage";
import type { ReflectionDecision } from "@/lib/v3/types";

export default function ReflectionReview() {
  const { sessionId = "" } = useParams();
  const { t, formatDateStr } = useI18n();
  const navigate = useNavigate();
  const [tick, setTick] = useState(0);
  const [postponeFor, setPostponeFor] = useState<{ subjectType: "task" | "plan"; subjectId: string } | null>(
    null,
  );
  const [stopFor, setStopFor] = useState<{ subjectType: "task" | "plan"; subjectId: string } | null>(null);
  const [duplicateMsg, setDuplicateMsg] = useState<string | null>(null);
  const [pendingPostpone, setPendingPostpone] = useState<{
    subjectId: string;
    date: string;
  } | null>(null);
  const [showRelated, setShowRelated] = useState(false);
  const [choiceFor, setChoiceFor] = useState<{ subjectType: "task" | "plan"; subjectId: string } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [somedayNotice, setSomedayNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    try {
      startReflectionSession(sessionId);
      setTick((n) => n + 1);
    } catch {
      /* missing session — the render path shows the empty state */
    }
  }, [sessionId]);

  useEffect(() => {
    if (!duplicateMsg) return;
    setOverlayChrome(true);
    return () => setOverlayChrome(false);
  }, [duplicateMsg]);

  const ctx = useMemo(() => {
    try {
      return getReflectionContext(sessionId);
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, tick]);

  const decisions = useMemo(
    () => (sessionId ? getReflectionDecisions(sessionId) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sessionId, tick],
  );
  const bySubject = new Map(decisions.map((d) => [d.subjectId, d]));
  const session = ctx?.session ?? getReflection(sessionId);
  const subjectsTotal = (ctx?.tasks.length ?? 0) + (ctx?.plans.length ?? 0);
  const decidedCount = [...(ctx?.tasks ?? []), ...(ctx?.plans ?? [])].filter((s) =>
    bySubject.has(s.id),
  ).length;
  const activity: ReflectionActivity | null = session
    ? reflectionActivityFromData(
        loadEssencesData(),
        session.targetPeriodStart,
        session.targetPeriodEnd ?? session.targetPeriodStart,
        session.id,
      )
    : null;
  const award = session?.status === "completed" ? getReflectionAward(session.id) : undefined;
  const keepCount = decisions.filter((d) => d.decision === "keep").length;
  const postponeCount = decisions.filter((d) => d.decision === "postpone").length;
  const stopCount = decisions.filter((d) => d.decision === "stop").length;

  const events: CalendarEvent[] = useMemo(() => {
    if (!session) return [];
    const from = session.targetPeriodStart;
    const to = session.targetPeriodEnd ?? from;
    const map = eventsInRange(from, to, loadEvents());
    return [...map.values()].flat();
  }, [session]);

  const refresh = () => setTick((n) => n + 1);

  const applyPostpone = (subjectType: "task" | "plan", subjectId: string, result: PostponeResult) => {
    if (result.kind === "box") {
      createReflectionDecision({
        reflectionSessionId: sessionId,
        subjectType,
        subjectId,
        decision: "postpone",
        toBox: true,
      });
      setPostponeFor(null);
      refresh();
      return;
    }
    if (subjectType === "task" && result.kind === "date") {
      const existing = getEquivalentTaskOn(subjectId, result.date);
      if (existing) {
        setPendingPostpone({ subjectId, date: result.date });
        setDuplicateMsg(
          t("reflectionAlreadyScheduled").replace(
            "{date}",
            formatDateStr(result.date, { month: "long", day: "numeric" }),
          ),
        );
        setPostponeFor(null);
        return;
      }
    }
    if (subjectType === "plan" && result.kind === "future" && result.target.type !== "someday") {
      const plan = getPlanItem(subjectId);
      if (plan && !postponeShiftsDescendants(plan, { futureTarget: result.target })) {
        setSomedayNotice(t("reflectionSomedayKeepChildren"));
      }
    }
    createReflectionDecision({
      reflectionSessionId: sessionId,
      subjectType,
      subjectId,
      decision: "postpone",
      toDate: result.kind === "date" ? result.date : result.target.value,
      futureTarget: result.kind === "future" ? result.target : undefined,
    });
    setPostponeFor(null);
    refresh();
  };

  const applyStop = (subjectType: "task" | "plan", subjectId: string, result: StopResult) => {
    if (result.kind === "collection") {
      migratePlanToCollection(subjectId, result.collectionId);
    }
    createReflectionDecision({
      reflectionSessionId: sessionId,
      subjectType,
      subjectId,
      decision: "stop",
      collectionId: result.kind === "collection" ? result.collectionId : undefined,
    });
    setStopFor(null);
    refresh();
  };

  const complete = () => {
    try {
      completeReflectionSession(sessionId);
      setError(null);
      refresh();
    } catch {
      setError(t("reflectionDecidedCount").replace("{done}", String(decidedCount)).replace("{total}", String(subjectsTotal)));
    }
  };

  if (!session || !ctx) {
    return (
      <div className="app-shell-page px-4 pt-8">
        <p className="text-sm text-muted-foreground">{t("reflectionNoSubjects")}</p>
      </div>
    );
  }

  const period =
    session.type === "daily"
      ? formatDateStr(session.targetPeriodStart, { month: "long", day: "numeric" })
      : session.targetPeriodEnd && session.targetPeriodEnd !== session.targetPeriodStart
        ? `${formatDateStr(session.targetPeriodStart, { month: "short", day: "numeric" })} – ${formatDateStr(session.targetPeriodEnd, { month: "short", day: "numeric" })}`
        : formatDateStr(session.targetPeriodStart, { month: "long", year: "numeric" });
  const title = `${t(
    session.type === "daily"
      ? "reflectionTypeDaily"
      : session.type === "weekly"
        ? "reflectionTypeWeekly"
        : session.type === "monthly"
          ? "reflectionTypeMonthly"
          : "reflectionTypeFuture",
  )} · ${period}`;

  const today = todayLocalDate();
  const activityTitle =
    session.type === "daily" && session.targetPeriodStart === today
      ? t("reflectionActivityToday")
      : session.type === "daily" && session.targetPeriodStart === addDays(today, -1)
        ? t("reflectionActivityYesterday")
        : session.type === "daily"
          ? t("reflectionActivityDay").replace("{date}", period)
          : session.type === "weekly"
            ? t("reflectionActivityWeek")
            : session.type === "monthly"
              ? t("reflectionActivityMonth")
              : t("reflectionActivityPeriod");
  const wide = session.type !== "daily";
  const completed = session.status === "completed";

  return (
    <PlanningShell current="reflection">
      <button
        type="button"
        onClick={() => navigate("/plan/reflection")}
        className="mb-3 text-sm font-medium text-accent"
      >
        {t("back")}
      </button>
      <p className="text-xs text-muted-foreground mb-4">{title}</p>
      {activity ? (
        <section className="mb-6" data-testid="reflection-activity">
          <h2 className="text-base font-semibold mb-3">{activityTitle}</h2>
          <ScoreRing score={activity.score} label={t("reflectionScoreLabel")} />
          <dl className="mt-4 space-y-2 text-sm">
            <Metric
              label={wide ? t("reflectionAvgChallenge") : t("reflectionChallengeRate")}
              value={activity.challengeRate == null ? "0%" : `${activity.challengeRate}%`}
            />
            <Metric
              label={wide ? t("reflectionAvgTodo") : t("reflectionTodoRate")}
              value={`${activity.todoRate}%`}
            />
          </dl>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mt-4 mb-2">
            {t("reflectionOtherActivity")}
          </h3>
          <dl className="space-y-2 text-sm">
            <Metric label={t("reflectionStreak")} value={t("reflectionStreakDays").replace("{n}", String(activity.streak))} />
            <Metric label={t("reflectionDoneCount")} value={String(activity.reflectionsCompleted)} />
            <Metric label={t("reflectionPointsEarned")} value={String(activity.pointsEarned)} />
          </dl>
        </section>
      ) : null}

      {completed ? (
        <section className="mb-6" data-testid="reflection-result">
          <p className="text-sm font-medium">
            {t("reflectionKeep")} {keepCount}
          </p>
          <p className="text-sm font-medium">
            {t("reflectionPostpone")} {postponeCount}
          </p>
          <p className="text-sm font-medium mb-4">
            {t("reflectionStop")} {stopCount}
          </p>
          <button
            type="button"
            data-testid="reflection-start-replan"
            onClick={() => navigate("/plan/replan")}
            className="w-full min-h-12 rounded-2xl bg-accent text-accent-foreground text-base font-bold"
          >
            {t("reflectionStartReplan")}
          </button>
        </section>
      ) : null}

      <h2 className="text-base font-semibold mb-3">{t("reflectionLetsReflect")}</h2>
      {somedayNotice ? (
        <p className="text-sm text-muted-foreground mb-3">{somedayNotice}</p>
      ) : null}
      {ctx.tasks.length === 0 && ctx.plans.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">{t("reflectionNoSubjects")}</p>
      ) : null}

        {ctx.tasks.map((task) => (
          <div key={task.id}>
          <SubjectCard
            title={task.title}
            icon={task.icon}
            statusLabel={
              task.status === "completed" ? t("reflectionCompletedLabel") : t("reflectionOpenLabel")
            }
            decision={bySubject.get(task.id)}
            decisionLabel={
              bySubject.get(task.id)
                ? t(
                    bySubject.get(task.id)!.decision === "keep"
                      ? "reflectionKeep"
                      : bySubject.get(task.id)!.decision === "postpone"
                        ? "reflectionPostpone"
                        : "reflectionStop",
                  )
                : undefined
            }
            onOpen={() => setChoiceFor({ subjectType: "task", subjectId: task.id })}
          />
          {getChildTasks(task.id).length > 0 ? (
            <div className="mb-3 pl-8" data-testid="reflection-child-actions">
              {getChildTasks(task.id).map((child) => (
                <p key={child.id} className="text-xs text-muted-foreground">
                  {child.title}
                  {" · "}
                  {child.status === "completed" ? t("reflectionCompletedLabel") : t("reflectionOpenLabel")}
                </p>
              ))}
            </div>
          ) : null}
          </div>
        ))}

        {ctx.plans.map((plan) => (
          <SubjectCard
            key={plan.id}
            title={plan.title}
            icon={plan.icon}
            statusLabel={plan.status === "completed" ? t("planStatusCompleted") : undefined}
            decision={bySubject.get(plan.id)}
            decisionLabel={
              bySubject.get(plan.id)
                ? t(
                    bySubject.get(plan.id)!.decision === "keep"
                      ? "reflectionKeep"
                      : bySubject.get(plan.id)!.decision === "postpone"
                        ? "reflectionPostpone"
                        : "reflectionStop",
                  )
                : undefined
            }
            onOpen={() => setChoiceFor({ subjectType: "plan", subjectId: plan.id })}
          />
        ))}

        {(session.type === "weekly" || session.type === "monthly") &&
        (ctx.relatedTasks.length > 0 || ctx.relatedPlans.length > 0) ? (
          <div className="mb-4">
            <button
              type="button"
              onClick={() => setShowRelated((v) => !v)}
              className="flex items-center gap-1 text-sm font-medium text-accent"
            >
              <ChevronDown className={`w-4 h-4 transition-transform ${showRelated ? "rotate-180" : ""}`} />
              {showRelated ? t("reflectionHideRelatedTasks") : t("reflectionRelatedTasks")}
            </button>
            {showRelated ? (
              <div className="mt-2 rounded-xl bg-secondary/40 divide-y divide-border/40">
                {ctx.relatedPlans.map((plan) => (
                  <RelatedLine key={plan.id} title={plan.title} />
                ))}
                {ctx.relatedTasks.map((task) => (
                  <RelatedLine key={task.id} title={task.title} />
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {events.length > 0 ? (
          <section className="mb-6">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-1">
              {t("reflectionEventsHeading")}
            </h3>
            <div className="rounded-xl bg-secondary/40 divide-y divide-border/40">
              {events.map((ev) => (
                <RelatedLine key={ev.id} title={ev.title} />
              ))}
            </div>
          </section>
        ) : null}

        {completed ? null : (
          <>
            <p className="text-sm text-muted-foreground mb-3">
              {t("reflectionDecidedCount")
                .replace("{done}", String(decidedCount))
                .replace("{total}", String(subjectsTotal))}
            </p>
            {error ? <p className="text-sm text-muted-foreground mb-3">{error}</p> : null}
            <button
              type="button"
              data-testid="reflection-complete"
              onClick={complete}
              disabled={decidedCount < subjectsTotal}
              className="w-full min-h-11 rounded-xl bg-accent text-accent-foreground text-sm font-semibold mb-6 disabled:opacity-40"
            >
              {t("reflectionComplete")}
            </button>
          </>
        )}
        {completed && award != null ? (
          <p className="text-sm font-semibold mt-6" data-testid="reflection-points-awarded">
            {t("reflectionPointsAwarded").replace("{n}", String(award))}
          </p>
        ) : null}

      {choiceFor ? (
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center px-4 pb-8"
          data-testid="reflection-choice"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label={t("cancel")}
            onClick={() => setChoiceFor(null)}
          />
          <div
            className="liquid-glass liquid-glass-surface relative z-10 w-full max-w-md space-y-2 p-4"
            role="group"
            aria-label={t("reflectionChoiceLabel")}
          >
            <ChoiceButton
              label={t("reflectionKeep")}
              body={t("reflectionKeepExplain")}
              onClick={() => {
                createReflectionDecision({
                  reflectionSessionId: sessionId,
                  subjectType: choiceFor.subjectType,
                  subjectId: choiceFor.subjectId,
                  decision: "keep",
                });
                setChoiceFor(null);
                refresh();
              }}
            />
            <ChoiceButton
              label={t("reflectionPostpone")}
              body={t("reflectionPostponeExplain")}
              onClick={() => {
                setPostponeFor(choiceFor);
                setChoiceFor(null);
              }}
            />
            <ChoiceButton
              label={t("reflectionStop")}
              body={t("reflectionStopExplain")}
              onClick={() => {
                setStopFor(choiceFor);
                setChoiceFor(null);
              }}
            />
          </div>
        </div>
      ) : null}

      <ReflectionPostponeSheet
        open={!!postponeFor}
        onOpenChange={(open) => {
          if (!open) setPostponeFor(null);
        }}
        type={session.type}
        fromSomeday={
          postponeFor?.subjectType === "plan" &&
          getPlanItem(postponeFor.subjectId)?.futureTarget?.type === "someday"
        }
        onConfirm={(result) => {
          if (!postponeFor) return;
          applyPostpone(postponeFor.subjectType, postponeFor.subjectId, result);
        }}
      />

      <ReflectionStopSheet
        open={!!stopFor}
        onOpenChange={(open) => {
          if (!open) setStopFor(null);
        }}
        forPlan={stopFor?.subjectType === "plan"}
        onConfirm={(result) => {
          if (!stopFor) return;
          applyStop(stopFor.subjectType, stopFor.subjectId, result);
        }}
      />

      <DrawerPrimitive.Root
        open={!!duplicateMsg && !!pendingPostpone}
        onOpenChange={(open) => {
          if (!open) {
            setDuplicateMsg(null);
            setPendingPostpone(null);
          }
        }}
        shouldScaleBackground={false}
      >
        <DrawerPrimitive.Portal>
          <DrawerPrimitive.Overlay className="fixed inset-0 z-50 bg-black/20 backdrop-blur-[1px]" />
          <DrawerPrimitive.Content className="fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-2xl border bg-background outline-none">
            <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-muted shrink-0" />
            <div className="px-5 pt-3 pb-6 space-y-3">
              <DrawerPrimitive.Title className="text-base font-semibold">
                {t("reflectionPostponeTo")}
              </DrawerPrimitive.Title>
              <p className="text-sm">{duplicateMsg}</p>
              <GlassControl
                size="label"
                variant="prominent"
                className="w-full text-sm font-semibold"
                onClick={() => {
                  if (!pendingPostpone) return;
                  createReflectionDecision({
                    reflectionSessionId: sessionId,
                    subjectType: "task",
                    subjectId: pendingPostpone.subjectId,
                    decision: "postpone",
                    toDate: pendingPostpone.date,
                  });
                  setDuplicateMsg(null);
                  setPendingPostpone(null);
                  refresh();
                }}
              >
                {t("reflectionUseExisting")}
              </GlassControl>
              <GlassControl
                size="label"
                className="w-full text-sm font-medium"
                onClick={() => {
                  setDuplicateMsg(null);
                  setPendingPostpone(null);
                }}
              >
                {t("cancel")}
              </GlassControl>
            </div>
          </DrawerPrimitive.Content>
        </DrawerPrimitive.Portal>
      </DrawerPrimitive.Root>
    </PlanningShell>
  );
}

function SubjectCard({
  title,
  icon,
  statusLabel,
  decisionLabel,
  onOpen,
}: {
  title: string;
  icon: string;
  statusLabel?: string;
  decision?: ReflectionDecision;
  decisionLabel?: string;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid="reflection-subject"
      className="mb-3 flex w-full items-start gap-3 rounded-2xl bg-card p-4 text-left shadow-card"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary/70">
        <PlanIconGlyph iconId={icon} />
      </span>
      <span className="min-w-0">
        <span className="block text-base font-medium">{title}</span>
        {statusLabel ? <span className="mt-0.5 block text-xs text-muted-foreground">{statusLabel}</span> : null}
        {decisionLabel ? <span className="mt-1 block text-xs font-semibold">{decisionLabel}</span> : null}
      </span>
    </button>
  );
}

function ChoiceButton({ label, body, onClick }: { label: string; body: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="w-full rounded-2xl bg-background/80 px-3 py-3 text-left">
      <span className="block text-sm font-semibold">{label}</span>
      <span className="mt-0.5 block text-xs text-muted-foreground">{body}</span>
    </button>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function ScoreRing({ score, label }: { score: number; label: string }) {
  const [reduce, setReduce] = useState(false);
  const [offset, setOffset] = useState(1);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduce(media.matches);
    if (media.matches) {
      setOffset(1 - score / 100);
      return;
    }
    setOffset(1);
    const id = requestAnimationFrame(() => setOffset(1 - score / 100));
    return () => cancelAnimationFrame(id);
  }, [score]);
  const radius = 46;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className="relative mx-auto h-28 w-28" data-testid="reflection-score" aria-label={`${label} ${score}`}>
      <svg viewBox="0 0 120 120" className="h-full w-full">
        <circle cx="60" cy="60" r={radius} fill="none" className="text-muted" stroke="currentColor" strokeWidth="8" />
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke="hsl(var(--accent))"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * offset}
          transform="rotate(-90 60 60)"
          style={{ transition: reduce ? "none" : "stroke-dashoffset 480ms var(--glass-spring)" }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-2xl font-bold tabular-nums">{score}</span>
      </div>
    </div>
  );
}

function RelatedLine({ title }: { title: string }) {
  return <p className="px-4 py-2.5 text-sm">{title}</p>;
}
