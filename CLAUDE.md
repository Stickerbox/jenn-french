# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A daily French flashcard site for a single tutor (Jenn) and her students. Students
open a bookmarked group link and see that day's card; the teacher writes cards from
an admin area behind a passkey. Live at https://francaisavecjenn.ca.

## Commands

```bash
npm run dev            # next dev
npm run build          # next build
npm run lint           # eslint .
npm run typecheck      # tsc --noEmit
npm test               # vitest run

npx vitest run tests/lib/week.test.ts        # one file
npx vitest run -t "clamps future dates"      # one test by name
npx prisma generate                          # after any schema.prisma change
npx prisma migrate dev --name <name>         # create + apply a migration
```

CI (`.github/workflows/ci.yml`) runs, in order: `prisma generate` → lint → `tsc
--noEmit` → test → build. Run those locally before claiming work is done.

Env vars live in two gitignored files: `.env` holds `DATABASE_URL`
(`file:./dev.db`), `.env.local` holds `RP_ID`, `ORIGIN`, `ANTHROPIC_API_KEY`,
`PAGES_UPLOAD_TOKEN`. Prisma reads `.env`; Next.js reads both.

## Routes

| Route | Who | Notes |
|---|---|---|
| `/` | public | landing page |
| `/g/[slug]` | students | the card for `?date=` (public); `?tab=files`, `?tab=board` and the chat need the token, teacher included — a teacher session adds only the delete and read-marker controls once unlocked, plus *Nouveau tableau* and a delete per board — except the everyone group, whose files are public and which has neither chat nor whiteboard |
| `/login` | teacher | passkey register/authenticate |
| `/admin` | teacher | three tabs via `?tab=` — the global card for `?date=` (default), groups, pages |
| `/p/[slug]` | public | an uploaded HTML page, in a sandboxed iframe |
| `/f/[token]` | students | that student's files, at an opaque unguessable link |
| `/admin/pages/[slug]` | teacher | edits one uploaded page |
| `POST /api/pages` | token | publishes a page from outside the browser |
| `POST /api/chat/[slug]` | token or teacher | send one message |
| `GET /api/chat/[slug]/stream` | token or teacher | the SSE stream |
| `POST /api/whiteboard/[slug]/finish` | teacher | saves a whole board |
| `POST /api/whiteboard/[slug]/open` | teacher | starts a live board |
| `POST /api/whiteboard/[slug]/ops` | teacher | appends and fans out ops |
| `POST /api/whiteboard/[slug]/discard` | teacher | drops a live board, saving nothing |
| `GET /api/whiteboard/[slug]/[id]` | token or teacher | a board's ops, for the JPEG export |
| `/api/auth/*` | — | WebAuthn ceremonies (server actions everywhere except here, `/api/pages`, `/api/chat/*`, `/api/whiteboard/*`, and `/p/[slug]/raw`) |

## Architecture

### Cards

A card belongs to a date, and every student sees the same one: `getEffectiveCard`
(`lib/cards.ts`) reads the `GlobalCard` row for that date and takes no student
or group id at all. A date with no row resolves to `null` and the page says
nothing was posted — it deliberately does **not** fall back to an earlier day,
because that made the week picker lie.

Per-student overrides used to exist — a `Card` model unique on `(groupId, date)`,
a `pickEffectiveCard` resolution rule, and an `/admin/[slug]` route to edit one —
and were removed on 2026-07-31 with zero rows in either database, so nothing was
lost. `getEffectiveCard` took a group id before that and preferred the override;
if you find a reference to one of those names, or to `getArchiveDates` or
`mergeArchiveDates` (dead code that queried the dropped table and was deleted
with it), that is why — not a bug.

### Card sections

The body of a card is `sections: Json?` — an array of `{title, body}` the teacher
orders herself (`lib/sections.ts`). The older scalar columns
(`examples`, `pronunciation`, `tip`, `idiom`) are still in the schema and are
intentionally left untouched: `toUpdateData` in `app/actions.ts` omits them so they
remain a rollback path. `toCreateData` must still supply `examples: ""` because the
column is non-nullable. Don't "clean up" either of these without deciding to give up
the rollback.

Everything read out of the `sections` column goes through `readSections`, which
discards malformed entries rather than throwing — Prisma types a Json column as
`JsonValue`, i.e. not at all. Everything written goes through `normaliseSections`.

Two section titles are load-bearing: `IDIOM_TITLE` ("Idiom of the day") selects the
gold box on the card back, and `PRONUNCIATION_TITLE` is seeded empty on new cards.
The idiom box is matched **on the title**, not on the shape of the text — a previous
content-driven rule silently dropped styling from existing cards.

