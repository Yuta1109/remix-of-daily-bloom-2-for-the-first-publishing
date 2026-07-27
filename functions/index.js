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
 * Ensure a schedule is on the Lock Screen.
 *
 * Ownership model:
 *  A) App process alive + local card / pending local start → update or wait.
 *     Never PTS (PTS on top of local ActivityKit = duplicate card + multi-haptic).
 *     Promote due→started so FCM minute refresh + 1-minute alert chains run
 *     (TimelineView.everyMinute alone is unreliable on Lock Screen).
 *  B) App dead + live card evidence (laCardActiveUntil + usable token) →
 *     FCM update only (force-quit after local/PTS start). Never second PTS.
 *  C) App dead + no live card → exactly one push-to-start per claim window.
 *
 * Never mark `started` from a bare update token with no card window — that
 * blocked PTS and left the Lock Screen blank after force-quit.
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
    now - Number(deviceFresh.lastRemoteLaStartAt || 0) < 20 * 60_000;

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
  // Only PTS while appAlive when there is *no* local-card evidence (blank
  // Lock Screen stuck at due). Never PTS while local ActivityKit is pending —
  // that stacked a second card and caused ~3 haptics (Test 3).
  if (appAlive) {
    if (liveCard) {
      logger.info("LA app-alive content refresh", scheduleId);
      await sendUpdateForSchedule(scheduleId, data, "countdown", {
        withAlert: false,
        contentState: aggregated.contentState,
        staleSec: aggregated.staleSec,
      });
      // Client sync leaves rows as "due"; without promoting to started the
      // refresh / 1-minute-alert Cloud Tasks never run, so Lock Screen freezes
      // after the app backgrounds (native heartbeat suspends).
      if (
        data.status === "due" ||
        data.status === "pending" ||
        data.status === "error"
      ) {
        await markDueSchedulesStartedForItems(
          data.deviceId,
          scheduleId,
          data,
          aggregated.contentState.items,
        );
      } else {
        try {
          await enqueueOneMinuteAndArrived(scheduleId, data);
          await enqueueRefresh(scheduleId, now + REFRESH_INTERVAL_MS);
        } catch (err) {
          logger.warn("Failed to ensure LA refresh while app-alive", err);
        }
      }
      await recordEnsure("local-owned", "app-alive");
      return true;
    }
    if (hasLocalCardPending(deviceFresh, now)) {
      if (
        data.status === "due" ||
        data.status === "pending" ||
        data.status === "error"
      ) {
        await markStartedAndEnqueueRefresh(scheduleId, data);
      }
      await recordEnsure("wait-token", "app-alive-local-pending-token");
      return true;
    }
    logger.info(
      "LA app-alive but no local card evidence — falling through to PTS/update",
      scheduleId,
    );
    await recordEnsure("local-owned-miss", "app-alive-no-card");
  }

  // ── B. Kill-path with a *live* card → update only (no second PTS) ──
  if (liveCard) {
    // Presentation alert only when the app is not alive (local path uses
    // Capacitor haptic / a single requestPresentationAlert instead).
    // Skip when the 1-minute alert window is open — that push already buzzes
    // (Test 2 saw ~2 haptics then the banner).
    const presentAlert =
      !appAlive && !data.laPresentedAlertAt && !wantsOneMinuteAlert(data, now);
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
      if (presentAlert) {
        try {
          await db.collection("laSchedules").doc(scheduleId).update({
            laPresentedAlertAt: Date.now(),
          });
        } catch {
          /* ignore */
        }
      }
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
    await markStartedAndEnqueueRefresh(scheduleId, data);
    await recordEnsure("pts-reuse", "already-pts-awaiting-token");
    return true;
  }

  // Local ActivityKit card window still open but update token not uploaded yet.
  // Wait — PTS would stack a second card on top of the surviving local one.
  // Still promote to started so the minute / 1m-alert task chain is armed;
  // onDeviceTokenWrite kicks the first FCM update once the token lands.
  const localCardWindow = hasLocalCardPending(deviceFresh, now);
  if (localCardWindow) {
    if (
      data.status === "due" ||
      data.status === "pending" ||
      data.status === "error"
    ) {
      await markStartedAndEnqueueRefresh(scheduleId, data);
    }
    await recordEnsure("wait-token", "local-card-awaiting-update-token");
    return true;
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
      // Release exclusive claim so a later retry (after token upload) can PTS.
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
  try {
    const aps = {
      timestamp: nowSec,
      event: "start",
      "content-state": aggregated.contentState,
      "attributes-type": ATTRIBUTES_TYPE,
      attributes: { name: "Essences" },
      "stale-date": aggregated.staleSec,
      "input-push-token": 1,
      alert: {
        title: alertTitle,
        body: alertBody,
      },
    };
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
          lastRemoteLaStartHadAlert: true,
          lastRemoteLaStartItemCount: aggregated.contentState.items.length,
          laCardActiveUntil: cardUntilMs,
          lastLaEnsureAt: Date.now(),
          lastLaEnsurePath: "pts",
          lastLaEnsureReason: "push-to-start",
          lastLaEnsureScheduleId: scheduleId,
          // New card — drop old update token until the app uploads a fresh one.
          liveActivityUpdateToken: FieldValue.delete(),
          liveActivityUpdateTokenAt: FieldValue.delete(),
          lastLocalCalendarLaAt: FieldValue.delete(),
        },
        { merge: true },
      );
    } catch (err) {
      logger.warn("Failed to record PTS success", err);
    }
    await markDueSchedulesStartedForItems(
      data.deviceId,
      scheduleId,
      data,
      aggregated.contentState.items,
    );
    try {
      await db.collection("laSchedules").doc(scheduleId).update({
        laPresentedAlertAt: Date.now(),
      });
    } catch {
      /* ignore */
    }
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
          // Release claim so a later retry can PTS.
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
  if (startAt > Date.now()) {
    // Hit start time precisely (and nearby) so "予定時間になりました" is not
    // delayed until the next heartbeat — that made arrived flash then vanish.
    for (const at of [startAt - 5_000, startAt, startAt + 10_000, startAt + 25_000]) {
      if (at <= Date.now() - 2_000) continue;
      try {
        await enqueueRefresh(scheduleId, at);
      } catch (err) {
        logger.warn("Failed to enqueue LA arrived tick", at, err);
      }
    }
  }
  // Dismiss after arrived linger — retry soon after endAt so we don't wait for
  // the next 1-minute sweep (that made dismiss feel like 1m or 2m at random).
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
    // the app opens — expected briefly. Custom "N分後" copy does NOT reliably
    // advance via TimelineView alone; Cloud Tasks + usable update token are
    // required for background / kill-path minute updates.
    // Also skip stale pre-PTS tokens (they can dismiss the new Activity).
    const deviceRecentPts =
      device.lastRemoteLaStartOk === true &&
      now - Number(device.lastRemoteLaStartAt || 0) < 20 * 60_000;
    const hadRawToken = !!device.liveActivityUpdateToken;
    logger.info("Skip LA refresh — missing/stale update token", scheduleId, {
      hasFcm: !!fcmToken,
      hasUsableUpdate: !!updateToken,
      hadRawToken,
      deviceRecentPts,
    });
    if (!deviceRecentPts) {
      await recordRemoteResult(scheduleId, data.deviceId, {
        ok: false,
        phase,
        code: "missing-tokens",
        error: "missing fcmToken or liveActivityUpdateToken",
      });
    }
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

  // Priority 10 counts toward Apple's Live Activity push budget and can trigger
  // the system "continue allowing Live Activities?" prompt. Use 5 for heartbeats.
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
      // Claim may already have set oneMinuteAlertSentAt; keep it on success.
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
        { urgent: true },
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
        ptsOwnsThis =
          device.lastRemoteLaStartOk === true &&
          device.lastRemoteLaStartScheduleId === docSnap.id &&
          now - Number(device.lastRemoteLaStartAt || 0) < 20 * 60_000;
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
          { urgent: true },
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
      // Let the dedicated 1-minute alert own the haptic in that window.
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
          ...(ok ? { laPresentedAlertAt: Date.now() } : {}),
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
        // Token just arrived — update only when a real card still exists.
        const preferUpdateOnly = await deviceHasLiveCard(
          after,
          deviceId,
          Date.now(),
        );
        await sendStartForSchedule(docSnap.id, data, { preferUpdateOnly });
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
