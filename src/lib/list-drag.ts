export const AUTO_SCROLL_EDGE_PX = 72;
export const AUTO_SCROLL_MAX_STEP = 12;

/** Scroll container when pointer is near top/bottom edge during drag. Returns scroll delta. */
export function autoScrollIfNeeded(scrollRoot: HTMLElement, clientY: number): number {
  const rect = scrollRoot.getBoundingClientRect();
  const maxScroll = scrollRoot.scrollHeight - scrollRoot.clientHeight;
  if (maxScroll <= 0) return 0;

  if (clientY < rect.top + AUTO_SCROLL_EDGE_PX) {
    const prev = scrollRoot.scrollTop;
    scrollRoot.scrollTop = Math.max(0, prev - AUTO_SCROLL_MAX_STEP);
    return scrollRoot.scrollTop - prev;
  }
  if (clientY > rect.bottom - AUTO_SCROLL_EDGE_PX) {
    const prev = scrollRoot.scrollTop;
    scrollRoot.scrollTop = Math.min(maxScroll, prev + AUTO_SCROLL_MAX_STEP);
    return scrollRoot.scrollTop - prev;
  }
  return 0;
}

export type DragMeasurement = {
  id: string;
  top: number;
  height: number;
};

const INSERT_HYSTERESIS = 18;

export function measureInScrollContainer(el: HTMLElement, scrollRoot: HTMLElement, id: string): DragMeasurement {
  const rect = el.getBoundingClientRect();
  const rootRect = scrollRoot.getBoundingClientRect();
  return {
    id,
    top: rect.top - rootRect.top + scrollRoot.scrollTop,
    height: rect.height,
  };
}

export function pointerYInScrollContainer(pointerY: number, scrollRoot: HTMLElement): number {
  const rootRect = scrollRoot.getBoundingClientRect();
  return pointerY - rootRect.top + scrollRoot.scrollTop;
}

/** Stable insert index with hysteresis; metrics are fixed at drag start. */
export function computeStableInsertIndex(
  pointerY: number,
  metrics: DragMeasurement[],
  dragId: string,
  currentIndex: number,
): number {
  const others = metrics.filter((m) => m.id !== dragId);
  if (others.length === 0) return 0;

  let raw = 0;
  while (raw < others.length && pointerY > others[raw].top + others[raw].height / 2) {
    raw++;
  }

  if (raw === currentIndex) return currentIndex;
  if (Math.abs(raw - currentIndex) > 1) return raw;

  const boundary =
    raw > currentIndex
      ? others[currentIndex].top + others[currentIndex].height / 2
      : others[raw].top + others[raw].height / 2;

  if (raw > currentIndex && pointerY < boundary + INSERT_HYSTERESIS) return currentIndex;
  if (raw < currentIndex && pointerY > boundary - INSERT_HYSTERESIS) return currentIndex;
  return raw;
}

export function computeShiftsFromInsertIndex(
  orderedIds: string[],
  dragId: string,
  itemHeight: number,
  gap: number,
  insertIndex: number,
): Map<string, number> {
  const fromIndex = orderedIds.indexOf(dragId);
  const shifts = new Map<string, number>();
  if (fromIndex < 0) return shifts;

  const shiftAmount = itemHeight + gap;
  orderedIds.forEach((id, i) => {
    if (id === dragId) return;
    const filteredIndex = i > fromIndex ? i - 1 : i;
    if (fromIndex < insertIndex) {
      if (i > fromIndex && filteredIndex < insertIndex) shifts.set(id, -shiftAmount);
    } else if (fromIndex > insertIndex) {
      if (filteredIndex >= insertIndex && i < fromIndex) shifts.set(id, shiftAmount);
    }
  });
  return shifts;
}
