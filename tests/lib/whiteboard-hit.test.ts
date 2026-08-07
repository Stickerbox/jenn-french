import { describe, expect, it } from "vitest";
import { PALETTE, type DrawOp, type TextOp } from "@/lib/whiteboard-ops";
import {
  caretIndexInLine,
  caretIndexInText,
  hitTest,
  opBounds,
  type Measure,
} from "@/lib/whiteboard-hit";

// Injected so the module is pure: 10 logical units per character, one line per
// \n, and 15% wider when bold — a real canvas.measureText widens for bold too,
// which is the whole reason Measure carries a style argument at all. The
// component passes a real one backed by canvas.measureText.
const measure: Measure = (text, size, style) =>
  Math.max(...text.split("\n").map((line) => line.length)) *
  size *
  0.25 *
  (style?.bold ? 1.15 : 1);

// TextOp rather than DrawOp: spreading the union and overriding `bold`, a
// field TS cannot see on every member of DrawOp, does not narrow back to it —
// the same trap tests/lib/whiteboard-ops.test.ts's `stroke` helper comment
// already documents.
const text = (id: string, x: number, y: number, body = "bonjour"): TextOp => ({
  id,
  page: 0,
  kind: "text",
  x,
  y,
  text: body,
  colour: PALETTE[0],
  size: 40,
});

const line = (id: string, x1: number, y1: number, x2: number, y2: number): DrawOp => ({
  id,
  page: 0,
  kind: "stroke",
  points: [x1, y1, x2, y2],
  colour: PALETTE[0],
  width: 5,
});

describe("opBounds", () => {
  it("boxes a text op from its anchor, using the measurer", () => {
    const bounds = opBounds(text("t", 100, 200), measure);
    expect(bounds.x).toBe(100);
    expect(bounds.y).toBe(200);
    expect(bounds.width).toBeGreaterThan(0);
    expect(bounds.height).toBeGreaterThan(0);
  });

  it("grows a text box with the number of lines", () => {
    const one = opBounds(text("a", 0, 0, "un"), measure);
    const three = opBounds(text("b", 0, 0, "un\ndeux\ntrois"), measure);
    expect(three.height).toBeGreaterThan(one.height);
  });

  it("boxes a stroke around all its points", () => {
    const bounds = opBounds(line("s", 10, 20, 110, 220), measure);
    expect(bounds.x).toBeLessThanOrEqual(10);
    expect(bounds.y).toBeLessThanOrEqual(20);
    expect(bounds.x + bounds.width).toBeGreaterThanOrEqual(110);
    expect(bounds.y + bounds.height).toBeGreaterThanOrEqual(220);
  });

  // Without style reaching the measurer, a bold element's hit box and
  // selection outline come back the width of the plain text — narrower than
  // what drawOps actually paints.
  it("measures a bold op wider than the same text plain", () => {
    const plain = opBounds(text("t", 0, 0), measure);
    const bold = opBounds({ ...text("t", 0, 0), bold: true }, measure);
    expect(bold.width).toBeGreaterThan(plain.width);
  });

  it("boxes an arrow around both endpoints", () => {
    const arrow: DrawOp = {
      id: "a",
      page: 0,
      kind: "arrow",
      x1: 300,
      y1: 100,
      x2: 100,
      y2: 300,
      colour: PALETTE[0],
    };
    const bounds = opBounds(arrow, measure);
    expect(bounds.x).toBeLessThanOrEqual(100);
    expect(bounds.x + bounds.width).toBeGreaterThanOrEqual(300);
  });
});

