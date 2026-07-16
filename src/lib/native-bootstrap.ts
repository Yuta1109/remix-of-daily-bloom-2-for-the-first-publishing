import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { App } from "@capacitor/app";
import { SplashScreen } from "@capacitor/splash-screen";
import { StatusBar, Style } from "@capacitor/status-bar";
import { rescheduleAll } from "./notifications";
import {
  refreshLiveActivities,
  scheduleLiveActivityBoundaries,
  stopLiveActivityBoundaries,
} from "./live-activity";
import { initKeyboardAvoidance } from "./keyboard-avoidance";

function syncSchedules() {
  void rescheduleAll();
  void refreshLiveActivities();
}

export async function initNative(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  // Keyboard listeners live inside initKeyboardAvoidance (resize: none + root shift).
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
}
