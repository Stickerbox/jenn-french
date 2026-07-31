# Whiteboard — design

Date: 2026-07-31

## Problem

Jenn teaches one student at a time, over a call, with this site open beside it.
When she needs to *show* something — that the ending changes here, that these
two words swap gender, that this phrase maps onto that one — she has words and
nothing else. The chat carries a correction; it cannot carry an arrow.

The card and the chat are both linear text. Some of what a language tutor
explains is spatial: a conjugation laid out in a grid, an arrow from a wrong
form to the right one, a word circled inside a longer word. That has no home
here.

Preply solves this with a whiteboard, and the shape of theirs is worth knowing
before departing from it: a canvas opened mid-lesson from a Tools menu, many
boards per lesson, pen/text/shapes/laser, uploads up to 128 MB, and auto-save
organised by the date and time of the lesson. Notably their collaboration model
is **flat** — no role split, both parties draw — and their whiteboard is
deliberately scratch space rather than the record. "Let students access the
whiteboard after class" is still an open request on their public feedback board.

This design departs from theirs on both counts, deliberately.

## Goal

Jenn opens a student's page, taps **Le tableau**, and clicks *Nouveau tableau*.
She draws — pen, typed text, arrows, colour — across as many pages as she needs,
while the student watches it appear. She clicks *Terminé* and it becomes a
permanent part of that student's archive, named after the day.

Both of them can browse every past board in a grid and download any of them.
Only Jenn can make one.

The card stays exactly as public as it is today.

## Non-goals

- **The student never draws.** One-way, by decision. A two-way canvas needs
  conflict handling, per-object ownership and a cursor protocol, for a lesson
  where one person is teaching and the other is watching.
- **No uploads and no annotating existing material.** The canvas starts blank.
  This is the single largest scope cut against Preply — no file pipeline, no PDF
  rendering, no coordinate mapping onto scrolling documents, and no interaction
  with the `/p/[slug]` sandbox rules.
- **No editing a finished board.** Done is final.
- **Not a second chat.** The tool set points at spatial arrangement. If a board
  is only words in a column, the chat already did that better.

## Scope

New:

- `lib/whiteboard-ops.ts` — the `Op` union, `readOps` (discards malformed
  entries), `normaliseOps`, and `foldOps(ops)` → a drawable scene
- `lib/whiteboard-names.ts` — `boardLabels(boards)`, the dated names and their
  collision rule
- `lib/whiteboard-live.ts` — the in-memory live board, on `globalThis`
- `lib/whiteboard-export.ts` — `exportLayout(pageCount)`, the stacked-JPEG
  geometry and its scale cap
- `lib/whiteboard-thumbnail.ts` — `isThumbnail(value)`, the JPEG-data-URL guard
- `lib/whiteboards.ts` — Prisma reads and writes
- `app/api/whiteboard/[slug]/open/route.ts`
- `app/api/whiteboard/[slug]/ops/route.ts`
- `app/api/whiteboard/[slug]/finish/route.ts`
- `app/api/whiteboard/[slug]/discard/route.ts`
- `app/api/whiteboard/[slug]/[id]/route.ts` — `GET`, a board's full ops
- `components/whiteboard/BoardTab.tsx` — the archive grid and the live view
- `components/whiteboard/BoardGrid.tsx`, `BoardTile.tsx`
- `components/whiteboard/BoardCanvas.tsx` — renders a folded scene; used by the
  live view, the editor and the export
- `components/whiteboard/BoardEditor.tsx` — Jenn's tools and her local op log
- `components/whiteboard/LiveBanner.tsx`
- `components/StreamProvider.tsx` — owns the single `EventSource`
- `prisma/migrations/<...>_add_whiteboards/` — `Whiteboard`, `WhiteboardPage`
- `tests/lib/whiteboard-ops.test.ts`, `whiteboard-names.test.ts`,
  `whiteboard-live.test.ts`, `whiteboard-export.test.ts`,
  `whiteboard-thumbnail.test.ts`

Changed:

