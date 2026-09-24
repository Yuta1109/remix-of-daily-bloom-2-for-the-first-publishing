import { useI18n, type TranslationKeys } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { PlanLevel } from "@/lib/v3/types";

export type PlanUiLevel = PlanLevel | "daily";

interface Props {
  value: PlanUiLevel;
  onChange: (level: PlanUiLevel) => void;
  /** Hides Weekly when `settings.weeklyPlanningEnabled` is off — data stays intact either way. */
  showWeekly: boolean;
}

const SEGMENTS: { level: PlanUiLevel; labelKey: TranslationKeys }[] = [
  { level: "future", labelKey: "planFuture" },
  { level: "monthly", labelKey: "planMonthly" },
  { level: "weekly", labelKey: "planWeekly" },
  { level: "daily", labelKey: "planDaily" },
];

/**
 * Compact iOS-style segmented control — visually subordinate to the page
 * title, not a second bottom navigation bar.
 */
export function PlanLevelBar({ value, onChange, showWeekly }: Props) {
  const { t } = useI18n();
  const segments = SEGMENTS.filter((s) => showWeekly || s.level !== "weekly");

  return (
    <div
      role="tablist"
      aria-label={t("planPageTitle")}
      className="flex items-center gap-0.5 bg-secondary/60 rounded-xl p-0.5"
    >
      {segments.map((segment) => {
        const active = segment.level === value;
        return (
          <button
            key={segment.level}
            type="button"
            role="tab"
            aria-selected={active}
            data-tutorial={segment.level === "monthly" ? "plan-level-monthly" : undefined}
            onClick={() => onChange(segment.level)}
            className={cn(
              "flex-1 rounded-[10px] px-2 py-1.5 text-[13px] font-medium transition-colors motion-reduce:transition-none",
              active
                ? "bg-card text-foreground shadow-soft"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t(segment.labelKey)}
          </button>
        );
      })}
    </div>
  );
}
