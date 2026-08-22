export type MemoPage = {
  id: string;
  title: string;
  html: string;
  updatedAt: number;
};

const KEY = "essences-memos";
const ACTIVE_KEY = "essences-memos-active";

function blankPage(): MemoPage {
  return {
    id: crypto.randomUUID(),
    title: "",
    html: "",
    updatedAt: Date.now(),
  };
}

function loadAll(): MemoPage[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [blankPage()];
    const parsed = JSON.parse(raw) as MemoPage[];
    if (!Array.isArray(parsed) || parsed.length === 0) return [blankPage()];
    return parsed.map((p) => ({
      id: String(p.id || crypto.randomUUID()),
      title: typeof p.title === "string" ? p.title : "",
      html: typeof p.html === "string" ? p.html : "",
      updatedAt: Number(p.updatedAt) || Date.now(),
    }));
  } catch {
    return [blankPage()];
  }
}

function saveAll(pages: MemoPage[]) {
  localStorage.setItem(KEY, JSON.stringify(pages));
}

export function loadMemoPages(): MemoPage[] {
  return loadAll();
}

export function getActiveMemoId(): string {
  const pages = loadAll();
  try {
    const saved = localStorage.getItem(ACTIVE_KEY);
    if (saved && pages.some((p) => p.id === saved)) return saved;
  } catch {
    /* ignore */
  }
  return pages[0].id;
}

export function setActiveMemoId(id: string) {
  localStorage.setItem(ACTIVE_KEY, id);
}

export function upsertMemoPage(page: MemoPage): MemoPage[] {
  const pages = loadAll();
  const next = { ...page, updatedAt: Date.now() };
  const idx = pages.findIndex((p) => p.id === page.id);
  const out = idx >= 0 ? pages.map((p, i) => (i === idx ? next : p)) : [next, ...pages];
  saveAll(out);
  return out;
}

export function addMemoPage(): { pages: MemoPage[]; created: MemoPage } {
  const created = blankPage();
  const pages = [created, ...loadAll()];
  saveAll(pages);
  setActiveMemoId(created.id);
  return { pages, created };
}

export function deleteMemoPage(id: string): MemoPage[] {
  let pages = loadAll().filter((p) => p.id !== id);
  if (pages.length === 0) pages = [blankPage()];
  saveAll(pages);
  if (getActiveMemoId() === id) setActiveMemoId(pages[0].id);
  return pages;
}
