# Deck In-Place Flip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Vocabulaire deck's full-screen `FlashcardViewer` overlay with a flip on the tile itself — front unchanged, back in the app's lilac accent with white text, and a *Recto*/*Verso* pill in each face's top right.

**Architecture:** A new `components/student/DeckCard.tsx` draws one tile as two faces sharing a single CSS grid cell, rotated by framer-motion. `DeckTab` keeps the grid, the sort chips and the add sheet, and owns the flip state as a `Set<string>` of card ids. `FlashcardViewer` is deleted along with the seven dictionary keys only it used.

**Tech Stack:** Next.js App Router, React 19 client components, framer-motion, Tailwind v4 (no config file — tokens are CSS custom properties in `app/globals.css`), TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-07-deck-in-place-flip-design.md`

---

## How this plan is verified

**Read this before Task 1.** This change adds no pure function to `lib/`, so it adds no Vitest file — that is the spec's stated decision, not an oversight. The convention in `CLAUDE.md` is that rules in `lib/` are unit-tested and components are not.

The red/green loop here is **the TypeScript compiler**, and it is a real one because `lib/strings.ts` declares one `Strings` type that both the French and English dictionaries are annotated as. Deleting a key from the type surfaces every consumer by name; deleting it from only one dictionary is a compile error naming the key. Several tasks below deliberately run `npx tsc --noEmit` expecting a **failure** first.

Full verification, in CI's order, is Task 6.

## File structure

| File | Change | Responsibility after this change |
|---|---|---|
| `components/card-styles.ts` | Modify (append) | Gains `deckFacePill`, the shared pill skin both faces draw |
| `components/student/DeckCard.tsx` | **Create** | One tile: two faces, the flip, the delete confirm, the live region |
| `components/student/DeckTab.tsx` | Modify | The grid, the sort chips, the add sheet, and the flip state for all cards |
| `components/student/FlashcardViewer.tsx` | **Delete** | — |
| `lib/strings.ts` | Modify | Drops seven overlay-only keys, gains `flipCard` |
| `components/ui/TrashIcon.tsx` | Modify (comment) | Unchanged code; a comment referring to the deleted file is removed |
| `app/g/[slug]/page.tsx` | Modify (comment) | Unchanged props; one comment describes the old handler |

Task order keeps every commit compiling: additive work first (Task 1, Task 2), then the swap (Task 3, Task 4), then the deletions the swap makes safe (Task 5).

---

### Task 1: The face pill's shared skin

**Files:**
- Modify: `components/card-styles.ts` (append after `cardRevisionChip`, which ends at line 48)

- [ ] **Step 1: Add the constant**

Insert immediately after the `cardRevisionChip` export (line 48) and before `export const cardEyebrow`:

```ts
// The small pill in a deck tile's top right saying which face is showing —
// "Recto" on the paper front, "Verso" on the lilac back.
//
// Colour is deliberately absent, the same split cardSubjectPill makes: the two
// faces sit on opposite surfaces, so each call site supplies its own border and
// text colour. A version of this with a colour baked in would be overridden on
// one of the two faces every time.
//
// Here rather than local to DeckCard because two faces draw it and a second
// copy is a second thing to keep in step — the reason cardRevisionChip above
// gives for itself.
export const deckFacePill =
  "shrink-0 rounded-full border px-2 py-0.5 font-[family-name:var(--card-font-mono)] text-[10px] uppercase tracking-wider";
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: exits 0 with no output. (An unused export is not an error; `eslint` in this repo does not flag unused exports either.)

- [ ] **Step 3: Commit**

```bash
git add components/card-styles.ts
git commit -m "Add the deck face pill's shared skin

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 2: The `flipCard` dictionary key

**Files:**
- Modify: `lib/strings.ts` — the `deck` block of the `Strings` type (lines 187-212), the French `deck` object (~line 827), the English `deck` object (~line 1387)

This task only **adds**. The seven keys the overlay used are removed in Task 5, once nothing references them.

- [ ] **Step 1: Add the key to the type**

In the `deck:` block of the `Strings` type, insert `flipCard` immediately above the existing `open:` line, and replace the (currently absent) comment above `frontLabel`:

```ts
      // The stretched button covering a tile. It names the card, because a
      // grid of twenty of these would otherwise read as twenty identical
      // "Flip the card" tab stops with nothing to tell them apart.
      flipCard: (front: string) => string;
      open: (front: string) => string;
