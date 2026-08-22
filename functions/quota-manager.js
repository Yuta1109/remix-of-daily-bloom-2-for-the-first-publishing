import { getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import {
  FREE_MODELS,
  GEMINI_MODEL_CONFIG,
  estimatedTokensForRequest,
} from "./gemini-config.js";
import {
  disableUntilAfterQuotaError,
  formatQuotaStatus,
  getNextAvailableModel,
  normalizeQuotaState,
} from "./quota-logic.js";

const COLLECTION = "geminiQuota";

function db() {
  return getFirestore();
}

function docRef(modelId) {
  return db().collection(COLLECTION).doc(modelId.replace(/\//g, "_"));
}

function serialize(state) {
  return {
    modelId: state.modelId,
    minuteKey: state.minuteKey,
    dayKey: state.dayKey,
    rpm: state.rpm,
    tpm: state.tpm,
    rpd: state.rpd,
    temporaryDisabledUntil: state.temporaryDisabledUntil || 0,
    updatedAt: Date.now(),
  };
}

async function readAllStates(nowMs) {
  const snaps = await Promise.all(FREE_MODELS.map((id) => docRef(id).get()));
  const states = {};
  FREE_MODELS.forEach((id, i) => {
    const data = snaps[i].exists ? snaps[i].data() : { modelId: id };
    states[id] = normalizeQuotaState({ ...data, modelId: id }, nowMs, GEMINI_MODEL_CONFIG);
  });
  return states;
}

export async function reserveNextModel(estimatedTokens = estimatedTokensForRequest(), exclude = []) {
  const nowMs = Date.now();
  const skip = new Set(exclude);
  return db().runTransaction(async (tx) => {
    const refs = FREE_MODELS.map((id) => docRef(id));
    const snaps = await Promise.all(refs.map((ref) => tx.get(ref)));
    const states = {};
    FREE_MODELS.forEach((id, i) => {
      const data = snaps[i].exists ? snaps[i].data() : { modelId: id };
      const state = normalizeQuotaState({ ...data, modelId: id }, nowMs, GEMINI_MODEL_CONFIG);
      if (skip.has(id)) {
        state.temporaryDisabledUntil = nowMs + 1;
      }
      states[id] = state;
    });
    const picked = getNextAvailableModel(states, estimatedTokens, nowMs);
    if (!picked.modelId) {
      logger.info("quota all-unavailable", { reason: picked.reason });
      return { ok: false, reason: "all-unavailable" };
    }
    const state = states[picked.modelId];
    const next = {
      ...state,
      rpm: state.rpm + 1,
      rpd: state.rpd + 1,
      tpm: state.tpm + estimatedTokens,
    };
    tx.set(refs[FREE_MODELS.indexOf(picked.modelId)], serialize(next));
    logger.info("quota reserved", {
      model: picked.modelId,
      rpm: `${next.rpm}/${next.limits.rpm}`,
      tpm: `${next.tpm}/${next.limits.tpm}`,
      rpd: `${next.rpd}/${next.limits.rpd}`,
      estimatedTokens,
    });
    return {
      ok: true,
      modelId: picked.modelId,
      estimatedTokens,
      before: state,
    };
  });
}

export async function settleReservation(modelId, estimatedTokens, actualTokens) {
  const nowMs = Date.now();
  const delta = Math.max(0, Number(actualTokens) || 0) - Number(estimatedTokens || 0);
  await db().runTransaction(async (tx) => {
    const ref = docRef(modelId);
    const snap = await tx.get(ref);
    const state = normalizeQuotaState(
      { ...(snap.data() || {}), modelId },
      nowMs,
      GEMINI_MODEL_CONFIG,
    );
    const next = {
      ...state,
      tpm: Math.max(0, state.tpm + delta),
    };
    tx.set(ref, serialize(next));
  });
  logger.info("quota settled", {
    model: modelId,
    estimatedTokens,
    actualTokens: Number(actualTokens) || 0,
  });
}

export async function markModelQuotaExhausted(modelId, errorText = "") {
  const nowMs = Date.now();
  await db().runTransaction(async (tx) => {
    const ref = docRef(modelId);
    const snap = await tx.get(ref);
    const state = normalizeQuotaState(
      { ...(snap.data() || {}), modelId },
      nowMs,
      GEMINI_MODEL_CONFIG,
    );
    const until = disableUntilAfterQuotaError(state, nowMs, errorText);
    tx.set(ref, serialize({ ...state, temporaryDisabledUntil: until }));
  });
  logger.info("quota model disabled", { model: modelId });
}

export async function getQuotaStatus() {
  const nowMs = Date.now();
  const states = await readAllStates(nowMs);
  return FREE_MODELS.map((id) => formatQuotaStatus(states[id]));
}
