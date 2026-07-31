import { describe, expect, it } from "vitest";
import { PALETTE, type DrawOp } from "@/lib/whiteboard-ops";
import { hitTest, opBounds } from "@/lib/whiteboard-hit";

// Injected so the module is pure: 10 logical units per character, one line per
// \n. The component passes a real one backed by canvas.measureText.
const measure = (text: string, size: number) =>
  Math.max(...text.split("\n").map((line) => line.length)) * size * 0.25;

const text = (id: string, x: number, y: number, body = "bonjour"): DrawOp => ({
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
