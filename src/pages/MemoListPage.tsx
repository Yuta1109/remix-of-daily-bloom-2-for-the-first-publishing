import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";
import { Capacitor } from "@capacitor/core";
import { Keyboard } from "@capacitor/keyboard";
import { ChevronDown, ChevronRight, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  addCategory,
  addMemoToCategory,
  htmlToPlainText,
  loadMemoLibrary,
  MEMO_CATEGORY_COLORS,
  movePageToCategory,
  removeCategory,
  removeMemoPage,
  renameCategory,
  renameMemoPage,
  reorderCategories,
  setCategoryColor,
  toggleCategoryCollapsed,
  type MemoCategory,
  type MemoLibrary,
  type MemoPage,
} from "@/lib/notes-store";

type AddStep = "menu" | "category-name" | "pick-category";

type ContextMenu =
  | { kind: "category"; categoryId: string; showColors?: boolean }
  | { kind: "memo"; pageId: string; categoryId: string }
  | null;

type PressTarget =
  | { kind: "memo"; pageId: string; categoryId: string; index: number }
  | { kind: "category"; categoryId: string; index: number };

const LONG_PRESS_MS = 420;
const DRAG_THRESHOLD = 10;

function formatLastEdited(ts: number, locale: string) {
  return new Date(ts).toLocaleDateString(locale === "ja" ? "ja-JP" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function MemoListPage() {
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const [lib, setLib] = useState<MemoLibrary>(() => loadMemoLibrary());
  const [listEditing, setListEditing] = useState(false);
  const [search, setSearch] = useState("");
  const [searchVisible, setSearchVisible] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addStep, setAddStep] = useState<AddStep>("menu");
  const [categoryName, setCategoryName] = useState("");
  const [kbHeight, setKbHeight] = useState(0);
  const [contextMenu, setContextMenu] = useState<ContextMenu>(null);
  const [renameTarget, setRenameTarget] = useState<
    { kind: "category"; id: string; value: string } | { kind: "memo"; id: string; value: string } | null
  >(null);
  const [dragging, setDragging] = useState<PressTarget | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const lastScrollTop = useRef(0);
  const pressRef = useRef<{
    target: PressTarget;
    startX: number;
    startY: number;
    timer: ReturnType<typeof setTimeout>;
    longPress: boolean;
    moved: boolean;
  } | null>(null);

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

  useEffect(() => {
    if (!addOpen) {
      setKbHeight(0);
      return;
    }
    const onViewport = () => {
      const vv = window.visualViewport;
      if (!vv) return;
      const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setKbHeight(kb > 50 ? kb : 0);
    };
    onViewport();
    window.visualViewport?.addEventListener("resize", onViewport);
    window.visualViewport?.addEventListener("scroll", onViewport);

    let showHandle: { remove: () => Promise<void> } | undefined;
    let hideHandle: { remove: () => Promise<void> } | undefined;
    if (Capacitor.isNativePlatform()) {
      void Keyboard.addListener("keyboardWillShow", (info) => {
        setKbHeight(info.keyboardHeight ?? 0);
      }).then((h) => {
        showHandle = h;
      });
      void Keyboard.addListener("keyboardDidHide", () => setKbHeight(0)).then((h) => {
        hideHandle = h;
      });
    }

    return () => {
      window.visualViewport?.removeEventListener("resize", onViewport);
      window.visualViewport?.removeEventListener("scroll", onViewport);
      void showHandle?.remove();
      void hideHandle?.remove();
    };
  }, [addOpen]);

  const closeAdd = () => {
    setAddOpen(false);
    setAddStep("menu");
    setCategoryName("");
    setKbHeight(0);
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

  const openMemo = (pageId: string) => {
    if (listEditing) return;
    navigate(`/notes/${pageId}`);
  };

  const clearPress = () => {
    if (pressRef.current) {
      clearTimeout(pressRef.current.timer);
      pressRef.current = null;
    }
  };

  const onPageDrop = (drag: PressTarget, targetCategoryId: string, targetIndex: number) => {
    if (drag.kind !== "memo") return;
    const fromCat = lib.categories.find((c) => c.id === drag.categoryId);
    if (!fromCat) return;
    const fromIndex = fromCat.pageIds.indexOf(drag.pageId);
    let index = targetIndex;
    if (drag.categoryId === targetCategoryId && fromIndex >= 0 && fromIndex < targetIndex) {
      index -= 1;
    }
    persist(movePageToCategory(lib, drag.pageId, drag.categoryId, targetCategoryId, index));
  };

  const onCategoryDrop = (dragId: string, targetIndex: number) => {
    const ids = lib.categories.map((c) => c.id);
    const from = ids.indexOf(dragId);
    if (from < 0) return;
    ids.splice(from, 1);
    ids.splice(Math.max(0, Math.min(targetIndex, ids.length)), 0, dragId);
    persist(reorderCategories(lib, ids));
  };

  const startPress = (target: PressTarget, clientX: number, clientY: number) => {
    clearPress();
    const timer = setTimeout(() => {
      if (pressRef.current) pressRef.current.longPress = true;
    }, LONG_PRESS_MS);
    pressRef.current = { target, startX: clientX, startY: clientY, timer, longPress: false, moved: false };
  };

  const onPressMove = (clientX: number, clientY: number) => {
    const press = pressRef.current;
    if (!press || !press.longPress) return;
    const dx = clientX - press.startX;
    const dy = clientY - press.startY;
    if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    press.moved = true;
    setDragging(press.target);
  };

  const onPressEnd = (clientX: number, clientY: number) => {
    const press = pressRef.current;
    if (!press) return;
    clearPress();

    if (press.moved && press.longPress) {
      const el = document.elementFromPoint(clientX, clientY);
      if (press.target.kind === "memo") {
        const row = el?.closest("[data-memo-row]") as HTMLElement | null;
        if (row) {
          onPageDrop(press.target, row.dataset.categoryId!, Number(row.dataset.index ?? 0) + 1);
        }
      } else {
        const section = el?.closest("[data-category-section]") as HTMLElement | null;
        if (section) {
          onCategoryDrop(press.target.categoryId, Number(section.dataset.catIndex ?? 0) + 1);
        }
      }
      setDragging(null);
      return;
    }

    if (press.longPress && !press.moved) {
      if (press.target.kind === "category") {
        setContextMenu({ kind: "category", categoryId: press.target.categoryId });
      } else {
        setContextMenu({
          kind: "memo",
          pageId: press.target.pageId,
          categoryId: press.target.categoryId,
        });
      }
      return;
    }

    if (!press.longPress && press.target.kind === "memo" && !listEditing) {
      openMemo(press.target.pageId);
    }
  };

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const st = el.scrollTop;
    if (st > lastScrollTop.current && st > 24) setSearchVisible(true);
    if (st < lastScrollTop.current - 4) setSearchVisible(false);
    lastScrollTop.current = st;
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

  const renderMemoRow = (page: MemoPage, category: MemoCategory, index: number) => {
    const preview = htmlToPlainText(page.html);
    const isRenaming = renameTarget?.kind === "memo" && renameTarget.id === page.id;
    const isDragging = dragging?.kind === "memo" && dragging.pageId === page.id;

    return (
      <div
        key={page.id}
        data-memo-row
        data-category-id={category.id}
        data-index={index}
        className={cn(
          "flex items-center gap-2 rounded-2xl bg-background/80 border border-border/30 px-2 py-2 transition-opacity",
          isDragging && "opacity-40",
        )}
        onPointerDown={(e) => {
          if (isRenaming || (e.target as HTMLElement).closest("[data-pencil]")) return;
          startPress({ kind: "memo", pageId: page.id, categoryId: category.id, index }, e.clientX, e.clientY);
        }}
        onPointerMove={(e) => onPressMove(e.clientX, e.clientY)}
        onPointerUp={(e) => onPressEnd(e.clientX, e.clientY)}
        onPointerCancel={clearPress}
      >
        <button
          type="button"
          data-pencil
          onClick={(e) => {
            e.stopPropagation();
            setRenameTarget({ kind: "memo", id: page.id, value: page.title });
          }}
          className="p-2 rounded-xl text-muted-foreground shrink-0 hover:bg-secondary/60"
          aria-label={t("memoEditTitle")}
        >
          <Pencil className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          {isRenaming ? (
            <input
              autoFocus
              value={renameTarget.value}
              onChange={(e) => setRenameTarget({ ...renameTarget, value: e.target.value })}
              onBlur={() => {
                persist(renameMemoPage(lib, page.id, renameTarget.value));
                setRenameTarget(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
              className="w-full bg-secondary/70 rounded-lg px-2 py-1 text-sm font-semibold outline-none"
            />
          ) : (
            <>
              <p className="text-[15px] font-semibold leading-snug truncate">
                {page.title.trim() || t("memoUntitled")}
              </p>
              {preview ? (
                <p className="text-xs text-muted-foreground truncate mt-0.5">{preview}</p>
              ) : null}
              <p className="text-[10px] text-muted-foreground/70 mt-1">
                {t("memoLastEdited")}: {formatLastEdited(page.updatedAt, locale)}
              </p>
            </>
          )}
        </div>
        {listEditing ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              persist(removeMemoPage(lib, page.id));
            }}
            className="p-2 rounded-xl text-muted-foreground shrink-0"
            aria-label={t("deleteEvent")}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        ) : null}
      </div>
    );
  };

  const sheetBottom = kbHeight > 0 ? kbHeight + 12 : undefined;

  return (
    <div className="page-shell">
      <div className="shrink-0 px-4 pt-3 pb-2">
        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2 min-h-[3rem]">
          <button
            type="button"
            onClick={() => setListEditing((v) => !v)}
            className="text-lg font-bold text-accent px-1 py-1"
          >
            {listEditing ? t("memoSaveList") : t("memoEditList")}
          </button>
          <h1 className="text-xl font-bold text-center truncate">{t("memoListTitle")}</h1>
          <button
            type="button"
            onClick={() => {
              setAddOpen(true);
              setAddStep("menu");
            }}
            className="justify-self-end p-2 rounded-full bg-accent/10 text-accent"
            aria-label={t("memoAdd")}
          >
            <Plus className="w-6 h-6" strokeWidth={2.5} />
          </button>
        </div>
        <div
          className={cn(
            "overflow-hidden transition-all duration-300 ease-out",
            searchVisible ? "max-h-14 opacity-100 mt-3" : "max-h-0 opacity-0 mt-0",
          )}
        >
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("memoSearchPlaceholder")}
              className="w-full bg-card rounded-2xl pl-10 pr-4 py-3 text-sm outline-none shadow-soft border border-border/40 placeholder:text-muted-foreground/50"
            />
          </div>
        </div>
      </div>

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 min-h-0 overflow-y-auto px-4 pb-4 space-y-4"
      >
        {visibleCategories.map(({ category, pages }, catIndex) => {
          const isRenaming =
            renameTarget?.kind === "category" && renameTarget.id === category.id;
          const isDragging = dragging?.kind === "category" && dragging.categoryId === category.id;
          const cardColor = category.color || MEMO_CATEGORY_COLORS[0];

          return (
            <section
              key={category.id}
              data-category-section
              data-cat-index={catIndex}
              className={cn(
                "rounded-3xl border border-border/40 shadow-soft overflow-hidden transition-opacity",
                isDragging && "opacity-40",
              )}
              style={{ backgroundColor: cardColor }}
            >
              <div
                className="flex items-center gap-2 px-4 py-3 touch-none"
                onPointerDown={(e) => {
                  if (isRenaming) return;
                  startPress(
                    { kind: "category", categoryId: category.id, index: catIndex },
                    e.clientX,
                    e.clientY,
                  );
                }}
                onPointerMove={(e) => onPressMove(e.clientX, e.clientY)}
                onPointerUp={(e) => onPressEnd(e.clientX, e.clientY)}
                onPointerCancel={clearPress}
              >
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!listEditing) persist(toggleCategoryCollapsed(lib, category.id));
                  }}
                  className="p-1 -ml-1 text-foreground/70"
                  aria-label={category.collapsed ? "expand" : "collapse"}
                >
                  {category.collapsed && !listEditing ? (
                    <ChevronRight className="w-5 h-5" />
                  ) : (
                    <ChevronDown className="w-5 h-5" />
                  )}
                </button>
                {isRenaming ? (
                  <input
                    autoFocus
                    value={renameTarget.value}
                    onChange={(e) => setRenameTarget({ ...renameTarget, value: e.target.value })}
                    onBlur={() => {
                      persist(renameCategory(lib, category.id, renameTarget.value));
                      setRenameTarget(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.blur();
                    }}
                    className="flex-1 bg-background/70 rounded-xl px-3 py-1.5 text-base font-bold outline-none"
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span className="flex-1 text-base font-bold truncate">
                    {category.name.trim() || t("memoUntitledCategory")}
                  </span>
                )}
                <span className="text-sm font-semibold text-muted-foreground bg-background/60 rounded-full px-2.5 py-0.5 min-w-[1.75rem] text-center">
                  {pages.length}
                </span>
              </div>
              {(!category.collapsed || listEditing) && (
                <div className="space-y-2 px-3 pb-3">
                  {pages.map((page, index) => renderMemoRow(page, category, index))}
                </div>
              )}
            </section>
          );
        })}
      </div>

      {addOpen &&
        createPortal(
          <div className="fixed inset-0 z-[70]">
            <button
              type="button"
              className="absolute inset-0 bg-black/30"
              onClick={closeAdd}
              aria-label={t("cancel")}
            />
            <div
              className="absolute left-4 right-4 z-10 max-w-md mx-auto bg-background rounded-3xl shadow-float overflow-hidden"
              style={{ bottom: sheetBottom ?? "max(1rem, env(safe-area-inset-bottom))" }}
            >
              {addStep === "menu" && (
                <div className="p-2">
                  <button
                    type="button"
                    className="w-full text-left px-4 py-3.5 rounded-2xl text-base font-medium hover:bg-secondary/60"
                    onClick={() => setAddStep("category-name")}
                  >
                    {t("memoNewCategory")}
                  </button>
                  <button
                    type="button"
                    className="w-full text-left px-4 py-3.5 rounded-2xl text-base font-medium hover:bg-secondary/60"
                    onClick={() => setAddStep("pick-category")}
                  >
                    {t("memoNew")}
                  </button>
                </div>
              )}
              {addStep === "category-name" && (
                <div className="p-5">
                  <p className="text-base font-semibold mb-3">{t("memoCategoryNamePrompt")}</p>
                  <input
                    autoFocus
                    value={categoryName}
                    onChange={(e) => setCategoryName(e.target.value)}
                    placeholder={t("memoUntitledCategory")}
                    className="w-full bg-secondary/70 rounded-2xl px-4 py-3 text-base outline-none mb-4"
                  />
                  <button
                    type="button"
                    onClick={onCreateCategory}
                    className="w-full h-12 rounded-2xl bg-accent text-accent-foreground text-base font-semibold"
                  >
                    {t("add")}
                  </button>
                </div>
              )}
              {addStep === "pick-category" && (
                <div className="max-h-[50dvh] overflow-y-auto p-2">
                  <p className="px-4 py-2 text-base font-semibold">{t("memoPickCategory")}</p>
                  {lib.categories.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className="w-full text-left px-4 py-3 rounded-2xl text-base hover:bg-secondary/60"
                      onClick={() => onCreateMemoInCategory(c.id)}
                    >
                      {c.name.trim() || t("memoUntitledCategory")}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="w-full text-left px-4 py-3 rounded-2xl text-base text-accent font-medium hover:bg-secondary/60"
                    onClick={() => setAddStep("category-name")}
                  >
                    {t("memoNewCategoryOption")}
                  </button>
                </div>
              )}
              <div className="border-t border-border/50 p-2">
                <button type="button" onClick={closeAdd} className="w-full py-2.5 text-sm text-muted-foreground">
                  {t("cancel")}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {contextMenu &&
        createPortal(
          <div className="fixed inset-0 z-[75]">
            <button
              type="button"
              className="absolute inset-0 bg-black/30"
              onClick={() => setContextMenu(null)}
              aria-label={t("cancel")}
            />
            <div
              className="absolute left-4 right-4 bottom-8 max-w-md mx-auto bg-background rounded-3xl shadow-float overflow-hidden p-2"
              style={{ bottom: sheetBottom ?? undefined }}
            >
              {contextMenu.kind === "category" && !contextMenu.showColors && (
                <>
                  <button
                    type="button"
                    className="w-full text-left px-4 py-3.5 rounded-2xl text-base font-medium hover:bg-secondary/60"
                    onClick={() => {
                      const cat = lib.categories.find((c) => c.id === contextMenu.categoryId);
                      setContextMenu(null);
                      if (cat) setRenameTarget({ kind: "category", id: cat.id, value: cat.name });
                    }}
                  >
                    {t("memoEditTitle")}
                  </button>
                  <button
                    type="button"
                    className="w-full text-left px-4 py-3.5 rounded-2xl text-base font-medium hover:bg-secondary/60"
                    onClick={() => setContextMenu({ ...contextMenu, showColors: true })}
                  >
                    {t("memoChangeColor")}
                  </button>
                  <button
                    type="button"
                    className="w-full text-left px-4 py-3.5 rounded-2xl text-base font-medium text-destructive hover:bg-destructive/10"
                    onClick={() => {
                      persist(removeCategory(lib, contextMenu.categoryId));
                      setContextMenu(null);
                    }}
                  >
                    {t("memoDeleteCategory")}
                  </button>
                </>
              )}
              {contextMenu.kind === "category" && contextMenu.showColors && (
                <div className="px-4 py-3">
                  <p className="text-sm font-semibold mb-3">{t("memoChangeColor")}</p>
                  <div className="flex flex-wrap gap-3 justify-center">
                    {MEMO_CATEGORY_COLORS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        className="w-10 h-10 rounded-full border-2 border-border/50 shadow-sm"
                        style={{ backgroundColor: color }}
                        onClick={() => {
                          persist(setCategoryColor(lib, contextMenu.categoryId, color));
                          setContextMenu(null);
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}
              {contextMenu.kind === "memo" && (
                <>
                  {(() => {
                    const page = pageMap.get(contextMenu.pageId);
                    if (!page) return null;
                    return (
                      <p className="px-4 py-2 text-xs text-muted-foreground border-b border-border/40">
                        {t("memoLastEdited")}: {formatLastEdited(page.updatedAt, locale)}
                      </p>
                    );
                  })()}
                  <button
                    type="button"
                    className="w-full text-left px-4 py-3.5 rounded-2xl text-base font-medium hover:bg-secondary/60"
                    onClick={() => {
                      const page = pageMap.get(contextMenu.pageId);
                      setContextMenu(null);
                      if (page) setRenameTarget({ kind: "memo", id: page.id, value: page.title });
                    }}
                  >
                    {t("memoEditTitle")}
                  </button>
                  <button
                    type="button"
                    className="w-full text-left px-4 py-3.5 rounded-2xl text-base font-medium text-destructive hover:bg-destructive/10"
                    onClick={() => {
                      persist(removeMemoPage(lib, contextMenu.pageId));
                      setContextMenu(null);
                    }}
                  >
                    {t("deleteEvent")}
                  </button>
                </>
              )}
              <div className="border-t border-border/50 mt-1 pt-1">
                <button
                  type="button"
                  onClick={() => setContextMenu(null)}
                  className="w-full py-2.5 text-sm text-muted-foreground"
                >
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
