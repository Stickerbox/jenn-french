# Vocabulaire: the deck flips in place

Date: 2026-08-07

The Vocabulaire deck opens a card in a full-screen overlay. This replaces that
with a flip on the tile itself, in the grid, and deletes the overlay.

The front face is unchanged. The back face is the app's lilac accent with white
text, and both faces carry a small pill in the top right naming which face is
showing.

## Why the overlay goes

`FlashcardViewer` was built four days ago and works, so the reason to remove it
is worth stating rather than assuming: reading one word and its answer is not
an act that deserves a modal. A student going through twenty cards paid two
gestures per card — open, then close — and the overlay's own controls (arrows, a
position counter) existed only to soften a navigation problem the overlay had
itself created. A grid of tiles already supports the gesture the deck needs,
which is "reveal this one".

The removal is a net deletion of complexity, not a move of it. The viewer's
focus trap, its `document` keydown listener and its Space/Enter guard all exist
because a `role="dialog"` div is neither focusable nor activatable by the
browser. A tile that is already a real `<button>` gets every one of those
behaviours for free.

## Component shape

A new `components/student/DeckCard.tsx` draws one tile. `DeckTab` keeps the
grid, the sort chips, the add sheet and the view-stamping handler.

Two files rather than one because `DeckTab` is already carrying four
responsibilities in 237 lines, and two faces plus a delete confirm inline would
push it past the size at which a change to one part can be made without reading
all of it. It is also what makes the flip state's owner a real decision rather
than an accident.

**`DeckTab` owns the flip state**, as a `Set<string>` of flipped card ids;
`DeckCard` is controlled. Local state inside each tile was the alternative and
was rejected: clearing every flip when the sort changes would then need a `key`
change to force a remount, which throws away the tile's own delete-confirm state
as a side effect of an unrelated action.

Keyed by **id and not by index**, which is the one thing the old viewer could
not do. Its `openIndex` referred to a position in the ordered array, so
`chooseSort` had to close the card outright — a different card would otherwise
have appeared under the reader. A flip that follows the card survives a re-sort
by construction.

## The flip

The idiom already used twice in this codebase — `Flashcard.tsx` for the daily
card and `FlashcardViewer` for the overlay. A `[perspective:2000px]` wrapper, a
`motion.div` with `grid-cols-1` and `transformStyle: preserve-3d`, and two faces
at `col-start-1 row-start-1` with `[backface-visibility:hidden]`, the back
pre-rotated `[transform:rotateY(180deg)]`.

**This copy calls `useReducedMotion` and zeroes its own duration.** The two
existing flips hardcode `0.6` with no such hook, which the repo's own rule names
as a bug rather than a style choice: `motion-reduce:` utilities are CSS and
reach none of framer-motion. Fixing the two older ones is out of scope for this
change and is deliberately not done here — this one does not copy the fault
forward.

There is no transform conflict with the `layout` animation on the `<li>`.
`layout` writes `transform` on the list item; the flip writes `rotateY` on a
`motion.div` two levels inside it. Parent and child, not the same node.

## The tile stays a real button

ARIA makes a button's children presentational. A `<button>` wrapped around both
faces would expose the whole card as its own accessible name — front, back and
note all dropped, and the `aria-hidden` pair below it rendered dead. This is the
same trap `FlashcardViewer` records in the comment above its flip wrapper, where
`role="button"` was tried and reverted.

So the faces are plain markup and a **stretched button** sits over them:
`after:absolute after:inset-0`, its label `sr-only`. That is `PageTile`'s
existing structure, and it takes `PageTile`'s focus treatment with it — the ring
goes on the tile frame via `has-[button:focus-visible]:ring-2`, because the
button's own box is the small label and the browser would otherwise outline
nothing a sighted keyboard user could see.

The delete control on the back is a sibling of that button at a higher
`z-index`, never nested inside it: a button inside a button is invalid HTML and
the inner one is unreachable.

Nothing here needs a keydown listener. Space and Enter activate a button
natively, Tab order is the document's, and focus stays on the tile through the
flip because the button never unmounts.

## The two faces

| | Front | Back |
|---|---|---|
| Surface | unchanged — `--card-paper`, `--card-line` | `--color-accent`, matching border |
| Text | `--card-ink`, serif | white, serif |
| Note | — | beneath the answer, `white/80`, small italic, clamped to 2 lines |
| Top left | the date (`cardDateLabel`) | nothing |
| Top right | pill: *Recto* / *Front* | pill: *Verso* / *Back* |
| Bottom right | — | trash, then *Supprimer ?* / *Annuler* |

Both faces are `min-h-[160px]`, the front's present height. They share one grid
cell, so they could not differ anyway — but the consequence is the one that
matters: flipping a card moves nothing else on the page. A long note clamps
rather than growing its whole grid row.

The back carries no date. The front already has it, and a ~140px tile on a
two-column phone grid has to spend its width on the answer.

