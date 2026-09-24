/**
 * UserSettings I/O.
 *
 * Canonical store is V3 `settings` via the repository / `essences-app-data-v3`.
 * Sidecar keys (`growth-app-lang`, `essences-theme-accent`, week-start,
 * notification pref) are read once for compatibility and are not written by
 * new Settings UI.
 */

import type { EssencesDataV3, UserSettings } from "./types";

export const SETTINGS_SIDECAR_MIGRATED_KEY = "essences-settings-sidecars-migrated-v1";

const LANG_SIDECAR_KEY = "growth-app-lang";
const ACCENT_SIDECAR_KEY = "essences-theme-accent";
const WEEK_START_SIDECAR_KEY = "essences-cal-week-start";
const NOTIF_SIDECAR_KEY = "essences-notif-user-enabled";

const ACCENT_IDS = new Set([
  "orange",
  "coral",
  "amber",
  "lime",
  "teal",
  "sky",
  "violet",
  "rose",
]);

function readSidecar(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function markMigrated(): void {
  try {
    localStorage.setItem(SETTINGS_SIDECAR_MIGRATED_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function settingsSidecarsAlreadyMigrated(): boolean {
  try {
    return localStorage.getItem(SETTINGS_SIDECAR_MIGRATED_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * One-time copy of legacy sidecar prefs into V3 UserSettings.
 * Mutates `data.settings` in place. Returns true when a write is needed.
 */
export function applySidecarSettingsOnce(data: EssencesDataV3): boolean {
  if (settingsSidecarsAlreadyMigrated()) return false;

  const next: UserSettings = { ...data.settings };
  let changed = false;

  const lang = readSidecar(LANG_SIDECAR_KEY);
  if (lang === "en" || lang === "ja") {
    next.language = lang;
    changed = true;
  }

  const accent = readSidecar(ACCENT_SIDECAR_KEY);
  if (accent && ACCENT_IDS.has(accent)) {
    next.accentColor = accent;
    changed = true;
  }

  const week = readSidecar(WEEK_START_SIDECAR_KEY);
  if (week === "0" || week === "1") {
    next.weekStartsOn = week === "1" ? 1 : 0;
    changed = true;
  }

  const notif = readSidecar(NOTIF_SIDECAR_KEY);
  if (notif === "true" || notif === "false") {
    next.notifications = {
      ...next.notifications,
      enabled: notif !== "false",
    };
    changed = true;
  }

  markMigrated();
  if (!changed) return false;
  data.settings = {
    ...next,
    reflectionSchedule: data.settings.reflectionSchedule,
    notifications: next.notifications,
  };
  return true;
}

export function mergeUserSettings(current: UserSettings, patch: Partial<UserSettings>): UserSettings {
  return {
    ...current,
    ...patch,
    reflectionSchedule: patch.reflectionSchedule
      ? {
          daily: { ...current.reflectionSchedule.daily, ...patch.reflectionSchedule.daily },
          weekly: { ...current.reflectionSchedule.weekly, ...patch.reflectionSchedule.weekly },
          monthly: { ...current.reflectionSchedule.monthly, ...patch.reflectionSchedule.monthly },
          future: { ...current.reflectionSchedule.future, ...patch.reflectionSchedule.future },
        }
      : current.reflectionSchedule,
    notifications: patch.notifications
      ? { ...current.notifications, ...patch.notifications }
      : current.notifications,
  };
}
