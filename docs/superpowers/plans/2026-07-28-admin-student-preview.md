# Live Student Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the teacher the real student rendering of the card she is editing, updating as she types, without saving and without leaving `/admin`.

**Architecture:** The two faces of the flashcard are extracted out of `Flashcard.tsx` into `CardFront` and `CardBack`. `Flashcard` keeps the flip container and composes them; a new `StudentPreview` stacks them for the editor. A pure function maps the editor's all-strings `CardInput` to the `CardContent` the faces expect. Because both the student card and the preview render the same two components, the preview cannot drift from what students see.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript 5 strict, Tailwind CSS v4 (PostCSS, no config file), Vitest.

Design spec: `docs/superpowers/specs/2026-07-28-admin-student-preview-design.md`

## Global Constraints

- Imports use the `@/` alias for repo-root-relative paths.
- Tailwind v4: there is no `tailwind.config`. Design tokens are CSS custom properties in `app/globals.css`. Repeated card class strings live in `components/card-styles.ts`.
- Vitest runs `environment: "node"`. There is no jsdom and no React Testing Library, and this plan does not add them. Only pure functions get unit tests.
- Comments explain *why*, especially where the code is counter-intuitive. Do not add comments that restate the code.
- Commit messages: lowercase conventional prefix (`feat:`, `refactor:`, `test:`), then a sentence describing intent.
- **Hard constraint:** `/g/[slug]` must render identically before and after this work. The extraction in Task 2 is behaviour-preserving. If the student card changes, the change is wrong.

---

### Task 1: The `CardInput` → `CardContent` mapping

**Files:**
- Create: `lib/card-preview.ts`
- Test: `tests/lib/card-preview.test.ts`

**Interfaces:**
- Consumes: `CardInput` from `@/app/actions`, `CardContent` from `@/lib/card-resolution`, `normaliseSections` from `@/lib/sections`
- Produces: `toPreviewContent(values: CardInput): CardContent`

Context you need: `CardInput` has `date: string` (`YYYY-MM-DD`) and `subject`, `usage`, `englishPrompt`, `hint`, `frenchAnswer` all as `string`, plus `sections: CardSection[]`. `CardContent` has `date: Date`, `subject`/`usage`/`hint` as `string | null`, `englishPrompt`/`frenchAnswer` as `string`, and `sections: CardSection[]`.

The optional fields are **not** trimmed. `app/actions.ts` saves them with `input.subject || null`, so `"   "` is truthy and is stored. The preview must be wrong in exactly the same way as the save, or it is not a preview.

- [ ] **Step 1: Write the failing test**

