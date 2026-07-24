import { Capacitor } from "@capacitor/core";
import { LiveActivities, isLiveActivitySupported } from "./live-activity";

const USER_PREF_KEY = "essences-la-user-enabled";
const ONBOARDING_KEY = "essences-la-onboarding-done";

/** In-app preference (separate from iOS Live Activities switch). Defaults on. */
export function getLiveActivityUserEnabled(): boolean {
  try {
    return localStorage.getItem(USER_PREF_KEY) !== "false";
  } catch {
    return true;
  }
}

export function setLiveActivityUserEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(USER_PREF_KEY, enabled ? "true" : "false");
  } catch {
    /* ignore */
  }
}

export function isLiveActivityOnboardingDone(): boolean {
  try {
    return localStorage.getItem(ONBOARDING_KEY) === "true";
  } catch {
    return false;
  }
}

export function setLiveActivityOnboardingDone(done = true): void {
  try {
    localStorage.setItem(ONBOARDING_KEY, done ? "true" : "false");
  } catch {
    /* ignore */
  }
}

export type LiveActivityGate = {
  supported: boolean;
  /** ActivityAuthorizationInfo().areActivitiesEnabled */
  systemEnabled: boolean;
  userEnabled: boolean;
  /** Both system + user must be on for LA to run. */
  effective: boolean;
};

export async function getLiveActivityGate(): Promise<LiveActivityGate> {
  if (!isLiveActivitySupported()) {
    return {
      supported: false,
      systemEnabled: false,
      userEnabled: getLiveActivityUserEnabled(),
      effective: false,
    };
  }
  let systemEnabled = false;
  try {
    const { enabled } = await LiveActivities.areEnabled();
    systemEnabled = !!enabled;
  } catch {
    systemEnabled = false;
  }
  const userEnabled = getLiveActivityUserEnabled();
  return {
    supported: true,
    systemEnabled,
    userEnabled,
    effective: systemEnabled && userEnabled,
  };
}

/** True when an event with LA on cannot actually start (user or system off). */
export function isLiveActivityBlocked(gate: LiveActivityGate): boolean {
  return gate.supported && !gate.effective;
}

export function isNativeIos(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
}