- `prisma/schema.prisma` — two models, and `Group.whiteboards`
- `lib/student-tab.ts` — a third tab value; the second argument becomes a shape
  rather than one boolean
- `tests/lib/student-tab.test.ts` — the third value
- `app/g/[slug]/page.tsx` — the third tab, the banner, the archive data
- `components/student/StudentTabs.tsx` — "Le tableau"
- `components/chat/ChatFab.tsx` — consumes the provider instead of owning the
  `EventSource`
- `app/api/chat/[slug]/stream/route.ts` — board frames, and the snapshot for a
  client that connects mid-board
- `lib/chat-bus.ts` — board publish/subscribe beside the message channel
- `app/actions.ts` — `deleteWhiteboard`
- `CLAUDE.md` — the route table, the whiteboard section, and `/api/whiteboard/*`
  added to the list of places that are routes rather than server actions

Unchanged:

- `GlobalCard`, card resolution, the week, the flashcard template
- `Message` and everything about the chat except where its stream lives
- Teacher auth. Students still have no account and no session row
- `/p/[slug]`, `/f/[token]`, `/api/pages`

## Access

No new access model. The Whiteboard tab keys off the same `unlocked` flag the
Files tab already uses in `app/g/[slug]/page.tsx` — the per-student cookie
matched against `group.chatToken`.

```
unlocked = !group.isEveryone && group.chatToken !== null
                             && presented === group.chatToken
```

What falls out of reusing it:

- **The everyone group can never have a whiteboard.** Its `chatToken` is null,
  so `unlocked` is false. Same reason it has no chat, and the check needs
  writing exactly once.
- **The card stays public.** An untokened visit to `/g/marie` renders the card
  alone — no strip, no tab, nothing hinting a board exists. This is the
  load-bearing decision inherited from the chat design and it is not revisited.
- **Jenn arrives the way she already does for chat**, from the Students tab,
  which links to `/g/[slug]?k=<chatToken>`. Her teacher session alone does *not*
  set `unlocked` (`app/g/[slug]/page.tsx:47` checks only the cookie), so opening
  `/g/marie` from her own bookmark shows her no tab. That trap already exists
  for the chat; this design does not make it worse and does not fix it.

| Viewer | Tab |
|---|---|
| Student, unlocked | visible, always — empty state when there are no boards |
| Jenn, unlocked | visible, always, plus *Nouveau tableau* and a delete per tile |
| Untokened visitor | absent |
| Everyone group | absent |

The tab is present whether or not a board exists. An earlier draft showed it
only once one existed, which was wrong twice over: Jenn had nowhere to create
the first from, and the student had no tab to watch the first being drawn in.

**Consequence for the strip.** An unlocked student with no files currently sees
no tab strip at all. With the whiteboard tab always present, unlocked always
means at least two tabs, so the strip always renders for them. The rule in
`CLAUDE.md` — the strip appears only when there is more than one tab — still
holds; the condition it tests is just always true now for an unlocked visitor.
An untokened visitor still gets the bare card.

`GET /api/whiteboard/[slug]/[id]` is gated by `chatRole` from
`lib/chat-access.ts`, the same function the chat's two routes share, so a board
cannot be read by anyone who could not read the conversation. The four mutating
routes are teacher-only, per the rule that every mutating entry point starts
with a teacher check.

## Schema

```prisma
model Whiteboard {
  id        String   @id @default(cuid())
  groupId   String
  group     Group    @relation(fields: [groupId], references: [id], onDelete: Cascade)
  // The teaching day this board belongs to, UTC midnight like every other date
  // here. There is no title column: the archive name is this, formatted, and
  // Jenn is never asked to name anything.
  date      DateTime
  // A JPEG data URL of page 1, rendered by the client at /finish and validated
  // there. Safe as a second representation only because a finished board is
  // immutable — it can never drift from the ops. It exists so the archive is a
  // server-rendered <img> grid rather than fifty boards' op logs shipped to the
  // client on every visit to the tab.
  thumbnail String
  createdAt DateTime @default(now())
  pages     WhiteboardPage[]

  @@index([groupId, createdAt])
}

model WhiteboardPage {
  id           String     @id @default(cuid())
  whiteboardId String
  whiteboard   Whiteboard @relation(fields: [whiteboardId], references: [id], onDelete: Cascade)
  // Explicit order. Not a createdAt — every page of a board is written in one
  // transaction and would share a timestamp.
  index        Int
  ops          Json
  @@unique([whiteboardId, index])
}
```

