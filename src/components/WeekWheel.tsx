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
const PEEK_PX = 12;
const SNAP_RATIO = 0.22;
const VELOCITY_THRESHOLD = 0.35;
const LOCK_THRESHOLD_PX = 10;

interface Props {
  weekKey: string;
  disabled?: boolean;
  onWeekStep: (delta: -1 | 1) => void;
  children: (index: -1 | 0 | 1, dims: { width: number; faded: boolean }) => ReactNode;
}

/**
 * Horizontal week roulette (mirrors MonthWheel haptics / snap feel).
 * Direction lock avoids fighting vertical scroll inside the active week panel.
 */
export function WeekWheel({ weekKey, disabled, onWeekStep, children }: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [viewportW, setViewportW] = useState(0);
  const [offset, setOffset] = useState(0);
  const [animating, setAnimating] = useState(false);
  const [dragging, setDragging] = useState(false);

  const offsetRef = useRef(0);
  const animatingRef = useRef(false);
  const draggingRef = useRef(false);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const startOffsetRef = useRef(0);
  const lastXRef = useRef(0);
  const lastTRef = useRef(0);
  const velocityRef = useRef(0);
  const tickIndexRef = useRef(0);
  const rafRef = useRef<number>();
  const strideRef = useRef(0);
  const disabledRef = useRef(!!disabled);
  const onWeekStepRef = useRef(onWeekStep);
  const axisLockRef = useRef<"none" | "x" | "y">("none");

  const itemW = Math.max(0, viewportW - PEEK_PX * 2);
  const stride = itemW + GAP_PX;
  strideRef.current = stride;
  disabledRef.current = !!disabled;
  onWeekStepRef.current = onWeekStep;

  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const measure = () => setViewportW(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    cancelAnimationFrame(rafRef.current!);
    animatingRef.current = false;
    draggingRef.current = false;
    axisLockRef.current = "none";
    offsetRef.current = 0;
    tickIndexRef.current = 0;
    setOffset(0);
    setAnimating(false);
    setDragging(false);
  }, [weekKey]);

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
    [setOffsetBoth],
  );

  const commitStep = useCallback(
    (delta: -1 | 1) => {
      const s = strideRef.current;
      const target = delta === -1 ? s : -s;
      animateTo(target, () => {
        onWeekStepRef.current(delta);
        setOffsetBoth(0);
        tickIndexRef.current = 0;
      });
    },
    [animateTo, setOffsetBoth],
  );

  const finishGesture = useCallback(() => {
    if (!draggingRef.current) return;
    const lock = axisLockRef.current;
    draggingRef.current = false;
    setDragging(false);
    axisLockRef.current = "none";

    if (lock === "y") return;

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
      axisLockRef.current = "none";
      startXRef.current = t.clientX;
      startYRef.current = t.clientY;
      startOffsetRef.current = offsetRef.current;
      lastXRef.current = t.clientX;
      lastTRef.current = performance.now();
      velocityRef.current = 0;
      tickIndexRef.current = Math.round(offsetRef.current / strideRef.current);
    };

    const onMove = (e: TouchEvent) => {
      if (!draggingRef.current || strideRef.current <= 0) return;
      const t = e.touches[0];
      if (!t) return;

      const dx = t.clientX - startXRef.current;
      const dy = t.clientY - startYRef.current;

      if (axisLockRef.current === "none") {
        if (Math.abs(dx) < LOCK_THRESHOLD_PX && Math.abs(dy) < LOCK_THRESHOLD_PX) return;
        axisLockRef.current = Math.abs(dx) >= Math.abs(dy) ? "x" : "y";
      }

      if (axisLockRef.current === "y") {
        draggingRef.current = false;
        setDragging(false);
        axisLockRef.current = "none";
        return;
      }

      e.preventDefault();

      const now = performance.now();
      const moveDx = t.clientX - lastXRef.current;
      const dt = Math.max(1, now - lastTRef.current);
      velocityRef.current = moveDx / dt;
      lastXRef.current = t.clientX;
      lastTRef.current = now;

      const s = strideRef.current;
      let next = startOffsetRef.current + dx;
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

  const translateX = PEEK_PX - stride + offset;

  return (
    <div
      ref={viewportRef}
      className={cn(
        "h-full overflow-hidden select-none relative",
        disabled && "pointer-events-none",
      )}
    >
      {itemW > 0 && (
        <div
          className="h-full flex flex-row will-change-transform"
          style={{
            transform: `translate3d(${translateX}px, 0, 0)`,
            transition: dragging || animating ? "none" : undefined,
          }}
        >
          {([-1, 0, 1] as const).map((idx) => {
            const center = idx * stride;
            const dist = Math.abs(center - offset) / Math.max(stride, 1);
            const faded = dist > 0.15;
            const scale = 1 - Math.min(dist * 0.03, 0.04);
            const opacity = 1 - Math.min(dist * 0.35, 0.4);

            return (
              <div
                key={idx}
                className="shrink-0 h-full px-0.5"
                style={{
                  width: itemW,
                  marginRight: idx < 1 ? GAP_PX : 0,
                  transform: `scale(${scale})`,
                  opacity,
                  transition: dragging || animating ? "none" : "opacity 120ms ease-out",
                }}
              >
                {children(idx, { width: itemW, faded })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
