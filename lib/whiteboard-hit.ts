import type { DrawOp } from "@/lib/whiteboard-ops";

// Injected rather than imported, so this module never touches a canvas and can
// be tested with a fake. The component supplies one backed by measureText.
export type Measure = (text: string, size: number) => number;

export type Bounds = { x: number; y: number; width: number; height: number };

// How far off an element a click may land and still count, in logical units. A
// trackpad and a 5-unit-wide stroke need forgiveness; too much and overlapping
// elements become a lottery.
const TOLERANCE = 14;

// Matches the line spacing drawOps uses when it renders a multi-line text op.
const LINE_HEIGHT = 1.25;

export function opBounds(op: DrawOp, measure: Measure): Bounds {
  if (op.kind === "text") {
    const lines = op.text.split("\n");
    return {
      x: op.x,
      y: op.y,
      width: measure(op.text, op.size),
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
