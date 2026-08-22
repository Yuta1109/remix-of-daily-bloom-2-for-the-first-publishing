export interface Task {
  id: string;
  text: string;
  completed: boolean;
  date: string; // YYYY-MM-DD
}

export interface DayData {
  tasks: Task[];
  reflection: string;
}

const STORAGE_KEY = "mindful-todo-data";

function loadData(): Record<string, DayData> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveData(data: Record<string, DayData>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function getDateKey(date: Date): string {
  return date.toISOString().split("T")[0];
}

export function getDayData(date: string): DayData {
  const data = loadData();
  return data[date] || { tasks: [], reflection: "" };
}

export function saveDayData(date: string, dayData: DayData) {
  const data = loadData();
  data[date] = dayData;
  saveData(data);
}

export function getAllData(): Record<string, DayData> {
  return loadData();
}

const HISTORY_MONTHS = 3;

function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseDateKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

/** YYYY-MM keys for the last 3 months, current month first. */
export function getHistoryMonthKeys(todayKey: string): string[] {
  const today = parseDateKey(todayKey);
  const keys: string[] = [];
  for (let i = 0; i < HISTORY_MONTHS; i++) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return keys;
}

export type HistoryWeek = { week: number; startKey: string; endKey: string };

/** Calendar weeks (Sunday–Saturday) that overlap the month, clamped to the month. */
export function getWeeksInMonth(monthKey: string): HistoryWeek[] {
  const [y, m] = monthKey.split("-").map(Number);
  const first = new Date(y, (m || 1) - 1, 1);
  const last = new Date(y, m || 1, 0);
  const weeks: HistoryWeek[] = [];
  const cursor = new Date(first);
  cursor.setDate(cursor.getDate() - cursor.getDay());
  let n = 1;
  while (cursor <= last) {
    const start = new Date(cursor);
    const end = new Date(cursor);
    end.setDate(end.getDate() + 6);
    const startClamped = start < first ? first : start;
    const endClamped = end > last ? last : end;
    if (endClamped >= first && startClamped <= last) {
      weeks.push({
        week: n,
        startKey: toDateKey(startClamped),
        endKey: toDateKey(endClamped),
      });
      n += 1;
    }
    cursor.setDate(cursor.getDate() + 7);
  }
  return weeks;
}

export function weekIndexForDate(monthKey: string, dateKey: string): number {
  const weeks = getWeeksInMonth(monthKey);
  const found = weeks.find((w) => dateKey >= w.startKey && dateKey <= w.endKey);
  return found?.week ?? weeks[weeks.length - 1]?.week ?? 1;
}

/** Past days with tasks in [startKey, endKey], within the 3-month window, newest first. */
export function getDaysWithTasksInRange(
  startKey: string,
  endKey: string,
  todayKey: string,
): { date: string; data: DayData }[] {
  const months = getHistoryMonthKeys(todayKey);
  const oldest = `${months[months.length - 1]}-01`;
  const all = loadData();
  return Object.entries(all)
    .filter(
      ([date, day]) =>
        date >= oldest &&
        date < todayKey &&
        date >= startKey &&
        date <= endKey &&
        day.tasks.length > 0,
    )
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, data]) => ({ date, data }));
}

/** Past days that have at least one task, newest first. */
export function getPastDaysWithTasks(todayKey: string): { date: string; data: DayData }[] {
  const months = getHistoryMonthKeys(todayKey);
  const oldest = `${months[months.length - 1]}-01`;
  const all = loadData();
  return Object.entries(all)
    .filter(([date, day]) => date >= oldest && date < todayKey && day.tasks.length > 0)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, data]) => ({ date, data }));
}

export function getCompletionRate(dayData: DayData): number {
  if (dayData.tasks.length === 0) return 0;
  const done = dayData.tasks.filter((t) => t.completed).length;
  return Math.round((done / dayData.tasks.length) * 100);
}

export function getStreak(): number {
  const data = loadData();
  let streak = 0;
  const today = new Date();
  
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = getDateKey(d);
    const day = data[key];
    if (day && day.tasks.length > 0 && getCompletionRate(day) === 100) {
      streak++;
    } else if (i === 0) {
      // today might not be done yet, skip
      continue;
    } else {
      break;
    }
  }
  return streak;
}

export function getMonthData(year: number, month: number): { date: string; data: DayData }[] {
  const allData = loadData();
  const results: { date: string; data: DayData }[] = [];
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  
  for (let day = 1; day <= daysInMonth; day++) {
    const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    results.push({ date: key, data: allData[key] || { tasks: [], reflection: "" } });
  }
  return results;
}

export function getPastReflection(todayKey: string): { text: string; daysAgo: number; date: string } | null {
  const allData = loadData();
  const today = new Date(todayKey + "T00:00:00");
  const intervals = [30, 14, 7];

  for (const daysAgo of intervals) {
    const past = new Date(today);
    past.setDate(past.getDate() - daysAgo);
    const key = getDateKey(past);
    const day = allData[key];
    if (day && day.reflection && day.reflection.trim()) {
      return { text: day.reflection, daysAgo, date: key };
    }
  }
  return null;
}
