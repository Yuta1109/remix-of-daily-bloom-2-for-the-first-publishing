/**
 * Note / Quick Memo image upload, delete, and restore.
 *
 * Called from `sync.ts` after local V3 writes. React never talks to Storage.
 */

import type { EssencesDataV3, ImageAttachment, NotePage, QuickMemo } from "@/lib/v3/types";
import { nowTimestamp } from "@/lib/v3/local-date";
import {
  deleteNoteImageBlob,
  getNoteImageBlob,
  persistPickedImageBlob,
} from "@/lib/note-image-cache";
import {
  canonicalImagePathForKind,
  imageStoragePath,
  needsImageUpload,
  storagePathBelongsToUid,
  type ImageEntityKind,
  usableLocalImageUri,
} from "./image-metadata";
import {
  readPendingImageDeletes,
  writePendingImageDeletes,
} from "./cloud-session";
import {
  deleteUserImage,
  getUserImageDownloadUrl,
  uploadUserImage,
} from "./firebase-storage";

export type ImageSyncAdapter = {
  upload: (input: {
    uid: string;
    storagePath: string;
    blob: Blob;
    contentType?: string;
  }) => Promise<{ storagePath: string; downloadUrl: string }>;
  remove: (uid: string, storagePath: string) => Promise<void>;
  downloadUrl: (uid: string, storagePath: string) => Promise<string>;
  fetchBlob?: (url: string) => Promise<Blob>;
};

const defaultAdapter: ImageSyncAdapter = {
  upload: uploadUserImage,
  remove: deleteUserImage,
  downloadUrl: getUserImageDownloadUrl,
};

let adapter: ImageSyncAdapter = defaultAdapter;

export function setImageSyncAdapterForTests(next: ImageSyncAdapter | null): void {
  adapter = next ?? defaultAdapter;
}

async function blobFromUri(uri: string): Promise<Blob | null> {
  try {
    const res = await fetch(uri);
    if (!res.ok) return null;
    return await res.blob();
  } catch {
    return null;
  }
}

async function resolveUploadBlob(image: ImageAttachment): Promise<Blob | null> {
  const cached = await getNoteImageBlob(image.id);
  if (cached) return cached;
  const uri = usableLocalImageUri(image.localUri);
  if (!uri) return null;
  const fetched = await blobFromUri(uri);
  if (fetched) await persistPickedImageBlob(image.id, fetched).catch(() => undefined);
  return fetched;
}

type ImageTarget = { kind: ImageEntityKind; id: string; image: ImageAttachment };

function listImageTargets(data: EssencesDataV3): ImageTarget[] {
  const out: ImageTarget[] = [];
  for (const note of Object.values(data.notes)) {
    if (note.image) out.push({ kind: "notes", id: note.id, image: note.image });
  }
  for (const memo of Object.values(data.quickMemos)) {
    if (memo.image) out.push({ kind: "quickMemos", id: memo.id, image: memo.image });
  }
  return out;
}

export function collectPendingUploads(uid: string, data: EssencesDataV3): ImageTarget[] {
  return listImageTargets(data).filter((item) => {
    if (!needsImageUpload(item.image)) return false;
    const path = imageStoragePath(uid, item.kind, item.id);
    return storagePathBelongsToUid(path, uid);
  });
}

export function collectDeletedImagePaths(
  uid: string,
  prev: EssencesDataV3 | null,
  next: EssencesDataV3,
): string[] {
  if (!prev) return [];
  const paths: string[] = [];

  for (const [id, note] of Object.entries(prev.notes)) {
    if (next.notes[id]) continue;
    if (!note.image) continue;
    paths.push(canonicalImagePathForKind(uid, "notes", id, note.image));
  }

  for (const [id, memo] of Object.entries(prev.quickMemos)) {
    if (next.quickMemos[id]) continue;
    if (!memo.image) continue;
    const noteTargetId =
      memo.convertedTargets?.note ??
      (memo.convertedToType === "note" ? memo.convertedToId : undefined);
    const noteStillUsesSameFile =
      !!noteTargetId &&
      next.notes[noteTargetId]?.image?.storagePath &&
      next.notes[noteTargetId]?.image?.storagePath === memo.image.storagePath;
    if (noteStillUsesSameFile) continue;
    paths.push(canonicalImagePathForKind(uid, "quickMemos", id, memo.image));
  }

  return [...new Set(paths.filter((path) => storagePathBelongsToUid(path, uid)))];
}

