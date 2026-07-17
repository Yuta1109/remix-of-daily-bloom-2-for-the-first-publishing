import { Capacitor } from "@capacitor/core";
import { FirebaseApp } from "@capacitor-firebase/app";
import { FirebaseMessaging } from "@capacitor-firebase/messaging";
import { setRemoteFcmToken } from "./la-remote";

/**
 * Request notification permission (if needed) and upload the FCM registration
 * token to Firestore via setRemoteFcmToken. Required for ActivityKit
 * push-to-start through Firebase Cloud Messaging.
 */
export async function initFcmRegistration(): Promise<void> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "ios") {
    return;
  }

  try {
    // Touches the native FirebaseApp plugin so GoogleService-Info.plist is loaded.
    await FirebaseApp.getName();
  } catch (err) {
    console.warn("[fcm] FirebaseApp not ready (is GoogleService-Info.plist bundled?):", err);
  }

  try {
    const perm = await FirebaseMessaging.checkPermissions();
    if (perm.receive !== "granted") {
      const req = await FirebaseMessaging.requestPermissions();
      if (req.receive !== "granted") {
        console.info(
          "[fcm] notification permission not granted — Live Activity push may not start while killed",
        );
        return;
      }
    }

    const { token } = await FirebaseMessaging.getToken();
    if (token) {
      setRemoteFcmToken(token);
    }

    await FirebaseMessaging.addListener("tokenReceived", (event) => {
      if (event.token) setRemoteFcmToken(event.token);
    });
  } catch (err) {
    console.warn("[fcm] registration failed:", err);
  }
}
