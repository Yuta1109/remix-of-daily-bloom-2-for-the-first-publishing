import { Capacitor, registerPlugin } from "@capacitor/core";
import {
  loadEvents,
  liveActivityLeadMinutes,
  upcomingOccurrenceStarts,
} from "./events-store";

/** Up to this many events are shown inside a single Live Activity. */
const MAX_ITEMS = 3;

export interface LiveActivityItem {
  /** Event title. */
  title: string;
  /** Event start time as epoch milliseconds (used for the countdown). */
  startEpochMs: number;
  /** Color token key (blue/green/orange/...). */
  color: string;
}

export interface LiveActivityPayload {
  /** UI language, kept in sync with the in-app setting. */
  locale: "en" | "ja";
  /** Nearest upcoming events, soonest first (max 3). */
  items: LiveActivityItem[];
  /** How many additional events are hidden beyond the shown ones. */
  overflow: number;
}

export interface LiveActivitiesPlugin {
  /** Whether the user has Live Activities enabled for this app in iOS Settings. */
  areEnabled(): Promise<{ enabled: boolean }>;
  /** Starts a new Live Activity or updates the existing one. */
  startOrUpdate(payload: LiveActivityPayload): Promise<{ activityId: string | null }>;
  /** Ends all Live Activities started by this app. */
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
 * Computes the events currently inside their Live Activity lead window
 * ([start - lead, start)) and pushes up to 3 of them (soonest first) into a
 * single Live Activity. Ends the activity when none are active.
 *
 * NOTE: iOS only lets an app start a Live Activity from the foreground (without
 * a push server), so this runs on app launch and whenever the app resumes.
 */
export async function refreshLiveActivities(): Promise<void> {
  if (!isIOS()) return;

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
    await LiveActivities.endAll();
    return;
  }

  const items = active.slice(0, MAX_ITEMS);
  const overflow = active.length - items.length;

  await LiveActivities.startOrUpdate({
    locale: currentLocale(),
    items,
    overflow,
  });
}
