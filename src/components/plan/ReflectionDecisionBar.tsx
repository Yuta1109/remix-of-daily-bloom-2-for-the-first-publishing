import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { ReflectionDecisionType } from "@/lib/v3/types";

interface Props {
  value?: ReflectionDecisionType;
  onKeep: () => void;
  onPostpone: () => void;
  onStop: () => void;
}

export function ReflectionDecisionBar({ value, onKeep, onPostpone, onStop }: Props) {
  const { t } = useI18n();
  const btn = (id: ReflectionDecisionType, label: string, onClick: () => void) => (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={value === id}
      className={cn(
        "flex-1 min-h-11 rounded-xl text-sm font-semibold px-2 py-2.5 border transition-colors",
        value === id
          ? "border-accent bg-accent/10 text-foreground"
          : "border-border/70 bg-secondary/40 text-muted-foreground",
      )}
    >
      {label}
    </button>
  );

  return (
    <div className="flex gap-2" role="group" aria-label={t("reflectionTitle")}>
      {btn("keep", t("reflectionKeep"), onKeep)}
      {btn("postpone", t("reflectionPostpone"), onPostpone)}
      {btn("stop", t("reflectionStop"), onStop)}
    </div>
  );
}
