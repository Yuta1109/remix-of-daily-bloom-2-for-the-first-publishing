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
  isWelcomeMemo,
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

type DragGhost = {
  target: PressTarget;
  x: number;
  y: number;
  width: number;
  offsetX: number;
  offsetY: number;
  label: string;
  cardColor?: string;
};

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
  const [dragGhost, setDragGhost] = useState<DragGhost | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const lastScrollTop = useRef(0);
  const pressRef = useRef<{
    target: PressTarget;
    startX: number;
    startY: number;
    timer: ReturnType<typeof setTimeout>;
    longPress: boolean;
    moved: boolean;
    element: HTMLElement;
  } | null>(null);
  const libRef = useRef(lib);
  libRef.current = lib;

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
    const { lib: next } = addCategory(lib, name);
    persist(next);
    closeAdd();
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

  const onPageDrop = useCallback((drag: PressTarget, targetCategoryId: string, targetIndex: number) => {
    if (drag.kind !== "memo") return;
    const current = libRef.current;
    const fromCat = current.categories.find((c) => c.id === drag.categoryId);
    if (!fromCat) return;
    const fromIndex = fromCat.pageIds.indexOf(drag.pageId);
    let index = targetIndex;
    if (drag.categoryId === targetCategoryId && fromIndex >= 0 && fromIndex < targetIndex) {
      index -= 1;
    }
    persist(movePageToCategory(current, drag.pageId, drag.categoryId, targetCategoryId, index));
  }, [persist]);

  const onCategoryDrop = useCallback((dragId: string, targetIndex: number) => {
    const current = libRef.current;
    const ids = current.categories.map((c) => c.id);
    const from = ids.indexOf(dragId);
    if (from < 0) return;
    ids.splice(from, 1);
    ids.splice(Math.max(0, Math.min(targetIndex, ids.length)), 0, dragId);
    persist(reorderCategories(current, ids));
  }, [persist]);

  const finishDrag = useCallback(
    (clientX: number, clientY: number, target: PressTarget) => {
      const el = document.elementFromPoint(clientX, clientY);
      if (target.kind === "memo") {
        const row = el?.closest("[data-memo-row]") as HTMLElement | null;
        if (row) {
          onPageDrop(target, row.dataset.categoryId!, Number(row.dataset.index ?? 0) + 1);
        }
      } else {
        const section = el?.closest("[data-category-section]") as HTMLElement | null;
        if (section) {
          onCategoryDrop(target.categoryId, Number(section.dataset.catIndex ?? 0) + 1);
        }
      }
    },
    [onCategoryDrop, onPageDrop],
  );

  useEffect(() => {
    if (!dragGhost) return;
    const onMove = (e: PointerEvent) => {
      setDragGhost((g) => (g ? { ...g, x: e.clientX, y: e.clientY } : null));
    };
    document.addEventListener("pointermove", onMove);
    return () => document.removeEventListener("pointermove", onMove);
  }, [dragGhost]);

  const startPress = (target: PressTarget, el: HTMLElement, clientX: number, clientY: number) => {
    clearPress();
    const timer = setTimeout(() => {
      if (pressRef.current) pressRef.current.longPress = true;
    }, LONG_PRESS_MS);
    pressRef.current = { target, startX: clientX, startY: clientY, timer, longPress: false, moved: false, element: el };
  };

  const onPressMove = (clientX: number, clientY: number) => {
    const press = pressRef.current;
    if (!press || !press.longPress) return;
    const dx = clientX - press.startX;
    const dy = clientY - press.startY;
    if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    if (!press.moved) {
      press.moved = true;
      const rect = press.element.getBoundingClientRect();
      const page = press.target.kind === "memo" ? pageMap.get(press.target.pageId) : null;
      const cat =
        press.target.kind === "category"
          ? lib.categories.find((c) => c.id === press.target.categoryId)
          : null;
      setDragGhost({
        target: press.target,
        x: clientX,
        y: clientY,
        width: rect.width,
        offsetX: clientX - rect.left,
        offsetY: clientY - rect.top,
        label:
          press.target.kind === "memo"
            ? page?.title.trim() || t("memoUntitled")
            : cat?.name.trim() || t("memoUntitledCategory"),
        cardColor:
          press.target.kind === "category"
            ? cat?.color || MEMO_CATEGORY_COLORS[0]
            : undefined,
      });
    }
  };

  const onPressEnd = (clientX: number, clientY: number) => {
    const press = pressRef.current;
    if (!press) return;
    clearPress();

    if (press.moved && press.longPress) {
      finishDrag(clientX, clientY, press.target);
      setDragGhost(null);
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
    if (st > lastScrollTop.current && st > 16) setSearchVisible(true);
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
    .filter(({ pages }) => !matchedIds || pages.length > 0);

  const isDraggingMemo = (pageId: string) =>
    dragGhost?.target.kind === "memo" && dragGhost.target.pageId === pageId;
  const isDraggingCategory = (categoryId: string) =>
    dragGhost?.target.kind === "category" && dragGhost.target.categoryId === categoryId;

  const renderMemoRow = (page: MemoPage, category: MemoCategory, index: number) => {
    const preview = htmlToPlainText(page.html);
    const isRenaming = renameTarget?.kind === "memo" && renameTarget.id === page.id;
    const welcome = isWelcomeMemo(page.id);
    const dragging = isDraggingMemo(page.id);

    return (
      <div
        key={page.id}
        data-memo-row
        data-category-id={category.id}
        data-index={index}
        className={cn(
          "flex items-center gap-2 rounded-2xl bg-background/80 border border-border/30 px-2 py-2 transition-opacity",
          dragging && "opacity-30",
        )}
        onPointerDown={(e) => {
          if (isRenaming || (e.target as HTMLElement).closest("[data-pencil],[data-trash]")) return;
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          startPress({ kind: "memo", pageId: page.id, categoryId: category.id, index }, e.currentTarget, e.clientX, e.clientY);
        }}
        onPointerMove={(e) => onPressMove(e.clientX, e.clientY)}
        onPointerUp={(e) => {
          (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
          onPressEnd(e.clientX, e.clientY);
        }}
        onPointerCancel={clearPress}
      >
        {listEditing ? (
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
        ) : null}
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
              {!welcome && preview ? (
                <p className="text-xs text-muted-foreground truncate mt-0.5">{preview}</p>
              ) : null}
              {!welcome ? (
                <p className="text-[10px] text-muted-foreground/70 mt-1">
                  {t("memoLastEdited")}: {formatLastEdited(page.updatedAt, locale)}
                </p>
              ) : null}
            </>
          )}
        </div>
        {listEditing ? (
          <button
            type="button"
            data-trash
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
            className={cn(
              "text-lg font-bold px-4 py-2 rounded-2xl transition-colors",
              listEditing
                ? "bg-accent text-accent-foreground shadow-soft"
                : "bg-accent/15 text-accent",
            )}
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
      </div>

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 min-h-0 overflow-y-auto px-4 pb-4"
      >
        <div
          className={cn(
            "sticky top-0 z-10 -mx-1 px-1 overflow-hidden transition-all duration-300 ease-out bg-background/95 backdrop-blur-sm",
            searchVisible ? "max-h-16 opacity-100 mb-3 pt-1" : "max-h-0 opacity-0 mb-0 pointer-events-none",
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

        <div className="space-y-4">
          {visibleCategories.map(({ category, pages }, catIndex) => {
            const isRenaming =
              renameTarget?.kind === "category" && renameTarget.id === category.id;
            const dragging = isDraggingCategory(category.id);
            const cardColor = category.color || MEMO_CATEGORY_COLORS[0];
            const memoCount = category.pageIds.length;

            return (
              <section
                key={category.id}
                data-category-section
                data-cat-index={catIndex}
                className={cn(
                  "rounded-3xl border border-border/40 shadow-soft overflow-hidden transition-opacity",
                  dragging && "opacity-30",
                )}
                style={{ backgroundColor: cardColor }}
              >
                <div
                  className="flex items-center gap-2 px-4 py-3 touch-none"
                  onPointerDown={(e) => {
                    if (isRenaming || (e.target as HTMLElement).closest("[data-pencil],[data-chevron]")) return;
                    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                    startPress(
                      { kind: "category", categoryId: category.id, index: catIndex },
                      e.currentTarget.closest("section") as HTMLElement,
                      e.clientX,
                      e.clientY,
                    );
                  }}
                  onPointerMove={(e) => onPressMove(e.clientX, e.clientY)}
                  onPointerUp={(e) => {
                    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
                    onPressEnd(e.clientX, e.clientY);
                  }}
                  onPointerCancel={clearPress}
                >
                  {listEditing ? (
                    <button
                      type="button"
                      data-pencil
                      onClick={(e) => {
                        e.stopPropagation();
                        setRenameTarget({ kind: "category", id: category.id, value: category.name });
                      }}
                      className="p-1.5 rounded-xl text-muted-foreground shrink-0 hover:bg-background/50"
                      aria-label={t("memoEditTitle")}
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                  ) : null}
                  <button
                    type="button"
                    data-chevron
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!listEditing) persist(toggleCategoryCollapsed(lib, category.id));
                    }}
                    className="p-1 -ml-1 text-foreground/70 shrink-0"
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
                  <span className="text-sm font-semibold text-muted-foreground bg-background/60 rounded-full px-2.5 py-0.5 min-w-[1.75rem] text-center shrink-0">
                    {memoCount}
                  </span>
                </div>
                {(!category.collapsed || listEditing) && (
                  <div className="space-y-2 px-3 pb-3">
                    {pages.map((page, index) => renderMemoRow(page, category, index))}
                    {pages.length === 0 && !matchedIds ? (
                      <p className="text-xs text-muted-foreground/60 text-center py-3">{t("memoEmptyCategory")}</p>
                    ) : null}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </div>

      {dragGhost &&
        createPortal(
          <div
            className="fixed z-[80] pointer-events-none rounded-2xl border border-border/50 shadow-float px-4 py-3 font-semibold text-sm truncate"
            style={{
              left: dragGhost.x - dragGhost.offsetX,
              top: dragGhost.y - dragGhost.offsetY,
              width: dragGhost.width,
              backgroundColor: dragGhost.cardColor || "hsl(var(--card))",
              opacity: 0.95,
            }}
          >
            {dragGhost.label}
          </div>,
          document.body,
        )}

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
              className="absolute left-4 right-4 max-w-md mx-auto bg-background rounded-3xl shadow-float overflow-hidden p-2"
              style={{ bottom: sheetBottom ?? "max(2rem, env(safe-area-inset-bottom))" }}
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
                    if (!page || isWelcomeMemo(page.id)) return null;
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
