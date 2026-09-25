import { useEffect, useRef } from "react";
import { isHorizontalBackSwipe } from "@/lib/horizontal-back-swipe";

/** Left-edge horizontal swipe. Vertical and diagonal gestures are ignored. */
export function useEdgeSwipeBack(onBack: () => void, enabled = true) {
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  useEffect(() => {
    if (!enabled) return;
    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t || t.clientX > 28) return;
      startRef.current = { x: t.clientX, y: t.clientY };
    };
    const onEnd = (e: TouchEvent) => {
      const start = startRef.current;
      startRef.current = null;
      if (!start) return;
      const t = e.changedTouches[0];
      if (!t) return;
      if (isHorizontalBackSwipe(start.x, start.y, t.clientX, t.clientY)) onBackRef.current();
    };
    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchend", onEnd);
    };
  }, [enabled]);
}
