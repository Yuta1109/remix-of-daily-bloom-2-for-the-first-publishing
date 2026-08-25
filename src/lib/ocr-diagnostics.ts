import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import {
  ensureCallableApp,
  fetchGeminiQuotaStatus,
  getCallableAuthSnapshot,
  getFirebaseConfigStatus,
  probeGeminiApiKeyFromServer,
} from "./firebase-client";
import { ocrDebugLog } from "./ocr-debug-log";

const APP_VERSION = "1.1.0";

export async function buildOcrDiagnosticHeader(): Promise<string> {
  const cfg = getFirebaseConfigStatus();
  const authSnap = getCallableAuthSnapshot();
  let appInfo = "";
  try {
    if (Capacitor.isNativePlatform()) {
      const info = await App.getInfo();
      appInfo = `app=${info.name} v${info.version} build=${info.build} id=${info.id}`;
    }
  } catch {
    /* ignore */
  }
  const lines = [
    "=== Essences OCR diagnostic ===",
    `exportedAt=${new Date().toISOString()}`,
    `platform=${Capacitor.getPlatform()} native=${Capacitor.isNativePlatform()}`,
    appInfo || `webVersion=${APP_VERSION}`,
    `userAgent=${typeof navigator !== "undefined" ? navigator.userAgent : "n/a"}`,
    `screen=${typeof window !== "undefined" ? `${window.innerWidth}x${window.innerHeight}@${window.devicePixelRatio || 1}x` : "n/a"}`,
    `firebaseConfigPresent=${cfg.present}`,
    `projectId=${cfg.projectId ?? "missing"}`,
    `hasApiKey=${cfg.hasApiKey} apiKeyPrefix=${cfg.apiKeyPrefix ?? "none"}`,
    `appId=${cfg.appId ?? "missing"} messagingSenderId=${cfg.messagingSenderId ?? "missing"}`,
    `authReady=${authSnap.ready} authUidPrefix=${authSnap.uidPrefix ?? "none"} authAnonymous=${authSnap.isAnonymous ?? "?"}`,
    `functionsRegion=asia-northeast1`,
    `callable=extractTextFromImage`,
    `callableTimeoutMs=110000`,
  ];
  return lines.join("\n");
}

/** Log environment + optional auth probe (no image upload). */
export async function probeOcrEnvironment(source: string): Promise<void> {
  const cfg = getFirebaseConfigStatus();
  const authSnap = getCallableAuthSnapshot();
  ocrDebugLog("probe", `start (${source}) platform=${Capacitor.getPlatform()}`, "info");
  ocrDebugLog(
    "probe",
    `firebase config present=${cfg.present} projectId=${cfg.projectId ?? "missing"} hasApiKey=${cfg.hasApiKey} appId=${cfg.appId ?? "missing"}`,
    cfg.present ? "ok" : "error",
  );
  ocrDebugLog(
    "probe",
    `auth ready=${authSnap.ready} uidPrefix=${authSnap.uidPrefix ?? "none"} anonymous=${authSnap.isAnonymous ?? "?"}`,
    authSnap.ready ? "ok" : "warn",
  );
  if (!cfg.present) {
    ocrDebugLog(
      "probe",
      "VITE_FIREBASE_WEB_CONFIG missing in this build — OCR callable cannot run",
      "error",
    );
    return;
  }
  try {
    const ok = await ensureCallableApp();
    const afterAuth = getCallableAuthSnapshot();
    ocrDebugLog(
      "probe",
      `ensureCallableApp → ${ok} uidPrefix=${afterAuth.uidPrefix ?? "none"}`,
      ok ? "ok" : "error",
    );
    if (ok) {
      const quota = await fetchGeminiQuotaStatus();
      for (const line of quota.split("\n")) {
        ocrDebugLog("probe", line, line.includes("blocked") ? "warn" : "info");
      }
      const keyProbe = await probeGeminiApiKeyFromServer();
      ocrDebugLog(
        "probe",
        keyProbe,
        keyProbe.includes("liveProbe ok=true") ? "ok" : "error",
      );
    }
  } catch (err) {
    ocrDebugLog("probe", `ensureCallableApp threw: ${String((err as Error)?.message || err)}`, "error");
  }
}
