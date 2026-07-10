export interface ReusableTask {
  id: string;
  text: string;
}

const KEY = "reusable-tasks";

export function loadReusable(): ReusableTask[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveReusable(items: ReusableTask[]) {
  localStorage.setItem(KEY, JSON.stringify(items));
}

export function addReusable(text: string): ReusableTask[] {
  const items = loadReusable();
  const t = text.trim();
  if (!t) return items;
  const next = [...items, { id: crypto.randomUUID(), text: t }];
  saveReusable(next);
  return next;
}

export function removeReusable(id: string): ReusableTask[] {
  const next = loadReusable().filter((r) => r.id !== id);
  saveReusable(next);
  return next;
}
