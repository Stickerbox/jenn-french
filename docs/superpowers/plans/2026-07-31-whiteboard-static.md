# Whiteboard, Part 1 — static boards — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Jenn can draw a multi-page whiteboard on a student's page and save it; both of them can browse every saved board in a dated grid and download one as a JPEG.

**Architecture:** A board is an append-only list of vector ops stored per page in SQLite. One pure function (`foldOps`) turns a log into a drawable scene, and every renderer — the editor, the archive thumbnail, the JPEG export — goes through it, so they cannot disagree. Nothing streams in this part: Jenn draws locally, clicks *Terminé*, and one POST writes the whole board. Access reuses the existing `chatToken` cookie and the `chatRole` predicate, so the everyone group is excluded for free and the public card is untouched.

**Tech Stack:** Next.js 16 (App Router, server components), React 19, Prisma 6 + SQLite, Vitest 2, Tailwind v4 via PostCSS. Imports use the `@/` alias.

**Read first:** `docs/superpowers/specs/2026-07-31-whiteboard-design.md`. This plan implements its "Part 1" build step. Part 2 (live streaming) is a separate plan and this one must not anticipate it.

**Conventions this codebase enforces — violating them will fail review:**
- Anything with a rule in it is a pure function in `lib/` with a test in `tests/lib/`. Components and Prisma access are not unit-tested.
- Comments explain *why*, especially the counter-intuitive. Never restate the code.
- The student surface (`/g/[slug]`) is in **French**. The admin is English.
- "Student" is the UI word; `Group` is the code word. Use `group` in `lib/`, `prisma/` and route segments.
- Dates are UTC midnight, built as ``new Date(`${str}T00:00:00Z`)``, formatted with `timeZone: "UTC"`.
- Server actions call `revalidatePath`. Deletes use `deleteMany`.
- A request that is not allowed gets **404, never 403**.

**Verification after every task:** `npm run lint && npm run typecheck && npm test`. The full CI order is `npx prisma generate` → lint → `tsc --noEmit` → test → `npm run build`.

**Note on git:** the working directory is not currently a git repository. If `git status` fails, initialise one or obtain the real clone before starting — the commit steps below are not optional decoration, they are how a failed task gets rolled back.

---

### Task 1: Schema and migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<generated>_add_whiteboards/migration.sql` (generated, do not hand-write)

- [ ] **Step 1: Add the two models**

Append to `prisma/schema.prisma`:

```prisma
model Whiteboard {
  id        String   @id @default(cuid())
  groupId   String
  group     Group    @relation(fields: [groupId], references: [id], onDelete: Cascade)
  // The teaching day this board belongs to, UTC midnight like every other date
  // here. There is no title column: the archive name is this, formatted, and
  // Jenn is never asked to name anything.
  date      DateTime
  // A JPEG data URL of page 1, rendered by the client and validated on the way
  // in. Safe as a second representation of the ops only because a finished
  // board is immutable and so can never drift from them. It exists so the
  // archive is a plain <img> grid rather than every board's op log shipped to
  // the client on each visit to the tab.
  thumbnail String
  createdAt DateTime @default(now())
  pages     WhiteboardPage[]

  @@index([groupId, createdAt])
}

model WhiteboardPage {
  id           String     @id @default(cuid())
  whiteboardId String
  whiteboard   Whiteboard @relation(fields: [whiteboardId], references: [id], onDelete: Cascade)
  // Explicit order rather than a createdAt: every page of a board is written in
  // one transaction and would share a timestamp.
  index        Int
  ops          Json

  @@unique([whiteboardId, index])
}
```

- [ ] **Step 2: Add the back-relation on Group**

In `prisma/schema.prisma`, inside `model Group`, after the `messages` line:

```prisma
  whiteboards       Whiteboard[]
```

- [ ] **Step 3: Create and apply the migration**

Run: `npx prisma migrate dev --name add_whiteboards`
Expected: a new folder under `prisma/migrations/`, and "Your database is now in sync with your schema."

- [ ] **Step 4: Regenerate the client**

Run: `npx prisma generate`
Expected: "Generated Prisma Client".

- [ ] **Step 5: Confirm nothing else broke**

Run: `npm run typecheck`
Expected: no output, exit 0.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: add Whiteboard and WhiteboardPage models

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 2: `lib/whiteboard-ops.ts` — the op log and the fold

This is the load-bearing module. Everything else renders what it returns.

**Files:**
- Create: `lib/whiteboard-ops.ts`
- Test: `tests/lib/whiteboard-ops.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/lib/whiteboard-ops.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  PALETTE,
  dropTrailingEmptyPages,
  foldOps,
  foldPage,
  normaliseOps,
  readOps,
  type Op,
} from "@/lib/whiteboard-ops";

const stroke = (id: string, page = 0): Op => ({
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
    expect(scene[0].every((op) => op.kind !== "remove")).toBe(true);
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/lib/whiteboard-ops.test.ts`
Expected: FAIL — "Failed to resolve import \"@/lib/whiteboard-ops\"".

- [ ] **Step 3: Write the implementation**

Create `lib/whiteboard-ops.ts`:

```ts
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
      const { x, y, text, colour, size } = op;
      if (typeof text !== "string" || text.length === 0) return null;
      if (!isNumber(x) || !isNumber(y) || !isNumber(size)) return null;
      if (!isColour(colour)) return null;
      return { id: op.id, page: op.page, kind: "text", x, y, text, colour, size };
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/lib/whiteboard-ops.test.ts`
Expected: PASS, all tests green.

- [ ] **Step 5: Lint and typecheck**

Run: `npm run lint && npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/whiteboard-ops.ts tests/lib/whiteboard-ops.test.ts
git commit -m "feat: add whiteboard op log, validation and fold

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 3: `lib/whiteboard-names.ts` — dated labels

**Files:**
- Create: `lib/whiteboard-names.ts`
- Test: `tests/lib/whiteboard-names.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/lib/whiteboard-names.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { boardLabels, type NamedBoard } from "@/lib/whiteboard-names";

const board = (id: string, date: string, createdAt: string): NamedBoard => ({
  id,
  date: new Date(`${date}T00:00:00Z`),
  createdAt: new Date(createdAt),
});

