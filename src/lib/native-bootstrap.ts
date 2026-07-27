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
import {
  initLiveActivityRemote,
  pulseAppAlive,
  startAppAliveHeartbeat,
  stopAppAliveHeartbeat,
  syncLiveActivitySchedulesRemote,
} from "./la-remote";
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

  /** Collapse rapid open/close into one sync wave (avoids endAll/start races). */
  let resumeSyncTimer: number | null = null;
  let backgroundSyncTimer: number | null = null;
  const clearSyncTimers = () => {
    if (resumeSyncTimer != null) {
      window.clearTimeout(resumeSyncTimer);
      resumeSyncTimer = null;
    }
    if (backgroundSyncTimer != null) {
      window.clearTimeout(backgroundSyncTimer);
      backgroundSyncTimer = null;
    }
  };

  App.addListener("appStateChange", ({ isActive }) => {
    clearSyncTimers();
    if (isActive) {
      // Opening the app drops arrived ("It's time") rows immediately.
      setLiveActivityDismissArrivedOnRefresh(true);
      startAppAliveHeartbeat();
      void pulseAppAlive();
      resumeSyncTimer = window.setTimeout(() => {
        resumeSyncTimer = null;
        void syncSchedules({ dismissArrived: true });
        scheduleLiveActivityBoundaries();
        void initFcmRegistration();
        void initLiveActivityRemote();
      }, 350);
    } else {
      // Final heartbeat + schedule sync before suspend. Heartbeat tells the
      // server "local owns LA" so it will not PTS; after force-quit the
      // heartbeat ages out and kill-path uses update-token or one PTS.
      setLiveActivityDismissArrivedOnRefresh(false);
      stopAppAliveHeartbeat();
      backgroundSyncTimer = window.setTimeout(() => {
        backgroundSyncTimer = null;
        // Do not arm minutes early (showed ~11m on a 10m lead). Tiny skew only.
        void pulseAppAlive()
          .then(() => refreshLiveActivities({ allowEarlyShowMs: 15_000 }))
          .then(async () => {
            await syncLiveActivitySchedulesRemote();
            const { requestLiveActivityPresentationAlert } = await import(
              "./la-remote"
            );
            await requestLiveActivityPresentationAlert().catch(() => {});
          })
          .catch(() => {
            void syncLiveActivitySchedulesRemote();
          });
        void rescheduleLiveActivityWakes();
        scheduleLiveActivityBoundaries();
      }, 200);
    }
  });
  App.addListener("resume", () => {
    clearSyncTimers();
    resumeSyncTimer = window.setTimeout(() => {
      resumeSyncTimer = null;
      void syncSchedules({ dismissArrived: true });
    }, 350);
  });
  App.addListener("appUrlOpen", () => {
    void syncSchedules({ dismissArrived: true });
  });
}
