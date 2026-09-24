import { useMemo, useState } from "react";
import { CalendarRange } from "lucide-react";
import { useI18n, type TranslationKeys } from "@/lib/i18n";
import { PlanFab } from "@/components/plan/PlanFab";
import { PlanRow } from "@/components/plan/PlanRow";
import { PeriodNav } from "@/components/plan/PeriodNav";
import { PlanItemSheet, type PlanSheetRequest } from "@/components/plan/PlanItemSheet";
import {
  getPlanItem,
  getPlanItemsForPeriod,
  getPlanProgress,
  getSettings,
} from "@/lib/v3/repository";
import {
  addMonths,
  localMonthEnd,
  localMonthStart,
  todayLocalDate,
  toLocalMonth,
  weeksOverlappingMonth,
} from "@/lib/v3/local-date";
import type { PlanItem } from "@/lib/v3/types";

function progressLabel(item: PlanItem, t: (key: TranslationKeys) => string): string {
  const { total, completed } = getPlanProgress(item.id);
  return `${completed} / ${total} ${t("planMilestones")}`;
}

export function MonthlySection() {
  const { t, locale } = useI18n();
  const [monthAnchor, setMonthAnchor] = useState(() => toLocalMonth(todayLocalDate()));
  const [refreshTick, setRefreshTick] = useState(0);
  const [sheetRequest, setSheetRequest] = useState<PlanSheetRequest | null>(null);

  const periodStart = useMemo(() => localMonthStart(monthAnchor), [monthAnchor]);
  const periodEnd = useMemo(() => localMonthEnd(monthAnchor), [monthAnchor]);
  const monthLabel = useMemo(
    () =>
      new Date(`${periodStart}T00:00:00`).toLocaleDateString(locale === "ja" ? "ja-JP" : "en-US", {
        year: "numeric",
        month: "long",
      }),
    [periodStart, locale],
  );

  const items = useMemo(
    () => getPlanItemsForPeriod("monthly", periodStart, periodEnd),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [periodStart, periodEnd, refreshTick],
  );

  const refresh = () => setRefreshTick((v) => v + 1);

  return (
    <>
      <PeriodNav
        label={monthLabel}
        onPrev={() => setMonthAnchor((m) => toLocalMonth(addMonths(localMonthStart(m), -1)))}
        onNext={() => setMonthAnchor((m) => toLocalMonth(addMonths(localMonthStart(m), 1)))}
        className="mb-3"
      />

      {items.length === 0 ? (
        <EmptyState
          onAdd={() =>
            setSheetRequest({
              mode: "create",
              level: "monthly",
              periodStart,
              periodEnd,
              periodLabel: monthLabel,
            })
          }
        />
      ) : (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-1">
            {t("planSectionPlans")}
          </h3>
          <div className="bg-card rounded-2xl shadow-soft divide-y divide-border/60">
            {items.map((item) => (
              <PlanRow
                key={item.id}
                item={item}
                progressLabel={progressLabel(item, t)}
                parentTitle={
                  item.parentPlanId ? getPlanItem(item.parentPlanId)?.title : undefined
                }
                onPress={() =>
                  setSheetRequest({ mode: "edit", level: "monthly", planId: item.id })
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
            level: "monthly",
            periodStart,
            periodEnd,
            periodLabel: monthLabel,
          })
        }
        aria-label={t("planMonthlyAddCta")}
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
          const parentMonth = parent.periodStart ? toLocalMonth(parent.periodStart) : monthAnchor;
          const weekStartsOn = getSettings().weekStartsOn;
          const weekChoices = weeksOverlappingMonth(localMonthStart(parentMonth), weekStartsOn);
          setSheetRequest({
            mode: "create",
            level: "weekly",
            parentPlanId: parent.id,
            weekChoices,
          });
        }}
      />
    </>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6">
      <div className="w-12 h-12 rounded-full bg-secondary/70 flex items-center justify-center mb-3">
        <CalendarRange className="w-5 h-5 text-muted-foreground" aria-hidden="true" />
      </div>
      <p className="text-base font-semibold mb-1">{t("planMonthlyEmptyTitle")}</p>
      <p className="text-sm text-muted-foreground mb-4">{t("planMonthlyEmptyBody")}</p>
      <button
        type="button"
        onClick={onAdd}
        className="rounded-full bg-accent text-accent-foreground px-4 py-2 text-sm font-semibold hover:opacity-90 transition-opacity"
      >
        {t("planMonthlyAddCta")}
      </button>
    </div>
  );
}
