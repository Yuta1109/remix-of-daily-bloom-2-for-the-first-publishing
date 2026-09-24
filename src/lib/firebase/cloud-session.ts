/**
 * Cloud session marker + per-uid local stash.
 *
 * V3 local storage (`essences-app-data-v3`) is user-independent. To stop
 * User A's workspace from being uploaded as User B after an account switch:
 *
 *   first Google bind (no owner) → keep current local, bind uid
 *   same uid                     → resume
 *   different uid                → stash current under the previous uid,
 *                                  restore that uid's stash or emptyData
 *
 * Sign-out does NOT clear local V3 and does NOT clear the owner marker, so
 * the same account can sign back in without treating the device as first-bind.
 */

import { emptyData } from "@/lib/v3/schema";
import { STORAGE_KEY } from "@/lib/v3/types";
import { resetEssencesDataCache } from "@/lib/v3/storage";
import { assertUid } from "./firestore-paths";
import type { TombstoneMap } from "./v3-merge";

export const CLOUD_OWNER_KEY = "essences-cloud-owner-v1";
export const LOCAL_STASH_PREFIX = "essences-app-data-v3:uid:";
export const TOMBSTONE_KEY_PREFIX = "essences-cloud-tombstones-v1:uid:";
export const LAST_SYNCED_KEY_PREFIX = "essences-last-synced-at-v1:uid:";
export const PENDING_IMAGE_DELETES_PREFIX = "essences-storage-pending-deletes-v1:uid:";
/** Pre-Phase-10 global tombstone key; migrated onto the current owner once. */
export const LEGACY_TOMBSTONE_KEY = "essences-cloud-tombstones-v1";

export type CloudSessionPrepareResult = {
  previousOwner: string | null;
  activeOwner: string;
  switched: boolean;
  boundFirstTime: boolean;
};

export function stashStorageKey(uid: string): string {
  return `${LOCAL_STASH_PREFIX}${assertUid(uid)}`;
}

export function tombstonesStorageKey(uid: string): string {
  return `${TOMBSTONE_KEY_PREFIX}${assertUid(uid)}`;
}

export function lastSyncedStorageKey(uid: string): string {
  return `${LAST_SYNCED_KEY_PREFIX}${assertUid(uid)}`;
}

export function pendingImageDeletesKey(uid: string): string {
  return `${PENDING_IMAGE_DELETES_PREFIX}${assertUid(uid)}`;
}

export function readCloudOwner(): string | null {
  try {
    const value = localStorage.getItem(CLOUD_OWNER_KEY)?.trim() ?? "";
    return value || null;
  } catch {
    return null;
  }
}

export function writeCloudOwner(uid: string): void {
  try {
    localStorage.setItem(CLOUD_OWNER_KEY, assertUid(uid));
  } catch {
    /* quota */
  }
}

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function migrateLegacyTombstones(uid: string): void {
  try {
    if (localStorage.getItem(tombstonesStorageKey(uid))) return;
    const legacy = localStorage.getItem(LEGACY_TOMBSTONE_KEY);
    if (!legacy) return;
    localStorage.setItem(tombstonesStorageKey(uid), legacy);
    localStorage.removeItem(LEGACY_TOMBSTONE_KEY);
  } catch {
    /* ignore */
  }
}

export function readTombstonesForUid(uid: string): TombstoneMap {
  migrateLegacyTombstones(uid);
  return parseJson<TombstoneMap>(localStorage.getItem(tombstonesStorageKey(uid)), {});
}

export function writeTombstonesForUid(uid: string, map: TombstoneMap): void {
  try {
    localStorage.setItem(tombstonesStorageKey(uid), JSON.stringify(map));
  } catch {
    /* quota */
  }
}

export function readLastSyncedAt(uid: string): string | null {
  try {
    return localStorage.getItem(lastSyncedStorageKey(uid));
  } catch {
    return null;
  }
}

export function writeLastSyncedAt(uid: string, iso: string): void {
  try {
    localStorage.setItem(lastSyncedStorageKey(uid), iso);
  } catch {
    /* quota */
  }
}

export function readPendingImageDeletes(uid: string): string[] {
  const parsed = parseJson<unknown>(localStorage.getItem(pendingImageDeletesKey(uid)), []);
  return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
}

export function writePendingImageDeletes(uid: string, paths: string[]): void {
  try {
    const unique = [...new Set(paths.filter(Boolean))];
    if (!unique.length) {
      localStorage.removeItem(pendingImageDeletesKey(uid));
      return;
    }
    localStorage.setItem(pendingImageDeletesKey(uid), JSON.stringify(unique));
  } catch {
    /* quota */
  }
}

function stashCurrentWorkspace(uid: string): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) localStorage.setItem(stashStorageKey(uid), raw);
  } catch {
    /* quota */
  }
}

function restoreWorkspace(uid: string): void {
  try {
    const stashed = localStorage.getItem(stashStorageKey(uid));
    if (stashed) localStorage.setItem(STORAGE_KEY, stashed);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(emptyData()));
  } catch {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(emptyData()));
    } catch {
      /* ignore */
    }
  }
  resetEssencesDataCache();
}

/**
 * Must run while cloud sync is disabled (pending push timers cancelled).
 * Never uploads; it only rearranges localStorage.
 */
export function prepareCloudSession(uid: string): CloudSessionPrepareResult {
  const activeOwner = assertUid(uid);
  const previousOwner = readCloudOwner();
  if (!previousOwner) {
    writeCloudOwner(activeOwner);
    migrateLegacyTombstones(activeOwner);
    return { previousOwner: null, activeOwner, switched: false, boundFirstTime: true };
  }
  if (previousOwner === activeOwner) {
    migrateLegacyTombstones(activeOwner);
    return { previousOwner, activeOwner, switched: false, boundFirstTime: false };
  }
  migrateLegacyTombstones(previousOwner);
  stashCurrentWorkspace(previousOwner);
  restoreWorkspace(activeOwner);
  writeCloudOwner(activeOwner);
  return { previousOwner, activeOwner, switched: true, boundFirstTime: false };
}
