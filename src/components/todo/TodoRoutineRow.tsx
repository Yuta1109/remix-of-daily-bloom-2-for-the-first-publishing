import { PlanIconGlyph } from "@/components/plan/plan-icon-registry";
import { getThemeAccentOption, type ThemeAccentId } from "@/lib/theme-accent";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { RoutineItem } from "@/lib/v3/types";

interface Props {
  routine: RoutineItem;
  completed: boolean;
  onToggle: () => void;
  onEdit: () => void;
}

/**
 * Habit row. Circle marker (○ / ✓) so Routine never looks like a Task □.
 * Completion is today's RoutineCompletion — not a boolean on RoutineItem.
 */
export function TodoRoutineRow({ routine, completed, onToggle, onEdit }: Props) {
  const { t } = useI18n();
  const accent = getThemeAccentOption(routine.color as ThemeAccentId);
  const timeLabel = routine.defaultTime;

  return (
    <div className="flex items-center gap-2 px-1 py-2 border-b border-border/40 last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        aria-label={completed ? t("planCompleted") : t("todoRoutineMarkComplete")}
        aria-pressed={completed}
        className="w-8 h-8 shrink-0 flex items-center justify-center"
      >
        <span
          className={cn(
            "inline-flex w-5 h-5 items-center justify-center rounded-full border text-[11px] leading-none",
            completed
              ? "border-accent bg-accent text-accent-foreground"
              : "border-foreground/35 text-transparent",
          )}
          aria-hidden="true"
        >
          {completed ? "✓" : "○"}
        </span>
      </button>

      <button type="button" onClick={onEdit} className="flex-1 min-w-0 flex items-center gap-3 text-left">
        <span
          className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
          style={{
            backgroundColor: `hsl(${accent.accent} / 0.16)`,
            color: `hsl(${accent.accent})`,
          }}
        >
          <PlanIconGlyph iconId={routine.icon} />
        </span>
        <span className="flex-1 min-w-0">
          <span
            className={cn(
              "block text-[17px] leading-snug truncate",
              completed && "text-muted-foreground",
            )}
          >
            {routine.title}
          </span>
          {timeLabel ? (
            <span className="block text-xs text-muted-foreground mt-0.5">{timeLabel}</span>
          ) : null}
        </span>
      </button>
    </div>
  );
}
