/** Helpers for GEMINI_API_KEY (Google AI Studio). Never log the full key. */

export function normalizeGeminiApiKey(raw) {
  return String(raw || "")
    .trim()
    .replace(/^Bearer\s+/i, "")
    .replace(/^["']|["']$/g, "");
}

/** Standard (AIza…) and auth (AQ.…) keys from Google AI Studio / Gemini API. */
export function isValidGeminiApiKeyFormat(key) {
  return (
    /^AIza[0-9A-Za-z_-]+$/.test(key) ||
    /^AQ\.[0-9A-Za-z_.-]+$/.test(key)
  );
}

export function validateGeminiApiKeyMeta(apiKey) {
  const key = normalizeGeminiApiKey(apiKey);
  if (!key) return { ok: false, reason: "missing", len: 0, prefix: null };
  if (key.length < 20) {
    return { ok: false, reason: "too-short", len: key.length, prefix: key.slice(0, 8) };
  }
  if (!isValidGeminiApiKeyFormat(key)) {
    const hint = key.startsWith("ya29.")
      ? "This looks like an OAuth access token, not a Gemini API key. Use a key from aistudio.google.com/apikey (AIza… or AQ.…)."
      : "Gemini API keys from Google AI Studio start with AIza or AQ. Create one at aistudio.google.com/apikey, then: npm run gemini:secret && npm run deploy";
    return { ok: false, reason: "bad-format", len: key.length, prefix: key.slice(0, 8), hint };
  }
  return { ok: true, reason: null, len: key.length, prefix: key.slice(0, 8), hint: null };
}

/** Minimal live check against Generative Language API (no image). */
export async function probeGeminiApiKey(apiKey) {
  const meta = validateGeminiApiKeyMeta(apiKey);
  if (!meta.ok) {
    return {
      ok: false,
      status: null,
      meta,
      hint: meta.hint || "Set GEMINI_API_KEY via Google AI Studio (not the Firebase Web API key).",
    };
  }
  const url =
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": normalizeGeminiApiKey(apiKey),
    },
    signal: AbortSignal.timeout(15_000),
    body: JSON.stringify({
      contents: [{ parts: [{ text: 'Reply with JSON: {"ok":true}' }] }],
      generationConfig: { maxOutputTokens: 32, temperature: 0 },
    }),
  });
  const bodyText = await res.text();
  let hint = null;
  if (res.status === 401 || res.status === 403) {
    hint =
      "GEMINI_API_KEY rejected (401). Create a key at aistudio.google.com/apikey, then: npm run gemini:secret && npm run deploy";
  } else if (res.status === 429) {
    hint = "Key works but quota exceeded on probe model.";
  }
  return {
    ok: res.ok,
    status: res.status,
    meta,
    hint,
    snippet: bodyText.slice(0, 240),
  };
}
