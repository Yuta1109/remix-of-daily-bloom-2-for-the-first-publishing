import { signInAnonymously, type Auth } from "firebase/auth";
import { getFunctions, httpsCallable, type Functions } from "firebase/functions";
import { ocrDebugLog } from "./ocr-debug-log";
import { ensureFirebaseJs } from "./firebase/firebase-app";
import {
  FIREBASE_FUNCTIONS_REGION,
  getFirebaseConfigStatus,
  readFirebaseWebConfig,
} from "./firebase/firebase-config";

export { getFirebaseConfigStatus };

const REGION = FIREBASE_FUNCTIONS_REGION;
/** Keep below Function timeout (120s) with a small buffer; 55s was far too short. */
const CALLABLE_TIMEOUT_MS = 110_000;
const AUTH_TIMEOUT_MS = 12_000;

let auth: Auth | null = null;
let functions: Functions | null = null;
let ready: Promise<boolean> | null = null;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(label)), ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        window.clearTimeout(timer);
        reject(err);
      },
    );
  });
}

export function getCallableAuthSnapshot() {
  return {
    ready: !!auth?.currentUser,
    uidPrefix: auth?.currentUser?.uid?.slice(0, 12) ?? null,
    isAnonymous: auth?.currentUser?.isAnonymous ?? null,
  };
}

export async function ensureCallableApp(): Promise<boolean> {
  if (ready) return ready;
  ready = (async () => {
    const config = readFirebaseWebConfig();
    if (!config) {
      ocrDebugLog("firebase", "readWebConfig returned null", "error");
      return false;
    }
    ocrDebugLog(
      "firebase",
      `config ok projectId=${config.projectId} appId=${config.appId?.slice(0, 12)}…`,
      "ok",
    );
    const ctx = ensureFirebaseJs();
    if (!ctx) return false;
    auth = ctx.auth;
    if (!auth.currentUser) {
      ocrDebugLog("firebase", "signInAnonymously…", "info");
      await withTimeout(signInAnonymously(auth), AUTH_TIMEOUT_MS, "ocr-auth-timeout");
    }
    const uid = auth.currentUser?.uid;
    ocrDebugLog("firebase", uid ? `auth uid=${uid.slice(0, 8)}…` : "auth missing uid", uid ? "ok" : "error");
    functions = getFunctions(ctx.app, REGION);
    return !!uid;
  })().catch((err) => {
    ocrDebugLog("firebase", `init failed: ${String((err as Error)?.message || err)}`, "error");
    ready = null;
    return false;
  });
  return ready;
}

export type OcrCallResult =
  | { ok: true; tasks: string[]; text?: undefined; latex?: string[]; lowConfidence?: boolean }
  | { ok: true; text: string; tasks?: undefined; latex?: string[]; lowConfidence?: boolean }
  | { ok: false; error: "quota" | "unreadable" | "error" | "unavailable" | "config" | "empty"; configReason?: string | null };

function mapCallableError(err: unknown): OcrCallResult {
  const code = String((err as { code?: string })?.code || "");
  const msg = String((err as { message?: string })?.message || err);
  ocrDebugLog("callable", `error code=${code || "none"} msg=${msg.slice(0, 240)}`, "error");
  if (
    code.includes("unauthenticated") ||
    msg.includes("ocr-auth-timeout") ||
    msg.includes("ocr-call-timeout")
  ) {
    return { ok: false, error: "unavailable" };
  }
  if (code.includes("resource-exhausted") || code.includes("unavailable")) {
    return { ok: false, error: "quota" };
  }
  if (code.includes("invalid-argument")) {
    return { ok: false, error: "unreadable" };
  }
  return { ok: false, error: "error" };
}

