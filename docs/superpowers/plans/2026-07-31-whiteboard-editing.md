# Whiteboard, Part 1b — inline text and direct manipulation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Jenn types text inline on the canvas instead of into a browser dialog, and can select any element afterwards to move, recolour, delete, retype or resize it. The toolbar becomes icons.

**Architecture:** Every edit is a **remove plus a re-add** — one pure function, `reviseOp`, expresses all five of move, recolour, retype, resize and delete, so `foldPage` and the append-only log are untouched. Hit-testing moves out of the editor into a pure module with an injected text measurer, which also fixes a latent eraser bug. The editor is split into three components because it is already the largest file in the feature.

**Tech Stack:** React 19, `lucide-react` (already a dependency), Vitest 2.

**Prerequisite:** Part 1 (`2026-07-31-whiteboard-static.md`) is merged. Part 2 (`2026-07-31-whiteboard-live.md`) should be done **after** this — see "Reconciling with Part 2" at the end, which lists exactly what changes there.

**Read first:** `docs/superpowers/specs/2026-07-31-whiteboard-design.md`, sections "Ops" and "Tools".

**Conventions:** rules are pure functions in `lib/` with tests in `tests/lib/`; components and Prisma access are not unit-tested. Student-page copy is **French**. Comments explain why, never what.

**Verification after every task:** `npm run lint && npm run typecheck && npm test`.

---

### Task 1: `lib/whiteboard-geometry.ts` — coordinate mapping

Currently `toLogical` is inline in `BoardEditor` and untested. Three new features all need the inverse mapping too — the textarea, the selection outline and the floating toolbar all have to be positioned in CSS pixels from logical coordinates.

**Files:**
- Create: `lib/whiteboard-geometry.ts`
- Test: `tests/lib/whiteboard-geometry.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/lib/whiteboard-geometry.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { BOARD_HEIGHT, BOARD_WIDTH } from "@/lib/whiteboard-ops";
import { logicalToPx, toLogical, toOffset } from "@/lib/whiteboard-geometry";

// A box half the logical width: every logical unit is half a CSS pixel.
const box = { left: 100, top: 50, width: BOARD_WIDTH / 2, height: BOARD_HEIGHT / 2 };

describe("toLogical", () => {
  it("maps the top-left corner to the origin", () => {
    expect(toLogical(box, 100, 50)).toEqual([0, 0]);
  });

  it("maps the bottom-right corner to the far edge", () => {
    expect(toLogical(box, 100 + box.width, 50 + box.height)).toEqual([
      BOARD_WIDTH,
      BOARD_HEIGHT,
    ]);
  });

  it("scales a point in the middle", () => {
    expect(toLogical(box, 100 + box.width / 2, 50 + box.height / 2)).toEqual([
      BOARD_WIDTH / 2,
      BOARD_HEIGHT / 2,
    ]);
  });

  // A pointer can leave the element during a drag with pointer capture held.
  it("returns coordinates outside the board without clamping", () => {
    const [x, y] = toLogical(box, 0, 0);
    expect(x).toBeLessThan(0);
    expect(y).toBeLessThan(0);
  });

  it("does not divide by zero on a collapsed box", () => {
    expect(toLogical({ left: 0, top: 0, width: 0, height: 0 }, 10, 10)).toEqual([0, 0]);
  });
});

describe("toOffset", () => {
  // The textarea is an absolutely-positioned child of the element, so it needs
  // coordinates relative to that element — NOT viewport coordinates. Adding
  // box.left here would push it off by the page's scroll and margins.
  it("returns coordinates relative to the box, not the viewport", () => {
    expect(toOffset(box, 0, 0)).toEqual([0, 0]);
  });

  it("round-trips with toLogical", () => {
    const [x, y] = toLogical(box, 300, 200);
    // 300,200 in viewport terms is 200,150 inside a box at 100,50.
    expect(toOffset(box, x, y)).toEqual([200, 150]);
  });

  it("scales the far corner to the box size", () => {
    expect(toOffset(box, BOARD_WIDTH, BOARD_HEIGHT)).toEqual([
      box.width,
      box.height,
    ]);
  });
});

describe("logicalToPx", () => {
  it("scales a size by the same factor as a coordinate", () => {
    expect(logicalToPx(44, box.width)).toBe(22);
  });

  it("returns zero for a collapsed box rather than NaN", () => {
    expect(logicalToPx(44, 0)).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/lib/whiteboard-geometry.test.ts`
