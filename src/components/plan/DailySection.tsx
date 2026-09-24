import { useMemo, useState } from "react";
import { ListChecks } from "lucide-react";
import { useI18n, type TranslationKeys } from "@/lib/i18n";
import { PlanFab } from "@/components/plan/PlanFab";
import { PeriodNav } from "@/components/plan/PeriodNav";
import { DailyTaskRow } from "@/components/plan/DailyTaskRow";
import { DailyTaskSheet, type DailyTaskSheetRequest } from "@/components/plan/DailyTaskSheet";
import {
  completeTask,
  getPlanItem,
  getTasksForDate,
} from "@/lib/v3/repository";
import { isListedTaskStatus } from "@/lib/v3/plan-rules";
import { addDays, todayLocalDate, type LocalDate } from "@/lib/v3/local-date";

function relativeLabel(
  date: LocalDate,
  today: LocalDate,
  t: (key: TranslationKeys) => string,
  formatDateStr: (iso: string, options?: Intl.DateTimeFormatOptions) => string,
): string {
  if (date === today) return t("todayLabel");
  if (date === addDays(today, 1)) return t("planTomorrow");
  if (date === addDays(today, -1)) return t("planYesterday");
  return formatDateStr(date, { weekday: "long" });
}

export function DailySection() {
  const { t, formatDateStr } = useI18n();
  const today = todayLocalDate();
  const [date, setDate] = useState<LocalDate>(today);
  const [refreshTick, setRefreshTick] = useState(0);
  const [sheetRequest, setSheetRequest] = useState<DailyTaskSheetRequest | null>(null);

  const dateLabel = useMemo(
    () => formatDateStr(date, { month: "long", day: "numeric", year: "numeric" }),
    [date, formatDateStr],
  );
  const rel = useMemo(
    () => relativeLabel(date, today, t, formatDateStr),
    [date, today, t, formatDateStr],
  );

  const tasks = useMemo(
    () => getTasksForDate(date).filter((task) => isListedTaskStatus(task.status)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [date, refreshTick],
  );

  const refresh = () => setRefreshTick((v) => v + 1);
  const openCreate = () => setSheetRequest({ mode: "create", date });

  return (
    <>
      <div className="mb-3">
        <PeriodNav
          label={dateLabel}
          onPrev={() => setDate((d) => addDays(d, -1))}
          onNext={() => setDate((d) => addDays(d, 1))}
        />
        <div className="flex items-center justify-between px-0.5 mt-1">
          <p className="text-sm text-muted-foreground">{rel}</p>
          {date !== today && (
            <button
              type="button"
              onClick={() => setDate(todayLocalDate())}
              className="text-sm font-medium text-accent px-1 py-0.5 rounded-md hover:bg-accent/10"
            >
              {t("todayLabel")}
            </button>
          )}
        </div>
      </div>

      {tasks.length === 0 ? (
        <EmptyState onAdd={openCreate} />
      ) : (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-1">
            {t("planDailySectionTitle")}
          </h3>
          <div className="bg-card rounded-2xl shadow-soft divide-y divide-border/60">
            {tasks.map((task) => (
              <DailyTaskRow
                key={task.id}
                task={task}
                parentTitle={
                  task.parentPlanId ? getPlanItem(task.parentPlanId)?.title : undefined
                }
                onPress={() => setSheetRequest({ mode: "edit", taskId: task.id })}
                onToggleComplete={() => {
                  completeTask(task.id, task.status !== "completed");
                  refresh();
                }}
              />
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