```

And replace these two lines:

```ts
      frontLabel: string;
      backLabel: string;
```

with:

```ts
      // Two consumers each: the add form's field labels, and the pill in a
      // deck tile's top right. The same words for the same idea — a second
      // pair would be two strings both meaning "this is the front of a card"
      // with nothing keeping them in step.
      frontLabel: string;
      backLabel: string;
```

- [ ] **Step 2: Add the French value**

In the French `deck` object, insert above the existing `open:` line:

```ts
      flipCard: (front) => `Retourner la carte « ${front} »`,
```

Note the ` ` non-breaking spaces inside the guillemets. That is the existing convention in this file — see `open` directly below it, and `deleteConfirm`.

- [ ] **Step 3: Add the English value**

In the English `deck` object, insert above the existing `open:` line:

```ts
      flipCard: (front) => `Flip the card “${front}”`,
```

The curly quotes are typed characters, matching `open` directly below it.

- [ ] **Step 4: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: exits 0. If it reports `Property 'flipCard' is missing in type`, one of the two dictionaries did not get the value — that is the type doing its job.

- [ ] **Step 5: Commit**

```bash
git add lib/strings.ts
git commit -m "Name the deck tile's flip control in both dictionaries

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 3: `DeckCard`, the tile

**Files:**
- Create: `components/student/DeckCard.tsx`

Nothing imports it yet. Task 4 wires it in.

- [ ] **Step 1: Write the component**

Create `components/student/DeckCard.tsx` with exactly this content:

```tsx
"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { TrashIcon } from "@/components/ui/TrashIcon";
import { cardDateLabel, deckFacePill } from "@/components/card-styles";
import { formatLongDate } from "@/lib/format";
import { getStrings } from "@/lib/strings";
import type { Locale } from "@/lib/i18n";
import type { FlashcardRow } from "@/lib/flashcards";
import { cn } from "@/lib/utils";

// The two faces share ONE grid cell, so they are one box measured once —
// flipping a card therefore moves nothing else in the grid. 160px is the height
// the tile already had and the reason is unchanged: the word is centred in
// whatever the date leaves, and at the old 132px there was not enough left
// under the date for the centring to read as centring.
const faceClass =
  "col-start-1 row-start-1 flex min-h-[160px] flex-col rounded-2xl border p-4 shadow-[var(--card-shadow)] [backface-visibility:hidden]";

// `break-words` because this is text-2xl inside a tile as narrow as ~140px on a
// two-column phone grid, and a long French infinitive would otherwise run out
// of it. Colour is per-face: ink on the paper front, white on the lilac back.
const faceWord =
  "flex flex-1 items-center justify-center break-words px-1 text-center font-[family-name:var(--card-font-serif)] text-2xl font-bold";

// The back's own control skin. tileActionClass is the card palette's blue on
// cream and is illegible on lilac, so this is its sibling rather than an
// override of it — and its focus ring offsets against the accent it sits on.
const backControl = cn(
  "flex h-9 items-center justify-center rounded-full px-3 font-[family-name:var(--card-font-serif)] text-xs text-white transition-colors duration-150 hover:bg-white/20 disabled:opacity-50 motion-reduce:transition-none",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-accent)]",
);

// One card in the deck grid, flipping in place.
//
// It replaced a full-screen overlay on 2026-08-07, and the removal was a net
// deletion: the overlay's focus trap, its document keydown listener and its
// Space/Enter guard all existed because a role="dialog" div is neither
// focusable nor activatable by the browser. This is a real <button>, so the
// browser does all three.
export function DeckCard({
  card,
  flipped,
  locale,
  onFlip,
  onDelete,
}: {
  card: FlashcardRow;
  // Controlled by DeckTab, which holds every tile's flip in one Set keyed by
  // card id — so a re-sort can clear them all, and so a card that moves in the
  // grid keeps its own face. The old overlay keyed on an INDEX into the ordered
  // array, which is why it had to close itself whenever the sort changed.
  flipped: boolean;
  // A client component takes the LOCALE, never a resolved Strings object: that
  // object holds functions and React cannot serialize a function across the
  // server/client boundary. See lib/strings.ts.
  locale: Locale;
  // Stamping lastViewedAt happens in DeckTab's handler, NOT here — see its
  // `toggleFlip`. This component only reports that the reader pressed the card.
  onFlip: () => void;
  onDelete: () => Promise<void>;
}) {
  const t = getStrings(locale).student.deck;
  // framer-motion does NOT read prefers-reduced-motion by itself — the
  // `motion-reduce:` utilities elsewhere in this file are CSS and reach none of
  // it. Asking for it and zeroing the duration is the equivalent.
  const reduceMotion = useReducedMotion();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  // Turning a card back to its front puts an armed delete away with it. A
  // half-pressed confirm left cocked would fire on the next reveal, from a
  // gesture the reader made about something else.
  //
  // Adjusted during render rather than in an effect, the shape NewPageForm and
  // PageEditor already use: react-hooks/set-state-in-effect rejects the effect
  // form, and an effect would paint the armed state for one frame first.
  const [lastFlipped, setLastFlipped] = useState(flipped);
  if (lastFlipped !== flipped) {
    setLastFlipped(flipped);
    if (!flipped) setConfirming(false);
  }

  async function remove() {
    setBusy(true);
    try {
      await onDelete();
    } finally {
      // The row leaves through the grid's AnimatePresence exit, because
      // deleteFlashcard revalidates — so this component may already be
      // unmounting. Resetting anyway costs nothing and is correct if the
      // action failed and the tile is still here.
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <div
      className={cn(
        "relative h-full [perspective:2000px]",
        // The ring goes on the FRAME and is scoped to the flip button by its
        // data attribute. Two reasons: the flip button's own box is a sr-only
        // label, so the browser's outline would ring nothing a sighted keyboard
        // user could see; and an unscoped has-[button:...] would light the whole
        // tile when the small trash inside it took focus, which already draws
        // its own ring. PageTile's has-[a:focus-visible] is the precedent.
        "has-[[data-flip]:focus-visible]:rounded-2xl has-[[data-flip]:focus-visible]:ring-2 has-[[data-flip]:focus-visible]:ring-[var(--card-bleu)] has-[[data-flip]:focus-visible]:ring-offset-2 has-[[data-flip]:focus-visible]:ring-offset-[var(--card-paper)]",
      )}
    >
      <motion.div
        className="grid h-full w-full grid-cols-1"
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={{
          duration: reduceMotion ? 0 : 0.5,
          ease: [0.4, 0.15, 0.2, 1],
        }}
        style={{ transformStyle: "preserve-3d" }}
      >
        {/* Each face leaves the accessibility tree when it is the one nobody is
            looking at. `backface-visibility` hides pixels, not content: without
            this a screen reader announces the answer beside the question, which
            is the whole flip-to-reveal design and the revision ordering built
            on it. */}
        <div
          aria-hidden={flipped}
          className={cn(
            faceClass,
            "border-[var(--card-line)] bg-[var(--card-paper)]",
          )}
        >
          <div className="flex items-start justify-between gap-2">
            <span className={cardDateLabel}>
              {formatLongDate(card.createdAt, locale)}
            </span>
            <span
              className={cn(
                deckFacePill,
                "border-[var(--card-line)] text-[var(--card-bleu)]",
              )}
            >
              {t.frontLabel}
            </span>
          </div>
          {/* The front only. A tile that showed the answer would make the deck
              a glossary and the revision order meaningless. */}
          <span className={cn(faceWord, "text-[var(--card-ink)]")}>
            {card.front}
          </span>
        </div>

        {/* The lilac back. This is the app palette (--color-accent) landing on a
            card object, which is the first time the two palettes meet on one
            surface — a deliberate crossing, recorded in the spec, not a merge:
            neither set is renamed or dropped. White on #AC5395 is 4.75:1, which
            is the measurement that value was chosen for.

            The border matches the fill rather than using --card-line: a cream
            line on lilac reads as an artefact.

            pb-12 rather than the face's p-4 reserves the band the delete
            controls sit in, so a long answer never runs under the trash. */}
        <div
          aria-hidden={!flipped}
          className={cn(
            faceClass,
            "border-[var(--color-accent)] bg-[var(--color-accent)] pb-12 [transform:rotateY(180deg)]",
          )}
        >
          <div className="flex justify-end">
            <span className={cn(deckFacePill, "border-white/50 text-white")}>
              {t.backLabel}
            </span>
          </div>
          <span className={cn(faceWord, "text-white")}>{card.back}</span>
          {card.note && (
            <p className="line-clamp-2 break-words px-1 text-center font-[family-name:var(--card-font-serif)] text-xs italic text-white/80">
              {card.note}
            </p>
          )}
        </div>
      </motion.div>

      {/* A real button covering the tile, rather than a button WRAPPING the two
          faces. ARIA makes a button's children presentational, so a wrapper
          would expose the whole card as its own accessible name — front, back
          and note all dropped, and the aria-hidden pair above rendered dead.
          That is the trap the deleted FlashcardViewer recorded after trying
          role="button" and reverting it.

          Space and Enter activate this natively, which is why nothing here
          needs the document keydown listener the overlay carried. */}
      <button
        type="button"
        data-flip
        onClick={onFlip}
        className="absolute inset-0 z-10 cursor-pointer rounded-2xl focus:outline-none"
      >
        <span className="sr-only">{t.flipCard(card.front)}</span>
      </button>

      {/* OUTSIDE the flip wrapper, not inside the back face. The motion.div
          carries a transform and so opens a stacking context: a z-index on a
          control inside it is resolved against its siblings in that context and
          can never rise above the flip button, which is a sibling of the
          motion.div itself. Sitting out here, z-20 does what it reads as.

          It has no entrance animation, deliberately. The rule that a surface
          must animate covers a popover opening and a row joining a list; this
          is neither, and adding a fourth keyframe is the thing that rule
          forbids. */}
      {flipped && (
        <div className="absolute bottom-3 right-3 z-20 flex items-center gap-1.5">
          {confirming ? (
            <>
              <button
                type="button"
                onClick={() => void remove()}
                disabled={busy}
                className={backControl}
              >
                {t.deleteConfirm}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={busy}
                className={backControl}
              >
                {t.deleteCancel}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              aria-label={t.delete}
              className={cn(backControl, "w-9 px-0")}
            >
              <TrashIcon />
            </button>
          )}
        </div>
      )}

      {/* The answer, spoken when it is revealed. The two faces cannot do this
          themselves: toggling `aria-hidden` is an attribute change, and a live
          region's default `aria-relevant` covers additions and text — iOS
          VoiceOver commonly says nothing at all, and that is the device most of
          these students read on. Here the node is genuinely ADDED on the flip,
          which is the trigger every screen reader honours.

          The cost, stated plainly: while flipped, the answer is in the tree
          twice — here and on the face, which aria-hidden has just admitted.
          There is no way to have a region announce without also being readable.
          The note is deliberately NOT repeated: it is on the face, and it is
          the long half. */}
      <div className="sr-only" aria-live="polite">
        {flipped && <p>{card.back}</p>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles and lints**

Run: `npx tsc --noEmit && npm run lint`
Expected: both exit 0. `DeckCard` is not yet imported anywhere, which is fine.

- [ ] **Step 3: Commit**

```bash
git add components/student/DeckCard.tsx
git commit -m "Draw a deck card as two faces that flip in place

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 4: Wire `DeckTab` to `DeckCard` and drop the overlay

