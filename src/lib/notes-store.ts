export type MemoPage = {
  id: string;
  title: string;
  html: string;
  updatedAt: number;
};

export const MEMO_CATEGORY_COLORS = [
  "#E8F4EC",
  "#E8F0FA",
  "#FAF0E6",
  "#F3E8FA",
  "#FAE8E8",
  "#E8FAFA",
  "#F5F0E8",
] as const;

export type MemoCategory = {
  id: string;
  name: string;
  pageIds: string[];
  collapsed: boolean;
  color?: string;
};

export type MemoLibrary = {
  categories: MemoCategory[];
  pages: MemoPage[];
};

const LEGACY_KEY = "essences-memos";
const LEGACY_ACTIVE_KEY = "essences-memos-active";
const LIBRARY_KEY = "essences-memo-library-v2";

/** Fixed IDs for the onboarding welcome memo (first install only). */
export const WELCOME_MEMO_ID = "00000000-0000-4000-8000-000000000001";
export const WELCOME_CATEGORY_ID = "00000000-0000-4000-8000-000000000002";

export function isWelcomeMemo(pageId: string): boolean {
  return pageId === WELCOME_MEMO_ID;
}

function welcomeBodyHtml(): string {
  const lines = [
    "毎日の仕事や勉強、買い物のリストなど好きな場面でメモを活用してください！",
    "右上のカメラ機能を利用すれば、AIが画像を解析してとっさにメモを残したいときにここに保存してくれます。",
    "手書きのノートからパソコンのスクリーンでもなんでもオッケー👌",
    "なんと数式も書いてくれます！",
    "電卓機能も使えます",
    "さっそく使って見ましょう！",
  ];
  return lines.map((line) => `<div>${line}</div>`).join("");
}

function createWelcomeLibrary(): MemoLibrary {
  const page: MemoPage = {
    id: WELCOME_MEMO_ID,
    title: "まずはここをクリック",
    html: welcomeBodyHtml(),
    updatedAt: Date.now(),
  };
  const category: MemoCategory = {
    id: WELCOME_CATEGORY_ID,
    name: "メモへようこそ",
    pageIds: [page.id],
    collapsed: false,
    color: MEMO_CATEGORY_COLORS[0],
  };
  return { categories: [category], pages: [page] };
}

function blankPage(): MemoPage {
  return {
    id: crypto.randomUUID(),
    title: "",
    html: "",
    updatedAt: Date.now(),
  };
}

function blankCategory(name: string, pageIds: string[] = []): MemoCategory {
  return {
    id: crypto.randomUUID(),
    name,
    pageIds,
    collapsed: false,
    color: MEMO_CATEGORY_COLORS[0],
  };
}

function sanitizePage(raw: Partial<MemoPage>): MemoPage {
  return {
    id: String(raw.id || crypto.randomUUID()),
    title: typeof raw.title === "string" ? raw.title : "",
    html: typeof raw.html === "string" ? raw.html : "",
    updatedAt: Number(raw.updatedAt) || Date.now(),
  };
}

function migrateLegacy(): MemoLibrary {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return defaultLibrary();
    const parsed = JSON.parse(raw) as MemoPage[];
    if (!Array.isArray(parsed) || parsed.length === 0) return defaultLibrary();
    const pages = parsed.map((p) => sanitizePage(p));
    const category = blankCategory(
      pages.length === 1 && !pages[0].title ? "" : "メモ",
      pages.map((p) => p.id),
    );
    return { categories: [category], pages };
  } catch {
    return defaultLibrary();
  }
}

function defaultLibrary(): MemoLibrary {
  return createWelcomeLibrary();
}

function loadRaw(): MemoLibrary {
  try {
    const raw = localStorage.getItem(LIBRARY_KEY);
    if (!raw) {
      const migrated = migrateLegacy();
      saveRaw(migrated);
      return migrated;
    }
    const parsed = JSON.parse(raw) as MemoLibrary;
    if (!parsed?.categories?.length || !Array.isArray(parsed.pages)) {
      const migrated = migrateLegacy();
      saveRaw(migrated);
      return migrated;
    }
    const pages = parsed.pages.map((p) => sanitizePage(p));
    const pageIds = new Set(pages.map((p) => p.id));
    const categories = parsed.categories.map((c) => ({
      id: String(c.id || crypto.randomUUID()),
      name: typeof c.name === "string" ? c.name : "",
      pageIds: Array.isArray(c.pageIds)
        ? c.pageIds.filter((id) => pageIds.has(String(id)))
        : [],
      collapsed: !!c.collapsed,
      color:
        typeof c.color === "string" && (MEMO_CATEGORY_COLORS as readonly string[]).includes(c.color)
          ? c.color
          : MEMO_CATEGORY_COLORS[0],
    }));
    const referenced = new Set(categories.flatMap((c) => c.pageIds));
    const orphans = pages.filter((p) => !referenced.has(p.id));
    if (orphans.length) {
      if (categories.length === 0) {
        categories.push(blankCategory("", orphans.map((p) => p.id)));
      } else {
        categories[0].pageIds.push(...orphans.map((p) => p.id));
      }
    }
    if (!categories.length) {
      const page = blankPage();
      return { categories: [blankCategory("", [page.id])], pages: [page] };
    }
    return { categories, pages };
  } catch {
    const migrated = migrateLegacy();
    saveRaw(migrated);
    return migrated;
  }
}

