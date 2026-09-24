/**
 * Durable local blob cache for Note / Quick Memo images.
 *
 * Object URLs do not survive reload. IndexedDB does, so upload/retry and
 * Storage restore can still find bytes on this device.
 */

const DB_NAME = "essences-note-images-v1";
const STORE = "blobs";
const memoryBlobs = new Map<string, Blob>();

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("indexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("indexedDB open failed"));
  });
}

export async function putNoteImageBlob(imageId: string, blob: Blob): Promise<void> {
  memoryBlobs.set(imageId, blob);
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("indexedDB write failed"));
      tx.objectStore(STORE).put(blob, imageId);
    });
  } catch {
    /* memory cache is enough for this session / test env */
  }
}

export async function getNoteImageBlob(imageId: string): Promise<Blob | null> {
  const cached = memoryBlobs.get(imageId);
  if (cached) return cached;
  try {
    const db = await openDb();
    return await new Promise<Blob | null>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(imageId);
      req.onsuccess = () => resolve((req.result as Blob | undefined) ?? null);
      req.onerror = () => reject(req.error ?? new Error("indexedDB read failed"));
    });
  } catch {
    return null;
  }
}

export async function deleteNoteImageBlob(imageId: string): Promise<void> {
  memoryBlobs.delete(imageId);
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("indexedDB delete failed"));
      tx.objectStore(STORE).delete(imageId);
    });
  } catch {
    /* ignore */
  }
}

const objectUrls = new Map<string, string>();

function makeObjectUrl(blob: Blob): string {
  if (typeof URL !== "undefined" && typeof URL.createObjectURL === "function") {
    return URL.createObjectURL(blob);
  }
  return `blob:essences/${Math.random().toString(36).slice(2)}`;
}

function forgetObjectUrl(url: string | undefined): void {
  if (!url) return;
  if (typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function" && url.startsWith("blob:")) {
    try {
      URL.revokeObjectURL(url);
    } catch {
      /* ignore */
    }
  }
}

export async function objectUrlForImageId(imageId: string): Promise<string | null> {
  const cached = objectUrls.get(imageId);
  if (cached) return cached;
  const blob = await getNoteImageBlob(imageId);
  if (!blob) return null;
  const url = makeObjectUrl(blob);
  objectUrls.set(imageId, url);
  return url;
}

export async function persistPickedImageBlob(imageId: string, blob: Blob): Promise<string> {
  await putNoteImageBlob(imageId, blob);
  forgetObjectUrl(objectUrls.get(imageId));
  const url = makeObjectUrl(blob);
  objectUrls.set(imageId, url);
  return url;
}
