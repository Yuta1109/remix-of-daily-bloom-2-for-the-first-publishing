/**
 * DOM helpers for stamp drag. Kept out of `src/lib/v3` because they touch
 * layout rectangles, not persisted data.
 */

import { pointToNormalized } from "@/lib/v3/stamp-coords";
import type { LocalDate } from "@/lib/v3/local-date";

export function dateCellFromPoint(clientX: number, clientY: number): HTMLElement | null {
  const stack = document.elementsFromPoint(clientX, clientY);
  for (const node of stack) {
    if (!(node instanceof Element)) continue;
    const host = node.closest("[data-calendar-date]");
    if (host instanceof HTMLElement && host.dataset.calendarDate) return host;
  }
  return null;
}

export function localDateFromPoint(clientX: number, clientY: number): LocalDate | null {
  const cell = dateCellFromPoint(clientX, clientY);
  return cell?.dataset.calendarDate ?? null;
}

export function normalizedPointInDateCell(
  clientX: number,
  clientY: number,
  date: LocalDate,
): { x: number; y: number } | null {
  const el = document.querySelector(`[data-calendar-date="${date}"]`);
  if (!(el instanceof HTMLElement)) return null;
  return pointToNormalized(clientX, clientY, el.getBoundingClientRect());
}
