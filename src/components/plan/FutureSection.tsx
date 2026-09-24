import { useMemo, useState } from "react";
import { Target } from "lucide-react";
import { useI18n, type TranslationKeys } from "@/lib/i18n";
import { PlanFab } from "@/components/plan/PlanFab";
import { PlanRow } from "@/components/plan/PlanRow";
import { PlanItemSheet, type PlanSheetRequest } from "@/components/plan/PlanItemSheet";
import { getPlanItems, getPlanProgress } from "@/lib/v3/repository";
import { isListedPlanStatus } from "@/lib/v3/plan-rules";
import { localMonthEnd, localMonthStart, todayLocalDate, toLocalMonth } from "@/lib/v3/local-date";
import type { PlanItem } from "@/lib/v3/types";

const SOMEDAY_KEY = "someday";

function futureGroupKey(item: PlanItem): string {
  const target = item.futureTarget;
  if (!target || target.type === "someday" || !target.value) return SOMEDAY_KEY;
  return target.type === "month" ? target.value : toLocalMonth(target.value);
}

/** Best-guess target month for a Breakdown → Monthly default, from Future's own target. */
function monthAnchorFor(item: PlanItem): string {
  if (item.futureTarget?.type === "month" && item.futureTarget.value) return item.futureTarget.value;
  if (item.futureTarget?.type === "date" && item.futureTarget.value) {
    return toLocalMonth(item.futureTarget.value);
  }
  return toLocalMonth(todayLocalDate());
}

function formatMonthHeading(monthKey: string, locale: "en" | "ja"): string {
  const date = localMonthStart(monthKey);
  return new Date(`${date}T00:00:00`).toLocaleDateString(locale === "ja" ? "ja-JP" : "en-US", {
    year: "numeric",
    month: "long",
  });
}

export function FutureSection() {
  const { t, locale } = useI18n();
  const [refreshTick, setRefreshTick] = useState(0);
  const [sheetRequest, setSheetRequest] = useState<PlanSheetRequest | null>(null);

  const items = useMemo(
    () =>
      getPlanItems({ level: "future" }).filter((p) => isListedPlanStatus(p.status)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [refreshTick],
  );

  const groups = useMemo(() => {
    const map = new Map<string, PlanItem[]>();
    for (const item of items) {
      const key = futureGroupKey(item);
      const bucket = map.get(key) ?? [];
      bucket.push(item);
      map.set(key, bucket);
    }
    const keys = Array.from(map.keys())
      .filter((k) => k !== SOMEDAY_KEY)
      .sort();
    if (map.has(SOMEDAY_KEY)) keys.push(SOMEDAY_KEY);
    return keys.map((key) => ({ key, items: map.get(key) as PlanItem[] }));
  }, [items]);

  const refresh = () => setRefreshTick((v) => v + 1);

  const childCountLabel = (item: PlanItem, tt: (key: TranslationKeys) => string) =>
    `${getPlanProgress(item.id).total} ${tt("planMilestones")}`;

  return (
    <>
      {items.length === 0 ? (
        <EmptyState onAdd={() => setSheetRequest({ mode: "create", level: "future" })} />
      ) : (
        <div className="space-y-5">
          {groups.map((group) => (
            <div key={group.key}>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-1">
                {group.key === SOMEDAY_KEY
                  ? t("planSomeday")
                  : formatMonthHeading(group.key, locale)}
              </h3>
              <div className="bg-card rounded-2xl shadow-soft divide-y divide-border/60">
                {group.items.map((item) => (
                  <PlanRow
                    key={item.id}
                    item={item}
                    progressLabel={childCountLabel(item, t)}
                    onPress={() =>
                      setSheetRequest({ mode: "edit", level: "future", planId: item.id })
                    }
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <PlanFab
        onClick={() => setSheetRequest({ mode: "create", level: "future" })}
        aria-label={t("planFutureAddCta")}
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
          const month = monthAnchorFor(parent);
          const periodStart = localMonthStart(month);
          const periodEnd = localMonthEnd(month);
          setSheetRequest({
            mode: "create",
            level: "monthly",
            parentPlanId: parent.id,
            periodStart,
            periodEnd,
            periodLabel: formatMonthHeading(month, locale),
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
        <Target className="w-5 h-5 text-muted-foreground" aria-hidden="true" />
      </div>
      <p className="text-base font-semibold mb-1">{t("planFutureEmptyTitle")}</p>
      <p className="text-sm text-muted-foreground mb-4">{t("planFutureEmptyBody")}</p>
      <button
        type="button"
        onClick={onAdd}
        className="rounded-full bg-accent text-accent-foreground px-4 py-2 text-sm font-semibold hover:opacity-90 transition-opacity"
      >
        {t("planFutureAddCta")}
      </button>
    </div>
  );
}
