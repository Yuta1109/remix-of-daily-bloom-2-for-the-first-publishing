import { useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { ConfirmMessage } from "@/components/notes/ConfirmMessage";
import { GlassControl } from "@/components/GlassControl";
import { DailyTaskSheet, type DailyTaskSheetRequest } from "@/components/plan/DailyTaskSheet";
import { PlanIconGlyph } from "@/components/plan/plan-icon-registry";
import { PlanItemSheet, type PlanSheetRequest } from "@/components/plan/PlanItemSheet";
import { PlanningShell } from "@/components/plan/PlanningHeader";
import { useI18n, type TranslationKeys } from "@/lib/i18n";
import {
  endOfWeek,
  localMonthEnd,
  localMonthStart,
  startOfWeek,
  todayLocalDate,
  toLocalMonth,
} from "@/lib/v3/local-date";
import type { PlanPathEntry, PlanPathStatus } from "@/lib/v3/plan-path";
import { isListedPlanStatus } from "@/lib/v3/plan-rules";
import {
  archivePlanItem,
  archiveTask,
  getMainPlan,
  getPlanItem,
  getPlanItems,
  getPlanPath,
  getSettings,
} from "@/lib/v3/repository";
import type { PlanLevel } from "@/lib/v3/types";
import { getThemeAccentOption, type ThemeAccentId } from "@/lib/theme-accent";
import { cn } from "@/lib/utils";

const LEVEL_KEY: Record<PlanPathEntry["level"], TranslationKeys> = {
  future: "planFuture",
  monthly: "planMonthly",
  weekly: "planWeekly",
  daily: "planDaily",
};

function pathStatusLabel(
  status: PlanPathStatus,
  t: (key: TranslationKeys) => string,
): string {
  const fraction = (completed: number, total: number) => `${completed} / ${total}`;
  switch (status.kind) {
    case "stopped":
      return t("reflectionStop");
    case "postponed":
      return t("reflectionPostpone");
    case "completed":
      return t("planStatusCompleted");
    case "keep":
      return status.progress
        ? `${t("reflectionKeep")} · ${fraction(status.progress.completed, status.progress.total)}`
        : t("reflectionKeep");
    case "progress":
      return fraction(status.completed, status.total);
    case "open":
      return "";
  }
}

/**
 * Plan — choose a main plan, read the path that actually exists, replan.
 * Do stays at /plan. Creation reuses the existing plan and task sheets.
 */
export default function PlanHome() {
  const { t, locale, formatDateStr } = useI18n();
  const navigate = useNavigate();
  const [refreshTick, setRefreshTick] = useState(0);
  const [choosing, setChoosing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [planRequest, setPlanRequest] = useState<PlanSheetRequest | null>(null);
  const [taskRequest, setTaskRequest] = useState<DailyTaskSheetRequest | null>(null);

  const refresh = () => setRefreshTick((value) => value + 1);

  const preview = useMemo(() => {
    return getPlanItems()
      .filter((plan) => isListedPlanStatus(plan.status))
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
      .slice(0, 3);
    // refreshTick reloads after create, archive, and main-plan changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTick]);

  const view = useMemo(() => {
    const selection = getMainPlan();
    return {
      selection,
      path: selection ? getPlanPath(selection) : [],
    };
    // refreshTick is the list's invalidation signal; the read itself is not a hook dep.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTick]);

  const selected = view.path.find((entry) => entry.selected) ?? null;

  const openEntry = (entry: PlanPathEntry) => {
    if (entry.kind === "task") {
      setTaskRequest({ mode: "edit", taskId: entry.id });
      return;
    }
    const plan = getPlanItem(entry.id);
    if (!plan) return;
    setPlanRequest({ mode: "edit", level: plan.level, planId: plan.id });
  };

  const openCreate = (level: PlanLevel | "daily") => {
    setChoosing(false);
    if (level === "daily") {
      setTaskRequest({ mode: "create", date: todayLocalDate() });
      return;
    }
    if (level === "future") {
      setPlanRequest({ mode: "create", level: "future" });
      return;
    }
    if (level === "monthly") {
      const periodStart = localMonthStart(toLocalMonth(todayLocalDate()));
      const periodEnd = localMonthEnd(toLocalMonth(todayLocalDate()));
      setPlanRequest({
        mode: "create",
        level: "monthly",
        periodStart,
        periodEnd,
        periodLabel: new Date(`${periodStart}T00:00:00`).toLocaleDateString(
          locale === "ja" ? "ja-JP" : "en-US",
          { year: "numeric", month: "long" },
        ),
      });
      return;
    }
    const weekStartsOn = getSettings().weekStartsOn;
    const periodStart = startOfWeek(todayLocalDate(), weekStartsOn);
    const periodEnd = endOfWeek(periodStart, weekStartsOn);
    const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
    setPlanRequest({
      mode: "create",
      level: "weekly",
      periodStart,
      periodEnd,
      periodLabel: `${formatDateStr(periodStart, opts)} – ${formatDateStr(periodEnd, opts)}`,
    });
  };

  const deleteSelected = () => {
    const selection = view.selection;
    if (!selection) return;
    if (selection.subjectType === "plan") archivePlanItem(selection.subjectId);
    else archiveTask(selection.subjectId);
    setConfirmDelete(false);
    refresh();
  };

  return (
    <PlanningShell current="plan">
      <div className="space-y-6">
        <section data-testid="plan-main">
          <h2 className="text-base font-semibold mb-2 px-1">{t("planMainPlan")}</h2>
          {view.path.length === 0 ? (
            <p className="text-sm text-muted-foreground px-1">{t("planMainPlanEmpty")}</p>
          ) : (
            <>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-1">
                {t("planPathLabel")}
              </p>
              <div
                className="bg-card rounded-2xl shadow-soft divide-y divide-border/60"
                data-testid="plan-path"
                aria-label={t("planPathLabel")}
              >
                {view.path.map((entry) => {
                  const accent = getThemeAccentOption(entry.color as ThemeAccentId);
                  const status = pathStatusLabel(entry.status, t);
                  return (
                    <button
                      key={`${entry.kind}-${entry.id}`}
                      type="button"
                      data-testid="plan-path-node"
                      data-level={entry.level}
                      data-selected={entry.selected ? "true" : "false"}
                      onClick={() => openEntry(entry)}
                      className="w-full flex items-start gap-3 px-4 py-3 text-left"
                      style={{ paddingLeft: 16 + entry.depth * 12 }}
                    >
                      <span
                        className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                        style={{
                          backgroundColor: `hsl(${accent.accent} / 0.16)`,
                          color: `hsl(${accent.accent})`,
                        }}
                      >
                        <PlanIconGlyph iconId={entry.icon} />
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                          {t(LEVEL_KEY[entry.level])}
                        </span>
                        <span
                          className={cn(
                            "block text-base truncate",
                            entry.selected ? "font-medium" : "font-normal",
                            entry.status.kind === "completed" && "line-through text-muted-foreground",
                          )}
                        >
                          {entry.title}
                        </span>
                      </span>
                      {status ? (
                        <span
                          data-testid="plan-path-status"
                          className="text-xs text-muted-foreground shrink-0 pt-4"
                        >
                          {status}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>

              <GlassControl
                size="label"
                variant="prominent"
                className="w-full mt-3 text-sm font-semibold"
                data-testid="plan-replan"
                onClick={() => navigate("/plan/replan")}
              >
                {t("planReplanAction")}
              </GlassControl>

              {selected && (
                <button
                  type="button"
                  data-testid="plan-edit"
                  onClick={() => openEntry(selected)}
                  className="mt-3 w-full text-left px-1 text-sm font-medium text-foreground/80"
                >
                  {t("planEditPlan")}
                </button>
              )}

              <button
                type="button"
                data-testid="plan-delete"
                onClick={() => setConfirmDelete(true)}
                className="mt-2 w-full text-left px-1 text-sm font-medium text-destructive"
              >
                {t("planDeleteThis")}
              </button>
            </>
          )}
        </section>

        <section>
          <button
            type="button"
            data-testid="plan-create"
            aria-expanded={choosing}
            onClick={() => setChoosing((open) => !open)}
            className="flex w-full items-center justify-between rounded-2xl bg-card px-4 py-3 text-base font-semibold shadow-soft"
          >
            <span>{t("planCreateNew")}</span>
            <ChevronRight className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          </button>
          {choosing && (
            <div className="mt-2">
              <p className="text-sm text-muted-foreground mb-2 px-1">{t("planCreateChoose")}</p>
              <div className="bg-card rounded-2xl shadow-soft divide-y divide-border/60">
                {(["future", "monthly", "weekly", "daily"] as const).map((level) => (
                  <button
                    key={level}
                    type="button"
                    data-testid={`plan-create-${level}`}
                    onClick={() => openCreate(level)}
                    className="w-full text-left px-4 py-3 text-base"
                  >
                    {t(LEVEL_KEY[level])}
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>

        <section
          data-testid="plan-list-preview"
          className="rounded-2xl border border-foreground/10 bg-card px-3 py-3 shadow-soft"
        >
          {preview.map((plan) => (
            <p key={plan.id} className="truncate px-1 py-2 text-sm font-medium">
              {plan.title}
            </p>
          ))}
          <button
            type="button"
            data-testid="plan-see-list"
            onClick={() => navigate("/plan")}
            className="w-full px-1 pt-2 text-left text-base font-semibold"
          >
            {t("planSeeList")}
          </button>
        </section>

        <div className="h-16" aria-hidden="true" />
      </div>

      <PlanItemSheet
        request={planRequest}
        onOpenChange={(open) => !open && setPlanRequest(null)}
        onSaved={() => {
          refresh();
          setPlanRequest(null);
        }}
        onChanged={refresh}
      />
      <DailyTaskSheet
        request={taskRequest}
        onOpenChange={(open) => !open && setTaskRequest(null)}
        onSaved={() => {
          refresh();
          setTaskRequest(null);
        }}
        onChanged={refresh}
      />
      <ConfirmMessage
        open={confirmDelete}
        testId="plan-delete-confirm"
        message={t("planDeleteThisConfirm")}
        confirmLabel={t("planTaskDelete")}
        cancelLabel={t("cancel")}
        onConfirm={deleteSelected}
        onCancel={() => setConfirmDelete(false)}
      />
    </PlanningShell>
  );
}
