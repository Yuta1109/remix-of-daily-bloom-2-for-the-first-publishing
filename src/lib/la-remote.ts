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

function readWebConfig(): FirebaseWebConfig | null {
  const raw = import.meta.env.VITE_FIREBASE_WEB_CONFIG as string | undefined;
  if (raw?.trim()) {
    try {
      return JSON.parse(raw) as FirebaseWebConfig;
    } catch {
      console.warn("[la-remote] Invalid VITE_FIREBASE_WEB_CONFIG JSON");
    }
  }
  // Fallback: individual Vite env vars (optional).
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

async function ensureFirebase(): Promise<boolean> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    if (!isLiveActivitySupported()) return false;
    const config = readWebConfig();
    if (!config) {
      console.info(
        "[la-remote] Firebase web config missing — local LA still works; remote push disabled until VITE_FIREBASE_WEB_CONFIG is set",
      );
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
    console.warn("[la-remote] Firebase init failed:", err);
    initPromise = null;
    return false;
  });
  return initPromise;
}

async function upsertDeviceDoc(): Promise<void> {
  if (!db || !deviceUid) return;
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
}

/**
 * Call once on native boot. Starts push-to-start token observation and
 * syncs schedules to Firestore when config is present.
 */
export async function initLiveActivityRemote(): Promise<void> {
  if (!isLiveActivitySupported()) return;

  // Always observe push-to-start token (needed once Firebase is configured).
  try {
    await LiveActivities.startPushToStartTokenUpdates();
    // Plugin emits "pushToStartToken" events via addListener
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
    console.warn("[la-remote] push-to-start observe failed:", err);
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

  const now = new Date();
  const locale = currentLocale();
  const windows = collectLiveActivityWindows(now);

  // Delete previous schedules for this device, then write current set.
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
}

/** Optional: set FCM token from native Messaging when available. */
export function setRemoteFcmToken(token: string | null): void {
  fcmToken = token;
  void ensureFirebase().then((ok) => {
    if (ok) void upsertDeviceDoc();
  });
}
