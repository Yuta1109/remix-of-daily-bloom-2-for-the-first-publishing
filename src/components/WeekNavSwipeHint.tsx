import { Hand } from "lucide-react";
import { useI18n } from "@/lib/i18n";

/** Visual-only overlay; swipe-to-dismiss is handled on the week block in Calendar.tsx. */
export function WeekNavSwipeHint() {
  const { t } = useI18n();

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
      <div className="rounded-2xl bg-foreground/90 text-background px-5 py-4 text-sm font-medium flex flex-col items-center gap-3 shadow-float max-w-[80%] text-center">
        <Hand className="w-9 h-9 week-swipe-hand" strokeWidth={1.75} />
        <p className="leading-relaxed">{t("weekNavSwipeHint")}</p>
      </div>
    </div>
  );
}