export async function callExtractTextFromImage(payload: {
  imageBase64: string;
  mimeType: string;
  mode: "note" | "tasks";
  requestId: string;
}): Promise<OcrCallResult> {
  ocrDebugLog(
    "callable",
    `extractTextFromImage mode=${payload.mode} base64Len=${payload.imageBase64.length} mime=${payload.mimeType} requestId=${payload.requestId.slice(0, 8)}…`,
    "info",
  );
  const ok = await ensureCallableApp();
  if (!ok || !functions) return { ok: false, error: "unavailable" };
  try {
    const fn = httpsCallable<
      typeof payload,
      {
        ok?: boolean;
        text?: string;
        tasks?: string[];
        latex?: string[];
        lowConfidence?: boolean;
        error?: string;
        debug?: {
          tried?: string[];
          reserveReason?: string | null;
          lastModel?: string | null;
          lastStatus?: number | null;
          lastKind?: string | null;
          lastSnippet?: string | null;
          structured?: boolean | null;
          sawApiQuota?: boolean;
          keyReason?: string | null;
          hint?: string | null;
        };
      }
    >(functions, "extractTextFromImage", { timeout: CALLABLE_TIMEOUT_MS });
    const res = await withTimeout(fn(payload), CALLABLE_TIMEOUT_MS + 2_000, "ocr-call-timeout");
    const data = res.data;
    const dbg = data?.debug;
    if (dbg) {
      ocrDebugLog(
        "callable",
        [
          `debug tried=${dbg.tried?.join(",") || "none"}`,
          `reserve=${dbg.reserveReason ?? "none"}`,
          `last=${dbg.lastModel ?? "?"} status=${dbg.lastStatus ?? "?"} kind=${dbg.lastKind ?? "?"}`,
          dbg.structured != null ? `structured=${dbg.structured}` : "",
          dbg.sawApiQuota ? "sawApiQuota=true" : "",
          dbg.lastSnippet ? `snippet=${dbg.lastSnippet.slice(0, 160)}` : "",
          (dbg as { hint?: string }).hint ? `hint=${String((dbg as { hint?: string }).hint).slice(0, 160)}` : "",
        ]
          .filter(Boolean)
          .join(" "),
        data?.ok ? "ok" : "warn",
      );
    }
    ocrDebugLog(
      "callable",
      `response ok=${data?.ok} error=${data?.error ?? "none"} tasks=${data?.tasks?.length ?? 0} textLen=${String(data?.text || "").length} lowConfidence=${data?.lowConfidence ? "true" : "false"}`,
      data?.ok ? "ok" : "warn",
    );
    ocrDebugLog(
      "callable",
      `raw=${JSON.stringify(data ?? null).slice(0, 2000)}`,
      data?.ok ? "ok" : "warn",
    );
    if (data?.ok && payload.mode === "tasks") {
      const tasks = Array.isArray(data.tasks) ? data.tasks.map((t) => String(t).trim()).filter(Boolean) : [];
      if (!tasks.length) return { ok: false, error: "empty" };
      return { ok: true, tasks, lowConfidence: !!data.lowConfidence };
    }
    if (data?.ok && payload.mode === "note") {
      const text = String(data.text || "").trim();
      const latex = Array.isArray(data.latex) ? data.latex.map((s) => String(s).trim()).filter(Boolean) : [];
      if (!text && !latex.length) return { ok: false, error: "empty" };
      return { ok: true, text, latex, lowConfidence: !!data.lowConfidence };
    }
    const err = data?.error;
    if (err === "quota" || err === "unreadable" || err === "config" || err === "empty") {
      return {
        ok: false,
        error: err,
        configReason: err === "config" ? dbg?.keyReason ?? null : undefined,
      };
    }
    return { ok: false, error: "error" };
  } catch (err) {
    return mapCallableError(err);
  }
}

export async function fetchGeminiQuotaStatus(): Promise<string> {
  const ok = await ensureCallableApp();
  if (!ok || !functions) return "quota probe: firebase not ready";
  try {
    const fn = httpsCallable<Record<string, never>, { models?: Array<Record<string, unknown>> }>(
      functions,
      "getGeminiQuotaStatus",
      { timeout: 15_000 },
    );
    const res = await fn({});
    const models = res.data?.models ?? [];
    if (!models.length) return "quota probe: empty";
    return models
      .map((m) => {
        const model = String(m.model ?? "?");
        const available = m.available === true ? "ok" : "blocked";
        const pct = m.percentage as { rpm?: number; tpm?: number; rpd?: number } | undefined;
        return `${model} ${available} rpm=${m.rpm} tpm=${m.tpm} rpd=${m.rpd} pct=${pct?.rpm ?? "?"}%/${pct?.tpm ?? "?"}%/${pct?.rpd ?? "?"}%`;
      })
      .join("\n");
  } catch (err) {
    return `quota probe failed: ${String((err as Error)?.message || err)}`;
  }
}

export async function probeGeminiApiKeyFromServer(): Promise<string> {
  const ok = await ensureCallableApp();
  if (!ok || !functions) return "gemini key probe: firebase not ready";
  try {
    const fn = httpsCallable<
      Record<string, never>,
      {
        ok?: boolean;
        status?: number | null;
        hint?: string | null;
        snippet?: string | null;
        meta?: { ok?: boolean; reason?: string | null; len?: number; prefix?: string | null };
      }
    >(functions, "probeGeminiApiKeyStatus", { timeout: 20_000 });
    const res = await fn({});
    const d = res.data;
    const meta = d?.meta;
    const parts = [
      `geminiKey meta ok=${meta?.ok ?? "?"} reason=${meta?.reason ?? "none"} len=${meta?.len ?? "?"} prefix=${meta?.prefix ?? "?"}`,
      `liveProbe ok=${d?.ok} http=${d?.status ?? "?"}`,
      d?.hint ? `hint=${d.hint}` : "",
      d?.snippet ? `snippet=${d.snippet.slice(0, 160)}` : "",
    ].filter(Boolean);
    return parts.join(" ");
  } catch (err) {
    return `gemini key probe failed: ${String((err as Error)?.message || err)}`;
  }
}
