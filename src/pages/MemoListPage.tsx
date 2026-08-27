import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";
import { Capacitor } from "@capacitor/core";
import { Keyboard } from "@capacitor/keyboard";
import { ChevronDown, ChevronRight, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { tickHaptic } from "@/lib/haptics";
import {
  addCategory,
  addMemoToCategory,
  htmlToPlainText,
  isWelcomeMemo,
  loadMemoLibrary,
  MEMO_CATEGORY_COLORS,
  categoryPickerColors,
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
  | { kind: "category"; categoryId: string };

type MemoDragGhost = {
  pageId: string;
  categoryId: string;
  index: number;
  x: number;
  y: number;
  width: number;
  label: string;
};

type MemoDropPreview = {
  categoryId: string;
  index: number;
};

type CategoryDragState = {
  categoryId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  cardColor: string;
  pointerOffsetY: number;
};

type CategoryDropPosition = {
  overCategoryId: string;
  side: "before" | "after";
};

type MemoDisplayItem =
  | { kind: "memo"; page: MemoPage; index: number }
  | { kind: "placeholder" };

const LONG_PRESS_MS = 420;
const DRAG_THRESHOLD = 10;
const CATEGORY_SHIFT_TRANSITION = "transform 180ms ease";
const CATEGORY_LIST_GAP = 16;

function memoInsertIndex(
  drag: { categoryId: string; index: number },
  preview: { categoryId: string; index: number },
): number {
  let insertAt = preview.index;
  if (drag.categoryId === preview.categoryId && drag.index < preview.index) {
    insertAt -= 1;
  }
  return Math.max(0, insertAt);
}

function buildMemoDisplayList(
  pages: MemoPage[],
  categoryId: string,
  memoDragGhost: MemoDragGhost | null,
  memoDropPreview: MemoDropPreview | null,
): MemoDisplayItem[] {
  const drag = memoDragGhost;
  const preview = memoDropPreview?.categoryId === categoryId ? memoDropPreview : null;

  const filtered =
    drag && drag.categoryId === categoryId ? pages.filter((p) => p.id !== drag.pageId) : pages;

  let insertAt: number | null = null;
  if (drag && preview) {
    insertAt = memoInsertIndex(drag, preview);
    insertAt = Math.min(insertAt, filtered.length);
  }

  const items: MemoDisplayItem[] = [];
  filtered.forEach((page, i) => {
    if (insertAt === i) items.push({ kind: "placeholder" });
    items.push({ kind: "memo", page, index: pages.indexOf(page) });
  });
  if (insertAt === filtered.length) items.push({ kind: "placeholder" });
  return items;
}

function findCategoryDropPosition(
  pointerY: number,
  draggingCategoryId: string,
  orderedCategoryIds: string[],
  scrollRoot: HTMLElement | null,
): CategoryDropPosition | null {
  if (!scrollRoot || orderedCategoryIds.length === 0) return null;

  const sections = orderedCategoryIds
    .map((id) => scrollRoot.querySelector<HTMLElement>(`[data-category-section][data-category-id="${id}"]`))
    .filter((el): el is HTMLElement => !!el);

  const others = sections.filter((el) => el.dataset.categoryId !== draggingCategoryId);
  if (others.length === 0) return null;

  for (const section of others) {
    const rect = section.getBoundingClientRect();
    if (pointerY >= rect.top && pointerY <= rect.bottom) {
      const midpoint = (rect.top + rect.bottom) / 2;
      return {
        overCategoryId: section.dataset.categoryId!,
        side: pointerY < midpoint ? "before" : "after",
      };
    }
  }

  const first = others[0];
  const last = others[others.length - 1];
  const firstRect = first.getBoundingClientRect();
  const lastRect = last.getBoundingClientRect();

  if (pointerY < firstRect.top) {
    return { overCategoryId: first.dataset.categoryId!, side: "before" };
  }
  if (pointerY > lastRect.bottom) {
    return { overCategoryId: last.dataset.categoryId!, side: "after" };
  }

  return null;
}

function computeCategoryShiftMap(
  orderedIds: string[],
  dragId: string,
  dragHeight: number,
  drop: CategoryDropPosition | null,
): Map<string, number> {
  const shifts = new Map<string, number>();
  if (!drop) return shifts;

  const fromIndex = orderedIds.indexOf(dragId);
  const overIndex = orderedIds.indexOf(drop.overCategoryId);
  if (fromIndex < 0 || overIndex < 0) return shifts;

  const targetInsert = drop.side === "before" ? overIndex : overIndex + 1;

  const shiftAmount = dragHeight + CATEGORY_LIST_GAP;

  orderedIds.forEach((id, i) => {
    if (id === dragId) return;
    if (fromIndex < targetInsert) {
      if (i > fromIndex && i < targetInsert) shifts.set(id, -shiftAmount);
    } else if (fromIndex > targetInsert) {
      if (i >= targetInsert && i < fromIndex) shifts.set(id, shiftAmount);
    }
  });

  return shifts;
}

function applyCategoryDrop(lib: MemoLibrary, dragId: string, drop: CategoryDropPosition): MemoLibrary {
  const ids = lib.categories.map((c) => c.id);
  const fromIndex = ids.indexOf(dragId);
  const overIndex = ids.indexOf(drop.overCategoryId);
  if (fromIndex < 0 || overIndex < 0) return lib;

  let insertAt = drop.side === "before" ? overIndex : overIndex + 1;
  ids.splice(fromIndex, 1);
  if (fromIndex < insertAt) insertAt -= 1;
  ids.splice(insertAt, 0, dragId);
  return reorderCategories(lib, ids);
}

function DragGap({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-2xl border-2 border-dashed border-accent/35 bg-accent/5 transition-all duration-200 ease-out",
        className,
      )}
      style={{ minHeight: 52 }}
    />
  );
}

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
  const [memoDragGhost, setMemoDragGhost] = useState<MemoDragGhost | null>(null);
  const [memoDropPreview, setMemoDropPreview] = useState<MemoDropPreview | null>(null);
  const [categoryDragState, setCategoryDragState] = useState<CategoryDragState | null>(null);
  const [categoryDropPosition, setCategoryDropPosition] = useState<CategoryDropPosition | null>(null);

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
  const memoDropPreviewRef = useRef<MemoDropPreview | null>(null);
  memoDropPreviewRef.current = memoDropPreview;
  const categoryDropPositionRef = useRef<CategoryDropPosition | null>(null);
  categoryDropPositionRef.current = categoryDropPosition;

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

  const onMemoDrop = useCallback((drag: Extract<PressTarget, { kind: "memo" }>, targetCategoryId: string, targetIndex: number) => {
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

  const finishMemoDrag = useCallback(
    (clientX: number, clientY: number, target: Extract<PressTarget, { kind: "memo" }>, preview: MemoDropPreview | null) => {
      if (preview) {
        onMemoDrop(target, preview.categoryId, preview.index);
        return;
      }
      const el = document.elementFromPoint(clientX, clientY);
      const row = el?.closest("[data-memo-row]") as HTMLElement | null;
      if (row) {
        onMemoDrop(target, row.dataset.categoryId!, Number(row.dataset.index ?? 0));
      }
    },
    [onMemoDrop],
  );

  const finishCategoryDrag = useCallback(
    (dragId: string, drop: CategoryDropPosition | null) => {
      if (!drop) return;
      persist(applyCategoryDrop(libRef.current, dragId, drop));
    },
    [persist],
  );

  const updateMemoDropPreview = useCallback((clientX: number, clientY: number) => {
    const el = document.elementFromPoint(clientX, clientY);
    const row = el?.closest("[data-memo-row]") as HTMLElement | null;
    if (row) {
      setMemoDropPreview({
        categoryId: row.dataset.categoryId!,
        index: Number(row.dataset.index ?? 0),
      });
      return;
    }
    const section = el?.closest("[data-category-section]") as HTMLElement | null;
    if (section) {
      setMemoDropPreview({
        categoryId: section.dataset.categoryId!,
        index: 0,
      });
    }
  }, []);

  const updateCategoryDropPosition = useCallback(
    (clientY: number, draggingCategoryId: string, orderedCategoryIds: string[]) => {
      const drop = findCategoryDropPosition(
        clientY,
        draggingCategoryId,
        orderedCategoryIds,
        scrollRef.current,
      );
      setCategoryDropPosition(drop);
    },
    [],
  );

  useEffect(() => {
    if (!memoDragGhost) return;
    const onMove = (e: PointerEvent) => {
      setMemoDragGhost((g) => (g ? { ...g, x: e.clientX, y: e.clientY } : null));
      updateMemoDropPreview(e.clientX, e.clientY);
    };
    document.addEventListener("pointermove", onMove);
    return () => document.removeEventListener("pointermove", onMove);
  }, [memoDragGhost?.pageId, updateMemoDropPreview]);

  useEffect(() => {
    if (!categoryDragState) return;
    const dragId = categoryDragState.categoryId;
    const onMove = (e: PointerEvent) => {
      setCategoryDragState((s) => (s ? { ...s, x: e.clientX, y: e.clientY } : null));
      updateCategoryDropPosition(e.clientY, dragId, libRef.current.categories.map((c) => c.id));
    };
    document.addEventListener("pointermove", onMove);
    return () => document.removeEventListener("pointermove", onMove);
  }, [categoryDragState?.categoryId, updateCategoryDropPosition]);

  const startPress = (target: PressTarget, el: HTMLElement, clientX: number, clientY: number) => {
    clearPress();
    void tickHaptic();
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
      void tickHaptic();
      const rect = press.element.getBoundingClientRect();
      if (press.target.kind === "memo") {
        const page = pageMap.get(press.target.pageId);
        setMemoDragGhost({
          pageId: press.target.pageId,
          categoryId: press.target.categoryId,
          index: press.target.index,
          x: clientX,
          y: clientY,
          width: rect.width,
          label: page?.title.trim() || t("memoUntitled"),
        });
        updateMemoDropPreview(clientX, clientY);
        return;
      }
      const cat = lib.categories.find((c) => c.id === press.target.categoryId);
      const section = press.element.closest("[data-category-section]") as HTMLElement | null;
      const sectionRect = section?.getBoundingClientRect() ?? rect;
      setCategoryDragState({
        categoryId: press.target.categoryId,
        x: clientX,
        y: clientY,
        width: sectionRect.width,
        height: sectionRect.height,
        label: cat?.name.trim() || t("memoUntitledCategory"),
        cardColor: cat?.color || MEMO_CATEGORY_COLORS[0],
        pointerOffsetY: clientY - sectionRect.top,
      });
      updateCategoryDropPosition(
        clientY,
        press.target.categoryId,
        lib.categories.map((c) => c.id),
      );
    }
  };

  const onPressEnd = (clientX: number, clientY: number) => {
    const press = pressRef.current;
    if (!press) return;
    clearPress();

    if (press.moved && press.longPress) {
      if (press.target.kind === "memo") {
        finishMemoDrag(clientX, clientY, press.target, memoDropPreviewRef.current);
        setMemoDragGhost(null);
        setMemoDropPreview(null);
      } else {
        finishCategoryDrag(press.target.categoryId, categoryDropPositionRef.current);
        setCategoryDragState(null);
        setCategoryDropPosition(null);
      }
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

  const orderedCategoryIds = visibleCategories.map(({ category }) => category.id);
  const categoryShiftMap = useMemo(
    () =>
      categoryDragState
        ? computeCategoryShiftMap(
            orderedCategoryIds,
            categoryDragState.categoryId,
            categoryDragState.height,
            categoryDropPosition,
          )
        : new Map<string, number>(),
    [orderedCategoryIds, categoryDragState, categoryDropPosition],
  );

  const renderMemoRow = (page: MemoPage, category: MemoCategory, index: number) => {
    const preview = htmlToPlainText(page.html);
    const isRenaming = renameTarget?.kind === "memo" && renameTarget.id === page.id;
    const welcome = isWelcomeMemo(page.id);

    return (
      <div
        key={page.id}
        data-memo-row
        data-category-id={category.id}
        data-index={index}
        className="flex items-center gap-2 rounded-2xl bg-background/80 border border-border/30 px-2 py-2 transition-all duration-200 ease-out"
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
              <p className="text-[10px] text-muted-foreground/70 mt-1">
                {t("memoLastEdited")}: {formatLastEdited(page.updatedAt, locale)}
              </p>
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
          {visibleCategories.map(({ category, pages }) => {
            const isRenaming =
              renameTarget?.kind === "category" && renameTarget.id === category.id;
            const cardColor = category.color || MEMO_CATEGORY_COLORS[0];
            const memoCount = category.pageIds.length;
            const memoItems = buildMemoDisplayList(pages, category.id, memoDragGhost, memoDropPreview);
            const crossCategoryMemoIncoming =
              memoDragGhost &&
              memoDropPreview?.categoryId === category.id &&
              memoDragGhost.categoryId !== category.id;
            const isDraggingCategory = categoryDragState?.categoryId === category.id;
            const shiftY = categoryShiftMap.get(category.id) ?? 0;

            return (
              <section
                key={category.id}
                data-category-section
                data-category-id={category.id}
                className={cn(
                  "rounded-3xl border border-border/40 shadow-soft overflow-hidden",
                  isDraggingCategory && "opacity-0 pointer-events-none",
                )}
                style={{
                  backgroundColor: cardColor,
                  transform: shiftY ? `translateY(${shiftY}px)` : undefined,
                  transition: categoryDragState && !isDraggingCategory ? CATEGORY_SHIFT_TRANSITION : undefined,
                  willChange: categoryDragState && !isDraggingCategory ? "transform" : undefined,
                }}
              >
                <div
                  className="flex items-center gap-2 px-4 py-3 touch-none"
                  onPointerDown={(e) => {
                    if (isRenaming || (e.target as HTMLElement).closest("[data-pencil],[data-chevron]")) return;
                    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                    startPress(
                      { kind: "category", categoryId: category.id },
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
                  {!listEditing ? (
                    <button
                      type="button"
                      data-chevron
                      onClick={(e) => {
                        e.stopPropagation();
                        persist(toggleCategoryCollapsed(lib, category.id));
                      }}
                      className="p-1 -ml-1 text-foreground/70 shrink-0"
                      aria-label={category.collapsed ? "expand" : "collapse"}
                    >
                      {category.collapsed ? (
                        <ChevronRight className="w-5 h-5" />
                      ) : (
                        <ChevronDown className="w-5 h-5" />
                      )}
                    </button>
                  ) : null}
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
                  <div
                    className={cn(
                      "space-y-2 px-3 pb-3 transition-all duration-200 ease-out",
                      crossCategoryMemoIncoming && "pt-0",
                    )}
                  >
                    {memoItems.map((memoItem, memoDisplayIndex) =>
                      memoItem.kind === "placeholder" ? (
                        <DragGap key={`memo-gap-${category.id}-${memoDisplayIndex}`} />
                      ) : (
                        renderMemoRow(memoItem.page, category, memoItem.index)
                      ),
                    )}
                    {pages.length === 0 && !matchedIds && !crossCategoryMemoIncoming ? (
                      <p className="text-xs text-muted-foreground/60 text-center py-3">{t("memoEmptyCategory")}</p>
                    ) : null}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </div>

      {memoDragGhost &&
        createPortal(
          <div
            className="fixed z-[80] pointer-events-none rounded-2xl border border-border/50 shadow-float px-4 py-3 font-semibold text-sm truncate"
            style={{
              left: memoDragGhost.x,
              top: memoDragGhost.y,
              transform: "translate(-50%, -50%)",
              width: memoDragGhost.width,
              backgroundColor: "hsl(var(--card))",
              opacity: 0.95,
            }}
          >
            {memoDragGhost.label}
          </div>,
          document.body,
        )}

      {categoryDragState &&
        createPortal(
          <div
            className="fixed z-[80] pointer-events-none rounded-3xl border border-border/50 shadow-float overflow-hidden"
            style={{
              left: categoryDragState.x,
              top: categoryDragState.y - categoryDragState.pointerOffsetY,
              width: categoryDragState.width,
              height: categoryDragState.height,
              backgroundColor: categoryDragState.cardColor,
              opacity: 0.96,
              transform: "scale(1.02)",
              transformOrigin: "top center",
            }}
          >
            <div className="px-4 py-3 font-semibold text-base truncate">{categoryDragState.label}</div>
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
                    {(() => {
                      const cat = lib.categories.find((c) => c.id === contextMenu.categoryId);
                      const currentColor = cat?.color || MEMO_CATEGORY_COLORS[0];
                      return categoryPickerColors(currentColor).map((color) => {
                        const selected = color === currentColor;
                        return (
                          <button
                            key={color}
                            type="button"
                            className={cn(
                              "w-10 h-10 rounded-full border-2 shadow-sm transition-shadow",
                              selected
                                ? "border-accent ring-2 ring-accent ring-offset-2 ring-offset-background"
                                : "border-border/50",
                            )}
                            style={{ backgroundColor: color }}
                            aria-pressed={selected}
                            onClick={() => {
                              persist(setCategoryColor(lib, contextMenu.categoryId, color));
                              setContextMenu(null);
                            }}
                          />
                        );
                      });
                    })()}
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
