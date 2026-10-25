export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}
export interface Point {
  x: number;
  y: number;
}
export function intersectBoxes(a: Box, b: Box): Box | null {
  const box = {
    left: Math.max(a.left, b.left),
    top: Math.max(a.top, b.top),
    right: Math.min(a.right, b.right),
    bottom: Math.min(a.bottom, b.bottom),
  };
  return box.right > box.left && box.bottom > box.top ? box : null;
}
export function connectionPath(
  target: Box,
  row: Box,
): { start: Point; end: Point; path: string } {
  const clamp = (n: number, min: number, max: number) =>
    Math.max(min, Math.min(n, max));
  const rowX = (row.left + row.right) / 2,
    rowY = (row.top + row.bottom) / 2;
  let start: Point, end: Point;
  if (row.left >= target.right || row.right <= target.left) {
    const right = row.left >= target.right;
    start = {
      x: right ? target.right : target.left,
      y: clamp(
        rowY,
        target.top + Math.min(12, (target.bottom - target.top) / 2),
        target.bottom - Math.min(12, (target.bottom - target.top) / 2),
      ),
    };
    end = { x: right ? row.left : row.right, y: rowY };
  } else {
    // Use the free side of the post when the floating panel covers its other side.
    const right = rowX >= (target.left + target.right) / 2;
    start = {
      x: right ? target.left : target.right,
      y: clamp(
        rowY,
        target.top + Math.min(12, (target.bottom - target.top) / 2),
        target.bottom - Math.min(12, (target.bottom - target.top) / 2),
      ),
    };
    end = { x: right ? row.left : row.right, y: rowY };
  }
  const offset = (end.x - start.x) * 0.48;
  const c1 = { x: start.x + offset, y: start.y },
    c2 = { x: end.x - offset, y: end.y };
  return {
    start,
    end,
    path: `M ${start.x} ${start.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${end.x} ${end.y}`,
  };
}
