import { useEffect, useLayoutEffect, useState, type CSSProperties, type ReactNode } from "react";
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
  bubblePlacement: "above" | "below" | "center";
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
  const [rect, setRect] = useState<HighlightRect | null>(null);
  const [vvBottom, setVvBottom] = useState(0);
  const centerMode = bubblePlacement === "center" || !targetSelector;

  useLayoutEffect(() => {
    let lastKey = "";
    const update = () => {
      const next = centerMode ? null : readRect(targetSelector, padding);
      setRect(next);

      const vv = window.visualViewport;
      const kb = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0;
      setVvBottom(kb);

      if (next && targetSelector) {
        const key = `${Math.round(next.top)}:${Math.round(next.height)}:${Math.round(kb)}`;
        // Re-scroll when keyboard opens / target jumps (first open often lags).
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
    // Keep measuring for the whole step — keyboard open is often >4s after mount.
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
  }, [targetSelector, padding, centerMode]);

  const pad = 12;
  let bubbleStyle: CSSProperties = {
    left: pad,
    right: pad,
    maxWidth: 360,
    marginLeft: "auto",
    marginRight: "auto",
  };

  if (centerMode || !rect) {
    bubbleStyle = {
      ...bubbleStyle,
      top: "42%",
      transform: "translateY(-50%)",
    };
  } else if (bubblePlacement === "above") {
    const bottomFromViewport = window.innerHeight - rect.top + 12 + vvBottom;
    bubbleStyle = {
      ...bubbleStyle,
      bottom: Math.max(bottomFromViewport, 12 + vvBottom),
    };
  } else {
    const top = rect.top + rect.height + 12;
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

  const content = (
    <div className="fixed inset-0 z-[110] pointer-events-none" data-tutorial-overlay="">
      {/* Full-screen dim for center / no-target steps (inline rgba — reliable in WKWebView). */}
      {(centerMode || !rect) && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ backgroundColor: "rgba(0,0,0,0.62)" }}
        />
      )}

      {/* Cutout highlight for targeted steps */}
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
        className={cn(
          "absolute z-[111] pointer-events-auto rounded-2xl bg-card text-card-foreground shadow-float border border-border/60 px-4 py-3",
        )}
        style={bubbleStyle}
        onClick={(e) => e.stopPropagation()}
      >
        {title && <p className="text-sm font-semibold mb-1">{title}</p>}
        <p className="text-sm leading-relaxed text-foreground/90">{body}</p>
        {hint && <p className="text-xs text-muted-foreground mt-2">{hint}</p>}
        {actions && <div className="mt-3 flex flex-col gap-2">{actions}</div>}
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
