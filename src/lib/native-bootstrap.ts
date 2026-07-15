import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { SplashScreen } from "@capacitor/splash-screen";
import { StatusBar, Style } from "@capacitor/status-bar";
import { Keyboard } from "@capacitor/keyboard";
import { rescheduleAll } from "./notifications";
import { refreshLiveActivities } from "./live-activity";
import { resetViewportZoom } from "./viewport-zoom";

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
    Keyboard.addListener("keyboardWillHide", () => {
      setTimeout(resetViewportZoom, 50);
    });
  } catch { /* keyboard plugin not available */ }

  syncSchedules();

  App.addListener("appStateChange", ({ isActive }) => {
    if (isActive) syncSchedules();
  });
  App.addListener("resume", () => syncSchedules());
}