### Dates

Every date is UTC midnight, constructed as ``new Date(`${str}T00:00:00Z`)``, and
formatted with `timeZone: "UTC"`. The teaching week runs Monday–Friday; both
Saturday and Sunday belong to the week that just ended (`lib/week.ts`).

The student page clamps `?date=` to `latestViewableDate(today)` so students cannot
read ahead of pre-posted cards. `parseAdminDate` deliberately does *not* clamp —
pre-posting is the teacher's workflow, and clamping would make those days
unreachable from `/admin`. It does, however, snap a weekend date forward to the
following Monday, including its `today` fallback, so `/admin` never opens on a
non-teaching day; the five-column calendar is the UI half of the same rule.

### Auth

Exactly one teacher and exactly one passkey. `register-begin` returns 400 once a
passkey exists, and there is no UI to add a second or remove one — transferring the
account means deleting the `Passkey` row on the server (see `docs/DEPLOYMENT.md`).
The session is a 7-day httpOnly cookie holding the teacher id (`lib/session.ts`);
deleting the passkey does not invalidate it.

Every mutating server action in `app/actions.ts` and `app/ai-actions.ts` starts with
a teacher check. Add one to any new action — `ai-actions` without it is an
unauthenticated endpoint spending the project's API budget.

### Claude card generation

`lib/card-ai.ts` calls `claude-sonnet-5` to write exactly three fields —
`hint`, `grammar`, `idiom`. Subject, usage, and Québec pronunciation are the
teacher's; `CardSuggestion` has no shape for them, so a generated value cannot
reach those inputs. `thinking: { type: "disabled" }` is intentional: `max_tokens`
caps thinking and output together, and adaptive thinking was truncating the JSON.
Failures become `CardAiError` whose messages are shown to the teacher verbatim;
anything else is logged server-side and replaced with a generic message.

### Rendering

Card text uses a deliberately tiny inline markup parser (`lib/inline-markup.ts`),
not Markdown: `**bold**`, `*italic*`, `` `code` `` and nothing else. `**` is matched
before `*`, and unclosed markers stay literal.

### Uploaded pages

A `Page` is an HTML document Jenn wrote elsewhere, stored whole in the `html`
column and joined to any number of groups through `PageGroup`. It has no date
and no relationship to a card. The HTML lives in the database rather than on
disk so the nightly `VACUUM INTO` backup covers it for free.

`/p/[slug]` renders nothing but `<iframe sandbox="allow-scripts">` around
`/p/[slug]/raw`. `allow-scripts` without `allow-same-origin` gives the framed
document an opaque origin: its JavaScript runs, but it cannot read cookies,
storage, or the teacher session. **Never add `allow-same-origin`** — with
`allow-scripts` beside it, the page can remove its own sandbox. The CSP on the
raw route is the second layer, and **no directive in it admits `https:`** —
`connect-src 'none'` closes fetch, XHR and beacon, but a subresource load is a
real GET request, so `img-src https:` alone would let a page exfiltrate what a
student typed via `<img src="https://…?d=answer">`. Nothing loads from a CDN;
self-contained files are the only supported kind. One residual is accepted and
unclosable: a sandboxed frame may navigate itself, and no CSP directive
prevents that. The raw route also answers a direct GET, so the page can be
loaded outside the iframe at the real origin; that is inert only because the
CSP travels with the response and the session cookie is httpOnly with no
`localStorage` in use.

There is no HTML sanitiser, deliberately. Sanitising would strip exactly the
interactivity the feature exists to preserve, and the sandbox already contains
what a sanitiser would defend against.

Both page lists — the student's shelf and the admin Pages tab — render
`PageTile` in a grid, each tile previewing its page live: `HtmlPreview` frames
`/p/[slug]/raw` at 500% and scales it by 0.2, so the page lays out at roughly
laptop width and is clipped to the tile. A frame sized *to* the tile would
render the page's own mobile breakpoint instead, a layout opening it never
produces. That frame is `sandbox=""` — **never add `allow-scripts` to a preview
frame.** A shelf mounts a dozen documents at once, and an animation or an
autoplaying `<audio>` inside a 160px thumbnail has no control surface to stop
it; the reasoning that justifies `allow-scripts` on `/p/[slug]`, where the
student chose to open the page, does not transfer. The cost is accepted: a page
drawn entirely by JavaScript previews blank, and that is undetectable from
outside an opaque origin. `PageTile` takes its preview as a `ReactNode` slot
rather than a slug, so planned support for links to pages we don't host adds a
renderer instead of changing the tile — a cross-origin URL usually cannot be
framed at all, so it will not be `HtmlPreview` with a different `src`.

