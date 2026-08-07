---
name: whiteboards
description: Design rationale for whiteboards: append-only ops, the fixed logical space, live boards over the chat stream, and the navigation leave-guard.
paths:
  - app/api/whiteboard/**
  - lib/whiteboard-*.ts
  - lib/whiteboards.ts
  - lib/leave-guard.ts
  - components/whiteboard/**
  - components/StreamProvider.tsx
  - tests/lib/whiteboard-*.test.ts
  - tests/lib/leave-guard.test.ts
---
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
can never have a whiteboard. The Whiteboard tab follows the shared tab-presence
rule stated under *Files: pages, links and PDFs* — present for anyone unlocked, empty
state and all — because Jenn needs it to create the first board and the student
needs it to watch one being drawn.

**A saved board is readable in place** (2026-08-07). `BoardViewer` opens over
the archive at `z-[60]`, calls `useOverlayLock` like every other overlay, and
reads the ops from the endpoint the download already used — no new route, no
new access check, since `chatRole` guards it for both parties and a saved board
is immutable enough to keep its `private, max-age=3600`.

**It redraws the ops; it does not magnify a picture.** That is the point.
`exportLayout` downscales a long board to clear `MAX_CANVAS_AREA`, so an `<img>`
of the download's output would zoom into the downscale rather than into the
drawing. `lib/board-zoom.ts` holds the three rules — `fitScale`, `clampScale`,
`clampPan` — plus `rasterScale`, which enforces **the same** `MAX_CANVAS_AREA`
on the viewer's backing store by importing it rather than repeating it. Scale is
a multiplier of the fit, so `1` means "the whole page is visible" at every window
size, and there is no zoom-out below it. `clampPan` centres content smaller than
the viewport and otherwise refuses to let either edge come inside it: a drag that
pushed the board off screen would leave an empty rectangle with nothing on it to
explain how to get back.

**Zoom is computed from the clamped position, not the raw offset state.**
`applyScale` reads `placed`, the output of `clampPan`, never `offset` directly.
The two diverge whenever `clampPan` is centring an axis, which is almost always
— the board is a fixed 1.6:1 and viewports are not. Reading the raw offset threw
the drawing 100px off centre on the first zoom of an 800×600 viewport. All three
zoom inputs — wheel, buttons, pinch — go through `applyScale`, so there is one
centring rule rather than three that could disagree.

`clampAxis` guards non-finite input for the same reason `clampScale` does: NaN
survives `Math.min` and `Math.max` and reaches the CSS transform untouched,
where it blanks the drawing with no error.

**The gesture handling re-derives state from the pointer map; it does not react
to transitions.** `syncGesture()` runs at the end of `onPointerDown` and
`onPointerUp` and **never on move** — calling it on move would reset the drag
origin every frame and pan nothing. It looks at the whole `pointers` map each
time rather than the edge that changed: 0 pointers clears both the drag and
pinch refs, 1 arms a drag from that single pointer, and 2-or-more baselines a
pinch from the first two. Two bugs are why it is written that way, and both are
what a future "simplify this" would reintroduce: arming a drag only on the
transition *to* exactly one pointer froze panning after a pinch when the first
of the two fingers lifted (the map still held one pointer, but the transition
had already been consumed); baselining a pinch only on the transition *to*
exactly two let a third finger corrupt the scale once one of the original pair
then lifted, because nothing re-baselined against the pair still down.

Two implementation details are load-bearing. The wheel listener is attached
natively with `{ passive: false }` and **not** as an `onWheel` prop, because
React attaches wheel at the root as passive — a JSX handler's `preventDefault`
is ignored and logs an error, and the page behind scrolls while the board zooms.
And pointers are tracked in a **Map** rather than two nullable refs, because the
second finger of a pinch can lift first.

**The archive is localised and the drawing surface is not.** `BoardTab`,
`BoardTile`, `LiveBanner`, `BoardViewer` and `boardLabels` all read the
dictionary; `BoardEditor`, `BoardToolbar`, `LeaveBoardDialog` and
`TextStylePopover` are still hardcoded French. That is a deliberate line, not a
half-finished job: the editor is teacher-only, reachable only by pressing
*Nouveau tableau*, and touching it means touching the leave-guard and the
text-draft commit. `boardLabels`' locale argument is **optional and defaults to
French**, which is the site's fallback everywhere else and is what keeps its
existing tests calling it with one argument.

Downloading gives **one** JPEG with every page stacked, not one file per page:
multiple programmatic downloads make browsers prompt, and a zip would be this
project's first utility dependency. `exportLayout` caps the canvas area, because
iOS Safari returns a blank image rather than an error past ~16.7M pixels — and
it **floors** the scaled width and height, since rounding both up puts their
product back over the cap it just enforced.

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
with what `drawOps` renders, or committing makes the text visibly jump — and
since 2026-08-06 that includes **weight, slant and underline**.

A text op carries optional `bold`, `italic` and `underline`. **Optional is
load-bearing**: boards already saved hold text ops without them, and `readOps`
discards anything malformed, so a required field would have made every existing
text element silently vanish from every stored board. A bad value on one flag
drops that flag alone rather than the op — a corrupted `bold` must not cost real
typed text. `textFont` builds the canvas shorthand once for both `drawOps` and
the hit-test measurer, and **underline has no canvas primitive**, so it is a
stroked line per rendered line, offset and thickness derived from the size
rather than hardcoded.

Bold changes advance widths, so `Measure` now carries the style: an element
measured as plain text gets a hit box and a selection outline narrower than
what is drawn. Formatting applies to the whole element, not a character range —
a range would need a rich-text model this codebase does not have.

**The B/I/U popover must never take focus.** BoardEditor commits an open draft
when the textarea blurs — the trap `pointerDownIntent` already documents from
the other side — so every control in it calls `preventDefault()` on
*pointerdown*, not on click. A button that took focus would commit the draft
mid-word, every time. Cmd/Ctrl+B/I/U do the same thing from the keyboard and
must `preventDefault()` so the browser's own bold does not fire.

**The eraser erases along the path, not at the event.** A fast drag delivers
pointermove events tens of logical units apart, so testing only those positions
lets an element sitting between two of them survive untouched;
`lib/whiteboard-erase.ts` walks the segment at `ERASE_STEP` and hit-tests each
sample, with the step chosen against `hitTest`'s own `TOLERANCE` so no gap can
open between samples. A gesture keeps a set of what it has already taken, so a
`remove` naming the same id twice never ships. Removes are appended DURING the
drag rather than batched at the end, so a watching student sees the board
cleaned as it happens; `flushSoon` already coalesces a 150ms window, so it costs
no extra traffic. The cost that bought is that a sweep is many ops where a click
was one, which made Undo give back a single dab — `undoLength` closes that by
taking the whole sweep back while it is still the last thing in the log, and
falling back to popping one op the moment anything else is drawn, because then
the reader's last action was that other thing.

A live board is an in-memory record in `lib/whiteboard-live.ts`, keyed by group
id and held on `globalThis` like `lib/prisma.ts` and `lib/chat-bus.ts`. **It
inherits the single-process constraint**: under pm2 cluster mode a live board
would be invisible to viewers on other workers, silently — the same trap the
chat has.

It exists only to fan out and to snapshot a student who connects mid-board.
**The client's log is authoritative for saving**, so `/finish` writes the ops
from its request body and a server restart mid-board costs the live view, not
the board.

Board traffic rides the **existing** chat SSE stream — no second endpoint and no
second access check, since `chatRole` already decides who may listen. Two
properties make that safe rather than merely convenient: board frames carry
**no `id:` line**, so per the SSE spec they leave `Last-EventID` untouched and
cannot corrupt the chat's replay anchor; and `onmessage` fires only for unnamed
events, so the chat handler cannot see them. Boards are deliberately not
replayed from the database, because there is nothing there to replay.

`components/StreamProvider.tsx` owns the single `EventSource`. It used to live
inside `ChatFab`, and was moved because two connections would each replay the
whole chat backlog at connect. It is opened on mount and held for the life of
the page, not the life of a panel — which is what lets a live board reach a
student sitting on the Card tab.

Which page Jenn is presenting travels as `currentPage` beside the ops and is
never stored: a saved board has no current page.

The editor's flush diffs its log against a high-water mark, and `undo` shortens
that log rather than appending a `remove`, so the mark is clamped back to the
log's length before each flush — without that the next stroke slices to nothing
and the student silently misses one. The undone op stays on their screen until
the board is saved; the live view is best effort and `/finish` sends the whole
log regardless.

Two things in `BoardEditor` are shaped by `react-hooks/refs`, which forbids
reading a ref during render: the measuring canvas is a **module-level**
singleton rather than a `useRef`, and the surface's rect is captured into state
when a text draft opens rather than measured in the render that positions the
textarea. Both values are read during render — to draw the selection outline and
to place the textarea — so neither can live in a ref.

**Leaving a live board.** The op log lives in `BoardEditor`'s component state and
`/finish` treats it as authoritative, so **any** navigation destroys it — soft
ones included. The tab strip is `next/link`, which made *Les fichiers* mid-lesson
a silent way to lose a board, with no `beforeunload` because the document never
unloaded.

The guard is a **capture-phase `click` listener on `document`**
(`shouldGuardNavigation`, `navigationTarget`, `lib/leave-guard.ts`), and
deliberately **not** a context that each link opts into. A guard you have to
remember to wire is one a future link will not have — the back-to-admin link was
added in the same change and is protected without knowing the guard exists.
Over-catching an anchor costs one dialog; under-catching costs a lesson. Capture
phase specifically, so it runs before `next/link`'s own handler.

It arms on `boardHasContent` (`lib/whiteboard-ops.ts`), which is the predicate
`save()` uses, shared rather than re-expressed: a looser test would raise the
dialog for a board holding one stroke and a `remove` of it, whose primary button
— save — would then refuse it as empty. A dialog whose main action cannot succeed
is a trap.

`pagehide` sends a `navigator.sendBeacon` discard, gated on `!event.persisted`
and **not** on the board being dirty. The two gates answer different questions:
the prompt asks about *content*, which an empty board has none of, and the beacon
frees a *server slot*, which an empty board occupies just as fully —
`liveBoards.open()` returns false when one is already open and `/open` turns that
into a 409, so a board abandoned by closing the tab broke the *next* board's live
view for the life of the process. `pagehide` rather than `beforeunload` because
`beforeunload` fires **before** she has answered, and discarding a board she then
chose to keep is the exact failure the guard exists to prevent.

Browser Back is an **accepted, unclosable gap**, in the same register as the note
that a sandboxed frame may navigate itself: `beforeunload` does not fire for an
App Router `popstate` and closing it would mean a sentinel history entry that
breaks Back for the whole page. It is narrowed by the dialog covering the two
links she used to reach for Back to escape, and the `pagehide` beacon still frees
the slot.
