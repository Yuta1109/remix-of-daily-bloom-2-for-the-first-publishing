/**
 * Essences Live Activity dispatcher (Firebase project: todolist-app-project-4fd37).
 *
 * Schedules use showAtEpochMs = max(start − lead, now).
 * Future windows are enqueued as Cloud Tasks that fire at showAt (exact).
 * Already-due writes push immediately via onLaScheduleWrite.
 *
 * Payload shape:
 *   https://firebase.google.com/docs/cloud-messaging/customize-messages/live-activity
 *
 * Deploy:
 *   cd functions && npm i && firebase deploy --only functions,firestore
 */

import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { getAuth } from "firebase-admin/auth";
import { getFunctions } from "firebase-admin/functions";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { onTaskDispatched } from "firebase-functions/v2/tasks";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onRequest } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2/options";
import { logger } from "firebase-functions";
import { GoogleAuth } from "google-auth-library";

initializeApp();

const REGION = "asia-northeast1";
setGlobalOptions({ region: REGION });

const db = getFirestore();
const messaging = getMessaging();
const adminAuth = getAuth();

/** Must match the Swift `ActivityAttributes` type name exactly. */
const ATTRIBUTES_TYPE = "EssencesWidgetAttributes";
const BUNDLE_ID = "com.confast.essences";
/** Exported task-queue function name — must match `taskQueue(...)` below. */
const TASK_FN = "dispatchLiveActivityTask";
const REFRESH_FN = "refreshLiveActivityTask";
/** Remote Lock Screen redraw every 30s (custom relative labels need Activity.update). */
const REFRESH_INTERVAL_MS = 60 * 1000;
/** Fire a single audible/haptic Live Activity alert this far before start. */
const ONE_MINUTE_MS = 60 * 1000;
/** Keep "予定時間になりました" at least this long after start / arrived update. */
const ARRIVED_LINGER_MS = 60 * 60 * 1000;

let googleAuth;

/** Resolve the Cloud Run URI for a 2nd-gen function (needed when enqueuing). */
async function getFunctionUrl(name, location = REGION) {
  if (!googleAuth) {
    googleAuth = new GoogleAuth({
      scopes: "https://www.googleapis.com/auth/cloud-platform",
    });
  }
  const projectId = await googleAuth.getProjectId();
  const url =
    "https://cloudfunctions.googleapis.com/v2beta/" +
    `projects/${projectId}/locations/${location}/functions/${name}`;
  const client = await googleAuth.getClient();
  const res = await client.request({ url });
  const uri = res.data?.serviceConfig?.uri;
  if (!uri) {
    throw new Error(`Unable to retrieve uri for function at ${url}`);
  }
  return uri;
}

function taskQueue() {
  return getFunctions().taskQueue(`locations/${REGION}/functions/${TASK_FN}`);
}

function refreshTaskQueue() {
  return getFunctions().taskQueue(`locations/${REGION}/functions/${REFRESH_FN}`);
}

function buildContentState(data, tick = 0, phase = "countdown") {
  return {
    items: [
      {
        title: String(data.title || ""),
        startEpochMs: Number(data.startEpochMs),
        color: String(data.color || "blue"),
      },
    ],
    overflow: 0,
    locale: String(data.locale || "ja"),
    tick: Number(tick) || 0,
    phase: String(phase || "countdown"),
  };
}

const MAX_LA_ITEMS = 3;

/**
 * Pick up to maxItems rows for the shared Live Activity card.
 * ≤3: keep all (including arrived). >3: countdown slots first, then newest arrived.
 */
function selectLiveActivityRows(rows, nowMs, maxItems = MAX_LA_ITEMS) {
  const countdown = rows
    .filter((r) => r.startEpochMs > nowMs)
    .sort((a, b) => a.startEpochMs - b.startEpochMs);
  const arrived = rows
    .filter((r) => r.startEpochMs <= nowMs)
    .sort((a, b) => a.startEpochMs - b.startEpochMs);

  if (rows.length <= maxItems) {
    return {
      items: [...rows].sort((a, b) => a.startEpochMs - b.startEpochMs),
      overflow: 0,
      droppedArrived: [],
    };
  }

  const keptCountdown = countdown.slice(0, maxItems);
  const slotsLeft = maxItems - keptCountdown.length;
  const keptArrived =
    slotsLeft > 0 ? arrived.slice(Math.max(0, arrived.length - slotsLeft)) : [];
  const droppedArrived = arrived.filter(
    (a) =>
      !keptArrived.some(
        (k) => k.startEpochMs === a.startEpochMs && k.title === a.title,
      ),
  );

  const items = [...keptCountdown, ...keptArrived].sort(
    (a, b) => a.startEpochMs - b.startEpochMs,
  );
  return {
    items,
    overflow: Math.max(0, rows.length - items.length),
    droppedArrived,
  };
}

/**
 * Lock Screen shows one shared activity with up to 3 concurrent events.
 * Aggregate all visible schedules for the device (not just the one firing).
 */
async function buildAggregatedContentState(
  deviceId,
  { tick = Date.now(), phase = "countdown", includeScheduleId = null, includeData = null } = {},
) {
  const now = Date.now();
  const snap = await db.collection("laSchedules").where("deviceId", "==", deviceId).get();
  const byId = new Map();
  for (const docSnap of snap.docs) {
    byId.set(docSnap.id, docSnap.data());
  }
  if (includeScheduleId && includeData) {
    byId.set(includeScheduleId, { ...byId.get(includeScheduleId), ...includeData });
  }

  const rows = [];
  let locale = "ja";
  for (const [id, d] of byId) {
    if (!d) continue;
    if (d.status === "error" || d.status === "expired") continue;
    const showAt = Number(d.showAtEpochMs);
    const endAt = Number(d.endAtEpochMs);
    const startAt = Number(d.startEpochMs);
    if (!(endAt > now)) continue;

    const isFocus = id === includeScheduleId;
    const windowOpen = showAt <= now || isFocus;
    if (!windowOpen) continue;
    if (d.status === "pending" && showAt > now && !isFocus) continue;

    locale = String(d.locale || locale);
    rows.push({
      title: String(d.title || ""),
      startEpochMs: startAt,
      endAtEpochMs: endAt,
      color: String(d.color || "blue"),
    });
  }

  const { items, overflow, droppedArrived } = selectLiveActivityRows(
    rows,
    now,
    MAX_LA_ITEMS,
  );
  // Evicted "It's time" rows must not linger until the 1h endAt — expire them
  // so the next kill-path update cannot bring them back.
  for (const dropped of droppedArrived) {
    for (const [id, d] of byId) {
      if (!d) continue;
      if (Number(d.startEpochMs) !== Number(dropped.startEpochMs)) continue;
      if (String(d.title || "") !== String(dropped.title || "")) continue;
      if (d.status !== "arrived" && d.status !== "started") continue;
      if (Number(d.startEpochMs) > now) continue;
      try {
        await db.collection("laSchedules").doc(id).update({
          status: "expired",
          expiredReason: "overflow-evict-arrived",
          updatedAt: Date.now(),
        });
      } catch (err) {
        logger.warn("Failed to expire overflow-evicted arrived", id, err);
      }
    }
  }
  const maxEndAt = items.reduce(
    (m, r) => Math.max(m, Number(r.endAtEpochMs) || 0),
    0,
  );
  const anyCounting = items.some((r) => r.startEpochMs > now);
  const resolvedPhase =
    phase === "notify1m" ? "countdown" : anyCounting ? "countdown" : "arrived";

  return {
    contentState: {
      items: items.map(({ title, startEpochMs, color }) => ({
        title,
        startEpochMs,
        color,
      })),
      overflow,
      locale: String(includeData?.locale || locale || "ja"),
      tick: Number(tick) || 0,
      phase: resolvedPhase,
    },
    staleSec: Math.floor((maxEndAt || Number(includeData?.endAtEpochMs) || now + 30 * 60_000) / 1000),
  };
}

async function enqueueRefresh(scheduleId, atMs) {
  if (atMs <= Date.now()) atMs = Date.now() + 15_000;
  const uri = await getFunctionUrl(REFRESH_FN);
  await refreshTaskQueue().enqueue(
    { scheduleId },
    {
      scheduleTime: new Date(atMs),
      dispatchDeadlineSeconds: 60 * 5,
      uri,
    },
  );
}

/**
 * Cloud Tasks IDs must be [A-Za-z0-9_-]+. Reverse the schedule id so sequential
 * Firestore ids do not hotspot the queue; append showAt for uniqueness when
 * the lead window changes (deleted ids cannot be reused for ~1h).
 */
function makeTaskId(scheduleId, showAtEpochMs) {
  const reversed = String(scheduleId).split("").reverse().join("");
  const safe = reversed.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 400);
  return `${safe}-${Number(showAtEpochMs)}`;
}

async function deleteTaskBestEffort(taskId) {
  if (!taskId) return;
  try {
    await taskQueue().delete(taskId);
  } catch (err) {
    // Already ran / missing — fine.
    logger.info("deleteTask ignored", { taskId, message: String(err?.message || err) });
  }
}

