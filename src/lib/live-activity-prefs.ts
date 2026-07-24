import { Capacitor } from "@capacitor/core";
import { LiveActivities, isLiveActivitySupported } from "./live-activity";

const USER_PREF_KEY = "essences-la-user-enabled";
const ONBOARDING_KEY = "essences-la-onboarding-done";
const PERMISSION_OUTCOME_KEY = "essences-la-permission-outcome";

export type LiveActivityPermissionOutcome =
  | "unknown"
  | "allowed"
  | "denied"
  | "skipped";

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

export function getLiveActivityPermissionOutcome(): LiveActivityPermissionOutcome {
  try {
    const v = localStorage.getItem(PERMISSION_OUTCOME_KEY);
    if (v === "allowed" || v === "denied" || v === "skipped" || v === "unknown") {
      return v;
    }
  } catch {
    /* ignore */
  }
  return "unknown";
}

export function setLiveActivityPermissionOutcome(
  outcome: LiveActivityPermissionOutcome,
): void {
  try {
    localStorage.setItem(PERMISSION_OUTCOME_KEY, outcome);
  } catch {
    /* ignore */
  }
}

/** Show Settings step-demo when user never confirmed Always Allow. */
export function shouldOfferLiveActivityPermissionDemo(): boolean {
  const outcome = getLiveActivityPermissionOutcome();
  return outcome === "unknown" || outcome === "denied" || outcome === "skipped";
}

export type LiveActivityGate = {
  supported: boolean;
  /** ActivityAuthorizationInfo().areActivitiesEnabled */
  systemEnabled: boolean;
  /** iOS 16.2+ frequent push / “Always Allow” style grant when available */
  frequentPushesEnabled: boolean;
  activityCount: number;
  userEnabled: boolean;
  /** Both system + user must be on for LA to run. */
  effective: boolean;
};

export async function getLiveActivityGate(): Promise<LiveActivityGate> {
  const userEnabled = getLiveActivityUserEnabled();
  if (!isLiveActivitySupported()) {
    return {
      supported: false,
      systemEnabled: false,
      frequentPushesEnabled: false,
      activityCount: 0,
      userEnabled,
      effective: false,
    };
  }
  let systemEnabled = false;
  let frequentPushesEnabled = false;
  let activityCount = 0;
  try {
    if (typeof LiveActivities.getAuthState === "function") {
      const auth = await LiveActivities.getAuthState();
      systemEnabled = !!auth.enabled;
      frequentPushesEnabled = !!auth.frequentPushesEnabled;
      activityCount = Number(auth.activityCount || 0);
    } else {
      const { enabled } = await LiveActivities.areEnabled();
      systemEnabled = !!enabled;
      const local = await LiveActivities.getTokenDebugInfo().catch(() => null);
      activityCount = Number(local?.activeActivityCount || 0);
    }
  } catch {
    systemEnabled = false;
  }
  return {
    supported: true,
    systemEnabled,
    frequentPushesEnabled,
    activityCount,
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
