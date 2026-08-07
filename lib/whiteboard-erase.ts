import { hitTest, type Measure } from "@/lib/whiteboard-hit";
import type { DrawOp } from "@/lib/whiteboard-ops";

// The distance between erase samples, in logical units. A fast drag delivers
// pointermove events tens of units apart on a 1600x1000 board, so testing
// only the event positions leaves gaps the cursor visibly crossed — an
// element sitting entirely between two events is never hit-tested at all.
// Walking the segment at a fixed step closes that gap.
//
// The bound that matters: half the step is the furthest a point ON the
// path can land from its nearest sample, and hitTest's own TOLERANCE (14
// units) is the furthest an op can sit from a sample point and still be
// considered touched. So ERASE_STEP <= 2 * TOLERANCE guarantees nothing
// slips between two samples; this is comfortably under that, not merely at
// it, so a stroke's own width does not eat the margin.
export const ERASE_STEP = 10;

// Every point the eraser passes through between two pointer events,
// including `to` but never `from` — the caller already tested `from` as the
// `to` of the previous call (or, for the very first sample of a drag, as its
// own zero-length segment; see idsAlongErasePath's pointerDown case). A
// stationary pointer (from equals to) still yields exactly one point, `to`,
// so a click without a drag keeps working.
export function erasePath(
  from: [number, number],
  to: [number, number],
  step: number,
): [number, number][] {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const distance = Math.hypot(dx, dy);
  if (distance === 0) return [to];

  const steps = Math.max(1, Math.ceil(distance / step));
  const points: [number, number][] = [];
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    points.push([from[0] + dx * t, from[1] + dy * t]);
  }
  return points;
}

// The ids the eraser touches walking from `from` to `to`. `already` is every
// id this gesture has removed so far — an id in it is skipped rather than
// returned a second time, because a second `remove` naming the same id is
// harmless to foldPage but is log noise shipped over SSE to a student for
// nothing. `already` is read only, never mutated: the caller (which also owns
// the set across the whole gesture, not just this one segment) decides when
// an id is truly spent.
export function idsAlongErasePath(
  ops: DrawOp[],
  from: [number, number],
  to: [number, number],
  step: number,
  measure: Measure,
  already: ReadonlySet<string>,
): string[] {
  const found: string[] = [];
  for (const [x, y] of erasePath(from, to, step)) {
    const id = hitTest(ops, x, y, measure);
    if (id && !already.has(id) && !found.includes(id)) found.push(id);
  }
  return found;
}

// How far back one press of Undo should take the log.
//
// An erase DRAG appends a `remove` op per pointermove that touched something,
// so a single sweep across the board can leave a dozen of them — and undo
// pops one op, which gave back one dab of a gesture the reader experienced as
// one action. It cannot simply pop "all trailing removes" either: a clearPage,
// a delete-key and every revision also end in a remove, and swallowing those
// together would undo three separate decisions at once.
//
// So the gesture records where it began and where it ended, and this only
// treats it as one action while it is still the LAST thing in the log.
// Anything appended afterwards — a stroke, a text commit — makes `end` stop
// matching, and undo falls back to popping one op, which is right: the reader's
// last action was that other thing.
export function undoLength(
  logLength: number,
  gesture: { start: number; end: number } | null,
): number {
  if (gesture && gesture.end === logLength && gesture.start < logLength) {
    return gesture.start;
  }
  return Math.max(0, logLength - 1);
}
