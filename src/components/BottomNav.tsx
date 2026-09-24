import { useEffect, useRef } from "react";
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

  useEffect(() => {
    const el = navRef.current;
    if (!el) return;

    const publish = () => {
      const h = Math.ceil(el.getBoundingClientRect().height);
      document.documentElement.style.setProperty("--bottom-nav-offset", `${h}px`);
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
        "fixed bottom-0 left-0 right-0 z-50",
        // Restrained Liquid-Glass-style control: translucent + blurred, not a
        // saturated card. Matches the search-bar treatment already used in
        // MemoListPage / MemoSearchPage rather than inventing a new material.
        "bg-background/80 backdrop-blur-xl border-t border-border/60",
      )}
    >
      <div
        className="flex justify-around items-center pt-[2px]"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
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
                navigate(tab.path);
                if (isTutorialActive() && tab.tutorial) {
                  emitTutorial(tab.tutorial);
                }
              }}
              className={cn(
                "flex flex-col items-center gap-0.5 px-2.5 py-1.5 rounded-xl transition-colors justify-center min-w-[56px]",
                "motion-reduce:transition-none",
                active ? "text-accent" : "text-muted-foreground",
              )}
            >
              <Icon className="w-5 h-5" strokeWidth={active ? 2.5 : 1.8} aria-hidden="true" />
              <span className="text-[10px] font-medium leading-none">{t(tab.labelKey)}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
