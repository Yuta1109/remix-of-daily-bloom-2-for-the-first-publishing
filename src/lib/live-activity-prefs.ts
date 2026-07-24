import { Capacitor } from "@capacitor/core";
import { LiveActivities, isLiveActivitySupported } from "./live-activity";

const USER_PREF_KEY = "essences-la-user-enabled";
const ONBOARDING_KEY = "essences-la-onboarding-done";
const PERMISSION_OUTCOME_KEY = "essences-la-permission-outcome";
const ENABLE_DEMO_KEY = "essences-la-enable-demo-done";
const ENABLE_ALLOWED_KEY = "essences-la-enable-allowed";

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

export function markLiveActivityDemoPresented(): void {
  try {
    localStorage.setItem(ENABLE_DEMO_KEY, "true");
  } catch {
    /* ignore */
  }
}

export function markLiveActivityEnableAllowed(): void {
  try {
    localStorage.setItem(ENABLE_ALLOWED_KEY, "true");
    localStorage.setItem(PERMISSION_OUTCOME_KEY, "allowed");
  } catch {
    /* ignore */
  }
}

/** Reset enable progress when iOS LA is turned off (or user denied). */
export function resetLiveActivityEnableProgress(): void {
  try {
    localStorage.removeItem(ENABLE_DEMO_KEY);
    localStorage.removeItem(ENABLE_ALLOWED_KEY);
    localStorage.setItem(PERMISSION_OUTCOME_KEY, "denied");
  } catch {
    /* ignore */
  }
}

export type LiveActivityEnableProgress = {
  /** 1. iPhone Settings → Live Activities on */
  systemOn: boolean;
  /** 2. User presented the Lock Screen demo at least once while system on */
  demoPresented: boolean;
  /** 3. User allowed (Always Allow / frequent pushes) after a demo */
  allowed: boolean;
  /** All steps done — calendar LA may run remotely */
  complete: boolean;
};

export function readStoredEnableFlags(): { demoPresented: boolean; allowed: boolean } {
  try {
    return {
      demoPresented: localStorage.getItem(ENABLE_DEMO_KEY) === "true",
      allowed: localStorage.getItem(ENABLE_ALLOWED_KEY) === "true",
    };
  } catch {
    return { demoPresented: false, allowed: false };
  }
}

export function getLiveActivityEnableProgress(
  gate: Pick<LiveActivityGate, "systemEnabled" | "frequentPushesEnabled">,
): LiveActivityEnableProgress {
  const flags = readStoredEnableFlags();
  const systemOn = !!gate.systemEnabled;
  if (!systemOn) {
    // Off in iPhone Settings → restart from step 1.
    return {
      systemOn: false,
      demoPresented: false,
      allowed: false,
      complete: false,
    };
  }
  const allowed = flags.allowed || !!gate.frequentPushesEnabled;
  const demoPresented = flags.demoPresented || allowed;
  return {
    systemOn: true,
    demoPresented,
    allowed,
    complete: demoPresented && allowed,
  };
}

/** Show Settings step-demo when enable flow is incomplete. */
export function shouldOfferLiveActivityPermissionDemo(
  gate?: Pick<LiveActivityGate, "systemEnabled" | "frequentPushesEnabled"> | null,
): boolean {
  if (!gate) {
    const outcome = getLiveActivityPermissionOutcome();
    return outcome !== "allowed";
  }
  return !getLiveActivityEnableProgress(gate).complete;
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

  // If iOS master switch is off, wipe enable progress so the checklist restarts.
  if (!systemEnabled) {
    const flags = readStoredEnableFlags();
    if (flags.demoPresented || flags.allowed) {
      resetLiveActivityEnableProgress();
    }
  } else if (frequentPushesEnabled) {
    // Already Always-Allow'd (e.g. prior install) — count as fully enabled.
    markLiveActivityEnableAllowed();
    markLiveActivityDemoPresented();
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

/** True when an event with LA on cannot actually start (user, system, or enable steps). */
export function isLiveActivityBlocked(gate: LiveActivityGate): boolean {
  if (!gate.supported) return false;
  if (!gate.effective) return true;
  return !getLiveActivityEnableProgress(gate).complete;
}

/**
 * Calendar / kill-path Live Activities require the full enable checklist
 * (system on → demo → allow), not just the in-app toggle.
 */
export function isLiveActivityFullyEnabled(gate: LiveActivityGate): boolean {
  return gate.effective && getLiveActivityEnableProgress(gate).complete;
}

export function isNativeIos(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
}
