/**
 * Cloud adapter for V3 entities.
 *
 * Working copy remains local V3. This module upserts/deletes per-entity
 * documents under users/{uid}/... using existing entity ids.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  writeBatch,
  type Firestore,
} from "firebase/firestore";
import { V3_RECORD_KEYS, type V3RecordKey } from "@/lib/v3/schema";
import type { EssencesDataV3, NotePage, QuickMemo } from "@/lib/v3/types";
import { toCloudImage } from "./image-metadata";
import { nowTimestamp } from "@/lib/v3/local-date";
import { getFirebaseJsFirestore } from "./firebase-app";
import {
  CLOUD_LEGACY_COLLECTION,
  CLOUD_LEGACY_DOC,
  CLOUD_META_COLLECTION,
  CLOUD_META_DOC,
  CLOUD_PROFILE_COLLECTION,
  CLOUD_PROFILE_DOC,
  CLOUD_SETTINGS_COLLECTION,
  CLOUD_SETTINGS_DOC,
  collectionPath,
  documentPath,
} from "./firestore-paths";
import type { CloudSnapshot, TombstoneMap } from "./v3-merge";

const BATCH_LIMIT = 400;

export interface CloudMeta {
  schemaVersion: 3;
  firebaseUid: string;
  lastSyncedAt: string;
  source: "essences-v3";
}

function stripUndefined<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function requireDb(): Firestore {
  const db = getFirebaseJsFirestore();
  if (!db) throw new Error("Firestore is unavailable (missing Firebase web config)");
  return db;
}

function ref(path: string) {
  const db = requireDb();
  const parts = path.split("/");
  const id = parts.pop();
  if (!id) throw new Error(`invalid path ${path}`);
  return doc(db, parts.join("/"), id);
}

export async function readCloudMeta(uid: string): Promise<CloudMeta | null> {
  const snap = await getDoc(ref(`${collectionPath(uid, CLOUD_META_COLLECTION)}/${CLOUD_META_DOC}`));
  if (!snap.exists()) return null;
  const data = snap.data() as Partial<CloudMeta>;
  if (data.firebaseUid !== uid) return null;
  return data as CloudMeta;
}

export async function writeCloudMeta(uid: string, extra?: Partial<CloudMeta>): Promise<void> {
  const meta: CloudMeta = {
    schemaVersion: 3,
    firebaseUid: uid,
    lastSyncedAt: nowTimestamp(),
    source: "essences-v3",
    ...extra,
  };
  await setDoc(ref(`${collectionPath(uid, CLOUD_META_COLLECTION)}/${CLOUD_META_DOC}`), meta);
}

export async function downloadCloudSnapshot(uid: string): Promise<CloudSnapshot> {
  const db = requireDb();
  const collections: CloudSnapshot["collections"] = {};
  for (const key of V3_RECORD_KEYS) {
    const snap = await getDocs(collection(db, collectionPath(uid, key)));
    const map: Record<string, unknown> = {};
    for (const item of snap.docs) {
      map[item.id] = item.data();
    }
    collections[key] = map;
  }
  const profile = await getDoc(
    ref(`${collectionPath(uid, CLOUD_PROFILE_COLLECTION)}/${CLOUD_PROFILE_DOC}`),
  );
  const settings = await getDoc(
    ref(`${collectionPath(uid, CLOUD_SETTINGS_COLLECTION)}/${CLOUD_SETTINGS_DOC}`),
  );
  const legacy = await getDoc(
    ref(`${collectionPath(uid, CLOUD_LEGACY_COLLECTION)}/${CLOUD_LEGACY_DOC}`),
  );
  return {
    collections,
    user: profile.exists() ? (profile.data() as EssencesDataV3["user"]) : undefined,
    settings: settings.exists() ? (settings.data() as EssencesDataV3["settings"]) : undefined,
    legacyImport: legacy.exists()
      ? (legacy.data() as EssencesDataV3["legacyImport"])
      : undefined,
  };
}

export interface UpsertOp {
  collection: string;
  id: string;
  data: unknown;
}

export function upsertOpKey(uid: string, op: UpsertOp): string {
  return documentPath(uid, op.collection, op.id);
}

function sanitizeEntityForCloud(collection: string, entity: unknown): unknown {
  if (collection === "notes") {
    const note = entity as NotePage;
    if (!note.image) return entity;
    return { ...note, image: toCloudImage(note.image) };
  }
  if (collection === "quickMemos") {
    const memo = entity as QuickMemo;
    if (!memo.image) return entity;
    return { ...memo, image: toCloudImage(memo.image) };
  }
  return entity;
}

export function buildUpsertOps(uid: string, data: EssencesDataV3): UpsertOp[] {
  void uid;
  const ops: UpsertOp[] = [];
  for (const key of V3_RECORD_KEYS) {
    for (const [id, entity] of Object.entries(data[key])) {
      ops.push({ collection: key, id, data: sanitizeEntityForCloud(key, entity) });
    }
  }
  ops.push({ collection: CLOUD_PROFILE_COLLECTION, id: CLOUD_PROFILE_DOC, data: data.user });
  ops.push({ collection: CLOUD_SETTINGS_COLLECTION, id: CLOUD_SETTINGS_DOC, data: data.settings });
  if (data.legacyImport) {
    ops.push({
      collection: CLOUD_LEGACY_COLLECTION,
      id: CLOUD_LEGACY_DOC,
      data: data.legacyImport,
    });
  }
  return ops;
}

export async function upsertOps(uid: string, ops: UpsertOp[]): Promise<void> {
  const db = requireDb();
  for (let i = 0; i < ops.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    for (const op of ops.slice(i, i + BATCH_LIMIT)) {
      batch.set(ref(documentPath(uid, op.collection, op.id)), stripUndefined(op.data) as object);
    }
    await batch.commit();
  }
}

export async function deleteOps(
  uid: string,
  ops: Array<{ collection: string; id: string }>,
): Promise<void> {
  const db = requireDb();
  for (let i = 0; i < ops.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    for (const op of ops.slice(i, i + BATCH_LIMIT)) {
      batch.delete(ref(documentPath(uid, op.collection, op.id)));
    }
    await batch.commit();
  }
}

export async function applyTombstones(uid: string, tombstones: TombstoneMap): Promise<void> {
  const ops: Array<{ collection: string; id: string }> = [];
  for (const key of Object.keys(tombstones) as V3RecordKey[]) {
    for (const id of Object.keys(tombstones[key] ?? {})) {
      ops.push({ collection: key, id });
    }
  }
  if (ops.length) await deleteOps(uid, ops);
}