Both grids are 1152px wide — the admin's content width — so a tile is the same
size on both sides. On the Pages tab that means the grid deliberately breaks out
of the 560px column the search field and filter chips stay in: four tiles at
560px were 128px each, too small to recognise a page by, which is the only thing
the preview is for. In the admin the tile links to `/p/[slug]` and a pencil icon
links to the editor, not the reverse — following a thumbnail should show the
page it is a thumbnail of.

A page carries `pinnedAt`, null when unpinned. A timestamp rather than a
boolean because pinned pages order among themselves by *when they were pinned* —
a boolean would leave them sorted by creation date, the ordering pinning exists
to override, and re-pinning would do nothing. `sectionPages`
(`lib/page-sections.ts`) splits a list into Pinned, This week, Last week, and
one section per older month; a pinned page appears **only** under Pinned, never
also under its date. It returns section *keys*, not labels, because the admin
says "This week" and the student says "Cette semaine" —
`lib/page-section-labels.ts` holds both mappings. `thisWeek` has no upper
bound: `weekRange` ends on Friday, so a closed range would drop a page added on
the Saturday into a month section below pages a week older than it. Sections
form over the admin's *filtered* set, so a search never leaves a heading above
nothing. Jenn pins from the tile footer; students see a marker and no control.

A page's slug is derived from its title once, at creation, and never moves
again — students bookmark these links. `POST /api/pages` exists because the
browser Jenn writes pages in is sandboxed and cannot complete a passkey login;
it is authenticated by `PAGES_UPLOAD_TOKEN` and returns 404 when that variable
is unset.

The admin editor shows no HTML at all: `PageEditor` holds the document in
state and `HtmlDropZone` takes a file, so the round trip for a correction is
download → edit in the tool she wrote it in → re-upload. The download is a
plain `<a download>` pointing at `/p/[slug]/raw`, which is why that route and
its CSP needed no change to support it.

One group is flagged `isEveryone` — on production it is `all` / "Everyone", the
row students already bookmark as `/g/all`. Every page assigned to it appears on
every student's shelf: `listPagesForGroup` fetches both sets and hands them to
`effectivePages` (`lib/effective-pages.ts`), so callers never learn inheritance
happened. That row cannot be deleted — `canDeleteGroup` is checked in
`deleteGroup` as well as in the UI, because deleting it would empty every
student's shelf at once and nothing would report an error.

In the admin, filtering the Pages tab by a student shows that student's
effective shelf rather than their assignments: the chip answers "what does
Marie have?", and a page shared with everyone is something Marie has.

### Lesson chat

A `Message` belongs to a group and carries `fromTeacher` rather than a sender
id, because there are exactly two participants and one of them has no row to
point at. There is no session or lesson model: the log is continuous and
`groupByDay` (`lib/chat-day.ts`) computes the date separators, in UTC like
every other date here. Retention is forever, deliberately — this is a teaching
record. Jenn can delete an individual message, and can regenerate a student's
tokens from the admin, which revokes both at once.

Jenn chats from `/g/[slug]` itself — `/admin/[slug]` no longer exists (it was
the override-card editor removed above, and never hosted chat). She opens a
student from the Students tab, which links to `/g/[slug]?k=<chatToken>`, and
`chatRole` (`lib/chat-access.ts`) treats her session as the teacher there
regardless of the token, so a message she sends stores `fromTeacher: true`.
That is a separate question from whether the page shows her any chat at all,
though: the floating `ChatFab` only renders when the page's own `unlocked`
flag is true, and `unlocked` checks only the token cookie against
`group.chatToken` — never the teacher session. A teacher who opens a
student's page without that token sees no chat, same as anyone else. Once
unlocked, she additionally gets the delete control and the read-marker
(`markChatRead`) that used to live on the deleted admin route.

Each student row carries two tokens. `chatToken` unlocks the files tab and the
chat on `/g/[slug]`; `filesToken` addresses `/f/[token]` and nothing else, so
sharing a files link never hands over the conversation. As of 2026-07-31 the
admin shows only the chat link, so `filesToken` has no UI surface, though it
remains minted and rotated alongside `chatToken` and reachable only by reading
it from the database; restoring the files link means adding a control back to
the Students tab, not changing the model. The everyone group has neither, and
`chatRole` (`lib/chat-access.ts`) refuses it before it checks
anything else — not even the teacher can open a conversation there. **The
daily card stays public**: an untokened visit to `/g/marie` renders exactly
what it rendered before chat existed, which is what keeps every old bookmark
working and means a forwarded plain link leaks nothing. The everyone group's
files tab is the one deliberate exception, public without a token, because
that shelf has no conversation to protect. A wrong token is a 404, never a
403.