**Files:**
- Modify: `components/student/DeckTab.tsx`
- Delete: `components/student/FlashcardViewer.tsx`

- [ ] **Step 1: Replace the imports**

In `components/student/DeckTab.tsx`, replace lines 9 and 11:

```ts
import { FlashcardViewer } from "@/components/student/FlashcardViewer";
```

with:

```ts
import { DeckCard } from "@/components/student/DeckCard";
```

and replace:

```ts
import { cardDateLabel, cardFocusRing, emptyStateText } from "@/components/card-styles";
import { formatLongDate } from "@/lib/format";
```

with:

```ts
import { cardFocusRing, emptyStateText } from "@/components/card-styles";
```

`cardDateLabel` and `formatLongDate` moved to `DeckCard` with the face that draws the date. `cardFocusRing` stays — the `+` button still uses it.

- [ ] **Step 2: Replace the state and the two handlers**

Replace this block (currently lines 50-90, from `const [sort, setSort]` through the closing brace of `show`):

```ts
  const [sort, setSort] = useState<FlashcardSort>("added");
  const [seed, setSeed] = useState(1);
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);

  function chooseSort(next: FlashcardSort) {
    // ... existing comment block, keep it ...
    if (next === "random") setSeed((current) => current + 1);
    setSort(next);
    // The open card's index refers to the OLD order. Closing is honest;
    // silently showing a different card is not.
    setOpenIndex(null);
  }

  const ordered = orderFlashcards(cards, sort, seed);

  // ... existing `show` comment block ...
  function show(index: number) {
    setOpenIndex(index);
    const card = ordered[index];
    if (card && !isTeacher) void onViewed(card.id);
  }
```