async function enqueueAtShowAt(scheduleId, data) {
  const showAt = Number(data.showAtEpochMs);
  const taskId = makeTaskId(scheduleId, showAt);
  if (data.cloudTaskId && data.cloudTaskId !== taskId) {
    await deleteTaskBestEffort(data.cloudTaskId);
  }

  const uri = await getFunctionUrl(TASK_FN);
  try {
    await taskQueue().enqueue(
      { scheduleId },
      {
        id: taskId,
        scheduleTime: new Date(showAt),
        dispatchDeadlineSeconds: 60 * 5,
        uri,
      },
    );
  } catch (err) {
    // Same id still reserved (~1h after delete/execute) — try without fixed id.
    const code = err?.code || err?.errorInfo?.code;
    if (String(code).includes("already-exists") || /already.exists/i.test(String(err?.message))) {
      logger.warn("task id collision; enqueue without id", { scheduleId, taskId });
      await taskQueue().enqueue(
        { scheduleId },
        {
          scheduleTime: new Date(showAt),
          dispatchDeadlineSeconds: 60 * 5,
          uri,
        },
      );
      await db.collection("laSchedules").doc(scheduleId).update({
        cloudTaskId: FieldValue.delete(),
        taskEnqueuedForShowAt: showAt,
        updatedAt: Date.now(),
      });
      return;
    }
    throw err;
  }

  await db.collection("laSchedules").doc(scheduleId).update({
    cloudTaskId: taskId,
    taskEnqueuedForShowAt: showAt,
    updatedAt: Date.now(),
  });
}

/** App process heartbeat grace — must exceed client pulse interval (~20s).
 * Keep short so force-quit after a last pulse can reach kill-path PTS/update
 * without a long blank window. */
const APP_ALIVE_MS = 45_000;
/** Exclusive PTS claim window (any schedule). */
const PTS_CLAIM_MS = 120_000;
/**
 * How long after a local ActivityKit start we refuse kill-path PTS (token upload
 * race). After this, stale `localLaActive` / card flags must not block PTS —
 * that left Test 1 blank until the app was opened.
 */
const LOCAL_PENDING_GRACE_MS = 90_000;
/**
 * After remote PTS, protect against demote/second-PTS while the Lock Screen card
 * exists but the update token has not been uploaded yet. Past this, sweep may
 * recover a blank/frozen generation.
 */
const PTS_TOKEN_GRACE_MS = 180_000;

/**
 * Update token for the *current* Lock Screen card.
 * - After remote PTS: only tokens uploaded at/after that PTS.
 * - After local ActivityKit start: token must belong to an open card window
 *   (laCardActiveUntil). Bare recent tokens are NOT enough — FCM accepts
 *   updates to dead Activities, which used to mark schedules "started" and
 *   block push-to-start (blank Lock Screen after force-quit).
 */
function usableLiveActivityUpdateToken(device, now = Date.now()) {
  const token = device?.liveActivityUpdateToken;
  if (!token) return null;
  const tokenAt = Number(device.liveActivityUpdateTokenAt || 0);
  if (!tokenAt) return null;

  if (device.lastRemoteLaStartOk === true) {
    const ptsAt = Number(device.lastRemoteLaStartAt || 0);
    // After PTS, only accept tokens uploaded at/after that start (new Activity).
    if (ptsAt > 0 && tokenAt < ptsAt) return null;
    return token;
  }

  // Local ActivityKit generation: any update token while the card window is
  // open. Do NOT require tokenAt ≈ lastLocalCalendarLaAt — token often arrives
  // before/after markLocalCalendarLiveActivity and the old ±15s window dropped
  // usable tokens, so FCM minute refreshes never ran while backgrounded.
  const cardUntil = Number(device.laCardActiveUntil || 0);
  const localAt = Number(device.lastLocalCalendarLaAt || 0);
  if (cardUntil > now && (localAt > 0 || device.localLaActive === true)) {
    return token;
  }
  return null;
}

/**
 * True when Lock Screen likely has a card that can receive FCM update.
 * Requires the PTS/local schedule that owns the card to still exist — after the
 * user deletes an event, lastRemoteLaStartOk alone must NOT keep "generation-update"
 * alive (that blanked tests 2/4).
 */
async function deviceHasLiveCard(device, deviceId, now = Date.now()) {
  if (Number(device.laCardActiveUntil || 0) <= now) return false;
  if (!usableLiveActivityUpdateToken(device, now)) return false;

  if (device.lastRemoteLaStartOk === true) {
    const ptsId = device.lastRemoteLaStartScheduleId;
    if (!ptsId) return false;
    try {
      const snap = await db.collection("laSchedules").doc(String(ptsId)).get();
      if (!snap.exists) return false;
      const d = snap.data() || {};
      const st = d.status;
      if (st !== "started" && st !== "arrived") return false;
      if (Number(d.endAtEpochMs) > 0 && Number(d.endAtEpochMs) <= now) return false;
      return true;
    } catch {
      return false;
    }
  }

  // Local ActivityKit generation: only if some schedule is still on-card.
  const localAt = Number(device.lastLocalCalendarLaAt || 0);
  if (localAt <= 0) return false;
  try {
    const snap = await db.collection("laSchedules").where("deviceId", "==", deviceId).get();
    return snap.docs.some((docSnap) => {
      const d = docSnap.data() || {};
      const st = d.status;
      if (st !== "started" && st !== "arrived") return false;
      if (Number(d.endAtEpochMs) > 0 && Number(d.endAtEpochMs) <= now) return false;
      return true;
    });
  } catch {
    return false;
  }
}

/** Clear PTS/local generation when the Lock Screen card is gone. */
async function clearDeviceLiveActivityGeneration(deviceId) {
  try {
    await db.collection("devices").doc(deviceId).set(
      {
        lastRemoteLaStartOk: false,
        lastRemoteLaStartScheduleId: FieldValue.delete(),
        laCardActiveUntil: 0,
        localLaActive: false,
        lastLocalCalendarLaAt: FieldValue.delete(),
        liveActivityUpdateToken: FieldValue.delete(),
        liveActivityUpdateTokenAt: FieldValue.delete(),
        laLastPushStartAt: 0,
        laGenerationPresentedAt: FieldValue.delete(),
        laGenerationPresentedBy: FieldValue.delete(),
        laAwaitingUpdateToken: false,
      },
      { merge: true },
    );
  } catch (err) {
    logger.warn("clearDeviceLiveActivityGeneration failed", deviceId, err);
  }
}

/**
 * Exactly one push-to-start claim per device per window.
 * Unlike the old claim, the same scheduleId cannot re-claim (that double-PTSd).
 */
async function claimDevicePushStart(deviceId, scheduleId) {
  const ref = db.collection("devices").doc(deviceId);
  try {
    return await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const data = snap.data() || {};
      const lastAt = Number(data.laLastPushStartAt || 0);
      if (Date.now() - lastAt < PTS_CLAIM_MS) {
        return false;
      }
      tx.set(
        ref,
        {
          laLastPushStartAt: Date.now(),
          laLastPushStartBy: scheduleId,
        },
        { merge: true },
      );
      return true;
    });
  } catch (err) {
    logger.warn("claimDevicePushStart failed", deviceId, err);
    return false;
  }
}

async function markDueSchedulesStartedForItems(deviceId, primaryScheduleId, primaryData, items) {
  await markStartedAndEnqueueRefresh(primaryScheduleId, primaryData);
  const keys = new Set(
    (items || []).map((it) => `${String(it.title || "")}\0${Number(it.startEpochMs || 0)}`),
  );
  if (keys.size === 0) return;
  const snap = await db.collection("laSchedules").where("deviceId", "==", deviceId).get();
  const now = Date.now();
  for (const docSnap of snap.docs) {
    if (docSnap.id === primaryScheduleId) continue;
    const d = docSnap.data() || {};
    if (d.status !== "due" && d.status !== "pending") continue;
    if (Number(d.showAtEpochMs) > now) continue;
    if (Number(d.endAtEpochMs) > 0 && Number(d.endAtEpochMs) <= now) continue;
    const key = `${String(d.title || "")}\0${Number(d.startEpochMs || 0)}`;
    if (!keys.has(key)) continue;
    try {
      await markStartedAndEnqueueRefresh(docSnap.id, d);
    } catch (err) {
      logger.warn("Failed to mark sibling started", docSnap.id, err);
    }
  }
}

/**
 * Local ActivityKit owns / is creating the Lock Screen card — never PTS on top.
 * Must be time-bounded: `localLaActive` survives force-quit in Firestore and
 * used to block kill-path PTS forever (blank Lock Screen until app open).
 */
function hasLocalCardPending(device, now = Date.now()) {
  if (device.lastRemoteLaStartOk === true) return false;
  const localAt = Number(device.lastLocalCalendarLaAt || 0);
  const cardUntil = Number(device.laCardActiveUntil || 0);
  const aliveAt = Number(device.appAliveAt || 0);
  const appAlive = aliveAt > 0 && now - aliveAt < APP_ALIVE_MS;

  // Fresh local start — update token may still be uploading.
  if (localAt > 0 && now - localAt < LOCAL_PENDING_GRACE_MS && cardUntil > now) {
    return true;
  }
  // App process still alive and claims local ownership.
  if (appAlive && device.localLaActive === true) return true;
  return false;
}

