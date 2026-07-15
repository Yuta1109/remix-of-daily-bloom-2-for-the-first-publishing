import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { SplashScreen } from "@capacitor/splash-screen";
import { StatusBar, Style } from "@capacitor/status-bar";
import { Keyboard } from "@capacitor/keyboard";
import { rescheduleAll } from "./notifications";
import {
  refreshLiveActivities,
  startLiveActivityRefreshLoop,
  stopLiveActivityRefreshLoop,
} from "./live-activity";
import { scrollInputAboveKeyboard } from "./keyboard-avoidance";

function syncSchedules() {
  void rescheduleAll();
  void refreshLiveActivities();
}

export async function initNative(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  try {
    await StatusBar.setStyle({ style: Style.Light });
  } catch { /* not available */ }

  try {
    await SplashScreen.hide();
  } catch { /* not available */ }

  try {
    Keyboard.addListener("keyboardWillShow", () => {
      const el = document.activeElement;
      if (el instanceof HTMLElement) {
        setTimeout(() => scrollInputAboveKeyboard(el), 80);
      }
    });
  } catch { /* keyboard plugin not available */ }

  syncSchedules();
  startLiveActivityRefreshLoop();

  App.addListener("appStateChange", ({ isActive }) => {
    if (isActive) {
      syncSchedules();
      startLiveActivityRefreshLoop();
    } else {
      stopLiveActivityRefreshLoop();
    }
  });
  App.addListener("resume", () => syncSchedules());
}
