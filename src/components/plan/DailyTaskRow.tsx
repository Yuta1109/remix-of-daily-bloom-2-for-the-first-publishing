import { PlanIconGlyph } from "@/components/plan/plan-icon-registry";
import { TaskCompletionControl } from "@/components/TaskCompletionControl";
import { getThemeAccentOption, type ThemeAccentId } from "@/lib/theme-accent";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { TaskItem } from "@/lib/v3/types";

interface Props {
  task: TaskItem;
  parentTitle?: string;
  onPress: () => void;
  onToggleComplete: () => void;
  disabled?: boolean;
  /** Past days keep the row open, but completion cannot be changed. */
  completionDisabled?: boolean;
  nested?: boolean;
  onAddChild?: () => void;
}

/**
 * Daily Log row. Completion is the shared color circle on the right.
 */
export function DailyTaskRow({
  task,
  parentTitle,
  onPress,
  onToggleComplete,
  disabled = false,
  completionDisabled = false,
  nested = false,
  onAddChild,
}: Props) {
  const { t } = useI18n();
  const accent = getThemeAccentOption(task.color as ThemeAccentId);
  const completed = task.status === "completed";
  const timeLabel = task.allDay
    ? undefined
    : task.startTime && task.endTime
      ? `${task.startTime}–${task.endTime}`
      : task.startTime;

  return (
    <div className={cn("flex items-start gap-2 px-3 py-2.5", nested && "pl-8")} data-testid={nested ? "daily-child-task" : "daily-task"}>
      <button
        type="button"
        onClick={onPress}
        disabled={disabled}
        className="flex-1 min-w-0 flex items-start gap-3 text-left disabled:opacity-60"
      >
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
      {onAddChild ? (
        <button type="button" onClick={onAddChild} className="shrink-0 pt-2 text-xs font-medium text-accent">
          {t("dailyChildAdd")}
        </button>
      ) : null}
      <TaskCompletionControl
        completed={completed}
        color={`hsl(${accent.accent})`}
        label={completed ? t("planCompleted") : t("planComplete")}
        onToggle={onToggleComplete}
        disabled={disabled || completionDisabled}
      />
    </div>
  );
}
