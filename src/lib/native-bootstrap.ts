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

async function syncSchedules(opts: { dismissArrived?: boolean } = {}) {
  void rescheduleAll();
  // Await local Activity first so Firestore status becomes "started" before
  // Cloud Functions can race a second push-to-start.
  await refreshLiveActivities({ dismissArrived: opts.dismissArrived });
  await syncLiveActivitySchedulesRemote();
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
      void syncSchedules({ dismissArrived: true });
    });
    await LocalNotifications.addListener("localNotificationReceived", () => {
      // Reminder taps / any leftover wake — keep LA in sync.
      void syncSchedules();
    });
  } catch {
    /* notifications plugin not available */
  }

  void syncSchedules();
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
      void syncSchedules({ dismissArrived: true });
      scheduleLiveActivityBoundaries();
      void initFcmRegistration();
      void initLiveActivityRemote();
    } else {
      // JS timers freeze while locked — push remote schedules before suspend.
      // Do NOT early-start ActivityKit here: that races FCM push-to-start at
      // showAt and stacks duplicate Lock Screen cards (+ "continue allowing?").
      setLiveActivityDismissArrivedOnRefresh(false);
      void refreshLiveActivities()
        .then(() => syncLiveActivitySchedulesRemote())
        .catch(() => {
          void syncLiveActivitySchedulesRemote();
        });
      void rescheduleLiveActivityWakes();
      scheduleLiveActivityBoundaries();
    }
  });
  App.addListener("resume", () => {
    void syncSchedules({ dismissArrived: true });
  });
  App.addListener("appUrlOpen", () => {
    void syncSchedules({ dismissArrived: true });
  });
}
