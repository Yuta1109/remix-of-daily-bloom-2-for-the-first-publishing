import { Capacitor } from "@capacitor/core";
import { LiveActivities, isLiveActivitySupported } from "./live-activity";

const ONBOARDING_KEY = "essences-la-onboarding-done";
const PERMISSION_OUTCOME_KEY = "essences-la-permission-outcome";
const ENABLE_DEMO_KEY = "essences-la-enable-demo-done";
const ENABLE_ALLOWED_KEY = "essences-la-enable-allowed";
/**
 * Set ONLY after Lock Screen demo + allow (tutorial or Settings).
 * Never set from iPhone Settings toggles alone. Never cleared on system off.
 */
const DEMO_PROCESS_DONE_KEY = "essences-la-demo-process-done";

export type LiveActivityPermissionOutcome =
  | "unknown"
  | "allowed"
  | "denied"
  | "skipped";

/**
 * In-app preference — always on. (iOS Settings is the real master switch;
 * the old Settings toggle was misleading and has been removed.)
 */
export function getLiveActivityUserEnabled(): boolean {
  return true;
}

export function setLiveActivityUserEnabled(_enabled: boolean): void {
  /* no-op — kept for call-site compatibility */
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

/** Call only after demo on Lock Screen + Always Allow / live card confirmed. */
export function markLiveActivityEnableAllowed(): void {
  try {
    localStorage.setItem(ENABLE_DEMO_KEY, "true");
    localStorage.setItem(ENABLE_ALLOWED_KEY, "true");
    localStorage.setItem(PERMISSION_OUTCOME_KEY, "allowed");
    localStorage.setItem(DEMO_PROCESS_DONE_KEY, "true");
  } catch {
    /* ignore */
  }
}

/**
 * Tutorial “後で行う”: not demo-done. Clears any in-progress step flags so
 * Settings shows the full 4-step flow. Does not touch DEMO_PROCESS_DONE if it
 * was already earned earlier (shouldn't happen on first defer).
 */
export function markLiveActivityEnableDeferred(): void {
  try {
    localStorage.setItem(PERMISSION_OUTCOME_KEY, "skipped");
    localStorage.removeItem(ENABLE_DEMO_KEY);
    localStorage.removeItem(ENABLE_ALLOWED_KEY);
    // Explicitly ensure defer never counts as demo-done.
    if (localStorage.getItem(DEMO_PROCESS_DONE_KEY) !== "true") {
      localStorage.removeItem(DEMO_PROCESS_DONE_KEY);
    }
  } catch {
    /* ignore */
  }
}

/**
 * True only after the user once completed Lock Screen demo + allow.
 * iPhone Settings on/off alone must never set this.
 */
export function hasCompletedLiveActivityDemoProcess(): boolean {
  try {
    return localStorage.getItem(DEMO_PROCESS_DONE_KEY) === "true";
  } catch {
    return false;
  }
}

/**
 * Clear step 2–3 progress when iOS LA is turned off (so turning back on
 * only checks step 1). Does NOT clear demo-process-done.
 */
export function resetLiveActivityEnableProgress(): void {
  try {
    localStorage.removeItem(ENABLE_DEMO_KEY);
    localStorage.removeItem(ENABLE_ALLOWED_KEY);
    if (!hasCompletedLiveActivityDemoProcess()) {
      const outcome = localStorage.getItem(PERMISSION_OUTCOME_KEY);
      if (outcome !== "skipped") {
        localStorage.setItem(PERMISSION_OUTCOME_KEY, "denied");
      }
    }
  } catch {
    /* ignore */
  }
}

export type LiveActivityEnableMode = "full" | "reenable";

export type LiveActivityEnableProgress = {
  systemOn: boolean;
  demoPresented: boolean;
  allowed: boolean;
  complete: boolean;
  /**
   * full = never finished demo+allow → guided 4 steps
   * reenable = already finished demo once → only turn iPhone Settings back on
   */
  mode: LiveActivityEnableMode;
  /** 1–4 for full mode (next action); 1 when system off in reenable mode */
  currentStep: 1 | 2 | 3 | 4;
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

/** Whether calendar LA sync / local refresh may run (ignores iOS system switch). */
export function canScheduleLiveActivities(): boolean {
  // Mid-flow after allow this session, or durable demo-process-done.
  return (
    hasCompletedLiveActivityDemoProcess() || readStoredEnableFlags().allowed
  );
}

export function getLiveActivityEnableProgress(
  gate: Pick<LiveActivityGate, "systemEnabled">,
): LiveActivityEnableProgress {
  const systemOn = !!gate.systemEnabled;
  const mode: LiveActivityEnableMode = hasCompletedLiveActivityDemoProcess()
    ? "reenable"
    : "full";

  if (mode === "reenable") {
    return {
      systemOn,
      demoPresented: systemOn,
      allowed: systemOn,
      complete: systemOn,
      mode,
      currentStep: systemOn ? 4 : 1,
    };
  }

  // full: only stored flags — never invent from system toggle / frequentPushes
  const flags = readStoredEnableFlags();
  if (!systemOn) {
    return {
      systemOn: false,
      demoPresented: false,
      allowed: false,
      complete: false,
      mode,
      currentStep: 1,
    };
  }
  const demoPresented = flags.demoPresented;
  const allowed = flags.allowed;
  const complete = demoPresented && allowed;
  let currentStep: 1 | 2 | 3 | 4 = 2;
  if (!demoPresented) currentStep = 2;
  else if (!allowed) currentStep = 3;
  else currentStep = 4;
  return {
    systemOn: true,
    demoPresented,
    allowed,
    complete,
    mode,
    currentStep,
  };
}

export function shouldOfferLiveActivityPermissionDemo(
  gate?: Pick<LiveActivityGate, "systemEnabled"> | null,
): boolean {
  if (!gate) return !hasCompletedLiveActivityDemoProcess();
  return !getLiveActivityEnableProgress(gate).complete;
}

export type LiveActivityGate = {
  supported: boolean;
  systemEnabled: boolean;
  frequentPushesEnabled: boolean;
  activityCount: number;
  userEnabled: boolean;
  effective: boolean;
};

export async function getLiveActivityGate(): Promise<LiveActivityGate> {
  if (!isLiveActivitySupported()) {
    return {
      supported: false,
      systemEnabled: false,
      frequentPushesEnabled: false,
      activityCount: 0,
      userEnabled: true,
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

  // System off → clear step 2–3 so turning back on only checks step 1.
  // Keep demo-process-done so Settings can use the simple re-enable path.
  // Never set demo-process-done here.
  if (!systemEnabled) {
    const flags = readStoredEnableFlags();
    if (flags.demoPresented || flags.allowed) {
      resetLiveActivityEnableProgress();
    }
  }

  return {
    supported: true,
    systemEnabled,
    frequentPushesEnabled,
    activityCount,
    userEnabled: true,
    effective: systemEnabled && canScheduleLiveActivities(),
  };
}

/** EventSheet banner: only when iPhone Live Activities are off. */
export function isLiveActivitySystemOff(gate: LiveActivityGate): boolean {
  return gate.supported && !gate.systemEnabled;
}

/** True when LA cannot run (system off or enable steps incomplete). */
export function isLiveActivityBlocked(gate: LiveActivityGate): boolean {
  if (!gate.supported) return false;
  if (!gate.systemEnabled) return true;
  return !getLiveActivityEnableProgress(gate).complete;
}

export function isLiveActivityFullyEnabled(gate: LiveActivityGate): boolean {
  return gate.systemEnabled && getLiveActivityEnableProgress(gate).complete;
}

export function isNativeIos(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
}
