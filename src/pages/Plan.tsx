import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { UserButton } from "@/components/UserButton";
import { PlanLevelBar, type PlanUiLevel } from "@/components/plan/PlanLevelBar";
import { FutureSection } from "@/components/plan/FutureSection";
import { MonthlySection } from "@/components/plan/MonthlySection";
import { WeeklySection } from "@/components/plan/WeeklySection";
import { DailySection } from "@/components/plan/DailySection";
import { useI18n } from "@/lib/i18n";
import { Inbox } from "lucide-react";
import { getPostponeBoxItems, getReflectionAttentionCount, getSettings } from "@/lib/v3/repository";

/**
 * Top-level Plan tab.
 *
 * Future / Monthly / Weekly / Daily all live here. Daily actions are V3
 * TaskItems — not another PlanItem level.
 */
export default function Plan() {
  const { t } = useI18n();
  const navigate = useNavigate();
  // Weekly stays in storage regardless of this flag. Hiding the tab must
  // never delete Weekly items.
  const showWeekly = getSettings().weeklyPlanningEnabled;
  const [level, setLevel] = useState<PlanUiLevel>("future");
  const displayLevel: PlanUiLevel =
    !showWeekly && level === "weekly" ? "monthly" : level;

  useEffect(() => {
    if (document.documentElement.dataset.tutorialStep === "planMonthly") {
      setLevel("monthly");
    }
  }, []);

  const attentionCount = useMemo(() => getReflectionAttentionCount(), []);
  const postponeCount = useMemo(() => {
    const box = getPostponeBoxItems();
    return box.tasks.length + box.plans.length;
  }, []);

  return (
    <div className="app-shell-page">
      <div className="app-shell-header px-4 pb-3">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h1 className="text-[28px] font-bold tracking-tight leading-tight">
            {t("planPageTitle")}
          </h1>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => navigate("/plan/postpone-box")}
              aria-label={t("postponeBox")}
              data-testid="postpone-box-entry"
              className="relative inline-flex items-center justify-center w-9 h-9 rounded-xl text-accent bg-accent/10"
            >
              <Inbox className="w-5 h-5" strokeWidth={1.8} aria-hidden="true" />
              {postponeCount > 0 ? (
                <span
                  aria-hidden="true"
                  className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-foreground text-background text-[10px] font-bold leading-4 text-center"
                >
                  {postponeCount > 9 ? "9+" : postponeCount}
                </span>
              ) : null}
            </button>
            <button
              type="button"
              onClick={() => navigate("/plan/reflection")}
              aria-label={
                attentionCount > 0
                  ? `${t("reflectionEntry")} · ${attentionCount > 9 ? "9+" : attentionCount}`
                  : t("reflectionEntry")
              }
              className="relative text-sm font-semibold text-accent px-3 py-2 rounded-xl bg-accent/10"
            >
              {t("reflectionEntry")}
              {attentionCount > 0 ? (
                <span
                  aria-hidden="true"
                  className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-foreground text-background text-[10px] font-bold leading-4 text-center"
                >
                  {attentionCount > 9 ? "9+" : attentionCount}
                </span>
              ) : null}
            </button>
            <UserButton />
          </div>
        </div>
        <PlanLevelBar
          value={displayLevel}
          onChange={setLevel}
          showWeekly={showWeekly}
        />
      </div>

      <div className="app-shell-scroll px-4">
        {displayLevel === "future" && <FutureSection />}
        {displayLevel === "monthly" && <MonthlySection />}
        {displayLevel === "weekly" && showWeekly && <WeeklySection />}
        {displayLevel === "daily" && <DailySection />}
        <div className="h-20" aria-hidden="true" />
      </div>
    </div>
  );
}
