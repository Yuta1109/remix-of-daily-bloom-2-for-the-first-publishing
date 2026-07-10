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
