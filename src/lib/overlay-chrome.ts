const OVERLAY_CLASS = "overlay-open";

export function setOverlayChrome(active: boolean): void {
  document.documentElement.classList.toggle(OVERLAY_CLASS, active);
  document.body.classList.toggle(OVERLAY_CLASS, active);
}
