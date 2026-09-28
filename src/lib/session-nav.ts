/**
 * Where the user was inside a bottom tab, for this browser session only.
 *
 * Nothing here is written to Essences V3 or localStorage. A full reload
 * starts fresh. Notes, Progress, ToDo, and Calendar can use the same
 * slots later; this step restores the planning tab.
 */

export type SessionArea = "planning" | "notes" | "progress" | "todo" | "calendar";

/** View keys for the planning tab. Other areas can add their own later. */
export const PLANNING_VIEW = {
  doLevel: "do-level",
  dailyDate: "do-daily-date",
  weekAnchor: "do-week-anchor",
  monthAnchor: "do-month-anchor",
  futureYear: "do-year",
  reflectionType: "reflection-type",
  reflectionHistory: "reflection-history",
  replanFocus: "replan-focus",
  replanSelected: "replan-selected",
} as const;

interface AreaMemory {
  location?: string;
  view: Record<string, unknown>;
  scroll: Record<string, number>;
}

const memory = new Map<SessionArea, AreaMemory>();

function slot(area: SessionArea): AreaMemory {
  let current = memory.get(area);
  if (!current) {
    current = { view: {}, scroll: {} };
    memory.set(area, current);
  }
  return current;
}

export function sessionAreaForPath(pathname: string): SessionArea | null {
  if (pathname === "/plan" || pathname.startsWith("/plan/")) return "planning";
  if (
    pathname === "/note" ||
    pathname.startsWith("/note/") ||
    pathname === "/notes" ||
    pathname.startsWith("/notes/")
  ) {
    return "notes";
  }
  if (pathname === "/" || pathname === "/progress" || pathname.startsWith("/progress/")) {
    return "progress";
  }
  if (pathname === "/todo" || pathname.startsWith("/todo/")) return "todo";
  if (pathname === "/calendar" || pathname.startsWith("/calendar/")) return "calendar";
  return null;
}

export function rememberSessionLocation(area: SessionArea, location: string): void {
  slot(area).location = location;
}

export function recallSessionLocation(area: SessionArea): string | undefined {
  return memory.get(area)?.location;
}

export function rememberSessionView(area: SessionArea, key: string, value: unknown): void {
  slot(area).view[key] = value;
}

export function recallSessionView<T>(area: SessionArea, key: string): T | undefined {
  const view = memory.get(area)?.view;
  if (!view || !Object.prototype.hasOwnProperty.call(view, key)) return undefined;
  return view[key] as T;
}

export function rememberSessionScroll(area: SessionArea, key: string, top: number): void {
  if (!Number.isFinite(top) || top < 0) return;
  slot(area).scroll[key] = top;
}

export function recallSessionScroll(area: SessionArea, key: string): number | undefined {
  return memory.get(area)?.scroll[key];
}

/**
 * Path the planning tab should open. Other tabs still use their root until
 * they opt in, but their last location is already being recorded.
 */
export function sessionTabTarget(tabPath: string, matchPrefixes: string[]): string {
  if (sessionAreaForPath(tabPath) !== "planning") return tabPath;
  const remembered = recallSessionLocation("planning");
  if (!remembered) return tabPath;
  const path = remembered.split(/[?#]/)[0] ?? remembered;
  const inside = matchPrefixes.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
  return inside ? remembered : tabPath;
}

export function resetSessionNav(): void {
  memory.clear();
}