Two deliberate absences:

- **No `finishedAt`.** A row exists only because *Terminé* was clicked, so every
  `Whiteboard` in the database is finished by definition. An abandoned board was
  never written, which means there is no half-drawn state to filter out of every
  query and no cleanup job.
- **No `Lesson`.** The board carries a date, and the archive groups by it. Same
  reasoning as `groupByDay` in the chat: a lesson is something the calendar
  decides rather than something someone has to remember to press.

`onDelete: Cascade` twice — deleting a student takes their boards, deleting a
board takes its pages. That is what deleting a student means.

`ops` is a Json column, which Prisma types as `JsonValue` — i.e. not at all.
Everything read out of it goes through `readOps`, which **discards malformed
entries rather than throwing**, and everything written goes through
`normaliseOps`. This is the same contract `readSections`/`normaliseSections`
have for card sections, for the same reason: a board that fails to render is
worse than a board missing one stroke.

## Ops

An append-only log. Erase and undo do not mutate history; they **append** a
`remove` op naming ids.

```ts
type Op =
  | { id: string; page: number; kind: "stroke"; points: number[]; colour: string; width: number }
  | { id: string; page: number; kind: "text";   x: number; y: number; text: string; colour: string; size: number }
  | { id: string; page: number; kind: "arrow";  x1: number; y1: number; x2: number; y2: number; colour: string }
  | { id: string; page: number; kind: "remove"; targets: string[] }
```

`foldOps(ops)` reduces the log to a scene: ops partitioned by page, `remove`
targets dropped, order preserved. It is pure, tested, and the **only** thing
that converts ops into something drawable — used by the live view, the editor,
the thumbnail and the export. One folder is what makes those four incapable of
disagreeing.

`points` is a flat `number[]` rather than `{x, y}[]`: a stroke is the largest
thing in the log and halving its JSON size matters when it is also the thing
being sent every 150 ms.

**Editing an element is a remove plus a re-add.** Moving something, retyping its
words and changing its size all append a `remove` naming the old id followed by
a fresh op carrying the new geometry, text or size. `foldPage` needs no change
whatsoever — this is the mechanism the eraser already uses, pointed at a
different intent.

The alternative, a `move` op carrying an offset that the fold applies, keeps the
log smaller and preserves an element's identity across edits. It was rejected
because it turns `foldPage` from a filter into a geometry transformer, and
obliges every future op type to define how it moves. Two extra ops per edit is
nothing on a lesson-length board.

**Which page she is looking at is not an op.** The live record carries a
`currentPage`, published alongside ops so the student's view follows hers while
she presents. It is deliberately outside the log, because a *saved* board has no
current page — the reader opens whichever page they like. Putting it in the log
would mean folding a piece of transient presentation state into stored content.

**Pages are added, never deleted.** A page tool that removed a page would have to
reindex every op after it, which is the one operation an append-only log cannot
do cheaply. Instead: *add page*, *navigate*, and *clear page* — which appends a
`remove` for everything on it. Trailing empty pages are dropped at `/finish`, so
adding a page she never used costs nothing.

Four problems collapse into this one decision, which is why it is worth the
indirection:

- A **late joiner** needs no reconciliation — hand them the log
- The **renderer is stateless**, so live view, thumbnail and export are the same
  function at three canvas sizes
- **Persistence is free** — what streams is what is stored, with no serialise
  step at Done and no chance the saved board differs from what was watched
- **Undo crosses the wire** — a `remove` fans out like any other op, so the
  student sees her undo happen

The cost is that heavy erasing stores ops that no longer render. For a
lesson-length board that is kilobytes.

## The logical canvas