Create `tests/lib/card-preview.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { toPreviewContent } from "@/lib/card-preview";
import type { CardInput } from "@/app/actions";

function values(overrides: Partial<CardInput> = {}): CardInput {
  return {
    date: "2026-07-28",
    subject: "Imparfait",
    usage: "Habits of the past",
    englishPrompt: "I used to pack a lunch every day",
    hint: "Think about a **repeated** habit",
    frenchAnswer: "Je faisais un lunch chaque jour",
    sections: [{ title: "Grammar", body: "faire → **faisait**" }],
    ...overrides,
  };
}

describe("toPreviewContent", () => {
  it("parses the date as UTC midnight", () => {
    expect(toPreviewContent(values()).date.toISOString()).toBe(
      "2026-07-28T00:00:00.000Z",
    );
  });

  it("passes the two required strings through untouched", () => {
    const content = toPreviewContent(
      values({ englishPrompt: "  spaced  ", frenchAnswer: "" }),
    );
    expect(content.englishPrompt).toBe("  spaced  ");
    expect(content.frenchAnswer).toBe("");
  });

  it("keeps the optional fields when they hold text", () => {
    const content = toPreviewContent(values());
    expect(content.subject).toBe("Imparfait");
    expect(content.usage).toBe("Habits of the past");
    expect(content.hint).toBe("Think about a **repeated** habit");
  });

  it("turns an empty optional field into null", () => {
    const content = toPreviewContent(
      values({ subject: "", usage: "", hint: "" }),
    );
    expect(content.subject).toBeNull();
    expect(content.usage).toBeNull();
    expect(content.hint).toBeNull();
  });

  // Deliberately not a trim. app/actions.ts stores `input.subject || null`, so
  // "   " is truthy, saves, and renders a pill full of spaces on the student
  // card. The preview has to reproduce that or it is lying.
  it("keeps a whitespace-only optional field, matching the save path", () => {
    expect(toPreviewContent(values({ subject: "   " })).subject).toBe("   ");
  });

  it("trims sections and drops the ones blank in both fields", () => {
    const content = toPreviewContent(
      values({
        sections: [
          { title: "  Grammar  ", body: "  être → **j'étais**  " },
          { title: "", body: "" },
          { title: "   ", body: "  " },
        ],
      }),
    );
    expect(content.sections).toEqual([
      { title: "Grammar", body: "être → **j'étais**" },
    ]);
  });

  it("keeps a section that has a title and no body", () => {
    const content = toPreviewContent(
      values({ sections: [{ title: "Québec Pronunciation", body: "" }] }),
    );
    expect(content.sections).toEqual([
      { title: "Québec Pronunciation", body: "" },
    ]);
  });

  it("preserves section order", () => {
    const content = toPreviewContent(
      values({
        sections: [
          { title: "One", body: "1" },
          { title: "Two", body: "2" },
          { title: "Three", body: "3" },
        ],
      }),
    );
    expect(content.sections.map((s) => s.title)).toEqual([
      "One",
      "Two",
      "Three",
    ]);
  });

  it("drops the browser-only section id", () => {
    const content = toPreviewContent(
      values({ sections: [{ title: "Grammar", body: "text", id: "s-0" }] }),
    );
    expect(content.sections).toEqual([{ title: "Grammar", body: "text" }]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/lib/card-preview.test.ts`
Expected: FAIL — cannot resolve `@/lib/card-preview`.

- [ ] **Step 3: Write the implementation**

Create `lib/card-preview.ts`:

```ts
import type { CardInput } from "@/app/actions";
import type { CardContent } from "@/lib/card-resolution";
import { normaliseSections } from "@/lib/sections";

// The editor's fields are all `string` because they drive controlled inputs;
// the card faces want the nullable shape the database uses.
//
// The `|| null` conversions mirror toCreateData in app/actions.ts exactly,
// down to not trimming. A subject of "   " is truthy there, so it saves and
// the student card renders a pill full of spaces — a preview that trimmed
// would show no pill and be wrong about the one thing it exists to be right
// about. Sections are the exception only because the save path is: it runs
// normaliseSections too.
export function toPreviewContent(values: CardInput): CardContent {
  return {
    date: new Date(`${values.date}T00:00:00Z`),
    subject: values.subject || null,
    usage: values.usage || null,
    englishPrompt: values.englishPrompt,
    hint: values.hint || null,
    frenchAnswer: values.frenchAnswer,
    sections: normaliseSections(values.sections),
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/lib/card-preview.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no output, exit 0.

- [ ] **Step 6: Commit**

```bash
git add lib/card-preview.ts tests/lib/card-preview.test.ts
git commit -m "feat: map the editor's fields to a previewable card"
```

---

### Task 2: Extract the two card faces

**Files:**
- Create: `components/CardFront.tsx`
- Create: `components/CardBack.tsx`
- Modify: `components/Flashcard.tsx` (replace entirely)

**Interfaces:**
- Consumes: `CardContent` from `@/lib/card-resolution`
- Produces: `CardFront({ card, className })` and `CardBack({ card, className })`, both `{ card: CardContent; className?: string }`

This is a **pure refactor**. Every class name, every string and every conditional moves across unchanged. There is no test to write — Vitest here is node-only — so the gate is `npm run build` plus the manual check in Step 6, which is the only thing standing between this change and the student-facing page.

`className` is the seam: the caller supplies its own layout. `Flashcard` passes the flip container's grid-cell and backface classes; `StudentPreview` (Task 3) passes a minimum height.

Neither file needs `"use client"`. They use no hooks, exactly like `InlineMarkup`, and get pulled into the client bundle by whichever client component imports them.

- [ ] **Step 1: Create `components/CardFront.tsx`**

```tsx
import { formatCardDate } from "@/lib/format";
import type { CardContent } from "@/lib/card-resolution";
import { cn } from "@/lib/utils";
import { InlineMarkup } from "@/components/InlineMarkup";
import {
  accentBarClass,
  accentBarStyle,
  cardDateLabel,
  cardEyebrow,
  cardHeaderRow,
  cardPanel,
  cardSubjectPill,
} from "@/components/card-styles";

