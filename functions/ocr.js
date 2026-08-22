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
  reserveNextModel,
  settleReservation,
} from "./quota-manager.js";

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
  const parts = json?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts.map((p) => p.text || "").join("");
}

async function callGemini({ modelId, apiKey, mimeType, imageBase64, mode }) {
  const schema = mode === "tasks" ? TASK_RESPONSE_SCHEMA : NOTE_RESPONSE_SCHEMA;
  const prompt = mode === "tasks" ? TASK_PROMPT : NOTE_PROMPT;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:generateContent`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: prompt },
            { inline_data: { mime_type: mimeType, data: imageBase64 } },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: ESTIMATED_OUTPUT_TOKENS,
        responseMimeType: "application/json",
        responseSchema: schema,
      },
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

async function extractWithFallback({ apiKey, mimeType, imageBase64, mode }) {
  const tried = [];
  const estimated = estimatedTokensForRequest();

  while (tried.length < FREE_MODELS.length) {
    const reserved = await reserveNextModel(estimated, tried);
    if (!reserved.ok) {
      return { error: "quota", tried };
    }
    const modelId = reserved.modelId;
    if (!FREE_ONLY || !FREE_MODELS.includes(modelId)) {
      return { error: "quota", tried };
    }
    tried.push(modelId);

    let lastTransient = null;
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
        });
      } catch (err) {
        lastTransient = err;
        logger.warn("gemini network error", { model: modelId, attempt });
        continue;
      }

      if (isQuotaHttpError(result.status, result.bodyText)) {
        logger.info("gemini quota hard fallback", {
          model: modelId,
          status: result.status,
        });
        await markModelQuotaExhausted(modelId, result.bodyText);
        break;
      }

      if (isTransientHttpError(result.status)) {
        lastTransient = new Error(`http ${result.status}`);
        logger.warn("gemini transient", { model: modelId, status: result.status, attempt });
        if (attempt < TEMP_UNAVAILABLE_RETRIES) continue;
        break;
      }

      if (!result.json || result.status >= 400) {
        logger.warn("gemini non-quota error, trying next model", {
          model: modelId,
          status: result.status,
        });
        break;
      }

      const usage = usageFromGemini(result.json);
      await settleReservation(modelId, estimated, usage.totalTokens || estimated);
      const parsed = parseJsonObject(candidateText(result.json));
      logger.info("gemini ok", {
        model: modelId,
        mode,
        fallback: tried.length > 1,
        triedCount: tried.length,
        promptTokens: usage.promptTokens,
        totalTokens: usage.totalTokens,
      });
      if (mode === "tasks") {
        return { error: null, tasks: normalizeTasks(parsed), modelId, tried };
      }
      const text = String(parsed?.text || "").trim();
      return { error: null, text, modelId, tried };
    }

    if (lastTransient && tried.length >= FREE_MODELS.length) {
      return { error: "error", tried };
    }
  }

  return { error: "quota", tried };
}

export const extractTextFromImage = onCall(
  {
    region: REGION,
    timeoutSeconds: 60,
    memory: "512MiB",
    cors: true,
    secrets: [geminiKey],
  },
  async (req) => {
    if (!req.auth?.uid) {
      throw new HttpsError("unauthenticated", "Sign-in required.");
    }
    const imageBase64 = String(req.data?.imageBase64 || "").replace(/\s/g, "");
    const mimeType = String(req.data?.mimeType || "image/jpeg");
    const mode = req.data?.mode === "tasks" ? "tasks" : "note";
    if (!imageBase64 || imageBase64.length > MAX_BYTES) {
      throw new HttpsError("invalid-argument", "Image is missing or too large.");
    }
    if (!/^image\/(jpeg|jpg|png|webp|heic|heif)$/i.test(mimeType)) {
      throw new HttpsError("invalid-argument", "Unsupported image type.");
    }

    const apiKey = geminiKey.value();
    if (!apiKey) {
      logger.error("GEMINI_API_KEY missing");
      return { ok: false, error: "error" };
    }

    try {
      const result = await extractWithFallback({
        apiKey,
        mimeType,
        imageBase64,
        mode,
      });
      if (result.error === "quota") {
        return { ok: false, error: "quota" };
      }
      if (result.error) {
        return { ok: false, error: "error" };
      }
      if (mode === "tasks") {
        if (!result.tasks?.length) return { ok: false, error: "unreadable" };
        return { ok: true, tasks: result.tasks };
      }
      if (!result.text) return { ok: false, error: "unreadable" };
      return { ok: true, text: result.text };
    } catch (err) {
      logger.error("extractTextFromImage failed", { message: String(err?.message || err) });
      return { ok: false, error: "error" };
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
