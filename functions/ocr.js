/**
 * Handwritten image extraction via Gemini only.
 * Key lives in Secret Manager (GEMINI_API_KEY). Never logged. Never sent to iOS.
 */
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions";
import {
  ESTIMATED_OUTPUT_TOKENS,
  FREE_ONLY,
  FREE_MODELS,
  NOTE_PROMPT,
  NOTE_RESPONSE_SCHEMA,
  TASK_PROMPT,
  TASK_RESPONSE_SCHEMA,
  TEMP_UNAVAILABLE_BASE_MS,
  TEMP_UNAVAILABLE_RETRIES,
  estimatedTokensForRequest,
} from "./gemini-config.js";
import { isQuotaHttpError, isTransientHttpError } from "./quota-logic.js";
import {
  getQuotaStatus,
  markModelQuotaExhausted,
  releaseReservation,
  reserveNextModel,
  settleReservation,
} from "./quota-manager.js";
import {
  beginOcrRequest,
  finishOcrRequest,
  isValidImageBase64,
  waitForOcrRequest,
} from "./ocr-idempotency.js";
import { normalizeGeminiApiKey, probeGeminiApiKey, validateGeminiApiKeyMeta } from "./gemini-key.js";

const REGION = "asia-northeast1";
const MAX_BYTES = 1_800_000;
const geminiKey = defineSecret("GEMINI_API_KEY");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseJsonObject(raw) {
  const text = String(raw || "")
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function usageFromGemini(json) {
  const u = json?.usageMetadata || {};
  const prompt = Number(u.promptTokenCount || 0);
  const total = Number(u.totalTokenCount || 0);
  const output = Number(u.candidatesTokenCount || 0);
  return {
    promptTokens: prompt,
    outputTokens: output,
    totalTokens: total || prompt + output,
  };
}

function candidateText(json) {
  const candidate = json?.candidates?.[0];
  if (!candidate) return "";
  const parts = candidate?.content?.parts;
  if (!Array.isArray(parts)) return "";
  const text = parts
    .filter((p) => !p.thought)
    .map((p) => p.text || "")
    .join("");
  if (text) return text;
  return parts.map((p) => p.text || "").join("");
}

function candidateMeta(json) {
  const candidate = json?.candidates?.[0];
  return {
    finishReason: candidate?.finishReason || null,
    blockReason: json?.promptFeedback?.blockReason || null,
    safetyRatings: candidate?.safetyRatings?.length ?? 0,
  };
}

/** OCR uses direct JSON output — skip thinking to avoid truncating the response. */
function thinkingConfigForModel(_modelId) {
  return {};
}

function generationConfigForModel(modelId, mode, structured) {
  const schema = mode === "tasks" ? TASK_RESPONSE_SCHEMA : NOTE_RESPONSE_SCHEMA;
  const config = {
    temperature: 0.1,
    maxOutputTokens: ESTIMATED_OUTPUT_TOKENS,
    ...thinkingConfigForModel(modelId),
  };
  if (structured) {
    config.responseMimeType = "application/json";
    config.responseSchema = schema;
  }
  return config;
}

async function callGemini({ modelId, apiKey, mimeType, imageBase64, mode, structured = true }) {
  const prompt = mode === "tasks" ? TASK_PROMPT : NOTE_PROMPT;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:generateContent`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    signal: AbortSignal.timeout(60_000),
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: prompt },
            { inlineData: { mimeType, data: imageBase64 } },
          ],
        },
      ],
      generationConfig: generationConfigForModel(modelId, mode, structured),
    }),
  });
  const bodyText = await res.text();
  let json = null;
  try {
    json = JSON.parse(bodyText);
  } catch {
    json = null;
  }
  return { status: res.status, json, bodyText: bodyText.slice(0, 400) };
}

function normalizeTasks(parsed) {
  const list = Array.isArray(parsed?.tasks) ? parsed.tasks : [];
  return list.map((t) => String(t || "").trim()).filter(Boolean);
}

function asBool(v) {
  return v === true || v === "true";
}

function qualityFlags(parsed) {
  const empty = asBool(parsed?.empty);
  const lowConfidence = asBool(parsed?.lowConfidence);
  const latex = Array.isArray(parsed?.latex)
    ? parsed.latex.map((s) => String(s || "").trim()).filter(Boolean)
    : [];
  return { empty, lowConfidence, latex };
}

function failureKind(status, bodyText) {
  if (isQuotaHttpError(status, bodyText)) return "api-quota";
  if (status === 404) return "model-not-found";
  if (status === 401 || status === 403) return "auth";
  if (status === 400) return "bad-request";
  if (isTransientHttpError(status)) return "transient";
  if (status >= 400) return "http";
  return "unknown";
}

function buildDebug({ tried, reserveReason, lastFailure, sawApiQuota }) {
  return {
    tried,
    reserveReason: reserveReason || null,
    lastModel: lastFailure?.modelId || null,
    lastStatus: lastFailure?.status ?? null,
    lastKind: lastFailure?.kind || null,
    lastSnippet: lastFailure?.bodyText?.slice(0, 200) || null,
    structured: lastFailure?.structured ?? null,
    sawApiQuota: !!sawApiQuota,
  };
}

function finalError({ reserveReason, lastFailure, sawApiQuota }) {
  if (lastFailure?.kind === "auth") return "config";
  if (reserveReason === "all-unavailable") return "quota";
  if (sawApiQuota && !lastFailure) return "quota";
  if (lastFailure?.kind === "api-quota" && sawApiQuota) return "quota";
  return "error";
}

async function extractWithFallback({ apiKey, mimeType, imageBase64, mode }) {
  const tried = [];
  const estimated = estimatedTokensForRequest();
  let reserveReason = null;
  let lastFailure = null;
  let sawApiQuota = false;

  while (tried.length < FREE_MODELS.length) {
    const reserved = await reserveNextModel(estimated, tried);
    if (!reserved.ok) {
      reserveReason = reserved.reason || "all-unavailable";
      logger.info("ocr reserve failed", { reason: reserveReason, tried });
      return {
        error: "quota",
        tried,
        reserveReason,
        lastFailure,
        sawApiQuota,
        debug: buildDebug({ tried, reserveReason, lastFailure, sawApiQuota }),
      };
    }
    const modelId = reserved.modelId;
    if (!FREE_ONLY || !FREE_MODELS.includes(modelId)) {
      reserveReason = "invalid-model";
      return {
        error: "error",
        tried,
        reserveReason,
        lastFailure,
        sawApiQuota,
        debug: buildDebug({ tried, reserveReason, lastFailure, sawApiQuota }),
      };
    }
    tried.push(modelId);

    let modelSucceeded = false;
    let lastTransient = null;
    for (const structured of [true, false]) {
      for (let attempt = 0; attempt <= TEMP_UNAVAILABLE_RETRIES; attempt++) {
        if (attempt > 0) {
          await sleep(TEMP_UNAVAILABLE_BASE_MS * 2 ** (attempt - 1));
        }
        let result;
        try {
          result = await callGemini({
            modelId,
            apiKey,
            mimeType,
            imageBase64,
            mode,
            structured,
          });
        } catch (err) {
          lastTransient = err;
          logger.warn("gemini network error", { model: modelId, attempt, structured });
          continue;
        }

        const kind = failureKind(result.status, result.bodyText);
        if (kind === "api-quota") {
          sawApiQuota = true;
          logger.info("gemini quota hard fallback", {
            model: modelId,
            status: result.status,
            snippet: result.bodyText.slice(0, 120),
          });
          await markModelQuotaExhausted(modelId, result.bodyText);
          lastFailure = {
            modelId,
            status: result.status,
            bodyText: result.bodyText,
            kind,
            structured,
          };
          break;
        }

        if (kind === "transient") {
          lastTransient = new Error(`http ${result.status}`);
          logger.warn("gemini transient", {
            model: modelId,
            status: result.status,
            attempt,
            structured,
          });
          if (attempt < TEMP_UNAVAILABLE_RETRIES) continue;
          lastFailure = {
            modelId,
            status: result.status,
            bodyText: result.bodyText,
            kind,
            structured,
          };
          break;
        }

        if (!result.json || result.status >= 400) {
          logger.warn("gemini call failed", {
            model: modelId,
            status: result.status,
            kind,
            structured,
            snippet: result.bodyText.slice(0, 120),
          });
          lastFailure = {
            modelId,
            status: result.status,
            bodyText: result.bodyText,
            kind,
            structured,
          };
          if (kind === "bad-request" && structured) {
            break;
          }
          break;
        }

        const usage = usageFromGemini(result.json);
        const rawText = candidateText(result.json);
        const meta = candidateMeta(result.json);
        const parsed = parseJsonObject(rawText);
        if (!parsed) {
          logger.warn("gemini unparseable response", {
            model: modelId,
            mode,
            structured,
            finishReason: meta.finishReason,
            blockReason: meta.blockReason,
            snippet: rawText.slice(0, 200),
          });
          lastFailure = {
            modelId,
            status: result.status,
            bodyText: rawText || JSON.stringify(meta),
            kind: meta.blockReason ? "blocked" : "bad-parse",
            structured,
          };
          if (structured) break;
          break;
        }

        await settleReservation(modelId, estimated, usage.totalTokens || estimated);
        modelSucceeded = true;
        logger.info("gemini ok", {
          model: modelId,
          mode,
          structured,
          fallback: tried.length > 1,
          triedCount: tried.length,
          promptTokens: usage.promptTokens,
          totalTokens: usage.totalTokens,
        });
        if (mode === "tasks") {
          const q = qualityFlags(parsed);
          return {
            error: null,
            tasks: normalizeTasks(parsed),
            empty: q.empty,
            lowConfidence: q.lowConfidence,
            modelId,
            tried,
            debug: buildDebug({ tried, reserveReason, lastFailure, sawApiQuota }),
          };
        }
        const q = qualityFlags(parsed);
        const text = String(parsed?.text || "").trim();
        return {
          error: null,
          text,
          latex: q.latex,
          empty: q.empty,
          lowConfidence: q.lowConfidence,
          modelId,
          tried,
          debug: buildDebug({ tried, reserveReason, lastFailure, sawApiQuota }),
        };
      }

      if (modelSucceeded) break;
      if (lastFailure?.kind === "api-quota") break;
      if (lastFailure?.kind === "bad-request" && structured) {
        logger.info("gemini retry without schema", { model: modelId });
        lastFailure = null;
        continue;
      }
      if (lastFailure?.kind === "bad-parse" && structured) {
        logger.info("gemini retry without schema after bad parse", { model: modelId });
        lastFailure = null;
        continue;
      }
      break;
    }

    if (!modelSucceeded) {
      await releaseReservation(modelId, estimated);
      continue;
    }
  }

  const error = finalError({ reserveReason, lastFailure, sawApiQuota });
  logger.warn("ocr all models failed", {
    error,
    tried,
    reserveReason,
    lastFailure,
    sawApiQuota,
  });
  return {
    error,
    tried,
    reserveReason,
    lastFailure,
    sawApiQuota,
    debug: buildDebug({ tried, reserveReason, lastFailure, sawApiQuota }),
  };
}

export const extractTextFromImage = onCall(
  {
    region: REGION,
    timeoutSeconds: 120,
    memory: "512MiB",
    cors: true,
    secrets: [geminiKey],
    // App Check can be enabled later with enforceAppCheck: true (not required now).
  },
  async (req) => {
    if (!req.auth?.uid) {
      throw new HttpsError("unauthenticated", "Sign-in required.");
    }

    const imageBase64 = String(req.data?.imageBase64 || "").replace(/\s/g, "");
    const mimeType = String(req.data?.mimeType || "image/jpeg");
    const mode = req.data?.mode === "tasks" ? "tasks" : "note";
    const requestId = String(req.data?.requestId || "");
    if (!imageBase64 || imageBase64.length > MAX_BYTES || !isValidImageBase64(imageBase64)) {
      throw new HttpsError("invalid-argument", "Image is missing or too large.");
    }
    if (!/^image\/(jpeg|jpg|png|webp|heic|heif)$/i.test(mimeType)) {
      throw new HttpsError("invalid-argument", "Unsupported image type.");
    }

    const begun = await beginOcrRequest(requestId, req.auth.uid);
    if (begun.kind === "foreign") {
      throw new HttpsError("permission-denied", "Invalid request.");
    }
    if (begun.kind === "cached") {
      return begun.result;
    }
    if (begun.kind === "running") {
      const waited = await waitForOcrRequest(requestId, req.auth.uid);
      if (waited) return waited;
      throw new HttpsError("aborted", "OCR is already in progress for this request.");
    }

    const apiKey = normalizeGeminiApiKey(geminiKey.value());
    const keyMeta = validateGeminiApiKeyMeta(apiKey);
    if (!keyMeta.ok) {
      logger.error("GEMINI_API_KEY invalid", keyMeta);
      const payload = {
        ok: false,
        error: "config",
        debug: {
          keyReason: keyMeta.reason,
          keyLen: keyMeta.len,
          keyPrefix: keyMeta.prefix,
          hint: keyMeta.hint,
        },
      };
      await finishOcrRequest(requestId, req.auth.uid, payload, false);
      return payload;
    }

    try {
      const result = await extractWithFallback({
        apiKey,
        mimeType,
        imageBase64,
        mode,
      });
      let payload;
      if (result.error === "quota") {
        payload = { ok: false, error: "quota", debug: result.debug };
      } else if (result.error === "config") {
        payload = {
          ok: false,
          error: "config",
          debug: {
            ...result.debug,
            hint: "GEMINI_API_KEY rejected by Google (401). Use a Google AI Studio key, not the Firebase Web API key.",
          },
        };
      } else if (result.error) {
        payload = { ok: false, error: "error", debug: result.debug };
      } else if (mode === "tasks") {
        const tasks = result.tasks || [];
        const hasTasks = tasks.length > 0;
        const empty = !hasTasks && result.empty === true;
        payload = empty
          ? { ok: false, error: "empty", debug: result.debug }
          : hasTasks
            ? {
                ok: true,
                tasks,
                lowConfidence: !!result.lowConfidence,
                debug: result.debug,
              }
            : { ok: false, error: "unreadable", debug: result.debug };
      } else {
        const text = String(result.text || "").trim();
        const latex = Array.isArray(result.latex) ? result.latex.filter(Boolean) : [];
        const hasContent = !!text || latex.length > 0;
        const empty = !hasContent && result.empty === true;
        payload = empty
          ? { ok: false, error: "empty", debug: result.debug }
          : hasContent
            ? {
                ok: true,
                text: result.text,
                latex,
                lowConfidence: !!result.lowConfidence,
                debug: result.debug,
              }
            : { ok: false, error: "unreadable", debug: result.debug };
      }
      await finishOcrRequest(requestId, req.auth.uid, payload, payload.ok === true);
      return payload;
    } catch (err) {
      logger.error("extractTextFromImage failed", { message: String(err?.message || err) });
      const payload = { ok: false, error: "error" };
      await finishOcrRequest(requestId, req.auth.uid, payload, false);
      return payload;
    }
  },
);

export const getGeminiQuotaStatus = onCall(
  {
    region: REGION,
    cors: true,
  },
  async (req) => {
    if (!req.auth?.uid) {
      throw new HttpsError("unauthenticated", "Sign-in required.");
    }
    return { models: await getQuotaStatus() };
  },
);

export const probeGeminiApiKeyStatus = onCall(
  {
    region: REGION,
    cors: true,
    secrets: [geminiKey],
  },
  async (req) => {
    if (!req.auth?.uid) {
      throw new HttpsError("unauthenticated", "Sign-in required.");
    }
    return probeGeminiApiKey(geminiKey.value());
  },
);
