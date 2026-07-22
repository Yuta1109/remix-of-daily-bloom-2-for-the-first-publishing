import { Capacitor } from "@capacitor/core";
import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  initializeAuth,
  indexedDBLocalPersistence,
  signInAnonymously,
  type Auth,
} from "firebase/auth";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  collection,
  writeBatch,
  getDocs,
  query,
  where,
  type Firestore,
} from "firebase/firestore";
import { LiveActivities, isLiveActivitySupported, currentLocale } from "./live-activity";
import { collectLiveActivityWindows } from "./live-activity-window";
import { laDebugLog } from "./la-debug-log";

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
  hasUpdateToken: boolean;
  lastError: string | null;
  lastSyncAt: number | null;
  diagnosticHint: string | null;
};

/** Server-side FCM update attempts (written by Cloud Functions). */
export type RemoteLaAttempt = {
  at: number;
  scheduleId?: string;
  phase?: string;
  ok: boolean;
  code?: string | null;
  error?: string | null;
  hint?: string | null;
};

export type RemoteLaScheduleDiag = {
  id: string;
  status?: string;
  title?: string;
  lastRemoteUpdateAt?: number;
  lastRemoteUpdateOk?: boolean;
  lastRemoteUpdateCode?: string;
  lastRemoteUpdateError?: string;
  lastRemoteUpdateHint?: string;
  lastRemoteUpdatePhase?: string;
};

export type RemoteLaDiagnostics = {
  fetchedAt: number;
  attempts: RemoteLaAttempt[];
  lastAttempt: RemoteLaAttempt | null;
  schedules: RemoteLaScheduleDiag[];
};

