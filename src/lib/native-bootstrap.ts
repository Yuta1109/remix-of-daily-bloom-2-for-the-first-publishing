import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { SplashScreen } from "@capacitor/splash-screen";
import { StatusBar, Style } from "@capacitor/status-bar";
import { rescheduleAll } from "./notifications";
import { refreshLiveActivities } from "./live-activity";

function syncSchedules() {
  void rescheduleAll();
  void refreshLiveActivities();
}

/**
 * One-time native setup. Safe to call on web (becomes a no-op). Keeps
 * notifications and Live Activities in sync whenever the app becomes active,
 * which is required because iOS only lets the app (re)start a Live Activity
 * from the foreground.
 */
export async function initNative(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  try {
    await StatusBar.setStyle({ style: Style.Light });
  } catch {
    /* status bar not available */
  }
  try {
    await SplashScreen.hide();
  } catch {
    /* splash not available */
  }

  syncSchedules();

  App.addListener("appStateChange", ({ isActive }) => {
    if (isActive) syncSchedules();
  });
  App.addListener("resume", () => syncSchedules());
}
