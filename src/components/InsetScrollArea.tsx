import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type UIEvent,
  type HTMLAttributes,
} from "react";
import { cn } from "@/lib/utils";

interface Props {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  style?: CSSProperties;
  /** Inset from the top of the track (rounded-corner clearance). */
  insetTop?: number;
  /** Inset from the bottom of the track (rounded-corner / home-indicator clearance). */
  insetBottom?: number;
  /** Shorthand: same inset on top and bottom. Overridden by insetTop/insetBottom. */
  inset?: number;
  /** When inside a vaul drawer, disable drawer drag so vertical scroll works. */
  vaulNoDrag?: boolean;
  scrollerProps?: HTMLAttributes<HTMLDivElement>;
}

/**
 * Custom scrollbar that stays inside rounded corners.
 * Native iOS overlay scrollbars ignore CSS track margins — this paints our own.
 */
export function InsetScrollArea({
  children,
  className,
  contentClassName,
  style,
  inset = 16,
  insetTop,
  insetBottom,
  vaulNoDrag = false,
  scrollerProps,
}: Props) {
  const top = insetTop ?? inset;
  const bottom = insetBottom ?? inset;
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState({ top: 0, height: 0, visible: false });

  const updateThumb = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    if (scrollHeight <= clientHeight + 1) {
      setThumb((t) => (t.visible ? { top: 0, height: 0, visible: false } : t));
      return;
    }
    const track = Math.max(0, clientHeight - top - bottom);
    const height = Math.max(24, (clientHeight / scrollHeight) * track);
    const maxTop = track - height;
    const thumbTop =
      top + (scrollTop / (scrollHeight - clientHeight)) * maxTop;
    setThumb({ top: thumbTop, height, visible: true });
  }, [top, bottom]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    updateThumb();
    const ro = new ResizeObserver(updateThumb);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => ro.disconnect();
  }, [updateThumb, children]);

  const onScroll = (e: UIEvent<HTMLDivElement>) => {
    updateThumb();
    scrollerProps?.onScroll?.(e);
  };

  const {
    className: scrollerClassName,
    onScroll: _omitScroll,
    style: scrollerStyle,
    ...restScroller
  } = scrollerProps ?? {};

  return (
    <div
      className={cn("relative min-h-0 flex-1 overflow-hidden", className)}
      style={style}
    >
      <div
        ref={scrollerRef}
        {...restScroller}
        onScroll={onScroll}
        data-vaul-no-drag={vaulNoDrag ? true : undefined}
        className={cn(
          "h-full min-h-0 overflow-y-auto overflow-x-hidden scrollbar-none overscroll-contain",
          contentClassName,
          scrollerClassName
        )}
        style={{
          WebkitOverflowScrolling: "touch",
          ...scrollerStyle,
        }}
      >
        {children}
      </div>
      {thumb.visible && (
        <div
          aria-hidden
          className="pointer-events-none absolute right-1 w-[3px] rounded-full bg-muted-foreground/30"
          style={{ top: thumb.top, height: thumb.height }}
        />
      )}
    </div>
  );
}