function readWebConfig(): FirebaseWebConfig | null {
  const raw = import.meta.env.VITE_FIREBASE_WEB_CONFIG as string | undefined;
  if (raw?.trim()) {
    try {
      const parsed = JSON.parse(raw) as FirebaseWebConfig;
      if (parsed?.apiKey && parsed?.projectId && parsed?.appId && parsed?.messagingSenderId) {
        return {
          ...parsed,
          authDomain: parsed.authDomain || `${parsed.projectId}.firebaseapp.com`,
        };
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
let liveActivityUpdateToken: string | null = null;
let lastError: string | null = null;
let lastSyncAt: number | null = null;
let cachedConfig: FirebaseWebConfig | null | undefined;
let pushToStartListenerBound = false;
let updateTokenListenerBound = false;
let diagnosticHint: string | null = null;

function webConfig(): FirebaseWebConfig | null {
  if (cachedConfig === undefined) cachedConfig = readWebConfig();
  return cachedConfig;
}

function setError(err: unknown): void {
  const code =
    err && typeof err === "object" && "code" in err
      ? String((err as { code?: string }).code)
      : "";
  const msg = err instanceof Error ? err.message : String(err);
  lastError = code ? `${code}: ${msg}` : msg;
  console.warn("[la-remote]", lastError);
}

/** Surface non-fatal FCM / token hints in Settings without clearing Auth success. */
export function setRemoteDiagnosticHint(hint: string): void {
  diagnosticHint = hint;
  if (!deviceUid) {
    lastError = hint;
    return;
  }
  // Keep Auth/Firestore success visible; append token hint.
  if (
    !lastError ||
    lastError.startsWith("FCM:") ||
    lastError.startsWith("FirebaseApp:") ||
    lastError.startsWith("LA:")
  ) {
    lastError = hint;
  }
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
    hasUpdateToken: !!liveActivityUpdateToken,
    lastError,
    lastSyncAt,
    diagnosticHint,
  };
}

/**
 * Pull Cloud Functions remote-update results into the Settings copyable log.
 * Works in TestFlight/release — no Xcode needed.
 */
export async function fetchRemoteLaDiagnostics(): Promise<RemoteLaDiagnostics | null> {
  const ok = await ensureFirebase();
  if (!ok || !db || !deviceUid) return null;

  try {
    const deviceSnap = await getDoc(doc(db, "devices", deviceUid));
    const deviceData = deviceSnap.exists() ? deviceSnap.data() : null;
    const attempts = Array.isArray(deviceData?.remoteLaAttempts)
      ? (deviceData!.remoteLaAttempts as RemoteLaAttempt[])
      : [];
    const lastAttempt =
      (deviceData?.lastRemoteLaAttempt as RemoteLaAttempt | undefined) ||
      attempts[0] ||
      null;

    const scheduleSnap = await getDocs(
      query(collection(db, "laSchedules"), where("deviceId", "==", deviceUid)),
    );
    const schedules: RemoteLaScheduleDiag[] = scheduleSnap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        status: data.status,
        title: data.title,
        lastRemoteUpdateAt: data.lastRemoteUpdateAt,
        lastRemoteUpdateOk: data.lastRemoteUpdateOk,
        lastRemoteUpdateCode: data.lastRemoteUpdateCode,
        lastRemoteUpdateError: data.lastRemoteUpdateError,
        lastRemoteUpdateHint: data.lastRemoteUpdateHint,
        lastRemoteUpdatePhase: data.lastRemoteUpdatePhase,
      };
    });

    const diag: RemoteLaDiagnostics = {
      fetchedAt: Date.now(),
      attempts: attempts.slice(0, 12),
      lastAttempt,
      schedules,
    };

    if (lastAttempt && !lastAttempt.ok) {
      const line = [
        lastAttempt.code || "remote-fail",
        lastAttempt.error?.slice(0, 120),
        lastAttempt.hint?.slice(0, 160),
      ]
        .filter(Boolean)
        .join(" | ");
      laDebugLog("remote", line, "error");
      if (lastAttempt.hint) {
        setRemoteDiagnosticHint(lastAttempt.hint);
      }
    } else if (schedules.some((s) => s.lastRemoteUpdateOk === false)) {
      const bad = schedules.find((s) => s.lastRemoteUpdateOk === false)!;
      laDebugLog(
        "remote",
        `${bad.lastRemoteUpdateCode || "fail"}: ${bad.lastRemoteUpdateError || ""}`.slice(0, 200),
        "error",
      );
      if (bad.lastRemoteUpdateHint) setRemoteDiagnosticHint(bad.lastRemoteUpdateHint);
    } else if (lastAttempt?.ok) {
      laDebugLog("remote", `last FCM update ok phase=${lastAttempt.phase}`, "ok");
    } else {
      laDebugLog("remote", "no remote FCM update attempts recorded yet", "warn");
    }

    return diag;
  } catch (err) {
    laDebugLog(
      "remote",
      `fetch diagnostics failed: ${err instanceof Error ? err.message : String(err)}`,
      "error",
    );
    return null;
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

function getOrInitAuth(firebaseApp: FirebaseApp): Auth {
  try {
    // WKWebView: default getAuth() persistence can hang; indexedDB is reliable.
    return initializeAuth(firebaseApp, {
      persistence: indexedDBLocalPersistence,
    });
  } catch {
    return getAuth(firebaseApp);
  }
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
    auth = getOrInitAuth(app);
    db = getFirestore(app);
    await withTimeout(
      (async () => {
        if (auth!.currentUser) {
          deviceUid = auth!.currentUser.uid;
          lastError = null;
          return;
        }
        const cred = await signInAnonymously(auth!);
        deviceUid = cred.user.uid;
        lastError = null;
      })(),
      30_000,
      "Firebase Auth",
    );
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
    // Never write null over a real token — boot races used to wipe FCM/LA tokens.
    const payload: Record<string, unknown> = {
      platform: Capacitor.getPlatform(),
      updatedAt: Date.now(),
    };
    if (pushToStartToken) payload.pushToStartToken = pushToStartToken;
    if (fcmToken) payload.fcmToken = fcmToken;
    if (liveActivityUpdateToken) payload.liveActivityUpdateToken = liveActivityUpdateToken;

    await setDoc(doc(db, "devices", deviceUid), payload, { merge: true });
    lastSyncAt = Date.now();
    // Do NOT clear FCM/LA token diagnostics here — schedule sync can succeed
    // while tokens are still missing (the exact Settings FCM✗ · LA✗ case).
    if (fcmToken && pushToStartToken && lastError?.startsWith("LA:")) {
      lastError = null;
      diagnosticHint = null;
    }
    if (fcmToken && lastError?.startsWith("FCM:")) {
      lastError = null;
      if (diagnosticHint?.startsWith("FCM:")) diagnosticHint = null;
    }
  } catch (err) {
    setError(err);
  }
}

/**
 * Call once on native boot. Starts push-to-start token observation and
 * syncs schedules to Firestore when config is present.
 */
async function ingestPushToStartToken(token: string | null | undefined): Promise<void> {
  if (!token) return;
  pushToStartToken = token;
  laDebugLog("la", `pushToStart ingested (len=${token.length})`, "ok");
  const ok = await ensureFirebase();
  if (ok) {
    await upsertDeviceDoc();
    await syncLiveActivitySchedulesRemote();
  }
}

export async function initLiveActivityRemote(): Promise<void> {
  if (!isLiveActivitySupported()) return;
  laDebugLog("la", "initLiveActivityRemote start");

  try {
    const cap = LiveActivities as unknown as {
      addListener?: (
        event: string,
        cb: (data: { token: string }) => void,
      ) => Promise<{ remove: () => void }>;
    };
    // Register the listener BEFORE starting updates so the first token is not missed.
    if (cap.addListener && !pushToStartListenerBound) {
      pushToStartListenerBound = true;
      await cap.addListener("pushToStartToken", (data) => {
        void ingestPushToStartToken(data.token);
      });
      laDebugLog("la", "pushToStartToken listener bound");
    }
    if (cap.addListener && !updateTokenListenerBound) {
      updateTokenListenerBound = true;
      await cap.addListener("liveActivityUpdateToken", (data) => {
        if (!data.token) return;
        liveActivityUpdateToken = data.token;
        laDebugLog("la", `updateToken ingested (len=${data.token.length})`, "ok");
        void ensureFirebase().then((ok) => {
          if (ok) void upsertDeviceDoc();
        });
      });
      laDebugLog("la", "liveActivityUpdateToken listener bound");
    }
    await LiveActivities.startPushToStartTokenUpdates();

    // Poll — ActivityKit often emits push-to-start several seconds after launch.
    for (let i = 0; i < 20 && !pushToStartToken; i++) {
      try {
        const { token } = await LiveActivities.getPushToStartToken();
        if (token) {
          await ingestPushToStartToken(token);
          break;
        }
        if (i === 0 || i === 4 || i === 9 || i === 19) {
          laDebugLog("la", `pushToStart poll ${i + 1}/20 — still empty`);
        }
      } catch (err) {
        laDebugLog(
          "la",
          `getPushToStartToken failed: ${err instanceof Error ? err.message : String(err)}`,
          "error",
        );
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
    if (!pushToStartToken) {
      try {
        const { enabled } = await LiveActivities.areEnabled();
        if (!enabled) {
          setRemoteDiagnosticHint(
            "LA: Live Activities are OFF for Essences (iOS Settings → Essences → Live Activities). push-to-start token will not arrive.",
          );
          laDebugLog("la", "activitiesEnabled=false", "error");
        } else {
          setRemoteDiagnosticHint(
            "LA: push-to-start token not available yet (iOS 17.2+, Live Activities On, and ActivityKit must emit a token — reopen app / Recheck after a minute)",
          );
          laDebugLog("la", "activitiesEnabled=true but no pushToStart yet", "warn");
        }
      } catch (err) {
        setRemoteDiagnosticHint(
          "LA: push-to-start token not available yet (LiveActivities plugin may be missing from packageClassList — run setup_widget.rb after cap sync)",
        );
        laDebugLog(
          "la",
          `areEnabled failed: ${err instanceof Error ? err.message : String(err)}`,
          "error",
        );
      }
    }

    // Update token: rebroadcast cache + poll; refreshLiveActivities may relaunch local-only LA with push.
    try {
      const { token } = await LiveActivities.getUpdateToken();
      if (token) {
        liveActivityUpdateToken = token;
        laDebugLog("la", `updateToken from native cache (len=${token.length})`, "ok");
        await upsertDeviceDoc();
      } else {
        laDebugLog(
          "la",
          "updateToken still empty — will rely on Live Activity relaunch with pushType:.token",
          "warn",
        );
      }
    } catch (err) {
      laDebugLog(
        "la",
        `getUpdateToken failed: ${err instanceof Error ? err.message : String(err)}`,
        "warn",
      );
    }
  } catch (err) {
    setError(err);
    laDebugLog(
      "la",
      `initLiveActivityRemote error: ${err instanceof Error ? err.message : String(err)}`,
      "error",
    );
  }

  const ok = await ensureFirebase();
  laDebugLog("la", `firebase ensure → ${ok} uid=${deviceUid?.slice(0, 8) ?? "none"}`);
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
    const nowMs = now.getTime();
    const locale = currentLocale();
    // Keep lead + linger windows so remote aggregates can show up to 3 rows.
    const windows = collectLiveActivityWindows(now).filter(
      (w) => w.visibleNow || w.showAtEpochMs > nowMs,
    );

    const existing = await getDocs(
      query(collection(db, "laSchedules"), where("deviceId", "==", deviceUid)),
    );
    const existingById = new Map(existing.docs.map((d) => [d.id, d]));
    const desiredIds = new Set<string>();
    const batch = writeBatch(db);

    for (const w of windows) {
      const id = `${deviceUid}_${w.eventId}`;
      desiredIds.add(id);
      const ref = doc(collection(db, "laSchedules"), id);
      const prev = existingById.get(id)?.data() as
        | {
            status?: string;
            showAtEpochMs?: number;
            startEpochMs?: number;
            endAtEpochMs?: number;
          }
        | undefined;

      // pending: future showAt
      // due: lead window open, waiting for FCM start
      // started: local or remote activity is (or should be) live, including linger
      let status: "pending" | "due" | "started" = "pending";
      if (w.activeNow) {
        if (liveActivityUpdateToken || prev?.status === "started") {
          status = "started";
        } else {
          status = "due";
        }
      } else if (w.visibleNow && nowMs >= w.startEpochMs) {
        status = "started";
      } else if (prev?.status === "started" && w.visibleNow) {
        status = "started";
      }

      // Preserve Cloud Task ids / remote diagnostics — never wipe the doc.
      if (
        prev &&
        prev.status === status &&
        prev.showAtEpochMs === w.showAtEpochMs &&
        prev.startEpochMs === w.startEpochMs &&
        prev.endAtEpochMs === w.endEpochMs
      ) {
        batch.set(
          ref,
          {
            title: w.title,
            color: w.color,
            locale,
            updatedAt: Date.now(),
          },
          { merge: true },
        );
        continue;
      }

      batch.set(
        ref,
        {
          deviceId: deviceUid,
          eventId: w.eventId,
          title: w.title,
          color: w.color,
          locale,
          showAtEpochMs: w.showAtEpochMs,
          endAtEpochMs: w.endEpochMs,
          startEpochMs: w.startEpochMs,
          status,
          updatedAt: Date.now(),
        },
        { merge: true },
      );
    }

    existing.forEach((d) => {
      if (!desiredIds.has(d.id)) batch.delete(d.ref);
    });
    await batch.commit();
    lastSyncAt = Date.now();
    // Preserve token-acquisition diagnostics (FCM✗ / pushToStart✗).
    if (
      lastError &&
      (lastError.startsWith("FCM:") ||
        lastError.startsWith("LA:") ||
        lastError.startsWith("FirebaseApp:"))
    ) {
      /* keep */
    } else {
      lastError = null;
    }
  } catch (err) {
    setError(err);
  }
}

/** Optional: set FCM token from native Messaging when available. */
export function setRemoteFcmToken(token: string | null): void {
  if (!token) return;
  fcmToken = token;
  diagnosticHint = null;
  void ensureFirebase().then(async (ok) => {
    if (!ok) return;
    await upsertDeviceDoc();
    // Re-write schedules so Cloud Functions retry any stuck "due" rows.
    await syncLiveActivitySchedulesRemote();
  });
}
