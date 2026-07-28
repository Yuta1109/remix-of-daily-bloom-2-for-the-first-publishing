import { Capacitor, registerPlugin } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import {
  collectLiveActivityWindows,
  LIVE_ACTIVITY_ARRIVED_MS,
  selectLiveActivityRows,
  type LiveActivityWindow,
} from "./live-activity-window";
import { canScheduleLiveActivities } from "./live-activity-prefs";

/**
 * Live Activity design (ActivityKit / Apple HIG):
 *
 * - Minimum iOS 17.2 (ActivityKit push-to-start; no wake-notification fallback).
 * - One shared Lock Screen activity (max 3 event rows).
 * - showAt = start − lead (stable). If already past showAt on save → appear now.
 * - App process alive: local ActivityKit only (server never PTS while appAliveAt fresh).
 * - App force-quit: update existing card via FCM if update token exists; else one PTS.
 * - Arrived ("It's time"): keep up to 1 hour (or until app open / displaced when >3).
 * - No OS "request permission" API — first-run demo + Settings gate LA.
 */

const MAX_ITEMS = 3;
/** Local notification id range reserved for LA wake/dismiss (avoid reminder ids). */
const LA_NOTIF_ID_BASE = 50_000;
const LA_NOTIF_ID_MAX = 59_999;

