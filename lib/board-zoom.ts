// How far the board viewer may zoom, and where the drawing is allowed to sit.
//
// Pure and injected with sizes rather than reading the DOM, for the reason
// lib/whiteboard-hit.ts takes an injected text measurer: it makes the rules
// testable with numbers instead of a layout engine, which the test environment
// does not have.

import { MAX_CANVAS_AREA } from "@/lib/whiteboard-export";

export type Size = { width: number; height: number };
export type Offset = { x: number; y: number };

// `scale` is a MULTIPLIER OF THE FIT, not of the logical space. That is what
// makes 1 mean "the whole page is visible" at every window size, on a phone
// and on a laptop alike, rather than meaning "1600 logical units to 1600 CSS
// pixels" — which is off-screen on a phone and small on a desktop.
export const MIN_SCALE = 1;
export const MAX_SCALE = 8;

function usable(size: Size): boolean {
  return (
    Number.isFinite(size.width) &&
    Number.isFinite(size.height) &&
    size.width > 0 &&
    size.height > 0
  );
}

// The scale at which the whole page is visible. Both axes, whichever binds.
//
// The fallback is 1 and never 0. The first render happens before layout, so a
// zero-sized viewport is the real first call on every open, and a 0 here would
// size a canvas at no pixels — which is indistinguishable from a board that
// failed to load.
export function fitScale(viewport: Size, content: Size): number {
  if (!usable(viewport) || !usable(content)) return 1;
  return Math.min(
    viewport.width / content.width,
    viewport.height / content.height,
  );
}

// There is deliberately no zoom-out below the fit. A page smaller than its
// viewport has empty space around it, and there is nothing in that space to
// look for.
export function clampScale(scale: number): number {
  // A pinch with both pointers on one point produces NaN, and NaN survives
  // Math.min/Math.max unchanged — so it has to be caught before them or it
  // reaches the canvas and blanks it.
  if (!Number.isFinite(scale)) return MIN_SCALE;
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

// `offset` is the drawn content's top-left corner, relative to the viewport's
// top-left. `drawn` is its size in CSS pixels, with the scale already applied.
//
// Two cases, and the first is the one worth stating: when the content is
// SMALLER than the viewport the requested offset is discarded and the content
// is centred. A drag has nowhere useful to go on that axis, and letting it
// wander leaves the drawing against an edge for no reason.
function clampAxis(value: number, viewport: number, drawn: number): number {
  // Guarded for the reason clampScale is, and against the same class of input:
  // a gesture can produce NaN, and NaN survives Math.min and Math.max unchanged
  // all the way to a CSS transform, where it blanks the drawing with no error.
  // 0 rather than a throw — a pan that cannot be computed should fall back to
  // the origin the centring branch would have given anyway.
  const requested = Number.isFinite(value) ? value : 0;

  if (drawn <= viewport) return (viewport - drawn) / 2;
  // Otherwise: the leading edge may not come inside the viewport (max 0) and
  // the trailing edge may not either (min viewport - drawn). Without this a
  // drag can push the whole board off screen and leave an empty rectangle with
  // nothing on it to explain how to get back.
  return Math.min(0, Math.max(viewport - drawn, requested));
}

// `clampPan` takes two Size arguments: viewport and drawn. Swapping them is a
// silent transposition — the types are identical and the result is plausible
// but wrong. Be careful at the call site.
export function clampPan(
  offset: Offset,
  viewport: Size,
  drawn: Size,
): Offset {
  return {
    x: clampAxis(offset.x, viewport.width, drawn.width),
    y: clampAxis(offset.y, viewport.height, drawn.height),
  };
}

// How many backing-store pixels to allocate per CSS pixel.
//
// The viewer redraws at every zoom level rather than magnifying a picture, so
// its canvas grows with the zoom — and runs into the same ceiling exportLayout
// answers to. MAX_CANVAS_AREA is imported rather than repeated: two copies of
// that number would drift, and the failure is silent on the device that
// matters. iOS Safari returns a BLANK canvas past roughly 16.7M pixels, which
// looks exactly like a board that failed to load.
//
// Downscaling rather than refusing: a slightly soft board at 8x is a board,
// and a blank one is a bug report.
export function rasterScale(drawn: Size, devicePixelRatio: number): number {
  const dpr =
    Number.isFinite(devicePixelRatio) && devicePixelRatio > 0
      ? devicePixelRatio
      : 1;
  if (!usable(drawn)) return dpr;

  const area = drawn.width * dpr * (drawn.height * dpr);
  if (area <= MAX_CANVAS_AREA) return dpr;
  return dpr * Math.sqrt(MAX_CANVAS_AREA / area);
}
