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
  autoScrollIfNeeded,
  computeShiftsFromInsertIndex,
  computeStableInsertIndex,
  measureInScrollContainer,
  pointerYInScrollContainer,
  type DragMeasurement,
} from "@/lib/list-drag";
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

type CategoryDragState = {
  categoryId: string;
  pointerY: number;
  anchorLeft: number;
  width: number;
  layoutHeight: number;
  ghostHeight: number;
  pointerOffsetY: number;
  label: string;
  cardColor: string;
  insertIndex: number;
};

type MemoDragState = {
  pageId: string;
  fromCategoryId: string;
  fromIndex: number;
  targetCategoryId: string;
  insertIndex: number;
  pointerY: number;
  anchorLeft: number;
  width: number;
  layoutHeight: number;
  ghostHeight: number;
  pointerOffsetY: number;
  label: string;
};

const LONG_PRESS_MS = 420;
const DRAG_THRESHOLD = 10;
const SCROLL_CANCEL_PX = 12;
const SHIFT_TRANSITION = "transform 180ms ease";
const CATEGORY_LIST_GAP = 16;
const MEMO_LIST_GAP = 8;
const SEARCH_BAR_PX = 52;
/** Visible on pastel cards; not clipped by inner overflow-hidden. */
const DRAG_HIGHLIGHT_CLASS =
  "shadow-[0_0_0_2px_hsl(var(--accent)),0_0_0_4px_hsl(var(--background))]";

function measureCategories(scrollRoot: HTMLElement, categoryIds: string[]): DragMeasurement[] {
  return categoryIds
    .map((id) => {
      const el = scrollRoot.querySelector<HTMLElement>(`[data-category-section][data-category-id="${id}"]`);
      if (!el) return null;
      return measureInScrollContainer(el, scrollRoot, id);
    })
    .filter((m): m is DragMeasurement => !!m);
}

function measureMemos(scrollRoot: HTMLElement, categoryId: string, pageIds: string[]): DragMeasurement[] {
  return pageIds
    .map((pageId) => {
      const el = scrollRoot.querySelector<HTMLElement>(
        `[data-memo-row][data-category-id="${categoryId}"][data-page-id="${pageId}"]`,
      );
      if (!el) return null;
      return measureInScrollContainer(el, scrollRoot, pageId);
    })
    .filter((m): m is DragMeasurement => !!m);
}

function findCategoryIdAtPointer(clientX: number, clientY: number, scrollRoot: HTMLElement): string | null {
  const hit = document.elementFromPoint(clientX, clientY)?.closest("[data-category-section]") as
    | HTMLElement
    | null;
  if (hit?.dataset.categoryId) return hit.dataset.categoryId;

  const sections = scrollRoot.querySelectorAll<HTMLElement>("[data-category-section]");
  for (const section of sections) {
    const rect = section.getBoundingClientRect();
    if (
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom
    ) {
      return section.dataset.categoryId ?? null;
    }
  }
  return null;
}

function applyCategoryDropByIndex(lib: MemoLibrary, dragId: string, insertIndex: number): MemoLibrary {
  const ids = lib.categories.map((c) => c.id);
  const fromIndex = ids.indexOf(dragId);
  if (fromIndex < 0) return lib;
  ids.splice(fromIndex, 1);
  ids.splice(Math.max(0, Math.min(insertIndex, ids.length)), 0, dragId);
  return reorderCategories(lib, ids);
}

