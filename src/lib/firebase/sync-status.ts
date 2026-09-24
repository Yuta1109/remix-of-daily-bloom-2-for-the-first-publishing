/**
 * Cloud sync status state machine (pure).
 *
 * UI labels map 1:1 to these values. Never put Firestore error strings here.
 */

export type CloudSyncStatus = "local_only" | "syncing" | "synced" | "pending" | "offline" | "error";

export type CloudSyncSnapshot = {
  status: CloudSyncStatus;
  lastSyncedAt: string | null;
  pending: boolean;
  error: boolean;
};

export const MANUAL_SYNC_COOLDOWN_MS = 5000;

export function deriveCloudSyncStatus(input: {
  signedIn: boolean;
  syncing: boolean;
  online: boolean;
  error: boolean;
  pending: boolean;
  lastSyncedAt: string | null;
}): CloudSyncStatus {
  if (!input.signedIn) return "local_only";
  if (input.syncing) return "syncing";
  if (!input.online) return "offline";
  if (input.error) return "error";
  if (input.pending) return "pending";
  if (input.lastSyncedAt) return "synced";
  return "pending";
}

export function canRunManualSync(input: {
  now: number;
  lastManualAt: number;
  cooldownMs?: number;
  signedIn: boolean;
  syncing: boolean;
}): { ok: true } | { ok: false; reason: "signed_out" | "in_flight" | "cooldown" } {
  if (!input.signedIn) return { ok: false, reason: "signed_out" };
  if (input.syncing) return { ok: false, reason: "in_flight" };
  const cooldown = input.cooldownMs ?? MANUAL_SYNC_COOLDOWN_MS;
  if (input.lastManualAt > 0 && input.now - input.lastManualAt < cooldown) {
    return { ok: false, reason: "cooldown" };
  }
  return { ok: true };
}

export function snapshotFromFlags(input: {
  signedIn: boolean;
  syncing: boolean;
  online: boolean;
  error: boolean;
  pending: boolean;
  lastSyncedAt: string | null;
}): CloudSyncSnapshot {
  return {
    status: deriveCloudSyncStatus(input),
    lastSyncedAt: input.signedIn ? input.lastSyncedAt : null,
    pending: input.signedIn && input.pending,
    error: input.signedIn && input.error,
  };
}

export const SYNC_STATUS_I18N_KEY = {
  local_only: "userSyncStatusLocalOnly",
  syncing: "userSyncStatusSyncing",
  synced: "userSyncStatusSynced",
  pending: "userSyncStatusPending",
  offline: "userSyncStatusOffline",
  error: "userSyncStatusError",
} as const;

export function syncStatusI18nKey(
  status: CloudSyncStatus,
): (typeof SYNC_STATUS_I18N_KEY)[CloudSyncStatus] {
  return SYNC_STATUS_I18N_KEY[status];
}