Expected: FAIL — cannot resolve `@/lib/whiteboard-geometry`.

- [ ] **Step 3: Write the implementation**

Create `lib/whiteboard-geometry.ts`:

```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/lib/whiteboard-geometry.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/whiteboard-geometry.ts tests/lib/whiteboard-geometry.test.ts
git commit -m "feat: extract whiteboard coordinate mapping

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 2: `lib/whiteboard-hit.ts` — bounds and hit-testing

This replaces `nearestOp` in `BoardEditor`, which measures distance to a stroke's **vertices** — so clicking the middle of a long straight underline hits nothing, and a text op is only selectable near its first letter. That bug exists in the eraser today; fixing it here fixes both.

**Files:**
- Create: `lib/whiteboard-hit.ts`
- Test: `tests/lib/whiteboard-hit.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/lib/whiteboard-hit.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/lib/whiteboard-hit.test.ts`
Expected: FAIL — cannot resolve `@/lib/whiteboard-hit`.

- [ ] **Step 3: Write the implementation**

Create `lib/whiteboard-hit.ts`:

```ts
import type { DrawOp } from "@/lib/whiteboard-ops";

// Injected rather than imported, so this module never touches a canvas and can
// be tested with a fake. The component supplies one backed by measureText.
export type Measure = (text: string, size: number) => number;

export type Bounds = { x: number; y: number; width: number; height: number };

// How far off an element a click may land and still count, in logical units. A
// trackpad and a 5-unit-wide stroke need forgiveness; too much and overlapping
// elements become a lottery.
const TOLERANCE = 14;

// Matches the line spacing drawOps uses when it renders a multi-line text op.
const LINE_HEIGHT = 1.25;

export function opBounds(op: DrawOp, measure: Measure): Bounds {
  if (op.kind === "text") {
    const lines = op.text.split("\n");
    return {
      x: op.x,
      y: op.y,
      width: measure(op.text, op.size),
      height: op.size * LINE_HEIGHT * lines.length,
    };
  }

  const xs: number[] = [];
  const ys: number[] = [];

  if (op.kind === "arrow") {
    xs.push(op.x1, op.x2);
    ys.push(op.y1, op.y2);
  } else {
    for (let i = 0; i < op.points.length; i += 2) {
      xs.push(op.points[i]);
      ys.push(op.points[i + 1]);
    }
  }

  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return {
    x: minX,
    y: minY,
    width: Math.max(...xs) - minX,
    height: Math.max(...ys) - minY,
  };
}

// Distance from a point to a SEGMENT, not to its endpoints. This is the whole
// difference between the old nearestOp and this one: the middle of a long
// straight line is nowhere near either end of it.
function distanceToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;

  // A zero-length segment is a point — a dot, or a stroke of one sample.
  if (lengthSquared === 0) return Math.hypot(px - ax, py - ay);

  // Projection of the point onto the line, clamped to the segment.
  const t = Math.max(
    0,
    Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared),
  );
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function hits(op: DrawOp, x: number, y: number, measure: Measure): boolean {
  if (op.kind === "text") {
    const bounds = opBounds(op, measure);
    return (
      x >= bounds.x - TOLERANCE &&
      x <= bounds.x + bounds.width + TOLERANCE &&
      y >= bounds.y - TOLERANCE &&
      y <= bounds.y + bounds.height + TOLERANCE
    );
  }

  if (op.kind === "arrow") {
    return distanceToSegment(x, y, op.x1, op.y1, op.x2, op.y2) <= TOLERANCE;
  }

  if (op.points.length === 2) {
    return Math.hypot(x - op.points[0], y - op.points[1]) <= TOLERANCE;
  }

  for (let i = 0; i + 3 < op.points.length; i += 2) {
    const distance = distanceToSegment(
      x,
      y,
      op.points[i],
      op.points[i + 1],
      op.points[i + 2],
      op.points[i + 3],
    );
    if (distance <= TOLERANCE) return true;
  }

  return false;
}

