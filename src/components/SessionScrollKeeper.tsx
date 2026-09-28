import { useLayoutEffect } from "react";
import { useLocation } from "react-router-dom";
import {
  recallSessionScroll,
  rememberSessionScroll,
  sessionAreaForPath,
} from "@/lib/session-nav";

/**
 * Keeps `.app-shell-scroll` where the user left it when a route remounts.
 * The element is captured in this effect so a later page cannot overwrite
 * the saved offset with 0.
 */
export function SessionScrollKeeper() {
  const location = useLocation();
  const pathname = location.pathname;
  const search = location.search;

  useLayoutEffect(() => {
    const area = sessionAreaForPath(pathname);
    const root = document.querySelector<HTMLElement>(".app-shell-scroll");
    if (!area || !root) return;
    const key = `${pathname}${search}`;
    const saved = recallSessionScroll(area, key);
    if (typeof saved === "number") root.scrollTop = saved;
    const frame = window.requestAnimationFrame(() => {
      if (root.isConnected && typeof saved === "number") root.scrollTop = saved;
    });
    const onScroll = () => rememberSessionScroll(area, key, root.scrollTop);
    root.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.cancelAnimationFrame(frame);
      rememberSessionScroll(area, key, root.scrollTop);
      root.removeEventListener("scroll", onScroll);
    };
  }, [pathname, search]);

  return null;
}
