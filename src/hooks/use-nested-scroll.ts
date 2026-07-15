import { useCallback, useRef, type TouchEvent } from "react";

/** Lock outer scroll only while actively scrolling inside the inner list (5+ items). */
export function useNestedScrollLock(enabled: boolean) {
  const outerRef = useRef<HTMLDivElement>(null);
  const locked = useRef(false);
  const touchStartY = useRef(0);

  const lockOuter = useCallback(() => {
    if (!enabled || locked.current || !outerRef.current) return;
    locked.current = true;
    outerRef.current.style.overflow = "hidden";
  }, [enabled]);

  const unlockOuter = useCallback(() => {
    if (!locked.current || !outerRef.current) return;
    locked.current = false;
    outerRef.current.style.overflow = "";
  }, []);

  const innerProps = enabled
    ? {
        onTouchStart: (e: TouchEvent) => {
          touchStartY.current = e.touches[0]?.clientY ?? 0;
        },
        onTouchMove: (e: TouchEvent) => {
          const el = e.currentTarget as HTMLElement;
          if (el.scrollHeight <= el.clientHeight) return;
          const y = e.touches[0]?.clientY ?? touchStartY.current;
          if (Math.abs(y - touchStartY.current) > 4) lockOuter();
        },
        onTouchEnd: unlockOuter,
        onTouchCancel: unlockOuter,
      }
    : {};

  return { outerRef, innerProps };
}