// Backwards, because later ops render on top and the topmost should win.
export function hitTest(
  ops: DrawOp[],
  x: number,
  y: number,
  measure: Measure,
): string | null {
  for (let i = ops.length - 1; i >= 0; i -= 1) {
    if (hits(ops[i], x, y, measure)) return ops[i].id;
  }
  return null;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/lib/whiteboard-hit.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/whiteboard-hit.ts tests/lib/whiteboard-hit.test.ts
git commit -m "feat: add whiteboard hit-testing with segment distance

Replaces nearestOp's vertex distance, which missed the middle of a long
stroke and only hit a text op near its first letter.

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 3: `lib/whiteboard-revise.ts` — one function for every edit

Move, recolour, retype, resize. All four are the same operation on the log: retract the old op, append a new one. Writing them once is what stops the fourth from being subtly different from the first.

**Files:**
- Create: `lib/whiteboard-revise.ts`
- Test: `tests/lib/whiteboard-revise.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/lib/whiteboard-revise.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/lib/whiteboard-revise.test.ts`
Expected: FAIL — cannot resolve `@/lib/whiteboard-revise`.

- [ ] **Step 3: Write the implementation**

Create `lib/whiteboard-revise.ts`:

```ts
import type { Colour, DrawOp, RemoveOp } from "@/lib/whiteboard-ops";

// The rungs a text block steps between. A ladder rather than free resizing,
// for the same reason the palette is five swatches and not a colour picker:
// bounded choices keep a board looking deliberate.
export const TEXT_SIZES = [28, 36, 44, 56, 72, 96] as const;

export type Revision = {
  dx?: number;
  dy?: number;
  colour?: Colour;
  text?: string;
  size?: number;
};

// Every edit in the editor funnels through here. The log is append-only, so a
// revision is a retraction plus a replacement — the same mechanism the eraser
// uses, pointed at a different intent. foldPage needs no knowledge of it.
//
// The caller must move the selection to the returned op's id: a revised element
// is a NEW element as far as the log is concerned.
export function reviseOp(
  op: DrawOp,
  change: Revision,
  newId: string,
): [RemoveOp, DrawOp] {
  const dx = change.dx ?? 0;
  const dy = change.dy ?? 0;
  const colour = change.colour ?? op.colour;

  const remove: RemoveOp = {
    // Derived from newId rather than minted separately, so a caller cannot
    // accidentally pass the same id twice and produce a self-erasing pair.
    id: `remove-${newId}`,
    page: op.page,
    kind: "remove",
    targets: [op.id],
  };

  if (op.kind === "text") {
    return [
      remove,
      {
        ...op,
        id: newId,
        x: op.x + dx,
        y: op.y + dy,
        colour,
        text: change.text ?? op.text,
        size: change.size ?? op.size,
      },
    ];
  }

  if (op.kind === "arrow") {
    return [
      remove,
      {
        ...op,
        id: newId,
        x1: op.x1 + dx,
        y1: op.y1 + dy,
        x2: op.x2 + dx,
        y2: op.y2 + dy,
        colour,
      },
    ];
  }

  return [
    remove,
    {
      ...op,
      id: newId,
      // Flat [x, y, x, y, …], so even indices are x and odd are y.
      points: op.points.map((value, index) => value + (index % 2 === 0 ? dx : dy)),
      colour,
    },
  ];
}

export function stepTextSize(size: number, direction: 1 | -1): number {
  // Snap first: a size off the ladder has no next rung until it is on one.
  const nearest = TEXT_SIZES.reduce((best, rung) =>
    Math.abs(rung - size) < Math.abs(best - size) ? rung : best,
  );
  const index = TEXT_SIZES.indexOf(nearest);
  const next = index + direction;
  if (next < 0 || next >= TEXT_SIZES.length) return nearest;
  return TEXT_SIZES[next];
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/lib/whiteboard-revise.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/whiteboard-revise.ts tests/lib/whiteboard-revise.test.ts
git commit -m "feat: express every whiteboard edit as remove plus re-add

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 4: `components/whiteboard/BoardToolbar.tsx` — icons

**Files:**
- Create: `components/whiteboard/BoardToolbar.tsx`

`lucide-react` is already in `package.json` — do not add a dependency.

- [ ] **Step 1: Write the component**

Create `components/whiteboard/BoardToolbar.tsx`:

```ts
"use client";

import type { ReactNode } from "react";
import {
  ArrowUpRight,
  Eraser,
  MousePointer2,
  Pencil,
  Trash2,
  Type,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { PALETTE, type Colour } from "@/lib/whiteboard-ops";

export type Tool = "select" | "pen" | "text" | "arrow" | "eraser";

const TOOLS: { tool: Tool; label: string; Icon: LucideIcon }[] = [
  { tool: "select", label: "Sélectionner", Icon: MousePointer2 },
  { tool: "pen", label: "Crayon", Icon: Pencil },
  { tool: "text", label: "Texte", Icon: Type },
  { tool: "arrow", label: "Flèche", Icon: ArrowUpRight },
  { tool: "eraser", label: "Gomme", Icon: Eraser },
];

// Icon-only controls need both: aria-label for a screen reader, title for a
// hover tooltip. Without them this toolbar is usable only by whoever wrote it.
function IconButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={`flex h-10 w-10 items-center justify-center rounded-full border border-[var(--card-line)] transition-colors ${
        active
          ? "bg-[var(--card-bleu)] text-white"
          : "bg-[var(--card-paper)] text-[var(--card-moss)]"
      }`}
    >
      {children}
    </button>
  );
}

