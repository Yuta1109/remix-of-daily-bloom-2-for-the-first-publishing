import { getFirestore } from "firebase-admin/firestore";

const COLLECTION = "ocrRequests";
const RUNNING_TTL_MS = 120_000;

export function isValidRequestId(id) {
  return typeof id === "string" && /^[A-Za-z0-9_-]{8,80}$/.test(id);
}

function db() {
  return getFirestore();
}

function refFor(requestId) {
  return db().collection(COLLECTION).doc(requestId);
}

export async function beginOcrRequest(requestId, uid) {
  if (!isValidRequestId(requestId) || !uid) return { kind: "fresh" };
  return db().runTransaction(async (tx) => {
    const ref = refFor(requestId);
    const snap = await tx.get(ref);
    const now = Date.now();
    if (!snap.exists) {
      tx.set(ref, { uid, status: "running", createdAt: now });
      return { kind: "fresh" };
    }
    const data = snap.data() || {};
    if (data.uid && data.uid !== uid) {
      return { kind: "foreign" };
    }
    if (data.status === "done" && data.result) {
      return { kind: "cached", result: data.result };
    }
    if (data.status === "running" && now - Number(data.createdAt || 0) < RUNNING_TTL_MS) {
      return { kind: "running" };
    }
    tx.set(ref, { uid, status: "running", createdAt: now });
    return { kind: "fresh" };
  });
}

export async function waitForOcrRequest(requestId, uid, maxMs = 100_000) {
  if (!isValidRequestId(requestId) || !uid) return null;
  const started = Date.now();
  while (Date.now() - started < maxMs) {
    const snap = await refFor(requestId).get();
    const data = snap.data();
    if (data?.uid === uid && data.status === "done" && data.result) {
      return data.result;
    }
    if (data?.uid === uid && data.status === "error" && data.result) {
      return data.result;
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return null;
}

export async function finishOcrRequest(requestId, uid, result, ok) {
  if (!isValidRequestId(requestId) || !uid) return;
  await refFor(requestId).set(
    {
      uid,
      status: ok ? "done" : "error",
      result,
      createdAt: Date.now(),
    },
    { merge: true },
  );
}

export function isValidImageBase64(value) {
  const s = String(value || "");
  if (s.length < 32 || s.length % 4 !== 0) return false;
  return /^[A-Za-z0-9+/]+={0,2}$/.test(s);
}
