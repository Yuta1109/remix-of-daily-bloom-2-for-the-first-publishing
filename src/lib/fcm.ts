import { Capacitor } from "@capacitor/core";
import { FirebaseMessaging } from "@capacitor-firebase/messaging";
import { setRemoteFcmToken, setRemoteDiagnosticHint } from "./la-remote";
import { LiveActivities } from "./live-activity";
import { laDebugLog } from "./la-debug-log";

let listenersBound = false;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function fetchFcmTokenWithRetry(attempts = 12): Promise<string | null> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      laDebugLog("fcm", `getToken attempt ${i + 1}/${attempts}…`);
      const { token } = await FirebaseMessaging.getToken();
      if (token) {
        laDebugLog("fcm", `getToken OK (len=${token.length})`, "ok");
        return token;
      }
      laDebugLog("fcm", `getToken returned empty`, "warn");
    } catch (err) {
      lastErr = err;
      laDebugLog("fcm", `getToken error: ${errMsg(err)}`, "error");
    }
    await sleep(750 * (i + 1));
  }
  if (lastErr) throw lastErr;
  return null;
}

async function readNativeDebug(): Promise<Record<string, unknown> | null> {
  try {
    const info = await (
      LiveActivities as unknown as {
        getTokenDebugInfo: () => Promise<Record<string, unknown>>;
      }
    ).getTokenDebugInfo();
    laDebugLog(
      "native",
      `debug apnsBytes=${info.apnsCacheBytes} plist=${info.hasGoogleServiceInfoPlist} ` +
        `LA.enabled=${info.activitiesEnabled} pts=${info.hasPushToStartToken} ` +
        `ios=${info.iosVersion} apnsErr=${info.apnsRegisterError ?? "none"}`,
    );
    return info;
  } catch (err) {
    laDebugLog("native", `getTokenDebugInfo failed: ${errMsg(err)}`, "error");
    return null;
  }
}

async function rebroadcastApns(): Promise<boolean> {
  try {
    const result = await (
      LiveActivities as unknown as {
        rebroadcastApnsToken: () => Promise<{
          rebroadcast: boolean;
          apnsCacheBytes: number;
          apnsRegisterError?: string;
        }>;
      }
    ).rebroadcastApnsToken();
    laDebugLog(
      "apns",
      `rebroadcast=${result.rebroadcast} cacheBytes=${result.apnsCacheBytes}` +
        (result.apnsRegisterError ? ` err=${result.apnsRegisterError}` : ""),
      result.rebroadcast ? "ok" : "warn",
    );
    return result.rebroadcast;
  } catch (err) {
    laDebugLog("apns", `rebroadcastApnsToken failed: ${errMsg(err)}`, "error");
    return false;
  }
}

/**
 * Wait until native Messaging has an APNs device token (or timeout).
 */
async function waitForApnsToken(timeoutMs = 15_000): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false;
    let handle: { remove: () => Promise<void> } | undefined;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      void handle?.remove();
      laDebugLog("apns", ok ? "apnsTokenReceived fired" : `apns wait timed out (${timeoutMs}ms)`, ok ? "ok" : "warn");
      resolve(ok);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    void FirebaseMessaging.addListener("apnsTokenReceived", () => {
      clearTimeout(timer);
      finish(true);
    })
      .then((h) => {
        handle = h;
      })
      .catch((err) => {
        clearTimeout(timer);
        laDebugLog("apns", `apnsTokenReceived listener failed: ${errMsg(err)}`, "error");
        finish(false);
      });
  });
}

/**
 * Request notification permission (if needed) and upload the FCM registration
 * token to Firestore via setRemoteFcmToken.
 */
export async function initFcmRegistration(): Promise<void> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "ios") {
    return;
  }

  laDebugLog("fcm", "initFcmRegistration start");

  try {
    const perm = await FirebaseMessaging.checkPermissions();
    laDebugLog("fcm", `permission=${perm.receive}`);
    if (perm.receive !== "granted") {
      const req = await FirebaseMessaging.requestPermissions();
      laDebugLog("fcm", `requestPermissions → ${req.receive}`);
      if (req.receive !== "granted") {
        setRemoteDiagnosticHint("FCM: notification permission not granted");
        laDebugLog("fcm", "aborted: permission not granted", "error");
        return;
      }
    }

    try {
      await FirebaseMessaging.requestPermissions();
    } catch {
      /* already granted */
    }

    if (!listenersBound) {
      listenersBound = true;
      await FirebaseMessaging.addListener("tokenReceived", (event) => {
        if (event.token) {
          laDebugLog("fcm", `tokenReceived event (len=${event.token.length})`, "ok");
          setRemoteFcmToken(event.token);
        }
      });
      try {
        await FirebaseMessaging.addListener("apnsTokenReceived", (ev) => {
          const len =
            ev && typeof ev === "object" && "token" in ev
              ? String((ev as { token?: string }).token ?? "").length
              : 0;
          laDebugLog("apns", `apnsTokenReceived event (hexLen≈${len})`, "ok");
          void fetchFcmTokenWithRetry(6).then((token) => {
            if (token) setRemoteFcmToken(token);
          });
        });
      } catch (err) {
        laDebugLog("apns", `could not add apnsTokenReceived: ${errMsg(err)}`, "warn");
      }
    }

    const before = await readNativeDebug();
    const hadCache = Number(before?.apnsCacheBytes ?? 0) > 0;
    if (!hadCache) {
      laDebugLog(
        "apns",
        "No APNs device token cached yet — will wait / rebroadcast. " +
          "If this stays 0, didRegisterForRemoteNotifications never ran (check apnsRegisterError).",
        "warn",
      );
    }

    // Ask Messaging plugin to see the cached APNs token again BEFORE getToken.
    await rebroadcastApns();
    const apnsOk = hadCache || (await waitForApnsToken(12_000));

    if (!apnsOk) {
      const after = await readNativeDebug();
      const apnsErr = after?.apnsRegisterError;
      const hint = apnsErr
        ? `FCM: APNs registration failed — ${String(apnsErr)}`
        : "FCM: No APNS token specified before fetching FCM Token (APNs device token never arrived). Check Push entitlement, GoogleService-Info.plist in IPA, and that the device can reach APNs.";
      setRemoteDiagnosticHint(hint);
      laDebugLog("fcm", `skip getToken — no APNs yet. ${hint}`, "error");
      // Still try once so the exact Firebase error stays visible if any.
    }

    const token = await fetchFcmTokenWithRetry(apnsOk ? 12 : 3);
    if (token) {
      setRemoteFcmToken(token);
      laDebugLog("fcm", "FCM token stored for Firestore upload", "ok");
    } else {
      const after = await readNativeDebug();
      const hint =
        after?.apnsRegisterError
          ? `FCM: APNs failed — ${String(after.apnsRegisterError)}`
          : Number(after?.apnsCacheBytes ?? 0) === 0
            ? "FCM: No APNS token specified before fetching FCM Token (cache still empty)"
            : "FCM: getToken empty after retries despite APNs cache — Messaging may not have received apnsToken (plugin load / patch).";
      setRemoteDiagnosticHint(hint);
      laDebugLog("fcm", hint, "error");
    }
  } catch (err) {
    const msg = errMsg(err);
    console.warn("[fcm] registration failed:", msg);
    setRemoteDiagnosticHint(`FCM: ${msg}`);
    laDebugLog("fcm", `registration failed: ${msg}`, "error");
  }
}
