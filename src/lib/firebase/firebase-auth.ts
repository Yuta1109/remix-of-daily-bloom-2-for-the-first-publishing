/**
 * Essences Google Authentication.
 *
 * Native iOS uses `@capacitor-firebase/authentication` (Google Sign-In SDK),
 * then the ID token is applied to the existing Firebase JS Auth instance
 * (`skipNativeAuth`) so OCR, Live Activity, and V3 Firestore share one UID.
 *
 * Web (Vite) uses the plugin's JS implementation. iOS never relies on a
 * WebView Google popup as the primary path.
 */

import { Capacitor } from "@capacitor/core";
import { FirebaseAuthentication } from "@capacitor-firebase/authentication";
import {
  GoogleAuthProvider,
  linkWithCredential,
  onAuthStateChanged,
  signInWithCredential,
  signInWithPopup,
  signOut as jsSignOut,
  type User,
} from "firebase/auth";
import { ensureFirebaseJs, getFirebaseJsAuth } from "./firebase-app";
import { getFirebaseConfigStatus } from "./firebase-config";
import {
  GOOGLE_PROVIDER_ID,
  SIGNED_OUT,
  authStateFromProviders,
  type EssencesAuthState,
  type EssencesAuthUser,
} from "./auth-types";

export type { EssencesAuthState, EssencesAuthUser, AuthStatus } from "./auth-types";

type Listener = (state: EssencesAuthState) => void;

const listeners = new Set<Listener>();
let current: EssencesAuthState = SIGNED_OUT;
let authSubscription: (() => void) | null = null;

function providerIdsOf(user: User | null): string[] {
  return user?.providerData.map((p) => p.providerId) ?? [];
}

export function mapJsUser(user: User | null): EssencesAuthState {
  return authStateFromProviders(user?.uid ?? null, providerIdsOf(user), {
    email: user?.email ?? null,
    displayName: user?.displayName ?? null,
    photoURL: user?.photoURL ?? null,
  });
}

function emit(next: EssencesAuthState): void {
  current = next;
  for (const listener of listeners) listener(next);
}

export function getAuthState(): EssencesAuthState {
  return current;
}

export function getCurrentUser(): EssencesAuthUser | null {
  return current.status === "signed_in" ? current.user : null;
}

export function getFirebaseUid(): string | null {
  return getCurrentUser()?.uid ?? null;
}

export function subscribeAuthState(listener: Listener): () => void {
  listeners.add(listener);
  listener(current);
  return () => {
    listeners.delete(listener);
  };
}

function attachJsAuthListener(): void {
  if (authSubscription) return;
  const auth = getFirebaseJsAuth();
  if (!auth) return;
  authSubscription = onAuthStateChanged(auth, (user) => {
    if (current.status === "signing_in") {
      const mapped = mapJsUser(user);
      if (mapped.status === "signed_in") emit(mapped);
      return;
    }
    emit(mapJsUser(user));
  });
}

export function startAuthListener(): EssencesAuthState {
  const ready = ensureFirebaseJs();
  if (!ready) {
    emit(SIGNED_OUT);
    return current;
  }
  attachJsAuthListener();
  emit(mapJsUser(ready.auth.currentUser));
  return current;
}

async function applyGoogleIdToken(idToken: string): Promise<User> {
  const ctx = ensureFirebaseJs();
  if (!ctx) throw new Error("Firebase web config is missing");
  const credential = GoogleAuthProvider.credential(idToken);
  const currentUser = ctx.auth.currentUser;
  if (currentUser?.isAnonymous) {
    try {
      const linked = await linkWithCredential(currentUser, credential);
      return linked.user;
    } catch (err) {
      const code = (err as { code?: string }).code ?? "";
      if (code !== "auth/credential-already-in-use" && code !== "auth/email-already-in-use") {
        throw err;
      }
    }
  }
  const signed = await signInWithCredential(ctx.auth, credential);
  return signed.user;
}

export async function signInWithGoogle(): Promise<EssencesAuthState> {
  if (!getFirebaseConfigStatus().present) {
    const next: EssencesAuthState = {
      status: "error",
      user: null,
      errorMessage: "Firebase web config is missing",
    };
    emit(next);
    return next;
  }
  emit({ status: "signing_in", user: current.user, errorMessage: null });
  try {
    const ctx = ensureFirebaseJs();
    if (!ctx) throw new Error("Firebase web config is missing");
    attachJsAuthListener();
    let user: User;
    if (Capacitor.isNativePlatform()) {
      const result = await FirebaseAuthentication.signInWithGoogle({ skipNativeAuth: true });
      const idToken = result.credential?.idToken;
      if (!idToken) throw new Error("Google Sign-In did not return an ID token");
      user = await applyGoogleIdToken(idToken);
    } else {
      const popup = await signInWithPopup(ctx.auth, new GoogleAuthProvider());
      user = popup.user;
    }
    const next = mapJsUser(user);
    emit(next);
    return next;
  } catch (err) {
    const next: EssencesAuthState = {
      status: "error",
      user: null,
      errorMessage: err instanceof Error ? err.message : String(err),
    };
    emit(next);
    return next;
  }
}

export async function signOut(): Promise<EssencesAuthState> {
  try {
    if (Capacitor.isNativePlatform()) {
      try {
        await FirebaseAuthentication.signOut();
      } catch {
        /* native session may already be empty when skipNativeAuth is true */
      }
    }
    const auth = getFirebaseJsAuth();
    if (auth) await jsSignOut(auth);
  } catch (err) {
    const next: EssencesAuthState = {
      status: "error",
      user: current.user,
      errorMessage: err instanceof Error ? err.message : String(err),
    };
    emit(next);
    return next;
  }
  emit(SIGNED_OUT);
  return current;
}

export { isGoogleLinkedUser } from "./auth-types";
