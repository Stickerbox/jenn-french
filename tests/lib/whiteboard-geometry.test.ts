import { describe, expect, it } from "vitest";
import { BOARD_HEIGHT, BOARD_WIDTH } from "@/lib/whiteboard-ops";
import { logicalToPx, toLogical, toOffset } from "@/lib/whiteboard-geometry";

// A box half the logical width: every logical unit is half a CSS pixel.
const box = { left: 100, top: 50, width: BOARD_WIDTH / 2, height: BOARD_HEIGHT / 2 };

describe("toLogical", () => {
  it("maps the top-left corner to the origin", () => {
    expect(toLogical(box, 100, 50)).toEqual([0, 0]);
  });

  it("maps the bottom-right corner to the far edge", () => {
    expect(toLogical(box, 100 + box.width, 50 + box.height)).toEqual([
      BOARD_WIDTH,
      BOARD_HEIGHT,
    ]);
  });

  it("scales a point in the middle", () => {
    expect(toLogical(box, 100 + box.width / 2, 50 + box.height / 2)).toEqual([
      BOARD_WIDTH / 2,
      BOARD_HEIGHT / 2,
    ]);
  });

  // A pointer can leave the element during a drag with pointer capture held.
  it("returns coordinates outside the board without clamping", () => {
    const [x, y] = toLogical(box, 0, 0);
    expect(x).toBeLessThan(0);
    expect(y).toBeLessThan(0);
  });

  it("does not divide by zero on a collapsed box", () => {
    expect(toLogical({ left: 0, top: 0, width: 0, height: 0 }, 10, 10)).toEqual([0, 0]);
  });
});

describe("toOffset", () => {
  // The textarea is an absolutely-positioned child of the element, so it needs
  // coordinates relative to that element — NOT viewport coordinates. Adding
  // box.left here would push it off by the page's scroll and margins.
  it("returns coordinates relative to the box, not the viewport", () => {
    expect(toOffset(box, 0, 0)).toEqual([0, 0]);
  });

  it("round-trips with toLogical", () => {
    const [x, y] = toLogical(box, 300, 200);
    // 300,200 in viewport terms is 200,150 inside a box at 100,50.
    expect(toOffset(box, x, y)).toEqual([200, 150]);
  });

  it("scales the far corner to the box size", () => {
    expect(toOffset(box, BOARD_WIDTH, BOARD_HEIGHT)).toEqual([
      box.width,
      box.height,
    ]);
  });
});

describe("logicalToPx", () => {
  it("scales a size by the same factor as a coordinate", () => {
    expect(logicalToPx(44, box.width)).toBe(22);
  });

  it("returns zero for a collapsed box rather than NaN", () => {
    expect(logicalToPx(44, 0)).toBe(0);
  });
});
