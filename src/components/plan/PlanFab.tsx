import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  onClick: () => void;
  "aria-label": string;
}

/**
 * Plan's own floating add button.
 *
 * `FabButton` (used by Calendar) is hardcoded to the calendar coach-tour
 * (`data-tutorial="calendar-fab"` + tutorial gating), so it is left untouched
 * and this small App-Shell-compatible sibling is used instead — same visual
 * language, no unrelated coupling.
 */
export function PlanFab({ onClick, "aria-label": ariaLabel }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={cn(
        "fixed z-40 w-14 h-14 rounded-full bg-accent text-accent-foreground shadow-float",
        "flex items-center justify-center transition-transform motion-reduce:transition-none",
        "hover:scale-105 active:scale-95",
        "bottom-[calc(var(--bottom-nav-offset)+10px)] right-5",
      )}
    >
      <Plus className="w-6 h-6" strokeWidth={2.5} aria-hidden="true" />
    </button>
  );
}