/** Drop stale local ownership so kill-path can PTS after force-quit. */
async function clearStaleLocalOwnershipIfNeeded(deviceId, device, now = Date.now()) {
  if (device.lastRemoteLaStartOk === true) return device;
  if (hasLocalCardPending(device, now)) return device;
  const aliveAt = Number(device.appAliveAt || 0);
  const appAlive = aliveAt > 0 && now - aliveAt < APP_ALIVE_MS;
  if (appAlive) return device;

  const hasStaleFlags =
    device.localLaActive === true ||
    Number(device.lastLocalCalendarLaAt || 0) > 0 ||
    Number(device.laCardActiveUntil || 0) > now;
  if (!hasStaleFlags) return device;

  try {
    if (await deviceHasLiveCard(device, deviceId, now)) return device;
  } catch {
    /* ignore */
  }

  logger.info("Clearing stale local LA ownership for kill-path PTS", deviceId, {
    localLaActive: device.localLaActive === true,
    localAt: Number(device.lastLocalCalendarLaAt || 0),
    cardUntil: Number(device.laCardActiveUntil || 0),
  });
  try {
    await db.collection("devices").doc(deviceId).set(
      {
        localLaActive: false,
        lastLocalCalendarLaAt: FieldValue.delete(),
        laCardActiveUntil: 0,
      },
      { merge: true },
    );
    const snap = await db.collection("devices").doc(deviceId).get();
    return snap.exists ? snap.data() || device : device;
  } catch (err) {
    logger.warn("clearStaleLocalOwnershipIfNeeded failed", deviceId, err);
    return device;
  }
}

/** Atomically claim the one-minute alert so task+sweep cannot double-buzz. */
async function claimOneMinuteAlert(scheduleId, now = Date.now()) {
  const ref = db.collection("laSchedules").doc(scheduleId);
  try {
    return await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return false;
      const data = snap.data() || {};
      if (data.oneMinuteAlertSentAt) return false;
      if (!wantsOneMinuteAlert(data, now)) return false;
      tx.update(ref, { oneMinuteAlertSentAt: now });
      return true;
    });
  } catch (err) {
    logger.warn("claimOneMinuteAlert failed", scheduleId, err);
    return false;
  }
}

/**
 * One presentation (banner + haptic) per schedule. Used for PTS / kill-path
 * presentAlert / client requestPresentationAlert — never stack.
 */
async function claimPresentationAlert(scheduleId, now = Date.now()) {
  const ref = db.collection("laSchedules").doc(scheduleId);
  try {
    return await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return false;
      const data = snap.data() || {};
      if (data.laPresentedAlertAt) return false;
      tx.update(ref, {
        laPresentedAlertAt: now,
        requestPresentationAlert: FieldValue.delete(),
      });
      return true;
    });
  } catch (err) {
    logger.warn("claimPresentationAlert failed", scheduleId, err);
    return false;
  }
}

/**
 * One presentation per device card generation (shared multi-row Activity).
 * Prevents Test1 open + Test2 PTS from each firing a full alert stack.
 */
async function claimDeviceGenerationPresentation(deviceId, scheduleId, now = Date.now()) {
  const ref = db.collection("devices").doc(deviceId);
  try {
    return await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const d = snap.exists ? snap.data() || {} : {};
      const presentedAt = Number(d.laGenerationPresentedAt || 0);
      const genAt = Math.max(
        Number(d.lastRemoteLaStartAt || 0),
        Number(d.lastLocalCalendarLaAt || 0),
      );
      if (presentedAt > 0 && (genAt <= 0 || presentedAt >= genAt - 2_000)) {
        return false;
      }
      tx.set(
        ref,
        {
          laGenerationPresentedAt: now,
          laGenerationPresentedBy: scheduleId,
        },
        { merge: true },
      );
      return true;
    });
  } catch (err) {
    logger.warn("claimDeviceGenerationPresentation failed", deviceId, err);
    return false;
  }
}

/** True when we may include an ActivityKit `alert` on start/update. */
async function tryClaimStartPresentation(deviceId, scheduleId, now = Date.now()) {
  const deviceOk = await claimDeviceGenerationPresentation(deviceId, scheduleId, now);
  if (!deviceOk) return false;
  const scheduleOk = await claimPresentationAlert(scheduleId, now);
  return scheduleOk;
}

/**
 * Ensure a schedule is on the Lock Screen.
 *
 * Ownership model (single lease):
 *  A) App alive + usable live card → silent update; promote started.
 *  B) App alive + fresh local pending (grace) → wait only — do NOT mark started
 *     without a card (that blocked kill-path PTS / left Lock Screen blank).
 *  C) Kill-path + live card → update (+ at most one presentation alert).
 *  D) Recent PTS awaiting update token → wait for onDeviceTokenWrite; no 2nd PTS.
 *  E) Otherwise exactly one push-to-start (optional single alert).
 */
