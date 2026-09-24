import {
  BookOpen,
  Briefcase,
  Circle,
  Compass,
  Dumbbell,
  Flag,
  Gift,
  GraduationCap,
  Heart,
  Leaf,
  Mountain,
  Music,
  Palette,
  PiggyBank,
  Plane,
  Rocket,
  Star,
  Target,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * UI-layer mapping for `PlanItem.icon` string ids (see
 * `src/lib/v3/plan-icons.ts`). Kept separate from the domain catalog so
 * `src/lib/v3/*` never imports a React component library.
 */
const PLAN_ICON_COMPONENTS: Record<string, LucideIcon> = {
  circle: Circle,
  target: Target,
  compass: Compass,
  flag: Flag,
  rocket: Rocket,
  plane: Plane,
  mountain: Mountain,
  "book-open": BookOpen,
  "graduation-cap": GraduationCap,
  briefcase: Briefcase,
  dumbbell: Dumbbell,
  wallet: Wallet,
  "piggy-bank": PiggyBank,
  heart: Heart,
  star: Star,
  palette: Palette,
  music: Music,
  gift: Gift,
  leaf: Leaf,
};

export function planIconComponent(iconId: string): LucideIcon {
  return PLAN_ICON_COMPONENTS[iconId] ?? Target;
}

interface GlyphProps {
  iconId: string;
  className?: string;
}

/** Renders a PlanItem's icon glyph, falling back to the default when unknown. */
export function PlanIconGlyph({ iconId, className }: GlyphProps) {
  const Icon = planIconComponent(iconId);
  return <Icon className={cn("w-4 h-4", className)} aria-hidden="true" />;
}
