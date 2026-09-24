import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  getSyncSnapshot,
  requestManualSync,
  subscribeSyncSnapshot,
  type CloudSyncSnapshot,
  type ManualSyncResult,
} from "@/lib/firebase/sync";

interface CloudSyncContextValue {
  sync: CloudSyncSnapshot;
  syncNow: () => Promise<ManualSyncResult>;
}

const CloudSyncContext = createContext<CloudSyncContextValue | null>(null);

export function SyncProvider({ children }: { children: ReactNode }) {
  const [sync, setSync] = useState<CloudSyncSnapshot>(() => getSyncSnapshot());

  useEffect(() => subscribeSyncSnapshot(setSync), []);

  const value = useMemo<CloudSyncContextValue>(
    () => ({
      sync,
      syncNow: () => requestManualSync(),
    }),
    [sync],
  );

  return <CloudSyncContext.Provider value={value}>{children}</CloudSyncContext.Provider>;
}

export function useCloudSync(): CloudSyncContextValue {
  const ctx = useContext(CloudSyncContext);
  if (!ctx) {
    throw new Error("useCloudSync must be used within SyncProvider");
  }
  return ctx;
}
