import { useState } from "react";
import { Check, X, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Task } from "@/lib/store";

interface TaskItemProps {
  task: Task;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}

export function TaskItem({ task, onToggle, onDelete }: TaskItemProps) {
  const [popping, setPopping] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);

  const handleToggle = () => {
    if (!task.completed) {
      setPopping(true);
      setShowFeedback(true);
      setTimeout(() => setShowFeedback(false), 1200);
    }
    onToggle(task.id);
    setTimeout(() => setPopping(false), 300);
  };

  return (
    <div className="group relative flex items-center gap-3 py-3.5 px-1 animate-fade-in-up">
      <button
        onClick={handleToggle}
        className={cn(
          "flex-shrink-0 w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all duration-300",
          task.completed
            ? "bg-accent border-accent scale-100"
            : "border-muted-foreground/25 hover:border-accent/60 hover:scale-110",
          popping && "animate-check-pop"
        )}
      >
        {task.completed && <Check className="w-3.5 h-3.5 text-accent-foreground" strokeWidth={3} />}
      </button>
      <span
        className={cn(
          "flex-1 text-[15px] transition-all duration-300",
          task.completed && "line-through text-muted-foreground/50"
        )}
      >
        {task.text}
      </span>

      {/* +1 feedback */}
      {showFeedback && (
        <span className="absolute left-10 -top-1 text-accent text-xs font-bold animate-float-up flex items-center gap-0.5">
          <Sparkles className="w-3 h-3" /> +1
        </span>
      )}

      <button
        onClick={() => onDelete(task.id)}
        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-muted-foreground hover:text-destructive"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
