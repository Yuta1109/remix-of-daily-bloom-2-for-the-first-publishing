import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { App } from "@capacitor/app";
import { SplashScreen } from "@capacitor/splash-screen";
import { StatusBar, Style } from "@capacitor/status-bar";
import { Keyboard } from "@capacitor/keyboard";
import { rescheduleAll } from "./notifications";
import {
  refreshLiveActivities,
  scheduleLiveActivityBoundaries,
  stopLiveActivityBoundaries,
} from "./live-activity";
import { initKeyboardAvoidance, scrollInputAboveKeyboard } from "./keyboard-avoidance";

function syncSchedules() {
  void rescheduleAll();
  void refreshLiveActivities();
}

export async function initNative(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  initKeyboardAvoidance();

  try {
    await StatusBar.setOverlaysWebView({ overlay: true });
    await StatusBar.setStyle({ style: Style.Light });
  } catch { /* not available */ }

  try {
    await SplashScreen.hide();
  } catch { /* not available */ }

  try {
    await LocalNotifications.addListener("localNotificationActionPerformed", () => {
      syncSchedules();
    });
    await LocalNotifications.addListener("localNotificationReceived", () => {
      void refreshLiveActivities();
    });
  } catch { /* notifications plugin not available */ }

  syncSchedules();
  scheduleLiveActivityBoundaries();

  App.addListener("appStateChange", ({ isActive }) => {
    if (isActive) {
      syncSchedules();
      scheduleLiveActivityBoundaries();
    } else {
      stopLiveActivityBoundaries();
    }
  });
  App.addListener("resume", () => syncSchedules());

  try {
    Keyboard.addListener("keyboardWillShow", () => {
      const el = document.activeElement;
      if (el instanceof HTMLElement) scrollInputAboveKeyboard(el);
    });
    Keyboard.addListener("keyboardDidShow", () => {
      const el = document.activeElement;
      if (el instanceof HTMLElement) scrollInputAboveKeyboard(el);
    });
  } catch { /* keyboard plugin not available */ }
}
