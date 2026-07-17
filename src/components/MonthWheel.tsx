import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { tickHaptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";

const GAP_PX = 8;
const PEEK_PX = 88;
const SNAP_RATIO = 0.22;
const VELOCITY_THRESHOLD = 0.35; // px/ms

interface Props {
  /** Stable key for the currently selected month (e.g. "2026-7"). */
  monthKey: string;
  disabled?: boolean;
  onMonthStep: (delta: -1 | 1) => void;
  /** Fired when the user starts dragging the month wheel. */
  onInteractionStart?: () => void;
  /** Render a month panel. `index` is -1 | 0 | 1 relative to the selected month. */
  children: (index: -1 | 0 | 1, dims: { height: number; faded: boolean }) => ReactNode;
}

/**
 * Clock-app style vertical month roulette.
 * Finger tracks 1:1, snaps with inertia, haptics on detent, adjacent months peek.
 * Avoids scroll-snap remount races that blanked the destination month.
 */
export function MonthWheel({
  monthKey,
  disabled,
  onMonthStep,
  onInteractionStart,
  children,
}: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [viewportH, setViewportH] = useState(0);
  const [offset, setOffset] = useState(0);
  const [animating, setAnimating] = useState(false);
  const [dragging, setDragging] = useState(false);

  const offsetRef = useRef(0);
  const animatingRef = useRef(false);
  const draggingRef = useRef(false);
  const startYRef = useRef(0);
  const startOffsetRef = useRef(0);
  const lastYRef = useRef(0);
  const lastTRef = useRef(0);
  const velocityRef = useRef(0);
  const tickIndexRef = useRef(0);
  const rafRef = useRef<number>();
  const strideRef = useRef(0);
  const disabledRef = useRef(!!disabled);
  const onMonthStepRef = useRef(onMonthStep);
  const onInteractionStartRef = useRef(onInteractionStart);
  onInteractionStartRef.current = onInteractionStart;
  const interactionNotifiedRef = useRef(false);

  const itemH = Math.max(0, viewportH - PEEK_PX * 2);
  const stride = itemH + GAP_PX;
  strideRef.current = stride;
  disabledRef.current = !!disabled;
  onMonthStepRef.current = onMonthStep;

  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const measure = () => setViewportH(el.clientHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    cancelAnimationFrame(rafRef.current!);
    animatingRef.current = false;
    draggingRef.current = false;
    offsetRef.current = 0;
    tickIndexRef.current = 0;
    setOffset(0);
    setAnimating(false);
    setDragging(false);
  }, [monthKey]);

  const setOffsetBoth = useCallback((v: number) => {
    offsetRef.current = v;
    setOffset(v);
  }, []);

  const animateTo = useCallback(
    (target: number, then?: () => void) => {
      cancelAnimationFrame(rafRef.current!);
      animatingRef.current = true;
      setAnimating(true);

      const from = offsetRef.current;
      const dist = target - from;
      if (Math.abs(dist) < 0.5) {
        setOffsetBoth(target);
        animatingRef.current = false;
        setAnimating(false);
        then?.();
        return;
      }

      const duration = Math.min(320, Math.max(180, Math.abs(dist) * 0.55));
      const t0 = performance.now();

      const step = (now: number) => {
        const t = Math.min(1, (now - t0) / duration);
        const eased = 1 - (1 - t) ** 3;
        setOffsetBoth(from + dist * eased);
        if (t < 1) {
          rafRef.current = requestAnimationFrame(step);
        } else {
          animatingRef.current = false;
          setAnimating(false);
          then?.();
        }
      };
      rafRef.current = requestAnimationFrame(step);
    },
    [setOffsetBoth]
  );

  const commitStep = useCallback(
    (delta: -1 | 1) => {
      const s = strideRef.current;
      const target = delta === -1 ? s : -s;
      animateTo(target, () => {
        onMonthStepRef.current(delta);
        setOffsetBoth(0);
        tickIndexRef.current = 0;
      });
    },
    [animateTo, setOffsetBoth]
  );

  const finishGesture = useCallback(() => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setDragging(false);

    const s = strideRef.current;
    const o = offsetRef.current;
    const v = velocityRef.current;
    let delta: -1 | 1 | 0 = 0;

    if (v > VELOCITY_THRESHOLD || o > s * SNAP_RATIO) delta = -1;
    else if (v < -VELOCITY_THRESHOLD || o < -s * SNAP_RATIO) delta = 1;

    if (delta === 0 || s <= 0) {
      animateTo(0);
      tickIndexRef.current = 0;
      return;
    }

    void tickHaptic();
    commitStep(delta);
  }, [animateTo, commitStep]);

  // Non-passive touch listeners so preventDefault works during drag.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    const onStart = (e: TouchEvent) => {
      if (disabledRef.current || animatingRef.current || strideRef.current <= 0) return;
      const t = e.touches[0];
      if (!t) return;
      cancelAnimationFrame(rafRef.current!);
      animatingRef.current = false;
      setAnimating(false);
      draggingRef.current = true;
      setDragging(true);
      interactionNotifiedRef.current = false;
      startYRef.current = t.clientY;
      startOffsetRef.current = offsetRef.current;
      lastYRef.current = t.clientY;
      lastTRef.current = performance.now();
      velocityRef.current = 0;
      tickIndexRef.current = Math.round(offsetRef.current / strideRef.current);
    };

    const onMove = (e: TouchEvent) => {
      if (!draggingRef.current || strideRef.current <= 0) return;
      const t = e.touches[0];
      if (!t) return;
      e.preventDefault();

      // Only treat as "calendar scroll" after a real drag — taps must still open day sheets.
      if (
        !interactionNotifiedRef.current &&
        Math.abs(t.clientY - startYRef.current) > 10
      ) {
        interactionNotifiedRef.current = true;
        onInteractionStartRef.current?.();
      }

      const now = performance.now();
      const dy = t.clientY - lastYRef.current;
      const dt = Math.max(1, now - lastTRef.current);
      velocityRef.current = dy / dt;
      lastYRef.current = t.clientY;
      lastTRef.current = now;

      const s = strideRef.current;
      let next = startOffsetRef.current + (t.clientY - startYRef.current);
      const limit = s * 1.15;
      if (next > limit) next = limit + (next - limit) * 0.25;
      if (next < -limit) next = -limit + (next + limit) * 0.25;

      setOffsetBoth(next);

      const tick = Math.round(next / s);
      if (tick !== tickIndexRef.current) {
        tickIndexRef.current = tick;
        void tickHaptic();
      }
    };

    const onEnd = () => finishGesture();

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, [finishGesture, setOffsetBoth]);

  const translateY = PEEK_PX - stride + offset;

  return (
    <div
      ref={viewportRef}
      className={cn(
        "h-full overflow-hidden touch-none select-none relative",
        disabled && "pointer-events-none"
      )}
    >
      {itemH > 0 && (
        <div
          className="will-change-transform"
          style={{
            transform: `translate3d(0, ${translateY}px, 0)`,
          }}
        >
          {([-1, 0, 1] as const).map((idx) => {
            const center = idx * stride;
            const dist = Math.abs(center - offset) / Math.max(stride, 1);
            const faded = dist > 0.15;
            const scale = 1 - Math.min(dist * 0.035, 0.05);
            const opacity = 1 - Math.min(dist * 0.4, 0.45);

            return (
              <div
                key={idx}
                className="px-0.5"
                style={{
                  height: itemH,
                  marginBottom: idx < 1 ? GAP_PX : 0,
                  transform: `scale(${scale})`,
                  opacity,
                  transition: dragging || animating ? "none" : "opacity 120ms ease-out",
                }}
              >
                {children(idx, { height: itemH, faded })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
