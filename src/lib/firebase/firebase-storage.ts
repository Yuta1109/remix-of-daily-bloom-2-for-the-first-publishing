/**
 * Firebase Storage SDK wrapper. UI never imports this module.
 */

import {
  deleteObject,
  getDownloadURL,
  getStorage,
  ref,
  uploadBytes,
  type FirebaseStorage,
} from "firebase/storage";
import { getFirebaseJsStorage } from "./firebase-app";
import { storagePathBelongsToUid } from "./image-metadata";

export type StorageUploadResult = {
  storagePath: string;
  downloadUrl: string;
};

function requireStorage(): FirebaseStorage {
  const storage = getFirebaseJsStorage();
  if (!storage) throw new Error("Firebase Storage is unavailable (missing Firebase web config)");
  return storage;
}

function objectRef(uid: string, storagePath: string) {
  if (!storagePathBelongsToUid(storagePath, uid)) {
    throw new Error("storage path is outside the signed-in user's tree");
  }
  return ref(requireStorage(), storagePath);
}

export async function uploadUserImage(input: {
  uid: string;
  storagePath: string;
  blob: Blob;
  contentType?: string;
}): Promise<StorageUploadResult> {
  const object = objectRef(input.uid, input.storagePath);
  const contentType = input.contentType || input.blob.type || "image/jpeg";
  await uploadBytes(object, input.blob, { contentType });
  const downloadUrl = await getDownloadURL(object);
  return { storagePath: input.storagePath, downloadUrl };
}

export async function deleteUserImage(uid: string, storagePath: string): Promise<void> {
  try {
    await deleteObject(objectRef(uid, storagePath));
  } catch (err) {
    const code = (err as { code?: string }).code ?? "";
    if (code === "storage/object-not-found") return;
    throw err;
  }
}

export async function getUserImageDownloadUrl(uid: string, storagePath: string): Promise<string> {
  return getDownloadURL(objectRef(uid, storagePath));
}
