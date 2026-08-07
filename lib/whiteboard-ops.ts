// The logical space every coordinate lives in. Fixed, and not negotiable:
// Jenn's window, the student's window, a thumbnail and a stacked JPEG export
// are four different pixel sizes rendering the same ops, and without one
// logical space they render differently from identical input.
export const BOARD_WIDTH = 1600;
export const BOARD_HEIGHT = 1000;

// Literal hex rather than the var(--card-*) tokens these match, because an op
// is drawn into a canvas during export where there is no CSS context to
// resolve a custom property against. Kept in step with app/globals.css by
// hand; they are the flashcard palette, so the board reads as part of the same
// object as the card it sits beside.
export const PALETTE = [
  "#1f2a2e", // --card-ink
  "#b5322f", // --card-rouge
  "#0f4c81", // --card-bleu
  "#4a6b52", // --card-moss
  "#9c4a86", // --card-plum
] as const;

export type Colour = (typeof PALETTE)[number];

export type StrokeOp = {
  id: string;
  page: number;
  kind: "stroke";
  // Flat [x, y, x, y, …] rather than {x, y}[]. A stroke is the largest thing in
  // the log, and in Part 2 it is also the thing sent every 150ms.
  points: number[];
  colour: Colour;
  width: number;
};

export type TextOp = {
  id: string;
  page: number;
  kind: "text";
  x: number;
  y: number;
  text: string;
  colour: Colour;
  size: number;
  // Three flat optional booleans, not a nested `style: {...}` object — colour
  // and size, the two attributes already on this op, are flat fields too, and
  // a nested object would need its own reader instead of falling out of the
  // same shape every other field here already uses. Optional, and NOT
  // `bold: boolean`, because a required field fails readOp's shape check on
  // every text op saved before this existed, which readOps then silently
  // drops — the same trap the rest of this file's comments warn about for
  // readSections and readPageKind. Absent means "off", the same as it always
  // rendered.
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
};

export type ArrowOp = {
  id: string;
  page: number;
  kind: "arrow";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  colour: Colour;
};

// Erase and undo append this rather than editing history. That is what makes a
// late joiner in Part 2 need no reconciliation, and what makes what streams
// identical to what is stored.
export type RemoveOp = {
  id: string;
  page: number;
  kind: "remove";
  targets: string[];
};

export type Op = StrokeOp | TextOp | ArrowOp | RemoveOp;
export type DrawOp = StrokeOp | TextOp | ArrowOp;

// The log folded down: pages in order, each holding only what still renders.
export type Scene = DrawOp[][];

function isColour(value: unknown): value is Colour {
  return PALETTE.includes(value as Colour);
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isPage(value: unknown): value is number {
  return isNumber(value) && Number.isInteger(value) && value >= 0;
}

function isId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

// Array.prototype.every with a type predicate narrows the ELEMENTS, not the
// array, so these wrappers exist to get `number[]` and `string[]` out of an
// `unknown` without a cast.
function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every(isNumber);
}

function isIdArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isId);
}