async function sendStartForSchedule(scheduleId, data, opts = {}) {
  const deviceSnap = await db.collection("devices").doc(data.deviceId).get();
  if (!deviceSnap.exists) {
    logger.warn("No device doc", data.deviceId);
    return false;
  }
  const device = deviceSnap.data() || {};
  const fcmToken = device.fcmToken;
  const liveToken = device.pushToStartToken;
  const now = Date.now();
  if (!fcmToken) {
    logger.warn("Missing FCM token for device", data.deviceId);
    return false;
  }

  // Stale localLaActive after force-quit used to make hasLocalCardPending forever
  // true → wait-token / no PTS (Test 1 never appeared until app open).
  let deviceFresh = await clearStaleLocalOwnershipIfNeeded(data.deviceId, device, now);

  const aggregated = await buildAggregatedContentState(data.deviceId, {
    tick: now,
    phase: "countdown",
    includeScheduleId: scheduleId,
    includeData: { ...data, status: "due" },
  });
  if (!aggregated.contentState.items.length) {
    logger.warn("No items to start for schedule", scheduleId);
    return false;
  }

  const cardUntilMs = Number(aggregated.staleSec || 0) * 1000;
  const appAlive =
    Number(deviceFresh.appAliveAt || 0) > 0 &&
    now - Number(deviceFresh.appAliveAt || 0) < APP_ALIVE_MS;
  let liveCard = await deviceHasLiveCard(deviceFresh, data.deviceId, now);
  let generationLive = liveCard && deviceFresh.lastRemoteLaStartOk === true;
  let alreadyPtsThis =
    deviceFresh.lastRemoteLaStartOk === true &&
    deviceFresh.lastRemoteLaStartScheduleId === scheduleId &&
    now - Number(deviceFresh.lastRemoteLaStartAt || 0) < PTS_TOKEN_GRACE_MS;

  const recordEnsure = async (path, reason) => {
    try {
      await db.collection("devices").doc(data.deviceId).set(
        {
          lastLaEnsureAt: Date.now(),
          lastLaEnsurePath: path,
          lastLaEnsureReason: reason,
          lastLaEnsureScheduleId: scheduleId,
        },
        { merge: true },
      );
    } catch {
      /* ignore */
    }
  };

  // ── A. App process alive → prefer local ActivityKit ────────────────
  // Never PTS while a fresh local card is pending. Never mark `started`
  // without live-card evidence (blank Lock Screen + stuck refresh chain).
  if (appAlive) {
    if (liveCard) {
      logger.info("LA app-alive content refresh", scheduleId);
      const ok = await sendUpdateForSchedule(scheduleId, data, "countdown", {
        withAlert: false,
        contentState: aggregated.contentState,
        staleSec: aggregated.staleSec,
      });
      if (
        ok &&
        (data.status === "due" ||
          data.status === "pending" ||
          data.status === "error")
      ) {
        await markDueSchedulesStartedForItems(
          data.deviceId,
          scheduleId,
          data,
          aggregated.contentState.items,
        );
      } else if (ok && data.status === "started") {
        try {
          await enqueueOneMinuteAndArrived(scheduleId, data);
          await enqueueRefresh(scheduleId, now + REFRESH_INTERVAL_MS);
        } catch (err) {
          logger.warn("Failed to ensure LA refresh while app-alive", err);
        }
      }
      await recordEnsure("local-owned", ok ? "app-alive" : "app-alive-update-miss");
      return ok;
    }
    if (hasLocalCardPending(deviceFresh, now)) {
      // Leave status as due/pending so sweep can PTS after grace if local fails.
      await recordEnsure("wait-token", "app-alive-local-pending-token");
      return false;
    }
    logger.info(
      "LA app-alive but no local card evidence — falling through to PTS/update",
      scheduleId,
    );
    await recordEnsure("local-owned-miss", "app-alive-no-card");
  }

  // ── B. Kill-path with a *live* card → update only (no second PTS) ──
  if (liveCard) {
    const wantPresent =
      !appAlive &&
      !data.laPresentedAlertAt &&
      !wantsOneMinuteAlert(data, now);
    const presentAlert =
      wantPresent &&
      (await tryClaimStartPresentation(data.deviceId, scheduleId, now));
    logger.info("LA kill-path update (live card)", scheduleId, { presentAlert });
    const ok = await sendUpdateForSchedule(scheduleId, data, "countdown", {
      withAlert: presentAlert,
      urgent: presentAlert,
      alertTitle: String(data.title || (data.locale === "en" ? "Upcoming" : "予定")),
      alertBody:
        data.locale === "en"
          ? "Countdown on Lock Screen"
          : "ロック画面でカウントダウン中",
      contentState: aggregated.contentState,
      staleSec: aggregated.staleSec,
    });
    if (ok) {
      await markDueSchedulesStartedForItems(
        data.deviceId,
        scheduleId,
        data,
        aggregated.contentState.items,
      );
      try {
        await db.collection("devices").doc(data.deviceId).set(
          {
            laCardActiveUntil: Math.max(
              Number(deviceFresh.laCardActiveUntil || 0),
              cardUntilMs,
            ),
            lastLaEnsureAt: Date.now(),
            lastLaEnsurePath: "update",
            lastLaEnsureReason: generationLive ? "generation-update" : "local-survive-update",
            lastLaEnsureScheduleId: scheduleId,
          },
          { merge: true },
        );
      } catch {
        /* ignore */
      }
      return true;
    }
    logger.warn("LA update token rejected — clearing for PTS recovery", scheduleId);
    try {
      await db.collection("devices").doc(data.deviceId).set(
        {
          liveActivityUpdateToken: FieldValue.delete(),
          liveActivityUpdateTokenAt: FieldValue.delete(),
          laCardActiveUntil: 0,
          lastRemoteLaStartOk: false,
          lastLocalCalendarLaAt: FieldValue.delete(),
          localLaActive: false,
          laGenerationPresentedAt: FieldValue.delete(),
        },
        { merge: true },
      );
    } catch {
      /* ignore */
    }
    liveCard = false;
    generationLive = false;
    alreadyPtsThis = false;
  }

  // ── C. Same schedule already PTSd; token not uploaded yet ──────────
  if (alreadyPtsThis) {
    const tokenReady = !!usableLiveActivityUpdateToken(deviceFresh, now);
    if (tokenReady) {
      const ok = await sendUpdateForSchedule(scheduleId, data, "countdown", {
        withAlert: false,
        contentState: aggregated.contentState,
        staleSec: aggregated.staleSec,
      });
      if (ok) {
        await markDueSchedulesStartedForItems(
          data.deviceId,
          scheduleId,
          data,
          aggregated.contentState.items,
        );
      }
      await recordEnsure("pts-reuse", ok ? "pts-token-ready" : "pts-token-update-miss");
      return ok;
    }
    // Card should already be on Lock Screen from PTS — arm refresh kicks only.
    // Do not re-mark started in a loop; onDeviceTokenWrite will update.
    if (data.status === "due" || data.status === "pending" || data.status === "error") {
      await markStartedAndEnqueueRefresh(scheduleId, data);
    } else {
      try {
        await enqueueRefresh(scheduleId, now + 20_000);
        await enqueueOneMinuteAndArrived(scheduleId, data);
      } catch (err) {
        logger.warn("Failed to kick refresh while awaiting PTS token", err);
      }
    }
    await recordEnsure("pts-reuse", "already-pts-awaiting-token");
    return true;
  }

  // Local ActivityKit card window still open but update token not uploaded yet.
  // Wait — do NOT mark started (no card evidence for kill-path).
  const localCardWindow = hasLocalCardPending(deviceFresh, now);
  if (localCardWindow) {
    await recordEnsure("wait-token", "local-card-awaiting-update-token");
    return false;
  }

  // Generation live for another schedule, no usable token → wait (no second PTS).
  if (generationLive || opts.preferUpdateOnly === true) {
    await recordEnsure("wait-token", "generation-or-sibling-no-token");
    return false;
  }

  // ── D. Cold kill-path: exclusive push-to-start ─────────────────────
  const claimed = await claimDevicePushStart(data.deviceId, scheduleId);
  if (!claimed) {
    await recordEnsure("claim-fail", "pts-inflight");
    return false;
  }

  if (!liveToken) {
    logger.warn("Missing pushToStart token for device", data.deviceId);
    await recordEnsure("error", "missing pushToStart token");
    try {
      await db.collection("devices").doc(data.deviceId).set(
        { laLastPushStartAt: 0 },
        { merge: true },
      );
    } catch {
      /* ignore */
    }
    await db.collection("laSchedules").doc(scheduleId).update({
      lastError: "missing pushToStart token",
      status: "error",
    });
    return false;
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const alertTitle = String(data.title || (data.locale === "en" ? "Upcoming" : "予定"));
  const alertBody =
    data.locale === "en"
      ? "Countdown on Lock Screen"
      : "ロック画面でカウントダウン中";
  const presentAlert = await tryClaimStartPresentation(data.deviceId, scheduleId, now);
  try {
    const aps = {
      timestamp: nowSec,
      event: "start",
      "content-state": aggregated.contentState,
      "attributes-type": ATTRIBUTES_TYPE,
      attributes: { name: "Essences" },
      "stale-date": aggregated.staleSec,
      "input-push-token": 1,
    };
    if (presentAlert) {
      aps.alert = {
        title: alertTitle,
        body: alertBody,
      };
    }
    const messageId = await messaging.send({
      token: fcmToken,
      apns: {
        liveActivityToken: liveToken,
        headers: {
          "apns-push-type": "liveactivity",
          "apns-topic": `${BUNDLE_ID}.push-type.liveactivity`,
          "apns-priority": "10",
        },
        payload: { aps },
      },
    });
    try {
      await db.collection("devices").doc(data.deviceId).set(
        {
          lastRemoteLaStartAt: Date.now(),
          lastRemoteLaStartOk: true,
          lastRemoteLaStartScheduleId: scheduleId,
          lastRemoteLaStartMessageId: String(messageId || ""),
          lastRemoteLaStartHadAlert: presentAlert,
          lastRemoteLaStartItemCount: aggregated.contentState.items.length,
          laCardActiveUntil: cardUntilMs,
          lastLaEnsureAt: Date.now(),
          lastLaEnsurePath: "pts",
          lastLaEnsureReason: presentAlert ? "push-to-start" : "push-to-start-silent",
          lastLaEnsureScheduleId: scheduleId,
          // New card — drop old update token until the app uploads a fresh one.
          liveActivityUpdateToken: FieldValue.delete(),
          liveActivityUpdateTokenAt: FieldValue.delete(),
          lastLocalCalendarLaAt: FieldValue.delete(),
          localLaActive: false,
          laAwaitingUpdateToken: true,
          ...(presentAlert
            ? {}
            : {
                /* generation presentation may already be claimed silently */
              }),
        },
        { merge: true },
      );
    } catch (err) {
      logger.warn("Failed to record PTS success", err);
    }
    // Best-effort wake so a suspended process can harvest the new update token.
    try {
      await sendTokenHarvestWake(fcmToken, data.deviceId);
    } catch {
      /* ignore */
    }
    await markDueSchedulesStartedForItems(
      data.deviceId,
      scheduleId,
      data,
      aggregated.contentState.items,
    );
    await recordRemoteResult(scheduleId, data.deviceId, {
      ok: true,
      phase: "start",
      code: null,
      error: null,
    });
    logger.info("LA push-to-start sent", scheduleId, {
      messageId,
      itemCount: aggregated.contentState.items.length,
      staleSec: aggregated.staleSec,
      presentAlert,
    });
    return true;
  } catch (err) {
    logger.warn("FCM live activity start failed", err);
    await recordRemoteResult(scheduleId, data.deviceId, {
      ok: false,
      phase: "start",
      code: String(err?.code || err?.errorInfo?.code || "start-fail"),
      error: String(err?.message || err),
    });
    try {
      await db.collection("devices").doc(data.deviceId).set(
        {
          lastRemoteLaStartAt: Date.now(),
          lastRemoteLaStartOk: false,
          lastRemoteLaStartScheduleId: scheduleId,
          lastRemoteLaStartError: String(err?.message || err).slice(0, 300),
          laCardActiveUntil: 0,
          laLastPushStartAt: 0,
        },
        { merge: true },
      );
    } catch {
      /* ignore */
    }
    await recordEnsure("error", "push-to-start failed");
    await db.collection("laSchedules").doc(scheduleId).update({
      lastError: "push-to-start failed",
      status: "error",
    });
    return false;
  }
}

async function markStartedAndEnqueueRefresh(scheduleId, data) {
  await db.collection("laSchedules").doc(scheduleId).update({
    status: "started",
    startedAt: Date.now(),
    lastError: FieldValue.delete(),
    cloudTaskId: FieldValue.delete(),
  });
  const now = Date.now();
  const startAt = Number(data.startEpochMs);
  // Kick soon so the first FCM update can land once updateToken is uploaded
  // (custom relative countdown freezes without tick updates while killed).
  try {
    await enqueueRefresh(scheduleId, now + 15_000);
  } catch (err) {
    logger.warn("Failed to enqueue LA kick refresh", err);
  }
  const nextRefresh = now + REFRESH_INTERVAL_MS;
  if (nextRefresh < startAt) {
    try {
      await enqueueRefresh(scheduleId, nextRefresh);
    } catch (err) {
      logger.warn("Failed to enqueue LA refresh", err);
    }
  }
  await enqueueOneMinuteAndArrived(scheduleId, data);
}

async function beginUpdateOnlyMode(scheduleId, data, note) {
  logger.info("LA update-only mode", scheduleId, note);
  const ok = await sendUpdateForSchedule(scheduleId, data, "countdown", {
    withAlert: false,
  });
  if (ok) {
    await markStartedAndEnqueueRefresh(scheduleId, data);
    return true;
  }
  await db.collection("laSchedules").doc(scheduleId).update({
    lastError: note,
    status: "error",
  });
  return false;
}

async function enqueueOneMinuteAndArrived(scheduleId, data) {
  const startAt = Number(data.startEpochMs);
  const endAt = Number(data.endAtEpochMs);
  const oneMinBefore = startAt - ONE_MINUTE_MS;
  if (oneMinBefore > Date.now()) {
    try {
      await enqueueRefresh(scheduleId, oneMinBefore);
    } catch (err) {
      logger.warn("Failed to enqueue LA 1-minute alert", err);
    }
  }
  if (startAt > Date.now() - 60_000) {
    // Dense arrived ticks — TimelineView does not reliably flip copy; FCM must.
    for (const at of [
      startAt - 5_000,
      startAt - 1_000,
      startAt,
      startAt + 5_000,
      startAt + 15_000,
      startAt + 30_000,
      startAt + 60_000,
      startAt + 120_000,
    ]) {
      if (at <= Date.now() - 2_000) continue;
      try {
        await enqueueRefresh(scheduleId, at);
      } catch (err) {
        logger.warn("Failed to enqueue LA arrived tick", at, err);
      }
    }
  }
  if (endAt > Date.now()) {
    for (const at of [endAt, endAt + 15_000, endAt + 35_000]) {
      try {
        await enqueueRefresh(scheduleId, at);
      } catch (err) {
        logger.warn("Failed to enqueue LA end", at, err);
      }
    }
  }
}

/**
 * Silent content updates by default. Alert (notification + vibration) only for:
 *  - the single 1-minute-before reminder (not on LA start)
 */
async function sendUpdateForSchedule(scheduleId, data, phase = "countdown", opts = {}) {
  const deviceSnap = await db.collection("devices").doc(data.deviceId).get();
  if (!deviceSnap.exists) return false;
  const device = deviceSnap.data() || {};
  const fcmToken = device.fcmToken;
  const updateToken = usableLiveActivityUpdateToken(device);
  const now = Date.now();
  if (!fcmToken || !updateToken) {
    // After force-quit push-to-start, updateToken often is not uploaded until
    // the app process harvests it (native uploader / brief wake). Custom "N分後"
    // copy does NOT reliably advance via TimelineView alone.
    const deviceRecentPts =
      device.lastRemoteLaStartOk === true &&
      now - Number(device.lastRemoteLaStartAt || 0) < 20 * 60_000;
    const hadRawToken = !!device.liveActivityUpdateToken;
    const skipCode = deviceRecentPts ? "awaiting-update-token" : "missing-tokens";
    logger.info("Skip LA refresh — missing/stale update token", scheduleId, {
      hasFcm: !!fcmToken,
      hasUsableUpdate: !!updateToken,
      hadRawToken,
      deviceRecentPts,
      phase,
    });
    try {
      await db.collection("devices").doc(data.deviceId).set(
        {
          laUpdateSkipMissingTokenCount: FieldValue.increment(1),
          laUpdateSkipMissingTokenAt: now,
          laUpdateSkipMissingTokenPhase: phase,
          laUpdateSkipMissingTokenScheduleId: scheduleId,
          laAwaitingUpdateToken: true,
        },
        { merge: true },
      );
    } catch {
      /* ignore */
    }
    // Always record — otherwise TestFlight logs look "healthy" while ticks starve.
    await recordRemoteResult(scheduleId, data.deviceId, {
      ok: false,
      phase,
      code: skipCode,
      error: deviceRecentPts
        ? "awaiting liveActivityUpdateToken after push-to-start"
        : "missing fcmToken or liveActivityUpdateToken",
    });
    return false;
  }
  const withAlert = opts.withAlert === true;
  const nowSec = Math.floor(now / 1000);
  const aggregated =
    opts.contentState && opts.staleSec
      ? { contentState: opts.contentState, staleSec: opts.staleSec }
      : await buildAggregatedContentState(data.deviceId, {
          tick: now,
          phase,
          includeScheduleId: scheduleId,
          includeData: data,
        });

  if (!aggregated.contentState.items.length) {
    // Only end when this schedule itself is past its end; otherwise keep waiting.
    if (Number(data.endAtEpochMs) <= now) {
      logger.info("No visible LA items — ending activity", scheduleId);
      return sendEndForSchedule(scheduleId, data);
    }
    logger.info("Skip LA refresh — no visible items yet", scheduleId);
    return false;
  }

  const aps = {
    timestamp: nowSec,
    event: "update",
    "content-state": aggregated.contentState,
    "stale-date": aggregated.staleSec,
  };
  // ActivityKit does not reliably auto-dismiss on stale-date alone. Set
  // dismissal-date on arrived so "予定時間になりました" leaves after 1h even
  // when a later FCM `end` cannot be delivered (missing update token).
  if (phase === "arrived" || aggregated.contentState.phase === "arrived") {
    const dismissMs = Math.max(
      Number(data.endAtEpochMs) || 0,
      Number(aggregated.staleSec || 0) * 1000,
      now,
    );
    aps["dismissal-date"] = Math.floor(dismissMs / 1000);
  }
  if (withAlert) {
    aps.alert = {
      title:
        opts.alertTitle ||
        (data.locale === "en" ? "Starting soon" : "まもなく開始"),
      body: opts.alertBody || String(data.title || ""),
    };
  }

  // Priority 10 counts toward Apple's Live Activity push budget. Use 5 for
  // silent heartbeats; 10 only for alerts / arrived (must land for copy flip).
  const urgent =
    withAlert || phase === "arrived" || phase === "notify1m" || opts.urgent === true;
  const apnsPriority = urgent ? "10" : "5";

  try {
    await messaging.send({
      token: fcmToken,
      apns: {
        liveActivityToken: updateToken,
        headers: {
          "apns-push-type": "liveactivity",
          "apns-topic": `${BUNDLE_ID}.push-type.liveactivity`,
          "apns-priority": apnsPriority,
        },
        payload: { aps },
      },
    });
    logger.info("LA update sent", scheduleId, {
      phase,
      withAlert,
      itemCount: aggregated.contentState.items.length,
    });
    await recordRemoteResult(scheduleId, data.deviceId, {
      ok: true,
      phase,
      code: null,
      error: null,
    });
    if (withAlert && phase === "notify1m") {
      try {
        await db.collection("laSchedules").doc(scheduleId).update({
          oneMinuteAlertSentAt: now,
        });
      } catch (err) {
        logger.warn("Failed to mark oneMinuteAlertSentAt", err);
      }
      // Token is known-good at this moment — re-arm dense arrived ticks so
      // "1分後" → "予定時間になりました" does not depend on TimelineView.
      try {
        await enqueueOneMinuteAndArrived(scheduleId, data);
      } catch (err) {
        logger.warn("Failed to re-arm arrived after notify1m", err);
      }
    }
    // Near start: reinforce arrived enqueue so copy flips without TimelineView.
    if (
      (phase === "countdown" || phase === "notify1m") &&
      Number(data.startEpochMs) > now &&
      Number(data.startEpochMs) - now < 120_000
    ) {
      try {
        await enqueueRefresh(scheduleId, Number(data.startEpochMs));
        await enqueueRefresh(scheduleId, Number(data.startEpochMs) + 5_000);
        await enqueueRefresh(scheduleId, Number(data.startEpochMs) + 15_000);
      } catch {
        /* ignore */
      }
    }
    return true;
  } catch (err) {
    const code = String(err?.code || err?.errorInfo?.code || "unknown");
    const message = String(err?.message || err);
    logger.warn("FCM live activity update failed", scheduleId, { code, message });
    await recordRemoteResult(scheduleId, data.deviceId, {
      ok: false,
      phase,
      code,
      error: message,
    });
    return false;
  }
}

async function sendEndForSchedule(scheduleId, data) {
  // Expire this row first so aggregation omits it.
  await db.collection("laSchedules").doc(scheduleId).update({ status: "expired" });

  const deviceSnap = await db.collection("devices").doc(data.deviceId).get();
  if (!deviceSnap.exists) {
    return false;
  }
  const device = deviceSnap.data() || {};
  const fcmToken = device.fcmToken;
  // Prefer usable token; fall back to raw — ending a dead generation is better
  // than leaving "予定時間になりました" on Lock Screen forever.
  const updateToken =
    usableLiveActivityUpdateToken(device) || device.liveActivityUpdateToken || null;

  // Always re-query remaining visible rows. Never end the whole Activity while
  // another countdown/arrived row should still be on the card.
  const aggregated = await buildAggregatedContentState(data.deviceId, {
    tick: Date.now(),
    phase: "countdown",
  });
  if (aggregated.contentState.items.length) {
    logger.info("LA end → update remaining rows", scheduleId, {
      remaining: aggregated.contentState.items.length,
    });
    if (!fcmToken || !updateToken) {
      logger.warn("LA remaining rows but missing/stale tokens; skip end", scheduleId);
      return false;
    }
    return sendUpdateForSchedule(scheduleId, { ...data, status: "expired" }, "countdown", {
      withAlert: false,
      contentState: aggregated.contentState,
      staleSec: aggregated.staleSec,
    });
  }

  if (!fcmToken || !updateToken) {
    logger.warn("LA end skipped — no update token (dismissal-date should cover)", scheduleId);
    await clearDeviceLiveActivityGeneration(data.deviceId);
    return false;
  }

  const nowSec = Math.floor(Date.now() / 1000);
  try {
    await messaging.send({
      token: fcmToken,
      apns: {
        liveActivityToken: updateToken,
        headers: {
          "apns-push-type": "liveactivity",
          "apns-topic": `${BUNDLE_ID}.push-type.liveactivity`,
          "apns-priority": "10",
        },
        payload: {
          aps: {
            timestamp: nowSec,
            event: "end",
            "dismissal-date": nowSec,
            "content-state": buildContentState(data, Date.now(), "arrived"),
          },
        },
      },
    });
    logger.info("LA end sent", scheduleId);
    await clearDeviceLiveActivityGeneration(data.deviceId);
    return true;
  } catch (err) {
    logger.warn("FCM live activity end failed", scheduleId, err);
    await clearDeviceLiveActivityGeneration(data.deviceId);
    return false;
  }
}

function wantsOneMinuteAlert(data, now = Date.now()) {
  if (data.oneMinuteAlertSentAt) return false;
  const startAt = Number(data.startEpochMs);
  if (!(startAt > now)) return false;
  const oneMinBefore = startAt - ONE_MINUTE_MS;
  // Allow a small early/late window around the exact 1-minute-before mark.
  return now >= oneMinBefore - 20_000 && now < startAt;
}

/** Persist per-schedule + per-device remote attempt so TestFlight can copy it. */
async function recordRemoteResult(scheduleId, deviceId, { ok, phase, code, error }) {
  const at = Date.now();
  const hint = hintForRemoteError(code, error);
  const schedulePatch = {
    lastRemoteUpdateAt: at,
    lastRemoteUpdateOk: !!ok,
    lastRemoteUpdatePhase: phase,
  };
  if (ok) {
    schedulePatch.lastRemoteUpdateError = FieldValue.delete();
    schedulePatch.lastRemoteUpdateCode = FieldValue.delete();
    schedulePatch.lastRemoteUpdateHint = FieldValue.delete();
  } else {
    schedulePatch.lastRemoteUpdateError = String(error || "unknown").slice(0, 500);
    schedulePatch.lastRemoteUpdateCode = code || "unknown";
    if (hint) schedulePatch.lastRemoteUpdateHint = hint;
  }

  const attempt = {
    at,
    scheduleId,
    phase,
    ok: !!ok,
    code: code || null,
    error: error ? String(error).slice(0, 300) : null,
    hint: hint || null,
  };

  try {
    await db.collection("laSchedules").doc(scheduleId).update(schedulePatch);
  } catch (err) {
    logger.warn("Failed to write schedule remote result", err);
  }

  try {
    const ref = db.collection("devices").doc(deviceId);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const prev = snap.exists && Array.isArray(snap.data()?.remoteLaAttempts)
        ? snap.data().remoteLaAttempts
        : [];
      const next = [attempt, ...prev].slice(0, 12);
      tx.set(
        ref,
        {
          remoteLaAttempts: next,
          lastRemoteLaAttempt: attempt,
          updatedAt: at,
        },
        { merge: true },
      );
    });
  } catch (err) {
    logger.warn("Failed to write device remote attempts", err);
  }
}

