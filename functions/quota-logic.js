import {
  FREE_MODELS,
  FREE_ONLY,
  GEMINI_MODEL_CONFIG,
  QUOTA_THRESHOLD,
  QUOTA_TIME_ZONE,
  estimatedTokensForRequest,
} from "./gemini-config.js";

export function pacificParts(nowMs = Date.now()) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: QUOTA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(new Date(nowMs)).map((p) => [p.type, p.value]),
  );
  const dayKey = `${parts.year}-${parts.month}-${parts.day}`;
  const minuteKey = `${dayKey}T${parts.hour}:${parts.minute}`;
  return { dayKey, minuteKey };
}

export function wouldExceedSoftLimit(used, add, limit, threshold = QUOTA_THRESHOLD) {
  if (!limit || limit <= 0) return true;
  return (used + add) / limit >= threshold;
}

/** After a Gemini call, replace the reserved TPM estimate with measured usage. */
export function tpmAfterSettle(currentTpm, estimatedTokens, actualTokens) {
  const estimated = Number(estimatedTokens) || 0;
  const actual = Number(actualTokens);
  if (!Number.isFinite(actual) || actual <= 0) return Math.max(0, Number(currentTpm) || 0);
  return Math.max(0, (Number(currentTpm) || 0) + (actual - estimated));
}

export function isFreeModel(modelId) {
  return FREE_ONLY && FREE_MODELS.includes(modelId);
}

export function normalizeQuotaState(raw, nowMs, config = GEMINI_MODEL_CONFIG) {
  const { dayKey, minuteKey } = pacificParts(nowMs);
  const modelId = raw?.modelId;
  const limits = (modelId && config[modelId]) || { rpm: 0, tpm: 0, rpd: 0 };
  const sameMinute = raw?.minuteKey === minuteKey;
  const sameDay = raw?.dayKey === dayKey;
  const disabledUntil = Number(raw?.temporaryDisabledUntil || 0);
  return {
    modelId,
    minuteKey,
    dayKey,
    rpm: sameMinute ? Number(raw?.rpm || 0) : 0,
    tpm: sameMinute ? Number(raw?.tpm || 0) : 0,
    rpd: sameDay ? Number(raw?.rpd || 0) : 0,
    temporaryDisabledUntil: disabledUntil > nowMs ? disabledUntil : 0,
    limits: { rpm: limits.rpm, tpm: limits.tpm, rpd: limits.rpd },
  };
}

export function quotaPercents(state) {
  const { rpm, tpm, rpd, limits } = state;
  return {
    rpm: limits.rpm ? rpm / limits.rpm : 1,
    tpm: limits.tpm ? tpm / limits.tpm : 1,
    rpd: limits.rpd ? rpd / limits.rpd : 1,
  };
}

export function softLimitReason(state, tokenAdd, requestAdd = 1, threshold = QUOTA_THRESHOLD) {
  if (wouldExceedSoftLimit(state.rpm, requestAdd, state.limits.rpm, threshold)) return "rpm";
  if (wouldExceedSoftLimit(state.tpm, tokenAdd, state.limits.tpm, threshold)) return "tpm";
  if (wouldExceedSoftLimit(state.rpd, requestAdd, state.limits.rpd, threshold)) return "rpd";
  return null;
}

/**
 * @param {Record<string, ReturnType<typeof normalizeQuotaState>>} statesByModel
 * @param {number} tokenAdd
 * @param {number} nowMs
 */
export function getNextAvailableModel(statesByModel, tokenAdd, nowMs, models = FREE_MODELS) {
  for (const modelId of models) {
    if (!isFreeModel(modelId)) continue;
    const state = statesByModel[modelId];
    if (!state) {
      return { modelId, reason: "no-state" };
    }
    if (state.temporaryDisabledUntil > nowMs) continue;
    const blocked = softLimitReason(state, tokenAdd);
    if (blocked) continue;
    return { modelId, reason: null };
  }
  return { modelId: null, reason: "all-unavailable" };
}

export function formatQuotaStatus(state) {
  const pct = quotaPercents(state);
  return {
    model: state.modelId,
    rpm: `${state.rpm} / ${state.limits.rpm}`,
    tpm: `${state.tpm} / ${state.limits.tpm}`,
    rpd: `${state.rpd} / ${state.limits.rpd}`,
    percentage: {
      rpm: Math.round(pct.rpm * 1000) / 10,
      tpm: Math.round(pct.tpm * 1000) / 10,
      rpd: Math.round(pct.rpd * 1000) / 10,
    },
    available:
      state.temporaryDisabledUntil <= Date.now() &&
      !softLimitReason(state, estimatedTokensForRequest(), 1),
    temporaryDisabledUntil: state.temporaryDisabledUntil || null,
  };
}

export function nextPacificMinuteMs(nowMs) {
  const { minuteKey } = pacificParts(nowMs);
  for (let delta = 15_000; delta <= 120_000; delta += 1000) {
    const next = pacificParts(nowMs + delta);
    if (next.minuteKey !== minuteKey) return nowMs + delta;
  }
  return nowMs + 60_000;
}

export function nextPacificDayMs(nowMs) {
  const { dayKey } = pacificParts(nowMs);
  const step = 60 * 60 * 1000;
  for (let delta = step; delta <= 36 * step; delta += 5 * 60 * 1000) {
    const next = pacificParts(nowMs + delta);
    if (next.dayKey !== dayKey) {
      let lo = nowMs;
      let hi = nowMs + delta;
      while (hi - lo > 1000) {
        const mid = Math.floor((lo + hi) / 2);
        if (pacificParts(mid).dayKey === dayKey) lo = mid;
        else hi = mid;
      }
      return hi;
    }
  }
  return nowMs + 24 * 60 * 60 * 1000;
}

export function disableUntilAfterQuotaError(state, nowMs, errorText = "") {
  const text = String(errorText || "").toLowerCase();
  const daily =
    text.includes("per day") ||
    text.includes("daily") ||
    text.includes("rpd") ||
    state.rpd >= state.limits.rpd * 0.5;
  return daily ? nextPacificDayMs(nowMs) : nextPacificMinuteMs(nowMs);
}

export function isQuotaHttpError(status, bodyText = "") {
  if (status === 429) return true;
  const t = String(bodyText || "").toLowerCase();
  return (
    t.includes("resource_exhausted") ||
    t.includes("resource exhausted") ||
    t.includes("quota") ||
    t.includes("rate limit")
  );
}

export function isTransientHttpError(status) {
  return status === 503 || status === 500 || status === 408;
}