export function BoardToolbar({
  tool,
  colour,
  hasSelection,
  onTool,
  onColour,
  onUndo,
  onClearPage,
}: {
  tool: Tool;
  colour: Colour;
  hasSelection: boolean;
  onTool: (tool: Tool) => void;
  onColour: (colour: Colour) => void;
  onUndo: () => void;
  onClearPage: () => void;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      {TOOLS.map(({ tool: option, label, Icon }) => (
        <IconButton
          key={option}
          label={label}
          active={tool === option}
          onClick={() => onTool(option)}
        >
          <Icon size={18} aria-hidden="true" />
        </IconButton>
      ))}

      <span className="mx-1 flex gap-1">
        {PALETTE.map((swatch) => (
          <button
            key={swatch}
            type="button"
            onClick={() => onColour(swatch)}
            // The label changes with the selection because the button's effect
            // does: with something selected it recolours that element, without
            // it arms the next one.
            aria-label={
              hasSelection ? "Recolorer la sélection" : "Choisir cette couleur"
            }
            title={hasSelection ? "Recolorer la sélection" : "Couleur"}
            aria-pressed={!hasSelection && colour === swatch}
            style={{ background: swatch }}
            className={`h-9 w-9 rounded-full transition-transform ${
              !hasSelection && colour === swatch
                ? "ring-2 ring-[var(--card-ink)] ring-offset-2"
                : ""
            } ${hasSelection ? "hover:scale-110" : ""}`}
          />
        ))}
      </span>

      <IconButton label="Annuler la dernière action" onClick={onUndo}>
        <Undo2 size={18} aria-hidden="true" />
      </IconButton>

      <IconButton label="Effacer la page" onClick={onClearPage}>
        <Trash2 size={18} aria-hidden="true" />
      </IconButton>
    </div>
  );
}
```

- [ ] **Step 2: Lint and typecheck**

Run: `npm run lint && npm run typecheck`
Expected: errors only in `BoardEditor.tsx`, which still declares its own `Tool` type and inline toolbar — fixed in Task 6.

- [ ] **Step 3: Commit**

```bash
git add components/whiteboard/BoardToolbar.tsx
git commit -m "feat: icon toolbar for the whiteboard editor

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 5: `components/whiteboard/TextLayer.tsx` — the inline editor

Replaces `window.prompt`. A borderless transparent `<textarea>` positioned over the canvas, matched to the font, size and colour the committed op will render with, so the text does not move or change appearance when it commits.

**Files:**
- Create: `components/whiteboard/TextLayer.tsx`

- [ ] **Step 1: Write the component**

Create `components/whiteboard/TextLayer.tsx`:

```ts
"use client";

import { useEffect, useRef } from "react";
import { logicalToPx, toOffset, type Box } from "@/lib/whiteboard-geometry";
import type { Colour } from "@/lib/whiteboard-ops";

export type TextDraft = {
  x: number;
  y: number;
  value: string;
  colour: Colour;
  size: number;
  // Set when re-editing an existing op, so the commit knows to revise rather
  // than to append.
  editing: string | null;
};

export function TextLayer({
  draft,
  box,
  onChange,
  onCommit,
  onCancel,
}: {
  draft: TextDraft;
  // The canvas element's own rect. Positions here are relative to it, so the
  // layer must be inside a `relative` parent that wraps the canvas exactly.
  box: Box;
  onChange: (value: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    ref.current?.focus();
    // Caret to the end, so re-editing continues rather than overwrites.
    const length = ref.current?.value.length ?? 0;
    ref.current?.setSelectionRange(length, length);
    // Only on mount: refocusing on every keystroke would fight the caret.
  }, []);

  const fontSize = logicalToPx(draft.size, box.width);
  const [left, top] = toOffset(box, draft.x, draft.y);

  return (
    <textarea
      ref={ref}
      value={draft.value}
      onChange={(event) => onChange(event.target.value)}
      onBlur={onCommit}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onCancel();
          return;
        }
        // Enter is a newline — drawOps already splits a text op on \n. So the
        // deliberate commit is the modifier chord, and blur covers the rest.
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          onCommit();
        }
      }}
      // Stops a click inside the textarea reaching the canvas underneath and
      // starting a stroke or moving the caret somewhere else.
      onPointerDown={(event) => event.stopPropagation()}
      spellCheck={false}
      rows={1}
      style={{
        position: "absolute",
        left,
        top,
        color: draft.colour,
        fontSize,
        // Matches drawOps exactly: the same family, and the same 1.25 line
        // height, or the text shifts the instant it commits.
        fontFamily: 'Georgia, "Times New Roman", serif',
        lineHeight: 1.25,
        background: "transparent",
        border: "none",
        outline: "none",
        padding: 0,
        margin: 0,
        resize: "none",
        overflow: "hidden",
        // Grows with the content instead of scrolling inside a fixed box.
        width: `${Math.max(6, draft.value.split("\n").reduce((longest, line) => Math.max(longest, line.length), 0) + 1)}ch`,
        height: `${(draft.value.split("\n").length || 1) * fontSize * 1.25}px`,
        caretColor: draft.colour,
      }}
    />
  );
}
```

- [ ] **Step 2: Lint and typecheck**

Run: `npm run lint && npm run typecheck`
Expected: errors only in `BoardEditor.tsx`.

- [ ] **Step 3: Commit**

```bash
git add components/whiteboard/TextLayer.tsx
git commit -m "feat: inline text editing layer for the whiteboard

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 6: Rewire `BoardEditor`

**Files:**
- Modify: `components/whiteboard/BoardEditor.tsx`

The editor keeps the op log, the page state and the save path from Part 1. Everything below is replacement, not addition — delete the code it supersedes rather than leaving both.

- [ ] **Step 1: Delete what is superseded**

Remove from `BoardEditor.tsx`:
- the local `type Tool = "pen" | "text" | "arrow" | "eraser"` — it now comes from `BoardToolbar`
- the entire inline toolbar JSX (the tool buttons, the palette `<span>`, the *Annuler la dernière* and *Effacer la page* buttons)
- the `nearestOp` helper function at the bottom of the file
- the `window.prompt` branch in `handlePointerDown`
- the inline `toLogical` function

- [ ] **Step 2: Add the new imports and state**

```ts
import { hitTest, opBounds } from "@/lib/whiteboard-hit";
import { toLogical, logicalToPx, type Box } from "@/lib/whiteboard-geometry";
import { reviseOp, stepTextSize, type Revision } from "@/lib/whiteboard-revise";
import { BoardToolbar, type Tool } from "@/components/whiteboard/BoardToolbar";
import { TextLayer, type TextDraft } from "@/components/whiteboard/TextLayer";
```

```ts
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<TextDraft | null>(null);
  const dragFrom = useRef<[number, number] | null>(null);
  const [dragBy, setDragBy] = useState<[number, number] | null>(null);
