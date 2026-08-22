import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  initializeAuth,
  indexedDBLocalPersistence,
  signInAnonymously,
  type Auth,
} from "firebase/auth";
import { getFunctions, httpsCallable, type Functions } from "firebase/functions";

const PROJECT_ID = "todolist-app-project-4fd37";
const REGION = "asia-northeast1";

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

function getOrInitAuth(firebaseApp: FirebaseApp): Auth {
  try {
    return initializeAuth(firebaseApp, { persistence: indexedDBLocalPersistence });
  } catch {
    return getAuth(firebaseApp);
  }
}

export async function ensureCallableApp(): Promise<boolean> {
  if (ready) return ready;
  ready = (async () => {
    const config = readWebConfig();
    if (!config) return false;
    app = getApps().length ? getApps()[0]! : initializeApp(config);
    auth = getOrInitAuth(app);
    if (!auth.currentUser) await signInAnonymously(auth);
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

export async function callExtractTextFromImage(payload: {
  imageBase64: string;
  mimeType: string;
  mode: "note" | "tasks";
}): Promise<OcrCallResult> {
  const ok = await ensureCallableApp();
  if (!ok || !functions) return { ok: false, error: "unavailable" };
  const fn = httpsCallable<
    typeof payload,
    { ok?: boolean; text?: string; tasks?: string[]; error?: string }
  >(functions, "extractTextFromImage");
  const res = await fn(payload);
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
}