### The lilac crossing

`--color-accent` on a card object is the first time the app palette and the
flashcard palette meet on the same surface, and this is a deliberate crossing
rather than a slip. The rule it bends is that the two palettes stay two
palettes; it does not merge them, rename either, or delete anything. It is the
same shape as the admin adopting card tokens for its panels — one direction, on
purpose, recorded.

White on `#AC5395` is 4.75:1. That is not a new measurement: it is the reason
that exact value was chosen over the rejected `#B05C9A`, which failed at 4.34:1
against white. The variable already carries white text elsewhere.

The border is `--color-accent` and not `--card-line`. A cream line on lilac
reads as an artefact; matching the fill keeps the radius without a mismatched
edge.

### The pill

One new constant in `components/card-styles.ts`, `deckFacePill`, plus a
per-face colour at the call site — the pattern `cardDateLabel` and
`cardRevisionChip` already follow, and the reason it is in that file rather than
in `DeckCard` is that two faces draw it and a second copy is a second thing to
keep in step.

Its words reuse `frontLabel` and `backLabel` from both dictionaries, which are
already *Recto*/*Verso* and *Front*/*Back*. They are currently the add form's
field labels. A second pair would be two strings meaning "this is the front of a
card" with nothing keeping them in agreement; the shared key gets a comment
naming both consumers.

## Behaviour changes

Three, and each is a change rather than a port.

**`lastViewedAt` stamps on the reveal, not on the open.** Today `DeckTab.show`
fires `markFlashcardViewed` when a card is opened. The equivalent act is now
flipping a card to its back, so the stamp moves there: front → back fires it,
back → front does not. This is stricter and more honest — the timestamp feeds
the *À réviser* ordering, and seeing the question is not revising. Everything
else about it is unchanged: refused for the teacher, fired without awaiting, and
no `revalidatePath`, whose reasoning is stronger here than it was before —
re-rendering the deck under a reader mid-flip would now reorder tiles they are
looking at rather than a grid behind an overlay.

**Changing the sort clears every flip.** `chooseSort` empties the set. Sorting
is a request for a fresh pass through the deck, and twenty answers left face-up
defeats the thing the reader just asked for. Note this is no longer *forced* the
way the old close was — the flips could now survive a re-sort — so it is a
choice, made for that reason.

**Each card flips independently.** Flipping card three leaves cards one and two
as they were. A single-open rule would mean a tap on one card silently changing
another the reader may still be reading.

Delete is otherwise unchanged: the same `deleteFlashcard`, the same
tap-then-confirm, the same rule that either party may delete any card in the
deck. The row leaves through the grid's existing `AnimatePresence` exit, because
the action revalidates.

## What is removed

`components/student/FlashcardViewer.tsx`, deleted.

Four of its features go with it and are not replaced, because a grid does not
need them: arrow paging, the N-of-M position counter, the Close button and the
Flip button. So do the dictionary keys behind them — `open`, `flip`,
`flipHint`, `previous`, `next`, `position` and `close` — removed from the
`Strings` **type** as well as from both objects, so a survivor is a compile
error naming the key.

One key is added: `flipCard(front)`, the stretched button's accessible name
(*Retourner « chien »* / *Flip "dog"*). A function and not a template, per the
existing rule that interpolating strings are functions because French and
English disagree about word order.

`delete`, `deleteConfirm` and `deleteCancel` stay and move to the back face.

**The `sr-only aria-live` region carries over**, one per tile, holding the
answer while that tile is flipped and empty otherwise. Its reasoning is intact
and worth repeating because it is the kind of thing a later reader deletes as
redundant: toggling `aria-hidden` on the faces is an attribute change, and iOS
VoiceOver commonly says nothing at all for one — which is the device most of
these students read on. Here the node is genuinely *added* on the flip, the
trigger every screen reader honours. The note is deliberately not repeated; it
is on the face, and it is the long half.

`components/ui/TrashIcon.tsx` carries a comment saying `FlashcardViewer` keeps
its own local copy and is deliberately left alone. `DeckCard` uses the shared
`TrashIcon`, and that comment is removed with the file it refers to.

## Testing

No new file in `tests/lib/`, and that is stated rather than skipped silently.
The convention here is that pure modules in `lib/` are unit-tested and
components are not; this change adds no rule to `lib/`. `orderFlashcards` is
untouched and `tests/lib/flashcard-order.test.ts` still covers the sorting this
feature depends on.

Verification is the CI order run locally: `prisma generate`, `npm run lint`,
`npm run typecheck`, `npm test`, `npm run build`.

## Not in scope

- The daily card's flip and the whiteboard's, which share the missing
  `useReducedMotion` fault. Fixing them is a separate change with its own
  surface to check.
- The *À faire* tab, which is untouched.
- `deck-actions.ts`. No server action changes: the same three are called, from
  different places.
