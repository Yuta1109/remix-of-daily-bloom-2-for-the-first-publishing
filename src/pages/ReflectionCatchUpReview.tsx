import { useEffect, useMemo, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { ReflectionDecisionBar } from "@/components/plan/ReflectionDecisionBar";
import {
  ReflectionPostponeSheet,
  type PostponeResult,
} from "@/components/plan/ReflectionPostponeSheet";
import { ReflectionStopSheet, type StopResult } from "@/components/plan/ReflectionStopSheet";
import { PlanIconGlyph } from "@/components/plan/plan-icon-registry";
import { useI18n } from "@/lib/i18n";
import {
  completeReflectionSession,
  createReflectionDecision,
  getEquivalentTaskOn,
  getPlanItem,
  getReflectionContext,
  getReflectionDecisions,
  migratePlanToCollection,
  startCatchUpReview,
} from "@/lib/v3/repository";
import { postponeShiftsDescendants } from "@/lib/v3/reflection-migration";
import type { ReflectionDecision, ReflectionType } from "@/lib/v3/types";

function isReflectionType(value: string): value is ReflectionType {
  return value === "daily" || value === "weekly" || value === "monthly" || value === "future";
}

export default function ReflectionCatchUpReview() {
  const { type: typeParam = "daily" } = useParams();
  const type: ReflectionType = isReflectionType(typeParam) ? typeParam : "daily";
  const { t, formatDateStr } = useI18n();
  const navigate = useNavigate();
  const [tick, setTick] = useState(0);
  const [postponeFor, setPostponeFor] = useState<{
    sessionId: string;
    subjectType: "task" | "plan";
    subjectId: string;
  } | null>(null);
  const [stopFor, setStopFor] = useState<{
    sessionId: string;
    subjectType: "task" | "plan";
    subjectId: string;
  } | null>(null);
  const [somedayNotice, setSomedayNotice] = useState<string | null>(null);
  const [duplicateMsg, setDuplicateMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    startCatchUpReview(type);
    setTick((n) => n + 1);
  }, [type]);

  const rows = useMemo(() => {
    const sessions = startCatchUpReview(type);
    return sessions.flatMap((session) => {
      const ctx = getReflectionContext(session.id);
      const decisions = getReflectionDecisions(session.id);
      const bySubject = new Map(decisions.map((d) => [d.subjectId, d]));
      return [
        ...ctx.tasks.map((task) => ({
          sessionId: session.id,
          kind: "task" as const,
          task,
          decision: bySubject.get(task.id),
        })),
        ...ctx.plans.map((plan) => ({
          sessionId: session.id,
          kind: "plan" as const,
          plan,
          decision: bySubject.get(plan.id),
        })),
      ];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, tick]);

  const decidedCount = rows.filter((row) => row.decision).length;
  const refresh = () => setTick((n) => n + 1);

  const applyPostpone = (
    sessionId: string,
    subjectType: "task" | "plan",
    subjectId: string,
    result: PostponeResult,
  ) => {
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
        createReflectionDecision({
          reflectionSessionId: sessionId,
          subjectType,
          subjectId,
          decision: "postpone",
          toDate: result.date,
        });
        setDuplicateMsg(
          t("reflectionAlreadyScheduled").replace(
            "{date}",
            formatDateStr(result.date, { month: "long", day: "numeric" }),
          ),
        );
        setPostponeFor(null);
        refresh();
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

  const complete = () => {
    try {
      const sessions = startCatchUpReview(type);
      for (const session of sessions) {
        completeReflectionSession(session.id);
      }
      navigate("/plan/reflection");
    } catch {
      setError(
        t("reflectionDecidedCount")
          .replace("{done}", String(decidedCount))
          .replace("{total}", String(rows.length)),
      );
    }
  };

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
            <h1 className="text-xl font-bold tracking-tight">{t("reflectionCatchUpTitle")}</h1>
            <p className="text-xs text-muted-foreground">
              {t("reflectionDecidedCount")
                .replace("{done}", String(decidedCount))
                .replace("{total}", String(rows.length))}
            </p>
          </div>
        </div>
      </div>

      <div className="app-shell-scroll px-4">
        {somedayNotice ? <p className="text-sm text-muted-foreground mb-3">{somedayNotice}</p> : null}
        {duplicateMsg ? <p className="text-sm text-muted-foreground mb-3">{duplicateMsg}</p> : null}
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">{t("reflectionNoSubjects")}</p>
        ) : null}
        {rows.map((row) =>
          row.kind === "task" ? (
            <SubjectCard
              key={row.task.id}
              title={row.task.title}
              icon={row.task.icon}
              statusLabel={
                row.task.status === "completed" ? t("reflectionCompletedLabel") : t("reflectionOpenLabel")
              }
              decision={row.decision}
              onKeep={() => {
                createReflectionDecision({
                  reflectionSessionId: row.sessionId,
                  subjectType: "task",
                  subjectId: row.task.id,
                  decision: "keep",
                });
                refresh();
              }}
              onPostpone={() =>
                setPostponeFor({ sessionId: row.sessionId, subjectType: "task", subjectId: row.task.id })
              }
              onStop={() =>
                setStopFor({ sessionId: row.sessionId, subjectType: "task", subjectId: row.task.id })
              }
            />
          ) : (
            <SubjectCard
              key={row.plan.id}
              title={row.plan.title}
              icon={row.plan.icon}
              decision={row.decision}
              onKeep={() => {
                createReflectionDecision({
                  reflectionSessionId: row.sessionId,
                  subjectType: "plan",
                  subjectId: row.plan.id,
                  decision: "keep",
                });
                refresh();
              }}
              onPostpone={() =>
                setPostponeFor({ sessionId: row.sessionId, subjectType: "plan", subjectId: row.plan.id })
              }
              onStop={() =>
                setStopFor({ sessionId: row.sessionId, subjectType: "plan", subjectId: row.plan.id })
              }
            />
          ),
        )}
        {error ? <p className="text-sm text-muted-foreground mb-3">{error}</p> : null}
        <button
          type="button"
          onClick={complete}
          disabled={decidedCount < rows.length}
          className="w-full min-h-11 rounded-xl bg-accent text-accent-foreground text-sm font-semibold mb-4 disabled:opacity-40"
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
        type={type}
        fromSomeday={
          postponeFor?.subjectType === "plan" &&
          getPlanItem(postponeFor.subjectId)?.futureTarget?.type === "someday"
        }
        onConfirm={(result) => {
          if (!postponeFor) return;
          applyPostpone(postponeFor.sessionId, postponeFor.subjectType, postponeFor.subjectId, result);
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
          if (result.kind === "collection") {
            migratePlanToCollection(stopFor.subjectId, result.collectionId);
          }
          createReflectionDecision({
            reflectionSessionId: stopFor.sessionId,
            subjectType: stopFor.subjectType,
            subjectId: stopFor.subjectId,
            decision: "stop",
            collectionId: result.kind === "collection" ? result.collectionId : undefined,
          });
          setStopFor(null);
          refresh();
        }}
      />
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
