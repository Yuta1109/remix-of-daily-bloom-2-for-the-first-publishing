import { useRef } from "react";
import { Hand } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { markWeekNavSwipeHintSeen } from "@/lib/calendar-prefs";

type Props = {
  onDismiss: () => void;
};

const SWIPE_THRESHOLD_PX = 28;

export function WeekNavSwipeHint({ onDismiss }: Props) {
  const { t } = useI18n();
  const startX = useRef(0);
  const startY = useRef(0);
  const tracking = useRef(false);

  const dismiss = () => {
    markWeekNavSwipeHintSeen();
    onDismiss();
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    startX.current = e.clientX;
    startY.current = e.clientY;
    tracking.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!tracking.current) return;
    const dx = e.clientX - startX.current;
    const dy = e.clientY - startY.current;
    if (Math.abs(dx) >= SWIPE_THRESHOLD_PX && Math.abs(dx) > Math.abs(dy)) {
      tracking.current = false;
      dismiss();
    }
  };

  const onPointerEnd = () => {
    tracking.current = false;
  };

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
      <div
        className="pointer-events-auto touch-none rounded-2xl bg-foreground/90 text-background px-5 py-4 text-sm font-medium flex flex-col items-center gap-3 shadow-float max-w-[80%] text-center"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
      >
        <Hand className="w-9 h-9 week-swipe-hand" strokeWidth={1.75} />
        <p className="leading-relaxed">{t("weekNavSwipeHint")}</p>
      </div>
    </div>
  );
}
