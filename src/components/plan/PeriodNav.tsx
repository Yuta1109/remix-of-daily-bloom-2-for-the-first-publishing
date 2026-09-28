import { ChevronLeft, ChevronRight } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { GlassControl } from "@/components/GlassControl";

interface Props {
  label: string;
  onPrev: () => void;
  onNext: () => void;
  className?: string;
}

/** Compact `‹ Label ›` period stepper shared by Monthly and Weekly. */
export function PeriodNav({ label, onPrev, onNext, className }: Props) {
  const { t } = useI18n();
  return (
    <div className={cn("flex items-center justify-between gap-2", className)}>
      <h2 className="text-lg font-semibold tracking-tight">{label}</h2>
      <div className="flex items-center gap-0.5 shrink-0">
        <GlassControl onClick={onPrev} aria-label={t("planPrevPeriod")} nativeGlass={{ role: "icon", symbol: "chevron.backward" }}>
          <ChevronLeft className="w-4 h-4" aria-hidden="true" />
        </GlassControl>
        <GlassControl onClick={onNext} aria-label={t("planNextPeriod")} nativeGlass={{ role: "icon", symbol: "chevron.forward" }}>
          <ChevronRight className="w-4 h-4" aria-hidden="true" />
        </GlassControl>
      </div>
    </div>
  );
}
