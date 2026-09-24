/**
 * Local V3 ↔ Firestore (+ Storage images) sync.
 *
 * Signed out: local V3 only (this module is idle).
 * Signed in: local V3 is the working copy; Firestore is the per-uid replica.
 *
 * Domain repository / UI never talk to Firestore or Storage.
 * `storage.saveEssencesData` notifies this module after a local write.
 */

import { loadEssencesData, saveEssencesData, setEssencesDataAfterSave } from "@/lib/v3/storage";
import { nowTimestamp } from "@/lib/v3/local-date";
import type { EssencesDataV3 } from "@/lib/v3/types";
import { getFirebaseUid } from "./firebase-auth";
import {
  applyTombstones,
  buildUpsertOps,
  downloadCloudSnapshot,
  readCloudMeta,
  upsertOps,
  writeCloudMeta,
} from "./firebase-firestore";
import {
  mergeLocalAndCloud,
  recordTombstones,
  shouldUploadLocalFirst,
} from "./v3-merge";
import {
  prepareCloudSession,
  readCloudOwner,
  readLastSyncedAt,
  readTombstonesForUid,
  writeLastSyncedAt,
  writeTombstonesForUid,
} from "./cloud-session";
import {
  collectDeletedImagePaths,
  enqueueImageDeletes,
  flushImageDeletes,
  flushImageUploads,
  hydrateCloudImages,
} from "./image-sync";
import {
  MANUAL_SYNC_COOLDOWN_MS,
  snapshotFromFlags,
  type CloudSyncSnapshot,
  canRunManualSync,
} from "./sync-status";

export type { CloudSyncSnapshot, CloudSyncStatus } from "./sync-status";
export type ManualSyncResult =
  | { ran: true }
  | { ran: false; reason: "signed_out" | "in_flight" | "cooldown" };

type SyncListener = (snapshot: CloudSyncSnapshot) => void;

let applyingCloud = false;
let pushTimer: number | null = null;
let syncing = false;
let signedIn = false;
let dirty = false;
let lastError = false;
let lastSyncedAt: string | null = null;
let lastManualAt = 0;
let networkListenerBound = false;
let reconcileLock = false;

let lastPushedFingerprint: string | null = null;
export const PUSH_DEBOUNCE_MS = 2000;

const listeners = new Set<SyncListener>();

function isOnline(): boolean {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine !== false;
}

function emitSync(): void {
  const snapshot = getSyncSnapshot();
  for (const listener of listeners) listener(snapshot);
}

function setFlags(
  patch: Partial<{
    syncing: boolean;
    dirty: boolean;
    error: boolean;
    lastSyncedAt: string | null;
  }>,
): void {
  if (patch.syncing !== undefined) syncing = patch.syncing;
  if (patch.dirty !== undefined) dirty = patch.dirty;
  if (patch.error !== undefined) lastError = patch.error;
  if (patch.lastSyncedAt !== undefined) lastSyncedAt = patch.lastSyncedAt;
  emitSync();
}

export function getSyncSnapshot(): CloudSyncSnapshot {
  return snapshotFromFlags({
    signedIn,
    syncing,
    online: isOnline(),
    error: lastError,
    pending: dirty,
    lastSyncedAt,
  });
}

export function subscribeSyncSnapshot(listener: SyncListener): () => void {
  listeners.add(listener);
  listener(getSyncSnapshot());
  return () => {
    listeners.delete(listener);
  };
}

function bindNetworkListeners(): void {
  if (networkListenerBound || typeof window === "undefined") return;
  networkListenerBound = true;
  window.addEventListener("online", emitSync);
  window.addEventListener("offline", emitSync);
}

function tombstonesOf(uid: string) {
  return readTombstonesForUid(uid);
}

function persistLocalWithoutEcho(data: EssencesDataV3): void {
  applyingCloud = true;
  try {
    saveEssencesData(data);
  } finally {
    applyingCloud = false;
  }
}

async function pushLocal(uid: string, data: EssencesDataV3): Promise<void> {
  const owner = readCloudOwner();
  if (owner && owner !== uid) return;
  setFlags({ syncing: true });
  try {
    let next = data;
    const uploaded = await flushImageUploads(uid, next);
    next = uploaded.data;
    if (uploaded.uploaded > 0) persistLocalWithoutEcho(next);
    await upsertOps(uid, buildUpsertOps(uid, next));
    await applyTombstones(uid, tombstonesOf(uid));
    await writeCloudMeta(uid);
    const deleteFailed = await flushImageDeletes(uid);
    const at = nowTimestamp();
    writeLastSyncedAt(uid, at);
    lastPushedFingerprint = JSON.stringify(next);
    setFlags({
      syncing: false,
      dirty: false,
      error: uploaded.failed || deleteFailed,
      lastSyncedAt: at,
    });
  } catch {
    setFlags({ syncing: false, dirty: true, error: true });
  }
}

