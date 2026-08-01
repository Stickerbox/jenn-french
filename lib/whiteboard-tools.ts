export type Tool = "select" | "pen" | "text" | "arrow" | "eraser";

export type PointerAction =
  | "ignore"
  | "open-text"
  | "select"
  | "erase"
  | "start-stroke";

export type PointerIntent = {
  action: PointerAction;
  capturesPointer: boolean;
  preventsDefault: boolean;
};

const IGNORE: PointerIntent = {
  action: "ignore",
  capturesPointer: false,
  preventsDefault: false,
};

// What a pointer-down on the board surface means. Extracted from BoardEditor so
// the rule below can be tested at all: the bug it fixes is browser focus
// behaviour, which jsdom does not implement, so the component itself is
// unverifiable here.
export function pointerDownIntent(input: {
  tool: Tool;
  hasDraft: boolean;
  saving: boolean;
}): PointerIntent {
  if (input.saving) return IGNORE;

  // A click anywhere commits an open draft by blurring the textarea. That means
  // this must NOT prevent the default — the blur is the browser's doing.
  if (input.hasDraft) return IGNORE;

  if (input.tool === "text") {
    // No capture, and prevent the default. Capture retargets the compatibility
    // mousedown to the surface <div>; the div is not focusable, so the default
    // focus action lands on <body> and blurs the textarea TextLayer just
    // focused — committing an empty draft and closing the box inside the one
    // click. Placing text has no drag, so capture was never wanted here.
    return { action: "open-text", capturesPointer: false, preventsDefault: true };
  }

  if (input.tool === "select") {
    return { action: "select", capturesPointer: true, preventsDefault: false };
  }

  if (input.tool === "eraser") {
    return { action: "erase", capturesPointer: true, preventsDefault: false };
  }

  return { action: "start-stroke", capturesPointer: true, preventsDefault: false };
}
