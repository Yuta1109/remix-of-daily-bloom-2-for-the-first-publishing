/**
 * Local image pick for Note / Quick Memo attachments.
 *
 * Stores a short `localUri` (and IndexedDB bytes) plus `pendingUpload`.
 * Never writes base64 or data-URLs into V3 / Firestore.
 */

import { Capacitor } from "@capacitor/core";
import { newId } from "@/lib/v3/schema";
import { nowTimestamp } from "@/lib/v3/local-date";
import type { ImageAttachment } from "@/lib/v3/types";
import type { ImageSource } from "@/lib/ocr";
import { persistPickedImageBlob } from "@/lib/note-image-cache";

export function noteImageSrc(image: ImageAttachment | undefined): string | undefined {
  if (!image) return undefined;
  const local = image.localUri?.trim();
  if (local && !local.startsWith("data:")) return local;
  if (image.downloadUrl) return image.downloadUrl;
  return undefined;
}

function pickWithInput(capture: boolean): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    if (capture) input.setAttribute("capture", "environment");
    input.onchange = () => {
      resolve(input.files?.[0] ?? null);
    };
    input.click();
  });
}

async function pickNativeUri(source: ImageSource): Promise<string | null> {
  const { Camera, CameraResultType, CameraSource } = await import("@capacitor/camera");
  const photo = await Camera.getPhoto({
    quality: 70,
    width: 1280,
    correctOrientation: true,
    resultType: CameraResultType.Uri,
    source: source === "camera" ? CameraSource.Camera : CameraSource.Photos,
  });
  const uri = photo.webPath || photo.path || "";
  return uri || null;
}

export async function pickLocalImageAttachment(
  source: ImageSource,
): Promise<ImageAttachment | null> {
  const id = newId();
  let localUri = "";
  let contentType: string | undefined;
  try {
    if (Capacitor.isNativePlatform()) {
      const uri = await pickNativeUri(source);
      if (!uri || uri.startsWith("data:")) return null;
      try {
        const res = await fetch(uri);
        const blob = await res.blob();
        contentType = blob.type || undefined;
        localUri = await persistPickedImageBlob(id, blob);
      } catch {
        localUri = uri;
      }
    } else {
      const file = await pickWithInput(source === "camera");
      if (!file) return null;
      if (file.type.startsWith("image/") === false && file.type !== "") return null;
      contentType = file.type || undefined;
      localUri = await persistPickedImageBlob(id, file);
    }
  } catch (err) {
    const msg = String((err as { message?: string })?.message || err);
    if (/cancel/i.test(msg)) return null;
    throw err;
  }
  if (!localUri || localUri.startsWith("data:")) return null;
  return {
    id,
    localUri,
    createdAt: nowTimestamp(),
    pendingUpload: true,
    contentType,
  };
}
