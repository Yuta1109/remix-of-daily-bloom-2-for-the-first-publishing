/**
 * App accent (theme) color — persists in localStorage and updates CSS variables.
 * Soft tints use Tailwind opacity on `accent` (e.g. bg-accent/10); --streak follows hue.
 */

const STORAGE_KEY = "essences-theme-accent";

export type ThemeAccentId =
  | "orange"
  | "coral"
  | "amber"
  | "lime"
  | "teal"
  | "sky"
  | "violet"
  | "rose";

export type ThemeAccentOption = {
  id: ThemeAccentId;
  /** HSL components without hsl(): "H S% L%" */
  accent: string;
  /** Slightly punchier hue twin for streak / highlights */
  streak: string;
  labelKey: "themeAccentOrange" | "themeAccentCoral" | "themeAccentAmber" | "themeAccentLime" | "themeAccentTeal" | "themeAccentSky" | "themeAccentViolet" | "themeAccentRose";
};

/** Bright accents that stay readable on white / light-gray UI. */
export const THEME_ACCENTS: ThemeAccentOption[] = [
  { id: "orange", accent: "25 80% 58%", streak: "25 92% 52%", labelKey: "themeAccentOrange" },
  { id: "coral", accent: "12 85% 58%", streak: "12 90% 52%", labelKey: "themeAccentCoral" },
  { id: "amber", accent: "40 90% 50%", streak: "40 95% 46%", labelKey: "themeAccentAmber" },
  { id: "lime", accent: "92 62% 42%", streak: "92 68% 38%", labelKey: "themeAccentLime" },
  { id: "teal", accent: "174 62% 38%", streak: "174 70% 34%", labelKey: "themeAccentTeal" },
  { id: "sky", accent: "205 82% 52%", streak: "205 88% 48%", labelKey: "themeAccentSky" },
  { id: "violet", accent: "262 68% 58%", streak: "262 72% 52%", labelKey: "themeAccentViolet" },
  { id: "rose", accent: "338 72% 55%", streak: "338 78% 50%", labelKey: "themeAccentRose" },
];

/** Hex twins of THEME_ACCENTS (boot splash / native-adjacent branding). */
export const THEME_ACCENT_HEX: Record<ThemeAccentId, string> = {
  orange: "#EA863E",
  coral: "#EF5D39",
  amber: "#F2A60D",
  lime: "#67AE29",
  teal: "#259D91",
  sky: "#2095E9",
  violet: "#804BDD",
  rose: "#DF3A76",
};

const DEFAULT_ID: ThemeAccentId = "orange";

function isAccentId(v: string | null | undefined): v is ThemeAccentId {
  return !!v && THEME_ACCENTS.some((a) => a.id === v);
}

export function getThemeAccentId(): ThemeAccentId {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (isAccentId(raw)) return raw;
  } catch {
    /* ignore */
  }
  return DEFAULT_ID;
}

export function getThemeAccentOption(id: ThemeAccentId = getThemeAccentId()): ThemeAccentOption {
  return THEME_ACCENTS.find((a) => a.id === id) ?? THEME_ACCENTS[0];
}

/** Apply CSS variables on :root (and .dark if present). */
export function applyThemeAccent(id: ThemeAccentId): void {
  const opt = getThemeAccentOption(id);
  const root = document.documentElement;
  root.style.setProperty("--accent", opt.accent);
  root.style.setProperty("--accent-foreground", "0 0% 100%");
  root.style.setProperty("--streak", opt.streak);
  // Keep focus ring related to the chosen accent for selected controls.
  root.style.setProperty("--ring", opt.accent);
}

export function setThemeAccentId(id: ThemeAccentId): void {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
  applyThemeAccent(id);
}

/** Call once at app boot before first paint when possible. */
export function initThemeAccent(): void {
  applyThemeAccent(getThemeAccentId());
}
