# Whiteboard Text Tool Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the whiteboard's Text tool actually accept typed text, and move the pointer-down decision out of the component into a tested pure function.

**Architecture:** `BoardEditor.handlePointerDown` currently calls `setPointerCapture` before it knows which tool is active and never calls `preventDefault()`. The browser's compatibility `mousedown` then steals focus from the textarea that `TextLayer` just focused, which blurs it, which commits an empty draft, which closes the box — inside a single click. The fix branches on the text tool *before* taking capture and prevents the default there. The branching rule is extracted to `lib/whiteboard-tools.ts` so it can be unit-tested without a DOM.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-31-files-links-and-fixes-design.md` §7.

**This plan is independent** of the files/links plan and can ship on its own.

---

## Critical context for whoever executes this

**You cannot verify the fix.** This session has no browser. jsdom implements
neither pointer capture nor the focus-on-mousedown default action, so a jsdom
test of this bug passes identically before and after the fix — do **not** add
one, and do not add Playwright. `npm test` here proves the decision function,
not the cure. Task 4 is a hard stop where you hand the reproduction script back
to a human. Under `superpowers:verification-before-completion` you may not claim
this bug is fixed.

**Project conventions you must follow:**
- Logic lives in `lib/` as pure functions with tests in `tests/lib/`. Components
  and Prisma access are not unit-tested.
- Comments explain *why*, especially the counter-intuitive. Do not add comments
  that restate the code.
- Imports use the `@/` alias.

---

## File Structure

| File | Responsibility |
|---|---|
| `lib/whiteboard-tools.ts` | **Create.** Owns the `Tool` union and `pointerDownIntent` — the whole "what should a pointer-down do" rule. |
| `tests/lib/whiteboard-tools.test.ts` | **Create.** Covers every tool plus the two overrides. |
| `components/whiteboard/BoardToolbar.tsx` | **Modify.** Imports `Tool` from lib and re-exports it, so existing importers are untouched. |
| `components/whiteboard/BoardEditor.tsx` | **Modify.** `handlePointerDown` becomes a thin dispatcher over `pointerDownIntent`. |

---

### Task 1: The pointer-down decision as a pure function

**Files:**
- Create: `lib/whiteboard-tools.ts`
- Test: `tests/lib/whiteboard-tools.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/whiteboard-tools.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { pointerDownIntent } from "@/lib/whiteboard-tools";

const base = { hasDraft: false, saving: false };

describe("pointerDownIntent", () => {
  it("opens a text draft without capturing the pointer", () => {
    const intent = pointerDownIntent({ ...base, tool: "text" });
    expect(intent.action).toBe("open-text");
    // The whole bug: capture retargets the compatibility mousedown to the
    // surface, whose default action moves focus off the textarea.
    expect(intent.capturesPointer).toBe(false);
    expect(intent.preventsDefault).toBe(true);
  });

  it("captures the pointer for the drawing tools", () => {
    for (const tool of ["pen", "arrow"] as const) {
      const intent = pointerDownIntent({ ...base, tool });
      expect(intent.action).toBe("start-stroke");
      expect(intent.capturesPointer).toBe(true);
      expect(intent.preventsDefault).toBe(false);
    }
  });

  it("captures the pointer for select, which drags", () => {
    const intent = pointerDownIntent({ ...base, tool: "select" });
    expect(intent.action).toBe("select");
    expect(intent.capturesPointer).toBe(true);
  });

  it("erases", () => {
    const intent = pointerDownIntent({ ...base, tool: "eraser" });
    expect(intent.action).toBe("erase");
    expect(intent.capturesPointer).toBe(true);
  });

  it("ignores everything while saving", () => {
    for (const tool of ["select", "pen", "text", "arrow", "eraser"] as const) {
      expect(pointerDownIntent({ ...base, tool, saving: true }).action).toBe(
        "ignore",
      );
    }
  });

  it("ignores everything while a draft is open", () => {
    for (const tool of ["select", "pen", "text", "arrow", "eraser"] as const) {
      expect(pointerDownIntent({ ...base, tool, hasDraft: true }).action).toBe(
        "ignore",
      );
    }
  });

  it("does not prevent the default while a draft is open", () => {
    // The blur IS the commit. Preventing the default here would stop the click
    // reaching the browser's focus handling, so clicking away from an open text
    // box would never commit it.
    const intent = pointerDownIntent({ ...base, tool: "text", hasDraft: true });
    expect(intent.preventsDefault).toBe(false);
    expect(intent.capturesPointer).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run tests/lib/whiteboard-tools.test.ts
```

Expected: FAIL — `Failed to resolve import "@/lib/whiteboard-tools"`.

- [ ] **Step 3: Write the implementation**

Create `lib/whiteboard-tools.ts`:

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run tests/lib/whiteboard-tools.test.ts
```

Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/whiteboard-tools.ts tests/lib/whiteboard-tools.test.ts
git commit -m "feat: extract pointerDownIntent from BoardEditor

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 2: Move the `Tool` type without breaking its importers

**Files:**
- Modify: `components/whiteboard/BoardToolbar.tsx:16`

`BoardEditor` imports `Tool` from `BoardToolbar` today. Re-exporting keeps that
import working, so this task touches exactly one file.

- [ ] **Step 1: Replace the local type with a re-export**

In `components/whiteboard/BoardToolbar.tsx`, delete line 16:

```ts
export type Tool = "select" | "pen" | "text" | "arrow" | "eraser";
```

and add to the import block at the top of the file, after the `lucide-react`
import:

```ts
import type { Tool } from "@/lib/whiteboard-tools";

