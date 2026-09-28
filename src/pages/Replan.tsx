import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DailyTaskSheet, type DailyTaskSheetRequest } from "@/components/plan/DailyTaskSheet";
import { PlanItemSheet, type PlanSheetRequest } from "@/components/plan/PlanItemSheet";
import { PlanningShell } from "@/components/plan/PlanningHeader";
import { useI18n, type TranslationKeys } from "@/lib/i18n";
import { todayLocalDate } from "@/lib/v3/local-date";
import type { PlanPathEntry } from "@/lib/v3/plan-path";
import {
  movePlanOnPath,
  moveTaskOnPath,
  replanCanDetach,
  replanCanShift,
  replanDecomposeLevel,
  replanParentChoices,
  replanPathChoices,
  shiftReplanOrder,
  type ReplanRef,
} from "@/lib/v3/replan";
import {
  getMainPlan,
  getPlanItem,
  getPlanPath,
  getPostponeBoxItems,
  getTask,
  updatePlanItem,
  updateTask,
} from "@/lib/v3/repository";
import type { MainPlanSelection } from "@/lib/v3/types";
import { useSessionView } from "@/hooks/use-session-view";
import { PLANNING_VIEW } from "@/lib/session-nav";

const LEVEL_KEY: Record<PlanPathEntry["level"], TranslationKeys> = {
  future: "planFuture",
  monthly: "planMonthly",
  weekly: "planWeekly",
  daily: "planDaily",
};

function refOf(entry: PlanPathEntry): ReplanRef {
  return entry.kind === "task" ? { kind: "task", id: entry.id } : { kind: "plan", id: entry.id };
}

/**
 * Replan — redesign the current plan path, and open the Postpone Box.
 * Writes go through the existing plan and task records. A path that does
 * not start at Future is left without one.
 */
