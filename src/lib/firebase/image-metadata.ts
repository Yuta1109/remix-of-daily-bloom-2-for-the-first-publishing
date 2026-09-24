/**
 * Pure image metadata helpers. No Firebase SDK, no React.
 *
 * Firestore documents store this metadata only — never image bytes / base64.
 */

import type { ImageAttachment } from "@/lib/v3/types";
import { assertUid, userRootPath } from "./firestore-paths";

export type ImageEntityKind = "notes" | "quickMemos";

export function noteImageStoragePath(uid: string, noteId: string): string {
  if (!noteId || noteId.includes("/")) throw new Error(`invalid note id: ${noteId}`);
  return `${userRootPath(uid)}/notes/${noteId}/image`;
}

export function quickMemoImageStoragePath(uid: string, quickMemoId: string): string {
  if (!quickMemoId || quickMemoId.includes("/")) throw new Error(`invalid quick memo id: ${quickMemoId}`);
  return `${userRootPath(uid)}/quickMemos/${quickMemoId}/image`;
}

export function imageStoragePath(
  uid: string,
  kind: ImageEntityKind,
  entityId: string,
): string {
  return kind === "notes"
    ? noteImageStoragePath(uid, entityId)
    : quickMemoImageStoragePath(uid, entityId);
}

export function storagePathBelongsToUid(path: string, uid: string): boolean {
  const root = userRootPath(uid);
  return path === root || path.startsWith(`${root}/`);
}

export function isInlineImagePayload(value: unknown): boolean {
  if (typeof value !== "string") return false;
  if (value.startsWith("data:")) return true;
  if (value.length > 4096) return true;
  return /base64,/i.test(value);
}

export function usableLocalImageUri(uri: string | undefined): string {
  const value = (uri ?? "").trim();
  if (!value) return "";
  if (isInlineImagePayload(value)) return "";
  return value;
}

/** Metadata written to Firestore. `localUri` is always empty (device-specific). */
export function toCloudImage(image: ImageAttachment): ImageAttachment {
  return {
    id: image.id,
    localUri: "",
    width: image.width,
    height: image.height,
    createdAt: image.createdAt,
    storagePath: image.storagePath,
    downloadUrl: image.downloadUrl,
    uploadedAt: image.uploadedAt,
    contentType: image.contentType,
  };
}

export function coalesceImageAttachment(
  local: ImageAttachment | undefined,
  cloud: ImageAttachment | undefined,
  winner: ImageAttachment | undefined,
): ImageAttachment | undefined {
  if (!local && !cloud) return winner;
  const src = winner ?? local ?? cloud;
  if (!src) return undefined;
  const storagePath = local?.storagePath || cloud?.storagePath || src.storagePath;
  return {
    ...src,
    storagePath,
    downloadUrl: local?.downloadUrl || cloud?.downloadUrl || src.downloadUrl,
    uploadedAt: local?.uploadedAt || cloud?.uploadedAt || src.uploadedAt,
    contentType: local?.contentType || cloud?.contentType || src.contentType,
    localUri: usableLocalImageUri(local?.localUri) || usableLocalImageUri(cloud?.localUri) || "",
    pendingUpload: !storagePath && !!(usableLocalImageUri(local?.localUri) || src.pendingUpload),
  };
}

export function needsImageUpload(image: ImageAttachment | undefined): boolean {
  if (!image) return false;
  if (image.storagePath) return false;
  return image.pendingUpload === true || !!usableLocalImageUri(image.localUri);
}

export function canonicalImagePathForKind(
  uid: string,
  kind: ImageEntityKind,
  entityId: string,
  image?: ImageAttachment,
): string {
  const owner = assertUid(uid);
  if (image?.storagePath && storagePathBelongsToUid(image.storagePath, owner)) {
    return image.storagePath;
  }
  return imageStoragePath(owner, kind, entityId);
}
