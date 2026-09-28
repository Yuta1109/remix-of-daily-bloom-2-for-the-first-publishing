import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { isTutorialBlockingCalendarChrome } from "@/lib/tutorial";
import { GlassControl } from "@/components/GlassControl";

interface Props {
  onClick: () => void;
  "aria-label"?: string;
  className?: string;
  disabled?: boolean;
}

export function FabButton({
  onClick,
  "aria-label": ariaLabel,
  className,
  disabled = false,
}: Props) {
  return (
    <GlassControl
      variant="prominent"
      size="prominent"
      nativeGlass={{ role: "icon", symbol: "plus" }}
      data-tutorial="calendar-fab"
      onClick={(e) => {
        if (disabled || isTutorialBlockingCalendarChrome()) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        onClick();
      }}
      disabled={disabled}
      aria-disabled={disabled || undefined}
      aria-label={ariaLabel}
      className={cn(
        "fixed z-40 bottom-[calc(var(--bottom-nav-offset)+10px)] right-5",
        className,
      )}
    >
      <Plus className="w-6 h-6" strokeWidth={2.5} />
    </GlassControl>
  );
}
