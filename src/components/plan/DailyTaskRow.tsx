import { PlanIconGlyph } from "@/components/plan/plan-icon-registry";
import { getThemeAccentOption, type ThemeAccentId } from "@/lib/theme-accent";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { TaskItem } from "@/lib/v3/types";

interface Props {
  task: TaskItem;
  parentTitle?: string;
  onPress: () => void;
  onToggleComplete: () => void;
}

/**
 * Daily Log row: a Bullet-Journal-style marker for completion, then a
 * subtle icon tint and title. Not a saturated task card.
 */
export function DailyTaskRow({ task, parentTitle, onPress, onToggleComplete }: Props) {
  const { t } = useI18n();
  const accent = getThemeAccentOption(task.color as ThemeAccentId);
  const completed = task.status === "completed";
  const timeLabel = task.allDay
    ? undefined
    : task.startTime && task.endTime
      ? `${task.startTime}–${task.endTime}`
      : task.startTime;

  return (
    <div className="flex items-start gap-2 px-3 py-2.5">
      <button
        type="button"
        onClick={onToggleComplete}
        aria-label={completed ? t("planCompleted") : t("planComplete")}
        aria-pressed={completed}
        className="w-8 h-8 shrink-0 flex items-center justify-center text-muted-foreground"
      >
        <span
          className={cn(
            "text-base leading-none",
            completed ? "text-accent" : "text-foreground/70",
          )}
          aria-hidden="true"
        >
          {completed ? "✓" : "•"}
        </span>
      </button>

      <button type="button" onClick={onPress} className="flex-1 min-w-0 flex items-start gap-3 text-left">
        <span
          className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5"
          style={{
            backgroundColor: `hsl(${accent.accent} / 0.16)`,
            color: `hsl(${accent.accent})`,
          }}
        >
          <PlanIconGlyph iconId={task.icon} />
        </span>
        <span className="flex-1 min-w-0">
          <span
            className={cn(
              "block text-base font-medium truncate",
              completed && "line-through text-muted-foreground",
            )}
          >
            {task.title}
          </span>
          {timeLabel && (
            <span className="block text-xs text-muted-foreground mt-0.5">{timeLabel}</span>
          )}
          {parentTitle && (
            <span className="block text-xs text-muted-foreground mt-0.5">
              {t("planParentPrefix")}: {parentTitle}
            </span>
          )}
        </span>
      </button>
    </div>
  );
}
