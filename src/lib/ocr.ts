import { Capacitor } from "@capacitor/core";
import { callExtractTextFromImage, type OcrCallResult } from "./firebase-client";

export type ImageSource = "photos" | "camera";
export type OcrPickError = "cancelled" | "permission" | "unavailable";

async function compressDataUrl(dataUrl: string): Promise<{ base64: string; mimeType: string }> {
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("ocr-image"));
    img.src = dataUrl;
  });
  const max = 1920;
  const scale = Math.min(1, max / Math.max(img.width || 1, img.height || 1));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("ocr-image");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const jpeg = canvas.toDataURL("image/jpeg", 0.82);
  const comma = jpeg.indexOf(",");
  return { base64: jpeg.slice(comma + 1), mimeType: "image/jpeg" };
}

async function pickWithInput(capture: boolean): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    if (capture) input.setAttribute("capture", "environment");
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    };
    input.click();
  });
}

async function pickNative(source: ImageSource): Promise<string | null> {
  const { Camera, CameraResultType, CameraSource } = await import("@capacitor/camera");
  const need = source === "camera" ? "camera" : "photos";
  let perms = await Camera.checkPermissions();
  if (need === "camera" && perms.camera !== "granted") {
    perms = await Camera.requestPermissions({ permissions: ["camera"] });
    if (perms.camera !== "granted") throw new Error("ocr-permission");
  }
  if (need === "photos" && perms.photos !== "granted" && perms.photos !== "limited") {
    perms = await Camera.requestPermissions({ permissions: ["photos"] });
  }
  try {
    const photo = await Camera.getPhoto({
      quality: 82,
      width: 1920,
      resultType: CameraResultType.DataUrl,
      source: source === "camera" ? CameraSource.Camera : CameraSource.Photos,
    });
    return photo.dataUrl || null;
  } catch (err) {
    const msg = String((err as { message?: string })?.message || err);
    if (/cancel/i.test(msg)) return null;
    throw err;
  }
}

export async function pickImageDataUrl(source: ImageSource): Promise<string | null> {
  if (Capacitor.isNativePlatform()) {
    return pickNative(source);
  }
  return pickWithInput(source === "camera");
}

export async function extractTextFromPickedImage(
  mode: "note" | "tasks",
  source: ImageSource,
): Promise<OcrCallResult | { ok: false; error: OcrPickError }> {
  try {
    const dataUrl = await pickImageDataUrl(source);
    if (!dataUrl) return { ok: false, error: "cancelled" };
    const compressed = await compressDataUrl(dataUrl);
    return callExtractTextFromImage({
      imageBase64: compressed.base64,
      mimeType: compressed.mimeType,
      mode,
    });
  } catch (err) {
    const msg = String((err as { message?: string })?.message || err);
    if (msg === "ocr-permission") return { ok: false, error: "permission" };
    if (/cancel/i.test(msg)) return { ok: false, error: "cancelled" };
    return { ok: false, error: "unavailable" };
  }
}

export function textToNoteHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escaped
    .split(/\r?\n/)
    .map((line) => `<div>${line || "<br>"}</div>`)
    .join("");
}

export function ocrToastKey(
  error: "quota" | "unreadable" | "error" | "unavailable" | "cancelled" | "permission" | undefined,
): "ocrQuota" | "ocrUnreadable" | "ocrPermission" | "ocrGeneric" | null {
  if (!error || error === "cancelled") return null;
  if (error === "quota") return "ocrQuota";
  if (error === "unreadable") return "ocrUnreadable";
  if (error === "permission") return "ocrPermission";
  return "ocrGeneric";
}
