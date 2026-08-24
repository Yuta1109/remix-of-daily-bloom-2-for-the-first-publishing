import { Capacitor } from "@capacitor/core";
import { LiveActivities } from "./live-activity";

/** Copy text on iOS via native pasteboard; fall back to Clipboard API on web. */
export async function copyText(text: string): Promise<boolean> {
  if (!text) return false;
  try {
    if (Capacitor.isNativePlatform()) {
      const r = await LiveActivities.copyText({ text });
      return r.ok === true;
    }
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
