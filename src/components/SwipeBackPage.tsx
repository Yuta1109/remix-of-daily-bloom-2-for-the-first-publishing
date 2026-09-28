import { useRef, useState, type ReactNode, type TouchEvent } from "react";
import { isHorizontalBackSwipe } from "@/lib/horizontal-back-swipe";
import { cn } from "@/lib/utils";

interface Props {
  children: ReactNode;
  underlay?: ReactNode;
  onBack: () => void;
  className?: string;
  /** Previous page tracks the finger. Used by Progress detail routes. */
  followFinger?: boolean;
}

export function SwipeBackPage({ children, underlay, onBack, className, followFinger = false }: Props) {
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const tracking = useRef(false);
  const rejected = useRef(false);

  const onTouchStart = (e: TouchEvent) => {
    const t = e.touches[0];
    if (!t || t.clientX > 28) return;
    startX.current = t.clientX;
    startY.current = t.clientY;
    tracking.current = true;
    rejected.current = false;
    setDragging(true);
  };

  const onTouchMove = (e: TouchEvent) => {
    if (!tracking.current || rejected.current) return;
    const t = e.touches[0];
    if (!t) return;
    const deltaX = t.clientX - startX.current;
    const deltaY = t.clientY - startY.current;
    if (Math.abs(deltaY) > 28 || (Math.abs(deltaY) > 12 && Math.abs(deltaY) > Math.abs(deltaX) * 0.3)) {
      rejected.current = true;
      tracking.current = false;
      setDragging(false);
      setDx(0);
      return;
    }
    if (deltaX > 0) setDx(Math.min(deltaX, window.innerWidth));
  };

  const finish = (e: TouchEvent) => {
    const t = e.changedTouches[0];
    const accept =
      tracking.current &&
      !rejected.current &&
      !!t &&
      isHorizontalBackSwipe(startX.current, startY.current, t.clientX, t.clientY);
    tracking.current = false;
    rejected.current = false;
    setDragging(false);
    if (accept) {
      onBack();
      return;
    }
    setDx(0);
  };

  const reduceMotion =
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const settle = reduceMotion ? "none" : "transform var(--glass-duration) var(--glass-spring)";

  return (
    <div className="fixed inset-0 z-[70] overflow-hidden" data-swipe-back="horizontal">
      {underlay && (
        <div
          className="absolute inset-0 overflow-hidden bg-background pointer-events-none"
          data-swipe-underlay="true"
          aria-hidden="true"
          inert=""
          style={
            followFinger
              ? {
                  transform: `translateX(${dx > 0 ? -window.innerWidth * 0.3 * (1 - dx / window.innerWidth) : -window.innerWidth * 0.3}px)`,
                  transition: dragging ? "none" : settle,
                }
              : undefined
          }
        >
          {dragging || dx > 0 ? underlay : null}
        </div>
      )}
      <div
        className={cn("absolute inset-0 bg-background shadow-lg page-scroll", className)}
        data-swipe-page="true"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={finish}
        onTouchCancel={() => {
          tracking.current = false;
          rejected.current = false;
          setDragging(false);
          setDx(0);
        }}
        style={{
          transform: dx > 0 ? `translateX(${dx}px)` : undefined,
          transition: dragging ? "none" : settle,
          borderRadius: dx > 0 ? 16 : 0,
          overflow: dx > 0 ? "hidden" : undefined,
        }}
      >
        {children}
      </div>
    </div>
  );
}
