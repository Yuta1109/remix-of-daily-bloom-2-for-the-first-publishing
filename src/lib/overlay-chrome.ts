import { scheduleNativeGlassSync } from "@/lib/native-glass";

const OVERLAY_CLASS = "overlay-open";
const listeners = new Set<() => void>();

/** Keep status/home safe-area chrome matched to the page background. */
export function setOverlayChrome(active: boolean): void {
  document.documentElement.classList.toggle(OVERLAY_CLASS, active);
  document.body.classList.toggle(OVERLAY_CLASS, active);
  listeners.forEach((listener) => listener());
  scheduleNativeGlassSync();
}

export function isOverlayChromeOpen(): boolean {
  return document.documentElement.classList.contains(OVERLAY_CLASS);
}

export function subscribeOverlayChrome(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
