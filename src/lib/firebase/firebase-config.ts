/**
 * Shared Firebase web config.
 *
 * Secrets never live here. CI / `.env.local` supply `VITE_FIREBASE_WEB_CONFIG`
 * (derived from GoogleService-Info.plist). This module does not initialize Auth.
 */

export const FIREBASE_PROJECT_ID = "todolist-app-project-4fd37";
export const FIREBASE_FUNCTIONS_REGION = "asia-northeast1";
/** Vite (`vite.config.ts`) serves on port 8080. Firebase Auth authorized domains use the host only. */
export const FIREBASE_AUTH_AUTHORIZED_DOMAIN = "localhost";

export type FirebaseWebConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId: string;
  appId: string;
};

export function readFirebaseWebConfig(): FirebaseWebConfig | null {
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
      /* ignore malformed JSON */
    }
  }
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY as string | undefined;
  const appId = import.meta.env.VITE_FIREBASE_APP_ID as string | undefined;
  const messagingSenderId = import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined;
  if (!apiKey || !appId || !messagingSenderId) return null;
  return {
    apiKey,
    authDomain:
      (import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string) ||
      `${FIREBASE_PROJECT_ID}.firebaseapp.com`,
    projectId: (import.meta.env.VITE_FIREBASE_PROJECT_ID as string) || FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
    messagingSenderId,
    appId,
  };
}

export function getFirebaseConfigStatus() {
  const config = readFirebaseWebConfig();
  return {
    present: !!config,
    projectId: config?.projectId ?? null,
    hasApiKey: !!config?.apiKey,
    apiKeyPrefix: config?.apiKey?.slice(0, 8) ?? null,
    appId: config?.appId ?? null,
    messagingSenderId: config?.messagingSenderId ?? null,
  };
}