function applyMemoDrop(
  lib: MemoLibrary,
  pageId: string,
  fromCategoryId: string,
  targetCategoryId: string,
  insertIndex: number,
): MemoLibrary {
  const fromCat = lib.categories.find((c) => c.id === fromCategoryId);
  if (!fromCat) return lib;
  const fromIndex = fromCat.pageIds.indexOf(pageId);
  let index = insertIndex;
  if (fromCategoryId === targetCategoryId && fromIndex >= 0 && fromIndex < insertIndex) {
    index -= 1;
  }
  return movePageToCategory(lib, pageId, fromCategoryId, targetCategoryId, index);
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
  const [addOpen, setAddOpen] = useState(false);
  const [addStep, setAddStep] = useState<AddStep>("menu");
  const [categoryName, setCategoryName] = useState("");
  const [kbHeight, setKbHeight] = useState(0);
  const [contextMenu, setContextMenu] = useState<ContextMenu>(null);
  const [categoryLongPressId, setCategoryLongPressId] = useState<string | null>(null);
  const [memoLongPressId, setMemoLongPressId] = useState<string | null>(null);
  const [searchVisible, setSearchVisible] = useState(true);
  const [renameTarget, setRenameTarget] = useState<
    { kind: "category"; id: string; value: string } | { kind: "memo"; id: string; value: string } | null
  >(null);
  const [memoDragState, setMemoDragState] = useState<MemoDragState | null>(null);
  const [categoryDragState, setCategoryDragState] = useState<CategoryDragState | null>(null);
  const [pressLongPressActive, setPressLongPressActive] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const lastScrollTop = useRef(0);
  const lastPointerRef = useRef({ x: 0, y: 0 });
  const pressRef = useRef<{
    target: PressTarget;
    startX: number;
    startY: number;
    timer: ReturnType<typeof setTimeout>;
    longPress: boolean;
    moved: boolean;
    element: HTMLElement;
    pointerId: number;
    captured: boolean;
    cleanupDocListeners: (() => void) | null;
  } | null>(null);
  const libRef = useRef(lib);
  libRef.current = lib;
  const categoryDragMetricsRef = useRef<DragMeasurement[]>([]);
  const memoDragMetricsRef = useRef<Map<string, DragMeasurement[]>>(new Map());

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
      if (pressRef.current.captured) {
        try {
          pressRef.current.element.releasePointerCapture(pressRef.current.pointerId);
        } catch {
          /* pointer may already be released */
        }
      }
      pressRef.current.cleanupDocListeners?.();
      pressRef.current = null;
    }
    setCategoryLongPressId(null);
    setMemoLongPressId(null);
    setPressLongPressActive(false);
  };

  const tryCancelPressForScroll = (clientX: number, clientY: number) => {
    const press = pressRef.current;
    if (!press || press.longPress) return false;
    const dx = clientX - press.startX;
    const dy = clientY - press.startY;
    if (Math.abs(dy) >= SCROLL_CANCEL_PX && Math.abs(dy) > Math.abs(dx) * 1.2) {
      clearPress();
      return true;
    }
    return false;
  };

  const memoDragStateRef = useRef(memoDragState);
  memoDragStateRef.current = memoDragState;
  const categoryDragStateRef = useRef(categoryDragState);
  categoryDragStateRef.current = categoryDragState;

  const finishMemoDrag = useCallback(
    (target: Extract<PressTarget, { kind: "memo" }>, drag: MemoDragState) => {
      persist(
        applyMemoDrop(
          libRef.current,
          target.pageId,
          drag.fromCategoryId,
          drag.targetCategoryId,
          drag.insertIndex,
        ),
      );
    },
    [persist],
  );

  const finishCategoryDrag = useCallback(
    (dragId: string, insertIndex: number) => {
      persist(applyCategoryDropByIndex(libRef.current, dragId, insertIndex));
    },
    [persist],
  );

  const draggingActive = !!(memoDragState || categoryDragState);
  const autoScrollActive = draggingActive || pressLongPressActive;

  useEffect(() => {
    if (!autoScrollActive) return;
    const scrollRoot = scrollRef.current;
    if (!scrollRoot) return;

    const prevOverflow = scrollRoot.style.overflow;
    const prevTouchAction = scrollRoot.style.touchAction;
    if (draggingActive) {
      scrollRoot.style.overflow = "hidden";
      scrollRoot.style.touchAction = "none";
    }

    let lastX = lastPointerRef.current.x;
    let lastY =
      lastPointerRef.current.y ||
      memoDragStateRef.current?.pointerY ||
      categoryDragStateRef.current?.pointerY ||
      0;
    let rafId = 0;

    const tick = () => {
      const root = scrollRef.current;
      if (root) {
        autoScrollIfNeeded(root, lastY);
        const relY = pointerYInScrollContainer(lastY, root);

        const memo = memoDragStateRef.current;
        if (memo) {
          const targetCategoryId = findCategoryIdAtPointer(lastX, lastY, root) ?? memo.targetCategoryId;
          const metrics = memoDragMetricsRef.current.get(targetCategoryId) ?? [];
          setMemoDragState((s) => {
            if (!s) return null;
            const insertIndex = computeStableInsertIndex(relY, metrics, memo.pageId, s.insertIndex);
            if (s.pointerY === lastY && s.targetCategoryId === targetCategoryId && s.insertIndex === insertIndex) {
              return s;
            }
            return { ...s, pointerY: lastY, targetCategoryId, insertIndex };
          });
        }

        const cat = categoryDragStateRef.current;
        if (cat) {
          setCategoryDragState((s) => {
            if (!s) return null;
            const insertIndex = computeStableInsertIndex(
              relY,
              categoryDragMetricsRef.current,
              cat.categoryId,
              s.insertIndex,
            );
            if (s.pointerY === lastY && s.insertIndex === insertIndex) return s;
            return { ...s, pointerY: lastY, insertIndex };
          });
        }
      }
      rafId = requestAnimationFrame(tick);
    };

    const onPointerMove = (e: PointerEvent) => {
      lastX = e.clientX;
      lastY = e.clientY;
      lastPointerRef.current = { x: lastX, y: lastY };
    };

    document.addEventListener("pointermove", onPointerMove, { passive: true });
    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      document.removeEventListener("pointermove", onPointerMove);
      scrollRoot.style.overflow = prevOverflow;
      scrollRoot.style.touchAction = prevTouchAction;
    };
  }, [autoScrollActive, draggingActive]);

  const startPress = (
    target: PressTarget,
    el: HTMLElement,
    clientX: number,
    clientY: number,
    pointerId: number,
  ) => {
    clearPress();
    lastPointerRef.current = { x: clientX, y: clientY };

    const onDocMove = (e: PointerEvent) => {
      if (e.pointerId !== pointerId || !pressRef.current) return;
      lastPointerRef.current = { x: e.clientX, y: e.clientY };
      if (!pressRef.current.longPress) {
        tryCancelPressForScroll(e.clientX, e.clientY);
        return;
      }
      onPressMove(e.clientX, e.clientY);
    };

    const onDocUp = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      onPressEnd(e.clientX, e.clientY);
    };

    const onDocCancel = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      clearPress();
    };

    const cleanupDocListeners = () => {
      document.removeEventListener("pointermove", onDocMove);
      document.removeEventListener("pointerup", onDocUp);
      document.removeEventListener("pointercancel", onDocCancel);
    };

    document.addEventListener("pointermove", onDocMove, { passive: true });
    document.addEventListener("pointerup", onDocUp);
    document.addEventListener("pointercancel", onDocCancel);

    const timer = setTimeout(() => {
      if (!pressRef.current) return;
      pressRef.current.longPress = true;
      setPressLongPressActive(true);
      try {
        pressRef.current.element.setPointerCapture(pointerId);
        pressRef.current.captured = true;
      } catch {
        /* capture may fail on some browsers */
      }
      if (pressRef.current.target.kind === "category") {
        void tickHaptic();
        setCategoryLongPressId(pressRef.current.target.categoryId);
      } else if (pressRef.current.target.kind === "memo") {
        void tickHaptic();
        setMemoLongPressId(pressRef.current.target.pageId);
      }
    }, LONG_PRESS_MS);

    pressRef.current = {
      target,
      startX: clientX,
      startY: clientY,
      timer,
      longPress: false,
      moved: false,
      element: el,
      pointerId,
      captured: false,
      cleanupDocListeners,
    };
  };

  const onPressMove = (clientX: number, clientY: number) => {
    const press = pressRef.current;
    if (!press || !press.longPress) return;
    const dx = clientX - press.startX;
    const dy = clientY - press.startY;
    if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    if (!press.moved) {
      press.moved = true;
      const scrollRoot = scrollRef.current;
      if (!scrollRoot) return;

      if (press.target.kind === "memo") {
        const page = pageMap.get(press.target.pageId);
        const row =
          press.element.closest("[data-memo-row]") as HTMLElement | null ?? press.element;
        const rowRect = row.getBoundingClientRect();
        const metricsMap = new Map<string, DragMeasurement[]>();
        for (const category of libRef.current.categories) {
          const pageIds = category.pageIds.filter((id) => libRef.current.pages.some((p) => p.id === id));
          metricsMap.set(category.id, measureMemos(scrollRoot, category.id, pageIds));
        }
        memoDragMetricsRef.current = metricsMap;
        const fromIndex = press.target.index;
        setMemoDragState({
          pageId: press.target.pageId,
          fromCategoryId: press.target.categoryId,
          fromIndex,
          targetCategoryId: press.target.categoryId,
          insertIndex: fromIndex,
          pointerY: clientY,
          anchorLeft: rowRect.left,
          width: rowRect.width,
          layoutHeight: rowRect.height,
          ghostHeight: rowRect.height,
          pointerOffsetY: clientY - rowRect.top,
          label: page?.title.trim() || t("memoUntitled"),
        });
        return;
      }

      const rect = press.element.getBoundingClientRect();
      const cat = lib.categories.find((c) => c.id === press.target.categoryId);
      const section = press.element.closest("[data-category-section]") as HTMLElement | null;
      const header = section?.querySelector("[data-category-header]") as HTMLElement | null;
      const sectionRect = section?.getBoundingClientRect() ?? rect;
      const headerRect = header?.getBoundingClientRect() ?? sectionRect;
      const orderedIds = lib.categories.map((c) => c.id);
      categoryDragMetricsRef.current = measureCategories(scrollRoot, orderedIds);
      const fromIndex = orderedIds.indexOf(press.target.categoryId);
      setCategoryDragState({
        categoryId: press.target.categoryId,
        pointerY: clientY,
        anchorLeft: sectionRect.left,
        width: sectionRect.width,
        layoutHeight: sectionRect.height,
        ghostHeight: headerRect.height,
        pointerOffsetY: clientY - headerRect.top,
        label: cat?.name.trim() || t("memoUntitledCategory"),
        cardColor: cat?.color || MEMO_CATEGORY_COLORS[0],
        insertIndex: Math.max(0, fromIndex),
      });
    }
  };

  const onPressEnd = (clientX: number, clientY: number) => {
    const press = pressRef.current;
    if (!press) return;
    const saved = press;
    clearPress();

    if (saved.moved && saved.longPress) {
      if (saved.target.kind === "memo") {
        const drag = memoDragStateRef.current;
        if (drag) finishMemoDrag(saved.target, drag);
        setMemoDragState(null);
        memoDragMetricsRef.current = new Map();
      } else {
        const drag = categoryDragStateRef.current;
        if (drag) finishCategoryDrag(saved.target.categoryId, drag.insertIndex);
        setCategoryDragState(null);
        categoryDragMetricsRef.current = [];
      }
      return;
    }

    if (saved.longPress && !saved.moved) {
      if (saved.target.kind === "category") {
        setContextMenu({ kind: "category", categoryId: saved.target.categoryId });
      } else {
        setContextMenu({
          kind: "memo",
          pageId: saved.target.pageId,
          categoryId: saved.target.categoryId,
        });
      }
      return;
    }

    if (!saved.longPress && saved.target.kind === "memo" && !listEditing) {
      openMemo(saved.target.pageId);
    }
  };

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const st = el.scrollTop;
    if (st <= 4) {
      setSearchVisible(true);
    } else if (st > lastScrollTop.current) {
      setSearchVisible(false);
    }
    lastScrollTop.current = st;
  };

  const visibleCategories = lib.categories.map((category) => {
    const pages = category.pageIds
      .map((id) => pageMap.get(id))
      .filter((p): p is MemoPage => !!p);
    return { category, pages };
  });

  const orderedCategoryIds = visibleCategories.map(({ category }) => category.id);
  const categoryShiftMap = useMemo(
    () =>
      categoryDragState
        ? computeShiftsFromInsertIndex(
            orderedCategoryIds,
            categoryDragState.categoryId,
            categoryDragState.layoutHeight,
            CATEGORY_LIST_GAP,
            categoryDragState.insertIndex,
          )
        : new Map<string, number>(),
    [orderedCategoryIds, categoryDragState],
  );

  const renderMemoRow = (
    page: MemoPage,
    category: MemoCategory,
    index: number,
    shiftY: number,
    isDraggingMemo: boolean,
  ) => {
    const preview = htmlToPlainText(page.html);
    const isRenaming = renameTarget?.kind === "memo" && renameTarget.id === page.id;
    const welcome = isWelcomeMemo(page.id);

    return (
      <div
        key={page.id}
        data-memo-row
        data-page-id={page.id}
        data-category-id={category.id}
        data-index={index}
        className={cn(
          "flex items-center gap-2 rounded-2xl bg-background/80 border border-border/30 px-2 py-2",
          isDraggingMemo && "opacity-0 pointer-events-none",
          (memoLongPressId === page.id || memoDragState?.pageId === page.id) && DRAG_HIGHLIGHT_CLASS,
        )}
        style={{
          transform: shiftY ? `translateY(${shiftY}px)` : undefined,
          transition: memoDragState && !isDraggingMemo ? SHIFT_TRANSITION : undefined,
          willChange: memoDragState && !isDraggingMemo ? "transform" : undefined,
        }}
        onPointerDown={(e) => {
          if (isRenaming || (e.target as HTMLElement).closest("[data-pencil],[data-trash]")) return;
          startPress(
            { kind: "memo", pageId: page.id, categoryId: category.id, index },
            e.currentTarget,
            e.clientX,
            e.clientY,
            e.pointerId,
          );
        }}
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
              <p data-memo-drag-anchor className="text-[15px] font-semibold leading-snug truncate">
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
        className="flex-1 min-h-0 overflow-y-auto px-4 pb-4 scrollbar-none"
      >
        <div
          className={cn(
            "grid transition-[grid-template-rows,margin] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]",
            !listEditing && searchVisible ? "grid-rows-[1fr] mb-3" : "grid-rows-[0fr] mb-0",
          )}
        >
          <div className="overflow-hidden min-h-0">
            <div
              className={cn(
                "relative pt-1 transition-opacity duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]",
                !listEditing && searchVisible ? "opacity-100" : "opacity-0 pointer-events-none",
              )}
              style={{ minHeight: SEARCH_BAR_PX }}
            >
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60 pointer-events-none z-10" />
              <input
                readOnly
                onFocus={() => navigate("/notes/search")}
                placeholder={t("memoSearchPlaceholder")}
                className="w-full rounded-2xl border border-border/30 bg-background/35 backdrop-blur-md pl-10 pr-4 py-3 text-sm outline-none placeholder:text-muted-foreground/50 cursor-pointer"
              />
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {visibleCategories.map(({ category, pages }) => {
            const isRenaming =
              renameTarget?.kind === "category" && renameTarget.id === category.id;
            const cardColor = category.color || MEMO_CATEGORY_COLORS[0];
            const memoCount = category.pageIds.length;
            const pageIds = pages.map((p) => p.id);
            const memoShiftMap =
              memoDragState && memoDragState.targetCategoryId === category.id
                ? computeShiftsFromInsertIndex(
                    pageIds,
                    memoDragState.pageId,
                    memoDragState.layoutHeight,
                    MEMO_LIST_GAP,
                    memoDragState.insertIndex,
                  )
                : new Map<string, number>();
            const isDraggingCategory = categoryDragState?.categoryId === category.id;
            const isMemoDropTarget =
              !!memoDragState && memoDragState.targetCategoryId === category.id;
            const categoryHighlighted =
              categoryLongPressId === category.id ||
              categoryDragState?.categoryId === category.id ||
              isMemoDropTarget;
            const shiftY = categoryDragState && !memoDragState ? categoryShiftMap.get(category.id) ?? 0 : 0;

            return (
              <div
                key={category.id}
                className={cn(
                  "rounded-3xl transition-shadow duration-150",
                  categoryHighlighted && DRAG_HIGHLIGHT_CLASS,
                )}
              >
              <section
                data-category-section
                data-category-id={category.id}
                className={cn(
                  "rounded-3xl border border-border/40 shadow-soft overflow-hidden",
                  isDraggingCategory && "opacity-0 pointer-events-none",
                )}
                style={{
                  backgroundColor: cardColor,
                  transform: shiftY ? `translateY(${shiftY}px)` : undefined,
                  transition: categoryDragState && !isDraggingCategory ? SHIFT_TRANSITION : undefined,
                  willChange: categoryDragState && !isDraggingCategory ? "transform" : undefined,
                }}
              >
                <div
                  data-category-header
                  className="flex items-center gap-2 px-4 py-3"
                  onPointerDown={(e) => {
                    if (isRenaming || (e.target as HTMLElement).closest("[data-pencil],[data-chevron]")) return;
                    startPress(
                      { kind: "category", categoryId: category.id },
                      e.currentTarget.closest("section") as HTMLElement,
                      e.clientX,
                      e.clientY,
                      e.pointerId,
                    );
                  }}
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
                  <div className="space-y-2 px-3 pb-3">
                    {pages.map((page, index) =>
                      renderMemoRow(
                        page,
                        category,
                        index,
                        memoShiftMap.get(page.id) ?? 0,
                        memoDragState?.pageId === page.id,
                      ),
                    )}
                    {pages.length === 0 ? (
                      <p className="text-xs text-muted-foreground/60 text-center py-3">{t("memoEmptyCategory")}</p>
                    ) : null}
                  </div>
                )}
              </section>
              </div>
            );
          })}
        </div>
      </div>

      {memoDragState &&
        (() => {
          const page = pageMap.get(memoDragState.pageId);
          const preview = page ? htmlToPlainText(page.html) : "";
          const welcome = page ? isWelcomeMemo(page.id) : false;
          return createPortal(
            <div
              className={cn(
                "fixed z-[80] pointer-events-none flex items-center gap-2 rounded-2xl border border-border/30 px-2 py-2 bg-background/95",
                DRAG_HIGHLIGHT_CLASS,
              )}
              style={{
                left: memoDragState.anchorLeft,
                top: memoDragState.pointerY - memoDragState.pointerOffsetY,
                width: memoDragState.width,
                height: memoDragState.ghostHeight,
                opacity: 0.98,
                boxShadow: "0 8px 24px hsl(var(--foreground) / 0.12)",
              }}
            >
              <div className="flex-1 min-w-0 px-1">
                <p className="text-[15px] font-semibold leading-snug truncate">
                  {memoDragState.label}
                </p>
                {!welcome && preview ? (
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{preview}</p>
                ) : null}
                {page ? (
                  <p className="text-[10px] text-muted-foreground/70 mt-1">
                    {t("memoLastEdited")}: {formatLastEdited(page.updatedAt, locale)}
                  </p>
                ) : null}
              </div>
            </div>,
            document.body,
          );
        })()}

      {categoryDragState &&
        createPortal(
          <div
            className={cn(
              "fixed z-[80] pointer-events-none rounded-3xl border border-border/50 shadow-float overflow-hidden",
              DRAG_HIGHLIGHT_CLASS,
            )}
            style={{
              left: categoryDragState.anchorLeft,
              top: categoryDragState.pointerY - categoryDragState.pointerOffsetY,
              width: categoryDragState.width,
              height: categoryDragState.ghostHeight,
              backgroundColor: categoryDragState.cardColor,
              opacity: 0.96,
              boxShadow: "0 8px 24px hsl(var(--foreground) / 0.12)",
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
