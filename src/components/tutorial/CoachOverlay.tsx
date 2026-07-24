import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

export type HighlightRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

type Props = {
  targetSelector?: string | null;
  /** When true, clicks on the dimmer advance; hole still passes through if allowThrough */
  captureOutsideClick: boolean;
  allowThrough: boolean;
  bubblePlacement: "above" | "below" | "center" | "cover-top";
  title?: string;
  body: string;
  hint?: string;
  actions?: ReactNode;
  onOutsideTap?: () => void;
  padding?: number;
};

function readRect(selector: string | null | undefined, pad: number): HighlightRect | null {
  if (!selector) return null;
  const el = document.querySelector(selector);
  if (!(el instanceof HTMLElement)) return null;
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return null;
  return {
    top: Math.max(0, r.top - pad),
    left: Math.max(0, r.left - pad),
    width: Math.min(window.innerWidth - Math.max(0, r.left - pad), r.width + pad * 2),
    height: Math.min(window.innerHeight - Math.max(0, r.top - pad), r.height + pad * 2),
  };
}

export function CoachOverlay({
  targetSelector,
  captureOutsideClick,
  allowThrough,
  bubblePlacement,
  title,
  body,
  hint,
  actions,
  onOutsideTap,
  padding = 8,
}: Props) {
  const [targetRect, setTargetRect] = useState<HighlightRect | null>(null);
  const [vvBottom, setVvBottom] = useState(0);
  const [bubbleH, setBubbleH] = useState(0);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const centerMode = bubblePlacement === "center" || !targetSelector;
  const coverTop = bubblePlacement === "cover-top" && !centerMode;

  useLayoutEffect(() => {
    let lastKey = "";
    const update = () => {
      const next = centerMode ? null : readRect(targetSelector, padding);
      setTargetRect(next);

      const vv = window.visualViewport;
      const kb = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0;
      setVvBottom(kb);

      const bh = bubbleRef.current?.getBoundingClientRect().height ?? 0;
      if (bh > 0) setBubbleH(bh);

      if (next && targetSelector && !coverTop) {
        const key = `${Math.round(next.top)}:${Math.round(next.height)}:${Math.round(kb)}`;
        if (key !== lastKey) {
          lastKey = key;
          const el = document.querySelector(targetSelector);
          if (el instanceof HTMLElement) {
            el.scrollIntoView({ block: "nearest", behavior: "smooth" });
          }
        }
      }
    };
    update();
    const id = window.setInterval(update, 100);
    window.addEventListener("resize", update);
    window.addEventListener("focusin", update);
    window.addEventListener("focusout", update);
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("resize", update);
      window.removeEventListener("focusin", update);
      window.removeEventListener("focusout", update);
      window.visualViewport?.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("scroll", update);
    };
  }, [targetSelector, padding, centerMode, coverTop, title, body, hint, actions]);

  const stageTop = targetRect?.top ?? 0;
  const bubbleTop = coverTop ? Math.max(8, stageTop + 6) : 0;
  // Highlight starts under the compact bubble; bottom of stage stays unchanged.
  const highlightGap = 10;
  const rect: HighlightRect | null =
    targetRect && coverTop && bubbleH > 0
      ? (() => {
          const top = Math.min(
            bubbleTop + bubbleH + highlightGap,
            targetRect.top + targetRect.height - 48
          );
          const bottom = targetRect.top + targetRect.height;
          return {
            top,
            left: targetRect.left,
            width: targetRect.width,
            height: Math.max(48, bottom - top),
          };
        })()
      : targetRect;

  const pad = 12;
  let bubbleStyle: CSSProperties = {
    left: pad,
    right: pad,
    maxWidth: 360,
    marginLeft: "auto",
    marginRight: "auto",
  };

  if (centerMode || !targetRect) {
    bubbleStyle = {
      ...bubbleStyle,
      top: "42%",
      transform: "translateY(-50%)",
    };
  } else if (coverTop) {
    bubbleStyle = {
      ...bubbleStyle,
      top: bubbleTop,
      maxWidth: Math.min(400, Math.max(260, targetRect.width - 20)),
    };
  } else if (bubblePlacement === "above") {
    const bottomFromViewport = window.innerHeight - targetRect.top + 12 + vvBottom;
    bubbleStyle = {
      ...bubbleStyle,
      bottom: Math.max(bottomFromViewport, 12 + vvBottom),
    };
  } else {
    const top = targetRect.top + targetRect.height + 12;
    const maxTop = window.innerHeight - 160 - vvBottom;
    bubbleStyle = {
      ...bubbleStyle,
      top: Math.min(Math.max(top, 12), maxTop),
    };
  }

  const panes =
    rect && allowThrough
      ? [
          { top: 0, left: 0, width: "100%", height: rect.top },
          {
            top: rect.top,
            left: 0,
            width: rect.left,
            height: rect.height,
          },
          {
            top: rect.top,
            left: rect.left + rect.width,
            width: Math.max(0, window.innerWidth - rect.left - rect.width),
            height: rect.height,
          },
          {
            top: rect.top + rect.height,
            left: 0,
            width: "100%",
            height: Math.max(0, window.innerHeight - rect.top - rect.height),
          },
        ]
      : null;

  // Dim the band between stage top and highlight (under the bubble / over header).
  const coverDim =
    coverTop && targetRect && rect && rect.top > targetRect.top
      ? {
          top: targetRect.top,
          left: targetRect.left,
          width: targetRect.width,
          height: rect.top - targetRect.top,
        }
      : null;

  const content = (
    <div className="fixed inset-0 z-[110] pointer-events-none" data-tutorial-overlay="">
      {(centerMode || !rect) && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ backgroundColor: "rgba(0,0,0,0.62)" }}
        />
      )}

      {rect && !centerMode && (
        <div
          className="pointer-events-none absolute rounded-2xl ring-2 ring-white/90 transition-[top,left,width,height] duration-150"
          style={{
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.62)",
          }}
        />
      )}

      {coverDim && (
        <div
          className="absolute pointer-events-none"
          style={{
            top: coverDim.top,
            left: coverDim.left,
            width: coverDim.width,
            height: coverDim.height,
            backgroundColor: "rgba(0,0,0,0.62)",
          }}
        />
      )}

      {panes ? (
        panes.map((p, i) => (
          <div
            key={i}
            className="absolute pointer-events-auto"
            style={{
              top: p.top,
              left: p.left,
              width: p.width,
              height: p.height,
            }}
            onClick={(e) => {
              e.stopPropagation();
              if (captureOutsideClick) onOutsideTap?.();
            }}
          />
        ))
      ) : captureOutsideClick ? (
        <div
          className="absolute inset-0 pointer-events-auto"
          onClick={() => onOutsideTap?.()}
        />
      ) : null}

      <div
        ref={bubbleRef}
        className={cn(
          "absolute z-[111] pointer-events-auto rounded-2xl bg-card text-card-foreground shadow-float border border-border/60 px-4 py-3",
        )}
        style={bubbleStyle}
        onClick={(e) => e.stopPropagation()}
      >
        {title && <p className="text-sm font-semibold mb-1">{title}</p>}
        {body ? <p className="text-sm leading-relaxed text-foreground/90">{body}</p> : null}
        {hint && <p className="text-xs text-muted-foreground mt-2">{hint}</p>}
        {actions && <div className={cn("flex flex-col gap-2", body || title ? "mt-3" : undefined)}>{actions}</div>}
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