function saveRaw(lib: MemoLibrary) {
  localStorage.setItem(LIBRARY_KEY, JSON.stringify(lib));
  try {
    localStorage.removeItem(LEGACY_KEY);
    localStorage.removeItem(LEGACY_ACTIVE_KEY);
  } catch {
    /* ignore */
  }
}

export function loadMemoLibrary(): MemoLibrary {
  return loadRaw();
}

export function saveMemoLibrary(lib: MemoLibrary): MemoLibrary {
  saveRaw(lib);
  return lib;
}

export function getMemoPage(lib: MemoLibrary, id: string): MemoPage | undefined {
  return lib.pages.find((p) => p.id === id);
}

export function upsertMemoPage(lib: MemoLibrary, patch: MemoPage): MemoLibrary {
  const next = { ...patch, updatedAt: Date.now() };
  const idx = lib.pages.findIndex((p) => p.id === patch.id);
  const pages = idx >= 0 ? lib.pages.map((p, i) => (i === idx ? next : p)) : [next, ...lib.pages];
  return saveMemoLibrary({ ...lib, pages });
}

export function addCategory(lib: MemoLibrary, name: string): { lib: MemoLibrary; categoryId: string; pageId: string } {
  const page = blankPage();
  const category = blankCategory(name.trim(), [page.id]);
  const next = saveMemoLibrary({
    categories: [...lib.categories, category],
    pages: [page, ...lib.pages],
  });
  return { lib: next, categoryId: category.id, pageId: page.id };
}

export function addMemoToCategory(
  lib: MemoLibrary,
  categoryId: string,
): { lib: MemoLibrary; page: MemoPage } {
  const page = blankPage();
  const categories = lib.categories.map((c) =>
    c.id === categoryId ? { ...c, pageIds: [page.id, ...c.pageIds] } : c,
  );
  const next = saveMemoLibrary({
    categories,
    pages: [page, ...lib.pages],
  });
  return { lib: next, page };
}

export function removeMemoPage(lib: MemoLibrary, pageId: string): MemoLibrary {
  const categories = lib.categories
    .map((c) => ({ ...c, pageIds: c.pageIds.filter((id) => id !== pageId) }))
    .filter((c) => c.pageIds.length > 0);
  let pages = lib.pages.filter((p) => p.id !== pageId);
  if (pages.length === 0) {
    const page = blankPage();
    pages = [page];
    categories.push(blankCategory("", [page.id]));
  }
  if (categories.length === 0) {
    const page = pages[0];
    categories.push(blankCategory("", [page.id]));
  }
  return saveMemoLibrary({ categories, pages });
}

export function removeCategory(lib: MemoLibrary, categoryId: string): MemoLibrary {
  const target = lib.categories.find((c) => c.id === categoryId);
  if (!target) return lib;
  const pageIds = new Set(target.pageIds);
  let categories = lib.categories.filter((c) => c.id !== categoryId);
  let pages = lib.pages.filter((p) => !pageIds.has(p.id));
  if (pages.length === 0) {
    const page = blankPage();
    pages = [page];
    categories = [blankCategory("", [page.id])];
  } else if (categories.length === 0) {
    categories = [blankCategory("", pages.map((p) => p.id))];
  }
  return saveMemoLibrary({ categories, pages });
}

export function toggleCategoryCollapsed(lib: MemoLibrary, categoryId: string): MemoLibrary {
  const categories = lib.categories.map((c) =>
    c.id === categoryId ? { ...c, collapsed: !c.collapsed } : c,
  );
  return saveMemoLibrary({ ...lib, categories });
}

export function renameCategory(lib: MemoLibrary, categoryId: string, name: string): MemoLibrary {
  const categories = lib.categories.map((c) => (c.id === categoryId ? { ...c, name: name.trim() } : c));
  return saveMemoLibrary({ ...lib, categories });
}

