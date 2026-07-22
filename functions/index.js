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
import { getFunctions } from "firebase-admin/functions";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { onTaskDispatched } from "firebase-functions/v2/tasks";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { setGlobalOptions } from "firebase-functions/v2/options";
import { logger } from "firebase-functions";
import { GoogleAuth } from "google-auth-library";

initializeApp();

const REGION = "asia-northeast1";
setGlobalOptions({ region: REGION });

const db = getFirestore();
const messaging = getMessaging();

/** Must match the Swift `ActivityAttributes` type name exactly. */
const ATTRIBUTES_TYPE = "EssencesWidgetAttributes";
const BUNDLE_ID = "com.confast.essences";
/** Exported task-queue function name — must match `taskQueue(...)` below. */
const TASK_FN = "dispatchLiveActivityTask";
const REFRESH_FN = "refreshLiveActivityTask";
/** Remote Lock Screen redraw every minute (custom relative labels need Activity.update). */
const REFRESH_INTERVAL_MS = 60 * 1000;
/** Fire a single audible/haptic Live Activity alert this far before start. */
const ONE_MINUTE_MS = 60 * 1000;

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
  let maxEndAt = 0;
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
    maxEndAt = Math.max(maxEndAt, endAt);
    rows.push({
      title: String(d.title || ""),
      startEpochMs: startAt,
      color: String(d.color || "blue"),
    });
  }

  rows.sort((a, b) => a.startEpochMs - b.startEpochMs);
  const items = rows.slice(0, MAX_LA_ITEMS);
  const overflow = Math.max(0, rows.length - MAX_LA_ITEMS);
  const anyCounting = rows.some((r) => r.startEpochMs > now);
  const resolvedPhase =
    phase === "notify1m" ? "countdown" : anyCounting ? "countdown" : "arrived";

  return {
    contentState: {
      items,
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

async function sendStartForSchedule(scheduleId, data) {
  const deviceSnap = await db.collection("devices").doc(data.deviceId).get();
  if (!deviceSnap.exists) {
    logger.warn("No device doc", data.deviceId);
    return false;
  }
  const device = deviceSnap.data() || {};
  const fcmToken = device.fcmToken;
  const liveToken = device.pushToStartToken;
  const updateToken = device.liveActivityUpdateToken;
  if (!fcmToken) {
    logger.warn("Missing FCM token for device", data.deviceId);
    return false;
  }

  const aggregated = await buildAggregatedContentState(data.deviceId, {
    tick: Date.now(),
    phase: "countdown",
    includeScheduleId: scheduleId,
    includeData: { ...data, status: "due" },
  });
  if (!aggregated.contentState.items.length) {
    logger.warn("No items to start for schedule", scheduleId);
    return false;
  }

  const alertTitle = data.locale === "en" ? "Upcoming" : "今後の予定";
  const alertBody = String(data.title || "");

  // Prefer update when an Activity is already live (multi-event card).
  if (updateToken) {
    const ok = await sendUpdateForSchedule(scheduleId, data, "countdown", {
      withAlert: true,
      contentState: aggregated.contentState,
      staleSec: aggregated.staleSec,
      alertTitle,
      alertBody,
    });
    if (ok) {
      await markStartedAndEnqueueRefresh(scheduleId, data);
      return true;
    }
    // Avoid a second push-to-start Activity when one is likely already on Lock Screen.
    return beginUpdateOnlyMode(
      scheduleId,
      data,
      "update failed while updateToken present; keep single card",
    );
  }

  if (!liveToken) {
    logger.warn("Missing pushToStart token for device", data.deviceId);
    return false;
  }

  const nowSec = Math.floor(Date.now() / 1000);
  try {
    await messaging.send({
      token: fcmToken,
      apns: {
        liveActivityToken: liveToken,
        headers: {
          "apns-push-type": "liveactivity",
          "apns-topic": `${BUNDLE_ID}.push-type.liveactivity`,
          "apns-priority": "10",
        },
        payload: {
          aps: {
            timestamp: nowSec,
            event: "start",
            "content-state": aggregated.contentState,
            "attributes-type": ATTRIBUTES_TYPE,
            attributes: { name: "Essences" },
            "stale-date": aggregated.staleSec,
            alert: {
              title: alertTitle,
              body: alertBody,
            },
          },
        },
      },
    });
    await markStartedAndEnqueueRefresh(scheduleId, data);
    return true;
  } catch (err) {
    logger.error("FCM live activity start failed", err);
    // Common when the app already started the activity locally with pushType:.token.
    if (updateToken) {
      return beginUpdateOnlyMode(
        scheduleId,
        data,
        `start failed; update-only: ${String(err?.message || err)}`,
      );
    }
    await db.collection("laSchedules").doc(scheduleId).update({
      lastError: String(err?.message || err),
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
  const nextRefresh = Date.now() + REFRESH_INTERVAL_MS;
  if (nextRefresh < Number(data.startEpochMs)) {
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
  await db.collection("laSchedules").doc(scheduleId).update({
    status: "started",
    startedAt: Date.now(),
    lastError: note,
    cloudTaskId: FieldValue.delete(),
  });
  try {
    await sendUpdateForSchedule(scheduleId, data, "countdown", {
      withAlert: true,
      alertTitle: data.locale === "en" ? "Upcoming" : "今後の予定",
      alertBody: String(data.title || ""),
    });
  } catch (err) {
    logger.warn("Immediate LA update failed", err);
  }
  try {
    await enqueueRefresh(scheduleId, Date.now() + 15_000);
  } catch (err) {
    logger.warn("Failed to enqueue update-only refresh", err);
  }
  await enqueueOneMinuteAndArrived(scheduleId, data);
  return true;
}

async function enqueueOneMinuteAndArrived(scheduleId, data) {
  const startAt = Number(data.startEpochMs);
  const oneMinBefore = startAt - ONE_MINUTE_MS;
  if (oneMinBefore > Date.now()) {
    try {
      await enqueueRefresh(scheduleId, oneMinBefore);
    } catch (err) {
      logger.warn("Failed to enqueue LA 1-minute alert", err);
    }
  }
  if (startAt > Date.now()) {
    try {
      await enqueueRefresh(scheduleId, startAt);
    } catch (err) {
      logger.warn("Failed to enqueue LA arrived tick", err);
    }
  }
}

/**
 * Silent content updates by default. Alert (notification + vibration) only for:
 *  - Live Activity start / first appearance
 *  - the single 1-minute-before reminder
 */
async function sendUpdateForSchedule(scheduleId, data, phase = "countdown", opts = {}) {
  const deviceSnap = await db.collection("devices").doc(data.deviceId).get();
  if (!deviceSnap.exists) return false;
  const device = deviceSnap.data() || {};
  const fcmToken = device.fcmToken;
  const updateToken = device.liveActivityUpdateToken;
  if (!fcmToken || !updateToken) {
    logger.info("Skip LA refresh — missing update token", scheduleId, {
      hasFcm: !!fcmToken,
      hasUpdate: !!updateToken,
    });
    await recordRemoteResult(scheduleId, data.deviceId, {
      ok: false,
      phase,
      code: "missing-tokens",
      error: "missing fcmToken or liveActivityUpdateToken",
    });
    return false;
  }

  const now = Date.now();
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
    logger.info("Skip LA refresh — no visible items", scheduleId);
    return false;
  }

  const aps = {
    timestamp: nowSec,
    event: "update",
    "content-state": aggregated.contentState,
    "stale-date": aggregated.staleSec,
  };
  if (withAlert) {
    aps.alert = {
      title:
        opts.alertTitle ||
        (data.locale === "en" ? "Starting soon" : "まもなく開始"),
      body: opts.alertBody || String(data.title || ""),
    };
  }

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
  return null;
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
    // Early dispatch (clock skew) — still OK if showAt is within a minute; otherwise re-enqueue.
    if (Number(data.showAtEpochMs) > now + 60_000) {
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
    if (data.status !== "started") return;
    const now = Date.now();
    if (Number(data.startEpochMs) <= now) {
      // Only stop the refresh loop after a successful arrived update.
      const ok = await sendUpdateForSchedule(scheduleId, data, "arrived");
      if (ok) await snap.ref.update({ status: "arrived" });
      return;
    }

    const alertNow = wantsOneMinuteAlert(data, now);
    await sendUpdateForSchedule(
      scheduleId,
      data,
      alertNow ? "notify1m" : "countdown",
      { withAlert: alertNow },
    );

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

    // Catch missed Cloud Task starts while the app is force-quit.
    let startedNow = 0;
    for (const docSnap of [...pendingSnap.docs, ...dueSnap.docs]) {
      const data = docSnap.data();
      if (Number(data.endAtEpochMs) <= now) {
        await docSnap.ref.update({ status: "expired" });
        continue;
      }
      if (Number(data.showAtEpochMs) > now) continue;
      try {
        const ok = await sendStartForSchedule(docSnap.id, data);
        if (ok) startedNow += 1;
      } catch (err) {
        logger.warn("LA sweep start failed", docSnap.id, err);
      }
    }

    const docs = [
      ...startedSnap.docs,
      // Retry arrived rows that never successfully pushed (old bug marked arrived on failure).
      ...arrivedSnap.docs.filter((d) => d.data()?.lastRemoteUpdateOk === false),
    ];

    if (docs.length === 0 && startedNow === 0) {
      logger.info("LA sweep: no started schedules");
      return;
    }

    let sent = 0;
    let skipped = 0;
    for (const docSnap of docs) {
      const data = docSnap.data();
      if (Number(data.endAtEpochMs) <= now) {
        await docSnap.ref.update({ status: "expired" });
        skipped += 1;
        continue;
      }

      // Avoid double-firing within the same ~45s window (task + sweep),
      // except when we still owe the one-minute alert.
      const alertNow = wantsOneMinuteAlert(data, now);
      const lastOk = data.lastRemoteUpdateOk === true;
      const lastAt = Number(data.lastRemoteUpdateAt || 0);
      if (lastOk && now - lastAt < 45_000 && !alertNow) {
        skipped += 1;
        continue;
      }

      if (Number(data.startEpochMs) <= now) {
        const ok = await sendUpdateForSchedule(docSnap.id, data, "arrived");
        if (ok) await docSnap.ref.update({ status: "arrived" });
        else if (data.status === "arrived") {
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
        alertNow ? "notify1m" : "countdown",
        { withAlert: alertNow },
      );
      if (ok) sent += 1;
      else skipped += 1;
    }
    logger.info("LA sweep done", { sent, skipped, startedNow, total: docs.length });
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
 * Live Activity start), kick the refresh loop for active schedules.
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
    const snap = await db
      .collection("laSchedules")
      .where("deviceId", "==", deviceId)
      .get();

    for (const docSnap of snap.docs) {
      const data = docSnap.data();
      const status = data.status;
      if (status === "pending") continue;
      if (Number(data.endAtEpochMs) <= Date.now()) continue;

      if (status === "due" || status === "error") {
        await sendStartForSchedule(docSnap.id, data);
        continue;
      }
      if (status === "started") {
        try {
          await sendUpdateForSchedule(docSnap.id, data, "countdown");
          await enqueueRefresh(docSnap.id, Date.now() + REFRESH_INTERVAL_MS);
          logger.info("Kicked refresh after device token upload", docSnap.id);
        } catch (err) {
          logger.warn("Failed to kick refresh after device token", err);
        }
      }
    }
  },
);
