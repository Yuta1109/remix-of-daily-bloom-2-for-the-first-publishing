import { useCallback, useRef } from "react";

/** While the user scrolls inside the inner list, lock outer page scroll. */
export function useNestedScrollLock() {
  const outerRef = useRef<HTMLDivElement>(null);
  const locked = useRef(false);

  const lockOuter = useCallback(() => {
    if (locked.current || !outerRef.current) return;
    locked.current = true;
    outerRef.current.style.overflow = "hidden";
  }, []);

  const unlockOuter = useCallback(() => {
    if (!locked.current || !outerRef.current) return;
    locked.current = false;
    outerRef.current.style.overflow = "";
  }, []);

  const innerProps = {
    onTouchStart: lockOuter,
    onTouchEnd: unlockOuter,
    onTouchCancel: unlockOuter,
    onMouseDown: lockOuter,
    onMouseUp: unlockOuter,
    onMouseLeave: unlockOuter,
  };

  return { outerRef, innerProps };
}
