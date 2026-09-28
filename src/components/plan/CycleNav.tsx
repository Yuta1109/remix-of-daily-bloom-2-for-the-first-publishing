import { Fragment, useId, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useI18n, type TranslationKeys } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useNativeGlass } from "@/hooks/use-native-glass";
import { getReflectionAttentionCount } from "@/lib/v3/repository";

export type CycleId = "plan" | "do" | "reflection" | "replan";

const ITEMS: { id: CycleId; to: string; labelKey: TranslationKeys }[] = [
  { id: "plan", to: "/plan/home", labelKey: "cyclePlan" },
  { id: "do", to: "/plan", labelKey: "cycleDo" },
  { id: "reflection", to: "/plan/reflection", labelKey: "cycleReflection" },
  { id: "replan", to: "/plan/replan", labelKey: "cycleReplan" },
];

function attentionText(count: number): string {
  if (count > 99) return "99+";
  return String(count);
}

/**
 * Plan → Do → Reflection → Replan as ellipses on one line.
 * The selected ellipse is Liquid Glass. Dragging it follows the finger and
 * shrinks while it travels. Tapping another ellipse moves immediately.
 * The bar itself is the glass layer; it has no extra background.
 */
export function CycleNav({ current }: { current: CycleId }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const barId = useId();
  const navRef = useRef<HTMLElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [dragX, setDragX] = useState<number | null>(null);
  const dragged = useRef(false);
  const attentionCount = getReflectionAttentionCount();
  const attentionLabel = attentionText(attentionCount);
  const selectedIndex = Math.max(0, ITEMS.findIndex((item) => item.id === current));

  const nearestIndex = (clientX: number) => {
    let best = selectedIndex;
    let distance = Number.POSITIVE_INFINITY;
    buttonRefs.current.forEach((button, index) => {
      if (!button) return;
      const box = button.getBoundingClientRect();
      const next = Math.abs(clientX - (box.left + box.width / 2));
      if (next < distance) {
        distance = next;
        best = index;
      }
    });
    return best;
  };

  const go = (index: number) => {
    const item = ITEMS[index];
    if (item && item.id !== current) navigate(item.to);
  };

  useNativeGlass(navRef, {
    id: barId,
    role: "tabBar",
    label: t("cycleNavLabel"),
    tabs: ITEMS.map((item) => {
      const name = t(item.labelKey);
      const showAttention = item.id === "reflection" && attentionCount > 0;
      return {
        id: `${barId}-${item.id}`,
        label: showAttention ? `${name} ${attentionLabel}` : name,
        symbol: "",
        selected: item.id === current,
      };
    }),
  });

  return (
    <nav
      ref={navRef}
      aria-label={t("cycleNavLabel")}
      data-testid="cycle-nav"
      className="liquid-glass liquid-glass-bar relative z-30 px-2 py-2"
    >
      <div ref={trackRef} className="relative flex items-center">
        {ITEMS.map((item, index) => {
          const selected = item.id === current;
          const showAttention = item.id === "reflection" && attentionCount > 0;
          return (
            <Fragment key={item.id}>
              {index > 0 ? (
                <span
                  className="h-[3px] w-3 shrink-0 rounded-full bg-foreground/45"
                  aria-hidden="true"
                  data-testid="cycle-line"
                />
              ) : null}
              <button
                ref={(node) => {
                  buttonRefs.current[index] = node;
                }}
                type="button"
                data-testid={`cycle-${item.id}`}
                data-native-glass-id={`${barId}-${item.id}`}
                aria-current={selected ? "page" : undefined}
                aria-label={
                  showAttention ? `${t(item.labelKey)} · ${attentionLabel}` : undefined
                }
                onClick={() => {
                  if (dragged.current) {
                    dragged.current = false;
                    return;
                  }
                  go(index);
                }}
                onPointerDown={(event) => {
                  if (!selected) return;
                  dragged.current = false;
                  event.currentTarget.setPointerCapture(event.pointerId);
                }}
                onPointerMove={(event) => {
                  if (!selected || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
                  const start = buttonRefs.current[selectedIndex]?.getBoundingClientRect();
                  if (!start) return;
                  const moved = Math.abs(event.clientX - (start.left + start.width / 2));
                  if (moved < 8 && dragX == null) return;
                  dragged.current = true;
                  const track = trackRef.current?.getBoundingClientRect();
                  if (!track) return;
                  setDragX(event.clientX - track.left);
                }}
                onPointerUp={(event) => {
                  if (!selected || dragX == null) return;
                  const indexHit = nearestIndex(event.clientX);
                  setDragX(null);
                  go(indexHit);
                }}
                onPointerCancel={() => setDragX(null)}
                className={cn(
                  "relative z-10 flex h-12 min-w-0 flex-1 items-center justify-center rounded-full px-1 text-[12px] font-semibold leading-none",
                  selected
                    ? "liquid-glass text-foreground"
                    : "border border-foreground/10 bg-background text-muted-foreground",
                )}
              >
                <span className="truncate">{t(item.labelKey)}</span>
                {showAttention ? (
                  <span
                    data-testid="cycle-reflection-count"
                    className="absolute -right-1 -top-1.5 min-w-5 rounded-full bg-foreground px-1 text-center text-[10px] font-bold leading-4 text-background"
                  >
                    {attentionLabel}
                  </span>
                ) : null}
              </button>
            </Fragment>
          );
        })}
        {dragX != null ? (
          <span
            className="liquid-glass pointer-events-none absolute top-1/2 z-20 h-8 w-14 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{ left: dragX }}
            aria-hidden="true"
            data-testid="cycle-glass"
            data-dragging="true"
          />
        ) : null}
      </div>
    </nav>
  );
}
