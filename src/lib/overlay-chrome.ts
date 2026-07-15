const OVERLAY_CLASS = "overlay-open";
const OVERLAY_MODAL_CLASS = "overlay-open-modal";

export function setOverlayChrome(active: boolean, variant: "modal" | "drawer" = "drawer"): void {
  document.documentElement.classList.toggle(OVERLAY_CLASS, active);
  document.body.classList.toggle(OVERLAY_CLASS, active);
  document.documentElement.classList.toggle(OVERLAY_MODAL_CLASS, active && variant === "modal");
  document.body.classList.toggle(OVERLAY_MODAL_CLASS, active && variant === "modal");
}