with:

```ts
  const [sort, setSort] = useState<FlashcardSort>("added");
  const [seed, setSeed] = useState(1);
  // Which cards are face up, by ID and not by index. Here rather than inside
  // each tile so a re-sort can clear them all in one line, and so clearing them
  // does not mean remounting a tile and throwing away its own delete-confirm
  // state as a side effect of an unrelated action.
  //
  // Keying on the id is also what lets a flip survive a re-sort at all. The
  // deleted overlay held an `openIndex` into the ordered array, so changing the
  // sort put a DIFFERENT card behind the same number and it had to close.
  // `new Set<string>()` with the argument spelled out, not a bare `new Set()`:
  // an empty Set literal infers Set<unknown>, and contextual inference through
  // SetStateAction's union does not reliably rescue it.
  const [flippedIds, setFlippedIds] = useState<ReadonlySet<string>>(
    new Set<string>(),
  );
  const [adding, setAdding] = useState(false);

  function chooseSort(next: FlashcardSort) {
    // Pressing Random again reshuffles, which is what a reader expects of it —
    // so the seed has to change. It is a COUNTER and not Math.random(), for
    // two reasons. The React Compiler's purity rule refuses an impure call
    // anywhere in a component's scope, invocation timing notwithstanding. And
    // a random seed generated in a state initialiser would differ across
    // hydration, ordering the deck one way in the HTML and another the moment
    // React took over. A counter has neither problem and costs nothing: the
    // orders it walks are arbitrary with respect to the cards, which is all
    // "random" has to mean here.
    if (next === "random") setSeed((current) => current + 1);
    setSort(next);
    // Every card goes back to its front. Nothing FORCES this any more — flips
    // key on the id, so they would survive the re-sort perfectly well. It is a
    // choice: sorting is a request for a fresh pass through the deck, and
    // twenty answers left face up defeats the thing the reader just asked for.
    setFlippedIds(new Set<string>());
  }

  const ordered = orderFlashcards(cards, sort, seed);

  // Revealing a card's answer is the one place lastViewedAt is stamped. It used
  // to fire on OPENING a card, when the deck was an overlay; the equivalent act
  // is now the flip to the back, and only that direction. This is stricter and
  // more honest — the timestamp feeds the "À réviser" ordering, and seeing the
  // question is not revising.
  //
  // A HANDLER and not an effect, deliberately. An effect keyed on the flipped
  // set would re-fire whenever its dependencies changed identity, and
  // `onViewed` is a bound server action whose identity this component does not
  // control — so a stamp could fire on renders caused by something else
  // entirely. Revealing a card is a click; treat it as one.
  //
  // Fired without awaiting: a dropped stamp costs one card's ordering, and a
  // blocked flip costs the feature. The action itself refuses the teacher, so
  // the isTeacher check here only avoids a request that would do nothing.
  function toggleFlip(id: string) {
    const revealing = !flippedIds.has(id);
    setFlippedIds((current) => {
      const next = new Set(current);
      if (revealing) next.add(id);
      else next.delete(id);
      return next;
    });
    if (revealing && !isTeacher) void onViewed(id);
  }

  // The card is gone, so its id must not stay in the set. Nothing reads a
  // stale id today — the card never comes back — but a set that only ever
  // grows is the kind of thing a later feature reads and is wrong about.
  async function removeCard(id: string) {
    await onDelete(id);
    setFlippedIds((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  }
```

