import { PlanIconGlyph } from "@/components/plan/plan-icon-registry";
import { getThemeAccentOption, type ThemeAccentId } from "@/lib/theme-accent";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { PlanItem } from "@/lib/v3/types";

interface Props {
  item: PlanItem;
  onPress: () => void;
  /**
   * Pre-formatted secondary line (e.g. "0 milestones" or "2 / 5 milestones").
   * Formatting is the caller's job — Future shows a plain child count, Monthly
   * shows a completed/total fraction, Weekly shows neither (see PlanRow call
   * sites in the section components).
   */
  progressLabel?: string;
  /** Parent title to show as a subtle "Parent: …" line (Weekly rows). */
  parentTitle?: string;
}

/**
 * Compact list row — Plan communicates goals and hierarchy, not a checkbox
 * task list, so this stays a single restrained row rather than a card.
 */
export function PlanRow({ item, onPress, progressLabel, parentTitle }: Props) {
  const { t } = useI18n();
  const accent = getThemeAccentOption(item.color as ThemeAccentId);

  const isInactive = item.status === "completed" || item.status === "stopped";

  return (
    <button
      type="button"
      onClick={onPress}
      className="w-full flex items-start gap-3 px-4 py-3 text-left"
    >
      <span
        className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5"
        style={{ backgroundColor: `hsl(${accent.accent} / 0.16)`, color: `hsl(${accent.accent})` }}
      >
        <PlanIconGlyph iconId={item.icon} />
      </span>
      <span className="flex-1 min-w-0">
        <span
          className={cn(
            "block text-base font-medium truncate",
            item.status === "completed" && "line-through text-muted-foreground",
          )}
        >
          {item.title}
        </span>
        {parentTitle && (
          <span className="block text-xs text-muted-foreground mt-0.5">
            {t("planParentPrefix")}: {parentTitle}
          </span>
        )}
        {progressLabel && (
          <span className="block text-xs text-muted-foreground mt-0.5">{progressLabel}</span>
        )}
        {isInactive && (
          <span className="inline-block text-[11px] font-medium text-muted-foreground/70 mt-0.5">
            {item.status === "completed" ? t("planStatusCompleted") : t("planStatusStopped")}
          </span>
        )}
      </span>
    </button>
  );
}
