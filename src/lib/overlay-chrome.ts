const OVERLAY_CLASS = "overlay-open";

/** Keep status/home safe-area chrome matched to the page background. */
export function setOverlayChrome(active: boolean): void {
  document.documentElement.classList.toggle(OVERLAY_CLASS, active);
  document.body.classList.toggle(OVERLAY_CLASS, active);
}
