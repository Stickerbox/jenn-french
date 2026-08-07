import { describe, expect, it } from "vitest";
import { PALETTE, type DrawOp } from "@/lib/whiteboard-ops";
import type { Measure } from "@/lib/whiteboard-hit";
import { ERASE_STEP, erasePath, idsAlongErasePath, undoLength } from "@/lib/whiteboard-erase";

// Same fake as tests/lib/whiteboard-hit.test.ts: 10 logical units per
// character, one line per \n. The eraser never touches text width, but
// idsAlongErasePath's signature carries a Measure through to hitTest
// regardless of op kind.
const measure: Measure = (text, size) =>
  Math.max(...text.split("\n").map((line) => line.length)) * size * 0.25;

const dot = (id: string, x: number, y: number): DrawOp => ({
  id,
  page: 0,
  kind: "stroke",
  points: [x, y],
  colour: PALETTE[0],
  width: 5,
});

describe("erasePath", () => {
  it("returns just the endpoint for a stationary pointer", () => {
    expect(erasePath([10, 10], [10, 10], ERASE_STEP)).toEqual([[10, 10]]);
  });

  it("samples along the segment, ending at `to`", () => {
    const points = erasePath([0, 0], [30, 0], 10);
    expect(points[points.length - 1]).toEqual([30, 0]);
    // 30 units at a 10-unit step is 3 samples; none of them is `from`.
    expect(points).toHaveLength(3);
    expect(points).not.toContainEqual([0, 0]);
  });

  it("never omits the endpoint even when the segment is shorter than one step", () => {
    const points = erasePath([0, 0], [3, 0], 10);
    expect(points).toEqual([[3, 0]]);
  });

  it("spaces samples evenly along a diagonal", () => {
    const points = erasePath([0, 0], [40, 30], 10);
    // distance is 50, so 5 samples, each 1/5 of the way along.
    expect(points).toHaveLength(5);
    expect(points[0]).toEqual([8, 6]);
    expect(points[4]).toEqual([40, 30]);
  });
});

describe("idsAlongErasePath", () => {
  it("finds an id sitting between `from` and `to`, not on either endpoint", () => {
    // The whole reason this module exists: a fast drag from (0,0) to (100,0)
    // never lands an event on (50,0), so hit-testing only the two endpoints
    // would miss a dot planted exactly between them.
    const ops = [dot("a", 50, 0)];
    const found = idsAlongErasePath(ops, [0, 0], [100, 0], 10, measure, new Set());
    expect(found).toEqual(["a"]);
  });

  it("does not skip an element between two far-apart pointer events", () => {
    // Regression for the literal bug this task describes: a huge jump per
    // event (simulating a fast real drag) must still catch what a slow one
    // would, as long as sampling is dense enough.
    const ops = [dot("mid", 400, 0)];
    const found = idsAlongErasePath(ops, [0, 0], [800, 0], ERASE_STEP, measure, new Set());
    expect(found).toContain("mid");
  });

  it("excludes an id already erased this gesture", () => {
    const ops = [dot("a", 50, 0)];
    const found = idsAlongErasePath(
      ops,
      [0, 0],
      [100, 0],
      10,
      measure,
      new Set(["a"]),
    );
    expect(found).toEqual([]);
  });

  it("returns an id only once even when several samples land on it", () => {
    // A dead-slow drag samples the same small dot many times over.
    const ops = [dot("a", 5, 0)];
    const found = idsAlongErasePath(ops, [0, 0], [10, 0], 1, measure, new Set());
    expect(found).toEqual(["a"]);
  });

  it("finds nothing on an empty board", () => {
    expect(idsAlongErasePath([], [0, 0], [100, 100], ERASE_STEP, measure, new Set())).toEqual([]);
  });

  it("still hits a target under a stationary pointer (click, no drag)", () => {
    const ops = [dot("a", 10, 10)];
    const found = idsAlongErasePath(ops, [10, 10], [10, 10], ERASE_STEP, measure, new Set());
    expect(found).toEqual(["a"]);
  });
});

describe("undoLength", () => {
  it("pops one op when no gesture is pending", () => {
    expect(undoLength(5, null)).toBe(4);
  });

  it("takes a whole erase drag back as one action", () => {
    // The reader swept the eraser once and expects one Undo to answer it,
    // not one press per pointermove that happened to touch something.
    expect(undoLength(9, { start: 4, end: 9 })).toBe(4);
  });

  it("falls back to one op once something else has been drawn since", () => {
    // The gesture is no longer the last thing in the log, so the reader's
    // last action was the stroke — undoing the whole sweep would take back a
    // decision they did not ask about.
    expect(undoLength(10, { start: 4, end: 9 })).toBe(9);
  });

  it("never returns a negative length", () => {
    expect(undoLength(0, null)).toBe(0);
  });

  it("ignores a gesture that recorded no ops", () => {
    // A drag that touched nothing appends nothing, so start === end and there
    // is no gesture to undo — pop one op like any other.
    expect(undoLength(4, { start: 4, end: 4 })).toBe(3);
  });
});
