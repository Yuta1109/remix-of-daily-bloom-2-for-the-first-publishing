import { Capacitor } from "@capacitor/core";
import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
  type Auth,
} from "firebase/auth";
import {
  getFirestore,
  doc,
  setDoc,
  collection,
  writeBatch,
  getDocs,
  query,
  where,
  type Firestore,
} from "firebase/firestore";
import { LiveActivities, isLiveActivitySupported, currentLocale } from "./live-activity";
import { collectLiveActivityWindows } from "./live-activity-window";

/**
 * Remote Live Activity scheduling via Firebase (project todolist-app-project-4fd37).
 *
 * showAtEpochMs = max(start − lead, now) so enabling LA inside an already-open
 * window (lead 4h, event in 3h) schedules an immediate push / local start.
 *
 * Requires VITE_FIREBASE_WEB_CONFIG baked at Vite build time (CI derives it from
 * GoogleService-Info.plist and/or FIREBASE_WEB_CONFIG secret). Without it the
 * app never talks to Firestore — Usage stays at zero.
 */

const PROJECT_ID = "todolist-app-project-4fd37";

export type FirebaseWebConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId: string;
  appId: string;
};

export type LiveActivityRemoteStatus = {
  supported: boolean;
  configPresent: boolean;
  projectId: string | null;
  authenticated: boolean;
  deviceUid: string | null;
  hasFcmToken: boolean;
  hasPushToStartToken: boolean;
  lastError: string | null;
  lastSyncAt: number | null;
};

function readWebConfig(): FirebaseWebConfig | null {
  const raw = import.meta.env.VITE_FIREBASE_WEB_CONFIG as string | undefined;
  if (raw?.trim()) {
    try {
      const parsed = JSON.parse(raw) as FirebaseWebConfig;
      if (parsed?.apiKey && parsed?.projectId && parsed?.appId && parsed?.messagingSenderId) {
        return parsed;
      }
      console.warn("[la-remote] VITE_FIREBASE_WEB_CONFIG missing required keys");
    } catch {
      console.warn("[la-remote] Invalid VITE_FIREBASE_WEB_CONFIG JSON");
    }
  }
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY as string | undefined;
  const appId = import.meta.env.VITE_FIREBASE_APP_ID as string | undefined;
  const messagingSenderId = import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined;
  if (!apiKey || !appId || !messagingSenderId) return null;
  return {
    apiKey,
    authDomain: (import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string) || `${PROJECT_ID}.firebaseapp.com`,
    projectId: (import.meta.env.VITE_FIREBASE_PROJECT_ID as string) || PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
    messagingSenderId,
    appId,
  };
}

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let initPromise: Promise<boolean> | null = null;
let deviceUid: string | null = null;
let pushToStartToken: string | null = null;
let fcmToken: string | null = null;
let lastError: string | null = null;
let lastSyncAt: number | null = null;
let cachedConfig: FirebaseWebConfig | null | undefined;

function webConfig(): FirebaseWebConfig | null {
  if (cachedConfig === undefined) cachedConfig = readWebConfig();
  return cachedConfig;
}

function setError(err: unknown): void {
  lastError = err instanceof Error ? err.message : String(err);
  console.warn("[la-remote]", lastError);
}

export function getLiveActivityRemoteStatus(): LiveActivityRemoteStatus {
  const config = webConfig();
  return {
    supported: isLiveActivitySupported(),
    configPresent: !!config,
    projectId: config?.projectId ?? null,
    authenticated: !!deviceUid,
    deviceUid,
    hasFcmToken: !!fcmToken,
    hasPushToStartToken: !!pushToStartToken,
    lastError,
    lastSyncAt,
  };
}

async function ensureFirebase(): Promise<boolean> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    if (!isLiveActivitySupported()) return false;
    const config = webConfig();
    if (!config) {
      lastError =
        "Firebase web config missing in this build (VITE_FIREBASE_WEB_CONFIG). Rebuild after CI plist/config fix.";
      console.info("[la-remote]", lastError);
      return false;
    }
    app = getApps().length ? getApps()[0]! : initializeApp(config);
    auth = getAuth(app);
    db = getFirestore(app);
    await new Promise<void>((resolve, reject) => {
      const unsub = onAuthStateChanged(
        auth!,
        async (user) => {
          unsub();
          try {
            if (!user) {
              const cred = await signInAnonymously(auth!);
              deviceUid = cred.user.uid;
            } else {
              deviceUid = user.uid;
            }
            lastError = null;
            resolve();
          } catch (err) {
            reject(err);
          }
        },
        reject,
      );
    });
    return true;
  })().catch((err) => {
    setError(err);
    initPromise = null;
    return false;
  });
  return initPromise;
}

async function upsertDeviceDoc(): Promise<void> {
  if (!db || !deviceUid) return;
  try {
    await setDoc(
      doc(db, "devices", deviceUid),
      {
        pushToStartToken: pushToStartToken ?? null,
        fcmToken: fcmToken ?? null,
        platform: Capacitor.getPlatform(),
        updatedAt: Date.now(),
      },
      { merge: true },
    );
    lastSyncAt = Date.now();
    lastError = null;
  } catch (err) {
    setError(err);
  }
}

/**
 * Call once on native boot. Starts push-to-start token observation and
 * syncs schedules to Firestore when config is present.
 */
export async function initLiveActivityRemote(): Promise<void> {
  if (!isLiveActivitySupported()) return;

  try {
    await LiveActivities.startPushToStartTokenUpdates();
    const cap = LiveActivities as unknown as {
      addListener?: (
        event: string,
        cb: (data: { token: string }) => void,
      ) => Promise<{ remove: () => void }>;
    };
    if (cap.addListener) {
      await cap.addListener("pushToStartToken", (data) => {
        pushToStartToken = data.token;
        void ensureFirebase().then((ok) => {
          if (ok) void upsertDeviceDoc().then(() => syncLiveActivitySchedulesRemote());
        });
      });
    }
  } catch (err) {
    setError(err);
  }

  const ok = await ensureFirebase();
  if (!ok) return;
  await upsertDeviceDoc();
  await syncLiveActivitySchedulesRemote();
}

/** Replace this device's pending LA schedules in Firestore. */
export async function syncLiveActivitySchedulesRemote(): Promise<void> {
  const ok = await ensureFirebase();
  if (!ok || !db || !deviceUid) return;

  try {
    const now = new Date();
    const locale = currentLocale();
    const windows = collectLiveActivityWindows(now);

    const existing = await getDocs(
      query(collection(db, "laSchedules"), where("deviceId", "==", deviceUid)),
    );
    const batch = writeBatch(db);
    existing.forEach((d) => batch.delete(d.ref));

    for (const w of windows) {
      const ref = doc(collection(db, "laSchedules"), `${deviceUid}_${w.eventId}`);
      batch.set(ref, {
        deviceId: deviceUid,
        eventId: w.eventId,
        title: w.title,
        color: w.color,
        locale,
        showAtEpochMs: w.showAtEpochMs,
        endAtEpochMs: w.endEpochMs,
        startEpochMs: w.startEpochMs,
        status: w.activeNow ? "due" : "pending",
        updatedAt: Date.now(),
      });
    }
    await batch.commit();
    lastSyncAt = Date.now();
    lastError = null;
  } catch (err) {
    setError(err);
  }
}

/** Optional: set FCM token from native Messaging when available. */
export function setRemoteFcmToken(token: string | null): void {
  fcmToken = token;
  void ensureFirebase().then((ok) => {
    if (ok) void upsertDeviceDoc();
  });
}
