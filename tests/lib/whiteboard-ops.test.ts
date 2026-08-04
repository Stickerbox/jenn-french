import { describe, expect, it } from "vitest";
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  PALETTE,
  boardHasContent,
  dropTrailingEmptyPages,
  foldOps,
  foldPage,
  normaliseOps,
  readOps,
  type Op,
  type StrokeOp,
} from "@/lib/whiteboard-ops";

// StrokeOp rather than Op: spreading the union and overriding a field TS cannot
// see on every member (`{ ...stroke("a"), points: [...] }`) does not narrow back
// to Op. Every call site takes an Op, and a StrokeOp is one.
const stroke = (id: string, page = 0): StrokeOp => ({
  id,
  page,
  kind: "stroke",
  points: [0, 0, 10, 10],
  colour: PALETTE[0],
  width: 3,
});

describe("readOps", () => {
  it("returns an empty array for anything that is not an array", () => {
    expect(readOps(null)).toEqual([]);
    expect(readOps(undefined)).toEqual([]);
    expect(readOps("nope")).toEqual([]);
    expect(readOps({ ops: [] })).toEqual([]);
  });

  it("keeps well-formed ops", () => {
    expect(readOps([stroke("a")])).toEqual([stroke("a")]);
  });

  // Prisma types a Json column as JsonValue, i.e. not at all. A board that
  // fails to render is worse than a board missing one stroke.
  it("discards malformed entries instead of throwing", () => {
    const ops = readOps([
      stroke("a"),
      { id: "b", page: 0, kind: "stroke" }, // no points
      { id: "c", page: -1, kind: "stroke", points: [0, 0], colour: PALETTE[0], width: 3 },
      { id: "d", page: 0, kind: "unknown" },
      null,
      "text",
      stroke("e"),
    ]);
    expect(ops.map((op) => op.id)).toEqual(["a", "e"]);
  });

  it("rejects a colour that is not in the palette", () => {
    const ops = readOps([{ ...stroke("a"), colour: "javascript:alert(1)" }]);
    expect(ops).toEqual([]);
  });

  it("rejects a non-integer page", () => {
    expect(readOps([{ ...stroke("a"), page: 1.5 }])).toEqual([]);
  });

  it("reads text, arrow and remove ops", () => {
    const ops: Op[] = [
      { id: "t", page: 0, kind: "text", x: 5, y: 6, text: "bonjour", colour: PALETTE[1], size: 32 },
      { id: "r", page: 0, kind: "arrow", x1: 1, y1: 2, x2: 3, y2: 4, colour: PALETTE[2] },
      { id: "x", page: 0, kind: "remove", targets: ["t"] },
    ];
    expect(readOps(ops)).toEqual(ops);
  });

  it("discards a text op with an empty string", () => {
    expect(
      readOps([{ id: "t", page: 0, kind: "text", x: 0, y: 0, text: "", colour: PALETTE[0], size: 32 }]),
    ).toEqual([]);
  });
});

// foldPage is the primitive: it folds ONE page's log and ignores page numbers,
// which is what a stored WhiteboardPage row holds. getWhiteboardScene needs
// exactly this — a stored page's log still contains its removes, so filtering
// them out without applying them would make erased strokes reappear.
describe("foldPage", () => {
  it("returns an empty array for an empty log", () => {
    expect(foldPage([])).toEqual([]);
  });

  it("applies removes rather than merely discarding them", () => {
    const kept = foldPage([
      stroke("a"),
      stroke("b"),
      { id: "r", page: 0, kind: "remove", targets: ["a"] },
    ]);
    expect(kept.map((op) => op.id)).toEqual(["b"]);
  });

  it("ignores page numbers entirely", () => {
    const kept = foldPage([stroke("a", 7), stroke("b", 7)]);
    expect(kept.map((op) => op.id)).toEqual(["a", "b"]);
  });

  it("never returns a remove op", () => {
    const kept = foldPage([{ id: "r", page: 0, kind: "remove", targets: [] }]);
    expect(kept).toEqual([]);
  });
});

