import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { isTutorialBlockingCalendarChrome } from "@/lib/tutorial";

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
    <button
      type="button"
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
        "fixed z-40 w-14 h-14 rounded-full bg-accent text-accent-foreground shadow-float",
        "flex items-center justify-center transition-all hover:scale-110 active:scale-95",
        "bottom-[calc(var(--bottom-nav-offset)+10px)] right-5",
        disabled && "opacity-40 pointer-events-none",
        className
      )}
    >
      <Plus className="w-6 h-6" strokeWidth={2.5} />
    </button>
  );
}