function hintForRemoteError(code, error) {
  const c = String(code || "");
  const e = String(error || "");
  if (
    c.includes("third-party-auth") ||
    /missing required authentication credential/i.test(e) ||
    /Auth error from APNS/i.test(e)
  ) {
    return (
      "APNs auth failed between FCM and Apple (messaging/third-party-auth-error). " +
      "Firebase Console → Project settings → Cloud Messaging → Apple app " +
      `(${BUNDLE_ID}) → upload APNs Authentication Key (.p8) with correct Key ID + Team ID ` +
      "(Sandbox & Production). Re-upload if Key ID/Team ID were wrong."
    );
  }
  if (c.includes("registration-token-not-registered") || c.includes("invalid-registration")) {
    return "FCM or Live Activity token is stale — reopen the app so tokens re-upload.";
  }
  if (c === "awaiting-update-token" || c === "missing-tokens") {
    return (
      "Silent Lock Screen ticks need liveActivityUpdateToken after push-to-start. " +
      "Native/JS must upload the new Activity token; until then countdown freezes."
    );
  }
  return null;
}

/**
 * Native (or JS) uploads the ActivityKit update push token without Firestore SDK.
 * Auth: Firebase ID token (Anonymous Auth). Body: { deviceId, updateToken, source? }.
 */
