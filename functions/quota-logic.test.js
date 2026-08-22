import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  disableUntilAfterQuotaError,
  getNextAvailableModel,
  isQuotaHttpError,
  normalizeQuotaState,
  pacificParts,
  softLimitReason,
  wouldExceedSoftLimit,
} from "./quota-logic.js";

describe("wouldExceedSoftLimit", () => {
  it("treats 9/10 + 1 as 90% and blocks", () => {
    assert.equal(wouldExceedSoftLimit(7, 1, 10, 0.9), false);
    assert.equal(wouldExceedSoftLimit(8, 1, 10, 0.9), true);
  });

  it("blocks 449/500 + 1 at 90%", () => {
    assert.equal(wouldExceedSoftLimit(448, 1, 500, 0.9), false);
    assert.equal(wouldExceedSoftLimit(449, 1, 500, 0.9), true);
  });
});

describe("getNextAvailableModel", () => {
  const now = Date.parse("2026-08-21T18:00:00-07:00");
  const limitsLite = { rpm: 15, tpm: 250000, rpd: 10 };
  const limitsNext = { rpm: 15, tpm: 250000, rpd: 500 };

  function state(modelId, patch) {
    return {
      modelId,
      minuteKey: "x",
      dayKey: "x",
      rpm: 0,
      tpm: 0,
      rpd: 0,
      temporaryDisabledUntil: 0,
      limits: limitsLite,
      ...patch,
    };
  }

  it("skips a model at 90% RPD and uses the next", () => {
    const models = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite"];
    const picked = getNextAvailableModel(
      {
        "gemini-3.5-flash-lite": state("gemini-3.5-flash-lite", {
          rpd: 9,
          limits: limitsLite,
        }),
        "gemini-3.1-flash-lite": state("gemini-3.1-flash-lite", {
          limits: limitsNext,
        }),
      },
      4000,
      now,
      models,
    );
    assert.equal(picked.modelId, "gemini-3.1-flash-lite");
  });

  it("skips temporarily disabled models", () => {
    const models = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite"];
    const picked = getNextAvailableModel(
      {
        "gemini-3.5-flash-lite": state("gemini-3.5-flash-lite", {
          temporaryDisabledUntil: now + 60_000,
          limits: limitsNext,
        }),
        "gemini-3.1-flash-lite": state("gemini-3.1-flash-lite", {
          limits: limitsNext,
        }),
      },
      4000,
      now,
      models,
    );
    assert.equal(picked.modelId, "gemini-3.1-flash-lite");
  });

  it("returns all-unavailable when every model is blocked", () => {
    const models = ["gemini-3.5-flash-lite"];
    const picked = getNextAvailableModel(
      {
        "gemini-3.5-flash-lite": state("gemini-3.5-flash-lite", {
          rpd: 10,
          limits: { rpm: 15, tpm: 250000, rpd: 10 },
        }),
      },
      4000,
      now,
      models,
    );
    assert.equal(picked.modelId, null);
    assert.equal(picked.reason, "all-unavailable");
  });

  it("blocks RPM or TPM independently", () => {
    const rpmBlocked = state("m", {
      rpm: 14,
      limits: { rpm: 15, tpm: 250000, rpd: 500 },
    });
    assert.equal(softLimitReason(rpmBlocked, 1), "rpm");
    const tpmBlocked = state("m", {
      tpm: 225000,
      limits: { rpm: 15, tpm: 250000, rpd: 500 },
    });
    assert.equal(softLimitReason(tpmBlocked, 4000), "tpm");
  });
});

describe("normalizeQuotaState", () => {
  it("resets RPM/TPM when the Pacific minute changes", () => {
    const now = Date.parse("2026-08-21T18:01:00-07:00");
    const { minuteKey, dayKey } = pacificParts(now);
    const prevMinute = pacificParts(now - 60_000).minuteKey;
    const state = normalizeQuotaState(
      {
        modelId: "gemini-2.5-flash-lite",
        minuteKey: prevMinute,
        dayKey,
        rpm: 12,
        tpm: 9000,
        rpd: 4,
      },
      now,
    );
    assert.equal(state.minuteKey, minuteKey);
    assert.equal(state.rpm, 0);
    assert.equal(state.tpm, 0);
    assert.equal(state.rpd, 4);
  });
});

describe("429 handling", () => {
  it("detects quota HTTP errors", () => {
    assert.equal(isQuotaHttpError(429, ""), true);
    assert.equal(isQuotaHttpError(400, "RESOURCE_EXHAUSTED"), true);
    assert.equal(isQuotaHttpError(400, "ok"), false);
  });

  it("disables until a future Pacific boundary", () => {
    const now = Date.parse("2026-08-21T18:00:10-07:00");
    const until = disableUntilAfterQuotaError(
      { rpd: 1, limits: { rpd: 500 } },
      now,
      "rate limit per minute",
    );
    assert.ok(until > now);
  });
});
