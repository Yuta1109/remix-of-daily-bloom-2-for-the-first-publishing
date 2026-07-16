import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type UIEvent,
} from "react";
import { cn } from "@/lib/utils";

interface Props {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  /** How far the scrollbar track is inset from top/bottom (matches rounded corners). */
  inset?: number;
  /** When inside a vaul drawer, disable drawer drag so vertical scroll works. */
  vaulNoDrag?: boolean;
}

/**
 * Custom scrollbar that stays inside rounded corners.
 * Native iOS overlay scrollbars ignore CSS track margins — this paints our own.
 */
export function InsetScrollArea({
  children,
  className,
  contentClassName,
  inset = 16,
  vaulNoDrag = false,
}: Props) {
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
    const track = Math.max(0, clientHeight - inset * 2);
    const height = Math.max(24, (clientHeight / scrollHeight) * track);
    const maxTop = track - height;
    const top =
      inset + (scrollTop / (scrollHeight - clientHeight)) * maxTop;
    setThumb({ top, height, visible: true });
  }, [inset]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    updateThumb();
    const ro = new ResizeObserver(updateThumb);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => ro.disconnect();
  }, [updateThumb, children]);

  const onScroll = (_e: UIEvent) => updateThumb();

  return (
    <div className={cn("relative min-h-0 flex-1 overflow-hidden", className)}>
      <div
        ref={scrollerRef}
        onScroll={onScroll}
        data-vaul-no-drag={vaulNoDrag ? true : undefined}
        className={cn(
          "h-full min-h-0 overflow-y-auto overflow-x-hidden scrollbar-none overscroll-contain",
          contentClassName
        )}
        style={{ WebkitOverflowScrolling: "touch" }}
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
