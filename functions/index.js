/**
 * Essences Live Activity dispatcher (Firebase project: todolist-app-project-4fd37).
 *
 * Schedules use showAtEpochMs = max(start − lead, now). So if the user sets
 * lead=4h while the event is only 3h away, status becomes "due" and we push
 * immediately (and the app also starts locally while foregrounded).
 *
 * Payload shape follows:
 *   https://firebase.google.com/docs/cloud-messaging/customize-messages/live-activity
 *   (FCM registration token + apns.live_activity_token + start event)
 * Headers follow Apple ActivityKit push requirements:
 *   apns-push-type: liveactivity
 *   apns-topic: <bundleId>.push-type.liveactivity
 *
 * Deploy (Blaze plan required for scheduled functions):
 *   cd functions && npm i && firebase deploy --only functions,firestore
 */

import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { setGlobalOptions } from "firebase-functions/v2/options";
import { logger } from "firebase-functions";

initializeApp();
setGlobalOptions({ region: "asia-northeast1" });

const db = getFirestore();
const messaging = getMessaging();

/** Must match the Swift `ActivityAttributes` type name exactly. */
const ATTRIBUTES_TYPE = "EssencesWidgetAttributes";
const BUNDLE_ID = "com.confast.essences";

async function sendStartForSchedule(scheduleId, data) {
  const deviceSnap = await db.collection("devices").doc(data.deviceId).get();
  if (!deviceSnap.exists) {
    logger.warn("No device doc", data.deviceId);
    return false;
  }
  const device = deviceSnap.data() || {};
  // Pitfall A: need BOTH the FCM registration token and the ActivityKit
  // push-to-start token (not FCM alone).
  const fcmToken = device.fcmToken;
  const liveToken = device.pushToStartToken;
  if (!fcmToken || !liveToken) {
    logger.warn("Missing tokens for device", data.deviceId, {
      hasFcm: !!fcmToken,
      hasLive: !!liveToken,
    });
    return false;
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const staleSec = Math.floor(Number(data.endAtEpochMs) / 1000);

  // Must match EssencesWidgetAttributes.ContentState Codable keys exactly.
  const contentState = {
    items: [
      {
        title: String(data.title || ""),
        startEpochMs: Number(data.startEpochMs),
        color: String(data.color || "blue"),
      },
    ],
    overflow: 0,
    locale: String(data.locale || "ja"),
  };

  try {
    await messaging.send({
      token: fcmToken,
      apns: {
        liveActivityToken: liveToken,
        headers: {
          // Pitfall C: ActivityKit pushes are ignored without these headers.
          "apns-push-type": "liveactivity",
          "apns-topic": `${BUNDLE_ID}.push-type.liveactivity`,
          "apns-priority": "10",
        },
        payload: {
          aps: {
            timestamp: nowSec,
            event: "start",
            "content-state": contentState,
            "attributes-type": ATTRIBUTES_TYPE,
            attributes: { name: "Essences" },
            "stale-date": staleSec,
            alert: {
              title: data.locale === "en" ? "Upcoming" : "まもなくの予定",
              body: String(data.title || ""),
            },
          },
        },
      },
    });
    await db.collection("laSchedules").doc(scheduleId).update({
      status: "started",
      startedAt: Date.now(),
      lastError: FieldValue.delete(),
    });
    return true;
  } catch (err) {
    logger.error("FCM live activity start failed", err);
    await db.collection("laSchedules").doc(scheduleId).update({
      lastError: String(err?.message || err),
      status: "error",
    });
    return false;
  }
}

async function loadByStatus(status, limit) {
  // Equality-only query — no composite index required.
  // (status + showAtEpochMs inequality was failing 100% without an index.)
  try {
    const snap = await db
      .collection("laSchedules")
      .where("status", "==", status)
      .limit(limit)
      .get();
    return snap.docs;
  } catch (err) {
    logger.error(`loadByStatus(${status}) failed`, err);
    return [];
  }
}

async function dispatchDue(limit = 40) {
  const now = Date.now();
  const docs = [
    ...(await loadByStatus("pending", limit)),
    ...(await loadByStatus("due", limit)),
  ];
  let sent = 0;
  for (const docSnap of docs) {
    const data = docSnap.data();
    if (Number(data.showAtEpochMs) > now) continue;
    if (Number(data.endAtEpochMs) <= now) continue;
    const ok = await sendStartForSchedule(docSnap.id, data);
    if (ok) sent += 1;
  }
  return sent;
}

/** Immediate path when a schedule is written as already due (in-window save). */
export const onLaScheduleWrite = onDocumentWritten(
  "laSchedules/{scheduleId}",
  async (event) => {
    const after = event.data?.after;
    if (!after?.exists) return;
    const data = after.data();
    if (!data) return;
    if (data.status !== "pending" && data.status !== "due") return;
    const now = Date.now();
    if (data.showAtEpochMs <= now && data.endAtEpochMs > now) {
      await sendStartForSchedule(after.id, data);
    }
  },
);

/**
 * Poll for future showAt windows when the app is killed.
 * every 15 minutes (was 1 minute) to keep Blaze spend tiny while debugging.
 * In-window saves still fire immediately via onLaScheduleWrite.
 */
export const dispatchLiveActivities = onSchedule("every 15 minutes", async () => {
  const sent = await dispatchDue();
  logger.info("dispatchLiveActivities sent", { sent });
});