Every coordinate is in a fixed logical space, **1600 × 1000**, scaled to fit
whatever is drawing it. Not negotiable, for three reasons that all bite at once:
Jenn's window and the student's are different sizes, a thumbnail is tiny, and a
JPEG export needs a definite pixel count. Without one logical space those three
render differently from identical ops.

The whiteboard tab is the first thing on this page whose layout is not governed
by the flashcard template: the header, the strip and the card all sit in a
`max-w-[560px]` column, and a board needs the full viewport width. The tab
breaks out of that column; nothing else does.

## Tools

Pen, text placed anywhere, arrows and lines, and a fixed colour palette. Plus
select, eraser, undo, clear page, add page, and page navigation.

**Text is typed inline on the canvas**, not into a dialog. Clicking with the
text tool opens a borderless transparent `<textarea>` at that point, matched to
the font, size and colour the op will render with, so what she types is what
appears. Escape cancels, blur or Cmd/Ctrl+Enter commits, plain Enter is a
newline — the renderer already splits on `\n` and never wraps, which is also
why resizing a text block cannot reflow it.

**Select is direct manipulation**: click an element to select it, drag it to
move it, press Delete to remove it. Pressing a colour swatch with something
selected **recolours that element** rather than arming the next one. A selected
text element additionally offers double-click to re-edit its words and a
stepper to change its size. Every one of those is a remove-plus-re-add (see
Ops), so none of them mutate anything — and because a revision mints a new id,
the selection has to follow it.

**The toolbar is icons, not words.** `lucide-react` is already a dependency.
Every icon button carries a French `aria-label` and a `title`, because an
icon-only control that cannot be hovered or read aloud is a control only its
author can use. *Terminé* and *Annuler* stay as words: they are decisions, not
tools, and they are the two places where being unambiguous beats being compact.

Five preset swatches, not a colour picker — the colours mean something
(masculine/feminine, right/wrong, emphasis) and five named choices communicate
that better than a spectrum. They are the existing flashcard tokens: ink,
`--card-rouge`, `--card-bleu`, `--card-moss`, `--card-plum`. The board lives on
a page styled by the flashcard template, so its palette should travel with it
rather than introduce a sixth set of colours to the project.

**Input is a desktop mouse or trackpad.** This is why the tool set leans on
typed text rather than handwriting: trackpad cursive is unreadable, but a circle
round a word does not need to be neat. Pointer events throughout so a stylus or
finger works, but no pressure handling and no tablet-first layout.

Jenn's controls render on the student's page, which is in French — the chat
already does this (its delete control is passed in as "Supprimer"). So:
*Nouveau tableau*, *Terminé*, *Annuler*, *Supprimer*, *Télécharger*.

## Lifecycle

```
Nouveau tableau  →  POST /open      in-memory board created, keyed by groupId
                                    its date is stamped here
                                    publish  board-open

drawing          →  POST /ops       batched; append to memory
                                    publish  board-ops        (no SSE id:)

student connects →  stream emits    board-snapshot (log so far + currentPage)

Terminé          →  POST /finish    body carries the ops AND the thumbnail
                                    one transaction: Whiteboard + pages
                                    publish  board-saved ; discard memory

abandon          →  POST /discard   publish  board-closed ; discard memory

crash            →  nothing was ever written
```

**The client's log is authoritative, not the server's memory.** `/finish` writes
the ops from its request body; the in-memory live board exists only to fan out
and to snapshot late joiners. Jenn's browser is the origin of every op, so it
cannot hold a log the student did not see — only a longer one, if the stream
dropped. This is what makes a mid-board server restart a non-event: the live
board is gone, the student's view froze, but *Terminé* still saves the whole
thing. It also means Part 1 of the build can ship a working save path with no
live infrastructure behind it at all.

**The date is stamped at `/open`** and carried on the live record, so a lesson
crossing UTC midnight belongs to the day it started — which is the day Jenn and
the student would both call it. With no live board (Part 1, or after a restart)
`/finish` falls back to today at UTC midnight.

