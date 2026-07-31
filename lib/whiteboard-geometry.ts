import { BOARD_HEIGHT, BOARD_WIDTH } from "@/lib/whiteboard-ops";

// The subset of DOMRect these need, so a test can pass a plain object and the
// module never touches the DOM.
export type Box = {
  left: number;
  top: number;
  width: number;
  height: number;
};

// Pointer events arrive in CSS pixels; ops live in the fixed logical space.
// This module is the only place the two meet, which is why it is worth having
// rather than two inline divisions in a component.
export function toLogical(box: Box, clientX: number, clientY: number): [number, number] {
  // A box can be 0×0 for one frame after mount, before layout runs.
  if (box.width === 0 || box.height === 0) return [0, 0];
  return [
    ((clientX - box.left) / box.width) * BOARD_WIDTH,
    ((clientY - box.top) / box.height) * BOARD_HEIGHT,
  ];
}

// Relative to the box, deliberately: the textarea is an absolutely-positioned
// child of the surface element, so adding box.left/top would displace it by the
// page's scroll offset and every margin above it.
export function toOffset(box: Box, x: number, y: number): [number, number] {
  return [(x / BOARD_WIDTH) * box.width, (y / BOARD_HEIGHT) * box.height];
}

// A font size in logical units, rendered at the element's current scale. The
// inline textarea has to match the canvas exactly or the text jumps when it
// commits.
export function logicalToPx(size: number, boxWidth: number): number {
  if (boxWidth === 0) return 0;
  return (size / BOARD_WIDTH) * boxWidth;
}
