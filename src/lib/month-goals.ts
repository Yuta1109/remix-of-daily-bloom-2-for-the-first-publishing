export interface MonthGoal {
  id: string;
  text: string;
  completed: boolean;
  completedAt?: string;
}

export interface MonthGoalsBundle {
  goals: MonthGoal[];
  minimized: boolean;
}

const KEY = "essences-month-goals";

type Store = Record<string, MonthGoalsBundle>;

function readStore(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Store;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeStore(store: Store) {
  localStorage.setItem(KEY, JSON.stringify(store));
}

export function monthKeyFromDate(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}`;
}

/** monthKey uses 0-based month index (from Date#getMonth). */
export function parseMonthKey(monthKey: string): { year: number; monthIndex: number } {
  const [y, m] = monthKey.split("-").map(Number);
  return {
    year: Number.isFinite(y) ? y : new Date().getFullYear(),
    monthIndex: Number.isFinite(m) ? m : new Date().getMonth(),
  };
}

/** Months from today to monthKey: -1 last, 0 this, 1 next, else farther. */
export function monthOffsetFromToday(monthKey: string, now = new Date()): number {
  const { year, monthIndex } = parseMonthKey(monthKey);
  return (year - now.getFullYear()) * 12 + (monthIndex - now.getMonth());
}

/**
 * Relative month-goals heading.
 * this / next / last → fixed labels; otherwise "{m}月の目標" / "{month} goals".
 */
export function monthGoalsHeading(
  monthKey: string,
  locale: "en" | "ja",
  labels: { this: string; next: string; last: string; named: string },
  now = new Date()
): string {
  const offset = monthOffsetFromToday(monthKey, now);
  if (offset === 0) return labels.this;
  if (offset === 1) return labels.next;
  if (offset === -1) return labels.last;
  const { year, monthIndex } = parseMonthKey(monthKey);
  if (locale === "ja") {
    return labels.named.replace("{m}", String(monthIndex + 1));
  }
  const name = new Date(year, monthIndex, 1).toLocaleDateString("en-US", {
    month: "long",
  });
  return labels.named.replace("{m}", name);
}

export function loadMonthGoals(monthKey: string): MonthGoalsBundle {
  const store = readStore();
  const b = store[monthKey];
  if (!b) return { goals: [], minimized: false };
  return {
    goals: Array.isArray(b.goals) ? b.goals : [],
    minimized: !!b.minimized,
  };
}

export function saveMonthGoals(monthKey: string, bundle: MonthGoalsBundle) {
  const store = readStore();
  store[monthKey] = bundle;
  writeStore(store);
}
