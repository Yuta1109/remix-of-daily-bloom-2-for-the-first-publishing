/**
 * Firestore path helpers for per-user V3 entities.
 *
 * Canonical owner is Firebase Auth `uid`. Email / displayName never appear in
 * paths. ChallengeDefinition catalog is app code — not stored.
 */

import { V3_RECORD_KEYS, type V3RecordKey } from "@/lib/v3/schema";

export const V3_CLOUD_COLLECTIONS = V3_RECORD_KEYS;

export type CloudCollectionKey = V3RecordKey;

export const CLOUD_META_COLLECTION = "meta";
export const CLOUD_META_DOC = "state";
export const CLOUD_PROFILE_COLLECTION = "profile";
export const CLOUD_PROFILE_DOC = "current";
export const CLOUD_SETTINGS_COLLECTION = "settings";
export const CLOUD_SETTINGS_DOC = "current";
export const CLOUD_LEGACY_COLLECTION = "legacyImport";
export const CLOUD_LEGACY_DOC = "current";

export function assertUid(uid: string): string {
  const trimmed = uid.trim();
  if (!trimmed) throw new Error("firebase uid is required");
  if (trimmed.includes("/")) throw new Error("firebase uid must not contain slashes");
  return trimmed;
}

export function userRootPath(uid: string): string {
  return `users/${assertUid(uid)}`;
}

export function collectionPath(uid: string, collection: string): string {
  return `${userRootPath(uid)}/${collection}`;
}

export function documentPath(uid: string, collection: string, docId: string): string {
  if (!docId || docId.includes("/")) throw new Error(`invalid document id: ${docId}`);
  return `${collectionPath(uid, collection)}/${docId}`;
}

export function metaPath(uid: string): string {
  return documentPath(uid, CLOUD_META_COLLECTION, CLOUD_META_DOC);
}

export function profilePath(uid: string): string {
  return documentPath(uid, CLOUD_PROFILE_COLLECTION, CLOUD_PROFILE_DOC);
}

export function settingsPath(uid: string): string {
  return documentPath(uid, CLOUD_SETTINGS_COLLECTION, CLOUD_SETTINGS_DOC);
}

export function entityPath(uid: string, collection: CloudCollectionKey, id: string): string {
  return documentPath(uid, collection, id);
}

/** True when `path` is under `users/{uid}/` and cannot address another user. */
export function pathBelongsToUid(path: string, uid: string): boolean {
  const root = userRootPath(uid);
  return path === root || path.startsWith(`${root}/`);
}
