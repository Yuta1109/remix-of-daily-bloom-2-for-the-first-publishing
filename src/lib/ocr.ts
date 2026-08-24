import { Capacitor } from "@capacitor/core";
import { callExtractTextFromImage, type OcrCallResult } from "./firebase-client";
import { ocrDebugLog } from "./ocr-debug-log";
import { prepareForOcr } from "./keyboard-avoidance";

export type ImageSource = "photos" | "camera";
export type OcrPickError = "cancelled" | "permission" | "unavailable";

const MAX_BASE64_CHARS = 1_500_000;

function mimeFromFormat(format?: string): string {
  const f = String(format || "jpeg").toLowerCase();
  if (f === "png") return "image/png";
  if (f === "webp") return "image/webp";
  if (f === "heic") return "image/heic";
  if (f === "heif") return "image/heif";
  return "image/jpeg";
}

function newOcrRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `ocr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

/** Reuse requestId when the same image is retried after a client timeout. */
let lastOcrFingerprint = "";
let lastOcrRequestId = "";

function requestIdForPayload(base64: string, mode: string): string {
  const fingerprint = `${mode}:${base64.length}:${base64.slice(0, 96)}:${base64.slice(-96)}`;
  if (fingerprint === lastOcrFingerprint && lastOcrRequestId) return lastOcrRequestId;
  const id = newOcrRequestId();
  lastOcrFingerprint = fingerprint;
  lastOcrRequestId = id;
  return id;
}

async function compressDataUrl(dataUrl: string): Promise<{ base64: string; mimeType: string }> {
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("ocr-image-timeout")), 8000);
    img.onload = () => {
      window.clearTimeout(timer);
      resolve();
    };
    img.onerror = () => {
      window.clearTimeout(timer);
      reject(new Error("ocr-image"));
    };
    img.src = dataUrl;
  });
  const max = 1280;
  const scale = Math.min(1, max / Math.max(img.width || 1, img.height || 1));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("ocr-image");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const jpeg = canvas.toDataURL("image/jpeg", 0.72);
  const comma = jpeg.indexOf(",");
  return { base64: jpeg.slice(comma + 1), mimeType: "image/jpeg" };
}

async function toJpegPayload(dataUrl: string): Promise<{ base64: string; mimeType: string }> {
  try {
    return await compressDataUrl(dataUrl);
  } catch {
    const comma = dataUrl.indexOf(",");
    const header = dataUrl.slice(0, Math.max(0, comma));
    const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
    const mimeType = /image\/([\w+.-]+)/i.exec(header)?.[0] || "image/jpeg";
    return { base64, mimeType };
  }
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

async function pickNative(source: ImageSource): Promise<{ base64: string; mimeType: string } | null> {
  const { Camera, CameraResultType, CameraSource } = await import("@capacitor/camera");
  const need = source === "camera" ? "camera" : "photos";
  let perms = await Camera.checkPermissions();
  ocrDebugLog("camera", `checkPermissions camera=${perms.camera} photos=${perms.photos}`, "info");
  if (need === "camera" && perms.camera !== "granted") {
    perms = await Camera.requestPermissions({ permissions: ["camera"] });
    ocrDebugLog("camera", `request camera → ${perms.camera}`, perms.camera === "granted" ? "ok" : "warn");
    if (perms.camera !== "granted") throw new Error("ocr-permission");
  }
  if (need === "photos") {
    if (perms.photos !== "granted" && perms.photos !== "limited") {
      perms = await Camera.requestPermissions({ permissions: ["photos"] });
      ocrDebugLog("camera", `request photos → ${perms.photos}`, "info");
    }
    if (perms.photos !== "granted" && perms.photos !== "limited") {
      throw new Error("ocr-permission");
    }
  }
  try {
    ocrDebugLog("camera", `getPhoto source=${source}`, "info");
    const photo = await Camera.getPhoto({
      quality: 70,
      width: 1280,
      correctOrientation: true,
      resultType: CameraResultType.Base64,
      source: source === "camera" ? CameraSource.Camera : CameraSource.Photos,
    });
    const raw = photo.base64String?.replace(/\s/g, "") || "";
    if (!raw) {
      ocrDebugLog("camera", "getPhoto returned empty base64", "warn");
      return null;
    }
    ocrDebugLog(
      "camera",
      `getPhoto ok format=${photo.format || "?"} base64Len=${raw.length}`,
      "ok",
    );
    return { base64: raw, mimeType: mimeFromFormat(photo.format) };
  } catch (err) {
    const msg = String((err as { message?: string })?.message || err);
    ocrDebugLog("camera", `getPhoto failed: ${msg.slice(0, 240)}`, "error");
    if (/cancel/i.test(msg)) return null;
    throw err;
  }
}

export async function extractTextFromPickedImage(
  mode: "note" | "tasks",
  source: ImageSource,
): Promise<OcrCallResult | { ok: false; error: OcrPickError }> {
  ocrDebugLog("ocr", `start mode=${mode} source=${source}`, "info");
  await prepareForOcr();
  try {
    let payload: { base64: string; mimeType: string } | null = null;
    if (Capacitor.isNativePlatform()) {
      payload = await pickNative(source);
    } else {
      const dataUrl = await pickWithInput(source === "camera");
      if (dataUrl) payload = await toJpegPayload(dataUrl);
    }
    if (!payload?.base64) {
      ocrDebugLog("ocr", "cancelled (no image)", "info");
      return { ok: false, error: "cancelled" };
    }
    if (payload.base64.length > MAX_BASE64_CHARS) {
      if (payload.mimeType !== "image/jpeg") {
        payload = await toJpegPayload(`data:${payload.mimeType};base64,${payload.base64}`);
      }
      if (payload.base64.length > MAX_BASE64_CHARS) return { ok: false, error: "unavailable" };
    }
    return await callExtractTextFromImage({
      imageBase64: payload.base64,
      mimeType: payload.mimeType,
      mode,
      requestId: requestIdForPayload(payload.base64, mode),
    });
  } catch (err) {
    const msg = String((err as { message?: string })?.message || err);
    ocrDebugLog("ocr", `failed: ${msg.slice(0, 240)}`, "error");
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