// Re-exported so BoardEditor's existing import keeps working. The union itself
// moved to lib/ because pointerDownIntent is the thing that branches on it.
export type { Tool };
```

- [ ] **Step 2: Verify types still resolve**

```bash
npm run typecheck
```

Expected: no output, exit 0.

- [ ] **Step 3: Commit**

```bash
git add components/whiteboard/BoardToolbar.tsx
git commit -m "refactor: move Tool union to lib/whiteboard-tools

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 3: Make `handlePointerDown` a dispatcher

**Files:**
- Modify: `components/whiteboard/BoardEditor.tsx:187-216`

- [ ] **Step 1: Add the import**

In `components/whiteboard/BoardEditor.tsx`, after the existing
`import { reviseOp, ... } from "@/lib/whiteboard-revise";` line, add:

```ts
import { pointerDownIntent } from "@/lib/whiteboard-tools";
```

- [ ] **Step 2: Replace the handler**

Replace the whole of `handlePointerDown` (currently lines 187-216) with:

```tsx
  function handlePointerDown(event: React.PointerEvent) {
    const intent = pointerDownIntent({
      tool,
      hasDraft: draft !== null,
      saving,
    });

    if (intent.action === "ignore") return;

    // Order matters. preventDefault suppresses the compatibility mouse events,
    // and it has to happen before anything that can trigger a re-render.
    if (intent.preventsDefault) event.preventDefault();
    if (intent.capturesPointer) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }

    const [x, y] = pointer(event);

    switch (intent.action) {
      case "select": {
        const id = hitTest(visible, x, y, measure);
        setSelected(id);
        if (id) dragFrom.current = [x, y];
        return;
      }
      case "open-text": {
        setDraftBox(boxOf());
        setDraft({ x, y, value: "", colour, size: 44, editing: null });
        return;
      }
      case "erase": {
        const id = hitTest(visible, x, y, measure);
        if (id) append({ id: nextId(), page, kind: "remove", targets: [id] });
        return;
      }
      case "start-stroke": {
        drawing.current = [x, y];
        setPreview([x, y]);
        return;
      }
    }
  }
```

Note what is gone: the standalone `if (saving) return;` and `if (draft) return;`
guards, and the unconditional `setPointerCapture` — all three are now decisions
`pointerDownIntent` makes.

- [ ] **Step 3: Verify lint, types and build**

```bash
npm run lint && npm run typecheck && npm run build
```

Expected: all three exit 0. The build is the meaningful check here — it compiles
the client component and catches an unhandled `switch` case or a stale
reference.

- [ ] **Step 4: Run the whole test suite**

```bash
npm test
```

Expected: all pass, including the pre-existing whiteboard tests
(`whiteboard-ops`, `whiteboard-hit`, `whiteboard-revise`, `whiteboard-geometry`,
`whiteboard-export`, `whiteboard-thumbnail`, `whiteboard-live`,
`whiteboard-names`). None of them touch `BoardEditor`, so any failure here means
you changed something you did not mean to.

- [ ] **Step 5: Commit**

```bash
git add components/whiteboard/BoardEditor.tsx
git commit -m "fix: let the whiteboard Text tool receive typed text

Placing text took pointer capture and did not prevent the default, so the
compatibility mousedown moved focus to the unfocusable surface div, blurring
the textarea TextLayer had just focused. onBlur committed an empty draft and
closed the box inside the same click.

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 4: STOP — human verification gate

**Do not skip this and do not mark the bug fixed.** You have proven
`pointerDownIntent` returns the right decision. You have not observed a browser.

- [ ] **Step 1: Confirm what is and is not proven**

Run the full CI sequence, in CI's order:

```bash
npx prisma generate && npm run lint && npm run typecheck && npm test && npm run build
```

All five must exit 0. Paste the actual output rather than summarising it.

- [ ] **Step 2: Hand back this script verbatim**

Report to the user:

> I cannot verify this in a browser. `npm test` proves the decision function,
> not the cure. Please run these five checks against `npm run dev`:
>
> 1. Open a student page with a chat token (`/g/<slug>?k=<chatToken>`), go to
>    **Le tableau**, and start a board.
> 2. Click **Texte**, then click the canvas. **A caret should appear and stay.**
>    Type a few words — they should appear as you type. Click elsewhere on the
>    canvas; the text should commit and stay drawn.
> 3. Type into a text box and press **Escape** — the draft should vanish with
>    nothing committed.
> 4. Switch to **Sélectionner** and double-click the committed text — it should
>    reopen for editing with the caret at the end. (This path was never broken;
>    it is here to confirm the change did not break it.)
> 5. Draw with **Crayon** and **Flèche**, and erase with **Gomme** — dragging
>    must still work, which is what confirms pointer capture is still taken for
>    those tools.
>
> If step 2 still fails, the diagnosis was wrong. Before changing anything else,
> add `console.log(document.activeElement)` to `TextLayer`'s `onBlur` and report
> what it prints — if it is not `<body>`, the cause is something other than
> focus theft and this plan's premise needs revisiting.

- [ ] **Step 3: Wait**

Do not proceed to any other work on this plan until a human confirms. If step 2
fails, use `superpowers:systematic-debugging` — do not guess at a second fix.

---

## Self-review notes

- **Spec coverage:** §7 of the spec has four parts — hypothesis, confirm-before-
  fixing, the fix, and made-testable. Task 1 covers made-testable, Task 3 the
  fix, Task 4 both confirmation and the human gate. Covered.
- **Type consistency:** `Tool`, `PointerAction`, `PointerIntent`,
  `pointerDownIntent`, `capturesPointer`, `preventsDefault` are used with
  identical spelling in Tasks 1, 2 and 3.
- **Known gap, accepted:** nothing in this plan can fail if the fix does not
  work. That is inherent to the constraint and is why Task 4 is a blocking gate
  rather than a checklist item.
