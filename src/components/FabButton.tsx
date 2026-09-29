import { useRef } from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { isTutorialBlockingCalendarChrome } from "@/lib/tutorial";
import { scheduleNativeGlassSync } from "@/lib/native-glass";
import { GlassControl } from "@/components/GlassControl";

interface Props {
  onClick: () => void;
  "aria-label"?: string;
  className?: string;
  disabled?: boolean;
  /** Calendar-only. Leaving the calendar unmounts this and returns the button home. */
  position?: { x: number; y: number } | null;
  onPositionChange?: (pos: { x: number; y: number }) => void;
}

const DRAG_PX = 8;

export function FabButton({
  onClick,
  "aria-label": ariaLabel,
  className,
  disabled = false,
  position = null,
  onPositionChange,
}: Props) {
  const moved = useRef(false);
  const origin = useRef({ x: 0, y: 0, left: 0, top: 0 });

  return (
    <GlassControl
      variant="prominent"
      size="prominent"
      nativeGlass={{ role: "icon", symbol: "plus" }}
      data-tutorial="calendar-fab"
      onPointerDown={(e) => {
        if (!onPositionChange) return;
        const rect = e.currentTarget.getBoundingClientRect();
        origin.current = { x: e.clientX, y: e.clientY, left: rect.left, top: rect.top };
        moved.current = false;
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!onPositionChange || !e.currentTarget.hasPointerCapture(e.pointerId)) return;
        const dx = e.clientX - origin.current.x;
        const dy = e.clientY - origin.current.y;
        if (!moved.current && Math.hypot(dx, dy) < DRAG_PX) return;
        moved.current = true;
        const size = e.currentTarget.getBoundingClientRect().width || 56;
        const nav = Number.parseFloat(
          getComputedStyle(document.documentElement).getPropertyValue("--bottom-nav-offset"),
        ) || 0;
        const maxX = Math.max(8, window.innerWidth - size - 8);
        const maxY = Math.max(8, window.innerHeight - nav - size - 8);
        onPositionChange({
          x: Math.min(maxX, Math.max(8, origin.current.left + dx)),
          y: Math.min(maxY, Math.max(8, origin.current.top + dy)),
        });
        scheduleNativeGlassSync();
      }}
      onPointerUp={() => {
        if (!moved.current) return;
        window.setTimeout(() => {
          moved.current = false;
        }, 0);
      }}
      onClick={(e) => {
        if (moved.current) {
          moved.current = false;
          e.preventDefault();
          e.stopPropagation();
          return;
        }
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
      className={cn("fixed z-40", className)}
      style={
        position
          ? { left: position.x, top: position.y, right: "auto", bottom: "auto" }
          : { right: 20, bottom: "calc(var(--bottom-nav-offset) + 10px)" }
      }
    >
      <Plus className="w-6 h-6" strokeWidth={2.5} />
    </GlassControl>
  );
}
