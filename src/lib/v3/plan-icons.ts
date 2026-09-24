/**
 * Static Plan icon catalog.
 *
 * Definitions are code, not user data — `PlanItem.icon` stores one of these
 * ids as a plain string. This file stays framework-agnostic (no lucide-react
 * import) so the domain layer has no UI dependency; the id → component
 * mapping lives in `src/components/plan/plan-icon-registry.tsx`.
 */

export interface PlanIconDefinition {
  id: string;
  /** i18n key for the accessible label shown in the icon picker. */
  labelKey: string;
}

export const PLAN_ICON_DEFINITIONS: PlanIconDefinition[] = [
  { id: "circle", labelKey: "planIconCircle" },
  { id: "target", labelKey: "planIconTarget" },
  { id: "compass", labelKey: "planIconCompass" },
  { id: "flag", labelKey: "planIconFlag" },
  { id: "rocket", labelKey: "planIconRocket" },
  { id: "plane", labelKey: "planIconPlane" },
  { id: "mountain", labelKey: "planIconMountain" },
  { id: "book-open", labelKey: "planIconBookOpen" },
  { id: "graduation-cap", labelKey: "planIconGraduationCap" },
  { id: "briefcase", labelKey: "planIconBriefcase" },
  { id: "dumbbell", labelKey: "planIconDumbbell" },
  { id: "wallet", labelKey: "planIconWallet" },
  { id: "piggy-bank", labelKey: "planIconPiggyBank" },
  { id: "heart", labelKey: "planIconHeart" },
  { id: "star", labelKey: "planIconStar" },
  { id: "palette", labelKey: "planIconPalette" },
  { id: "music", labelKey: "planIconMusic" },
  { id: "gift", labelKey: "planIconGift" },
  { id: "leaf", labelKey: "planIconLeaf" },
];

export function isKnownPlanIcon(id: string): boolean {
  return PLAN_ICON_DEFINITIONS.some((d) => d.id === id);
}