export default function Replan() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [refreshTick, setRefreshTick] = useState(0);
  const [focus, setFocus] = useSessionView<MainPlanSelection | null>(
    "planning",
    PLANNING_VIEW.replanFocus,
    null,
    (value) =>
      value === null ||
      (value.subjectType === "plan" ? !!getPlanItem(value.subjectId) : !!getTask(value.subjectId)),
  );
  const [selectedKey, setSelectedKey] = useSessionView<string | null>(
    "planning",
    PLANNING_VIEW.replanSelected,
    null,
  );
  const [panel, setPanel] = useState<"move" | "restructure" | null>(null);
  const [moveParent, setMoveParent] = useState("");
  const [planRequest, setPlanRequest] = useState<PlanSheetRequest | null>(null);
  const [taskRequest, setTaskRequest] = useState<DailyTaskSheetRequest | null>(null);

  const refresh = () => setRefreshTick((value) => value + 1);

  const view = useMemo(() => {
    const main = getMainPlan();
    const choices = replanPathChoices();
    const selection =
      focus ??
      main ??
      (choices[0] ? { subjectType: "plan" as const, subjectId: choices[0].id } : null);
    const path = selection ? getPlanPath(selection) : [];
    const box = getPostponeBoxItems();
    return { selection, choices, path, postponeCount: box.tasks.length + box.plans.length };
    // refreshTick reloads after a path edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTick, focus]);

  const active =
    view.path.find((entry) => `${entry.kind}:${entry.id}` === selectedKey) ??
    view.path.find((entry) => entry.selected) ??
    view.path[0] ??
    null;
  const activeRef = active ? refOf(active) : null;
  const parents = activeRef ? replanParentChoices(activeRef) : [];
  const canDetach = activeRef ? replanCanDetach(activeRef) : false;
  const canMove = parents.length > 0 || canDetach;
  const taskRecord = active?.kind === "task" ? getTask(active.id) : undefined;
  const canDecomposeTask = !!taskRecord && !taskRecord.parentTaskId;
  const childLevel = active && active.kind === "plan" ? replanDecomposeLevel(active.level) : null;

  const levels: PlanPathEntry["level"][] = [];
  for (const entry of view.path) {
    if (!levels.includes(entry.level)) levels.push(entry.level);
  }

  const selectEntry = (entry: PlanPathEntry) => {
    setSelectedKey(`${entry.kind}:${entry.id}`);
    setPanel(null);
    setMoveParent("");
  };

  const keepChildInBox = (parentId: string | undefined, child: ReplanRef) => {
    if (!parentId) return;
    const parent = getPlanItem(parentId);
    if (!parent?.inPostponeBox) return;
    if (child.kind === "plan") updatePlanItem(child.id, { inPostponeBox: true });
    else updateTask(child.id, { inPostponeBox: true });
  };

  const openAdd = () => {
    if (!active) return;
    if (active.kind === "task") {
      const task = getTask(active.id);
      setTaskRequest({
        mode: "create",
        date: task?.date ?? todayLocalDate(),
        parentPlanId: task?.parentPlanId,
        createdFrom: "plan",
      });
      return;
    }
    const plan = getPlanItem(active.id);
    if (!plan) return;
    setPlanRequest({
      mode: "create",
      level: plan.level,
      parentPlanId: plan.parentPlanId,
      periodStart: plan.periodStart,
      periodEnd: plan.periodEnd,
    });
  };

  const openDecompose = () => {
    if (!active) return;
    if (active.kind === "task") {
      const task = getTask(active.id);
      if (!task || task.parentTaskId) return;
      setTaskRequest({
        mode: "create",
        date: task.date,
        parentTaskId: task.id,
        createdFrom: "plan",
      });
      return;
    }
    if (!childLevel) return;
    if (childLevel === "daily") {
      setTaskRequest({
        mode: "create",
        date: todayLocalDate(),
        parentPlanId: active.id,
        repeatable: true,
        createdFrom: "plan",
      });
      return;
    }
    setPlanRequest({ mode: "create", level: childLevel, parentPlanId: active.id });
  };

  const applyMove = () => {
    if (!activeRef || !canMove) return;
    const parentId = moveParent || undefined;
    if (activeRef.kind === "plan") movePlanOnPath(activeRef.id, parentId);
    else moveTaskOnPath(activeRef.id, parentId);
    setPanel(null);
    refresh();
  };

  return (
    <PlanningShell current="replan">
      <div className="space-y-6">
        <section data-testid="replan-path">
          <h2 className="text-base font-semibold mb-2 px-1">{t("replanPathTitle")}</h2>
          {view.choices.length > 0 && (
            <label className="block mb-3 px-1">
              <span className="sr-only">{t("planPathLabel")}</span>
              <select
                data-testid="replan-path-picker"
                className="w-full rounded-xl bg-secondary/60 px-3 py-2 text-sm"
                value={
                  view.selection ? `${view.selection.subjectType}:${view.selection.subjectId}` : ""
                }
                onChange={(event) => {
                  const [kind, id] = event.target.value.split(":");
                  if ((kind !== "plan" && kind !== "task") || !id) return;
                  setFocus({ subjectType: kind, subjectId: id });
                  setSelectedKey(null);
                  setPanel(null);
                }}
              >
                {view.selection?.subjectType === "task" ? (
                  <option value={`task:${view.selection.subjectId}`}>
                    {getTask(view.selection.subjectId)?.title ?? view.selection.subjectId}
                  </option>
                ) : null}
                {view.choices.map((plan) => (
                  <option key={plan.id} value={`plan:${plan.id}`}>
                    {t(LEVEL_KEY[plan.level])} · {plan.title}
                  </option>
                ))}
              </select>
            </label>
          )}

          {view.path.length === 0 ? (
            <p className="text-sm text-muted-foreground px-1">{t("replanPathEmpty")}</p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground mb-2 px-1" data-testid="replan-level-chain">
                {levels.map((level) => t(LEVEL_KEY[level])).join(" → ")}
              </p>
              <div className="bg-card rounded-2xl shadow-soft divide-y divide-border/60">
                {view.path.map((entry) => {
                  const key = `${entry.kind}:${entry.id}`;
                  const isActive = active ? `${active.kind}:${active.id}` === key : false;
                  return (
                    <button
                      key={key}
                      type="button"
                      data-testid="replan-path-node"
                      data-level={entry.level}
                      data-selected={isActive ? "true" : "false"}
                      onClick={() => selectEntry(entry)}
                      className="w-full px-4 py-3 text-left"
                      style={{ paddingLeft: 16 + entry.depth * 12 }}
                    >
                      <span className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                        {t(LEVEL_KEY[entry.level])}
                      </span>
                      <span className="block text-base truncate">{entry.title}</span>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {active && activeRef && (
            <div className="mt-3 flex flex-wrap gap-2" data-testid="replan-actions">
              <ActionButton
                testId="replan-edit"
                label={t("replanEdit")}
                onClick={() => {
                  if (active.kind === "task") setTaskRequest({ mode: "edit", taskId: active.id });
                  else {
                    const plan = getPlanItem(active.id);
                    if (plan) setPlanRequest({ mode: "edit", level: plan.level, planId: plan.id });
                  }
                }}
              />
              <ActionButton testId="replan-add" label={t("replanAdd")} onClick={openAdd} />
              <ActionButton
                testId="replan-decompose"
                label={t("replanDecompose")}
                disabled={!childLevel && !canDecomposeTask}
                onClick={openDecompose}
              />
              <ActionButton
                testId="replan-move"
                label={t("replanMove")}
                disabled={!canMove}
                onClick={() => {
                  setPanel("move");
                  setMoveParent(parents[0]?.id ?? "");
                }}
              />
              <ActionButton
                testId="replan-restructure"
                label={t("replanRestructure")}
                disabled={!replanCanShift(activeRef, -1) && !replanCanShift(activeRef, 1)}
                onClick={() => setPanel("restructure")}
              />
            </div>
          )}

          {active && !canMove ? (
            <p className="mt-3 text-sm text-muted-foreground px-1" data-testid="replan-move-none">
              {t("replanMoveNone")}
            </p>
          ) : null}

          {panel === "move" && activeRef && (
            <div className="mt-3 space-y-2" data-testid="replan-move-panel">
              <select
                data-testid="replan-move-parent"
                className="w-full rounded-xl bg-secondary/60 px-3 py-2 text-sm"
                value={moveParent}
                onChange={(event) => setMoveParent(event.target.value)}
              >
                {canDetach ? <option value="">{t("replanMoveDetach")}</option> : null}
                {parents.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.title}
                  </option>
                ))}
              </select>
              <ActionButton testId="replan-move-apply" label={t("replanApplyMove")} onClick={applyMove} />
            </div>
          )}

          {panel === "restructure" && activeRef && (
            <div className="mt-3 flex gap-2" data-testid="replan-restructure-panel">
              <ActionButton
                testId="replan-up"
                label={t("replanUp")}
                disabled={!replanCanShift(activeRef, -1)}
                onClick={() => {
                  shiftReplanOrder(activeRef, -1);
                  refresh();
                }}
              />
              <ActionButton
                testId="replan-down"
                label={t("replanDown")}
                disabled={!replanCanShift(activeRef, 1)}
                onClick={() => {
                  shiftReplanOrder(activeRef, 1);
                  refresh();
                }}
              />
            </div>
          )}
        </section>

        <section>
          <button
            type="button"
            data-testid="replan-postpone"
            onClick={() => navigate("/plan/postpone-box")}
            className="flex w-full items-center justify-between rounded-2xl bg-card px-4 py-3 text-base font-semibold shadow-soft"
          >
            <span>{t("postponeBox")}</span>
            <span className="text-sm font-medium text-muted-foreground">{view.postponeCount}</span>
          </button>
        </section>
      </div>

      <PlanItemSheet
        request={planRequest}
        onOpenChange={(open) => !open && setPlanRequest(null)}
        onSaved={(item) => {
          keepChildInBox(planRequest?.parentPlanId, { kind: "plan", id: item.id });
          refresh();
        }}
        onChanged={refresh}
      />
      <DailyTaskSheet
        request={taskRequest}
        onOpenChange={(open) => !open && setTaskRequest(null)}
        onSaved={(task) => {
          keepChildInBox(taskRequest?.parentPlanId, { kind: "task", id: task.id });
          refresh();
        }}
        onChanged={refresh}
      />
    </PlanningShell>
  );
}

function ActionButton({
  testId,
  label,
  onClick,
  disabled = false,
}: {
  testId: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      disabled={disabled}
      onClick={onClick}
      className="rounded-xl bg-secondary/70 px-3 py-2 text-sm font-medium disabled:opacity-40"
    >
      {label}
    </button>
  );
}
