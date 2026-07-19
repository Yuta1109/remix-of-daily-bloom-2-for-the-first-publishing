import { Capacitor } from "@capacitor/core";
import { FirebaseApp } from "@capacitor-firebase/app";
import { FirebaseMessaging } from "@capacitor-firebase/messaging";
import { setRemoteFcmToken, setRemoteDiagnosticHint } from "./la-remote";

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
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[fcm] FirebaseApp not ready:", msg);
    setRemoteDiagnosticHint(`FirebaseApp: ${msg}`);
  }

  try {
    const perm = await FirebaseMessaging.checkPermissions();
    if (perm.receive !== "granted") {
      const req = await FirebaseMessaging.requestPermissions();
      if (req.receive !== "granted") {
        setRemoteDiagnosticHint("FCM: notification permission not granted");
        return;
      }
    }

    const { token } = await FirebaseMessaging.getToken();
    if (token) {
      setRemoteFcmToken(token);
    } else {
      setRemoteDiagnosticHint("FCM: getToken returned empty");
    }

    await FirebaseMessaging.addListener("tokenReceived", (event) => {
      if (event.token) setRemoteFcmToken(event.token);
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[fcm] registration failed:", msg);
    setRemoteDiagnosticHint(`FCM: ${msg}`);
  }
}
