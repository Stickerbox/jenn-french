import { describe, it, expect } from "vitest";
import {
  MIN_SCALE,
  MAX_SCALE,
  fitScale,
  clampScale,
  clampPan,
  rasterScale,
} from "@/lib/board-zoom";

// The logical space every board is drawn in. Named here so the numbers below
// read as a board rather than as arbitrary sizes.
const BOARD = { width: 1600, height: 1000 };

describe("fitScale", () => {
  it("is limited by the narrower axis", () => {
    expect(fitScale({ width: 800, height: 1000 }, BOARD)).toBe(0.5);
  });

  it("is limited by the shorter axis when that one binds", () => {
    expect(fitScale({ width: 1600, height: 250 }, BOARD)).toBe(0.25);
  });

  it("is 1 when the board exactly fills the viewport", () => {
    expect(fitScale(BOARD, BOARD)).toBe(1);
  });

  it("falls back to 1 rather than 0 on a viewport with no size yet", () => {
    // The first render happens before layout, so this is the real first call
    // on every open. A 0 here would draw a canvas of no pixels.
    expect(fitScale({ width: 0, height: 0 }, BOARD)).toBe(1);
  });

  it("falls back to 1 on content with no size", () => {
    expect(fitScale(BOARD, { width: 0, height: 0 })).toBe(1);
  });
});

describe("clampScale", () => {
  it("refuses to zoom out below the fit", () => {
    // There is nothing to find in the empty space around a page smaller than
    // its viewport, so the fit is the floor.
    expect(clampScale(0.5)).toBe(MIN_SCALE);
  });

  it("keeps a value inside the range", () => {
    expect(clampScale(4)).toBe(4);
  });

  it("stops at the ceiling", () => {
    expect(clampScale(20)).toBe(MAX_SCALE);
  });

  it("answers the floor for a value that is not a number", () => {
    // A pinch gesture can produce NaN when two pointers land on one point.
    expect(clampScale(Number.NaN)).toBe(MIN_SCALE);
  });

  it("has a floor of 1 and a ceiling of 8", () => {
    expect(MIN_SCALE).toBe(1);
    expect(MAX_SCALE).toBe(8);
  });
});

describe("clampPan", () => {
  const viewport = { width: 800, height: 600 };

  it("centres content smaller than the viewport and ignores the drag", () => {
    expect(
      clampPan({ x: 500, y: -300 }, viewport, { width: 400, height: 200 }),
    ).toEqual({ x: 200, y: 200 });
  });

  it("will not let a drag pull the left edge inside the viewport", () => {
    expect(clampPan({ x: 120, y: 0 }, viewport, { width: 1600, height: 600 }).x).toBe(0);
  });

  it("will not let a drag pull the right edge inside the viewport", () => {
    expect(
      clampPan({ x: -99999, y: 0 }, viewport, { width: 1600, height: 600 }).x,
    ).toBe(-800);
  });

  it("keeps an offset that is already inside the bounds", () => {
    expect(
      clampPan({ x: -300, y: 0 }, viewport, { width: 1600, height: 600 }).x,
    ).toBe(-300);
  });

  it("clamps one axis and centres the other", () => {
    // A board zoomed in horizontally but still short enough to fit vertically.
    expect(
      clampPan({ x: -99999, y: 99999 }, viewport, { width: 1600, height: 300 }),
    ).toEqual({ x: -800, y: 150 });
  });

  it("agrees at the boundary where the two branches meet", () => {
    // drawn === viewport is the one point where the centring branch and the
    // clamping branch must give the same answer. They both give 0. A regression
    // here — `<=` becoming `<` — would make the drawing jump by a pixel as you
    // zoom past the fit, which is the kind of fault nobody reports precisely.
    expect(clampPan({ x: 999, y: -999 }, viewport, { width: 800, height: 600 })).toEqual({
      x: 0,
      y: 0,
    });
  });

  it("falls back to the origin rather than passing NaN through", () => {
    // NaN survives Math.min and Math.max, so without a guard it reaches the
    // CSS transform and blanks the drawing.
    expect(
      clampPan({ x: Number.NaN, y: Number.NaN }, viewport, { width: 1600, height: 600 }),
    ).toEqual({ x: 0, y: 0 });
  });
});

describe("rasterScale", () => {
  it("uses the device's own ratio when there is room", () => {
    expect(rasterScale({ width: 800, height: 600 }, 2)).toBe(2);
  });

  it("uses 1 on a display that reports no ratio", () => {
    expect(rasterScale({ width: 800, height: 600 }, 1)).toBe(1);
  });

  it("falls back to 1 rather than 0 on a nonsense ratio", () => {
    expect(rasterScale({ width: 800, height: 600 }, 0)).toBe(1);
    expect(rasterScale({ width: 800, height: 600 }, Number.NaN)).toBe(1);
  });

  it("cuts the ratio down when the backing store would exceed the cap", () => {
    // 4000 x 3000 at dpr 3 is 108M pixels — over six times the ceiling. iOS
    // Safari answers that with a BLANK canvas rather than an error, which is
    // indistinguishable from a board that failed to load.
    const scale = rasterScale({ width: 4000, height: 3000 }, 3);
    expect(scale).toBeLessThan(3);
    expect(4000 * scale * (3000 * scale)).toBeLessThanOrEqual(16_000_000);
  });

  it("keeps the result under the cap once the caller floors it", () => {
    // exportLayout floors its scaled dimensions for exactly this reason:
    // rounding both up puts their product back over the cap that was just
    // enforced. The viewer floors too, so the check has to survive it.
    const drawn = { width: 4000, height: 3000 };
    const scale = rasterScale(drawn, 3);
    const width = Math.floor(drawn.width * scale);
    const height = Math.floor(drawn.height * scale);
    expect(width * height).toBeLessThanOrEqual(16_000_000);
  });

  it("falls back to the ratio on a size with no area", () => {
    expect(rasterScale({ width: 0, height: 0 }, 2)).toBe(2);
  });
});
