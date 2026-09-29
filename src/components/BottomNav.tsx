import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  ChartColumn,
  ListChecks,
  Calendar,
  NotebookText,
  StickyNote,
  type LucideIcon,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useI18n, type TranslationKeys } from "@/lib/i18n";
import { emitTutorial, isTutorialActive } from "@/lib/tutorial";
import { tickHaptic } from "@/lib/haptics";
import { sessionTabTarget } from "@/lib/session-nav";
import { useNativeGlass } from "@/hooks/use-native-glass";
import { isOverlayChromeOpen, subscribeOverlayChrome } from "@/lib/overlay-chrome";

interface TabConfig {
  /** Canonical path the tab navigates to. */
  path: string;
  /** Route prefixes that should show this tab as selected. */
  matchPrefixes: string[];
  icon: LucideIcon;
  /** SF Symbol used when this tab is drawn by native Liquid Glass. */
  symbol: string;
  labelKey: TranslationKeys;
  /** `data-tutorial` anchor for the first-run coach tour, when one exists. */
  tutorial?: string;
}

/**
 * Fixed five-tab order: Progress, Plan, ToDo, Calendar, Note.
 * User is intentionally not a tab — it opens from `UserButton` instead.
 */
const TABS: TabConfig[] = [
  { path: "/progress", matchPrefixes: ["/", "/progress"], icon: ChartColumn, symbol: "chart.bar", labelKey: "progressTab" },
  { path: "/plan", matchPrefixes: ["/plan"], icon: NotebookText, symbol: "book", labelKey: "planTab" },
  { path: "/todo", matchPrefixes: ["/todo"], icon: ListChecks, symbol: "checklist", labelKey: "todoTab" },
  {
    path: "/calendar",
    matchPrefixes: ["/calendar"],
    icon: Calendar,
    symbol: "calendar",
    labelKey: "calendar",
    tutorial: "nav-calendar",
  },
  // `/notes` is the legacy prefix, kept so deep links still highlight this tab.
  { path: "/note", matchPrefixes: ["/note", "/notes"], icon: StickyNote, symbol: "note.text", labelKey: "noteTab" },
];

