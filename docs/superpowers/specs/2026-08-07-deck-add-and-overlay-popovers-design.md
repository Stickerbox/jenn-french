# Deck add control, overlay popovers and list motion

Date: 2026-08-07

Five UI corrections on `/g/[slug]`. Four of them are visual. One of them is a
bug that made two overlays transparent.

## The transparent overlay bug

`BoardViewer` and `FlashcardViewer` both set `bg-[var(--card-page-bg)]`.

`--card-page-bg` is a `radial-gradient(...)`. A gradient is a background
*image*, not a colour. Tailwind writes that class as
`background-color: var(--card-page-bg)`. A gradient is not a valid colour, so
the declaration fails and the element stays transparent. The page shows
through both overlays.

Every other user of the token writes `style={{ background: "…" }}` — the
shorthand accepts an image. The two overlays must do the same.

Do not "fix" this by adding a colour token. The gradient is correct; the
property was wrong.

## 1. The deck gets its own add button

`DeckTab` takes the add flow from `ShelfFab`. It receives `onAddFlashcard` and
holds the `AddSheet` and the `AddFlashcardForm`.

The button is a 56px circle below the grid, centred on the horizontal axis. Its
skin is `border-[var(--card-line)]` with `bg-[var(--card-paper)]` — the skin of
an inactive filter chip and of the viewer's own controls. An empty deck draws no
grid, so the button goes where the first row would be.

It is a `motion.button` with `layout`. When a new card makes the grid taller,
framer-motion measures the change and moves the button down. It does not jump.

`ShelfFab` loses the `card` choice, the `open === "card"` sheet, the
`onAddFlashcard` prop and the `AddFlashcardForm` import. Both call sites in
`app/g/[slug]/page.tsx` give the prop to `DeckTab` instead.

`addFlashcard` on the server does not change. This moves a control. It does not
move an access rule. The same shape as the `addShelfPage` narrowing that
CLAUDE.md already records.

## 2. The vocab tile centres its word

The date keeps its row at the top. The word goes in a wrapper that fills the
rest of the tile and centres its content on both axes. The word becomes
`text-2xl font-bold`.

The button keeps `text-left`, so the date stays at the left. The minimum height
goes from 132px to 160px. Without that room the centring does not read as
centring.

The tile still shows the front only. A tile that showed the answer would make
the deck a glossary.

## 3. The flashcard viewer becomes a popover

The root is `fixed inset-0 z-[60] flex items-center justify-center sm:p-8`. It
holds two children.

**The scrim** is `absolute inset-0 bg-black/40 backdrop-blur-sm`. It is a `div`
with `aria-hidden`, **not a button**. `AddSheet` uses a button for its own
scrim, but this dialog traps Tab with a query for
`button:not([disabled])` — a scrim button would become a tab stop inside the
card. Escape and the Close button both dismiss the dialog already, so the scrim
needs no keyboard path of its own and the trap does not change.

**The panel** is full screen below `sm` and a popover at `sm` and above:
`sm:h-auto sm:max-h-[85vh] sm:max-w-[720px] sm:rounded-2xl`. Its background is
the gradient, through `style`. It is a `motion.div` that fades in and scales
from 0.96.

`‹` and `›` leave the bottom bar. They go to the left and right edges of the
panel, centred on the vertical axis. The bottom bar keeps the position counter
and Flip.

Nothing else changes: the flip, the focus restore, the Tab trap, the live
region and `useOverlayLock` all stay.

## 4. The to-do list gets space and motion

The empty line gets the same bottom margin the list has. Before this the line
touched the input.

A new row enters from `{opacity: 0, y: 16}` to `{opacity: 1, y: 0}`, inside
`AnimatePresence`. `lib/action-items.ts` orders by `createdAt` ascending, so the
newest row is at the bottom, directly above the input. The row therefore appears
to come up out of the input.

The form has `layout`, so it moves down as the list becomes longer.

A done row is still struck through in place. That rule does not change.

## 5. The board viewer becomes a popover

The same scrim and panel as the flashcard viewer, at `sm:max-w-[1100px]
sm:h-[85vh] sm:rounded-2xl overflow-hidden`, with the same background
correction.

**Its scrim does not close on a click.** The viewer pans with pointer capture.
A drag that ends outside the panel sends a click to the scrim, and the board
would close in the middle of a gesture. Escape and the Close button only.

## 6. Motion becomes a rule, not five decisions

Added during the work, at the owner's request. Two things must animate: a
popover that opens, and a row that joins a list. CLAUDE.md now records it.

An audit found the app already half obeyed it. `AddSheet`, `AddMenu`,
`ChatPanel` and the chat bubbles animate. `MonthCalendar` and
`LeaveBoardDialog` did not, and they get `panel-pop` — the keyframe `AddMenu`
already uses. The shelf (`FilesTab`) and the deck (`DeckTab`) get the same
enter, exit and `layout` treatment as the to-do list.

**The tool depends on what moves.** A pure entrance is CSS, through the two
keyframes that exist. Anything that must know where an element *used to be* —
a list re-flowing, the deck button sliding down under a new row — is
framer-motion `layout`, because no keyframe can hold a distance that is known
only at run time. This is why the plan changed from "framer-motion for
everything" once the audit showed the CSS precedent.

Two selection toolbars are **deliberately left alone**. `FormatPopover`
positions itself with `-translate-x-1/2` and a conditional `-translate-y-full`,
and `panel-pop` sets `transform: scale(...)`, which would replace those
translates and move the toolbar off its anchor. `TextStylePopover` sits inside
the live-board editor, where the rule is that it must never take focus or
disturb an open text draft. Neither is an overlay a reader opens; both follow a
caret. They are named here so the omission reads as a decision.

## Reduced motion

framer-motion does not obey `prefers-reduced-motion` by itself — the
`motion-reduce:` utilities are CSS and reach none of it. Each component that
uses `motion.*` calls `useReducedMotion` and sets its duration to zero. The CSS
entrances need nothing: `motion-reduce:animate-none` covers them.

`AnimatePresence` takes `initial={false}` on every list here. These lists are
server-rendered, so without it a tab switch would replay an entrance for every
row already on the shelf.

## Not in scope

- No change to any server action, guard or access rule.
- No change to `lib/flashcard-order.ts` or `lib/action-items.ts`.
- No new `lib/` module. Every change here is presentation, and the
  project tests pure modules rather than components.
- No fourth keyframe.
