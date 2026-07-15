import { Capacitor, registerPlugin } from "@capacitor/core";
import {
  loadEvents,
  liveActivityLeadMinutes,
  upcomingOccurrenceStarts,
} from "./events-store";

/** Up to this many events are shown inside a single Live Activity. */
const MAX_ITEMS = 3;

export interface LiveActivityItem {
  title: string;
  startEpochMs: number;
  color: string;
}

export interface LiveActivityPayload {
  locale: "en" | "ja";
  items: LiveActivityItem[];
  overflow: number;
}

export interface LiveActivitiesPlugin {
  areEnabled(): Promise<{ enabled: boolean }>;
  startOrUpdate(payload: LiveActivityPayload): Promise<{ activityId: string | null }>;
  endAll(): Promise<void>;
}

export const LiveActivities = registerPlugin<LiveActivitiesPlugin>("LiveActivities");

function isIOS(): boolean {
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

/**
 * Computes events currently inside their Live Activity lead window and updates
 * the Live Activity accordingly. Ends the activity when none are active.
 *
 * NOTE: iOS only allows starting a Live Activity from the foreground (without a
 * push server). Call this on app launch and on foreground resume.
 */
export async function refreshLiveActivities(): Promise<void> {
  if (!isIOS()) return;

  // Guard: check if the user has Live Activities enabled in iOS Settings.
  try {
    const { enabled } = await LiveActivities.areEnabled();
    if (!enabled) return;
  } catch {
    return;
  }

  const now = new Date();
  const active: LiveActivityItem[] = [];

  for (const event of loadEvents()) {
    if (!event.liveActivity) continue;
    const leadMin = liveActivityLeadMinutes(event.liveActivityLead);
    const [next] = upcomingOccurrenceStarts(event, now, 2, 1);
    if (!next) continue;
    const windowStart = next.getTime() - leadMin * 60_000;
    if (now.getTime() >= windowStart && now.getTime() < next.getTime()) {
      active.push({
        title: event.title,
        startEpochMs: next.getTime(),
        color: event.color || "blue",
      });
    }
  }

  active.sort((a, b) => a.startEpochMs - b.startEpochMs);

  if (active.length === 0) {
    try { await LiveActivities.endAll(); } catch { /* ignore */ }
    return;
  }

  const items = active.slice(0, MAX_ITEMS);
  const overflow = active.length - items.length;

  try {
    await LiveActivities.startOrUpdate({
      locale: currentLocale(),
      items,
      overflow,
    });
  } catch {
    /* Live Activities unavailable or rejected — ignore */
  }
}
