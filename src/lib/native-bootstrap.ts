import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { App } from "@capacitor/app";
import { SplashScreen } from "@capacitor/splash-screen";
import { StatusBar, Style } from "@capacitor/status-bar";
import { rescheduleAll } from "./notifications";
import {
  refreshLiveActivities,
  rescheduleLiveActivityWakes,
  scheduleLiveActivityBoundaries,
  setLiveActivityDismissArrivedOnRefresh,
} from "./live-activity";
import { initLiveActivityRemote, syncLiveActivitySchedulesRemote } from "./la-remote";
import { initFcmRegistration } from "./fcm";
import { initKeyboardAvoidance } from "./keyboard-avoidance";

function syncSchedules(opts: { dismissArrived?: boolean } = {}) {
  void rescheduleAll();
  void refreshLiveActivities({ dismissArrived: opts.dismissArrived });
  void syncLiveActivitySchedulesRemote();
  void rescheduleLiveActivityWakes();
}

export async function initNative(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  // Keyboard listeners live inside initKeyboardAvoidance (resize: none + root shift).
  initKeyboardAvoidance();

  try {
    await StatusBar.setOverlaysWebView({ overlay: true });
    await StatusBar.setStyle({ style: Style.Light });
  } catch {
    /* not available */
  }

  try {
    await SplashScreen.hide();
  } catch {
    /* not available */
  }

  try {
    await LocalNotifications.addListener("localNotificationActionPerformed", () => {
      syncSchedules({ dismissArrived: true });
    });
    await LocalNotifications.addListener("localNotificationReceived", () => {
      // Wake at LA showAt / end — start or drop rows without waiting for the user.
      void refreshLiveActivities();
      void syncLiveActivitySchedulesRemote();
    });
  } catch {
    /* notifications plugin not available */
  }

  syncSchedules();
  scheduleLiveActivityBoundaries();
  // FCM before remote LA sync so devices/{uid}.fcmToken is more likely present
  // when Cloud Functions evaluate start eligibility.
  await initFcmRegistration();
  await initLiveActivityRemote();
  void rescheduleLiveActivityWakes();

  App.addListener("appStateChange", ({ isActive }) => {
    if (isActive) {
      // Opening the app drops arrived ("It's time") rows immediately.
      setLiveActivityDismissArrivedOnRefresh(true);
      syncSchedules({ dismissArrived: true });
      scheduleLiveActivityBoundaries();
      void initFcmRegistration();
      void initLiveActivityRemote();
    } else {
      // JS timers freeze while locked — push schedules + local wakes before suspend.
      setLiveActivityDismissArrivedOnRefresh(false);
      void syncLiveActivitySchedulesRemote();
      void rescheduleLiveActivityWakes();
      scheduleLiveActivityBoundaries();
    }
  });
  App.addListener("resume", () => syncSchedules({ dismissArrived: true }));
  App.addListener("appUrlOpen", () => {
    syncSchedules({ dismissArrived: true });
  });
}
