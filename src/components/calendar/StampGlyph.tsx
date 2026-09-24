import {
  Cake,
  Coffee,
  Gem,
  PartyPopper,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import { planIconComponent } from "@/components/plan/plan-icon-registry";
import { cn } from "@/lib/utils";

/**
 * Stamp glyphs reuse Plan icons where the id matches (`star`, `heart`,
 * `plane`, `book-open`, `leaf`). A few occasion marks are stamp-only.
 */
const STAMP_ONLY_ICONS: Record<string, LucideIcon> = {
  cake: Cake,
  gem: Gem,
  party: PartyPopper,
  trophy: Trophy,
  coffee: Coffee,
};

function stampIconComponent(iconId: string): LucideIcon {
  return STAMP_ONLY_ICONS[iconId] ?? planIconComponent(iconId);
}

interface Props {
  iconId: string;
  className?: string;
}

export function StampGlyph({ iconId, className }: Props) {
  const Icon = stampIconComponent(iconId);
  return <Icon className={cn("w-4 h-4", className)} strokeWidth={1.75} aria-hidden="true" />;
}