export function setCategoryColor(lib: MemoLibrary, categoryId: string, color: string): MemoLibrary {
  const categories = lib.categories.map((c) =>
    c.id === categoryId ? { ...c, color } : c,
  );
  return saveMemoLibrary({ ...lib, categories });
}

export function renameMemoPage(lib: MemoLibrary, pageId: string, title: string): MemoLibrary {
  const pages = lib.pages.map((p) =>
    p.id === pageId ? { ...p, title: title.trim(), updatedAt: Date.now() } : p,
  );
  return saveMemoLibrary({ ...lib, pages });
}

export function reorderCategories(lib: MemoLibrary, orderedIds: string[]): MemoLibrary {
  const map = new Map(lib.categories.map((c) => [c.id, c]));
  const categories = orderedIds.map((id) => map.get(id)).filter(Boolean) as MemoCategory[];
  lib.categories.forEach((c) => {
    if (!categories.some((x) => x.id === c.id)) categories.push(c);
  });
  return saveMemoLibrary({ ...lib, categories });
}

export function reorderPagesInCategory(lib: MemoLibrary, categoryId: string, pageIds: string[]): MemoLibrary {
  const categories = lib.categories.map((c) => (c.id === categoryId ? { ...c, pageIds } : c));
  return saveMemoLibrary({ ...lib, categories });
}

export function movePageToCategory(
  lib: MemoLibrary,
  pageId: string,
  fromCategoryId: string,
  toCategoryId: string,
  toIndex: number,
): MemoLibrary {
  if (fromCategoryId === toCategoryId) {
    const cat = lib.categories.find((c) => c.id === fromCategoryId);
    if (!cat) return lib;
    const ids = cat.pageIds.filter((id) => id !== pageId);
    ids.splice(Math.max(0, Math.min(toIndex, ids.length)), 0, pageId);
    return reorderPagesInCategory(lib, fromCategoryId, ids);
  }
  let categories = lib.categories.map((c) => {
    if (c.id === fromCategoryId) return { ...c, pageIds: c.pageIds.filter((id) => id !== pageId) };
    return c;
  });
  categories = categories.map((c) => {
    if (c.id !== toCategoryId) return c;
    const ids = [...c.pageIds];
    ids.splice(Math.max(0, Math.min(toIndex, ids.length)), 0, pageId);
    return { ...c, pageIds: ids };
  });
  if (!categories.some((c) => c.pageIds.includes(pageId))) {
    const fallback = categories[0] ?? blankCategory("", [pageId]);
    if (!categories.length) categories = [{ ...fallback, pageIds: [pageId] }];
    else {
      categories[0] = { ...categories[0], pageIds: [pageId, ...categories[0].pageIds] };
    }
  }
  return saveMemoLibrary({ ...lib, categories });
}

export function htmlToPlainText(html: string): string {
  if (typeof document === "undefined") {
    return String(html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }
  const wrap = document.createElement("div");
  wrap.innerHTML = html || "";
  return (wrap.textContent || "").replace(/\s+/g, " ").trim();
}

/** Strip duplicate text nodes that contentEditable sometimes inserts before block siblings. */
export function normalizeNoteHtml(html: string): string {
  if (!html?.trim() || typeof document === "undefined") return html || "";
  const wrap = document.createElement("div");
  wrap.innerHTML = html;
  Array.from(wrap.childNodes).forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE && !(node.textContent || "").trim()) {
      node.remove();
    }
  });
  const kids = Array.from(wrap.childNodes);
  for (let i = 0; i < kids.length - 1; i++) {
    const a = kids[i];
    const b = kids[i + 1];
    if (a.nodeType === Node.TEXT_NODE && b instanceof HTMLElement) {
      const ta = (a.textContent || "").trim();
      const tb = (b.textContent || "").trim();
      if (ta && ta === tb) {
        a.remove();
        break;
      }
    }
  }
  return wrap.innerHTML;
}

export function searchMemos(lib: MemoLibrary, query: string): MemoPage[] {
  const q = query.trim().toLowerCase();
  if (!q) return lib.pages;
  return lib.pages.filter((p) => {
    const title = p.title.toLowerCase();
    const body = htmlToPlainText(p.html).toLowerCase();
    return title.includes(q) || body.includes(q);
  });
}

export function findCategoryForPage(lib: MemoLibrary, pageId: string): MemoCategory | undefined {
  return lib.categories.find((c) => c.pageIds.includes(pageId));
}
