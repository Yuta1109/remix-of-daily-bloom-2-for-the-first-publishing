import type { NavigateFunction } from "react-router-dom";

/** One step back on the existing history stack. Does not jump to a fixed page. */
export function goPageBack(navigate: NavigateFunction, fallback: string): void {
  if (typeof window !== "undefined" && window.history.length > 1) {
    navigate(-1);
    return;
  }
  navigate(fallback);
}