/** Same rules as Cloud Functions / Swift — bake into Activity content-state. */
export function formatLaStatusText(
  startEpochMs: number,
  locale: "en" | "ja",
  nowMs: number = Date.now(),
): string {
  const secs = (Number(startEpochMs) - nowMs) / 1000;
  const ja = locale !== "en";
  if (!(secs > 0)) {
    return ja ? "予定時間になりました" : "It's time";
  }
  if (secs < 60) {
    return ja ? "まもなく" : "soon";
  }
  const totalMinutes = Math.floor(secs / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (ja) {
    if (hours > 0 && minutes > 0) return `${hours}時間${minutes}分後`;
    if (hours > 0) return `${hours}時間後`;
    return `${totalMinutes}分後`;
  }
  if (hours > 0 && minutes > 0) return `in ${hours}h ${minutes}m`;
  if (hours > 0) return `in ${hours}h`;
  return `in ${totalMinutes}m`;
}

export interface LiveActivityItem {
  title: string;
  startEpochMs: number;
  color: string;
  /** Baked Lock Screen copy — preferred over TimelineView alone. */
  statusText?: string;
}

export interface LiveActivityPayload {
  locale: "en" | "ja";
  items: LiveActivityItem[];
  overflow: number;
  endEpochMs: number;
  /** "countdown" | "arrived" — Lock Screen copy after event start. */
  phase?: "countdown" | "arrived";
}

export interface LiveActivitiesPlugin {
  areEnabled(): Promise<{ enabled: boolean }>;
  getAuthState(): Promise<{
    enabled: boolean;
    frequentPushesEnabled: boolean;
    activityCount: number;
  }>;
  startOrUpdate(payload: LiveActivityPayload): Promise<{ activityId: string | null }>;
  endAll(): Promise<void>;
  startPushToStartTokenUpdates(): Promise<void>;
  getPushToStartToken(): Promise<{ token: string | null }>;
  getUpdateToken(): Promise<{ token: string | null }>;
  getTokenDebugInfo(): Promise<{
    apnsCacheBytes?: number;
    apnsRegisterError?: string | null;
    hasGoogleServiceInfoPlist?: boolean;
    activitiesEnabled?: boolean;
    activeActivityCount?: number;
    hasPushToStartToken?: boolean;
    hasUpdateToken?: boolean;
    laStartedWithoutPush?: boolean;
    iosVersion?: string;
    [key: string]: unknown;
  }>;
  rebroadcastApnsToken(): Promise<{
    rebroadcast: boolean;
    apnsCacheBytes: number;
    apnsRegisterError?: string;
  }>;
  /** Opens Essences in iOS Settings (Live Activities toggle is on that page). */
  openLiveActivitySettings(): Promise<void>;
  /** Native HTTPS upload of update tokens while WKWebView may be suspended. */
  setTokenUploadContext(opts: {
    deviceId: string;
    idToken: string;
    uploadUrl: string;
  }): Promise<{ ok: boolean }>;
  /** Reliable clipboard via UIPasteboard (WebView clipboard often fails). */
  copyText(opts: { text: string }): Promise<{ ok: boolean; length: number }>;
}

export const LiveActivities = registerPlugin<LiveActivitiesPlugin>("LiveActivities");

export function isLiveActivitySupported(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
}

function currentLocale(): "en" | "ja" {
  try {
    const saved = localStorage.getItem("growth-app-lang");
    if (saved === "ja" || saved === "en") return saved;
  } catch {
    /* ignore */
  }
  return (navigator.language || "en").startsWith("ja") ? "ja" : "en";
}

/** Soft preference while the app is foregrounded (cleared on background). */
let preferDismissArrived = false;
/**
 * Arrived rows the user already cleared by opening the app (or overflow).
 * Persists across background so "予定時間になりました" does not come back.
 */
const DISMISSED_ARRIVED_KEY = "essences-la-dismissed-arrived-v1";
type DismissedArrived = { key: string; untilMs: number };

function readDismissedArrived(): DismissedArrived[] {
  try {
    const raw = localStorage.getItem(DISMISSED_ARRIVED_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as DismissedArrived[];
    if (!Array.isArray(parsed)) return [];
    const now = Date.now();
    return parsed.filter((e) => e && e.key && Number(e.untilMs) > now);
  } catch {
    return [];
  }
}

function writeDismissedArrived(list: DismissedArrived[]): void {
  try {
    localStorage.setItem(DISMISSED_ARRIVED_KEY, JSON.stringify(list.slice(-80)));
  } catch {
    /* ignore */
  }
}

function arrivedKey(eventId: string, startEpochMs: number): string {
  return `${eventId}|${startEpochMs}`;
}

/** True when this occurrence's "It's time" row was cleared (open app / overflow). */
export function isArrivedLiveActivityDismissed(
  eventId: string,
  startEpochMs: number,
): boolean {
  const key = arrivedKey(eventId, startEpochMs);
  return readDismissedArrived().some((e) => e.key === key);
}

function rememberArrivedDismissed(
  entries: { eventId: string; startEpochMs: number; untilMs: number }[],
): void {
  if (!entries.length) return;
  const map = new Map(readDismissedArrived().map((e) => [e.key, e]));
  for (const e of entries) {
    const key = arrivedKey(e.eventId, e.startEpochMs);
    const prev = map.get(key);
    map.set(key, {
      key,
      untilMs: Math.max(Number(prev?.untilMs || 0), e.untilMs),
    });
  }
  writeDismissedArrived([...map.values()]);
}

/**
 * Items still on the Lock Screen: lead window through post-start linger.
 * When dismissArrived is true (app became active), drop rows at/after start.
 */
function collectVisibleItems(
  now: Date,
  opts: { dismissArrived?: boolean; allowEarlyShowMs?: number } = {},
): {
  items: LiveActivityItem[];
  overflow: number;
  phase: "countdown" | "arrived";
  droppedArrivedWindows: LiveActivityWindow[];
} {
  const nowMs = now.getTime();
  const earlyMs = opts.allowEarlyShowMs ?? 0;
  const candidateWindows = collectLiveActivityWindows(now).filter((w) => {
    const early =
      earlyMs > 0 &&
      w.showAtEpochMs > nowMs &&
      w.showAtEpochMs - nowMs <= earlyMs &&
      nowMs < w.endEpochMs;
    if (!w.visibleNow && !early) return false;
    if (isArrivedLiveActivityDismissed(w.eventId, w.startEpochMs) && nowMs >= w.startEpochMs) {
      return false;
    }
    if (opts.dismissArrived && nowMs >= w.startEpochMs) return false;
    return true;
  });

  if (opts.dismissArrived) {
    rememberArrivedDismissed(
      collectLiveActivityWindows(now)
        .filter((w) => nowMs >= w.startEpochMs && nowMs < w.endEpochMs)
        .map((w) => ({
          eventId: w.eventId,
          startEpochMs: w.startEpochMs,
          untilMs: w.endEpochMs,
        })),
    );
  }

  const windows = candidateWindows.map((w) => ({
    title: w.title,
    startEpochMs: w.startEpochMs,
    color: w.color,
    eventId: w.eventId,
    endEpochMs: w.endEpochMs,
  }));

  const { items, overflow, droppedArrived } = selectLiveActivityRows(
    windows,
    nowMs,
    MAX_ITEMS,
  );
  const droppedArrivedWindows = candidateWindows.filter((w) =>
    droppedArrived.some(
      (d) => d.startEpochMs === w.startEpochMs && d.title === w.title,
    ),
  );
  if (droppedArrivedWindows.length) {
    rememberArrivedDismissed(
      droppedArrivedWindows.map((w) => ({
        eventId: w.eventId,
        startEpochMs: w.startEpochMs,
        untilMs: w.endEpochMs,
      })),
    );
  }

  const anyCounting = items.some((w) => nowMs < w.startEpochMs);
  const locale = currentLocale();
  return {
    items: items.map(({ title, startEpochMs, color }) => ({
      title,
      startEpochMs,
      color,
      statusText: formatLaStatusText(startEpochMs, locale, nowMs),
    })),
    overflow,
    phase: anyCounting ? "countdown" : "arrived",
    droppedArrivedWindows,
  };
}

/** Milliseconds until the next Live Activity window opens, starts, or ends. */
export function msUntilNextLiveActivityBoundary(from = new Date()): number | null {
  const now = from.getTime();
  let nextMs: number | null = null;

  for (const w of collectLiveActivityWindows(from)) {
    for (const boundary of [w.showAtEpochMs, w.startEpochMs, w.endEpochMs]) {
      if (boundary > now) {
        nextMs = nextMs === null ? boundary : Math.min(nextMs, boundary);
      }
    }
  }

  if (nextMs === null) return null;
  return Math.max(nextMs - now + 300, 1000);
}

let boundaryTimer: ReturnType<typeof setTimeout> | undefined;

function scheduleNextBoundary(): void {
  clearTimeout(boundaryTimer);
  const ms = msUntilNextLiveActivityBoundary();
  if (ms === null) return;
  boundaryTimer = setTimeout(() => {
    void refreshLiveActivities().finally(scheduleNextBoundary);
  }, ms);
}

export function scheduleLiveActivityBoundaries(): void {
  if (!isLiveActivitySupported()) return;
  scheduleNextBoundary();
}

export function stopLiveActivityBoundaries(): void {
  if (boundaryTimer) clearTimeout(boundaryTimer);
  boundaryTimer = undefined;
}

/** Next refresh should hide arrived rows (user opened the app). */
export function setLiveActivityDismissArrivedOnRefresh(value: boolean): void {
  preferDismissArrived = value;
}

export type LiveActivityLocalStatus = {
  supported: boolean;
  systemEnabled: boolean | null;
  activeCount: number;
  lastError: string | null;
};

let lastLocalError: string | null = null;
let lastSystemEnabled: boolean | null = null;
let lastActiveCount = 0;
let demoUntilMs = 0;
let demoEndTimer: ReturnType<typeof setTimeout> | undefined;
let refreshInFlight: Promise<void> | null = null;
let refreshQueuedOpts: {
  dismissArrived?: boolean;
  allowEarlyShowMs?: number;
} | null = null;
let lastVisibleItemKeys = new Set<string>();

export function isDemoLiveActivityActive(): boolean {
  return Date.now() < demoUntilMs;
}

export function isEventOnLocalLiveActivity(title: string, startEpochMs: number): boolean {
  return lastVisibleItemKeys.has(`${title}|${startEpochMs}`);
}

function setVisibleItemKeys(items: LiveActivityItem[]): void {
  lastVisibleItemKeys = new Set(items.map((i) => `${i.title}|${i.startEpochMs}`));
}

export function getLiveActivityLocalStatus(): LiveActivityLocalStatus {
  return {
    supported: isLiveActivitySupported(),
    systemEnabled: lastSystemEnabled,
    activeCount: lastActiveCount,
    lastError: lastLocalError,
  };
}

/**
 * Short Lock Screen demo. Primes ActivityKit / push-to-start after reinstall.
 * Apple has no requestPermissions() for Live Activities — starting one is the way.
 */
export async function startDemoLiveActivity(opts?: {
  title?: string;
  durationMs?: number;
}): Promise<{ ok: boolean; systemEnabled: boolean }> {
  if (!isLiveActivitySupported()) return { ok: false, systemEnabled: false };

  try {
    const { enabled } = await LiveActivities.areEnabled();
    lastSystemEnabled = enabled;
    if (!enabled) {
      lastLocalError =
        "Live Activities are off for Essences in iOS Settings → Essences → Live Activities";
      return { ok: false, systemEnabled: false };
    }
  } catch (err) {
    lastLocalError = err instanceof Error ? err.message : String(err);
    return { ok: false, systemEnabled: false };
  }

  const now = Date.now();
  const durationMs = opts?.durationMs ?? 45_000;
  const locale = currentLocale();
  const title =
    opts?.title || (locale === "ja" ? "デモ：Essences" : "Demo: Essences");

  try {
    await LiveActivities.startOrUpdate({
      locale,
      items: [
        {
          title,
          startEpochMs: now + 10 * 60_000,
          color: "orange",
          statusText: formatLaStatusText(now + 10 * 60_000, locale, now),
        },
      ],
      overflow: 0,
      endEpochMs: now + durationMs + 5_000,
      phase: "countdown",
    });
    lastLocalError = null;
    lastActiveCount = 1;
    demoUntilMs = now + durationMs;
    clearTimeout(demoEndTimer);
    demoEndTimer = setTimeout(() => {
      demoUntilMs = 0;
      void refreshLiveActivities({ dismissArrived: true }).catch(() => {});
    }, durationMs);
    return { ok: true, systemEnabled: true };
  } catch (err) {
    lastLocalError = err instanceof Error ? err.message : String(err);
    return { ok: false, systemEnabled: true };
  }
}

export async function refreshLiveActivities(
  opts: { dismissArrived?: boolean; allowEarlyShowMs?: number } = {},
): Promise<void> {
  if (!isLiveActivitySupported()) return;
  if (refreshInFlight) {
    refreshQueuedOpts = { ...(refreshQueuedOpts || {}), ...opts };
    await refreshInFlight;
    return;
  }
  refreshInFlight = (async () => {
    let next = opts;
    for (;;) {
      await refreshLiveActivitiesInner(next);
      if (!refreshQueuedOpts) break;
      next = refreshQueuedOpts;
      refreshQueuedOpts = null;
    }
  })().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

async function refreshLiveActivitiesInner(
  opts: { dismissArrived?: boolean; allowEarlyShowMs?: number },
): Promise<void> {
  if (!canScheduleLiveActivities()) {
    if (!isDemoLiveActivityActive()) {
      try {
        await LiveActivities.endAll();
        lastActiveCount = 0;
        lastVisibleItemKeys = new Set();
        lastLocalError = null;
        void import("./la-remote")
          .then((m) => m.clearLocalLiveActivityRemoteState())
          .catch(() => {});
      } catch {
        /* ignore */
      }
    }
    scheduleNextBoundary();
    return;
  }

  const dismissArrived = opts.dismissArrived ?? preferDismissArrived;
  if (opts.dismissArrived) preferDismissArrived = true;

  try {
    const { enabled } = await LiveActivities.areEnabled();
    lastSystemEnabled = enabled;
    if (!enabled) {
      lastLocalError =
        "Live Activities are off for Essences in iOS Settings → Essences → Live Activities";
      // Tear down Lock Screen cards + stop remote starts while system is off.
      if (!isDemoLiveActivityActive()) {
        try {
          await LiveActivities.endAll();
          lastActiveCount = 0;
          lastVisibleItemKeys = new Set();
        } catch {
          /* ignore */
        }
        void import("./la-remote")
          .then((m) =>
            m.clearLocalLiveActivityRemoteState().then(() =>
              m.syncLiveActivitySchedulesRemote(),
            ),
          )
          .catch(() => {});
      }
      scheduleNextBoundary();
      return;
    }
  } catch (err) {
    lastLocalError = err instanceof Error ? err.message : String(err);
    scheduleNextBoundary();
    return;
  }

  // Demo owns the single ActivityKit slot — do not overwrite with calendar rows
  // while the short tutorial demo is still the intentional Lock Screen card.
  // If the user already has calendar rows that should show, end the demo and
  // continue so a real event is not stuck behind a silent "local-owned" ensure.
  if (isDemoLiveActivityActive()) {
    const nowCheck = new Date();
    const preview = collectVisibleItems(nowCheck, {
      dismissArrived,
      allowEarlyShowMs: opts.allowEarlyShowMs,
    });
    if (preview.items.length === 0) {
      scheduleNextBoundary();
      return;
    }
    demoUntilMs = 0;
    clearTimeout(demoEndTimer);
  }

  const now = new Date();
  const {
    items: visible,
    overflow,
    phase,
    droppedArrivedWindows,
  } = collectVisibleItems(now, {
    dismissArrived,
    allowEarlyShowMs: opts.allowEarlyShowMs,
  });
  const dismissedNow =
    !!opts.dismissArrived || droppedArrivedWindows.length > 0;
  const isNewLocalCard = lastActiveCount <= 0 && visible.length > 0;
  lastActiveCount = visible.length;
  setVisibleItemKeys(visible);

  if (visible.length === 0) {
    lastVisibleItemKeys = new Set();
    try {
      await LiveActivities.endAll();
      lastLocalError = null;
      lastActiveCount = 0;
      void import("./la-remote")
        .then((m) =>
          m.clearLocalLiveActivityRemoteState().then(() =>
            m.syncLiveActivitySchedulesRemote(),
          ),
        )
        .catch(() => {});
    } catch {
      /* ignore */
    }
    scheduleNextBoundary();
    void rescheduleLiveActivityWakes();
    return;
  }

  const items = visible;
  // Keep the Activity alive until the last *shown* row's arrived linger ends.
  const matchingWindows = collectLiveActivityWindows(now).filter((w) =>
    items.some((v) => v.startEpochMs === w.startEpochMs && v.title === w.title),
  );
  const endEpochMs =
    matchingWindows.length > 0
      ? Math.max(...matchingWindows.map((w) => w.endEpochMs))
      : (items[0]?.startEpochMs ?? now.getTime()) + LIVE_ACTIVITY_ARRIVED_MS;
  // Only nudge a tiny bit if end is already past (ActivityKit rejects staleDate ≤ now).
  const safeEndEpochMs = Math.max(endEpochMs, now.getTime() + 1_500);

  try {
    await LiveActivities.startOrUpdate({
      locale: currentLocale(),
      items,
      overflow,
      endEpochMs: safeEndEpochMs,
      phase,
    });
    lastLocalError = null;
    // Publish card window so kill-path UPDATEs this Activity instead of
    // treating a stale token as success (or skipping PTS when there is no card).
    try {
      const remote = await import("./la-remote");
      let appActive = true;
      try {
        const { App } = await import("@capacitor/app");
        appActive = (await App.getState()).isActive;
      } catch {
        /* assume active */
      }
      await remote.markLocalCalendarLiveActivity({
        endEpochMs: safeEndEpochMs,
        claimPresentation: isNewLocalCard && appActive,
      });
      // Always sync after open-app dismiss / overflow-evict so remote kill-path
      // cannot resurrect "予定時間になりました".
      if (dismissedNow) {
        await remote.syncLiveActivitySchedulesRemote();
      }
      if (isNewLocalCard) {
        // Foreground: one Capacitor haptic + claim device presentation so remote
        // PTS/alert will stay silent. Background: FCM presentation alert only.
        if (appActive) {
          const { liveActivityStartHaptic } = await import("./haptics");
          void liveActivityStartHaptic();
        }
        await remote.requestLiveActivityPresentationAlert().catch(() => {});
      }
    } catch {
      /* ignore */
    }
  } catch (err) {
    lastLocalError = err instanceof Error ? err.message : String(err);
    console.warn("[LiveActivity] startOrUpdate failed:", err);
  }

  scheduleNextBoundary();
  void rescheduleLiveActivityWakes();
}

/**
 * Cancel leftover LA wake local-notifications from older builds.
 * We no longer schedule them: blank banners showed on Lock Screen, and firing
 * at showAt caused a local Activity.request racing remote push-to-start
 * (duplicate cards, only one counting down). Kill/lock start is FCM-only.
 */
export async function rescheduleLiveActivityWakes(): Promise<void> {
  if (!isLiveActivitySupported()) return;
  try {
    const pending = await LocalNotifications.getPending();
    const laPending = pending.notifications.filter(
      (n) => n.id >= LA_NOTIF_ID_BASE && n.id <= LA_NOTIF_ID_MAX,
    );
    if (laPending.length) {
      await LocalNotifications.cancel({
        notifications: laPending.map((n) => ({ id: n.id })),
      });
    }
    try {
      const delivered = await LocalNotifications.getDeliveredNotifications();
      const laDelivered = delivered.notifications.filter(
        (n) => n.id >= LA_NOTIF_ID_BASE && n.id <= LA_NOTIF_ID_MAX,
      );
      if (laDelivered.length) {
        await LocalNotifications.removeDeliveredNotifications({
          notifications: laDelivered,
        });
      }
    } catch {
      /* older plugin / platform */
    }
  } catch (err) {
    console.warn("[LiveActivity] rescheduleLiveActivityWakes cleanup failed:", err);
  }
}

export { currentLocale, LIVE_ACTIVITY_ARRIVED_MS };