describe("foldOps", () => {
  it("returns one empty page for an empty log", () => {
    expect(foldOps([])).toEqual([[]]);
  });

  it("keeps ops in the order they were added", () => {
    const scene = foldOps([stroke("a"), stroke("b")]);
    expect(scene[0].map((op) => op.id)).toEqual(["a", "b"]);
  });

  it("drops ops named by a later remove", () => {
    const scene = foldOps([
      stroke("a"),
      stroke("b"),
      { id: "r", page: 0, kind: "remove", targets: ["a"] },
    ]);
    expect(scene[0].map((op) => op.id)).toEqual(["b"]);
  });

  // Undo is an append, so a remove that arrives before its target would be a
  // reordered log rather than a valid one — but folding must still be total.
  it("drops a target named by a remove that precedes it", () => {
    const scene = foldOps([
      { id: "r", page: 0, kind: "remove", targets: ["a"] },
      stroke("a"),
    ]);
    expect(scene[0]).toEqual([]);
  });

  it("partitions by page", () => {
    const scene = foldOps([stroke("a", 0), stroke("b", 2)]);
    expect(scene).toHaveLength(3);
    expect(scene[0].map((op) => op.id)).toEqual(["a"]);
    expect(scene[1]).toEqual([]);
    expect(scene[2].map((op) => op.id)).toEqual(["b"]);
  });

  // Clearing page 3 is how you say "page 3 exists but is empty".
  it("counts a page that holds only a remove", () => {
    const scene = foldOps([{ id: "r", page: 2, kind: "remove", targets: [] }]);
    expect(scene).toHaveLength(3);
  });

  it("never contains remove ops", () => {
    const scene = foldOps([stroke("a"), { id: "r", page: 0, kind: "remove", targets: [] }]);
    // Through string[], because Scene is DrawOp[][] — the comparison this
    // asserts is one the type already forbids expressing.
    const kinds: string[] = scene[0].map((op) => op.kind);
    expect(kinds).not.toContain("remove");
  });
});

describe("dropTrailingEmptyPages", () => {
  it("keeps a single empty page rather than returning nothing", () => {
    expect(dropTrailingEmptyPages([[]])).toEqual([[]]);
  });

  it("drops empty pages from the end", () => {
    expect(dropTrailingEmptyPages([[stroke("a")], [], []])).toEqual([[stroke("a")]]);
  });

  it("keeps an empty page that has content after it", () => {
    const scene = [[stroke("a")], [], [stroke("b", 2)]];
    expect(dropTrailingEmptyPages(scene)).toEqual(scene);
  });
});

describe("normaliseOps", () => {
  it("rounds coordinates, because sub-pixel precision in a 1600x1000 space is payload not detail", () => {
    const ops = normaliseOps([
      { ...stroke("a"), points: [1.4, 2.6, 3.5, 4.49] },
      { id: "t", page: 0, kind: "text", x: 9.7, y: 8.2, text: "a", colour: PALETTE[0], size: 32 },
    ]);
    expect(ops[0]).toMatchObject({ points: [1, 3, 4, 4] });
    expect(ops[1]).toMatchObject({ x: 10, y: 8 });
  });

  it("leaves ids, text and colours alone", () => {
    const ops = normaliseOps([
      { id: "t", page: 0, kind: "text", x: 0, y: 0, text: " bonjour ", colour: PALETTE[3], size: 32 },
    ]);
    expect(ops[0]).toMatchObject({ id: "t", text: " bonjour ", colour: PALETTE[3] });
  });
});

describe("the logical canvas", () => {
  it("is a fixed size, because four different pixel sizes render the same ops", () => {
    expect(BOARD_WIDTH).toBe(1600);
    expect(BOARD_HEIGHT).toBe(1000);
  });
});

describe("boardHasContent", () => {
  it("is false for an untouched board", () => {
    expect(boardHasContent([])).toBe(false);
  });

  it("is true for one stroke", () => {
    expect(boardHasContent([stroke("a")])).toBe(true);
  });

  // The case that decides the shape of this function. `ops.length > 0` would
  // say true here, the dialog would offer to save, and the save would refuse
  // the board as empty.
  it("is false when everything drawn has been removed", () => {
    expect(
      boardHasContent([
        stroke("a"),
        { id: "r", page: 0, kind: "remove", targets: ["a"] },
      ]),
    ).toBe(false);
  });

  it("is true for a stroke on a later page with earlier pages empty", () => {
    expect(boardHasContent([stroke("a", 2)])).toBe(true);
  });

  it("is false for pages she added and never drew on", () => {
    expect(
      boardHasContent([
        stroke("a", 1),
        { id: "r", page: 1, kind: "remove", targets: ["a"] },
      ]),
    ).toBe(false);
  });
});