**The thumbnail is rendered by Jenn's browser** and sent in the `/finish` body.
There is no server-side canvas and adding one would mean a native dependency, so
the client is the only thing that can produce an image. `/finish` therefore
**validates it**: `isThumbnail` requires a `data:image/jpeg;base64,` prefix, and
the body is read through the existing `readBoundedBody` from `lib/bounded-body.ts`
so an oversized payload is refused as it arrives rather than after the process has
buffered all of it. Teacher-only input is still input, and this one ends up in an
`<img src>` on the student's page.

`/ops` reads its body the same way. Both caps are constants in the route, as the
chat and pages routes already do it.

**Batching.** Flush on `pointerup`, and every ~150 ms during a long stroke so
the student watches a line grow rather than snap into place. Worst case is
roughly seven POSTs a second while she is actively drawing. That is fine for one
teacher and one student, but the ops route must not do a database round trip per
op: `/open` resolves the group once and keeps its id on the in-memory record, so
a hot op POST is a session check plus a map lookup. The teacher check still runs
on every one.

**One board per group at a time.** The live map is keyed by group id, so a
second `/open` for the same student is refused with a message rather than
silently replacing the first. One student cannot be watching two boards.

`lib/whiteboard-live.ts` holds the map on `globalThis`, the same pattern
`lib/prisma.ts` and `lib/chat-bus.ts` use, and for the same dev-reload reason.
**It inherits the single-process constraint**: under pm2 cluster mode a live
board would be invisible to viewers on other workers, silently, exactly as the
chat would. That constraint is already recorded in `CLAUDE.md`; this adds a
second thing that depends on it.

## Real-time

Board traffic rides the **existing** chat stream. No second endpoint, no second
connection, no second access check — `chatRole` already decides who may listen
and already refuses the everyone group first.

Two properties of SSE make this safe rather than merely convenient:

- **Board frames carry no `id:` line.** Per the spec, an event without an id
  leaves the client's last-event-id buffer untouched. So ephemeral board traffic
  cannot corrupt the chat's replay anchor, and a reconnect still resumes messages
  from exactly where it left off. Boards are *not* replayed from the database,
  because there is nothing there to replay — which is the correct behaviour.
- **`onmessage` fires only for unnamed events.** Every board frame uses an
  `event:` name, so the existing chat handler in `ChatFab` cannot see them and
  adding them cannot break chat.

The stream sends a `board-snapshot` at connect when a live board exists for that
group. This is the same idea as the message backlog at
`app/api/chat/[slug]/stream/route.ts:108`, pointed at memory instead of Prisma,
and it is what lets a student who arrives mid-board see the whole thing rather
than the tail.

The pending-during-replay guard already in that route (subscribe first, hold
what arrives, then flush) applies to board ops too: subscribing after the
snapshot is read would leave a window in which an op reaches neither path.

## Lifting the EventSource

`ChatFab` currently creates the `EventSource` itself and holds it open for the
life of the page rather than the life of the panel — deliberately, per the
comment at `components/chat/ChatFab.tsx:42`, because an unread dot can only
reflect messages the component actually observed.

That is lucky: a stream is already live while the student sits on the Card tab,
so board events reach them wherever they are. But the whiteboard tab and the
banner are different components, so the connection moves up into
`StreamProvider`, which owns it and exposes messages and live-board state.
`ChatFab` becomes a consumer.

This is a refactor of working code, so the reason belongs in its commit message:
two `EventSource`s would mean two streams, and **each one replays the entire
chat backlog from the database at connect**.

## The banner

While a board is live, the Card and Files tabs show a strip: *"Jenn dessine en
ce moment"* and a button to `?tab=board`. It appears on `board-open` or on a
snapshot arriving, and clears on `board-saved` or `board-closed`.

It is a banner rather than an auto-switch because yanking the page out from
under someone mid-sentence is worse than a button, and rather than nothing
because a missed verbal instruction means drawing to an empty room. It is driven
entirely by the lifted stream, so it costs no polling.

## The archive

