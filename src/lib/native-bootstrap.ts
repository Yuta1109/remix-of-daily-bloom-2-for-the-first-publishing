import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { SplashScreen } from "@capacitor/splash-screen";
import { StatusBar, Style } from "@capacitor/status-bar";
import { Keyboard } from "@capacitor/keyboard";
import { rescheduleAll } from "./notifications";
import { refreshLiveActivities } from "./live-activity";

function syncSchedules() {
  void rescheduleAll();
  void refreshLiveActivities();
}

/**
 * One-time native setup. Safe to call on web (becomes a no-op).
 */
export async function initNative(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  try {
    await StatusBar.setStyle({ style: Style.Light });
  } catch { /* not available */ }

  try {
    await SplashScreen.hide();
  } catch { /* not available */ }

  // ── Keyboard avoidance ────────────────────────────────────────────────────
  // When keyboard shows, scroll the focused input into view above the keyboard.
  try {
    Keyboard.addListener("keyboardWillShow", () => {
      setTimeout(() => {
        const el = document.activeElement;
        if (el && el instanceof HTMLElement) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }, 100);
    });

    // After keyboard hides, reset any accidental page-level scroll to top.
    Keyboard.addListener("keyboardWillHide", () => {
      setTimeout(() => {
        window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
      }, 50);
    });
  } catch { /* keyboard plugin not available */ }

  syncSchedules();

  App.addListener("appStateChange", ({ isActive }) => {
    if (isActive) syncSchedules();
  });
  App.addListener("resume", () => syncSchedules());
}