`middleware.ts` exists for one job: moving `?k=` out of the URL into an
httpOnly cookie, so the secret stops riding in browser history. The cookie's
*name* is per-student (`cookieNameFor(slug)`), but its path is `/` rather than
`/g/<slug>` — a path-scoped cookie would never be sent to `/api/chat/<slug>`,
so the name is what keeps students separated, not the path. `cookieNameFor`
lives in its own dependency-free `lib/cookie-name.ts`, imported by both
`middleware.ts` and `lib/student-tokens.ts`: middleware runs on the Edge
runtime, and `lib/student-tokens.ts` needs Node's `crypto` to mint tokens, so
importing it from middleware would drag `crypto` into the Edge bundle. Merging
the two modules back would break every `/g/*` request. Middleware does not
validate the token — that needs the database. The page validates what it is
handed.

Delivery is SSE (`app/api/chat/[slug]/stream`) with an in-process
`EventEmitter` (`lib/chat-bus.ts`). **That emitter is correct only because pm2
runs this app as a single process in fork mode.** Under cluster mode a message
would reach only the viewers on the same worker, silently. Two details keep the
stream alive behind nginx without any nginx change: `X-Accel-Buffering: no`
disables its response buffering, and a `: ping` comment every 20 seconds stays
under the default 60-second `proxy_read_timeout`. Messages are ordered by
`(createdAt, id)`, not `createdAt` alone — a review found that two messages
landing in the same millisecond made `gt createdAt` drop the second one on
every future reconnect, since a `Last-Event-ID` replay has no other anchor to
resume from.

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

## Conventions

- **Logic belongs in `lib/`.** Anything with a rule in it — date handling, card
  resolution, section manipulation, idiom splitting, markup parsing — is a pure
  function in `lib/` with a test in `tests/lib/`. Components and Prisma access are
  not unit-tested; the pure modules underneath them are. Follow this when adding
  behaviour.
- **Comments explain the "why", especially the counter-intuitive.** Most comments in
  this codebase record a decision and the failure that motivated it. Match that —
  don't add comments that restate the code.
- **"Student" is the UI word, "Group" is the code word.** The admin renders
  "Students", "Add a student", and student-facing error copy, but the
  `Group` model, its routes (`/g/[slug]`, `/f/[token]`), Prisma queries, and
  the `?tab=groups` URL value were left as `group` — renaming those would
  have meant a migration and a route move for no behavioural gain. Match
  whichever layer you're in: `group` in `lib/`, `prisma/`, and route
  segments; `student` in copy and in new code that has no reason to touch
  the model, like `lib/student-slug.ts` and `lib/student-tokens.ts`.
- **Styling:** Tailwind v4 via PostCSS, no `tailwind.config`. Design tokens are CSS
  custom properties in `app/globals.css`, and there are two distinct palettes: the
  general app (`--color-*`) and the Québec flashcard template (`--card-*`). The
  latter belongs to the flashcard template and travels with it rather than with
  a route: the student card pages, the landing page's sample card, the admin
  card editor — which is a live representation of the student's card — and
  `components/ui/Tile.tsx` and `components/ui/PageTile.tsx`, which the admin
  student and page lists render so Jenn sees her pages the way her students do.
  (`Tile` is the row; `PageTile` is the previewed tile. The page lists use
  `PageTile`, the students list still uses `Tile`.) Repeated flashcard class strings live
  in `components/card-styles.ts` — extend that rather than duplicating the
  strings.
- **Imports** use the `@/` alias for repo-root-relative paths.
- Server actions call `revalidatePath` for the page they affect. Deletes use
  `deleteMany` so a double-click or stale tab is a no-op rather than a P2025.

## Docs

`docs/superpowers/specs/` and `docs/superpowers/plans/` hold the design specs and
implementation plans for each feature, dated. Read the relevant spec before
reworking a feature — the reasoning behind the current behaviour is usually there.

`docs/DEPLOY.md` is the everyday loop: local checks → commit → push → CI → one
`deploy.sh` run on the server, plus rollback and failure modes. Pushing to `main`
runs CI but does **not** deploy; the server only changes when someone runs the
deploy step.

`docs/DEPLOYMENT.md` is the full production runbook behind it: EC2 + pm2 + nginx +
certbot, SQLite on the box with nightly `VACUUM INTO` backups to S3. It covers
restoring the database and passkey handover/lockout recovery.
