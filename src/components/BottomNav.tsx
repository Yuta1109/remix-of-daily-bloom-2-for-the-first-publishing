import { useEffect, useLayoutEffect, useRef, useState } from "react";
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

interface TabConfig {
  /** Canonical path the tab navigates to. */
  path: string;
  /** Route prefixes that should show this tab as selected. */
  matchPrefixes: string[];
  icon: LucideIcon;
  labelKey: TranslationKeys;
  /** `data-tutorial` anchor for the first-run coach tour, when one exists. */
  tutorial?: string;
}

/**
 * Fixed five-tab order: Progress, Plan, ToDo, Calendar, Note.
 * User is intentionally not a tab — it opens from `UserButton` instead.
 */
const TABS: TabConfig[] = [
  { path: "/progress", matchPrefixes: ["/", "/progress"], icon: ChartColumn, labelKey: "progressTab" },
  { path: "/plan", matchPrefixes: ["/plan"], icon: NotebookText, labelKey: "planTab" },
  { path: "/todo", matchPrefixes: ["/todo"], icon: ListChecks, labelKey: "todoTab" },
  {
    path: "/calendar",
    matchPrefixes: ["/calendar"],
    icon: Calendar,
    labelKey: "calendar",
    tutorial: "nav-calendar",
  },
  // `/notes` is the legacy prefix, kept so deep links still highlight this tab.
  { path: "/note", matchPrefixes: ["/note", "/notes"], icon: StickyNote, labelKey: "noteTab" },
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
  const [pill, setPill] = useState({ x: 0, y: 0, w: 0, h: 0 });

  useLayoutEffect(() => {
    const row = rowRef.current;
    const active = row?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!row || !active) return;
    const rowBox = row.getBoundingClientRect();
    const box = active.getBoundingClientRect();
    setPill({
      x: box.left - rowBox.left,
      y: box.top - rowBox.top,
      w: box.width,
      h: box.height,
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

  return (
    <nav
      ref={navRef}
      aria-label={t("mainNavigationLabel")}
      className={cn(
        "liquid-glass liquid-glass-bar fixed z-50",
        "left-3 right-3 bottom-[max(8px,env(safe-area-inset-bottom,0px))]",
      )}
    >
      <div
        ref={rowRef}
        className="relative flex justify-around items-center pt-[2px]"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <span
          className="liquid-glass-selected liquid-glass-selected-move absolute left-0 top-0 pointer-events-none"
          style={{ width: pill.w, height: pill.h, transform: `translate(${pill.x}px, ${pill.y}px)` }}
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
              aria-label={t(tab.labelKey)}
              aria-current={active ? "page" : undefined}
              onClick={() => {
                void tickHaptic();
                navigate(sessionTabTarget(tab.path, tab.matchPrefixes));
                if (isTutorialActive() && tab.tutorial) {
                  emitTutorial(tab.tutorial);
                }
              }}
              className={cn(
                "liquid-glass-press relative flex flex-col items-center gap-0.5 px-2.5 py-1.5 rounded-2xl justify-center min-w-[56px]",
                active ? "text-accent" : "text-muted-foreground",
              )}
            >
              <Icon className="relative z-[1] w-5 h-5" strokeWidth={active ? 2.5 : 1.8} aria-hidden="true" />
              <span className="relative z-[1] text-[10px] font-medium leading-none">{t(tab.labelKey)}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