describe("boardLabels", () => {
  it("names a board after its date, in French", () => {
    const labels = boardLabels([board("a", "2026-07-31", "2026-07-31T18:00:00Z")]);
    expect(labels.get("a")).toBe("31 juillet 2026");
  });

  it("leaves a lone board on a date unsuffixed", () => {
    const labels = boardLabels([
      board("a", "2026-07-31", "2026-07-31T18:00:00Z"),
      board("b", "2026-07-24", "2026-07-24T18:00:00Z"),
    ]);
    expect(labels.get("a")).toBe("31 juillet 2026");
    expect(labels.get("b")).toBe("24 juillet 2026");
  });

  // A counter and not a time: every date here is formatted in UTC, and a 7pm
  // Quebec lesson would label itself "23 h 00".
  it("numbers the second and later boards on one date, in drawing order", () => {
    const labels = boardLabels([
      board("second", "2026-07-31", "2026-07-31T20:00:00Z"),
      board("first", "2026-07-31", "2026-07-31T18:00:00Z"),
      board("third", "2026-07-31", "2026-07-31T22:00:00Z"),
    ]);
    expect(labels.get("first")).toBe("31 juillet 2026");
    expect(labels.get("second")).toBe("31 juillet 2026 (2)");
    expect(labels.get("third")).toBe("31 juillet 2026 (3)");
  });

  it("returns an empty map for no boards", () => {
    expect(boardLabels([]).size).toBe(0);
  });

  // Two boards whose createdAt collides must still get distinct labels rather
  // than both claiming to be the first.
  it("breaks a createdAt tie by id so labels stay unique", () => {
    const labels = boardLabels([
      board("bbb", "2026-07-31", "2026-07-31T18:00:00Z"),
      board("aaa", "2026-07-31", "2026-07-31T18:00:00Z"),
    ]);
    expect(new Set([labels.get("aaa"), labels.get("bbb")]).size).toBe(2);
  });

  it("formats a date in UTC, so a board never drifts to the day before", () => {
    const labels = boardLabels([board("a", "2026-01-01", "2026-01-01T00:00:00Z")]);
    expect(labels.get("a")).toBe("1 janvier 2026");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/lib/whiteboard-names.test.ts`
Expected: FAIL — cannot resolve `@/lib/whiteboard-names`.

- [ ] **Step 3: Write the implementation**

Create `lib/whiteboard-names.ts`:

```ts
export type NamedBoard = {
  id: string;
  date: Date;
  createdAt: Date;
};

// timeZone: "UTC" like every other date in this codebase. Without it a board
// stamped at UTC midnight renders as the previous day for anyone west of
// Greenwich, which is everyone using this site.
const dayFormat = new Intl.DateTimeFormat("fr-CA", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const dayKey = (date: Date) => date.toISOString().slice(0, 10);

// Takes the whole set rather than one board, because "disambiguate only when
// ambiguous" cannot be decided from a single row — and a per-board format call
// would inevitably regress into either always suffixing or never doing it.
export function boardLabels(boards: NamedBoard[]): Map<string, string> {
  const byDay = new Map<string, NamedBoard[]>();
  for (const board of boards) {
    const key = dayKey(board.date);
    const day = byDay.get(key);
    if (day) day.push(board);
    else byDay.set(key, [board]);
  }

  const labels = new Map<string, string>();

  for (const day of byDay.values()) {
    // Oldest first, so the counter reads as the order she drew them. The id
    // tiebreak keeps labels unique when two boards share a timestamp.
    const ordered = [...day].sort(
      (a, b) =>
        a.createdAt.getTime() - b.createdAt.getTime() ||
        a.id.localeCompare(b.id),
    );

    ordered.forEach((board, index) => {
      const name = dayFormat.format(board.date);
      labels.set(board.id, index === 0 ? name : `${name} (${index + 1})`);
    });
  }

  return labels;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/lib/whiteboard-names.test.ts`
Expected: PASS. If a label comes back as "31 juillet 2026" where you expected "1 janvier 2026", check the `fr-CA` locale is available in this Node build — it is in Node 22, which this project targets.

- [ ] **Step 5: Commit**

```bash
git add lib/whiteboard-names.ts tests/lib/whiteboard-names.test.ts
git commit -m "feat: add dated whiteboard labels with collision numbering

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 4: `lib/whiteboard-export.ts` — stacked JPEG geometry

**Files:**
- Create: `lib/whiteboard-export.ts`
- Test: `tests/lib/whiteboard-export.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/lib/whiteboard-export.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { BOARD_HEIGHT, BOARD_WIDTH } from "@/lib/whiteboard-ops";
import { MAX_CANVAS_AREA, PAGE_GAP, exportLayout } from "@/lib/whiteboard-export";

describe("exportLayout", () => {
  it("renders a single page at full size", () => {
    const layout = exportLayout(1);
    expect(layout.scale).toBe(1);
    expect(layout.width).toBe(BOARD_WIDTH);
    expect(layout.height).toBe(BOARD_HEIGHT);
  });

  it("stacks pages with a gap between them", () => {
    const layout = exportLayout(3);
    expect(layout.scale).toBe(1);
    expect(layout.height).toBe(BOARD_HEIGHT * 3 + PAGE_GAP * 2);
  });

  it("treats a zero or negative page count as one page", () => {
    expect(exportLayout(0)).toEqual(exportLayout(1));
    expect(exportLayout(-4)).toEqual(exportLayout(1));
  });

  // iOS Safari will not allocate a canvas past roughly 16.7M pixels and hands
  // back a BLANK image rather than an error, so this cap prevents a silent
  // failure rather than a loud one.
  it("scales down once the canvas would exceed the area ceiling", () => {
    const layout = exportLayout(12);
    expect(layout.scale).toBeLessThan(1);
    expect(layout.width * layout.height).toBeLessThanOrEqual(MAX_CANVAS_AREA);
  });

  it("never scales up", () => {
    expect(exportLayout(2).scale).toBe(1);
  });

  it("keeps the scaled canvas proportional to the unscaled one", () => {
    const layout = exportLayout(40);
    const unscaled = BOARD_HEIGHT * 40 + PAGE_GAP * 39;
    expect(layout.width / layout.height).toBeCloseTo(BOARD_WIDTH / unscaled, 2);
  });

  it("reports the scaled page height and gap so the caller draws consistently", () => {
    const layout = exportLayout(12);
    expect(layout.pageHeight).toBe(Math.round(BOARD_HEIGHT * layout.scale));
    expect(layout.gap).toBe(Math.round(PAGE_GAP * layout.scale));
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/lib/whiteboard-export.test.ts`
Expected: FAIL — cannot resolve `@/lib/whiteboard-export`.

- [ ] **Step 3: Write the implementation**

Create `lib/whiteboard-export.ts`:

```ts
import { BOARD_HEIGHT, BOARD_WIDTH } from "@/lib/whiteboard-ops";

// iOS Safari caps a canvas at roughly 16,777,216 pixels and, past it, returns a
// blank image instead of failing — so the export downscales rather than
// silently producing nothing. A little under the real ceiling for headroom.
export const MAX_CANVAS_AREA = 16_000_000;

// The rule between stacked pages, so a reader can see where one ends.
export const PAGE_GAP = 24;

export type ExportLayout = {
  scale: number;
  width: number;
  height: number;
  pageHeight: number;
  gap: number;
};

export function exportLayout(pageCount: number): ExportLayout {
  const pages = Math.max(1, Math.floor(pageCount));
  const naturalHeight = BOARD_HEIGHT * pages + PAGE_GAP * (pages - 1);
  const naturalArea = BOARD_WIDTH * naturalHeight;

  // Never above 1: a two-page board should not be upscaled to fill the budget.
  const scale =
    naturalArea > MAX_CANVAS_AREA
      ? Math.sqrt(MAX_CANVAS_AREA / naturalArea)
      : 1;

  return {
    scale,
    width: Math.round(BOARD_WIDTH * scale),
    height: Math.round(naturalHeight * scale),
    pageHeight: Math.round(BOARD_HEIGHT * scale),
    gap: Math.round(PAGE_GAP * scale),
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/lib/whiteboard-export.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/whiteboard-export.ts tests/lib/whiteboard-export.test.ts
git commit -m "feat: add stacked JPEG export layout with canvas area cap

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 5: `lib/whiteboard-thumbnail.ts` — the data-URL guard

**Files:**
- Create: `lib/whiteboard-thumbnail.ts`
- Test: `tests/lib/whiteboard-thumbnail.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/lib/whiteboard-thumbnail.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  MAX_THUMBNAIL_CHARS,
  THUMBNAIL_PREFIX,
  isThumbnail,
} from "@/lib/whiteboard-thumbnail";

const valid = `${THUMBNAIL_PREFIX}/9j/4AAQSkZJRgABAQAAAQABAAD=`;

describe("isThumbnail", () => {
  it("accepts a base64 JPEG data URL", () => {
    expect(isThumbnail(valid)).toBe(true);
  });

  it("rejects anything that is not a string", () => {
    expect(isThumbnail(null)).toBe(false);
    expect(isThumbnail(undefined)).toBe(false);
    expect(isThumbnail(42)).toBe(false);
    expect(isThumbnail({})).toBe(false);
  });

  // The teacher is the only caller, but the value renders in an <img src> on
  // the STUDENT's page — so a malformed one harms someone who never sent it.
  it("rejects a data URL that is not a JPEG", () => {
    expect(isThumbnail("data:text/html;base64,PHNjcmlwdD4=")).toBe(false);
    expect(isThumbnail("data:image/svg+xml;base64,PHN2Zz4=")).toBe(false);
    expect(isThumbnail("data:image/png;base64,iVBORw0K")).toBe(false);
  });

  it("rejects a remote URL", () => {
    expect(isThumbnail("https://example.com/a.jpg")).toBe(false);
  });

  it("rejects an empty payload", () => {
    expect(isThumbnail(THUMBNAIL_PREFIX)).toBe(false);
  });

  it("rejects a payload that is not base64", () => {
    expect(isThumbnail(`${THUMBNAIL_PREFIX}not base64!`)).toBe(false);
  });

  it("rejects a payload over the size cap", () => {
    const huge = `${THUMBNAIL_PREFIX}${"A".repeat(MAX_THUMBNAIL_CHARS)}`;
    expect(isThumbnail(huge)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/lib/whiteboard-thumbnail.test.ts`
Expected: FAIL — cannot resolve `@/lib/whiteboard-thumbnail`.

- [ ] **Step 3: Write the implementation**

Create `lib/whiteboard-thumbnail.ts`:

```ts
// A thumbnail is produced by Jenn's browser, because there is no server-side
// canvas here and adding one would mean a native dependency. That makes it
// client-supplied data which ends up in an <img src> on the student's page, so
// it is validated on the way in even though only the teacher can send it.
export const THUMBNAIL_PREFIX = "data:image/jpeg;base64,";

// A 320px-wide JPEG of a whiteboard page is a few KB. 64k characters of base64
// is roughly 48KB of image — generous, and a bound on what fifty archive rows
// can cost to read.
export const MAX_THUMBNAIL_CHARS = 64 * 1024;

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

export function isThumbnail(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (value.length > MAX_THUMBNAIL_CHARS) return false;
  if (!value.startsWith(THUMBNAIL_PREFIX)) return false;

  const payload = value.slice(THUMBNAIL_PREFIX.length);
  return payload.length > 0 && BASE64.test(payload);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/lib/whiteboard-thumbnail.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/whiteboard-thumbnail.ts tests/lib/whiteboard-thumbnail.test.ts
git commit -m "feat: validate whiteboard thumbnail data URLs

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 6: `lib/student-tab.ts` — a third tab

The signature changes from a boolean to a record. `app/g/[slug]/page.tsx` is the only caller and is updated in Task 14.

**Files:**
- Modify: `lib/student-tab.ts`
- Test: `tests/lib/student-tab.test.ts` (replace contents)

- [ ] **Step 1: Rewrite the test file**

Replace `tests/lib/student-tab.test.ts` entirely:

```ts
import { describe, expect, it } from "vitest";
import { parseStudentTab } from "@/lib/student-tab";

const all = { files: true, board: true };
const none = { files: false, board: false };

describe("parseStudentTab", () => {
  it("defaults to the card", () => {
    expect(parseStudentTab(undefined, all)).toBe("card");
  });

  it("returns files when files exist", () => {
    expect(parseStudentTab("files", all)).toBe("files");
  });

  it("returns board when the board tab is available", () => {
    expect(parseStudentTab("board", all)).toBe("board");
  });

  // A forwarded ?tab= link must not land a stranger on a tab that should not
  // exist for them, so an unavailable tab falls back rather than 404s.
  it("falls back to the card when files are unavailable", () => {
    expect(parseStudentTab("files", none)).toBe("card");
  });

  it("falls back to the card when the board is unavailable", () => {
    expect(parseStudentTab("board", none)).toBe("card");
  });

  it("falls back to the card for an unknown value", () => {
    expect(parseStudentTab("chat", all)).toBe("card");
    expect(parseStudentTab("", all)).toBe("card");
  });

  it("treats the two tabs independently", () => {
    expect(parseStudentTab("board", { files: false, board: true })).toBe("board");
    expect(parseStudentTab("files", { files: false, board: true })).toBe("card");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/lib/student-tab.test.ts`
Expected: FAIL — the current implementation takes a boolean, so `parseStudentTab("board", all)` returns `"card"`.

- [ ] **Step 3: Write the implementation**

Replace `lib/student-tab.ts` entirely:

```ts
export type StudentTab = "card" | "files" | "board";

// A record rather than positional booleans: two flags called with the wrong
// order is a silent bug, and a third would make it likely.
//
// Availability is the whole point of the second argument. An untokened visitor
// has neither of the extra tabs, and a forwarded ?tab= link must land them on
// the card rather than on a tab that should not exist for them.
export function parseStudentTab(
  value: string | undefined,
  available: { files: boolean; board: boolean },
): StudentTab {
  if (value === "files" && available.files) return "files";
  if (value === "board" && available.board) return "board";
  return "card";
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/lib/student-tab.test.ts`
Expected: PASS.

- [ ] **Step 5: Confirm the known breakage**

Run: `npm run typecheck`
Expected: FAIL, exactly one error in `app/g/[slug]/page.tsx` — the old boolean argument. This is fixed in Task 14; do not fix it here, and do not change the signature to tolerate both.

- [ ] **Step 6: Commit**

```bash
git add lib/student-tab.ts tests/lib/student-tab.test.ts
git commit -m "feat: add board to the student tab set

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 7: `lib/whiteboards.ts` — Prisma access

Not unit-tested, per the convention that Prisma access is not.

**Files:**
- Create: `lib/whiteboards.ts`

- [ ] **Step 1: Write the module**

Create `lib/whiteboards.ts`:

```ts
import { prisma } from "@/lib/prisma";
import {
  foldPage,
  normaliseOps,
  readOps,
  type Op,
  type Scene,
} from "@/lib/whiteboard-ops";

// What the archive grid needs, and nothing more — deliberately without ops, so
// opening the tab does not ship every board's log to the browser.
export type WhiteboardSummary = {
  id: string;
  date: Date;
  createdAt: Date;
  thumbnail: string;
  pageCount: number;
};

export async function listWhiteboards(
  groupId: string,
): Promise<WhiteboardSummary[]> {
  const rows = await prisma.whiteboard.findMany({
    where: { groupId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      date: true,
      createdAt: true,
      thumbnail: true,
      _count: { select: { pages: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    date: row.date,
    createdAt: row.createdAt,
    thumbnail: row.thumbnail,
    pageCount: row._count.pages,
  }));
}

// Scoped by groupId as well as id so a board id guessed from one student's page
// cannot be read through another's.
export async function getWhiteboardScene(
  groupId: string,
  id: string,
): Promise<Scene | null> {
  const board = await prisma.whiteboard.findFirst({
    where: { id, groupId },
    select: { pages: { orderBy: { index: "asc" }, select: { ops: true } } },
  });
  if (!board) return null;

  // readOps, not a cast: a Json column has been checked by nothing until now.
  // foldPage, not a filter: a stored page's log still holds its own removes, so
  // dropping them without APPLYING them would make erased strokes reappear in
  // the export — the one bug in this module that would look like data loss in
  // reverse.
  return board.pages.map((page) => foldPage(readOps(page.ops)));
}

export async function createWhiteboard(input: {
  groupId: string;
  date: Date;
  thumbnail: string;
  pages: Op[][];
}): Promise<string> {
  // A nested create is a single statement group, so a board never lands with
  // some of its pages missing.
  const board = await prisma.whiteboard.create({
    data: {
      groupId: input.groupId,
      date: input.date,
      thumbnail: input.thumbnail,
      pages: {
        create: input.pages.map((ops, index) => ({
          index,
          ops: normaliseOps(ops),
        })),
      },
    },
    select: { id: true },
  });

  return board.id;
}

export async function deleteWhiteboardRow(
  groupId: string,
  id: string,
): Promise<void> {
  // deleteMany so a double-click or a stale tab is a no-op rather than a P2025.
  await prisma.whiteboard.deleteMany({ where: { id, groupId } });
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: still exactly the one known `app/g/[slug]/page.tsx` error from Task 6, and nothing new. If `_count` is not recognised, `npx prisma generate` was not re-run after Task 1.

- [ ] **Step 3: Commit**

```bash
git add lib/whiteboards.ts
git commit -m "feat: add whiteboard Prisma access

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 8: `POST /api/whiteboard/[slug]/finish`

**Files:**
- Create: `app/api/whiteboard/[slug]/finish/route.ts`

Read `app/api/chat/[slug]/route.ts` first and mirror its shape exactly — group lookup, `chatRole`, `readBoundedBody`, 404 for anything refused.

- [ ] **Step 1: Write the route**

Create `app/api/whiteboard/[slug]/finish/route.ts`:

```ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getCurrentTeacher } from "@/lib/session";
import { chatRole } from "@/lib/chat-access";
import { readToken, cookieNameFor } from "@/lib/student-tokens";
import { readBoundedBody } from "@/lib/bounded-body";
import {
  dropTrailingEmptyPages,
  foldOps,
  readOps,
  type Op,
} from "@/lib/whiteboard-ops";
import { isThumbnail } from "@/lib/whiteboard-thumbnail";
import { createWhiteboard } from "@/lib/whiteboards";

// A long board is a few hundred strokes of JSON plus a thumbnail. 2MB is
// generous for that and still bounds what one request can make the process
// buffer — Content-Length is a claim, which is why readBoundedBody counts.
const MAX_BOARD_BYTES = 2 * 1024 * 1024;

// A board with more pages than this is a bug or a bored teacher, and every page
// costs a row and a canvas at export time.
const MAX_PAGES = 40;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  const group = await prisma.group.findUnique({
    where: { slug },
    select: { id: true, isEveryone: true, chatToken: true },
  });
  // 404 rather than 403 for a group that exists but refuses: a caller probing
  // slugs learns the same thing either way.
  if (!group) return new NextResponse("Not found", { status: 404 });

  const url = new URL(request.url);
  const teacher = await getCurrentTeacher();
  const cookieStore = await cookies();
  const role = chatRole({
    isTeacher: Boolean(teacher),
    isEveryone: group.isEveryone,
    chatToken: group.chatToken,
    presented: readToken(
      url.searchParams.get("k") ?? undefined,
      cookieStore.get(cookieNameFor(slug))?.value,
    ),
  });
  // chatRole is reused rather than a bare teacher check because it already
  // refuses the everyone group before anything else — which is exactly the
  // rule a whiteboard needs too, and one that should be written once.
  if (role !== "teacher") return new NextResponse("Not found", { status: 404 });

  const text = await readBoundedBody(request, MAX_BOARD_BYTES);
  if (text === null) return new NextResponse("Bad request", { status: 400 });

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    return new NextResponse("Bad request", { status: 400 });
  }

  const body = (payload ?? {}) as { ops?: unknown; thumbnail?: unknown };

  if (!isThumbnail(body.thumbnail)) {
    return new NextResponse("Bad request", { status: 400 });
  }

  const ops = readOps(body.ops);
  if (ops.length === 0) return new NextResponse("Bad request", { status: 400 });

  // What gets STORED is the log, removes included, so the fold stays reversible
  // and a future change to it applies to old boards too. The fold is only
  // consulted to decide which trailing pages render empty — a page holding
  // nothing but a "clear" is empty to a reader even though its log is not.
  const rendered = foldOps(ops);
  const pageCount = dropTrailingEmptyPages(rendered).length;

  if (pageCount > MAX_PAGES) {
    return new NextResponse("Bad request", { status: 400 });
  }

  const pages: Op[][] = Array.from({ length: pageCount }, () => []);
  for (const op of ops) {
    if (op.page < pageCount) pages[op.page].push(op);
  }

  // Part 1 has no live board to take a date from, so the board belongs to
  // today. Part 2 stamps this at /open instead, so a lesson crossing UTC
  // midnight keeps the day it started.
  const today = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);

  const id = await createWhiteboard({
    groupId: group.id,
    date: today,
    thumbnail: body.thumbnail,
    pages,
  });

  return NextResponse.json({ id }, { status: 201 });
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: the one known `app/g/[slug]/page.tsx` error only.

- [ ] **Step 3: Commit**

```bash
git add app/api/whiteboard/[slug]/finish/route.ts
git commit -m "feat: add whiteboard finish route

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 9: `GET /api/whiteboard/[slug]/[id]`

Needed because the download control renders the JPEG client-side and therefore needs the full ops, which the archive grid deliberately does not carry.

**Files:**
- Create: `app/api/whiteboard/[slug]/[id]/route.ts`

- [ ] **Step 1: Write the route**

Create `app/api/whiteboard/[slug]/[id]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getCurrentTeacher } from "@/lib/session";
import { chatRole } from "@/lib/chat-access";
import { readToken, cookieNameFor } from "@/lib/student-tokens";
import { getWhiteboardScene } from "@/lib/whiteboards";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  const { slug, id } = await params;

  const group = await prisma.group.findUnique({
    where: { slug },
    select: { id: true, isEveryone: true, chatToken: true },
  });
  if (!group) return new NextResponse("Not found", { status: 404 });

  const url = new URL(request.url);
  const teacher = await getCurrentTeacher();
  const cookieStore = await cookies();
  // Either role may read a board: the student owns it as much as she does.
  const role = chatRole({
    isTeacher: Boolean(teacher),
    isEveryone: group.isEveryone,
    chatToken: group.chatToken,
    presented: readToken(
      url.searchParams.get("k") ?? undefined,
      cookieStore.get(cookieNameFor(slug))?.value,
    ),
  });
  if (!role) return new NextResponse("Not found", { status: 404 });

  const scene = await getWhiteboardScene(group.id, id);
  if (!scene) return new NextResponse("Not found", { status: 404 });

  return NextResponse.json(
    { pages: scene },
    // A saved board never changes, so it is safe to cache privately — but
    // never publicly: this response is scoped to one student's token.
    { headers: { "Cache-Control": "private, max-age=3600" } },
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: the one known error only.

- [ ] **Step 3: Commit**

```bash
git add "app/api/whiteboard/[slug]/[id]/route.ts"
git commit -m "feat: add whiteboard read route for export

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 10: `deleteWhiteboard` server action

**Files:**
- Modify: `app/actions.ts`

- [ ] **Step 1: Read the existing `deleteMessage` action**

Run: `grep -n "deleteMessage" -A 20 app/actions.ts`
Match its shape: teacher check first, `deleteMany`, `revalidatePath`.

- [ ] **Step 2: Add the action**

Append to `app/actions.ts`:

```ts
export async function deleteWhiteboard(groupId: string, id: string) {
  // Every mutating action starts with this. An action without it is an
  // unauthenticated endpoint.
  const teacher = await getCurrentTeacher();
  if (!teacher) throw new Error("Not authorised");

  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: { slug: true },
  });
  if (!group) return;

  await deleteWhiteboardRow(groupId, id);
  revalidatePath(`/g/${group.slug}`);
}
```

Add to the imports at the top of `app/actions.ts`:

```ts
import { deleteWhiteboardRow } from "@/lib/whiteboards";
```

- [ ] **Step 3: Typecheck and lint**

Run: `npm run lint && npm run typecheck`
Expected: the one known `app/g/[slug]/page.tsx` error only. If `getCurrentTeacher`, `prisma` or `revalidatePath` are reported as undefined, they are already imported in this file — check the existing import block rather than adding duplicates.

- [ ] **Step 4: Commit**

```bash
git add app/actions.ts
git commit -m "feat: add deleteWhiteboard action

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 11: `components/whiteboard/BoardCanvas.tsx` — the renderer

One component draws a scene. The editor, the export and any future preview all use it, which is what keeps them from disagreeing.

**Files:**
- Create: `components/whiteboard/BoardCanvas.tsx`

- [ ] **Step 1: Write the component**

Create `components/whiteboard/BoardCanvas.tsx`:

```ts
"use client";

import { useEffect, useRef } from "react";
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  type DrawOp,
} from "@/lib/whiteboard-ops";

// Drawing is factored out of the component so the export can call it against
// an offscreen canvas at a different scale. Ops are in the fixed 1600x1000
// logical space, so every caller sets its own transform and then draws
// identically — which is the whole reason that space is fixed.
export function drawOps(
  context: CanvasRenderingContext2D,
  ops: DrawOp[],
): void {
  context.lineCap = "round";
  context.lineJoin = "round";

  for (const op of ops) {
    context.strokeStyle = op.colour;
    context.fillStyle = op.colour;

    if (op.kind === "stroke") {
      if (op.points.length < 4) {
        // A single point is a dot, which a zero-length path would not paint.
        context.beginPath();
        context.arc(op.points[0], op.points[1], op.width / 2, 0, Math.PI * 2);
        context.fill();
        continue;
      }
      context.lineWidth = op.width;
      context.beginPath();
      context.moveTo(op.points[0], op.points[1]);
      for (let i = 2; i < op.points.length; i += 2) {
        context.lineTo(op.points[i], op.points[i + 1]);
      }
      context.stroke();
      continue;
    }

    if (op.kind === "arrow") {
      const head = 18;
      const angle = Math.atan2(op.y2 - op.y1, op.x2 - op.x1);
      context.lineWidth = 4;
      context.beginPath();
      context.moveTo(op.x1, op.y1);
      context.lineTo(op.x2, op.y2);
      context.stroke();
      context.beginPath();
      context.moveTo(op.x2, op.y2);
      context.lineTo(
        op.x2 - head * Math.cos(angle - Math.PI / 7),
        op.y2 - head * Math.sin(angle - Math.PI / 7),
      );
      context.lineTo(
        op.x2 - head * Math.cos(angle + Math.PI / 7),
        op.y2 - head * Math.sin(angle + Math.PI / 7),
      );
      context.closePath();
      context.fill();
      continue;
    }

    // Georgia to match the flashcard's serif, since the board sits beside one.
    context.font = `${op.size}px Georgia, "Times New Roman", serif`;
    context.textBaseline = "top";
    op.text.split("\n").forEach((line, index) => {
      context.fillText(line, op.x, op.y + index * op.size * 1.25);
    });
  }
}

// --card-paper-back, as a literal for the same reason the palette is: a canvas
// cannot resolve a CSS custom property.
export const BOARD_PAPER = "#fdfaf3";

export function BoardCanvas({
  ops,
  className,
  // null leaves the canvas transparent. The editor stacks a second BoardCanvas
  // over the first to show the stroke in progress, and an opaque fill would
  // hide everything already drawn underneath it.
  background = BOARD_PAPER,
}: {
  ops: DrawOp[];
  className?: string;
  background?: string | null;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    context.clearRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);
    if (background) {
      context.fillStyle = background;
      context.fillRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);
    }
    drawOps(context, ops);
  }, [ops, background]);

  return (
    <canvas
      ref={ref}
      // The backing store is the logical space; CSS scales it to fit. That is
      // what lets the same ops render in the editor and in a thumbnail.
      width={BOARD_WIDTH}
      height={BOARD_HEIGHT}
      className={className}
    />
  );
}
```

- [ ] **Step 2: Lint and typecheck**

Run: `npm run lint && npm run typecheck`
Expected: the one known error only.

- [ ] **Step 3: Commit**

```bash
git add components/whiteboard/BoardCanvas.tsx
git commit -m "feat: add whiteboard canvas renderer

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 12: `components/whiteboard/BoardEditor.tsx` — Jenn's tools

**Files:**
- Create: `components/whiteboard/BoardEditor.tsx`

Behaviour: pen, text, arrow, eraser; five colours; undo; clear page; add page; page navigation; *Terminé* and *Annuler*. Her op log lives in component state and is the authoritative copy. Pointer events throughout so a stylus works, `touch-action: none` so drawing does not scroll the page.

- [ ] **Step 1: Write the component**

Create `components/whiteboard/BoardEditor.tsx`:

```ts
"use client";

import { useRef, useState } from "react";
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  PALETTE,
  dropTrailingEmptyPages,
  foldOps,
  type Colour,
  type Op,
} from "@/lib/whiteboard-ops";
import {
  BOARD_PAPER,
  BoardCanvas,
  drawOps,
} from "@/components/whiteboard/BoardCanvas";

type Tool = "pen" | "text" | "arrow" | "eraser";

const THUMBNAIL_WIDTH = 320;

let counter = 0;
// crypto.randomUUID is fine here, but a short monotonic id keeps the payload
// small and these only need to be unique within one board.
const nextId = () => `o${Date.now().toString(36)}${(counter++).toString(36)}`;

export function BoardEditor({
  slug,
  onSaved,
  onCancel,
}: {
  slug: string;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [ops, setOps] = useState<Op[]>([]);
  const [tool, setTool] = useState<Tool>("pen");
  const [colour, setColour] = useState<Colour>(PALETTE[0]);
  const [page, setPage] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const surface = useRef<HTMLDivElement | null>(null);
  const drawing = useRef<number[] | null>(null);
  const [preview, setPreview] = useState<number[] | null>(null);

  const scene = foldOps(ops);
  const visible = scene[page] ?? [];

  // Pointer coordinates are in CSS pixels; ops are in the logical space. This
  // is the only place the two meet.
  function toLogical(event: React.PointerEvent): [number, number] {
    const box = surface.current?.getBoundingClientRect();
    if (!box) return [0, 0];
    return [
      ((event.clientX - box.left) / box.width) * BOARD_WIDTH,
      ((event.clientY - box.top) / box.height) * BOARD_HEIGHT,
    ];
  }

  function append(op: Op) {
    setOps((current) => [...current, op]);
  }

  function handlePointerDown(event: React.PointerEvent) {
    if (saving) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const [x, y] = toLogical(event);

    if (tool === "text") {
      // A prompt() rather than an in-canvas editable text box. Deliberate
      // minimalism for Part 1: an inline editor means caret handling, IME
      // support and a second focus surface over a canvas, and none of that is
      // needed to find out whether the whiteboard earns its place here.
      const text = window.prompt("Texte :");
      if (text && text.trim().length > 0) {
        append({ id: nextId(), page, kind: "text", x, y, text, colour, size: 44 });
      }
      return;
    }

    if (tool === "eraser") {
      // Nearest op within a generous radius, so a trackpad click does not have
      // to be precise. Erase appends a remove; it never edits the log.
      const target = nearestOp(visible, x, y);
      if (target) {
        append({ id: nextId(), page, kind: "remove", targets: [target] });
      }
      return;
    }

    drawing.current = [x, y];
    setPreview([x, y]);
  }

  function handlePointerMove(event: React.PointerEvent) {
    if (!drawing.current) return;
    const [x, y] = toLogical(event);

    if (tool === "arrow") {
      // An arrow is two points, so the preview replaces rather than extends.
      setPreview([drawing.current[0], drawing.current[1], x, y]);
      return;
    }

    drawing.current.push(x, y);
    setPreview([...drawing.current]);
  }

  function handlePointerUp(event: React.PointerEvent) {
    if (!drawing.current) return;
    const [x, y] = toLogical(event);
    const started = drawing.current;
    drawing.current = null;
    setPreview(null);

    if (tool === "arrow") {
      append({
        id: nextId(),
        page,
        kind: "arrow",
        x1: started[0],
        y1: started[1],
        x2: x,
        y2: y,
        colour,
      });
      return;
    }

    append({
      id: nextId(),
      page,
      kind: "stroke",
      points: [...started, x, y],
      colour,
      width: 5,
    });
  }

  function undo() {
    setOps((current) => current.slice(0, -1));
  }

  function clearPage() {
    const targets = visible.map((op) => op.id);
    if (targets.length === 0) return;
    append({ id: nextId(), page, kind: "remove", targets });
  }

  function addPage() {
    setPageCount((count) => count + 1);
    setPage(pageCount);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const kept = dropTrailingEmptyPages(foldOps(ops));
      if (kept.every((p) => p.length === 0)) {
        setError("Le tableau est vide.");
        setSaving(false);
        return;
      }

      const response = await fetch(`/api/whiteboard/${slug}/finish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ops, thumbnail: renderThumbnail(kept[0]) }),
      });
      if (!response.ok) throw new Error("save failed");
      onSaved();
    } catch {
      // The log is still in state, so she can press Terminé again rather than
      // losing the board.
      setError("Échec de l'enregistrement. Réessayez.");
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1100px]">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {(["pen", "text", "arrow", "eraser"] as Tool[]).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setTool(option)}
            aria-pressed={tool === option}
            className={`rounded-full border border-[var(--card-line)] px-4 py-2 font-[family-name:var(--card-font-serif)] text-sm ${
              tool === option
                ? "bg-[var(--card-bleu)] text-white"
                : "bg-[var(--card-paper)] text-[var(--card-moss)]"
            }`}
          >
            {{ pen: "Crayon", text: "Texte", arrow: "Flèche", eraser: "Gomme" }[option]}
          </button>
        ))}

        <span className="mx-1 flex gap-1">
          {PALETTE.map((swatch) => (
            <button
              key={swatch}
              type="button"
              onClick={() => setColour(swatch)}
              aria-label={swatch}
              aria-pressed={colour === swatch}
              style={{ background: swatch }}
              className={`h-8 w-8 rounded-full ${
                colour === swatch ? "ring-2 ring-offset-2 ring-[var(--card-ink)]" : ""
              }`}
            />
          ))}
        </span>

        <button type="button" onClick={undo} className="rounded-full border border-[var(--card-line)] bg-[var(--card-paper)] px-4 py-2 text-sm">
          Annuler la dernière
        </button>
        <button type="button" onClick={clearPage} className="rounded-full border border-[var(--card-line)] bg-[var(--card-paper)] px-4 py-2 text-sm">
          Effacer la page
        </button>
      </div>

      <div
        ref={surface}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        // Without this a drag on a touch screen scrolls the page instead of
        // drawing, and the stroke is lost.
        style={{ touchAction: "none", aspectRatio: `${BOARD_WIDTH} / ${BOARD_HEIGHT}` }}
        className="relative w-full cursor-crosshair overflow-hidden rounded-xl border border-[var(--card-line)] bg-[var(--card-paper-back)]"
      >
        <BoardCanvas ops={visible} className="absolute inset-0 h-full w-full" />
        {preview && (
          <BoardCanvas
            className="absolute inset-0 h-full w-full"
            // Transparent, or this overlay would hide the committed ops below.
            background={null}
            ops={[
              tool === "arrow" && preview.length === 4
                ? {
                    id: "preview",
                    page,
                    kind: "arrow",
                    x1: preview[0],
                    y1: preview[1],
                    x2: preview[2],
                    y2: preview[3],
                    colour,
                  }
                : {
                    id: "preview",
                    page,
                    kind: "stroke",
                    points: preview,
                    colour,
                    width: 5,
                  },
            ]}
          />
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-[family-name:var(--card-font-serif)] text-sm text-[var(--card-moss)]">
          <button type="button" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} className="rounded-full border border-[var(--card-line)] px-3 py-1 disabled:opacity-40">
            ‹
          </button>
          <span>
            Page {page + 1} / {pageCount}
          </span>
          <button type="button" onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))} disabled={page === pageCount - 1} className="rounded-full border border-[var(--card-line)] px-3 py-1 disabled:opacity-40">
            ›
          </button>
          <button type="button" onClick={addPage} className="rounded-full border border-[var(--card-line)] px-3 py-1">
            + Page
          </button>
        </div>

        <div className="flex items-center gap-2">
          {error && <span className="text-sm text-[var(--card-rouge)]">{error}</span>}
          <button type="button" onClick={onCancel} className="rounded-full border border-[var(--card-line)] px-4 py-2 text-sm">
            Annuler
          </button>
          <button type="button" onClick={save} disabled={saving} className="rounded-full bg-[var(--card-bleu)] px-5 py-2 text-sm text-white disabled:opacity-50">
            {saving ? "Enregistrement…" : "Terminé"}
          </button>
        </div>
      </div>
    </div>
  );
}

function nearestOp(
  ops: ReturnType<typeof foldOps>[number],
  x: number,
  y: number,
): string | null {
  let best: string | null = null;
  let bestDistance = 60; // logical units — a forgiving radius for a trackpad

  for (const op of ops) {
    const points: [number, number][] =
      op.kind === "stroke"
        ? Array.from({ length: op.points.length / 2 }, (_, i) => [
            op.points[i * 2],
            op.points[i * 2 + 1],
          ])
        : op.kind === "arrow"
          ? [
              [op.x1, op.y1],
              [op.x2, op.y2],
            ]
          : [[op.x, op.y]];

    for (const [px, py] of points) {
      const distance = Math.hypot(px - x, py - y);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = op.id;
      }
    }
  }

  return best;
}

// Page 1 at a small size. Rendered here because there is no server-side canvas
// and adding one would mean a native dependency; the route validates what
// arrives.
function renderThumbnail(ops: ReturnType<typeof foldOps>[number]): string {
  const scale = THUMBNAIL_WIDTH / BOARD_WIDTH;
  const canvas = document.createElement("canvas");
  canvas.width = THUMBNAIL_WIDTH;
  canvas.height = Math.round(BOARD_HEIGHT * scale);

  const context = canvas.getContext("2d");
  if (!context) return "";

  context.fillStyle = BOARD_PAPER;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.scale(scale, scale);
  drawOps(context, ops);

  // JPEG rather than PNG, and 0.7 rather than lossless: this is a 320px preview
  // stored in SQLite for every board, and the route caps it at 64k characters.
  return canvas.toDataURL("image/jpeg", 0.7);
}
```

- [ ] **Step 2: Lint and typecheck**

Run: `npm run lint && npm run typecheck`
Expected: the one known error only.

- [ ] **Step 3: Commit**

```bash
git add components/whiteboard/BoardEditor.tsx
git commit -m "feat: add whiteboard editor

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 13: `components/whiteboard/BoardTile.tsx` — an archive tile

**Files:**
- Create: `components/whiteboard/BoardTile.tsx`

- [ ] **Step 1: Write the component**

Create `components/whiteboard/BoardTile.tsx`:

```ts
"use client";

import { useState } from "react";
import { BOARD_HEIGHT, BOARD_WIDTH, type DrawOp } from "@/lib/whiteboard-ops";
import { exportLayout } from "@/lib/whiteboard-export";
import { BOARD_PAPER, drawOps } from "@/components/whiteboard/BoardCanvas";

export function BoardTile({
  slug,
  id,
  label,
  thumbnail,
  pageCount,
  onDelete,
}: {
  slug: string;
  id: string;
  label: string;
  thumbnail: string;
  pageCount: number;
  onDelete?: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  // One tall JPEG rather than one file per page: multiple programmatic
  // downloads make Chrome and Safari prompt, and a zip would mean the first
  // utility dependency in this project.
  async function download() {
    setBusy(true);
    setError(false);
    try {
      const response = await fetch(`/api/whiteboard/${slug}/${id}`);
      if (!response.ok) throw new Error("fetch failed");
      const { pages } = (await response.json()) as { pages: DrawOp[][] };

      const layout = exportLayout(pages.length);
      const canvas = document.createElement("canvas");
      canvas.width = layout.width;
      canvas.height = layout.height;

      const context = canvas.getContext("2d");
      if (!context) throw new Error("no 2d context");

      context.fillStyle = BOARD_PAPER;
      context.fillRect(0, 0, canvas.width, canvas.height);

      pages.forEach((ops, index) => {
        context.save();
        context.translate(0, index * (layout.pageHeight + layout.gap));
        context.scale(layout.scale, layout.scale);
        context.beginPath();
        context.rect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);
        context.clip();
        drawOps(context, ops);
        context.restore();

        if (index > 0) {
          context.fillStyle = "#d8cbb4"; // --card-line
          context.fillRect(
            0,
            index * (layout.pageHeight + layout.gap) - layout.gap / 2,
            canvas.width,
            1,
          );
        }
      });

      const url = canvas.toDataURL("image/jpeg", 0.9);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `tableau-${label.replace(/[^\w]+/g, "-").toLowerCase()}.jpg`;
      anchor.click();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--card-line)] bg-[var(--card-paper)]">
      {/* eslint-disable-next-line @next/next/no-img-element -- a data URL has
          nothing for next/image to optimise, and it is already tiny. */}
      <img
        src={thumbnail}
        alt={label}
        width={BOARD_WIDTH}
        height={BOARD_HEIGHT}
        className="block w-full bg-[var(--card-paper-back)]"
      />
      <div className="flex items-center justify-between gap-2 border-t border-[var(--card-line)] px-3 py-2">
        <div className="font-[family-name:var(--card-font-serif)] text-sm text-[var(--card-ink)]">
          <div>{label}</div>
          <div className="text-[var(--card-moss)]">
            {pageCount === 1 ? "1 page" : `${pageCount} pages`}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {error && <span className="text-xs text-[var(--card-rouge)]">Échec</span>}
          <button
            type="button"
            onClick={download}
            disabled={busy}
            className="rounded-full border border-[var(--card-line)] px-3 py-1 text-sm disabled:opacity-50"
          >
            {busy ? "…" : "Télécharger"}
          </button>
          {onDelete && (
            <button
              type="button"
              onClick={() => void onDelete()}
              className="rounded-full border border-[var(--card-line)] px-3 py-1 text-sm text-[var(--card-rouge)]"
            >
              Supprimer
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Lint and typecheck**

Run: `npm run lint && npm run typecheck`
Expected: the one known error only. If eslint complains about `<img>`, the disable comment above it must sit immediately before the element.

- [ ] **Step 3: Commit**

```bash
git add components/whiteboard/BoardTile.tsx
git commit -m "feat: add whiteboard archive tile with stacked JPEG export

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 14: `components/whiteboard/BoardTab.tsx` and wiring the page

**Files:**
- Create: `components/whiteboard/BoardTab.tsx`
- Modify: `components/student/StudentTabs.tsx`
- Modify: `app/g/[slug]/page.tsx`

- [ ] **Step 1: Write the tab component**

Create `components/whiteboard/BoardTab.tsx`:

```ts
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BoardEditor } from "@/components/whiteboard/BoardEditor";
import { BoardTile } from "@/components/whiteboard/BoardTile";

export type BoardSummary = {
  id: string;
  label: string;
  thumbnail: string;
  pageCount: number;
};

export function BoardTab({
  slug,
  boards,
  isTeacher,
  onDelete,
}: {
  slug: string;
  boards: BoardSummary[];
  isTeacher: boolean;
  onDelete?: (id: string) => Promise<void>;
}) {
  const [drawing, setDrawing] = useState(false);
  const router = useRouter();

  if (drawing) {
    return (
      <BoardEditor
        slug={slug}
        onCancel={() => setDrawing(false)}
        onSaved={() => {
          setDrawing(false);
          // The archive is server-rendered, so a refresh is what makes the new
          // board appear rather than a local insert that could disagree with it.
          router.refresh();
        }}
      />
    );
  }

  return (
    // Deliberately wider than the max-w-[560px] column every other tab lives
    // in: a flashcard is a narrow object and a whiteboard is the opposite.
    <div className="mx-auto w-full max-w-[1100px]">
      {isTeacher && (
        <div className="mb-6 flex justify-center">
          <button
            type="button"
            onClick={() => setDrawing(true)}
            className="rounded-full bg-[var(--card-bleu)] px-6 py-2.5 font-[family-name:var(--card-font-serif)] text-sm text-white transition-opacity hover:opacity-90"
          >
            Nouveau tableau
          </button>
        </div>
      )}

      {boards.length === 0 ? (
        <p className="text-center font-[family-name:var(--card-font-serif)] italic text-[var(--card-moss)]">
          Aucun tableau pour l&apos;instant&nbsp;!
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {boards.map((board) => (
            <BoardTile
              key={board.id}
              slug={slug}
              id={board.id}
              label={board.label}
              thumbnail={board.thumbnail}
              pageCount={board.pageCount}
              onDelete={onDelete ? () => onDelete(board.id) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add the third tab to the strip**

In `components/student/StudentTabs.tsx`, replace the `tabs` array and add a `has` prop. The full new file:

```ts
import Link from "next/link";
import { cn } from "@/lib/utils";
import type { StudentTab } from "@/lib/student-tab";

// Mirrors /admin's strip so both halves of the site work the same way, in the
// flashcard palette rather than the admin one.
export function StudentTabs({
  slug,
  active,
  date,
  has,
}: {
  slug: string;
  active: StudentTab;
  date: string;
  has: { files: boolean; board: boolean };
}) {
  const tabs: { tab: StudentTab; label: string; href: string }[] = [
    { tab: "card", label: "La carte", href: `/g/${slug}?date=${date}` },
    ...(has.files
      ? [{ tab: "files" as const, label: "Les fichiers", href: `/g/${slug}?tab=files` }]
      : []),
    ...(has.board
      ? [{ tab: "board" as const, label: "Le tableau", href: `/g/${slug}?tab=board` }]
      : []),
  ];

  return (
    <nav
      aria-label="Sections"
      className="mx-auto mb-8 flex max-w-[560px] justify-center"
    >
      <div className="flex gap-1 rounded-full border border-[var(--card-line)] bg-[var(--card-paper)] p-1">
        {tabs.map(({ tab, label, href }) => (
          <Link
            key={tab}
            href={href}
            aria-current={tab === active ? "page" : undefined}
            className={cn(
              "rounded-full px-5 py-2 font-[family-name:var(--card-font-serif)] text-sm transition-colors",
              tab === active
                ? "bg-[var(--card-bleu)] text-white"
                : "text-[var(--card-moss)]",
            )}
          >
            {label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
```

- [ ] **Step 3: Wire the page**

In `app/g/[slug]/page.tsx`:

Add to the imports:

```ts
import { listWhiteboards } from "@/lib/whiteboards";
import { boardLabels } from "@/lib/whiteboard-names";
import { BoardTab } from "@/components/whiteboard/BoardTab";
import { deleteWhiteboard } from "@/app/actions";
```

Replace the `pages` / `tab` block (currently lines 60–62) with:

```ts
  // The everyone group has no chat but does show its own files, so its shelf
  // is public — that is the "someday" case the spec left room for.
  const pages =
    unlocked || group.isEveryone ? await listPagesForGroup(group.id) : [];

  // The board tab needs no "does one exist" check: it is present for anyone who
  // is unlocked, and shows an empty state otherwise. Jenn needs it to create
  // the first board, and the student needs it to watch the first being drawn.
  const boards = unlocked ? await listWhiteboards(group.id) : [];
  const labels = boardLabels(boards);

  const tab = parseStudentTab(tab_, {
    files: pages.length > 0,
    board: unlocked,
  });
```

Replace the strip render (currently lines 97–99) with:

```ts
      {(pages.length > 0 || unlocked) && (
        <StudentTabs
          slug={slug}
          active={tab}
          date={selected}
          has={{ files: pages.length > 0, board: unlocked }}
        />
      )}
```

Replace the tab body (currently lines 101–114) with:

```ts
      {tab === "card" ? (
        <>
          <WeekDayPicker slug={slug} today={today} selected={selected} />
          {card ? (
            <Flashcard card={card} />
          ) : (
            <p className="text-center font-[family-name:var(--font-body)] text-[var(--color-ink-muted)]">
              Nothing posted yet — check back soon!
            </p>
          )}
        </>
      ) : tab === "files" ? (
        <FilesTab pages={pages} />
      ) : (
        <BoardTab
          slug={slug}
          isTeacher={viewerIsTeacher}
          boards={boards.map((board) => ({
            id: board.id,
            label: labels.get(board.id) ?? "",
            thumbnail: board.thumbnail,
            pageCount: board.pageCount,
          }))}
          onDelete={
            viewerIsTeacher
              ? deleteWhiteboard.bind(null, group.id)
              : undefined
          }
        />
      )}
```

- [ ] **Step 4: Typecheck — the known error should now be gone**

Run: `npm run typecheck`
Expected: **no output, exit 0.** This is the task that closes the break opened in Task 6.

- [ ] **Step 5: Lint and test**

Run: `npm run lint && npm test`
Expected: no lint errors; all tests pass.

- [ ] **Step 6: Build**

Run: `npm run build`
Expected: build succeeds. `/g/[slug]` stays dynamic.

- [ ] **Step 7: Manual check**

Run `npm run dev`, then:
1. Open `/g/<a student slug>` with no cookie — expect the card alone, **no tab strip**.
2. Open `/g/<slug>?k=<that group's chatToken>` — expect the strip with *Le tableau*, and "Aucun tableau pour l'instant !" on it.
3. Log in at `/login`, return to `/g/<slug>?k=…`, and confirm *Nouveau tableau* appears.
4. Draw a stroke, some text and an arrow; add a page; draw on it; click *Terminé*.
5. Expect a tile named after today, "2 pages", and a working *Télécharger* producing one JPEG with both pages stacked.
6. Open `/g/all` — expect **no** *Le tableau* tab at all.

- [ ] **Step 8: Commit**

```bash
git add components/whiteboard/BoardTab.tsx components/student/StudentTabs.tsx "app/g/[slug]/page.tsx"
git commit -m "feat: add the whiteboard tab to the student page

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 15: Documentation

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add the routes to the table**

In the Routes table in `CLAUDE.md`, add after the `POST /api/chat/[slug]` rows:

```markdown
| `POST /api/whiteboard/[slug]/finish` | teacher | saves a whole board |
| `GET /api/whiteboard/[slug]/[id]` | token or teacher | a board's ops, for the JPEG export |
```

And update the `/g/[slug]` row's note to mention the third tab: `?tab=board` needs the token, teacher included.

- [ ] **Step 2: Add an architecture section**

Add after the "Lesson chat" section in `CLAUDE.md`:

```markdown
### Whiteboards

A `Whiteboard` belongs to a group and holds `WhiteboardPage` rows, each an
append-only list of vector ops in a Json column. **Erase and undo append a
`remove` op rather than editing the log**, which is what makes the stored board
identical to what was drawn and lets `foldOps` (`lib/whiteboard-ops.ts`) be the
single thing that turns ops into something drawable — the editor, the archive
thumbnail and the JPEG export all go through it, so they cannot disagree.

Ops are in a fixed 1600×1000 logical space. That is not a detail: Jenn's window,
the student's window, a 320px thumbnail and a stacked JPEG are four pixel sizes
rendering the same input, and without one logical space they render differently.
Colours are literal hex rather than the `--card-*` tokens they mirror, because
export draws into a canvas where there is no CSS to resolve a custom property.

Everything read out of an `ops` column goes through `readOps`, which discards
malformed entries rather than throwing — the same contract `readSections` has,
for the same reason.

A board is **immutable once saved**: there is no `finishedAt` column because a
row only exists because *Terminé* was pressed, and no edit path. That
immutability is also what makes the `thumbnail` column safe — a second
representation of the ops that can never drift from them.

Only the teacher creates or deletes one; both parties read and download. Access
is `chatRole` (`lib/chat-access.ts`), reused rather than reimplemented, so the
everyone group is refused before anything else — it has no `chatToken`, so it
can never have a whiteboard. **The Whiteboard tab is present for anyone
unlocked**, empty state and all, because Jenn needs it to create the first board
and the student needs it to watch one being drawn.

Downloading gives **one** JPEG with every page stacked, not one file per page:
multiple programmatic downloads make browsers prompt, and a zip would be this
project's first utility dependency. `exportLayout` caps the canvas area, because
iOS Safari returns a blank image rather than an error past ~16.7M pixels.
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document whiteboards

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 16: Full CI verification

- [ ] **Step 1: Run CI in order**

```bash
npx prisma generate && npm run lint && npm run typecheck && npm test && npm run build
```

Expected: every step exits 0. Report the actual output — do not claim success without it.

- [ ] **Step 2: Confirm the test count grew**

Run: `npm test`
Expected: four new test files present — `whiteboard-ops`, `whiteboard-names`, `whiteboard-export`, `whiteboard-thumbnail` — plus a rewritten `student-tab`, and every pre-existing test file still passing.

---

## What Part 1 deliberately does not do

Do not build any of this here; it is Plan 2:

- No streaming, no `EventSource` changes, no `lib/chat-bus.ts` changes
- No `/open`, `/ops` or `/discard` routes, and no `lib/whiteboard-live.ts`
- No live banner on the Card or Files tabs
- No `currentPage` broadcast

After Part 1, the student sees a board the next time they load the page. That is
a complete, useful feature on its own, and it is the whole reason for the split.
