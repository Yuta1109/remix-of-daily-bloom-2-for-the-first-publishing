import { useState, type MouseEvent } from "react";
import { Check, X, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { scrollInputAboveKeyboard } from "@/lib/keyboard-avoidance";
import type { Task } from "@/lib/store";

interface TaskItemProps {
  task: Task;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (id: string, text: string) => void;
}

export function TaskItem({ task, onToggle, onDelete, onEdit }: TaskItemProps) {
  const [popping, setPopping] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.text);

  const handleToggle = (e: MouseEvent) => {
    e.stopPropagation();
    if (!task.completed) {
      setPopping(true);
      setShowFeedback(true);
      setTimeout(() => setShowFeedback(false), 1200);
    }
    onToggle(task.id);
    setTimeout(() => setPopping(false), 300);
  };

  const commitEdit = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== task.text) onEdit(task.id, trimmed);
    else setDraft(task.text);
    setEditing(false);
  };

  return (
    <div
      className={cn(
        "group relative flex items-center gap-1 min-h-[52px] isolate",
        editing && "z-20"
      )}
    >
      <button
        type="button"
        onClick={handleToggle}
        aria-label={task.completed ? "Mark incomplete" : "Mark complete"}
        className="flex-shrink-0 w-12 h-12 flex items-center justify-center touch-manipulation"
      >
        <span
          className={cn(
            "w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all duration-300 pointer-events-none",
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

      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={(e) => scrollInputAboveKeyboard(e.currentTarget)}
          onBlur={commitEdit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitEdit();
            if (e.key === "Escape") {
              setDraft(task.text);
              setEditing(false);
            }
          }}
          className="flex-1 min-w-0 text-base bg-transparent outline-none border-b border-accent/40 py-2 relative z-10"
        />
      ) : (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (!task.completed) {
              setDraft(task.text);
              setEditing(true);
            }
          }}
          className="flex-1 min-w-0 min-h-11 py-2 px-1 text-left touch-manipulation relative z-10"
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

      {showFeedback && (
        <span className="absolute left-11 -top-1 text-accent text-xs font-bold animate-float-up flex items-center gap-0.5 pointer-events-none">
          <Sparkles className="w-3 h-3" /> +1
        </span>
      )}

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDelete(task.id);
        }}
        className="flex-shrink-0 opacity-0 group-hover:opacity-100 group-active:opacity-100 transition-opacity p-2 text-muted-foreground hover:text-destructive touch-manipulation"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
