import { StampGlyph } from "@/components/calendar/StampGlyph";
import { cn } from "@/lib/utils";
import { stampDefinition } from "@/lib/v3/stamp-catalog";
import type { CalendarStamp } from "@/lib/v3/types";

interface Props {
  stamps: CalendarStamp[];
  selectedId?: string;
  interactive?: boolean;
  onSelect: (id: string) => void;
  onMovePointerDown: (
    stamp: CalendarStamp,
    event: React.PointerEvent<HTMLButtonElement>,
  ) => void;
}

/**
 * Foreground decorations for a day cell. Position uses normalized x/y.
 * Pointer events stay on the stamps so the date number remains tappable
 * around them.
 */
export function CalendarStampLayer({
  stamps,
  selectedId,
  interactive = true,
  onSelect,
  onMovePointerDown,
}: Props) {
  if (stamps.length === 0) return null;

  return (
    <div className="absolute inset-0 z-20 pointer-events-none overflow-hidden">
      {stamps.map((stamp) => {
        const def = stampDefinition(stamp.stampDefinitionId);
        const selected = stamp.id === selectedId;
        return (
          <button
            key={stamp.id}
            type="button"
            disabled={!interactive}
            aria-label={def?.id ?? "stamp"}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(stamp.id);
            }}
            onPointerDown={(e) => {
              e.stopPropagation();
              onMovePointerDown(stamp, e);
            }}
            className={cn(
              "absolute pointer-events-auto touch-none -translate-x-1/2 -translate-y-1/2",
              "w-5 h-5 flex items-center justify-center rounded-full",
              "text-foreground/75 drop-shadow-sm",
              selected && "ring-1 ring-accent bg-background/70",
            )}
            style={{
              left: `${stamp.x * 100}%`,
              top: `${stamp.y * 100}%`,
              zIndex: stamp.zIndex + 1,
              transform: `translate(-50%, -50%) scale(${stamp.scale}) rotate(${stamp.rotation}deg)`,
            }}
          >
            <StampGlyph iconId={def?.icon ?? "star"} className="w-3.5 h-3.5" />
          </button>
        );
      })}
    </div>
  );
}