```

Replace the old `toLogical` body with a call into the module:

```ts
  function boxOf(): Box {
    const rect = surface.current?.getBoundingClientRect();
    return rect ?? { left: 0, top: 0, width: 0, height: 0 };
  }

  // Takes the two fields it needs rather than a React.PointerEvent, because
  // onDoubleClick hands back a MouseEvent and the two do not unify.
  function pointer(event: { clientX: number; clientY: number }): [number, number] {
    return toLogical(boxOf(), event.clientX, event.clientY);
  }
```

- [ ] **Step 3: Add a real text measurer**

```ts
  // hitTest and opBounds are pure and take a measurer; this is the real one.
  // A single detached canvas, reused, because creating one per hit test would
  // allocate on every mouse move.
  const scratch = useRef<CanvasRenderingContext2D | null>(null);
  function measure(text: string, size: number): number {
    if (!scratch.current) {
      scratch.current = document.createElement("canvas").getContext("2d");
    }
    const context = scratch.current;
    if (!context) return text.length * size * 0.5; // rough, but never NaN
    context.font = `${size}px Georgia, "Times New Roman", serif`;
    return Math.max(
      ...text.split("\n").map((line) => context.measureText(line).width),
    );
  }
```

- [ ] **Step 4: Add the revision helper**

Every edit goes through this, and it is the only place the selection is moved to the new id.

```ts
  function revise(id: string, change: Revision) {
    const target = visible.find((op) => op.id === id);
    if (!target) return;
    const newId = nextId();
    const [remove, next] = reviseOp(target, change, newId);
    setOps((current) => [...current, remove, next]);
    // A revised element is a NEW element as far as the log is concerned, so the
    // selection has to follow or the next edit would target a removed op.
    setSelected(newId);
  }
```

- [ ] **Step 5: Rewrite the pointer handlers**

```ts
  function handlePointerDown(event: React.PointerEvent) {
    if (saving) return;
    // A click anywhere commits an open text draft, the same as blurring it.
    if (draft) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    const [x, y] = pointer(event);

    if (tool === "select") {
      const id = hitTest(visible, x, y, measure);
      setSelected(id);
      if (id) dragFrom.current = [x, y];
      return;
    }

    if (tool === "text") {
      setDraft({ x, y, value: "", colour, size: 44, editing: null });
      return;
    }

    if (tool === "eraser") {
      const id = hitTest(visible, x, y, measure);
      if (id) append({ id: nextId(), page, kind: "remove", targets: [id] });
      return;
    }

    drawing.current = [x, y];
    setPreview([x, y]);
  }

  function handlePointerMove(event: React.PointerEvent) {
    if (tool === "select") {
      if (!dragFrom.current) return;
      const [x, y] = pointer(event);
      setDragBy([x - dragFrom.current[0], y - dragFrom.current[1]]);
      return;
    }
    // ...the existing arrow/stroke preview logic, unchanged
  }

  function handlePointerUp(event: React.PointerEvent) {
    if (tool === "select") {
      const offset = dragBy;
      dragFrom.current = null;
      setDragBy(null);
      // A click without movement is a selection, not a zero-length move — and
      // a move of nothing would still cost two ops in the log.
      if (selected && offset && (Math.abs(offset[0]) > 2 || Math.abs(offset[1]) > 2)) {
        revise(selected, { dx: offset[0], dy: offset[1] });
      }
      return;
    }
    // ...the existing arrow/stroke commit logic, unchanged
  }

  // Double-click a text element to retype it. MouseEvent, not PointerEvent —
  // that is what onDoubleClick provides.
  function handleDoubleClick(event: React.MouseEvent) {
    const [x, y] = pointer(event);
    const id = hitTest(visible, x, y, measure);
    const target = visible.find((op) => op.id === id);
    if (!target || target.kind !== "text") return;
    setSelected(id);
    setDraft({
      x: target.x,
      y: target.y,
      value: target.text,
      colour: target.colour,
      size: target.size,
      editing: target.id,
    });
  }
```

Add `onDoubleClick={handleDoubleClick}` to the surface `<div>`.

- [ ] **Step 6: Commit or cancel a text draft**

```ts
  function commitDraft() {
    if (!draft) return;
    const value = draft.value.trim();
    const editing = draft.editing;
    setDraft(null);

    if (value.length === 0) {
      // An empty draft over an existing element deletes it — the same thing
      // selecting it and pressing Delete would do, and what she means by
      // clearing the box.
      if (editing) append({ id: nextId(), page, kind: "remove", targets: [editing] });
      return;
    }

    if (editing) {
      revise(editing, { text: value });
      return;
    }

    const id = nextId();
    append({
      id,
      page,
      kind: "text",
      x: draft.x,
      y: draft.y,
      text: value,
      colour: draft.colour,
      size: draft.size,
    });
    setSelected(id);
  }