export const uploadLiveActivityUpdateToken = onRequest(
  {
    cors: true,
    invoker: "public",
    timeoutSeconds: 30,
  },
  async (req, res) => {
    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }
    if (req.method !== "POST") {
      res.status(405).json({ error: "POST only" });
      return;
    }

    try {
      const authHeader = String(req.get("authorization") || "");
      const match = authHeader.match(/^Bearer\s+(.+)$/i);
      if (!match) {
        res.status(401).json({ error: "missing Authorization Bearer token" });
        return;
      }
      const decoded = await adminAuth.verifyIdToken(match[1]);
      const uid = decoded.uid;
      const body = req.body || {};
      const deviceId = String(body.deviceId || "");
      const updateToken = String(body.updateToken || "").trim();
      const source = String(body.source || "unknown").slice(0, 32);
      if (!deviceId || deviceId !== uid) {
        res.status(403).json({ error: "deviceId must match authenticated uid" });
        return;
      }
      if (updateToken.length < 32) {
        res.status(400).json({ error: "invalid updateToken" });
        return;
      }

      const now = Date.now();
      await db.collection("devices").doc(deviceId).set(
        {
          liveActivityUpdateToken: updateToken,
          liveActivityUpdateTokenAt: now,
          laAwaitingUpdateToken: false,
          lastNativeUpdateTokenUploadAt: now,
          lastNativeUpdateTokenUploadSource: source,
          updatedAt: now,
        },
        { merge: true },
      );
      logger.info("uploadLiveActivityUpdateToken ok", {
        deviceId: deviceId.slice(0, 8),
        source,
        tokenLen: updateToken.length,
      });
      res.status(200).json({ ok: true, at: now });
    } catch (err) {
      logger.warn("uploadLiveActivityUpdateToken failed", err);
      res.status(401).json({
        error: String(err?.message || err).slice(0, 200),
      });
    }
  },
);

/** Silent content-available wake so suspended apps can harvest the update token. */
async function sendTokenHarvestWake(fcmToken, deviceId) {
  if (!fcmToken) return;
  try {
    await messaging.send({
      token: fcmToken,
      data: { type: "la-token-harvest" },
      apns: {
        headers: {
          "apns-priority": "5",
          "apns-push-type": "background",
        },
        payload: {
          aps: {
            "content-available": 1,
          },
        },
      },
    });
    logger.info("LA token-harvest wake sent", deviceId?.slice?.(0, 8) || deviceId);
  } catch (err) {
    logger.warn("LA token-harvest wake failed", err);
  }
}

/**
 * Fires at showAt (enqueued by onLaScheduleWrite).
 * Payload: { scheduleId: string }
 */
export const dispatchLiveActivityTask = onTaskDispatched(
  {
    retryConfig: {
      maxAttempts: 5,
      minBackoffSeconds: 30,
    },
    rateLimits: {
      maxConcurrentDispatches: 10,
    },
  },
  async (req) => {
    const scheduleId = req.data?.scheduleId;
    if (!scheduleId) {
      logger.warn("Task missing scheduleId");
      return;
    }
    const snap = await db.collection("laSchedules").doc(scheduleId).get();
    if (!snap.exists) {
      logger.info("Schedule gone; skip", scheduleId);
      return;
    }
    const data = snap.data();
    if (data.status !== "pending" && data.status !== "due") {
      logger.info("Schedule not pending/due; skip", scheduleId, data.status);
      return;
    }
    const now = Date.now();
    if (Number(data.endAtEpochMs) <= now) {
      await snap.ref.update({ status: "expired", cloudTaskId: FieldValue.delete() });
      return;
    }
    // Early dispatch (clock skew) — allow only a few seconds; 60s made LA appear ~1m early.
    if (Number(data.showAtEpochMs) > now + 15_000) {
      logger.info("Task early; re-enqueue", scheduleId);
      await enqueueAtShowAt(scheduleId, data);
      return;
    }
    await sendStartForSchedule(scheduleId, data);
  },
);

/**
 * Every ~1 minute while a Live Activity is active: FCM `update` bumps `tick`
 * so Lock Screen relative labels redraw without relying on TimelineView.
 */