// `className` is how the caller supplies its own layout: the flip container
// passes backface and grid-cell classes, the admin preview passes a minimum
// height. Neither belongs to the face itself.
export function CardFront({
  card,
  className,
}: {
  card: CardContent;
  className?: string;
}) {
  return (
    <div className={cn(cardPanel, className)}>
      <span className={accentBarClass} style={accentBarStyle} />
      <div className={cardHeaderRow}>
        <span className={cardDateLabel}>{formatCardDate(card.date)}</span>
        {card.subject && (
          <span className={cardSubjectPill}>{card.subject}</span>
        )}
      </div>
      {card.usage && (
        <div className="mb-1.5 font-[family-name:var(--card-font-serif)] text-xs italic tracking-[0.3px] text-[var(--card-or)]">
          {card.usage}
        </div>
      )}
      <div className={cn("mb-2", cardEyebrow)}>Say it in French</div>
      <div className="flex-1">
        <p className="font-[family-name:var(--card-font-serif)] text-2xl leading-snug text-[var(--card-ink)]">
          {card.englishPrompt}
        </p>
        {card.hint && (
          <p className="mt-4 whitespace-pre-line font-[family-name:var(--card-font-serif)] text-sm italic text-[var(--card-moss)]">
            <InlineMarkup text={card.hint} />
          </p>
        )}
      </div>
      <div className="mt-4 text-center font-[family-name:var(--card-font-serif)] text-xs italic text-[#b0a488]">
        tap to reveal the answer
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `components/CardBack.tsx`**

The idiom box was an inline IIFE inside `Flashcard`'s `.map()`. It becomes a named component — same output, readable at a glance.

```tsx
import { formatCardDate } from "@/lib/format";
import type { CardContent } from "@/lib/card-resolution";
import { cn } from "@/lib/utils";
import { InlineMarkup } from "@/components/InlineMarkup";
import { splitIdiom } from "@/lib/idiom";
import { isIdiomSection } from "@/lib/sections";
import {
  accentBarClass,
  accentBarStyle,
  cardDateLabel,
  cardEyebrow,
  cardHeaderRow,
  cardPanelBack,
  cardProse,
  cardSectionHeading,
  cardSubjectPill,
} from "@/components/card-styles";

function IdiomBox({ body }: { body: string }) {
  const { expression, meaning } = splitIdiom(body);

  return (
    <div className="rounded-r-lg border-l-[3px] border-[var(--card-or)] bg-[#fbf1e2] p-3.5">
      {expression && (
        <div className="font-[family-name:var(--card-font-serif)] text-[19px] italic leading-snug text-[var(--card-rouge)]">
          <InlineMarkup text={expression} />
        </div>
      )}
      {meaning && (
        <div className="mt-1 whitespace-pre-line font-[family-name:var(--card-font-serif)] text-[15px] leading-relaxed text-[var(--card-ink)]">
          <InlineMarkup text={meaning} />
        </div>
      )}
    </div>
  );
}

export function CardBack({
  card,
  className,
}: {
  card: CardContent;
  className?: string;
}) {
  return (
    <div className={cn(cardPanelBack, className)}>
      <span className={accentBarClass} style={accentBarStyle} />
      <div className={cardHeaderRow}>
        <span className={cardDateLabel}>{formatCardDate(card.date)}</span>
        {card.subject && (
          <span className={cardSubjectPill}>{card.subject}</span>
        )}
      </div>
      <div className={cn("mb-1", cardEyebrow)}>The answer</div>
      <p className="mb-5 font-[family-name:var(--card-font-serif)] text-2xl leading-snug text-[var(--card-bleu)]">
        {card.frenchAnswer}
      </p>
      {card.sections
        .filter((section) => section.body.trim() !== "")
        .map((section, index) => (
          <div key={index} className="mb-4 last:mb-0">
            {section.title && (
              <h4 className={cardSectionHeading}>{section.title}</h4>
            )}
            {isIdiomSection(section.title) ? (
              <IdiomBox body={section.body} />
            ) : (
              <p className={cardProse}>
                <InlineMarkup text={section.body} />
              </p>
            )}
          </div>
        ))}
    </div>
  );
}
```

- [ ] **Step 3: Replace `components/Flashcard.tsx` entirely**

What is left is the flip container and the button. Every import the faces took with them is gone.

```tsx
"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import type { CardContent } from "@/lib/card-resolution";
import { CardFront } from "@/components/CardFront";
import { CardBack } from "@/components/CardBack";

export function Flashcard({ card }: { card: CardContent }) {
  const [flipped, setFlipped] = useState(false);

  return (
    <div className="mx-auto w-full max-w-[560px]">
      <div
        className="relative w-full cursor-pointer [perspective:2000px]"
        onClick={() => setFlipped((value) => !value)}
      >
        <motion.div
          className="grid min-h-[460px] w-full grid-cols-1"
          animate={{ rotateY: flipped ? 180 : 0 }}
          transition={{ duration: 0.6, ease: [0.4, 0.15, 0.2, 1] }}
          style={{ transformStyle: "preserve-3d" }}
        >
          <CardFront
            card={card}
            className="col-start-1 row-start-1 [backface-visibility:hidden]"
          />
          <CardBack
            card={card}
            className="col-start-1 row-start-1 [backface-visibility:hidden] [transform:rotateY(180deg)]"
          />
        </motion.div>
      </div>

      <div className="mt-6 flex justify-center">
        <button
          onClick={(event) => {
            event.stopPropagation();
            setFlipped((value) => !value);
          }}
          className="rounded-full border border-[var(--card-bleu)] bg-[var(--card-bleu)] px-6 py-2.5 font-[family-name:var(--card-font-serif)] text-sm text-white transition-colors hover:bg-[#0d3f6b]"
        >
          Flip card
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both clean. Lint catches any import left behind in `Flashcard.tsx`.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: all existing tests pass. None of them touch these components; this confirms nothing else broke.

- [ ] **Step 6: Manual check — the student card is unchanged**

This is the gate for the whole task.

```bash
# Find a group slug and a date that has a card:
npx prisma studio        # or:
echo "SELECT slug FROM 'Group';" | npx prisma db execute --schema prisma/schema.prisma --stdin
npm run dev
```

Open `/g/<slug>` and confirm, against the card as it looked before this task:

- the front shows date, subject pill, usage, the English prompt, the hint with its bold rendered, and "tap to reveal the answer"
- clicking the card flips it, and the Flip card button flips it
- the back shows the French answer and every section in order
- the Idiom of the day section is in the gold box, expression above meaning
- a section with an empty body does not appear

- [ ] **Step 7: Commit**

```bash
git add components/CardFront.tsx components/CardBack.tsx components/Flashcard.tsx
git commit -m "refactor: split the flashcard into its two faces"
```

---

### Task 3: The preview component

**Files:**
- Modify: `components/card-styles.ts` (add one export)
- Modify: `components/admin/CardEditor.tsx:26-27` (drop the local `panelLabel`, import it instead)
- Create: `components/admin/StudentPreview.tsx`

**Interfaces:**
- Consumes: `CardFront`, `CardBack` from Task 2; `toPreviewContent` from Task 1; `CardInput` from `@/app/actions`
- Produces: `StudentPreview({ values }: { values: CardInput })`

`panelLabel` is currently a module-local const at the top of `CardEditor.tsx`. The preview needs the same style for its own label, so it moves to `card-styles.ts` — which exists for exactly this.

Both faces get `min-h-[460px]`. On the student page the flip container supplies that height; without it here the preview's proportions would be wrong on short cards, which are the ones where proportion is most visible.

- [ ] **Step 1: Move `panelLabel` into `components/card-styles.ts`**

Append to the end of the file:

```ts
// The small caps label above a panel in the admin editor — "Front", "Back",
// "As the student sees it". Lives here rather than in CardEditor because the
// preview needs it too.
export const panelLabel =
  "mb-2 font-[family-name:var(--card-font-mono)] text-[11px] uppercase tracking-[2px] text-[var(--color-ink-muted)]";
```

- [ ] **Step 2: Delete the local copy in `CardEditor.tsx`**

Remove these three lines (currently lines 26-27, just above `export function CardEditor`):

```ts
const panelLabel =
  "mb-2 font-[family-name:var(--card-font-mono)] text-[11px] uppercase tracking-[2px] text-[var(--color-ink-muted)]";
```

Then add `panelLabel` to the existing import from `@/components/card-styles` in that file, keeping the list alphabetical:

```tsx
import {
  accentBarClass,
  accentBarStyle,
  cardDateLabel,
  cardEyebrow,
  cardHeaderRow,
  cardPanel,
  cardPanelBack,
  cardSubjectPill,
  panelLabel,
} from "@/components/card-styles";
```

- [ ] **Step 3: Create `components/admin/StudentPreview.tsx`**

```tsx
import type { CardInput } from "@/app/actions";
import { CardBack } from "@/components/CardBack";
import { CardFront } from "@/components/CardFront";
import { panelLabel } from "@/components/card-styles";
import { toPreviewContent } from "@/lib/card-preview";

// No state, no effect, no debounce: `values` is already updated on every
// keystroke by the editor, and this is a pure function of it. Sticky on
// desktop so it stays in view while she scrolls the form beside it.
export function StudentPreview({ values }: { values: CardInput }) {
  const card = toPreviewContent(values);

  return (
    <aside className="lg:sticky lg:top-8">
      <div className={panelLabel}>As the student sees it</div>
      <div className="flex flex-col gap-6">
        {/* The flip container gives the faces their height on the student
            page. Here they need it themselves, or a short card previews at
            the wrong proportions. */}
        <CardFront card={card} className="min-h-[460px]" />
        <CardBack card={card} className="min-h-[460px]" />
      </div>
    </aside>
  );
}
```

- [ ] **Step 4: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both clean. `StudentPreview` is not rendered anywhere yet; this confirms it compiles.

- [ ] **Step 5: Commit**

```bash
git add components/card-styles.ts components/admin/CardEditor.tsx components/admin/StudentPreview.tsx
git commit -m "feat: add the student preview component"
```

---

### Task 4: Render the preview in the editor

**Files:**
- Modify: `components/admin/CardEditor.tsx` (the editing-stage `return`, currently lines 238-349)

**Interfaces:**
- Consumes: `StudentPreview` from Task 3
- Produces: nothing new

After this task the feature works end to end on mobile — the preview sits under the Delete card button, updating as she types. Desktop side-by-side needs Task 5, because the page shell still clamps the width to `max-w-xl`.

Note the `compose` stage returns early at line 173 and is untouched: no card exists yet there, so there is nothing to preview.

- [ ] **Step 1: Import `StudentPreview`**

Add to the imports at the top of `CardEditor.tsx`:

```tsx
import { StudentPreview } from "@/components/admin/StudentPreview";
```

- [ ] **Step 2: Wrap the form and add the preview**

The editing-stage return currently opens:

```tsx
  return (
    <form
      onSubmit={handleSubmit}
      className="mx-auto flex w-full max-w-[560px] flex-col gap-6"
    >
```

Replace that opening with a grid wrapper, moving the width classes off the form and onto it:

```tsx
  return (
    // 1152 − 32 of gap = 1120, halved = 560 — the exact width the form is
    // today, so the editor column does not move when the preview appears
    // beside it.
    <div className="mx-auto grid w-full max-w-[560px] gap-8 lg:max-w-[1152px] lg:grid-cols-2 lg:items-start">
      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
```

Leave every child of the form exactly as it is. Then find the closing `</form>` at the very end of the return (after the `{error && (...)}` block) and replace it with:

```tsx
      </form>

      <StudentPreview values={values} />
    </div>
  );
}
```

Re-indent the form's children by two spaces so the file stays consistent — `npm run lint` will not catch indentation, so do it by eye.

- [ ] **Step 3: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both clean.

- [ ] **Step 4: Manual check — the preview is live**

```bash
npm run dev
```

On `/admin`, pick a date that has a card (or generate one), then confirm:

1. The preview appears below the Delete card button, front above back.
2. Typing in the English sentence updates the preview's front on each keystroke.
3. Typing `**bold**` in a section body shows **bold** in the preview and literal asterisks in the editor. *This is the whole point of the feature.*
4. The section titled "Idiom of the day" renders in the gold box; renaming it to anything else removes the box.
5. Clearing a section's body makes it vanish from the preview while its editor row stays put.
6. Clearing the Subject removes the pill from both faces rather than leaving an empty one.
7. Deleting the card returns to the compose stage and the preview disappears.
8. On a date with no card, the compose stage shows no preview at all. Filling in
   the three fields and pressing Generate makes one appear once it succeeds.

- [ ] **Step 5: Commit**

```bash
git add components/admin/CardEditor.tsx
git commit -m "feat: show the student preview under the editor"
```

---

### Task 5: Widen the admin pages for the side-by-side layout

**Files:**
- Modify: `app/admin/page.tsx:41-80`
- Modify: `app/admin/[slug]/page.tsx:42-77`

**Interfaces:**
- Consumes: nothing new
- Produces: nothing new

Both pages wrap everything in `mx-auto max-w-xl`, which clamps Task 4's grid. Each container widens on `lg`, and every sibling of `CardEditor` gets its own narrow wrapper.

The siblings cannot keep plain `mx-auto`: centring a 560px block inside a 1152px container puts it over the seam between the two columns, so the date picker would float into the middle with the editor starting under its left half. They are left-aligned on `lg` instead, sharing the editor column's left edge.

The repeated class is `mx-auto w-full max-w-[560px] lg:mx-0`. Below `lg` the container is itself `max-w-xl`, so `mx-auto` centres as it does today and `lg:mx-0` never applies. It is `max-w-[560px]` rather than `max-w-xl` because 560 is the editor column's exact width; `max-w-xl` is 576 and would sit 8px proud of it.

`AdminDatePicker`, `GroupList` and `NewGroupForm` accept no `className` prop, so each is wrapped in a `div`. None of those three components changes.

- [ ] **Step 1: Widen `app/admin/page.tsx`**

Change the container on line 41:

```tsx
      <div className="mx-auto max-w-xl lg:max-w-[1152px]">
```

Change the heading row on line 42:

```tsx
        <div className="mx-auto mb-8 flex w-full max-w-[560px] items-center justify-between lg:mx-0">
```

Wrap `AdminDatePicker` (line 56):

```tsx
        <div className="mx-auto w-full max-w-[560px] lg:mx-0">
          <AdminDatePicker basePath="/admin" selected={selected} />
        </div>
```

Wrap the whole Groups block — the `h2`, `GroupList` and `NewGroupForm` (lines 66-79) — in one narrow wrapper:

```tsx
        <div className="mx-auto w-full max-w-[560px] lg:mx-0">
          <h2 className="mb-4 mt-12 font-[family-name:var(--font-display)] text-2xl italic text-[var(--color-ink)]">
            Groups
          </h2>
          <GroupList
            groups={groups.map((g) => ({
              id: g.id,
              name: g.name,
              slug: g.slug,
              cardCount: g._count.cards,
            }))}
            onDelete={deleteGroup}
          />

          <NewGroupForm onSubmit={createGroup} />
        </div>
```

Leave `<CardEditor>` itself untouched — it is the one child allowed the full width.

- [ ] **Step 2: Widen `app/admin/[slug]/page.tsx`**

Change the container on line 42:

```tsx
      <div className="mx-auto max-w-xl lg:max-w-[1152px]">
```

Change the `h1` on line 43:

```tsx
        <h1 className="mx-auto mb-8 w-full max-w-[560px] font-[family-name:var(--font-display)] text-3xl italic text-[var(--color-ink)] lg:mx-0">
          {group.name} overrides
        </h1>
```

Wrap `AdminDatePicker` (line 47):

```tsx
        <div className="mx-auto w-full max-w-[560px] lg:mx-0">
          <AdminDatePicker basePath={`/admin/${slug}`} selected={selected} />
        </div>
```

Wrap the overrides block — the `h2` and the `ul` (lines 57-76) — in one narrow wrapper:

```tsx
        <div className="mx-auto w-full max-w-[560px] lg:mx-0">
          <h2 className="mb-4 mt-12 font-[family-name:var(--font-display)] text-2xl italic text-[var(--color-ink)]">
            Existing overrides
          </h2>
          <ul className="flex flex-col gap-1 font-[family-name:var(--font-body)] text-sm text-[var(--color-ink-muted)]">
            {group.cards.map((card) => {
              const cardDate = card.date.toISOString().slice(0, 10);
              return (
                <li key={card.id}>
                  <Link
                    href={`/admin/${slug}?date=${cardDate}`}
                    className="text-[var(--color-accent)] underline"
                  >
                    {cardDate}
                  </Link>{" "}
                  — {card.frenchAnswer}
                </li>
              );
            })}
            {group.cards.length === 0 && <li>No overrides yet.</li>}
          </ul>
        </div>
```

- [ ] **Step 3: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both clean.

- [ ] **Step 4: Manual check — both breakpoints, both pages**

```bash
npm run dev
```

At a window width of **1280px**, on `/admin` and on `/admin/<a group slug>`:

1. The preview sits to the right of the editor, not below it.
2. Scrolling the editor leaves the preview in view — it sticks 32px from the top.
3. The date picker, the headings and the Groups/overrides lists are 560px wide and share a left edge with the editor column. Nothing floats to the middle.

Then narrow the window to **375px** and confirm both pages look exactly as they did before this work, with the preview stacked under the Delete card button.

- [ ] **Step 5: Commit**

```bash
git add app/admin/page.tsx "app/admin/[slug]/page.tsx"
git commit -m "feat: put the preview beside the editor on a wide screen"
```

---

### Task 6: Full verification

**Files:** none — this task only runs things.

- [ ] **Step 1: Run everything CI runs, in CI's order**

```bash
npx prisma generate && npm run lint && npx tsc --noEmit && npm test && npm run build
```

Expected: all five clean. Do not proceed on a failure; fix it and re-run.

- [ ] **Step 2: Final check on the student page**

```bash
npm run dev
```

Open `/g/<slug>` once more and confirm the card is unchanged — front, back, flip, idiom box. Task 2 is where a regression would have entered; this is the last chance to catch it before the work is deployable.

- [ ] **Step 3: Report**

State plainly which commands were run and what they returned. If any manual check was skipped, say which and why.

---

## Notes for the implementer

**Do not add jsdom or React Testing Library.** It is tempting when three of six tasks have no automated test. The spec rules it out deliberately: this repo tests pure logic in `lib/` and verifies UI by running it, and changing that is a bigger decision than this feature gets to make.

**Do not "fix" the untrimmed scalars** in `app/actions.ts` while you are in there. The preview mirrors the save path on purpose. Making both trim is a reasonable change and a separate one.

**Do not change what students see.** If a manual check on `/g/[slug]` shows any difference, stop and reconcile against the original `Flashcard.tsx` in git history (`git show 931eb91:components/Flashcard.tsx`).
