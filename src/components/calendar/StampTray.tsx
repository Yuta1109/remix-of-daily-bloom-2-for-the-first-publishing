import { StampGlyph } from "@/components/calendar/StampGlyph";
import { useI18n, type TranslationKeys } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { STAMP_DEFINITIONS, stampDefinition } from "@/lib/v3/stamp-catalog";
import {
  STAMP_DRAG_THRESHOLD,
  STAMP_LONG_PRESS_MS,
} from "@/lib/v3/stamp-coords";
import { useRef } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
  onDragStart: (stampDefinitionId: string, clientX: number, clientY: number) => void;
  onDragMove: (clientX: number, clientY: number) => void;
  onDragEnd: (clientX: number, clientY: number) => void;
  onDragCancel: () => void;
}

export function StampTray({
  open,
  onClose,
  onDragStart,
  onDragMove,
  onDragEnd,
  onDragCancel,
}: Props) {
  const { t } = useI18n();
  if (!open) return null;

  return (
    <div
      className={cn(
        "fixed left-0 right-0 z-40 border-t border-border/60",
        "bg-background/85 backdrop-blur-xl",
      )}
      style={{ bottom: "var(--bottom-nav-offset)" }}
      role="toolbar"
      aria-label={t("calendarStampTray")}
    >
      <div className="flex items-center justify-between px-4 pt-2 pb-1">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {t("calendarStamps")}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="text-xs font-semibold text-accent px-2 py-1 rounded-lg"
        >
          {t("calendarStampTrayDone")}
        </button>
      </div>
      <div className="flex gap-2 overflow-x-auto px-3 pb-2.5 scrollbar-none">
        {STAMP_DEFINITIONS.map((def) => (
          <StampTrayItem
            key={def.id}
            definitionId={def.id}
            iconId={def.icon}
            label={t(def.labelKey as TranslationKeys)}
            onDragStart={onDragStart}
            onDragMove={onDragMove}
            onDragEnd={onDragEnd}
            onDragCancel={onDragCancel}
          />
        ))}
      </div>
    </div>
  );
}

function StampTrayItem({
  definitionId,
  iconId,
  label,
  onDragStart,
  onDragMove,
  onDragEnd,
  onDragCancel,
}: {
  definitionId: string;
  iconId: string;
  label: string;
  onDragStart: (stampDefinitionId: string, clientX: number, clientY: number) => void;
  onDragMove: (clientX: number, clientY: number) => void;
  onDragEnd: (clientX: number, clientY: number) => void;
  onDragCancel: () => void;
}) {
  const press = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    longPress: boolean;
    timer: number | null;
  } | null>(null);

  const clearTimer = () => {
    if (press.current?.timer != null) {
      window.clearTimeout(press.current.timer);
      press.current.timer = null;
    }
  };

  return (
    <button
      type="button"
      aria-label={label}
      className="shrink-0 w-12 h-12 rounded-xl bg-secondary/70 flex items-center justify-center text-foreground/80 touch-none"
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        press.current = {
          pointerId: e.pointerId,
          startX: e.clientX,
          startY: e.clientY,
          longPress: false,
          timer: window.setTimeout(() => {
            if (!press.current) return;
            press.current.longPress = true;
            onDragStart(definitionId, e.clientX, e.clientY);
          }, STAMP_LONG_PRESS_MS),
        };
      }}
      onPointerMove={(e) => {
        const p = press.current;
        if (!p || p.pointerId !== e.pointerId) return;
        const dx = e.clientX - p.startX;
        const dy = e.clientY - p.startY;
        if (!p.longPress) {
          if (Math.hypot(dx, dy) >= STAMP_DRAG_THRESHOLD) {
            clearTimer();
            press.current = null;
          }
          return;
        }
        onDragMove(e.clientX, e.clientY);
      }}
      onPointerUp={(e) => {
        const p = press.current;
        clearTimer();
        press.current = null;
        if (!p || p.pointerId !== e.pointerId) return;
        if (p.longPress) onDragEnd(e.clientX, e.clientY);
      }}
      onPointerCancel={() => {
        clearTimer();
        const wasDragging = press.current?.longPress;
        press.current = null;
        if (wasDragging) onDragCancel();
      }}
    >
      <StampGlyph iconId={stampDefinition(definitionId)?.icon ?? iconId} className="w-5 h-5" />
    </button>
  );
}
