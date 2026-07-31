import { describe, expect, it } from "vitest";
import { PALETTE, type DrawOp } from "@/lib/whiteboard-ops";
import { TEXT_SIZES, reviseOp, stepTextSize } from "@/lib/whiteboard-revise";

const text: DrawOp = {
  id: "t",
  page: 1,
  kind: "text",
  x: 100,
  y: 200,
  text: "bonjour",
  colour: PALETTE[0],
  size: 44,
};

const stroke: DrawOp = {
  id: "s",
  page: 1,
  kind: "stroke",
  points: [0, 0, 10, 10],
  colour: PALETTE[0],
  width: 5,
};

const arrow: DrawOp = {
  id: "a",
  page: 1,
  kind: "arrow",
  x1: 0,
  y1: 0,
  x2: 100,
  y2: 100,
  colour: PALETTE[0],
};

describe("reviseOp", () => {
  it("returns a remove naming the old op and a replacement with the new id", () => {
    const [remove, next] = reviseOp(text, { dx: 10, dy: 20 }, "new");
    expect(remove).toEqual({
      id: "remove-new",
      page: 1,
      kind: "remove",
      targets: ["t"],
    });
    expect(next.id).toBe("new");
  });

  it("keeps the op on its own page", () => {
    const [remove, next] = reviseOp(text, { dx: 1 }, "new");
    expect(remove.page).toBe(1);
    expect(next.page).toBe(1);
  });

  it("translates a text op", () => {
    const [, next] = reviseOp(text, { dx: 10, dy: -20 }, "new");
    expect(next).toMatchObject({ x: 110, y: 180 });
  });

  it("translates every point of a stroke", () => {
    const [, next] = reviseOp(stroke, { dx: 5, dy: 7 }, "new");
    expect(next).toMatchObject({ points: [5, 7, 15, 17] });
  });

  it("translates both ends of an arrow", () => {
    const [, next] = reviseOp(arrow, { dx: -10, dy: 10 }, "new");
    expect(next).toMatchObject({ x1: -10, y1: 10, x2: 90, y2: 110 });
  });

  it("recolours any kind of op", () => {
    expect(reviseOp(text, { colour: PALETTE[1] }, "n")[1].colour).toBe(PALETTE[1]);
    expect(reviseOp(stroke, { colour: PALETTE[2] }, "n")[1].colour).toBe(PALETTE[2]);
    expect(reviseOp(arrow, { colour: PALETTE[3] }, "n")[1].colour).toBe(PALETTE[3]);
  });

  it("retypes and resizes a text op", () => {
    const [, next] = reviseOp(text, { text: "salut", size: 72 }, "n");
    expect(next).toMatchObject({ text: "salut", size: 72 });
  });

  // A stroke has no words, and silently growing a `text` field onto it would
  // produce an op that readOps then discards.
  it("ignores text and size changes on a non-text op", () => {
    const [, next] = reviseOp(stroke, { text: "salut", size: 72 }, "n");
    expect(next).toMatchObject({ kind: "stroke", points: [0, 0, 10, 10] });
    expect(next).not.toHaveProperty("text");
  });

  it("treats an absent dx or dy as zero", () => {
    const [, next] = reviseOp(text, { dx: 10 }, "n");
    expect(next).toMatchObject({ x: 110, y: 200 });
  });

  it("makes no change at all for an empty revision", () => {
    const [, next] = reviseOp(text, {}, "n");
    expect(next).toMatchObject({ x: 100, y: 200, text: "bonjour", size: 44 });
  });
});

describe("stepTextSize", () => {
  it("moves up the ladder", () => {
    expect(stepTextSize(TEXT_SIZES[0], 1)).toBe(TEXT_SIZES[1]);
  });

  it("moves down the ladder", () => {
    expect(stepTextSize(TEXT_SIZES[1], -1)).toBe(TEXT_SIZES[0]);
  });

  it("stops at the ends rather than wrapping", () => {
    expect(stepTextSize(TEXT_SIZES[0], -1)).toBe(TEXT_SIZES[0]);
    expect(stepTextSize(TEXT_SIZES[TEXT_SIZES.length - 1], 1)).toBe(
      TEXT_SIZES[TEXT_SIZES.length - 1],
    );
  });

  // A board saved before the ladder existed, or edited by hand, can hold a size
  // that is not on it.
  it("snaps a size that is not on the ladder to the nearest rung first", () => {
    expect(TEXT_SIZES).not.toContain(45);
    expect(stepTextSize(45, 1)).toBe(TEXT_SIZES[TEXT_SIZES.indexOf(44) + 1]);
  });
});