```
        ( La carte )  ( Les fichiers )  ( Le tableau )
     ────────────────────────────────────────────────────

     ┌────────────┐  ┌────────────┐  ┌────────────┐
     │  thumbnail │  │  thumbnail │  │  thumbnail │
     ├────────────┤  ├────────────┤  ├────────────┤
     │ 31 juillet │  │ 24 juillet │  │ 17 juillet │
     │ 3 pages  ⤓ │  │ 1 page   ⤓ │  │ 2 pages  ⤓ │
     └────────────┘  └────────────┘  └────────────┘
```

Newest first. A tile is its thumbnail, its dated name, its page count, and a
download control. Jenn additionally gets *Nouveau tableau* above the grid and a
delete per tile — the same asymmetry the chat already has, where she can delete
a message and the student cannot.

Empty state: **"Aucun tableau pour l'instant !"**, matching the chat's
"Aucun message pour l'instant." (Student copy on this page is mixed — the
no-card fallback is English — but the tab strip and every chat label are French,
and this belongs with those.)

`deleteWhiteboard` is an ordinary server action in `app/actions.ts` with a
teacher check, `deleteMany` so a double-click is a no-op rather than a P2025,
and a `revalidatePath`. The four live routes are routes rather than actions
because `/ops` is called several times a second and a server action serialises
through the router; keeping all five together as one protocol is worth more than
matching the default mechanism.

## Naming

Two boards drawn on 31 July would both be "31 juillet 2026". `boardLabels`
disambiguates **only when it must**: the second and later boards on a date, in
the order they were drawn, become "31 juillet 2026 (2)", "(3)", and so on.

A counter rather than a time, because every date here is formatted with
`timeZone: "UTC"` — and while UTC midnight is invisible for a date, a UTC
*clock time* is not: a 7 pm Québec lesson would label itself "23 h 00". A
counter carries the same "these are different" signal with nothing to
misread.

A pure function over the whole day's boards rather than a per-board format
call, because "disambiguate only when ambiguous" cannot be decided from one
board, and is exactly the kind of rule that silently regresses into either
always or never.

## Export

One JPEG per board: every page stacked vertically, separated by a hairline rule.

This is a departure from "all pages as separate JPGs", chosen because it is the
only option that needs neither a zip dependency — this project has no utility
libraries at all — nor a browser prompt, which multiple programmatic downloads
trigger in Chrome and Safari.

Filename `tableau-2026-07-31.jpg`.

Rendering is client-side. There is no server-side canvas and adding one would
mean a native dependency, so the download control fetches the board's ops from
`GET /api/whiteboard/[slug]/[id]`, folds them, draws each page into one tall
canvas and calls `toBlob`.

**The scale cap.** At 1600 px wide, iOS Safari's ~16.7M-pixel canvas ceiling is
reached at about ten pages, and a canvas over the limit does not error — it
produces a blank image. `exportLayout(pageCount)` returns the canvas dimensions
and a scale factor, downscaling proportionally once the area would exceed the
ceiling. It is pure and tested, because the failure it prevents is silent.

## Error handling

| Failure | Behaviour |
|---|---|
| An op POST fails | Jenn's editor holds her own copy of the log and retries the flush. The student's view lags; it never diverges, and the saved board is unaffected either way. |
| Server restarted mid-board | `/finish` still succeeds — the body is authoritative. The student's view froze at the last op they received; the saved board is complete. |
| Student's stream drops | `EventSource` reconnects and gets a fresh snapshot. No ids are involved, so chat replay is unaffected. |
| `/finish` transaction fails | Nothing is written, memory is kept, she can retry. |
| Two boards opened at once | The second `/open` is refused with a message. |
| Malformed ops in a stored page | `readOps` discards the bad entries and the board renders without them. |
| Export canvas too large | `exportLayout` downscales rather than producing a blank JPEG. |
| A thumbnail that is not a JPEG data URL | `/finish` rejects the whole request; no board is written and she can retry. |

The through-line: Jenn's browser is the second copy of an unfinished board.
That is what makes "commit once at the end" safe despite the server holding the
only other copy in memory.