export const refreshLiveActivityTask = onTaskDispatched(
  {
    retryConfig: {
      maxAttempts: 3,
      minBackoffSeconds: 60,
    },
    rateLimits: {
      maxConcurrentDispatches: 10,
    },
  },
  async (req) => {
    const scheduleId = req.data?.scheduleId;
    if (!scheduleId) return;
    const snap = await db.collection("laSchedules").doc(scheduleId).get();
    if (!snap.exists) return;
    const data = snap.data();
    const now = Date.now();

    // After arrived linger → end/update remaining (no tap required).
    if (
      (data.status === "started" || data.status === "arrived") &&
      Number(data.endAtEpochMs) <= now
    ) {
      await sendEndForSchedule(scheduleId, data);
      return;
    }

    if (data.status === "arrived") {
      // Still lingering — wake again at endAt (and a short retry).
      try {
        await enqueueRefresh(scheduleId, Number(data.endAtEpochMs));
      } catch (err) {
        logger.warn("Failed to enqueue LA end from arrived", err);
      }
      return;
    }

    if (data.status !== "started") return;

    if (Number(data.startEpochMs) <= now) {
      // Keep "予定時間になりました" until start + 1h (not "now + 1h").
      // Extending from now made late arrived pushes linger past the intended window.
      const startMs = Number(data.startEpochMs) || now;
      const lingerEnd = Math.max(
        Number(data.endAtEpochMs) || 0,
        startMs + ARRIVED_LINGER_MS,
      );
      if (lingerEnd <= now) {
        await sendEndForSchedule(scheduleId, data);
        return;
      }
      const ok = await sendUpdateForSchedule(
        scheduleId,
        { ...data, endAtEpochMs: lingerEnd },
        "arrived",
        { urgent: true, withAlert: false },
      );
      if (ok) {
        await snap.ref.update({
          status: "arrived",
          arrivedAt: now,
          endAtEpochMs: lingerEnd,
        });
        for (const at of [lingerEnd, lingerEnd + 15_000, lingerEnd + 35_000]) {
          try {
            await enqueueRefresh(scheduleId, at);
          } catch (err) {
            logger.warn("Failed to enqueue LA end after arrived", err);
          }
        }
      } else {
        // Retry soon — do not wait for endAt alone.
        try {
          await enqueueRefresh(scheduleId, now + 15_000);
        } catch (err) {
          logger.warn("Failed to re-enqueue arrived retry", err);
        }
      }
      return;
    }

    const alertClaimed = await claimOneMinuteAlert(scheduleId, now);
    const ok = await sendUpdateForSchedule(
      scheduleId,
      data,
      alertClaimed ? "notify1m" : "countdown",
      { withAlert: alertClaimed },
    );
    if (alertClaimed && !ok) {
      try {
        await snap.ref.update({ oneMinuteAlertSentAt: FieldValue.delete() });
      } catch (err) {
        logger.warn("Failed to release oneMinuteAlert claim", err);
      }
    }

    const next = now + REFRESH_INTERVAL_MS;
    if (next < Number(data.startEpochMs)) {
      try {
        await enqueueRefresh(scheduleId, next);
      } catch (err) {
        logger.warn("Failed to re-enqueue LA refresh", err);
      }
    } else if (Number(data.startEpochMs) > now) {
      try {
        await enqueueRefresh(scheduleId, Number(data.startEpochMs));
      } catch (err) {
        logger.warn("Failed to enqueue LA arrived", err);
      }
    }
  },
);

/**
 * Backup path when the app is force-quit: Cloud Tasks chains can die after a
 * single enqueue/IAM failure. Sweep every minute and push FCM updates for any
 * still-active "started" schedules.
 */
export const sweepLiveActivityRefresh = onSchedule(
  {
    schedule: "every 1 minutes",
    timeZone: "Asia/Tokyo",
  },
  async () => {
    const now = Date.now();
    const [startedSnap, arrivedSnap, pendingSnap, dueSnap] = await Promise.all([
      db.collection("laSchedules").where("status", "==", "started").get(),
      db.collection("laSchedules").where("status", "==", "arrived").get(),
      db.collection("laSchedules").where("status", "==", "pending").get(),
      db.collection("laSchedules").where("status", "==", "due").get(),
    ]);

    // End cards whose arrived linger finished (Lock Screen dismiss without tap).
    let endedNow = 0;
    for (const docSnap of [...startedSnap.docs, ...arrivedSnap.docs]) {
      const data = docSnap.data();
      if (Number(data.endAtEpochMs) <= now) {
        try {
          await sendEndForSchedule(docSnap.id, data);
          endedNow += 1;
        } catch (err) {
          logger.warn("LA sweep end failed", docSnap.id, err);
          await docSnap.ref.update({ status: "expired" });
        }
      }
    }

    // Catch missed Cloud Task starts while the app is force-quit.
    // At most one push-to-start per device per sweep — extras update the same card.
    let startedNow = 0;
    const devicesStartedThisSweep = new Set();

    // Demote zombie "started" so push-to-start can run.
    // FCM update "ok" alone is NOT enough — updates to a dead Activity still
    // succeed and used to block PTS (blank Lock Screen after force-quit).
    for (const docSnap of startedSnap.docs) {
      const data = docSnap.data();
      if (Number(data.endAtEpochMs) <= now) continue;
      if (Number(data.showAtEpochMs) > now) continue;
      let hasCard = false;
      let ptsOwnsThis = false;
      let localCardWindow = false;
      try {
        const deviceSnap = await db.collection("devices").doc(data.deviceId).get();
        let device = deviceSnap.data() || {};
        device = await clearStaleLocalOwnershipIfNeeded(data.deviceId, device, now);
        hasCard = await deviceHasLiveCard(device, data.deviceId, now);
        const ptsAge = now - Number(device.lastRemoteLaStartAt || 0);
        // Protect briefly after PTS while update token uploads. Past grace without
        // a live card → demote so kill-path can recover (blank/frozen Test1).
        ptsOwnsThis =
          device.lastRemoteLaStartOk === true &&
          device.lastRemoteLaStartScheduleId === docSnap.id &&
          ptsAge >= 0 &&
          ptsAge < PTS_TOKEN_GRACE_MS;
        // Only wait for a *fresh* local card (grace window). Stale localLaActive
        // after force-quit must not block demote→PTS (Test 1 blank Lock Screen).
        localCardWindow = !hasCard && hasLocalCardPending(device, now);
      } catch {
        /* ignore */
      }
      // Keep: live card can receive updates, or we just PTSd / local card
      // is waiting for its update token (do not stack a second Activity).
      if (hasCard || ptsOwnsThis || localCardWindow) continue;
      logger.info("LA sweep demote started without live card → due", docSnap.id);
      await docSnap.ref.update({
        status: "due",
        lastError: "demoted-no-live-card",
      });
      try {
        await db.collection("devices").doc(data.deviceId).set(
          {
            laLastPushStartAt: 0,
            liveActivityUpdateToken: FieldValue.delete(),
            liveActivityUpdateTokenAt: FieldValue.delete(),
            laCardActiveUntil: 0,
            lastRemoteLaStartOk: false,
          },
          { merge: true },
        );
        const preferUpdateOnly = devicesStartedThisSweep.has(data.deviceId);
        const ok = await sendStartForSchedule(
          docSnap.id,
          { ...data, status: "due" },
          { preferUpdateOnly },
        );
        if (ok) {
          startedNow += 1;
          devicesStartedThisSweep.add(data.deviceId);
        }
      } catch (err) {
        logger.warn("LA sweep restart stuck failed", docSnap.id, err);
      }
    }

    for (const docSnap of [...pendingSnap.docs, ...dueSnap.docs]) {
      const data = docSnap.data();
      if (Number(data.endAtEpochMs) <= now) {
        await docSnap.ref.update({ status: "expired" });
        continue;
      }
      if (Number(data.showAtEpochMs) > now) continue;
      try {
        const preferUpdateOnly = devicesStartedThisSweep.has(data.deviceId);
        const ok = await sendStartForSchedule(docSnap.id, data, { preferUpdateOnly });
        if (ok) {
          startedNow += 1;
          devicesStartedThisSweep.add(data.deviceId);
        }
      } catch (err) {
        logger.warn("LA sweep start failed", docSnap.id, err);
      }
    }

    const docs = [
      ...startedSnap.docs.filter((d) => Number(d.data()?.endAtEpochMs) > now),
      // Retry arrived rows that never successfully pushed (old bug marked arrived on failure).
      ...arrivedSnap.docs.filter(
        (d) =>
          Number(d.data()?.endAtEpochMs) > now &&
          d.data()?.lastRemoteUpdateOk === false,
      ),
    ];

    if (docs.length === 0 && startedNow === 0 && endedNow === 0) {
      logger.info("LA sweep: no started schedules");
      return;
    }

    let sent = 0;
    let skipped = 0;
    for (const docSnap of docs) {
      const data = docSnap.data();
      if (Number(data.endAtEpochMs) <= now) {
        await sendEndForSchedule(docSnap.id, data);
        endedNow += 1;
        continue;
      }

      // Avoid double-firing within the same ~45s window (task + sweep),
      // except when we still owe the one-minute alert.
      const alertClaimed = await claimOneMinuteAlert(docSnap.id, now);
      const lastOk = data.lastRemoteUpdateOk === true;
      const lastAt = Number(data.lastRemoteUpdateAt || 0);
      if (lastOk && now - lastAt < 20_000 && !alertClaimed) {
        skipped += 1;
        continue;
      }

      if (Number(data.startEpochMs) <= now) {
        const startMs = Number(data.startEpochMs) || now;
        const lingerEnd = Math.max(
          Number(data.endAtEpochMs) || 0,
          startMs + ARRIVED_LINGER_MS,
        );
        if (lingerEnd <= now) {
          await sendEndForSchedule(docSnap.id, data);
          endedNow += 1;
          continue;
        }
        const ok = await sendUpdateForSchedule(
          docSnap.id,
          { ...data, endAtEpochMs: lingerEnd },
          "arrived",
          { urgent: true, withAlert: false },
        );
        if (ok) {
          await docSnap.ref.update({
            status: "arrived",
            arrivedAt: now,
            endAtEpochMs: lingerEnd,
          });
          try {
            await enqueueRefresh(docSnap.id, lingerEnd);
          } catch (err) {
            logger.warn("Failed to enqueue LA end from sweep", err);
          }
        } else if (data.status === "arrived") {
          // Keep retrying: bounce back to started until push succeeds.
          await docSnap.ref.update({ status: "started" });
        }
        sent += 1;
        continue;
      }

      if (data.status === "arrived") {
        await docSnap.ref.update({ status: "started" });
      }

      const ok = await sendUpdateForSchedule(
        docSnap.id,
        data,
        alertClaimed ? "notify1m" : "countdown",
        { withAlert: alertClaimed },
      );
      if (alertClaimed && !ok) {
        try {
          await docSnap.ref.update({ oneMinuteAlertSentAt: FieldValue.delete() });
        } catch (err) {
          logger.warn("Failed to release oneMinuteAlert claim", err);
        }
      }
      if (ok) sent += 1;
      else skipped += 1;
    }
    logger.info("LA sweep done", { sent, skipped, startedNow, endedNow, total: docs.length });
  },
);

