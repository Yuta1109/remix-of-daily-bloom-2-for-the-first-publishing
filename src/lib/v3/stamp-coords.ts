/**
 * Calendar stamp coordinates.
 *
 * `CalendarStamp.x` / `y` are NORMALIZED to the target day cell:
 *
 *   (0, 0) = top-left of that date's cell
 *   (1, 1) = bottom-right of that date's cell
 *
 * They are not CSS pixels, not screen coordinates, and not page offsets.
 * A stamp at (0.5, 0.7) stays in the same relative place after rotation,
 * sheet open/close, month changes, or a later iPad layout.
 */

export const STAMP_COORD_MIN = 0;
export const STAMP_COORD_MAX = 1;
export const STAMP_SCALE_MIN = 0.5;
export const STAMP_SCALE_MAX = 1.75;
export const STAMP_SCALE_DEFAULT = 1;
export const STAMP_ROTATION_DEFAULT = 0;

/** Same long-press / move thresholds as memo list drag (`MemoListPage`). */
export const STAMP_LONG_PRESS_MS = 420;
export const STAMP_DRAG_THRESHOLD = 10;

export function clampStampCoord(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.min(STAMP_COORD_MAX, Math.max(STAMP_COORD_MIN, value));
}

export function clampStampScale(value: number | undefined): number {
  const n = value ?? STAMP_SCALE_DEFAULT;
  if (!Number.isFinite(n)) return STAMP_SCALE_DEFAULT;
  return Math.min(STAMP_SCALE_MAX, Math.max(STAMP_SCALE_MIN, n));
}

/** Degrees, wrapped into [0, 360). */
export function clampStampRotation(value: number | undefined): number {
  const n = value ?? STAMP_ROTATION_DEFAULT;
  if (!Number.isFinite(n)) return STAMP_ROTATION_DEFAULT;
  return ((n % 360) + 360) % 360;
}

export function clampStampZIndex(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

export function pointToNormalized(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
): { x: number; y: number } {
  const w = rect.width || 1;
  const h = rect.height || 1;
  return {
    x: clampStampCoord((clientX - rect.left) / w),
    y: clampStampCoord((clientY - rect.top) / h),
  };
}

/** Next zIndex above every stamp already on the day. Never negative. */
export function nextStampZIndex(zIndexes: number[]): number {
  if (zIndexes.length === 0) return 0;
  return zIndexes.reduce((max, z) => Math.max(max, clampStampZIndex(z) + 1), 0);
}