```

- [ ] **Step 7: Wire the toolbar, including recolour**

```ts
  function handleColour(next: Colour) {
    // With something selected the swatch recolours it; with nothing selected it
    // arms the next thing drawn. Two behaviours, one control, because that is
    // what every drawing tool does and what she will expect.
    if (selected) {
      revise(selected, { colour: next });
      return;
    }
    setColour(next);
  }
```

```tsx
      <BoardToolbar
        tool={tool}
        colour={colour}
        hasSelection={selected !== null}
        onTool={(next) => {
          setTool(next);
          // Leaving select mode drops the selection, so its outline and size
          // controls do not linger over a tool that cannot act on them.
          if (next !== "select") setSelected(null);
        }}
        onColour={handleColour}
        onUndo={undo}
        onClearPage={clearPage}
      />
```

- [ ] **Step 8: Selection outline, size stepper, and Delete**

Inside the surface `<div>`, after the canvases:

```tsx
      {selectedBounds && (
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            left: `${(selectedBounds.x / 1600) * 100}%`,
            top: `${(selectedBounds.y / 1000) * 100}%`,
            width: `${(selectedBounds.width / 1600) * 100}%`,
            height: `${(selectedBounds.height / 1000) * 100}%`,
            // Percentages rather than pixels so the outline tracks the element
            // through a window resize without a listener.
            outline: "2px dashed var(--card-bleu)",
            outlineOffset: 4,
            pointerEvents: "none",
          }}
        />
      )}
```

with, above the return:

```ts
  const selectedOp = selected ? visible.find((op) => op.id === selected) : undefined;
  const selectedBounds = selectedOp ? opBounds(selectedOp, measure) : null;
```

The size stepper goes beside the page controls, shown only for a selected text element:

```tsx
        {selectedOp?.kind === "text" && (
          <span className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Réduire le texte"
              title="Réduire le texte"
              onClick={() =>
                revise(selectedOp.id, { size: stepTextSize(selectedOp.size, -1) })
              }
              className="rounded-full border border-[var(--card-line)] px-3 py-1 text-xs"
            >
              A−
            </button>
            <button
              type="button"
              aria-label="Agrandir le texte"
              title="Agrandir le texte"
              onClick={() =>
                revise(selectedOp.id, { size: stepTextSize(selectedOp.size, 1) })
              }
              className="rounded-full border border-[var(--card-line)] px-3 py-1 text-sm"
            >
              A+
            </button>
          </span>
        )}
```

Delete key:

```ts
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      // Not while typing: Backspace in the textarea must delete a character.
      if (draft) return;
      if (!selected) return;
      if (event.key !== "Backspace" && event.key !== "Delete") return;
      event.preventDefault();
      append({ id: nextId(), page, kind: "remove", targets: [selected] });
      setSelected(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, draft, page]);
```

- [ ] **Step 9: Render the drag preview and the text layer**

The dragged element should follow the pointer before the move commits. Render the selected op translated by `dragBy` on the preview canvas, and hide the committed one:

```tsx
        <BoardCanvas
          ops={
            dragBy && selectedOp
              ? visible.filter((op) => op.id !== selectedOp.id)
              : visible
          }
          className="absolute inset-0 h-full w-full"
        />
        {dragBy && selectedOp && (
          <BoardCanvas
            background={null}
            className="absolute inset-0 h-full w-full"
            ops={[reviseOp(selectedOp, { dx: dragBy[0], dy: dragBy[1] }, "drag")[1]]}
          />
        )}
```

and the text layer, last so it sits above everything:

```tsx
        {draft && (
          <TextLayer
            draft={draft}
            box={boxOf()}
            onChange={(value) => setDraft({ ...draft, value })}
            onCommit={commitDraft}
            onCancel={() => setDraft(null)}
          />
        )}