function readOp(value: unknown): Op | null {
  if (typeof value !== "object" || value === null) return null;
  const op = value as Record<string, unknown>;
  if (!isId(op.id) || !isPage(op.page)) return null;

  switch (op.kind) {
    case "stroke": {
      const { points, colour, width } = op;
      if (!isNumberArray(points)) return null;
      // Pairs, and at least one of them.
      if (points.length < 2 || points.length % 2 !== 0) return null;
      if (!isColour(colour) || !isNumber(width)) return null;
      return { id: op.id, page: op.page, kind: "stroke", points, colour, width };
    }

    case "text": {
      const { x, y, text, colour, size, bold, italic, underline } = op;
      if (typeof text !== "string" || text.length === 0) return null;
      if (!isNumber(x) || !isNumber(y) || !isNumber(size)) return null;
      if (!isColour(colour)) return null;
      const result: TextOp = { id: op.id, page: op.page, kind: "text", x, y, text, colour, size };
      // Each flag is read independently and simply OMITTED on a bad value,
      // rather than failing the whole op the way a bad x or colour does. A
      // corrupted `bold` must not cost the text itself — the same
      // degrade-rather-than-discard contract readPageKind and the asset
      // fetcher already carry for a field that is nice-to-have, not
      // load-bearing for rendering anything at all. A non-boolean (a stray
      // string, a 1, a null) is therefore never coerced to true; it reads as
      // absent, i.e. false.
      if (typeof bold === "boolean") result.bold = bold;
      if (typeof italic === "boolean") result.italic = italic;
      if (typeof underline === "boolean") result.underline = underline;
      return result;
    }

    case "arrow": {
      const { x1, y1, x2, y2, colour } = op;
      if (!isNumber(x1) || !isNumber(y1) || !isNumber(x2) || !isNumber(y2)) {
        return null;
      }
      if (!isColour(colour)) return null;
      return { id: op.id, page: op.page, kind: "arrow", x1, y1, x2, y2, colour };
    }

    case "remove": {
      const { targets } = op;
      if (!isIdArray(targets)) return null;
      return { id: op.id, page: op.page, kind: "remove", targets };
    }

    default:
      return null;
  }
}

// Discards malformed entries rather than throwing, the same contract
// readSections has for card sections and for the same reason: Prisma types a
// Json column as JsonValue, so nothing has checked this before we do.
export function readOps(value: unknown): Op[] {
  if (!Array.isArray(value)) return [];
  const ops: Op[] = [];
  for (const entry of value) {
    const op = readOp(entry);
    if (op) ops.push(op);
  }
  return ops;
}

export function normaliseOps(ops: Op[]): Op[] {
  return ops.map((op) => {
    switch (op.kind) {
      case "stroke":
        return { ...op, points: op.points.map(Math.round) };
      case "text":
        return { ...op, x: Math.round(op.x), y: Math.round(op.y) };
      case "arrow":
        return {
          ...op,
          x1: Math.round(op.x1),
          y1: Math.round(op.y1),
          x2: Math.round(op.x2),
          y2: Math.round(op.y2),
        };
      case "remove":
        return op;
    }
  });
}

// Folds ONE page's log, ignoring page numbers. This is the primitive, because a
// stored WhiteboardPage row holds a log that still contains its own removes —
// discarding them without applying them would make erased strokes reappear.
export function foldPage(ops: Op[]): DrawOp[] {
  const removed = new Set<string>();
  for (const op of ops) {
    if (op.kind === "remove") for (const id of op.targets) removed.add(id);
  }
  return ops.filter(
    (op): op is DrawOp => op.kind !== "remove" && !removed.has(op.id),
  );
}

export function foldOps(ops: Op[]): Scene {
  // reduce rather than Math.max(...pages): a long board would spread thousands
  // of arguments onto the stack.
  const pageCount = ops.reduce((max, op) => Math.max(max, op.page + 1), 1);
  const logs: Op[][] = Array.from({ length: pageCount }, () => []);
  for (const op of ops) logs[op.page].push(op);
  return logs.map(foldPage);
}

// A page she added and never drew on should not become a blank page in the
// archive or a blank panel in the export.
//
// Generic over the element type so it works on a folded Scene (DrawOp[][]) and
// on a raw log partitioned by page (Op[][]) without a cast at either call site.
export function dropTrailingEmptyPages<T>(pages: T[][]): T[][] {
  let end = pages.length;
  while (end > 1 && pages[end - 1].length === 0) end -= 1;
  return pages.slice(0, end);
}

// Whether this log would survive a save.
//
// /finish refuses a board whose folded pages are all empty, and
// BoardEditor.save() checks the same thing before posting — so the leave guard
// has to ask the identical question. A looser test (ops.length > 0) would raise
// the dialog for a board holding one stroke and a remove of it, and its primary
// button — save — would then fail as empty. A dialog whose main action cannot
// succeed is a trap, so the predicate is shared rather than re-expressed.
export function boardHasContent(ops: Op[]): boolean {
  return !dropTrailingEmptyPages(foldOps(ops)).every(
    (page) => page.length === 0,
  );
}
