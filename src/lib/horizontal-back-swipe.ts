/**
 * Push-page back gesture. Only a mostly-horizontal swipe to the right,
 * starting at the left edge, counts. Diagonal and vertical drags do not.
 */
export function isHorizontalBackSwipe(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  edgeMax = 28,
): boolean {
  if (startX > edgeMax) return false;
  const dx = endX - startX;
  const dy = endY - startY;
  if (dx < 72) return false;
  if (Math.abs(dy) > 28) return false;
  if (Math.abs(dy) > dx * 0.3) return false;
  return true;
}
