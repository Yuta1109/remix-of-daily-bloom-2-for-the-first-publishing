import { useState, type MouseEvent } from "react";
import { Check, X, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { hideKeyboard, scrollInputAboveKeyboard } from "@/lib/keyboard-avoidance";
import { emitTutorial, isTutorialActive } from "@/lib/tutorial";
import type { Task } from "@/lib/store";

interface TaskItemProps {
  task: Task;
  selected: boolean;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (id: string, text: string) => void;
}

export function TaskItem({
  task,
  selected,
  onSelect,
  onToggle,
  onDelete,
  onEdit,
}: TaskItemProps) {
  const [popping, setPopping] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.text);

  const handleToggle = (e: MouseEvent) => {
    e.stopPropagation();
    if (!selected) {
      onSelect(task.id);
      return;
    }
    if (!task.completed) {
      setPopping(true);
      setShowFeedback(true);
      setTimeout(() => setShowFeedback(false), 1200);
    }
    onToggle(task.id);
    if (isTutorialActive()) emitTutorial("task-toggled", { id: task.id });
    setTimeout(() => setPopping(false), 300);
  };

  const commitEdit = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== task.text) onEdit(task.id, trimmed);
    else setDraft(task.text);
    setEditing(false);
    void hideKeyboard();
  };

  return (
    <div
      role="button"
      tabIndex={0}
      data-tutorial="task-item"
      onClick={() => {
        if (!selected) onSelect(task.id);
      }}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && !selected) {
          e.preventDefault();
          onSelect(task.id);
        }
      }}
      className={cn(
        "relative rounded-xl px-3 py-2.5 transition-colors touch-manipulation select-none",
        selected
          ? "bg-accent/10 ring-1 ring-accent/30"
          : "bg-secondary/50",
        task.completed && !selected && "opacity-80"
      )}
    >
      <div className="flex items-center gap-1.5 min-h-[40px]">
        <button
          type="button"
          data-tutorial="task-checkbox"
          onClick={handleToggle}
          aria-label={task.completed ? "Mark incomplete" : "Mark complete"}
          className="flex-shrink-0 w-10 h-10 flex items-center justify-center touch-manipulation"
        >
          <span
            className={cn(
              "w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all duration-300 pointer-events-none",
              task.completed
                ? "bg-accent border-accent"
                : "border-muted-foreground/25",
              popping && "animate-check-pop"
            )}
          >
            {task.completed && (
              <Check className="w-3.5 h-3.5 text-accent-foreground" strokeWidth={3} />
            )}
          </span>
        </button>

        {editing && selected ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onFocus={(e) => scrollInputAboveKeyboard(e.currentTarget)}
            onClick={(e) => e.stopPropagation()}
            onBlur={commitEdit}
            enterKeyHint="done"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitEdit();
              }
              if (e.key === "Escape") {
                setDraft(task.text);
                setEditing(false);
                void hideKeyboard();
              }
            }}
            className="flex-1 min-w-0 text-base bg-transparent outline-none py-1.5"
          />
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (!selected) {
                onSelect(task.id);
                return;
              }
              if (!task.completed) {
                setDraft(task.text);
                setEditing(true);
              }
            }}
            className="flex-1 min-w-0 min-h-9 py-1 text-left touch-manipulation"
          >
            <span
              className={cn(
                "text-base transition-all duration-300 block truncate",
                task.completed && "line-through text-muted-foreground/50"
              )}
            >
              {task.text}
            </span>
          </button>
        )}

        {selected && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(task.id);
            }}
            className="flex-shrink-0 p-2 text-muted-foreground hover:text-destructive touch-manipulation"
            aria-label="Delete"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {showFeedback && (
        <span className="absolute left-11 top-0 text-accent text-xs font-bold animate-float-up flex items-center gap-0.5 pointer-events-none">
          <Sparkles className="w-3 h-3" /> +1
        </span>
      )}
    </div>
  );
}
