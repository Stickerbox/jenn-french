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
with what `drawOps` renders, or committing makes the text visibly jump.

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