function isTabActive(pathname: string, tab: TabConfig): boolean {
  return tab.matchPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * Persistent five-tab bar. Selection is derived entirely from the current
 * route — there is no independent "which tab is active" state — so deep
 * links and browser-style back/forward navigation stay in sync automatically.
 */
export function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useI18n();
  const navRef = useRef<HTMLElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState({ x: 0, y: 0, w: 0, h: 0, on: false });
  const [dragX, setDragX] = useState<number | null>(null);
  const dragOrigin = useRef<number | null>(null);
  const ignoreClick = useRef(false);
  const overlayOpen = useSyncExternalStore(subscribeOverlayChrome, isOverlayChromeOpen, () => false);
  useNativeGlass(navRef, {
    id: "main-tab-bar",
    role: "tabBar",
    label: t("mainNavigationLabel"),
    tabs: TABS.map((tab) => ({
      id: tab.path,
      label: t(tab.labelKey),
      symbol: tab.symbol,
      selected: isTabActive(location.pathname, tab),
    })),
  });

  useLayoutEffect(() => {
    const row = rowRef.current;
    const active = row?.querySelector<HTMLElement>('[aria-current="page"]');
    const sample = active ?? row?.querySelector<HTMLElement>("button");
    if (!row || !sample) return;
    const rowBox = row.getBoundingClientRect();
    const box = sample.getBoundingClientRect();
    setPill({
      x: box.left - rowBox.left,
      y: box.top - rowBox.top,
      w: box.width,
      h: box.height,
      on: !!active,
    });
  }, [location.pathname, t]);

  useEffect(() => {
    const el = navRef.current;
    if (!el) return;

    const publish = () => {
      const h = Math.ceil(el.getBoundingClientRect().height);
      const bottom = Number.parseFloat(getComputedStyle(el).bottom) || 0;
      document.documentElement.style.setProperty("--bottom-nav-offset", `${Math.ceil(h + bottom)}px`);
    };

    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    window.addEventListener("orientationchange", publish);
    return () => {
      ro.disconnect();
      window.removeEventListener("orientationchange", publish);
    };
  }, []);

  const selectTab = (tab: TabConfig) => {
    void tickHaptic();
    navigate(sessionTabTarget(tab.path, tab.matchPrefixes));
    if (isTutorialActive() && tab.tutorial) {
      emitTutorial(tab.tutorial);
    }
  };

  const tabAt = (x: number) => {
    const row = rowRef.current;
    if (!row) return null;
    const buttons = [...row.querySelectorAll("button")];
    let nearest: HTMLButtonElement | null = null;
    let best = Number.POSITIVE_INFINITY;
    for (const button of buttons) {
      const box = button.getBoundingClientRect();
      const rowBox = row.getBoundingClientRect();
      const center = box.left - rowBox.left + box.width / 2;
      const distance = Math.abs(center - x);
      if (distance < best) {
        best = distance;
        nearest = button;
      }
    }
    return nearest;
  };

  const pillX = dragX == null ? pill.x : dragX - pill.w / 2;

  return (
    <nav
      ref={navRef}
      aria-label={t("mainNavigationLabel")}
      className={cn(
        "liquid-glass liquid-glass-bar fixed",
        overlayOpen ? "z-20 pointer-events-none" : "z-[80]",
        "left-2 right-2 bottom-0",
      )}
    >
      <div
        ref={rowRef}
        className="relative flex justify-around items-center pt-2"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 8px)" }}
        onPointerDown={(event) => {
          if (overlayOpen) return;
          dragOrigin.current = event.clientX;
        }}
        onPointerMove={(event) => {
          if (dragOrigin.current == null || overlayOpen) return;
          if (Math.abs(event.clientX - dragOrigin.current) < 8 && dragX == null) return;
          const row = rowRef.current;
          if (!row) return;
          const box = row.getBoundingClientRect();
          setDragX(Math.min(Math.max(event.clientX - box.left, 0), box.width));
        }}
        onPointerUp={() => {
          const x = dragX;
          dragOrigin.current = null;
          setDragX(null);
          if (x == null) return;
          ignoreClick.current = true;
          const button = tabAt(x);
          const tab = TABS.find((item) => item.path === button?.getAttribute("data-native-glass-id"));
          if (tab) selectTab(tab);
        }}
        onPointerCancel={() => {
          dragOrigin.current = null;
          setDragX(null);
        }}
      >
        <span
          className={cn(
            "liquid-glass-selected absolute left-0 top-0 pointer-events-none",
            dragX == null && "liquid-glass-selected-move",
            dragX == null && !pill.on && "opacity-0",
          )}
          style={{ width: pill.w, height: pill.h, transform: `translate(${pillX}px, ${pill.y}px)` }}
          aria-hidden="true"
        />
        {TABS.map((tab) => {
          const active = isTabActive(location.pathname, tab);
          const Icon = tab.icon;
          return (
            <button
              key={tab.path}
              type="button"
              data-tutorial={tab.tutorial}
              data-native-glass-id={tab.path}
              aria-label={t(tab.labelKey)}
              aria-current={active ? "page" : undefined}
              onClick={() => {
                if (ignoreClick.current) {
                  ignoreClick.current = false;
                  return;
                }
                selectTab(tab);
              }}
              className={cn(
                "liquid-glass-press relative flex flex-col items-center gap-1 px-3 py-2 rounded-2xl justify-center min-w-[64px]",
                active ? "text-accent" : "text-muted-foreground",
              )}
            >
              <Icon className="relative z-[1] w-[22px] h-[22px]" strokeWidth={active ? 2.5 : 1.8} aria-hidden="true" />
              <span className="relative z-[1] text-[11px] font-medium leading-none">{t(tab.labelKey)}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
