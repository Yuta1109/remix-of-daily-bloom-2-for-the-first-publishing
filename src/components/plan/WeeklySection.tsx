import { useMemo, useState } from "react";
import { CalendarClock } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { PlanFab } from "@/components/plan/PlanFab";
import { PlanRow } from "@/components/plan/PlanRow";
import { PeriodNav } from "@/components/plan/PeriodNav";
import { PlanItemSheet, type PlanSheetRequest } from "@/components/plan/PlanItemSheet";
import { DailyTaskSheet, type DailyTaskSheetRequest } from "@/components/plan/DailyTaskSheet";
import {
  getPlanItem,
  getPlanItemsForPeriod,
  getPlanProgress,
  getSettings,
} from "@/lib/v3/repository";
import { addDays, endOfWeek, isWithin, startOfWeek, todayLocalDate, type LocalDate } from "@/lib/v3/local-date";

function weeklyProgressLabel(item: { id: string }): string | undefined {
  const { total, completed } = getPlanProgress(item.id);
  if (total === 0) return undefined;
  return `${completed} / ${total}`;
}

function defaultBreakdownDate(periodStart: LocalDate, periodEnd: LocalDate): LocalDate {
  const today = todayLocalDate();
  return isWithin(today, periodStart, periodEnd) ? today : periodStart;
}

export function WeeklySection() {
  const { t, formatDateStr } = useI18n();
  const weekStartsOn = getSettings().weekStartsOn;
  const [weekAnchor, setWeekAnchor] = useState(() => startOfWeek(todayLocalDate(), weekStartsOn));
  const [refreshTick, setRefreshTick] = useState(0);
  const [sheetRequest, setSheetRequest] = useState<PlanSheetRequest | null>(null);
  const [taskRequest, setTaskRequest] = useState<DailyTaskSheetRequest | null>(null);

  const periodStart = weekAnchor;
  const periodEnd = useMemo(() => endOfWeek(weekAnchor, weekStartsOn), [weekAnchor, weekStartsOn]);
  const weekLabel = useMemo(() => {
    const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
    return `${formatDateStr(periodStart, opts)} – ${formatDateStr(periodEnd, opts)}`;
  }, [periodStart, periodEnd, formatDateStr]);

  const items = useMemo(
    () => getPlanItemsForPeriod("weekly", periodStart, periodEnd),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [periodStart, periodEnd, refreshTick],
  );

  const refresh = () => setRefreshTick((v) => v + 1);

  return (
    <>
      <PeriodNav
        label={weekLabel}
        onPrev={() => setWeekAnchor((w) => addDays(w, -7))}
        onNext={() => setWeekAnchor((w) => addDays(w, 7))}
        className="mb-3"
      />

      {items.length === 0 ? (
        <EmptyState
          onAdd={() =>
            setSheetRequest({
              mode: "create",
              level: "weekly",
              periodStart,
              periodEnd,
              periodLabel: weekLabel,
            })
          }
        />
      ) : (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-1">
            {t("planSectionWeeklyPlans")}
          </h3>
          <div className="bg-card rounded-2xl shadow-soft divide-y divide-border/60">
            {items.map((item) => (
              <PlanRow
                key={item.id}
                item={item}
                progressLabel={weeklyProgressLabel(item)}
                parentTitle={
                  item.parentPlanId ? getPlanItem(item.parentPlanId)?.title : undefined
                }
                onPress={() =>
                  setSheetRequest({ mode: "edit", level: "weekly", planId: item.id })
                }
              />
            ))}
          </div>
        </div>
      )}

      <PlanFab
        onClick={() =>
          setSheetRequest({
            mode: "create",
            level: "weekly",
            periodStart,
            periodEnd,
            periodLabel: weekLabel,
          })
        }
        aria-label={t("planWeeklyAddCta")}
      />

      <PlanItemSheet
        request={sheetRequest}
        onOpenChange={(open) => !open && setSheetRequest(null)}
        onSaved={() => {
          refresh();
          setSheetRequest(null);
        }}
        onChanged={refresh}
        onBreakdown={(parent) => {
          setSheetRequest(null);
          setTaskRequest({
            mode: "create",
            parentPlanId: parent.id,
            date: defaultBreakdownDate(periodStart, periodEnd),
            repeatable: true,
          });
        }}
      />

      <DailyTaskSheet
        request={taskRequest}
        onOpenChange={(open) => !open && setTaskRequest(null)}
        onSaved={refresh}
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
        <CalendarClock className="w-5 h-5 text-muted-foreground" aria-hidden="true" />
      </div>
      <p className="text-base font-semibold mb-1">{t("planWeeklyEmptyTitle")}</p>
      <p className="text-sm text-muted-foreground mb-4">{t("planWeeklyEmptyBody")}</p>
      <button
        type="button"
        onClick={onAdd}
        className="rounded-full bg-accent text-accent-foreground px-4 py-2 text-sm font-semibold hover:opacity-90 transition-opacity"
      >
        {t("planWeeklyAddCta")}
      </button>
    </div>
  );
}
