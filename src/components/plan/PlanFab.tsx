import { Plus } from "lucide-react";
import { GlassControl } from "@/components/GlassControl";

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
    <GlassControl
      variant="prominent"
      size="prominent"
      onClick={onClick}
      aria-label={ariaLabel}
      className="fixed z-40 bottom-[calc(var(--bottom-nav-offset)+10px)] right-5"
    >
      <Plus className="w-6 h-6" strokeWidth={2.5} aria-hidden="true" />
    </GlassControl>
  );
}
