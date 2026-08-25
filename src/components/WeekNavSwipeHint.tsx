import { Hand } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { markWeekNavSwipeHintSeen } from "@/lib/calendar-prefs";

type Props = {
  onDismiss: () => void;
};

export function WeekNavSwipeHint({ onDismiss }: Props) {
  const { t } = useI18n();

  const dismiss = () => {
    markWeekNavSwipeHintSeen();
    onDismiss();
  };

  return (
    <div
      className="absolute inset-0 z-30 flex items-center justify-center bg-black/25"
      onPointerDown={dismiss}
      role="presentation"
    >
      <div className="rounded-2xl bg-foreground/90 text-background px-5 py-4 text-sm font-medium flex flex-col items-center gap-3 shadow-float pointer-events-none max-w-[80%] text-center">
        <Hand className="w-9 h-9 week-swipe-hand" strokeWidth={1.75} />
        <p className="leading-relaxed">{t("weekNavSwipeHint")}</p>
      </div>
    </div>
  );
}
