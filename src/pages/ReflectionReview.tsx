import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronDown } from "lucide-react";
import { Drawer as DrawerPrimitive } from "vaul";
import { useNavigate, useParams } from "react-router-dom";
import { ReflectionDecisionBar } from "@/components/plan/ReflectionDecisionBar";
import {
  ReflectionPostponeSheet,
  type PostponeResult,
} from "@/components/plan/ReflectionPostponeSheet";
import { ReflectionStopSheet, type StopResult } from "@/components/plan/ReflectionStopSheet";
import { PlanIconGlyph } from "@/components/plan/plan-icon-registry";
import { useI18n } from "@/lib/i18n";
import { setOverlayChrome } from "@/lib/overlay-chrome";
import { eventsInRange, loadEvents, type CalendarEvent } from "@/lib/events-store";
import {
  createReflectionDecision,
  completeReflectionSession,
  getEquivalentTaskOn,
  getPlanItem,
  getReflection,
  getReflectionContext,
  getReflectionDecisions,
  migratePlanToCollection,
  startReflectionSession,
} from "@/lib/v3/repository";
import { postponeShiftsDescendants } from "@/lib/v3/reflection-migration";
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

  const events: CalendarEvent[] = useMemo(() => {
    if (!session) return [];
    const from = session.targetPeriodStart;
    const to = session.targetPeriodEnd ?? from;
    const map = eventsInRange(from, to, loadEvents());
    return [...map.values()].flat();
  }, [session]);

  const refresh = () => setTick((n) => n + 1);

  const applyPostpone = (subjectType: "task" | "plan", subjectId: string, result: PostponeResult) => {
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
      navigate("/plan/reflection");
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

  return (
    <div className="app-shell-page">
      <div className="app-shell-header px-2 pb-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => navigate("/plan/reflection")}
            aria-label={t("back")}
            className="p-2 rounded-full text-foreground/70 hover:bg-secondary/70"
          >
            <ChevronLeft className="w-5 h-5" aria-hidden="true" />
          </button>
          <div>
            <h1 className="text-xl font-bold tracking-tight">
              {t("reflectionTitle")} · {title}
            </h1>
            <p className="text-xs text-muted-foreground">
              {ctx.tasks.length
                ? t("reflectionReviewingTasks").replace("{n}", String(ctx.tasks.length))
                : t("reflectionReviewingPlans").replace("{n}", String(ctx.plans.length))}
            </p>
          </div>
        </div>
      </div>

      <div className="app-shell-scroll px-4">
        {somedayNotice ? (
          <p className="text-sm text-muted-foreground mb-3">{somedayNotice}</p>
        ) : null}
        {ctx.tasks.length === 0 && ctx.plans.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">{t("reflectionNoSubjects")}</p>
        ) : null}

        {ctx.tasks.map((task) => (
          <SubjectCard
            key={task.id}
            title={task.title}
            icon={task.icon}
            statusLabel={
              task.status === "completed" ? t("reflectionCompletedLabel") : t("reflectionOpenLabel")
            }
            decision={bySubject.get(task.id)}
            onKeep={() => {
              createReflectionDecision({
                reflectionSessionId: sessionId,
                subjectType: "task",
                subjectId: task.id,
                decision: "keep",
              });
              refresh();
            }}
            onPostpone={() => setPostponeFor({ subjectType: "task", subjectId: task.id })}
            onStop={() => setStopFor({ subjectType: "task", subjectId: task.id })}
          />
        ))}

        {ctx.plans.map((plan) => (
          <SubjectCard
            key={plan.id}
            title={plan.title}
            icon={plan.icon}
            statusLabel={plan.status === "completed" ? t("planStatusCompleted") : undefined}
            decision={bySubject.get(plan.id)}
            onKeep={() => {
              createReflectionDecision({
                reflectionSessionId: sessionId,
                subjectType: "plan",
                subjectId: plan.id,
                decision: "keep",
              });
              refresh();
            }}
            onPostpone={() => setPostponeFor({ subjectType: "plan", subjectId: plan.id })}
            onStop={() => setStopFor({ subjectType: "plan", subjectId: plan.id })}
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

        <p className="text-sm text-muted-foreground mb-3">
          {t("reflectionDecidedCount")
            .replace("{done}", String(decidedCount))
            .replace("{total}", String(subjectsTotal))}
        </p>
        {error ? <p className="text-sm text-muted-foreground mb-3">{error}</p> : null}
        <button
          type="button"
          onClick={complete}
          disabled={decidedCount < subjectsTotal}
          className="w-full min-h-11 rounded-xl bg-accent text-accent-foreground text-sm font-semibold mb-10 disabled:opacity-40"
        >
          {t("reflectionComplete")}
        </button>
        <div className="h-20" aria-hidden="true" />
      </div>

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
              <button
                type="button"
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
                className="w-full min-h-11 rounded-xl bg-accent text-accent-foreground text-sm font-semibold"
              >
                {t("reflectionUseExisting")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setDuplicateMsg(null);
                  setPendingPostpone(null);
                }}
                className="w-full min-h-11 rounded-xl bg-secondary/60 text-sm font-medium"
              >
                {t("back")}
              </button>
            </div>
          </DrawerPrimitive.Content>
        </DrawerPrimitive.Portal>
      </DrawerPrimitive.Root>
    </div>
  );
}

function SubjectCard({
  title,
  icon,
  statusLabel,
  decision,
  onKeep,
  onPostpone,
  onStop,
}: {
  title: string;
  icon: string;
  statusLabel?: string;
  decision?: ReflectionDecision;
  onKeep: () => void;
  onPostpone: () => void;
  onStop: () => void;
}) {
  return (
    <div className="rounded-2xl bg-card shadow-card p-4 mb-3">
      <div className="flex items-start gap-3 mb-3">
        <span className="w-8 h-8 rounded-full bg-secondary/70 flex items-center justify-center shrink-0">
          <PlanIconGlyph iconId={icon} />
        </span>
        <div className="min-w-0">
          <p className="text-base font-medium">{title}</p>
          {statusLabel ? <p className="text-xs text-muted-foreground mt-0.5">{statusLabel}</p> : null}
        </div>
      </div>
      <ReflectionDecisionBar
        value={decision?.decision}
        onKeep={onKeep}
        onPostpone={onPostpone}
        onStop={onStop}
      />
    </div>
  );
}

function RelatedLine({ title }: { title: string }) {
  return <p className="px-4 py-2.5 text-sm">{title}</p>;
}
