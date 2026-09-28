import { PlanIconGlyph } from "@/components/plan/plan-icon-registry";
import { TaskCompletionControl } from "@/components/TaskCompletionControl";
import { getThemeAccentOption, type ThemeAccentId } from "@/lib/theme-accent";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { TaskItem } from "@/lib/v3/types";

/** Circle and target read as completion marks. ToDo shows a separate control. */
function taskIconId(iconId: string): string {
  if (iconId === "circle" || iconId === "target") return "flag";
  return iconId;
}

interface Props {
  task: TaskItem;
  onToggle: () => void;
  onPress: () => void;
  nested?: boolean;
  onAddChild?: () => void;
}

/**
 * Actionable TaskItem row. Completion sits on the right as the shared color circle.
 * Occurrences of a TaskSeries render identically — identification lives in the editor.
 */
export function TodoTaskRow({ task, onToggle, onPress, nested = false, onAddChild }: Props) {
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
      className={cn(
        "flex items-center gap-2 px-1 py-2 border-b border-border/40 last:border-b-0",
        nested && "pl-6",
      )}
      data-tutorial="task-item"
      data-testid={nested ? "todo-child-task" : "todo-task"}
    >
      <button type="button" onClick={onPress} className="flex-1 min-w-0 flex items-center gap-3 text-left">
        <span
          className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
          style={{
            backgroundColor: `hsl(${accent.accent} / 0.16)`,
            color: `hsl(${accent.accent})`,
          }}
        >
          <PlanIconGlyph iconId={taskIconId(task.icon)} />
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
      {onAddChild ? (
        <button type="button" onClick={onAddChild} className="shrink-0 text-xs font-medium text-accent">
          {t("dailyChildAdd")}
        </button>
      ) : null}
      <TaskCompletionControl
        completed={completed}
        color={`hsl(${accent.accent})`}
        label={completed ? t("planCompleted") : t("planComplete")}
        onToggle={onToggle}
      />
    </div>
  );
}
