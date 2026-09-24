import { PlanIconGlyph } from "@/components/plan/plan-icon-registry";
import { getThemeAccentOption, type ThemeAccentId } from "@/lib/theme-accent";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { TaskItem } from "@/lib/v3/types";

interface Props {
  task: TaskItem;
  onToggle: () => void;
  onPress: () => void;
}

/**
 * Actionable TaskItem row. Square marker (□ / ✓) so it never mimics Routine ○.
 * Occurrences of a TaskSeries render identically — identification lives in the editor.
 */
export function TodoTaskRow({ task, onToggle, onPress }: Props) {
  const { t } = useI18n();
  const accent = getThemeAccentOption(task.color as ThemeAccentId);
  const completed = task.status === "completed";
  const timeLabel = task.allDay
    ? undefined
    : task.startTime && task.endTime
      ? `${task.startTime}–${task.endTime}`
      : task.startTime;

  return (
    <div
      className="flex items-center gap-2 px-1 py-2 border-b border-border/40 last:border-b-0"
      data-tutorial="task-item"
    >
      <button
        type="button"
        onClick={onToggle}
        aria-label={completed ? t("planCompleted") : t("planComplete")}
        aria-pressed={completed}
        className="w-8 h-8 shrink-0 flex items-center justify-center"
      >
        <span
          className={cn(
            "inline-flex w-5 h-5 items-center justify-center rounded-[5px] border text-[11px] leading-none",
            completed
              ? "border-accent bg-accent text-accent-foreground"
              : "border-foreground/40 text-transparent",
          )}
          aria-hidden="true"
        >
          {completed ? "✓" : "□"}
        </span>
      </button>

      <button type="button" onClick={onPress} className="flex-1 min-w-0 flex items-center gap-3 text-left">
        <span
          className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
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
              "block text-[17px] leading-snug truncate",
              completed && "line-through text-muted-foreground",
            )}
          >
            {task.title}
          </span>
          {timeLabel ? (
            <span className="block text-xs text-muted-foreground mt-0.5">{timeLabel}</span>
          ) : null}
        </span>
      </button>
    </div>
  );
}