function patchImage(
  data: EssencesDataV3,
  target: ImageTarget,
  patch: Partial<ImageAttachment>,
): EssencesDataV3 {
  const image = { ...target.image, ...patch };
  if (target.kind === "notes") {
    const note = data.notes[target.id];
    if (!note) return data;
    return {
      ...data,
      notes: { ...data.notes, [target.id]: { ...note, image } satisfies NotePage },
    };
  }
  const memo = data.quickMemos[target.id];
  if (!memo) return data;
  return {
    ...data,
    quickMemos: { ...data.quickMemos, [target.id]: { ...memo, image } satisfies QuickMemo },
  };
}

export async function flushImageUploads(
  uid: string,
  data: EssencesDataV3,
): Promise<{ data: EssencesDataV3; uploaded: number; failed: boolean }> {
  let next = data;
  let uploaded = 0;
  let failed = false;
  for (const target of collectPendingUploads(uid, next)) {
    try {
      const blob = await resolveUploadBlob(target.image);
      if (!blob) {
        failed = true;
        continue;
      }
      const storagePath = imageStoragePath(uid, target.kind, target.id);
      const result = await adapter.upload({
        uid,
        storagePath,
        blob,
        contentType: target.image.contentType || blob.type || undefined,
      });
      next = patchImage(next, target, {
        storagePath: result.storagePath,
        downloadUrl: result.downloadUrl,
        uploadedAt: nowTimestamp(),
        contentType: target.image.contentType || blob.type || "image/jpeg",
        pendingUpload: false,
      });
      uploaded += 1;
    } catch {
      failed = true;
    }
  }
  return { data: next, uploaded, failed };
}

export async function flushImageDeletes(uid: string, extraPaths: string[] = []): Promise<boolean> {
  const queued = [...new Set([...readPendingImageDeletes(uid), ...extraPaths])];
  if (!queued.length) return false;
  const remaining: string[] = [];
  for (const path of queued) {
    if (!storagePathBelongsToUid(path, uid)) continue;
    try {
      await adapter.remove(uid, path);
    } catch {
      remaining.push(path);
    }
  }
  writePendingImageDeletes(uid, remaining);
  return remaining.length > 0;
}

export function enqueueImageDeletes(uid: string, paths: string[]): void {
  if (!paths.length) return;
  writePendingImageDeletes(uid, [...readPendingImageDeletes(uid), ...paths]);
}

export async function hydrateCloudImages(
  uid: string,
  data: EssencesDataV3,
): Promise<{ data: EssencesDataV3; restored: number; failed: boolean }> {
  let next = data;
  let restored = 0;
  let failed = false;
  for (const target of listImageTargets(next)) {
    const path = target.image.storagePath;
    if (!path || !storagePathBelongsToUid(path, uid)) continue;
    if (usableLocalImageUri(target.image.localUri)) continue;
    try {
      let blob = await getNoteImageBlob(target.image.id);
      let downloadedUrl = target.image.downloadUrl || "";
      if (!blob) {
        downloadedUrl = target.image.downloadUrl || (await adapter.downloadUrl(uid, path));
        const fetchBlob =
          adapter.fetchBlob ??
          ((href: string) =>
            blobFromUri(href).then((b) => {
              if (!b) throw new Error("image download failed");
              return b;
            }));
        blob = await fetchBlob(downloadedUrl);
      }
      let localUri = "";
      try {
        localUri = await persistPickedImageBlob(target.image.id, blob);
      } catch {
        localUri = downloadedUrl;
      }
      if (!localUri) {
        failed = true;
        continue;
      }
      next = patchImage(next, target, {
        localUri,
        downloadUrl: downloadedUrl || target.image.downloadUrl,
        pendingUpload: false,
      });
      restored += 1;
    } catch {
      failed = true;
    }
  }
  return { data: next, restored, failed };
}

export async function forgetLocalImage(imageId: string | undefined): Promise<void> {
  if (!imageId) return;
  await deleteNoteImageBlob(imageId);
}
