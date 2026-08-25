import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  disableUntilAfterQuotaError,
  getNextAvailableModel,
  isQuotaHttpError,
  normalizeQuotaState,
  pacificParts,
  softLimitReason,
  tpmAfterSettle,
  wouldExceedSoftLimit,
} from "./quota-logic.js";
import { FREE_MODELS } from "./gemini-config.js";
import { isValidImageBase64, isValidRequestId } from "./ocr-idempotency.js";

describe("wouldExceedSoftLimit", () => {
  it("treats current + add against 90%, not current/limit alone", () => {
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

  it("returns unavailable when every model is blocked", () => {
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

  it("does not retry the same model after 429 disable", () => {
    const now = Date.parse("2026-08-21T18:00:00-07:00");
    const models = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite"];
    const limits = { rpm: 15, tpm: 250000, rpd: 500 };
    const states = {
      "gemini-3.5-flash-lite": {
        modelId: "gemini-3.5-flash-lite",
        rpm: 0,
        tpm: 0,
        rpd: 0,
        temporaryDisabledUntil: 0,
        limits,
      },
      "gemini-3.1-flash-lite": {
        modelId: "gemini-3.1-flash-lite",
        rpm: 0,
        tpm: 0,
        rpd: 0,
        temporaryDisabledUntil: 0,
        limits,
      },
    };
    const first = getNextAvailableModel(states, 4000, now, models);
    assert.equal(first.modelId, "gemini-3.5-flash-lite");
    states[first.modelId].temporaryDisabledUntil = now + 60_000;
    const second = getNextAvailableModel(states, 4000, now, models);
    assert.equal(second.modelId, "gemini-3.1-flash-lite");
  });
});

describe("tpmAfterSettle", () => {
  it("applies actual minus reserved, including when actual is larger", () => {
    assert.equal(tpmAfterSettle(4512, 4512, 8000), 8000);
    assert.equal(tpmAfterSettle(4512, 4512, 2000), 2000);
  });

  it("keeps the reservation when usage metadata is missing", () => {
    assert.equal(tpmAfterSettle(4512, 4512, 0), 4512);
    assert.equal(tpmAfterSettle(4512, 4512, Number.NaN), 4512);
  });
});

describe("FREE_MODELS order", () => {
  it("keeps 3.5 Flash Lite before 3.1 Flash Lite and stays free-only", () => {
    assert.deepEqual(FREE_MODELS, [
      "gemini-3.5-flash-lite",
      "gemini-3.1-flash-lite",
      "gemini-3.6-flash",
      "gemini-3.5-flash",
      "gemini-3-flash-preview",
      "gemini-2.5-flash",
      "gemini-2.5-flash-lite",
    ]);
  });
});

describe("soft 8/10 then next model", () => {
  it("sequential reserves skip the 90% model (transaction-shaped)", () => {
    const now = Date.parse("2026-08-21T18:00:00-07:00");
    const models = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite"];
    const states = {
      "gemini-3.5-flash-lite": {
        modelId: "gemini-3.5-flash-lite",
        rpm: 0,
        tpm: 0,
        rpd: 8,
        temporaryDisabledUntil: 0,
        limits: { rpm: 15, tpm: 250000, rpd: 10 },
      },
      "gemini-3.1-flash-lite": {
        modelId: "gemini-3.1-flash-lite",
        rpm: 0,
        tpm: 0,
        rpd: 0,
        temporaryDisabledUntil: 0,
        limits: { rpm: 15, tpm: 250000, rpd: 10 },
      },
    };
    function reserve() {
      const picked = getNextAvailableModel(states, 4000, now, models);
      if (!picked.modelId) return picked;
      const s = states[picked.modelId];
      states[picked.modelId] = {
        ...s,
        rpm: s.rpm + 1,
        rpd: s.rpd + 1,
        tpm: s.tpm + 4000,
      };
      return picked;
    }
    assert.equal(reserve().modelId, "gemini-3.1-flash-lite");
    assert.equal(states["gemini-3.5-flash-lite"].rpd, 8);
  });
});

describe("requestId / image validation", () => {
  it("accepts UUID request ids", () => {
    assert.equal(isValidRequestId("6ba7b810-9dad-11d1-80b4-00c04fd430c8"), true);
    assert.equal(isValidRequestId("short"), false);
  });

  it("rejects invalid base64", () => {
    assert.equal(isValidImageBase64("not base64!!!"), false);
    assert.equal(isValidImageBase64("abcd"), false);
    assert.equal(isValidImageBase64("AAAA"), false);
    assert.equal(
      isValidImageBase64(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      ),
      true,
    );
  });

  it("same requestId while running is not a second fresh start", () => {
    const docs = new Map();
    function begin(id, uid) {
      const row = docs.get(id);
      if (!row) {
        docs.set(id, { uid, status: "running" });
        return "fresh";
      }
      if (row.uid !== uid) return "foreign";
      if (row.status === "done") return "cached";
      if (row.status === "running") return "running";
      return "fresh";
    }
    assert.equal(begin("6ba7b810-9dad-11d1-80b4-00c04fd430c8", "u1"), "fresh");
    assert.equal(begin("6ba7b810-9dad-11d1-80b4-00c04fd430c8", "u1"), "running");
  });
});
