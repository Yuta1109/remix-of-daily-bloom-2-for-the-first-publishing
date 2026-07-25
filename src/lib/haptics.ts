import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";

/** Light tick — Clock-style wheel detent. */
export async function tickHaptic(): Promise<void> {
  try {
    if (Capacitor.isNativePlatform()) {
      await Haptics.impact({ style: ImpactStyle.Light });
    }
  } catch {
    /* unavailable */
  }
}

/** Stronger pulse when a Live Activity starts (local ActivityKit path). */
export async function liveActivityStartHaptic(): Promise<void> {
  try {
    if (!Capacitor.isNativePlatform()) return;
    await Haptics.notification({ type: NotificationType.Success });
  } catch {
    try {
      await Haptics.impact({ style: ImpactStyle.Medium });
    } catch {
      /* unavailable */
    }
  }
}
