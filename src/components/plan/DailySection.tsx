import { useMemo, useState } from "react";
import { ListChecks } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { PlanFab } from "@/components/plan/PlanFab";
import { DailyPeriodButton, PeriodFacts } from "@/components/plan/PeriodControls";
import { DailyTaskRow } from "@/components/plan/DailyTaskRow";
import { DailyTaskSheet, type DailyTaskSheetRequest } from "@/components/plan/DailyTaskSheet";
import {
  completeTask,
  getPlanItem,
  getTasksForDate,
} from "@/lib/v3/repository";
import { isListedTaskStatus } from "@/lib/v3/plan-rules";
import { todayLocalDate, type LocalDate } from "@/lib/v3/local-date";
import { useSessionView } from "@/hooks/use-session-view";
import { PLANNING_VIEW } from "@/lib/session-nav";

function isPastDate(date: LocalDate, today: LocalDate): boolean {
  return date < today;
}

export function DailySection() {
  const { t } = useI18n();
  const today = todayLocalDate();
  const [date, setDate] = useSessionView<LocalDate>("planning", PLANNING_VIEW.dailyDate, today);
  const [refreshTick, setRefreshTick] = useState(0);
  const [sheetRequest, setSheetRequest] = useState<DailyTaskSheetRequest | null>(null);

  const tasks = useMemo(
    () => getTasksForDate(date).filter((task) => isListedTaskStatus(task.status)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [date, refreshTick],
  );

  const refresh = () => setRefreshTick((v) => v + 1);
  const openCreate = () => setSheetRequest({ mode: "create", date });

  return (
    <>
      <DailyPeriodButton date={date} onChange={setDate} />
      <PeriodFacts type="daily" anchorDate={date} from={date} to={date} />

      {tasks.length === 0 ? (
        <EmptyState onAdd={openCreate} />
      ) : (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-1">
            {t("planDailySectionTitle")}
          </h3>
          <div className="bg-card rounded-2xl shadow-soft divide-y divide-border/60">
            {tasks
              .filter((task) => !task.parentTaskId || !tasks.some((parent) => parent.id === task.parentTaskId))
              .map((task) => (
                <div key={task.id}>
                  <DailyTaskRow
                    task={task}
                    parentTitle={task.parentPlanId ? getPlanItem(task.parentPlanId)?.title : undefined}
                    onPress={() => setSheetRequest({ mode: "edit", taskId: task.id })}
                    onAddChild={
                      task.parentTaskId || isPastDate(date, today)
                        ? undefined
                        : () =>
                            setSheetRequest({
                              mode: "create",
                              date: task.date,
                              parentTaskId: task.id,
                              createdFrom: "plan",
                            })
                    }
                    onToggleComplete={() => {
                      if (isPastDate(date, today)) return;
                      completeTask(task.id, task.status !== "completed");
                      refresh();
                    }}
                    completionDisabled={isPastDate(date, today)}
                  />
                  {tasks
                    .filter((child) => child.parentTaskId === task.id)
                    .map((child) => (
                      <DailyTaskRow
                        key={child.id}
                        task={child}
                        nested
                        onPress={() => setSheetRequest({ mode: "edit", taskId: child.id })}
                        onToggleComplete={() => {
                          if (isPastDate(date, today)) return;
                          completeTask(child.id, child.status !== "completed");
                          refresh();
                        }}
                        completionDisabled={isPastDate(date, today)}
                      />
                    ))}
                </div>
              ))}
          </div>
        </div>
      )}

      <PlanFab onClick={openCreate} aria-label={t("planDailyAddCta")} />

      <DailyTaskSheet
        request={sheetRequest}
        onOpenChange={(open) => !open && setSheetRequest(null)}
        onSaved={() => {
          refresh();
        }}
        onChanged={refresh}
      />
    </>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6">
      <div className="w-12 h-12 rounded-full bg-secondary/70 flex items-center justify-center mb-3">
        <ListChecks className="w-5 h-5 text-muted-foreground" aria-hidden="true" />
      </div>
      <p className="text-base font-semibold mb-1">{t("planDailyEmptyTitle")}</p>
      <p className="text-sm text-muted-foreground mb-4">{t("planDailyEmptyBody")}</p>
      <button
        type="button"
        onClick={onAdd}
        className="rounded-full bg-accent text-accent-foreground px-4 py-2 text-sm font-semibold hover:opacity-90 transition-opacity"
      >
        {t("planDailyAddCta")}
      </button>
    </div>
  );
}
