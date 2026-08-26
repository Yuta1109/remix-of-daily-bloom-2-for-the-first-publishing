import { useCallback, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronRight, GripVertical, Plus, Trash2 } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  addCategory,
  addMemoToCategory,
  htmlToPlainText,
  loadMemoLibrary,
  movePageToCategory,
  removeMemoPage,
  reorderCategories,
  toggleCategoryCollapsed,
  type MemoCategory,
  type MemoLibrary,
  type MemoPage,
} from "@/lib/notes-store";

type AddStep = "menu" | "category-name" | "pick-category";

export default function MemoListPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [lib, setLib] = useState<MemoLibrary>(() => loadMemoLibrary());
  const [listEditing, setListEditing] = useState(false);
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [addStep, setAddStep] = useState<AddStep>("menu");
  const [categoryName, setCategoryName] = useState("");
  const dragPageRef = useRef<{ pageId: string; categoryId: string } | null>(null);
  const dragCatRef = useRef<string | null>(null);
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const matchedIds = useMemo(() => {
    const q = search.trim();
    if (!q) return null;
    const lower = q.toLowerCase();
    return new Set(
      lib.pages
        .filter((p) => {
          const title = p.title.toLowerCase();
          const body = htmlToPlainText(p.html).toLowerCase();
          return title.includes(lower) || body.includes(lower);
        })
        .map((p) => p.id),
    );
  }, [lib, search]);

  const pageMap = useMemo(() => new Map(lib.pages.map((p) => [p.id, p])), [lib.pages]);

  const persist = useCallback((next: MemoLibrary) => {
    setLib(next);
  }, []);

  const openMemo = (pageId: string) => {
    if (listEditing) return;
    navigate(`/notes/${pageId}`);
  };

  const closeAdd = () => {
    setAddOpen(false);
    setAddStep("menu");
    setCategoryName("");
  };

  const onCreateCategory = () => {
    const name = categoryName.trim() || t("memoUntitledCategory");
    const { lib: next, pageId } = addCategory(lib, name);
    persist(next);
    closeAdd();
    navigate(`/notes/${pageId}`);
  };

  const onCreateMemoInCategory = (categoryId: string) => {
    const { lib: next, page } = addMemoToCategory(lib, categoryId);
    persist(next);
    closeAdd();
    navigate(`/notes/${page.id}`);
  };

  const onDeletePage = (pageId: string) => {
    persist(removeMemoPage(lib, pageId));
  };

  const onPageDrop = (targetCategoryId: string, targetIndex: number) => {
    const drag = dragPageRef.current;
    if (!drag) return;
    const fromCat = lib.categories.find((c) => c.id === drag.categoryId);
    if (!fromCat) return;
    const fromIndex = fromCat.pageIds.indexOf(drag.pageId);
    let index = targetIndex;
    if (drag.categoryId === targetCategoryId && fromIndex >= 0 && fromIndex < targetIndex) {
      index -= 1;
    }
    persist(movePageToCategory(lib, drag.pageId, drag.categoryId, targetCategoryId, index));
    dragPageRef.current = null;
  };

  const onCategoryDrop = (targetIndex: number) => {
    const dragId = dragCatRef.current;
    if (!dragId) return;
    const ids = lib.categories.map((c) => c.id);
    const from = ids.indexOf(dragId);
    if (from < 0) return;
    ids.splice(from, 1);
    ids.splice(Math.max(0, Math.min(targetIndex, ids.length)), 0, dragId);
    persist(reorderCategories(lib, ids));
    dragCatRef.current = null;
  };

  const renderMemoRow = (page: MemoPage, category: MemoCategory, index: number) => {
    const preview = htmlToPlainText(page.html);
    return (
      <div
        key={page.id}
        data-memo-row
        data-category-id={category.id}
        data-index={index}
        className={cn("flex items-center gap-1 rounded-xl bg-secondary/50", listEditing && "pl-1 pr-1")}
      >
        {listEditing ? (
          <button
            type="button"
            className="p-2 text-muted-foreground touch-none shrink-0"
            aria-label={t("memoReorder")}
            onPointerDown={(e) => {
              dragPageRef.current = { pageId: page.id, categoryId: category.id };
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerUp={(e) => {
              e.currentTarget.releasePointerCapture(e.pointerId);
              const el = document.elementFromPoint(e.clientX, e.clientY);
              const row = el?.closest("[data-memo-row]") as HTMLElement | null;
              if (row && dragPageRef.current) {
                onPageDrop(row.dataset.categoryId!, Number(row.dataset.index ?? 0) + 1);
              } else {
                dragPageRef.current = null;
              }
            }}
          >
            <GripVertical className="w-4 h-4" />
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => openMemo(page.id)}
          className="flex-1 min-w-0 text-left rounded-xl px-3 py-2.5"
        >
          <p className="text-sm font-medium truncate">{page.title.trim() || t("memoUntitled")}</p>
          {preview ? (
            <p className="text-[11px] text-muted-foreground truncate mt-0.5">{preview}</p>
          ) : null}
        </button>
        {listEditing ? (
          <button
            type="button"
            onClick={() => onDeletePage(page.id)}
            className="p-2 rounded-xl text-muted-foreground shrink-0"
            aria-label={t("deleteEvent")}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        ) : null}
      </div>
    );
  };

  const visibleCategories = lib.categories
    .map((category) => {
      const pages = category.pageIds
        .map((id) => pageMap.get(id))
        .filter((p): p is MemoPage => !!p)
        .filter((p) => !matchedIds || matchedIds.has(p.id));
      return { category, pages };
    })
    .filter(({ pages }) => pages.length > 0 || !matchedIds);

  return (
    <div className="page-shell">
      <div className="shrink-0 px-3 pt-2 pb-1">
        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2 min-h-[2.75rem]">
          <button
            type="button"
            onClick={() => setListEditing((v) => !v)}
            className="text-sm font-semibold text-accent px-2 py-1.5"
          >
            {listEditing ? t("memoSaveList") : t("memoEditList")}
          </button>
          <h1 className="text-base font-bold text-center truncate">{t("memoListTitle")}</h1>
          <button
            type="button"
            onClick={() => {
              setAddOpen(true);
              setAddStep("menu");
            }}
            className="justify-self-end p-2 rounded-full text-accent"
            aria-label={t("memoAdd")}
          >
            <Plus className="w-5 h-5" strokeWidth={2.5} />
          </button>
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("memoSearchPlaceholder")}
          className="mt-3 w-full bg-secondary/70 rounded-xl px-4 py-2.5 text-sm outline-none placeholder:text-muted-foreground/50"
        />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-3 space-y-4">
        {visibleCategories.map(({ category, pages }, catIndex) => (
          <section key={category.id}>
            <button
              type="button"
              className={cn("w-full flex items-center gap-1.5 py-1.5 text-left", listEditing && "touch-none")}
              onClick={() => {
                if (listEditing) return;
                persist(toggleCategoryCollapsed(lib, category.id));
              }}
              onPointerDown={() => {
                if (!listEditing) return;
                longPressRef.current = setTimeout(() => {
                  dragCatRef.current = category.id;
                }, 420);
              }}
              onPointerUp={() => {
                if (longPressRef.current) {
                  clearTimeout(longPressRef.current);
                  longPressRef.current = null;
                }
                if (dragCatRef.current && listEditing) {
                  onCategoryDrop(catIndex + 1);
                  dragCatRef.current = null;
                }
              }}
              onPointerCancel={() => {
                if (longPressRef.current) clearTimeout(longPressRef.current);
                dragCatRef.current = null;
              }}
            >
              {category.collapsed && !listEditing ? (
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              ) : (
                <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
              )}
              <span className="text-sm font-semibold truncate">
                {category.name.trim() || t("memoUntitledCategory")}
              </span>
            </button>
            {(!category.collapsed || listEditing) && (
              <div className="space-y-1 mt-1">
                {pages.map((page, index) => renderMemoRow(page, category, index))}
              </div>
            )}
          </section>
        ))}
      </div>

      {addOpen &&
        createPortal(
          <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-4">
            <button type="button" className="absolute inset-0 bg-black/30" onClick={closeAdd} aria-label={t("cancel")} />
            <div className="relative z-10 w-full max-w-md bg-background rounded-3xl shadow-float overflow-hidden">
              {addStep === "menu" && (
                <div className="p-2">
                  <button
                    type="button"
                    className="w-full text-left px-4 py-3.5 rounded-xl text-sm font-medium hover:bg-secondary/60"
                    onClick={() => setAddStep("category-name")}
                  >
                    {t("memoNewCategory")}
                  </button>
                  <button
                    type="button"
                    className="w-full text-left px-4 py-3.5 rounded-xl text-sm font-medium hover:bg-secondary/60"
                    onClick={() => setAddStep("pick-category")}
                  >
                    {t("memoNew")}
                  </button>
                </div>
              )}
              {addStep === "category-name" && (
                <div className="p-5">
                  <p className="text-sm font-semibold mb-3">{t("memoCategoryNamePrompt")}</p>
                  <input
                    autoFocus
                    value={categoryName}
                    onChange={(e) => setCategoryName(e.target.value)}
                    placeholder={t("memoUntitledCategory")}
                    className="w-full bg-secondary/70 rounded-xl px-4 py-3 text-sm outline-none mb-4"
                  />
                  <button
                    type="button"
                    onClick={onCreateCategory}
                    className="w-full h-11 rounded-xl bg-accent text-accent-foreground text-sm font-semibold"
                  >
                    {t("add")}
                  </button>
                </div>
              )}
              {addStep === "pick-category" && (
                <div className="max-h-[70dvh] overflow-y-auto p-2">
                  <p className="px-4 py-2 text-sm font-semibold">{t("memoPickCategory")}</p>
                  {lib.categories.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className="w-full text-left px-4 py-3 rounded-xl text-sm hover:bg-secondary/60"
                      onClick={() => onCreateMemoInCategory(c.id)}
                    >
                      {c.name.trim() || t("memoUntitledCategory")}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="w-full text-left px-4 py-3 rounded-xl text-sm text-accent font-medium hover:bg-secondary/60"
                    onClick={() => setAddStep("category-name")}
                  >
                    {t("memoNewCategoryOption")}
                  </button>
                </div>
              )}
              <div className="border-t border-border/50 p-2">
                <button type="button" onClick={closeAdd} className="w-full py-2 text-sm text-muted-foreground">
                  {t("cancel")}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
