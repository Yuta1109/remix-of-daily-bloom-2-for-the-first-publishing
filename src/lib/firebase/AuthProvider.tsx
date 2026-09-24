import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  getAuthState,
  signInWithGoogle as requestGoogleSignIn,
  signOut as requestSignOut,
  startAuthListener,
  subscribeAuthState,
  type EssencesAuthState,
} from "@/lib/firebase/firebase-auth";
import { disableCloudSync, enableCloudSync, reconcileOnSignIn } from "@/lib/firebase/sync";
import { SyncProvider } from "@/lib/firebase/SyncProvider";
import { getFirebaseConfigStatus } from "@/lib/firebase/firebase-config";

interface AuthContextValue extends EssencesAuthState {
  configPresent: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<EssencesAuthState>(() => getAuthState());
  const configPresent = getFirebaseConfigStatus().present;
  const lastReconciledUid = useRef<string | null>(null);

  useEffect(() => {
    startAuthListener();
    return subscribeAuthState((next) => {
      setState(next);
      if (next.status === "signed_in" && next.user) {
        if (lastReconciledUid.current !== next.user.uid) {
          lastReconciledUid.current = next.user.uid;
          void reconcileOnSignIn(next.user.uid).catch(() => {
            console.warn("[essences-auth] reconcile failed");
          });
        } else {
          enableCloudSync();
        }
      } else if (next.status === "signed_out") {
        lastReconciledUid.current = null;
        disableCloudSync();
      }
    });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      configPresent,
      signInWithGoogle: async () => {
        await requestGoogleSignIn();
      },
      signOut: async () => {
        await requestSignOut();
      },
    }),
    [state, configPresent],
  );

  return (
    <AuthContext.Provider value={value}>
      <SyncProvider>{children}</SyncProvider>
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
