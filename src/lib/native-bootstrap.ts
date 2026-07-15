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
  } catch {
    /* not available */
  }
  try {
    await SplashScreen.hide();
  } catch {
    /* not available */
  }

  // Reset scroll position after keyboard dismissal so the viewport
  // returns to its original size (fixes iOS zoom-not-resetting bug).
  try {
    Keyboard.addListener("keyboardWillHide", () => {
      // Small delay ensures the keyboard animation has finished before
      // we attempt to restore the scroll position.
      setTimeout(() => {
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
        window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
      }, 50);
    });
  } catch {
    /* keyboard plugin not available */
  }

  syncSchedules();

  App.addListener("appStateChange", ({ isActive }) => {
    if (isActive) syncSchedules();
  });
  App.addListener("resume", () => syncSchedules());
}