describe("hitTest", () => {
  it("returns null when nothing is near", () => {
    expect(hitTest([text("t", 0, 0)], 1500, 900, measure)).toBeNull();
  });

  it("hits a text element inside its box", () => {
    expect(hitTest([text("t", 100, 100)], 110, 110, measure)).toBe("t");
  });

  // The bug this module exists to fix: nearestOp measured distance to a
  // stroke's endpoints, so the middle of a long underline hit nothing.
  it("hits the MIDDLE of a long stroke, not just its ends", () => {
    expect(hitTest([line("s", 100, 500, 1500, 500)], 800, 502, measure)).toBe("s");
  });

  it("misses a stroke by more than the tolerance", () => {
    expect(hitTest([line("s", 100, 500, 1500, 500)], 800, 900, measure)).toBeNull();
  });

  it("hits the middle of an arrow's shaft", () => {
    const arrow: DrawOp = {
      id: "a",
      page: 0,
      kind: "arrow",
      x1: 0,
      y1: 0,
      x2: 400,
      y2: 400,
      colour: PALETTE[0],
    };
    expect(hitTest([arrow], 200, 200, measure)).toBe("a");
  });

  // Later ops draw on top, so the topmost one is the last that matches.
  it("returns the topmost element when two overlap", () => {
    const ops = [text("under", 100, 100), text("over", 100, 100)];
    expect(hitTest(ops, 110, 110, measure)).toBe("over");
  });

  it("returns null for an empty page", () => {
    expect(hitTest([], 10, 10, measure)).toBeNull();
  });

  // A single-point stroke is a dot, and must still be selectable.
  it("hits a dot", () => {
    const dot: DrawOp = {
      id: "d",
      page: 0,
      kind: "stroke",
      points: [500, 500],
      colour: PALETTE[0],
      width: 6,
    };
    expect(hitTest([dot], 502, 498, measure)).toBe("d");
  });
});

describe("caretIndexInLine", () => {
  // With this fake measurer, each character of "bonjour" is size*0.25 wide.
  const size = 40; // 10 logical units per character

  it("returns 0 for a click at or before the start", () => {
    expect(caretIndexInLine("bonjour", size, undefined, 0, measure)).toBe(0);
    expect(caretIndexInLine("bonjour", size, undefined, -5, measure)).toBe(0);
  });

  it("returns the full length for a click past the end", () => {
    expect(caretIndexInLine("bonjour", size, undefined, 9999, measure)).toBe(7);
  });

  it("lands near the middle of the word for a click over its middle", () => {
    // "bonjour" is 7 characters, each 10 units wide here — a click at 35
    // (3.5 characters in) is nearest the boundary after the 4th character.
    expect(caretIndexInLine("bonjour", size, undefined, 35, measure)).toBe(4);
  });

  // The reason Measure carries a style: a bold caret placement must use the
  // same (wider) per-character advance the bold text is actually drawn with,
  // or the caret lands to the LEFT of where the click actually was.
  it("accounts for style when the line is bold", () => {
    const plainIndex = caretIndexInLine("bonjour", size, undefined, 35, measure);
    const boldIndex = caretIndexInLine("bonjour", size, { bold: true }, 35, measure);
    expect(boldIndex).toBeLessThanOrEqual(plainIndex);
  });
});

describe("caretIndexInText", () => {
  const size = 40;
  const lineHeight = size * 1.25; // matches drawOps and TextLayer

  it("stays on the first line for a click within it", () => {
    expect(caretIndexInText("bonjour\nsalut", size, undefined, 35, 0, measure)).toBe(4);
  });

  // The offset into line 2 is what proves the \n is counted as one character
  // of the running index, matching how retyping edits the same string
  // drawOps split on \n in the first place.
  it("advances past the newline onto the second line", () => {
    const index = caretIndexInText("bonjour\nsalut", size, undefined, 20, lineHeight, measure);
    // "bonjour" (7) + "\n" (1) + however far into "salut" the click reached.
    expect(index).toBeGreaterThan(8);
  });

  it("clamps a click above the text to the first line", () => {
    expect(caretIndexInText("bonjour\nsalut", size, undefined, 0, -500, measure)).toBe(0);
  });

  it("clamps a click below the text to the last line", () => {
    const index = caretIndexInText("bonjour\nsalut", size, undefined, 9999, 9999, measure);
    expect(index).toBe("bonjour\nsalut".length);
  });
});