- [ ] **Step 3: Replace the grid's tile with `DeckCard`**

Replace the whole `motion.li` body (currently lines 129-164) — from `<motion.li` to `</motion.li>` — with:

```tsx
            <motion.li
              key={card.id}
              layout={reduceMotion ? false : "position"}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={motionTransition}
            >
              {/* The `layout` transform lives on this <li>; the flip's rotateY
                  lives on a motion.div two levels inside DeckCard. Parent and
                  child, not the same node, so the two do not fight. */}
              <DeckCard
                card={card}
                flipped={flippedIds.has(card.id)}
                locale={locale}
                onFlip={() => toggleFlip(card.id)}
                onDelete={() => removeCard(card.id)}
              />
            </motion.li>
```

Note the `index` parameter of the `.map` is now unused. Change the map's signature from `{ordered.map((card, index) => (` to `{ordered.map((card) => (`.

- [ ] **Step 4: Delete the viewer's render block**

Remove this block entirely from the end of `DeckTab` (currently lines 223-234):

```tsx
      {openIndex !== null && (
        <FlashcardViewer
          cards={ordered}
          index={openIndex}
          locale={locale}
          onIndex={show}
          onClose={() => setOpenIndex(null)}
          onDelete={onDelete}
        />
      )}
```

- [ ] **Step 5: Delete the overlay**

