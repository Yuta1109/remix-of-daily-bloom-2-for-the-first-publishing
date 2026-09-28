import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { GlassControl } from "@/components/GlassControl";
import { PlanningShell } from "@/components/plan/PlanningHeader";
import { PlanLevelBar, type PlanUiLevel } from "@/components/plan/PlanLevelBar";
import { FutureSection } from "@/components/plan/FutureSection";
import { MonthlySection } from "@/components/plan/MonthlySection";
import { WeeklySection } from "@/components/plan/WeeklySection";
import { DailySection } from "@/components/plan/DailySection";
import { useI18n } from "@/lib/i18n";
import { Inbox } from "lucide-react";
import { getPostponeBoxItems, getSettings } from "@/lib/v3/repository";
import { useSessionView } from "@/hooks/use-session-view";
import { PLANNING_VIEW } from "@/lib/session-nav";

/**
 * Do — the current Plan lists.
 *
 * Future / Monthly / Weekly / Daily stay here. Daily actions are V3
 * TaskItems — not another PlanItem level. The cycle above this page
 * reaches Plan, Reflection, and Replan.
 */
export default function Plan() {
  const { t } = useI18n();
  const navigate = useNavigate();
  // Weekly stays in storage regardless of this flag. Hiding the tab must
  // never delete Weekly items.
  const showWeekly = getSettings().weeklyPlanningEnabled;
  const [level, setLevel] = useSessionView<PlanUiLevel>("planning", PLANNING_VIEW.doLevel, "future");
  const displayLevel: PlanUiLevel =
    !showWeekly && level === "weekly" ? "monthly" : level;

  useEffect(() => {
    if (document.documentElement.dataset.tutorialStep === "planMonthly") {
      setLevel("monthly");
    }
  }, [setLevel]);

  const postponeCount = useMemo(() => {
    const box = getPostponeBoxItems();
    return box.tasks.length + box.plans.length;
  }, []);

  return (
    <PlanningShell
      current="do"
      trailing={
        <GlassControl
          nativeGlass={{ role: "icon", symbol: "tray" }}
          onClick={() => navigate("/plan/postpone-box")}
          aria-label={t("postponeBox")}
          data-testid="postpone-box-entry"
          className="text-accent"
        >
          <Inbox className="w-5 h-5" strokeWidth={1.8} aria-hidden="true" />
          {postponeCount > 0 ? (
            <span
              aria-hidden="true"
              data-native-glass-badge=""
              className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-foreground text-background text-[10px] font-bold leading-4 text-center"
            >
              {postponeCount > 9 ? "9+" : postponeCount}
            </span>
          ) : null}
        </GlassControl>
      }
    >
      <div className="pb-3">
        <PlanLevelBar
          value={displayLevel}
          onChange={setLevel}
          showWeekly={showWeekly}
        />
      </div>
      {displayLevel === "future" && <FutureSection />}
      {displayLevel === "monthly" && <MonthlySection />}
      {displayLevel === "weekly" && showWeekly && <WeeklySection />}
      {displayLevel === "daily" && <DailySection />}
    </PlanningShell>
  );
}