```

- [ ] **Step 10: Lint, typecheck, test, build**

Run: `npm run lint && npm run typecheck && npm test && npm run build`
Expected: all pass, with no remaining reference to `nearestOp` or `window.prompt`.

Run: `grep -rn "window.prompt\|nearestOp" components/ lib/`
Expected: no matches.

- [ ] **Step 11: Manual check**

`npm run dev`, open a tokened student page as the teacher, *Le tableau* → *Nouveau tableau*:

1. Toolbar shows **five icons**, no words; hovering each shows a French tooltip.
2. Text tool, click, type — text appears **on the canvas as you type**, in the right place, size and colour. Escape discards it; clicking elsewhere commits it.
3. Committed text does **not** jump or change size at the moment it commits. If it does, the textarea's font settings have drifted from `drawOps`.
4. Enter inside the box adds a second line; both lines render.
5. Select tool: click the text — a dashed outline appears around **all** of it, not just its first letter.
6. Drag it — it follows the pointer and stays where dropped.
7. With it selected, press a colour swatch — **that element** changes colour, and the next thing you draw is still the old colour.
8. A− and A+ resize it in steps.
9. Double-click it — the box reopens with its text and the caret at the end.
10. Press Delete with it selected — it goes.
11. Draw a long straight line with the pen, switch to the eraser, and click its **middle**. It must erase. (Before this change it would not have.)
12. Save, and confirm the archive thumbnail and the downloaded JPEG both match what was on screen.

- [ ] **Step 12: Commit**

```bash
git add components/whiteboard/BoardEditor.tsx
git commit -m "feat: inline text, selection, move, recolour and resize

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 7: Documentation

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Extend the Whiteboards section**

Append to the Whiteboards section:

```markdown
**Every edit is a remove plus a re-add.** Move, recolour, retype, resize and
delete all funnel through `reviseOp` (`lib/whiteboard-revise.ts`), which returns
a `remove` naming the old op and a fresh op carrying the change. `foldPage` knows
nothing about any of it. The consequence to remember: a revised element has a
**new id**, so the editor's selection has to follow it or the next edit targets
an op that no longer exists.

`lib/whiteboard-hit.ts` decides what a click landed on. Its text measurer is
**injected** so the module stays pure and testable with a fake; the editor passes
one backed by a detached canvas. It measures distance to a stroke's *segments*,
not its vertices — the earlier `nearestOp` did the latter, which meant clicking
the middle of a long underline hit nothing and a text op was only selectable near
its first letter.

Text is typed inline through `TextLayer`, a transparent `<textarea>` positioned
over the canvas. Its font family, size and 1.25 line height must stay in step
with what `drawOps` renders, or committing makes the text visibly jump.
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document whiteboard editing

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Reconciling with Part 2

Do this plan **before** `2026-07-31-whiteboard-live.md`. Part 2's Task 6 was written against Part 1's editor and needs three adjustments once this has landed:

1. **`pendingRef` is set in more places.** Part 2 sets it during a stroke or arrow drag. It must now also carry: the text draft as she types (a `text` op built from `draft`), and the dragged element during a select-drag (`reviseOp(selectedOp, {dx, dy}, "pending")[1]`). All three are already `DrawOp`s, so `LiveBoard.pending` needs no type change.

2. **A select-drag should retract before it moves.** Emit the `remove` half at drag *start* rather than at drop, so the student does not see the element in two places at once while it is being dragged. The re-add still lands on drop.

3. **Nothing else changes.** The ops route, the bus, the stream framing, the snapshot and the provider are all untouched — because every new interaction here reduces to ops on the same append-only log, which is exactly the property that made this feature cheap to extend.

## Deliberately not built

- **Keyboard shortcuts** (`S`/`P`/`T`/`E`). Preply has them, and with an icon-only toolbar they would help — but tooltips carry discoverability for now, and nobody has asked.
- **Multi-select.** One element at a time. A marquee needs a selection model rather than a single id.
- **Recolouring by dragging a swatch onto an element.** The click-with-selection path covers it.
- **Undo aware of revisions.** `undo` still drops the last log entry, so undoing a move takes two presses — it appended two ops. Worth fixing if it annoys her; the fix is for `undo` to pop a trailing `remove`+op pair together.