## Testing

Pure modules with tests, per the existing convention. Components, Prisma access,
the routes and the canvas renderer are not unit-tested, as with everything else
here.

- `whiteboard-ops` — folding, `remove` semantics, page partitioning, and
  `readOps` discarding malformed entries rather than throwing
- `whiteboard-names` — dated labels, and the collision rule in both directions
  (one board on a date gets no time; two get times)
- `whiteboard-live` — the open → append → finish → discard state machine, and
  the double-open refusal
- `whiteboard-export` — `exportLayout`, especially that it downscales past the
  area ceiling
- `whiteboard-thumbnail` — `isThumbnail` accepts a JPEG data URL and rejects an
  HTML one. Pure, and the one piece of client-supplied data in this design that
  reaches an `<img src>`
- `student-tab` — the third value, and that `?tab=board` from a locked visitor
  falls back to the card, the same rule `?tab=files` already has

## Build order

Two plans, in order.

**Part 1 — static whiteboards.** The two models and the migration, the tab, the
archive grid, thumbnails, the export, and Jenn drawing and saving with **no
streaming at all**: she clicks *Terminé* and the student finds it in the archive
next time they look. Every pure module lands here, and it is independently
shippable and independently useful.

**Part 2 — live.** `whiteboard-live`, the four live routes, board frames on the
chat stream, snapshot-on-subscribe, lifting the `EventSource` into
`StreamProvider`, and the banner.

Same split the chat spec used, for the same reason: a migration, a new surface
and a streaming endpoint should not land under one review. Part 2 is also the
part that depends on the single-process constraint, so it is worth isolating.

## Future — not in this build

- **A pointer.** Preply has a laser pointer that leaves no marks, and their
  reason is sound: on a shared canvas there is no shared cursor, so "this word
  here" is unsayable. Cheap to add later — an ephemeral op that is never folded
  into the scene and never stored.
- **Text search over boards.** `text` ops carry their strings, so a board is
  already searchable without a schema change.
- **Student drawing.** Would need the ops route opened to a token holder and a
  rule for whose op wins. Not hard; just not this.
- **Annotating an uploaded page.** The largest single thing cut from Preply's
  model. It would need the board to reference a `Page` and to map coordinates
  onto scrolling content inside the existing sandbox rules.
- **A board on the everyone group.** Currently impossible by construction, since
  it has no `chatToken`. Would need an access rule of its own, as its public
  files shelf already has.

## Rejected

**Creating the `Message` row first and appending to it.** The obvious way to get
a crash-safe live board. Rejected on two counts: it is a read-modify-write
against SQLite per stroke, and SQLite serialises writers on the same file the
cards and chat live in; and it breaks the `Last-Event-ID` contract, because a
message id already delivered would now have different content and SSE replay has
no way to express "this id changed". That replay logic already survived one
ordering bug and should not be asked to survive this.

**Saving a raster image instead of the ops.** 50–300 KB per board in SQLite
against a few KB of JSON, blurry when enlarged, and two representations that can
visually disagree. The export already produces an image from the ops, so nothing
is lost.

**Putting the board in the chat log as a message.** Considered at length, and
attractive because it inherits retention, deletion and replay for free. Rejected
because a board is not a remark: it has pages, it wants a grid with previews,
and it is the thing a student goes looking for weeks later. Burying it in a
transcript makes it findable only by scrolling.

**A second SSE endpoint for board traffic.** Two connections per student page,
two access checks, and the chat backlog replayed twice per page load. The no-id
frame makes one stream correct.

**WebSockets.** Rejected in the chat design and rejected again for the same
reasons: a custom `server.js`, a change to how pm2 starts the app, and nginx
upgrade headers — all to gain a client-to-server channel `POST` already
provides. Seven POSTs a second is not a reason to rebuild the transport.

**Uploads.** The single biggest cut against Preply, and the one most likely to be
asked for later. Left out because it brings a file pipeline, format handling, a
size limit, and annotation-over-documents, and because a blank canvas is enough
to test whether a whiteboard earns its place here at all.
