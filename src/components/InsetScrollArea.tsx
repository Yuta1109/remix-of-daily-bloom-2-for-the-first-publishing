import {
  useCallback,
  useEffect,
  useLayoutEffect,
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
  /** How far the scrollbar track is inset from top/bottom (matches rounded corners). */
  inset?: number;
  /** When inside a vaul drawer, keep vertical pans on this scroller. */
  vaulNoDrag?: boolean;
  scrollerProps?: HTMLAttributes<HTMLDivElement>;
}

/**
 * Same design as Today's task list: custom thumb inset from rounded corners.
 * Content is wrapped so height measurement stays accurate.
 */
export function InsetScrollArea({
  children,
  className,
  contentClassName,
  style,
  inset = 16,
  vaulNoDrag = false,
  scrollerProps,
}: Props) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState({ top: 0, height: 0, visible: false });

  const updateThumb = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    if (scrollHeight <= clientHeight + 1) {
      setThumb((t) => (t.visible ? { top: 0, height: 0, visible: false } : t));
      return;
    }
    const track = Math.max(0, clientHeight - inset * 2);
    const height = Math.max(24, (clientHeight / scrollHeight) * track);
    const maxTop = Math.max(0, track - height);
    const range = scrollHeight - clientHeight;
    const top = inset + (range > 0 ? (scrollTop / range) * maxTop : 0);
    setThumb({ top, height, visible: true });
  }, [inset]);

  useLayoutEffect(() => {
    updateThumb();
  }, [updateThumb, children]);

  useEffect(() => {
    const el = scrollerRef.current;
    const content = contentRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => updateThumb());
    ro.observe(el);
    if (content) ro.observe(content);
    return () => ro.disconnect();
  }, [updateThumb, children]);

  // Non-passive touchmove so we can stopPropagation to vaul without blocking scroll.
  useEffect(() => {
    if (!vaulNoDrag) return;
    const el = scrollerRef.current;
    if (!el) return;
    const stop = (e: TouchEvent) => {
      e.stopPropagation();
    };
    el.addEventListener("touchstart", stop, { passive: true });
    el.addEventListener("touchmove", stop, { passive: true });
    return () => {
      el.removeEventListener("touchstart", stop);
      el.removeEventListener("touchmove", stop);
    };
  }, [vaulNoDrag, children]);

  const onScroll = (e: UIEvent<HTMLDivElement>) => {
    updateThumb();
    scrollerProps?.onScroll?.(e);
  };

  const {
    className: scrollerClassName,
    onScroll: _omit,
    style: scrollerStyle,
    ...restScroller
  } = scrollerProps ?? {};

  return (
    <div
      className={cn("relative min-h-0 flex-1 basis-0 overflow-hidden", className)}
      style={style}
    >
      <div
        ref={scrollerRef}
        {...restScroller}
        onScroll={onScroll}
        data-vaul-no-drag={vaulNoDrag ? "" : undefined}
        className={cn(
          "h-full min-h-0 overflow-y-auto overflow-x-hidden scrollbar-none overscroll-contain",
          scrollerClassName
        )}
        style={{
          WebkitOverflowScrolling: "touch",
          touchAction: "pan-y",
          ...scrollerStyle,
        }}
      >
        <div ref={contentRef} className={cn(contentClassName)}>
          {children}
        </div>
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
