import { useState } from "react";
import { Check, X, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { resetViewportZoom } from "@/lib/viewport-zoom";
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

  const handleToggle = () => {
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
    resetViewportZoom();
  };

  return (
    <div className="group relative flex items-center gap-2 py-2 animate-fade-in-up">
      {/* Larger touch target for checkbox */}
      <button
        onClick={handleToggle}
        aria-label={task.completed ? "Mark incomplete" : "Mark complete"}
        className="flex-shrink-0 w-11 h-11 flex items-center justify-center -ml-1"
      >
        <span
          className={cn(
            "w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all duration-300",
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
          onBlur={commitEdit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitEdit();
            if (e.key === "Escape") {
              setDraft(task.text);
              setEditing(false);
              resetViewportZoom();
            }
          }}
          className="flex-1 text-[15px] bg-transparent outline-none border-b border-accent/40 py-1"
        />
      ) : (
        <button
          onClick={() => {
            if (!task.completed) {
              setDraft(task.text);
              setEditing(true);
            }
          }}
          className="flex-1 text-left min-w-0"
        >
          <span
            className={cn(
              "text-[15px] transition-all duration-300 block truncate",
              task.completed && "line-through text-muted-foreground/50"
            )}
          >
            {task.text}
          </span>
        </button>
      )}

      {showFeedback && (
        <span className="absolute left-10 -top-1 text-accent text-xs font-bold animate-float-up flex items-center gap-0.5 pointer-events-none">
          <Sparkles className="w-3 h-3" /> +1
        </span>
      )}

      <button
        onClick={() => onDelete(task.id)}
        className="opacity-0 group-hover:opacity-100 group-active:opacity-100 transition-opacity p-2 -mr-1 text-muted-foreground hover:text-destructive"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