```bash
git rm components/student/FlashcardViewer.tsx
```

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit`
Expected: exits 0. `DeckTab` no longer uses `t.open`, but the seven dead keys still exist in `lib/strings.ts` and an unused key is not an error — Task 5 removes them. If it fails, read the message: the likely cause is a stale `show(` or `openIndex` reference left behind in Step 2 or 3.

Run: `npm run lint`
Expected: exits 0. If it reports `'index' is defined but never used`, Step 3's map signature was not changed.

- [ ] **Step 7: Commit**

```bash
git add components/student/DeckTab.tsx components/student/FlashcardViewer.tsx
git commit -m "Flip a deck card in the grid and drop the overlay

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 5: Remove the seven dead keys and two stale comments

**Files:**
- Modify: `lib/strings.ts` — the `deck` block of the `Strings` type, and both `deck` objects
- Modify: `components/ui/TrashIcon.tsx:10-12`
- Modify: `app/g/[slug]/page.tsx:387-389`

- [ ] **Step 1: Remove the keys from the `Strings` type**

In the `deck:` block, delete these seven lines:

```ts
      open: (front: string) => string;
      flip: string;
      flipHint: string;
      previous: string;
      next: string;
      position: (index: number, total: number) => string;
      close: string;
```

`flipCard` (added in Task 2) sits directly above them and stays. `delete`, `deleteConfirm` and `deleteCancel` sit directly below them and stay — they moved to the back face.

- [ ] **Step 2: Run the compiler to see it name the survivors**

Run: `npx tsc --noEmit`
Expected: **FAIL**, with fourteen errors of the form `Object literal may only specify known properties, and 'open' does not exist in type` — seven in the French object and seven in the English one. This is the check working: the type is what finds every copy.

- [ ] **Step 3: Remove the French values**

In the French `deck` object, delete:

```ts
      open: (front) => `Ouvrir la carte « ${front} »`,
      flip: "Retourner",
      flipHint: "Retourner la carte",
      previous: "Carte précédente",
      next: "Carte suivante",
      position: (index, total) => `Carte ${index} sur ${total}`,
      close: "Fermer",
```

- [ ] **Step 4: Remove the English values**

In the English `deck` object, delete:

```ts
      open: (front) => `Open the card “${front}”`,
      flip: "Flip",
      flipHint: "Flip the card",
      previous: "Previous card",
      next: "Next card",
      position: (index, total) => `Card ${index} of ${total}`,
      close: "Close",
```

- [ ] **Step 5: Verify the compiler is clean**

Run: `npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 6: Fix the `TrashIcon` comment**

In `components/ui/TrashIcon.tsx`, delete lines 9-12 — the blank comment line and the three lines that begin `// FlashcardViewer keeps its own`. That file no longer exists, and `DeckCard` uses this shared icon.

The comment block should end at line 8 (`// it, rather than being copied.`) followed directly by `export function TrashIcon() {`.

- [ ] **Step 7: Fix the `page.tsx` comment**

In `app/g/[slug]/page.tsx`, replace lines 387-389:

```tsx
          // The bound ACTION, not an arrow — a closure cannot cross the
          // server/client boundary. DeckTab fires it without awaiting, from
          // the handler that makes a card current.
```

with:

```tsx
          // The bound ACTION, not an arrow — a closure cannot cross the
          // server/client boundary. DeckTab fires it without awaiting, from
          // the handler that turns a card to its answer.
```

No prop changes: `DeckTab`'s signature is unchanged.

- [ ] **Step 8: Verify**

Run: `npx tsc --noEmit && npm run lint`
Expected: both exit 0.

- [ ] **Step 9: Commit**

```bash
git add lib/strings.ts components/ui/TrashIcon.tsx "app/g/[slug]/page.tsx"
git commit -m "Retire the deck overlay's strings and two stale comments

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 6: Full verification

**Files:** none modified unless something fails.

- [ ] **Step 1: Run CI's sequence locally**

Run each in order, exactly as `.github/workflows/ci.yml` does:

```bash
npx prisma generate
npm run lint
npm run typecheck
npm test
npm run build
```

Expected: all five exit 0. `npm test` should report the existing suite passing, including `tests/lib/flashcard-order.test.ts` — untouched by this change, and the reason no new test file was added (this change puts no rule in `lib/`).

- [ ] **Step 2: Check it in the browser**

Run: `npm run dev`, open a student page with a claimed account, and go to the *Vocabulaire* tab. Confirm each of these:

1. A tile flips in place when clicked. Nothing else in the grid moves.
2. The back is lilac with white text; the note, if present, is small italic beneath the answer and clamps at two lines.
3. The pill in the top right reads *Recto* on the front and *Verso* on the back (or *Front*/*Back* on an English-first browser).
4. Two cards can be face up at the same time.
5. Pressing a sort chip turns every card back to its front.
6. The trash appears only on the back; pressing it swaps in *Supprimer ?* / *Annuler*; confirming removes the card and the row animates out.
7. Tab reaches each tile once and the whole tile draws a blue focus ring; Space and Enter flip it. Tabbing to the trash on a face-up card rings the trash alone, not the tile.
8. Flipping a card back to its front while its delete is armed puts the confirm away.

- [ ] **Step 3: Commit anything the checks forced**

If Steps 1-2 required no changes, there is nothing to commit and the work is done. Otherwise:

```bash
git add -A
git commit -m "Fix <what the check found> in the deck flip

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Not in this plan

Stated so a later reader knows these were considered and left, not missed:

- **`Flashcard.tsx` and the whiteboard's flip** share the missing `useReducedMotion` fault that `DeckCard` avoids. Fixing them is a separate change with its own surface to check.
- **`CLAUDE.md`'s `/g/[slug]` row** still describes the deck as "opened in a full-screen overlay that reuses the daily card's flip", and its *Conventions* section still says `markFlashcardViewed` is stamped on opening a card. Both are now wrong. Updating them belongs to the `revise-claude-md` pass at the end of the branch, not to this plan.
- **`deck-actions.ts`** is untouched. The same three actions are called, from different places.
