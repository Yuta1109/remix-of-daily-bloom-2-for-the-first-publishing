import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  onClick: () => void;
  "aria-label"?: string;
  className?: string;
}

export function FabButton({ onClick, "aria-label": ariaLabel, className }: Props) {
  return (
    <button
      onClick={onClick}
      aria-label={ariaLabel}
      className={cn(
        "fixed z-40 w-14 h-14 rounded-full bg-accent text-accent-foreground shadow-float",
        "flex items-center justify-center transition-all hover:scale-110 active:scale-95",
        "bottom-[calc(var(--bottom-nav-offset)+10px)] right-5",
        className
      )}
    >
      <Plus className="w-6 h-6" strokeWidth={2.5} />
    </button>
  );
}
