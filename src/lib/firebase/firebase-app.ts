/**
 * Shared Firebase JS App / Auth / Firestore / Storage.
 *
 * OCR and Live Activity already use this Auth instance (anonymous when the
 * user has not Google-signed-in). Phase 8 Google Sign-In signs into the SAME
 * instance so Firestore rules, Storage, and callables share one UID.
 *
 * Firestore persistence is left at the SDK default. Essences' working copy is
 * always local V3 (`essences-app-data-v3`), not the Firestore SDK cache.
 */

import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  initializeAuth,
  indexedDBLocalPersistence,
  browserLocalPersistence,
  inMemoryPersistence,
  type Auth,
} from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getStorage, type FirebaseStorage } from "firebase/storage";
import { readFirebaseWebConfig } from "./firebase-config";

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let storage: FirebaseStorage | null = null;

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

export function ensureFirebaseJs(): {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  storage: FirebaseStorage;
} | null {
  const config = readFirebaseWebConfig();
  if (!config) return null;
  if (!app) {
    app = getApps().length ? getApps()[0]! : initializeApp(config);
  }
  if (!auth) auth = getOrInitAuth(app);
  if (!db) db = getFirestore(app);
  if (!storage) storage = getStorage(app);
  return { app, auth, db, storage };
}

export function getFirebaseJsAuth(): Auth | null {
  return ensureFirebaseJs()?.auth ?? null;
}

export function getFirebaseJsFirestore(): Firestore | null {
  return ensureFirebaseJs()?.db ?? null;
}

export function getFirebaseJsStorage(): FirebaseStorage | null {
  return ensureFirebaseJs()?.storage ?? null;
}
