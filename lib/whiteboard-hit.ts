import type { DrawOp } from "@/lib/whiteboard-ops";

// Bold and (to a lesser extent) italic change a font's advance widths, so a
// styled element needs its style in hand to be measured correctly — a bold
// element measured as plain text gets a hit box and a selection outline
// narrower than what is actually drawn. A standalone type rather than
// `Pick<TextOp, "bold" | "italic">`, so a caret helper measuring a plain
// string mid-edit (see caretIndexInText below) is not made to import a whole
// op shape for two flags.
export type TextMeasureStyle = { bold?: boolean; italic?: boolean };

// Injected rather than imported, so this module never touches a canvas and can
// be tested with a fake. The component supplies one backed by measureText.
export type Measure = (
  text: string,
  size: number,
  style?: TextMeasureStyle,
) => number;

export type Bounds = { x: number; y: number; width: number; height: number };

// How far off an element a click may land and still count, in logical units. A
// trackpad and a 5-unit-wide stroke need forgiveness; too much and overlapping
// elements become a lottery.
//
// Exported: it is also the eraser's reach, drawn as a circle around the
// cursor (BoardEditor) and the basis for lib/whiteboard-erase.ts's sampling
// step, so both stay honest about the one radius hitTest actually uses.
export const TOLERANCE = 14;

// Matches the line spacing drawOps uses when it renders a multi-line text op.
const LINE_HEIGHT = 1.25;

export function opBounds(op: DrawOp, measure: Measure): Bounds {
  if (op.kind === "text") {
    const lines = op.text.split("\n");
    return {
      x: op.x,
      y: op.y,
      width: measure(op.text, op.size, { bold: op.bold, italic: op.italic }),
      height: op.size * LINE_HEIGHT * lines.length,
    };
  }

  const xs: number[] = [];
  const ys: number[] = [];

  if (op.kind === "arrow") {
    xs.push(op.x1, op.x2);
    ys.push(op.y1, op.y2);
  } else {
    for (let i = 0; i < op.points.length; i += 2) {
      xs.push(op.points[i]);
      ys.push(op.points[i + 1]);
    }
  }

  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return {
    x: minX,
    y: minY,
    width: Math.max(...xs) - minX,
    height: Math.max(...ys) - minY,
  };
}

// Distance from a point to a SEGMENT, not to its endpoints. This is the whole
// difference between the old nearestOp and this one: the middle of a long
// straight line is nowhere near either end of it.
function distanceToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;

  // A zero-length segment is a point — a dot, or a stroke of one sample.
  if (lengthSquared === 0) return Math.hypot(px - ax, py - ay);

  // Projection of the point onto the line, clamped to the segment.
  const t = Math.max(
    0,
    Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared),
  );
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function hits(op: DrawOp, x: number, y: number, measure: Measure): boolean {
  if (op.kind === "text") {
    const bounds = opBounds(op, measure);
    return (
      x >= bounds.x - TOLERANCE &&
      x <= bounds.x + bounds.width + TOLERANCE &&
      y >= bounds.y - TOLERANCE &&
      y <= bounds.y + bounds.height + TOLERANCE
    );
  }

  if (op.kind === "arrow") {
    return distanceToSegment(x, y, op.x1, op.y1, op.x2, op.y2) <= TOLERANCE;
  }

  if (op.points.length === 2) {
    return Math.hypot(x - op.points[0], y - op.points[1]) <= TOLERANCE;
  }

  for (let i = 0; i + 3 < op.points.length; i += 2) {
    const distance = distanceToSegment(
      x,
      y,
      op.points[i],
      op.points[i + 1],
      op.points[i + 2],
      op.points[i + 3],
    );
    if (distance <= TOLERANCE) return true;
  }

  return false;
}

// Backwards, because later ops render on top and the topmost should win.
export function hitTest(
  ops: DrawOp[],
  x: number,
  y: number,
  measure: Measure,
): string | null {
  for (let i = ops.length - 1; i >= 0; i -= 1) {
    if (hits(ops[i], x, y, measure)) return ops[i].id;
  }
  return null;
}

// Where a double-click lands inside ONE line of a text op, in characters. The
// double-click that reopens an element for editing used to always place the
// caret at the very end, which turned "fix the middle word" into "delete
// everything after it and retype" — this is what lets the caret land near the
// click instead, so a word under the pointer can be selected in place.
//
// A linear walk rather than a binary search: these are chat/board-length
// strings, not documents, so there is no measurable cost to trading a smarter
// algorithm for one that cannot get the monotonicity of a caller-supplied
// measurer wrong.
export function caretIndexInLine(
  line: string,
  size: number,
  style: TextMeasureStyle | undefined,
  offsetX: number,
  measure: Measure,
): number {
  if (offsetX <= 0) return 0;

  let best = 0;
  let bestDistance = offsetX;
  for (let i = 1; i <= line.length; i += 1) {
    const width = measure(line.slice(0, i), size, style);
    const distance = Math.abs(width - offsetX);
    if (distance <= bestDistance) {
      bestDistance = distance;
      best = i;
    }
  }
  return best;
}

// The same question across a whole (possibly multi-line) text op: which
// character index is nearest a click at (offsetX, offsetY) relative to the
// op's own x, y anchor. LINE_HEIGHT here is the same 1.25 drawOps and
// TextLayer both render at — a different value would pick the wrong line for
// a click near a line boundary.
export function caretIndexInText(
  text: string,
  size: number,
  style: TextMeasureStyle | undefined,
  offsetX: number,
  offsetY: number,
  measure: Measure,
): number {
  const lines = text.split("\n");
  const lineIndex = Math.min(
    lines.length - 1,
    Math.max(0, Math.floor(offsetY / (size * LINE_HEIGHT))),
  );

  let index = 0;
  for (let i = 0; i < lineIndex; i += 1) index += lines[i].length + 1; // the \n
  return index + caretIndexInLine(lines[lineIndex], size, style, offsetX, measure);
}
