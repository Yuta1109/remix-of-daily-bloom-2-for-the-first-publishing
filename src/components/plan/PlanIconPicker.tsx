import { PLAN_ICON_DEFINITIONS } from "@/lib/v3/plan-icons";
import { planIconComponent } from "@/components/plan/plan-icon-registry";
import { useI18n, type TranslationKeys } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface Props {
  value: string;
  onChange: (iconId: string) => void;
  className?: string;
}

/**
 * Fixed icon catalog grid — the only icon system for Plan items. Never emoji,
 * never a free-form entry, so every icon renders consistently everywhere.
 */
export function PlanIconPicker({ value, onChange, className }: Props) {
  const { t } = useI18n();
  return (
    <div className={cn("grid grid-cols-6 gap-2", className)}>
      {PLAN_ICON_DEFINITIONS.map((def) => {
        const Icon = planIconComponent(def.id);
        const selected = def.id === value;
        return (
          <button
            key={def.id}
            type="button"
            onClick={() => onChange(def.id)}
            aria-pressed={selected}
            aria-label={t(def.labelKey as TranslationKeys)}
            className={cn(
              "aspect-square rounded-xl flex items-center justify-center transition-colors",
              selected
                ? "bg-accent text-accent-foreground"
                : "bg-secondary/60 text-foreground/70 hover:bg-secondary",
            )}
          >
            <Icon className="w-5 h-5" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
