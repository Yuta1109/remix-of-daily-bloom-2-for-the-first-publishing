/**
 * Auth status for the Essences account layer.
 *
 * Anonymous Firebase Auth (OCR / Live Activity device docs) is NOT a signed-in
 * Essences user. Only a Firebase Auth user that has the Google provider counts.
 * Canonical identifier is `uid`, never email or displayName.
 */

export type AuthStatus = "signed_out" | "signing_in" | "signed_in" | "error";

export interface EssencesAuthUser {
  /** Firebase Auth UID — the only primary identifier. */
  uid: string;
  /** Display-only. Never used as an identity key. */
  email: string | null;
  /** Display-only. Never used as an identity key. */
  displayName: string | null;
  /** Display-only. Never used as an identity key. */
  photoURL: string | null;
}

export interface EssencesAuthState {
  status: AuthStatus;
  user: EssencesAuthUser | null;
  errorMessage: string | null;
}

export const SIGNED_OUT: EssencesAuthState = {
  status: "signed_out",
  user: null,
  errorMessage: null,
};

export const GOOGLE_PROVIDER_ID = "google.com";

export function isGoogleLinkedUser(input: {
  uid?: string | null;
  providerIds?: readonly string[] | null;
} | null | undefined): boolean {
  if (!input?.uid) return false;
  return (input.providerIds ?? []).includes(GOOGLE_PROVIDER_ID);
}

export function authStateFromProviders(
  uid: string | null,
  providerIds: readonly string[],
  extras?: { email?: string | null; displayName?: string | null; photoURL?: string | null },
): EssencesAuthState {
  if (uid && providerIds.includes(GOOGLE_PROVIDER_ID)) {
    return {
      status: "signed_in",
      user: {
        uid,
        email: extras?.email ?? null,
        displayName: extras?.displayName ?? null,
        photoURL: extras?.photoURL ?? null,
      },
      errorMessage: null,
    };
  }
  return SIGNED_OUT;
}
