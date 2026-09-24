/**
 * Deterministic last-write-wins merge for V3 maps.
 *
 * Empty cloud never replaces local data. Tombstones record local deletes so
 * they can be applied to Firestore without a CRDT.
 */

import { V3_RECORD_KEYS, type V3RecordKey } from "@/lib/v3/schema";
import type { EssencesDataV3, ImageAttachment, NotePage, QuickMemo } from "@/lib/v3/types";
import { normalizeData } from "@/lib/v3/schema";
import { coalesceImageAttachment } from "./image-metadata";

export type TombstoneMap = Partial<Record<V3RecordKey, Record<string, string>>>;

export interface CloudSnapshot {
  collections: Partial<Record<V3RecordKey, Record<string, unknown>>>;
  user?: EssencesDataV3["user"];
  settings?: EssencesDataV3["settings"];
  legacyImport?: EssencesDataV3["legacyImport"];
}

export function entityTimestamp(entity: unknown): string {
  if (!entity || typeof entity !== "object") return "";
  const record = entity as Record<string, unknown>;
  for (const key of ["updatedAt", "createdAt", "occurredAt", "completedAt"] as const) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return "";
}

export function laterEntity(local: unknown, cloud: unknown): unknown {
  const lt = entityTimestamp(local);
  const ct = entityTimestamp(cloud);
  if (!ct) return local;
  if (!lt) return cloud;
  return ct > lt ? cloud : local;
}

export function mergeEntityMaps(
  local: Record<string, unknown>,
  cloud: Record<string, unknown>,
  tombstones: Record<string, string> | undefined,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const ids = new Set([...Object.keys(local), ...Object.keys(cloud)]);
  for (const id of ids) {
    const deletedAt = tombstones?.[id];
    const localEntity = local[id];
    const cloudEntity = cloud[id];
    const latestEntityTime = (() => {
      const times = [entityTimestamp(localEntity), entityTimestamp(cloudEntity)].filter(Boolean);
      return times.sort().at(-1) ?? "";
    })();
    if (deletedAt && (!latestEntityTime || deletedAt >= latestEntityTime)) continue;
    if (localEntity && cloudEntity) out[id] = laterEntity(localEntity, cloudEntity);
    else if (localEntity) out[id] = localEntity;
    else if (cloudEntity) out[id] = cloudEntity;
  }
  return out;
}

export function recordTombstones(
  prev: EssencesDataV3 | null,
  next: EssencesDataV3,
  existing: TombstoneMap = {},
  deletedAt: string,
): TombstoneMap {
  if (!prev) return existing;
  const nextMap: TombstoneMap = { ...existing };
  for (const key of V3_RECORD_KEYS) {
    const bucket = { ...(nextMap[key] ?? {}) };
    for (const id of Object.keys(prev[key])) {
      if (!(id in next[key])) bucket[id] = deletedAt;
    }
    for (const id of Object.keys(next[key])) {
      delete bucket[id];
    }
    if (Object.keys(bucket).length) nextMap[key] = bucket;
    else delete nextMap[key];
  }
  return nextMap;
}

export type ReconcileAction = "upload-local" | "merge";

export function cloudSnapshotIsEmpty(cloud: CloudSnapshot | null | undefined): boolean {
  if (!cloud) return true;
  const hasAnyCollection = V3_RECORD_KEYS.some(
    (key) => Object.keys(cloud.collections[key] ?? {}).length > 0,
  );
  const hasSingletons = !!(cloud.user || cloud.settings || cloud.legacyImport);
  return !hasAnyCollection && !hasSingletons;
}

export function chooseReconcileAction(cloudHasUserData: boolean): ReconcileAction {
  return cloudHasUserData ? "merge" : "upload-local";
}

/** Empty cloud (or missing meta + empty snapshot) must upload local, never replace it. */
export function shouldUploadLocalFirst(input: {
  metaPresent: boolean;
  cloud: CloudSnapshot | null;
}): ReconcileAction {
  if (input.metaPresent) return "merge";
  if (cloudSnapshotIsEmpty(input.cloud)) return "upload-local";
  return "merge";
}

/**
 * Merge local V3 with a cloud snapshot. An empty snapshot is a no-op on local
 * (caller should upload instead). Never returns emptyData in place of local.
 */
export function mergeLocalAndCloud(
  local: EssencesDataV3,
  cloud: CloudSnapshot | null,
  tombstones: TombstoneMap = {},
): EssencesDataV3 {
  if (!cloud || cloudSnapshotIsEmpty(cloud)) return local;

  const merged = normalizeData({
    ...local,
    user: laterEntity(local.user, cloud.user) as EssencesDataV3["user"],
    settings: laterEntity(local.settings, cloud.settings) as EssencesDataV3["settings"],
    legacyImport: (laterEntity(local.legacyImport, cloud.legacyImport) ??
      local.legacyImport ??
      cloud.legacyImport) as EssencesDataV3["legacyImport"],
  });
  const maps = Object.fromEntries(
    V3_RECORD_KEYS.map((key) => [
      key,
      mergeEntityMaps(
        local[key] as unknown as Record<string, unknown>,
        cloud.collections[key] ?? {},
        tombstones[key],
      ),
    ]),
  );
  const next = { ...merged, ...maps } as EssencesDataV3;
  return coalesceCollectionImages(local, cloud, next);
}

function asImageRecord<T extends { image?: ImageAttachment }>(
  value: unknown,
): T | undefined {
  return value && typeof value === "object" ? (value as T) : undefined;
}

function coalesceCollectionImages(
  local: EssencesDataV3,
  cloud: CloudSnapshot,
  merged: EssencesDataV3,
): EssencesDataV3 {
  const cloudNotes = cloud.collections.notes ?? {};
  const cloudMemos = cloud.collections.quickMemos ?? {};
  const notes = { ...merged.notes };
  for (const id of Object.keys(notes)) {
    notes[id] = {
      ...notes[id],
      image: coalesceImageAttachment(
        local.notes[id]?.image,
        asImageRecord<NotePage>(cloudNotes[id])?.image,
        notes[id].image,
      ),
    };
  }
  const quickMemos = { ...merged.quickMemos };
  for (const id of Object.keys(quickMemos)) {
    quickMemos[id] = {
      ...quickMemos[id],
      image: coalesceImageAttachment(
        local.quickMemos[id]?.image,
        asImageRecord<QuickMemo>(cloudMemos[id])?.image,
        quickMemos[id].image,
      ),
    };
  }
  return { ...merged, notes, quickMemos };
}
