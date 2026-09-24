/**
 * Static stamp / wallpaper catalog.
 *
 * Definitions are code, not user data. `CalendarStamp.stampDefinitionId` and
 * `CalendarDayAppearance.wallpaperId` reference these ids.
 *
 * Add new entries here with stable ids (`birthday_02`, `stamp.study`, …).
 * Do not generate assets at runtime.
 */

export type WallpaperCategory =
  | "birthday"
  | "anniversary"
  | "travel"
  | "celebration"
  | "seasonal";

export interface StampDefinition {
  id: string;
  /** i18n key for the catalog label. */
  labelKey: string;
  /**
   * Glyph id. Plan-icon ids (`star`, `heart`, `plane`, …) reuse the Plan
   * registry; a few stamp-only ids (`cake`, `coffee`, `trophy`, `party`) are
   * mapped in `StampGlyph`.
   */
  icon: string;
  group: "occasion" | "marker" | "seasonal";
}

export interface WallpaperDefinition {
  id: string;
  labelKey: string;
  category: WallpaperCategory;
  /** CSS background (gradient / wash). Keep low-contrast for calendar cells. */
  background: string;
}

export const WALLPAPER_CATEGORY_ORDER: WallpaperCategory[] = [
  "birthday",
  "anniversary",
  "travel",
  "celebration",
  "seasonal",
];

export const STAMP_DEFINITIONS: StampDefinition[] = [
  { id: "stamp.birthday", labelKey: "stampBirthday", icon: "cake", group: "occasion" },
  { id: "stamp.anniversary", labelKey: "stampAnniversary", icon: "gem", group: "occasion" },
  { id: "stamp.travel", labelKey: "stampTravel", icon: "plane", group: "occasion" },
  { id: "stamp.heart", labelKey: "stampHeart", icon: "heart", group: "marker" },
  { id: "stamp.star", labelKey: "stampStar", icon: "star", group: "marker" },
  { id: "stamp.celebration", labelKey: "stampCelebration", icon: "party", group: "occasion" },
  { id: "stamp.seasonal", labelKey: "stampSeasonal", icon: "leaf", group: "seasonal" },
  { id: "stamp.study", labelKey: "stampStudy", icon: "book-open", group: "marker" },
  { id: "stamp.achievement", labelKey: "stampAchievement", icon: "trophy", group: "marker" },
  { id: "stamp.coffee", labelKey: "stampCoffee", icon: "coffee", group: "marker" },
];

/**
 * Lightweight washes — not photographs. Opacity is applied by the renderer
 * so the date number and markers stay readable.
 */
export const WALLPAPER_DEFINITIONS: WallpaperDefinition[] = [
  {
    id: "birthday_01",
    labelKey: "wallpaperBirthday",
    category: "birthday",
    background:
      "linear-gradient(160deg, hsl(350 48% 94%) 0%, hsl(18 42% 95%) 48%, hsl(340 36% 96%) 100%)",
  },
  {
    id: "anniversary_01",
    labelKey: "wallpaperAnniversary",
    category: "anniversary",
    background:
      "linear-gradient(165deg, hsl(38 42% 94%) 0%, hsl(28 28% 96%) 55%, hsl(42 36% 95%) 100%)",
  },
  {
    id: "travel_01",
    labelKey: "wallpaperTravel",
    category: "travel",
    background:
      "linear-gradient(165deg, hsl(205 42% 93%) 0%, hsl(190 30% 95%) 50%, hsl(210 28% 96%) 100%)",
  },
  {
    id: "celebration_01",
    labelKey: "wallpaperCelebration",
    category: "celebration",
    background:
      "linear-gradient(160deg, hsl(272 36% 94%) 0%, hsl(320 28% 95%) 52%, hsl(255 24% 96%) 100%)",
  },
  {
    id: "seasonal_01",
    labelKey: "wallpaperSeasonal",
    category: "seasonal",
    background:
      "linear-gradient(165deg, hsl(142 28% 93%) 0%, hsl(88 22% 95%) 48%, hsl(40 24% 96%) 100%)",
  },
];

export function stampDefinition(id: string): StampDefinition | undefined {
  return STAMP_DEFINITIONS.find((s) => s.id === id);
}

export function wallpaperDefinition(id: string): WallpaperDefinition | undefined {
  return WALLPAPER_DEFINITIONS.find((w) => w.id === id);
}

export function isKnownStampDefinition(id: string): boolean {
  return !!stampDefinition(id);
}

export function isKnownWallpaper(id: string): boolean {
  return !!wallpaperDefinition(id);
}

export function wallpapersInCategory(category: WallpaperCategory): WallpaperDefinition[] {
  return WALLPAPER_DEFINITIONS.filter((w) => w.category === category);
}