function schedulePush(_data: EssencesDataV3): void {
  const uid = getFirebaseUid();
  if (!uid || applyingCloud) return;
  const owner = readCloudOwner();
  if (owner && owner !== uid) return;
  dirty = true;
  lastError = false;
  emitSync();
  if (pushTimer != null) window.clearTimeout(pushTimer);
  pushTimer = window.setTimeout(() => {
    pushTimer = null;
    const latest = loadEssencesData();
    const fp = JSON.stringify(latest);
    if (fp === lastPushedFingerprint) {
      setFlags({ dirty: false });
      return;
    }
    void pushLocal(uid, latest);
  }, PUSH_DEBOUNCE_MS);
}

function onLocalSave(prev: EssencesDataV3 | null, next: EssencesDataV3): void {
  if (applyingCloud) return;
  const uid = getFirebaseUid();
  if (!uid) return;
  const owner = readCloudOwner();
  if (owner && owner !== uid) return;
  if (prev) {
    writeTombstonesForUid(uid, recordTombstones(prev, next, tombstonesOf(uid), nowTimestamp()));
    enqueueImageDeletes(uid, collectDeletedImagePaths(uid, prev, next));
  }
  schedulePush(next);
}

export function enableCloudSync(): void {
  signedIn = true;
  bindNetworkListeners();
  const uid = getFirebaseUid();
  if (uid) lastSyncedAt = readLastSyncedAt(uid);
  setEssencesDataAfterSave(onLocalSave);
  emitSync();
}

export function disableCloudSync(): void {
  signedIn = false;
  setEssencesDataAfterSave(null);
  if (pushTimer != null) {
    window.clearTimeout(pushTimer);
    pushTimer = null;
  }
  syncing = false;
  dirty = false;
  lastError = false;
  emitSync();
}

/**
 * First sign-in / auth restore / account switch.
 * Empty cloud → upload local. Existing cloud → merge, then upsert.
 * Always prepares the per-uid workspace so A→B cannot upload A's local V3.
 */
export async function reconcileOnSignIn(uid: string): Promise<"upload-local" | "merge"> {
  if (reconcileLock) return "merge";
  reconcileLock = true;
  disableCloudSync();
  prepareCloudSession(uid);
  enableCloudSync();
  syncing = true;
  lastError = false;
  emitSync();
  try {
    const local = loadEssencesData();
    const meta = await readCloudMeta(uid);
    const cloud = await downloadCloudSnapshot(uid);
    const action = shouldUploadLocalFirst({ metaPresent: !!meta, cloud });
    let next = local;
    if (action === "merge") {
      next = mergeLocalAndCloud(local, cloud, tombstonesOf(uid));
      const hydrated = await hydrateCloudImages(uid, next);
      next = hydrated.data;
      persistLocalWithoutEcho(next);
    }
    const uploaded = await flushImageUploads(uid, next);
    next = uploaded.data;
    if (uploaded.uploaded > 0) persistLocalWithoutEcho(next);
    await upsertOps(uid, buildUpsertOps(uid, next));
    await applyTombstones(uid, tombstonesOf(uid));
    await writeCloudMeta(uid);
    const deleteFailed = await flushImageDeletes(uid);
    const at = nowTimestamp();
    writeLastSyncedAt(uid, at);
    setFlags({
      syncing: false,
      dirty: false,
      error: uploaded.failed || deleteFailed,
      lastSyncedAt: at,
    });
    return action;
  } catch {
    setFlags({ syncing: false, dirty: true, error: true });
    return "merge";
  } finally {
    reconcileLock = false;
    syncing = false;
  }
}

export async function requestManualSync(): Promise<ManualSyncResult> {
  const uid = getFirebaseUid();
  const gate = canRunManualSync({
    now: Date.now(),
    lastManualAt,
    cooldownMs: MANUAL_SYNC_COOLDOWN_MS,
    signedIn: !!uid,
    syncing,
  });
  if (gate.ok === false) return { ran: false, reason: gate.reason };
  if (!uid) return { ran: false, reason: "signed_out" };
  lastManualAt = Date.now();
  await reconcileOnSignIn(uid);
  return { ran: true };
}

export function resetSyncModuleForTests(): void {
  disableCloudSync();
  applyingCloud = false;
  lastManualAt = 0;
  lastSyncedAt = null;
  lastError = false;
  dirty = false;
  lastPushedFingerprint = null;
  reconcileLock = false;
  listeners.clear();
}

export { prepareCloudSession };
