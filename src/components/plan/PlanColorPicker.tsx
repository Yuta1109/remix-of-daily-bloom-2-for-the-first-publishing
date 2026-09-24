import { THEME_ACCENTS } from "@/lib/theme-accent";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface Props {
  value: string;
  onChange: (colorId: string) => void;
  className?: string;
}

/**
 * Plan colors are the app's existing eight accent tokens (`THEME_ACCENTS`),
 * never an arbitrary hex value — one color system for the whole app.
 */
export function PlanColorPicker({ value, onChange, className }: Props) {
  const { t } = useI18n();
  return (
    <div className={cn("flex flex-wrap gap-3", className)}>
      {THEME_ACCENTS.map((option) => {
        const selected = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            aria-pressed={selected}
            aria-label={t(option.labelKey)}
            className={cn(
              "w-9 h-9 rounded-full border-2 transition-shadow",
              selected
                ? "border-accent ring-2 ring-accent ring-offset-2 ring-offset-background"
                : "border-border/50",
            )}
            style={{ backgroundColor: `hsl(${option.accent})` }}
          />
        );
      })}
    </div>
  );
}
