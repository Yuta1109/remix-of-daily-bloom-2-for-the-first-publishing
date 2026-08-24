import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  initializeAuth,
  indexedDBLocalPersistence,
  browserLocalPersistence,
  inMemoryPersistence,
  signInAnonymously,
  type Auth,
} from "firebase/auth";
import { getFunctions, httpsCallable, type Functions } from "firebase/functions";

const PROJECT_ID = "todolist-app-project-4fd37";
const REGION = "asia-northeast1";
/** Keep below Function timeout (120s) with a small buffer; 55s was far too short. */
const CALLABLE_TIMEOUT_MS = 110_000;
const AUTH_TIMEOUT_MS = 12_000;

type FirebaseWebConfig = {
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
      const parsed = JSON.parse(raw) as FirebaseWebConfig;
      if (parsed?.apiKey && parsed?.projectId && parsed?.appId && parsed?.messagingSenderId) {
        return {
          ...parsed,
          authDomain: parsed.authDomain || `${parsed.projectId}.firebaseapp.com`,
        };
      }
    } catch {
      /* ignore */
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
let functions: Functions | null = null;
let ready: Promise<boolean> | null = null;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(label)), ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        window.clearTimeout(timer);
        reject(err);
      },
    );
  });
}

function getOrInitAuth(firebaseApp: FirebaseApp): Auth {
  const persistences = [indexedDBLocalPersistence, browserLocalPersistence, inMemoryPersistence];
  for (const persistence of persistences) {
    try {
      return initializeAuth(firebaseApp, { persistence });
    } catch {
      /* already initialized or this persistence is unavailable */
    }
  }
  return getAuth(firebaseApp);
}

export async function ensureCallableApp(): Promise<boolean> {
  if (ready) return ready;
  ready = (async () => {
    const config = readWebConfig();
    if (!config) return false;
    app = getApps().length ? getApps()[0]! : initializeApp(config);
    auth = getOrInitAuth(app);
    if (!auth.currentUser) {
      await withTimeout(signInAnonymously(auth), AUTH_TIMEOUT_MS, "ocr-auth-timeout");
    }
    functions = getFunctions(app, REGION);
    return true;
  })().catch(() => {
    ready = null;
    return false;
  });
  return ready;
}

export type OcrCallResult =
  | { ok: true; tasks: string[]; text?: undefined }
  | { ok: true; text: string; tasks?: undefined }
  | { ok: false; error: "quota" | "unreadable" | "error" | "unavailable" };

function mapCallableError(err: unknown): OcrCallResult {
  const code = String((err as { code?: string })?.code || "");
  const msg = String((err as { message?: string })?.message || err);
  if (
    code.includes("unauthenticated") ||
    msg.includes("ocr-auth-timeout") ||
    msg.includes("ocr-auth-timeout") ||
    msg.includes("ocr-call-timeout") ||
    msg.includes("ocr-call-timeout")
  ) {
    return { ok: false, error: "unavailable" };
  }
  if (code.includes("resource-exhausted") || code.includes("unavailable")) {
    return { ok: false, error: "quota" };
  }
  if (code.includes("invalid-argument")) {
    return { ok: false, error: "unreadable" };
  }
  return { ok: false, error: "error" };
}

export async function callExtractTextFromImage(payload: {
  imageBase64: string;
  mimeType: string;
  mode: "note" | "tasks";
  requestId: string;
}): Promise<OcrCallResult> {
  const ok = await ensureCallableApp();
  if (!ok || !functions) return { ok: false, error: "unavailable" };
  try {
    const fn = httpsCallable<
      typeof payload,
      { ok?: boolean; text?: string; tasks?: string[]; error?: string }
    >(functions, "extractTextFromImage", { timeout: CALLABLE_TIMEOUT_MS });
    const res = await withTimeout(fn(payload), CALLABLE_TIMEOUT_MS + 2_000, "ocr-call-timeout");
    const data = res.data;
    if (data?.ok && payload.mode === "tasks") {
      const tasks = Array.isArray(data.tasks) ? data.tasks.map((t) => String(t).trim()).filter(Boolean) : [];
      if (!tasks.length) return { ok: false, error: "unreadable" };
      return { ok: true, tasks };
    }
    if (data?.ok && payload.mode === "note") {
      const text = String(data.text || "").trim();
      if (!text) return { ok: false, error: "unreadable" };
      return { ok: true, text };
    }
    const err = data?.error;
    if (err === "quota" || err === "unreadable") return { ok: false, error: err };
    return { ok: false, error: "error" };
  } catch (err) {
    return mapCallableError(err);
  }
}