/**
 * On every laSchedules write:
 *  - due now → push immediately
 *  - future showAt → enqueue Cloud Task at showAt
 *  - delete / non-pending → cancel pending task
 */
export const onLaScheduleWrite = onDocumentWritten(
  "laSchedules/{scheduleId}",
  async (event) => {
    const scheduleId = event.params.scheduleId;
    const before = event.data?.before?.exists ? event.data.before.data() : null;
    const afterSnap = event.data?.after;
    const after = afterSnap?.exists ? afterSnap.data() : null;

    if (!after) {
      await deleteTaskBestEffort(before?.cloudTaskId);
      // Event deleted — if no other on-card schedules remain, drop generation so
      // the next force-quit start uses push-to-start (not a dead update token).
      if (before?.deviceId) {
        try {
          const remaining = await db
            .collection("laSchedules")
            .where("deviceId", "==", before.deviceId)
            .get();
          const now = Date.now();
          const stillLive = remaining.docs.some((docSnap) => {
            if (docSnap.id === scheduleId) return false;
            const d = docSnap.data() || {};
            const st = d.status;
            if (st !== "started" && st !== "arrived" && st !== "due") return false;
            if (Number(d.endAtEpochMs) > 0 && Number(d.endAtEpochMs) <= now) return false;
            if (st === "due" && Number(d.showAtEpochMs) > now) return false;
            return st === "started" || st === "arrived";
          });
          if (!stillLive) {
            await clearDeviceLiveActivityGeneration(before.deviceId);
          }
        } catch (err) {
          logger.warn("Failed to clear generation after schedule delete", err);
        }
      }
      return;
    }

    // Client local-start → one-shot ActivityKit presentation (banner + haptic).
    if (after.requestPresentationAlert && !after.laPresentedAlertAt) {
      if (wantsOneMinuteAlert(after, Date.now())) {
        try {
          await afterSnap.ref.update({
            requestPresentationAlert: FieldValue.delete(),
          });
        } catch (err) {
          logger.warn("Failed to clear requestPresentationAlert near 1m", err);
        }
        return;
      }
      const presentAlert = await tryClaimStartPresentation(
        after.deviceId,
        scheduleId,
        Date.now(),
      );
      if (!presentAlert) {
        try {
          await afterSnap.ref.update({
            requestPresentationAlert: FieldValue.delete(),
          });
        } catch {
          /* ignore */
        }
        return;
      }
      const ok = await sendUpdateForSchedule(scheduleId, after, "countdown", {
        withAlert: true,
        urgent: true,
        alertTitle: String(
          after.title || (after.locale === "en" ? "Upcoming" : "予定"),
        ),
        alertBody:
          after.locale === "en"
            ? "Countdown on Lock Screen"
            : "ロック画面でカウントダウン中",
      });
      try {
        await afterSnap.ref.update({
          requestPresentationAlert: FieldValue.delete(),
          // laPresentedAlertAt already set by claim when presentAlert true
          ...(ok ? {} : { laPresentedAlertAt: FieldValue.delete() }),
        });
      } catch (err) {
        logger.warn("Failed to clear requestPresentationAlert", err);
      }
      return;
    }

    // Ignore metadata-only updates and title/color edits (payload is read at fire time).
    if (
      before &&
      before.showAtEpochMs === after.showAtEpochMs &&
      before.status === after.status &&
      before.endAtEpochMs === after.endAtEpochMs &&
      before.deviceId === after.deviceId
    ) {
      return;
    }

    // Local ActivityKit already started the card — kick the minute update loop
    // when we newly enter "started" (not on every metadata rewrite).
    if (after.status === "started") {
      await deleteTaskBestEffort(after.cloudTaskId || before?.cloudTaskId);
      if (!before || before.status !== "started") {
        try {
          await enqueueRefresh(scheduleId, Date.now() + 5_000);
          logger.info("Enqueued refresh for started schedule", scheduleId);
        } catch (err) {
          logger.warn("Failed to enqueue refresh for started schedule", err);
        }
      }
      return;
    }

    if (after.status !== "pending" && after.status !== "due") {
      await deleteTaskBestEffort(after.cloudTaskId || before?.cloudTaskId);
      return;
    }

    const now = Date.now();
    if (Number(after.endAtEpochMs) <= now) {
      await deleteTaskBestEffort(after.cloudTaskId || before?.cloudTaskId);
      return;
    }

    if (Number(after.showAtEpochMs) <= now) {
      await deleteTaskBestEffort(after.cloudTaskId || before?.cloudTaskId);
      await sendStartForSchedule(scheduleId, after);
      return;
    }

    // Already enqueued for this exact showAt — nothing to do.
    if (
      after.taskEnqueuedForShowAt === after.showAtEpochMs &&
      after.cloudTaskId
    ) {
      return;
    }

    try {
      await enqueueAtShowAt(scheduleId, after);
      logger.info("Enqueued LA task", {
        scheduleId,
        showAtEpochMs: after.showAtEpochMs,
      });
    } catch (err) {
      logger.error("Failed to enqueue LA task", err);
      await afterSnap.ref.update({
        lastError: `enqueue: ${String(err?.message || err)}`,
      });
    }
  },
);

/**
 * When the device finally uploads liveActivityUpdateToken (often AFTER a local
 * Live Activity start or PTS harvest), kick the refresh loop for active schedules.
 */
export const onDeviceTokenWrite = onDocumentWritten(
  "devices/{deviceId}",
  async (event) => {
    const after = event.data?.after?.exists ? event.data.after.data() : null;
    const before = event.data?.before?.exists ? event.data.before.data() : null;
    if (!after) return;

    const tokenNow = after.liveActivityUpdateToken;
    const tokenBefore = before?.liveActivityUpdateToken;
    const fcmNow = after.fcmToken;
    if (!tokenNow || !fcmNow) return;
    if (tokenNow === tokenBefore && fcmNow === before?.fcmToken) return;

    const deviceId = event.params.deviceId;
    const now = Date.now();
    try {
      await db.collection("devices").doc(deviceId).set(
        {
          laAwaitingUpdateToken: false,
          lastUpdateTokenKickAt: now,
        },
        { merge: true },
      );
    } catch {
      /* ignore */
    }

    const snap = await db
      .collection("laSchedules")
      .where("deviceId", "==", deviceId)
      .get();

    for (const docSnap of snap.docs) {
      const data = docSnap.data();
      const status = data.status;
      if (status === "pending") continue;
      if (Number(data.endAtEpochMs) <= now) continue;

      if (status === "due" || status === "error") {
        // Token just arrived — update only when a real card still exists.
        const preferUpdateOnly = await deviceHasLiveCard(
          after,
          deviceId,
          now,
        );
        await sendStartForSchedule(docSnap.id, data, { preferUpdateOnly });
        continue;
      }
      if (status === "started") {
        try {
          if (Number(data.startEpochMs) <= now) {
            // Missed arrived while token was missing — flip copy immediately.
            const startMs = Number(data.startEpochMs) || now;
            const lingerEnd = Math.max(
              Number(data.endAtEpochMs) || 0,
              startMs + ARRIVED_LINGER_MS,
            );
            const ok = await sendUpdateForSchedule(
              docSnap.id,
              { ...data, endAtEpochMs: lingerEnd },
              "arrived",
              { urgent: true, withAlert: false },
            );
            if (ok) {
              await docSnap.ref.update({
                status: "arrived",
                arrivedAt: now,
                endAtEpochMs: lingerEnd,
              });
            }
          } else {
            await sendUpdateForSchedule(docSnap.id, data, "countdown");
            await enqueueRefresh(docSnap.id, now + REFRESH_INTERVAL_MS);
            await enqueueOneMinuteAndArrived(docSnap.id, data);
          }
          logger.info("Kicked refresh after device token upload", docSnap.id);
        } catch (err) {
          logger.warn("Failed to kick refresh after device token", err);
        }
        continue;
      }
      if (status === "arrived") {
        try {
          await sendUpdateForSchedule(docSnap.id, data, "arrived", {
            urgent: true,
            withAlert: false,
          });
          logger.info("Kicked arrived refresh after device token upload", docSnap.id);
        } catch (err) {
          logger.warn("Failed to kick arrived after device token", err);
        }
      }
    }
  },
);
