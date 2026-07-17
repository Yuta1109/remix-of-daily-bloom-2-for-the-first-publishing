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
