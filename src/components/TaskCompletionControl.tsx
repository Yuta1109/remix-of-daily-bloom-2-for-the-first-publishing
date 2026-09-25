import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  completed: boolean;
  color: string;
  onToggle: () => void;
  label: string;
  disabled?: boolean;
}

/**
 * Shared completion control: sits on the right, unchecked is the task color
 * circle (not a square), checked shows a check. Animation does not own state.
 */
export function TaskCompletionControl({
  completed,
  color,
  onToggle,
  label,
  disabled = false,
}: Props) {
  return (
    <button
      type="button"
      data-testid="task-completion-control"
      data-completed={completed ? "true" : "false"}
      aria-label={label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        if (disabled) return;
        onToggle();
      }}
      className="ml-auto shrink-0 w-10 h-10 flex items-center justify-center disabled:opacity-60"
    >
      <span
        className={cn(
          "w-6 h-6 rounded-full flex items-center justify-center transition-transform duration-200",
          completed && "animate-check-pop",
        )}
        style={{
          background: completed ? color : "transparent",
          border: `2px solid ${color}`,
        }}
      >
        {completed ? <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} /> : null}
      </span>
    </button>
  );
}
