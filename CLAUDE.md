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
| `/g/[slug]` | students | the card for `?date=` (public); `?tab=files`, `?tab=board` and the chat need the token, teacher included — a teacher session adds only the delete and read-marker controls once unlocked, plus *Nouveau tableau* and a delete per board — except the everyone group, whose files are public and which has neither chat nor whiteboard. Both extra tabs are present for anyone unlocked, empty state and all. **An unlocked teacher has no card tab** and lands on Files; an untokened teacher is just a visitor and still gets the public card. Adding a link or a page is a `+` FAB left of the chat button, present on every tab, and either party may pin a page |
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

### Files: pages and links

A `Page` is one of two things, discriminated by `kind`: an HTML document Jenn
wrote elsewhere, stored whole in the `html` column, or a link to something we do
not host, stored in `url`. Either way it is joined to any number of groups
through `PageGroup`, has no date and no relationship to a card. The HTML lives
in the database rather than on disk so the nightly `VACUUM INTO` backup covers
it for free.

The earlier spec said there was no `kind` column because there was one kind of
page. That was correct when it was written and is now retired.

`readPageKind` (`lib/page-kind.ts`) resolves an unrecognised `kind` by the `url`
column rather than defaulting to `"html"`: the row most likely to be broken is
one with a url and no document, and calling that an HTML page renders an empty
iframe instead of a working link. Same defensive contract as `readSections` and
`readOps`.

`/p/[slug]`, `/p/[slug]/raw` and `POST /api/pages` all refuse a link row — 404
or 400, never a redirect to the external URL. An open redirect on a public route
is a phishing primitive.

A link's tile preview is chosen from its URL alone by `linkBrand`
(`lib/link-brand.ts`) and drawn from bundled SVG in `components/ui/BrandGlyph.tsx`.
**No request is made, by the server or the browser** — not a favicon, not an
og:image. A server-side og:image fetch would be request forgery on a
student-supplied URL, and for the case this feature exists to serve — a Google
Doc that is not public — it would fetch a sign-in page. The glyphs are
product-coloured icons, deliberately not the official marks.

`parseLinkUrl` (`lib/link-url.ts`) rejects every scheme but http and https.
Students supply this string, and a `javascript:` URL in an href is stored XSS.

Writes to a shelf — adding a link, pinning, deleting a link — are authorised by
`shelfRole` (`lib/shelf-access.ts`), **not** `chatRole`. `chatRole` refuses the
everyone group before it checks the teacher, which is right for a conversation
and wrong for curation: the shared shelf is exactly the one Jenn needs to fill.
A student may add a page as well as a link — `addShelfPage` is `addShelfLink`'s
sibling and shares its `requireShelfRole` guard. They may delete only what they
added themselves, and only while nobody else can see it (`canStudentDelete`,
which keys off `addedByStudent` rather than the kind, because the kind used to
stand in for it and stopped being able to); the server re-checks that regardless
of which controls the tile rendered. Because a student can now publish a
document served from our origin, and a slug is derived from a title and so is
guessable, `/p/[slug]` carries `robots: { index: false, follow: false }` and its
raw route an `X-Robots-Tag`. The sandbox and the CSP are unchanged and are still
what contain anything scripted inside it. `/f/[token]` is read-only — `filesToken` addresses a shelf and
nothing else, so a link forwarded to a parent must not carry the power to write
to it.

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
rather than a slug, and links cashed that in: `LinkPreview` is a second renderer
beside `HtmlPreview` and the tile did not change, because a cross-origin URL
usually cannot be framed at all. The tile's `external` flag is the other half —
an off-site title is a plain `<a target="_blank">` and must keep
`rel="noopener"`, or the opened page gets a `window.opener` handle back to this
tab and can navigate it while the student is reading.

**A tab is present for anyone unlocked, empty state and
all** — Files and
Whiteboard both. The original reason was that a student with an empty shelf
could not otherwise reach the control that fills it; the add controls are a
page-level FAB now, so that argument no longer holds and the rule stands on the
weaker one that remains: a tab that vanishes when empty makes the shelf look
broken rather than empty, and *Nouveau tableau* still lives inside the board
tab. The everyone group is the exception either rule has to name: its
shelf is public and has no unlocked state to key off, so `files` is
`unlocked || pages.length > 0`.

Both grids are 1152px wide — the admin's content width — so a tile is the same
size on both sides. On the Pages tab that means the grid deliberately breaks out
of the 560px column the search field and filter chips stay in: four tiles at
560px were 128px each, too small to recognise a page by, which is the only thing
the preview is for.

A preview frames `/p/[slug]/raw?v=<token>`, where the token is
`pageVersion(page.updatedAt)`. The route recomputes it and answers **only an
exact match** with `private, max-age=31536000, immutable`; an absent or stale
`?v=` still gets `no-store`. Accepting any `?v=` would let a bookmarked stale
token pin a browser to a deleted document for a year, which is the one way this
scheme can fail. Nothing needs purging — an edit bumps `updatedAt`, which
changes the URL. The accepted cost is that a versioned response now reaches the
browser's disk cache, which the blanket `no-store` prevented. This removes the
fetch, not the re-layout of a dozen documents at 500%; `loading="lazy"` is
still what handles that.

In the admin the tile links to `/p/[slug]` and a pencil icon
links to the editor, not the reverse — following a thumbnail should show the
page it is a thumbnail of.

A pin is a `PagePin(pageId, groupId, pinnedAt)` row, not a column on the page:
the same page is pinned on one student's shelf and not on another's. Still a
timestamp rather than a boolean, for the reason it always was — pinned pages
order among themselves by *when they were pinned*, a boolean would leave them
sorted by creation date, the ordering pinning exists to override, and re-pinning
would do nothing.

**Pins do not inherit.** A pin on the everyone shelf shows at `/g/all` and
nowhere else, unlike the page itself. The cost is that pinning one reference for
the whole class is one pin per student; the alternative was a second merge rule
to keep in step with `effectivePages`, and two merge rules drift.

`PagePin` is not a mirror of `PageGroup`. A student can pin a page that reaches
them through the everyone group, so a pin can exist for a pair that has no
`PageGroup` row.

`applyPins` (`lib/page-pins.ts`) folds one shelf's pins on before `sectionPages`
runs, which is why `sectionPages` is unchanged and still reads nothing but
`pinnedAt`. In the admin, which pin applies depends on the active student chip,
and the pin control is **disabled under "All"** — "All" is not a shelf, so with
no student selected nothing is pinned and **the Pinned section does not appear
at all**. That is correct, not a missing feature; it looks like a bug otherwise.

`sectionPages`
(`lib/page-sections.ts`) splits a list into Pinned, This week, Last week, and
one section per older month; a pinned page appears **only** under Pinned, never
also under its date. It returns section *keys*, not labels, because the admin
says "This week" and the student says "Cette semaine" —
`lib/page-section-labels.ts` holds both mappings. `thisWeek` has no upper
bound: `weekRange` ends on Friday, so a closed range would drop a page added on
the Saturday into a month section below pages a week older than it. Sections
form over the *filtered* set on both sides — the student's shelf has the search
field and a kind filter now too — so a search never leaves a heading above
nothing. Both parties pin from the tile footer; a read-only visitor
(`/f/[token]`, the public everyone shelf) gets the corner marker instead, without
which a page sitting above a newer one looks like a sorting bug.

A page's slug is derived from its title once, at creation, and never moves
again — students bookmark these links. `POST /api/pages` exists because the
browser Jenn writes pages in is sandboxed and cannot complete a passkey login;
it is authenticated by `PAGES_UPLOAD_TOKEN` and returns 404 when that variable
is unset.

Neither editor shows HTML: both hold the document in state and
`HtmlPasteBox` takes a paste, so the round trip for a correction is download →
edit in the tool she wrote it in → copy → paste. The download is a plain
`<a download>` pointing at `/p/[slug]/raw`, which is why that route needed no
change to support it. The box's `onPaste` calls `preventDefault()` and reads
the clipboard itself, so the markup never enters the field — accepting it and
clearing it afterwards shows the document for a frame and reads as a failure.

`PageEditor` is the edit form only. Creating a page is `NewPageForm`, in the
FAB's sheet, where **the paste is the submit**: the title comes from the
document (`titleFromHtml`) and there is nothing else on that form. Pasting into
`PageEditor` does *not* save, because that screen has a title and an audience a
paste must not commit behind her. A derived title becomes a permanent slug —
the title stays editable afterwards and the slug never does — which is the
accepted cost of the one-gesture flow.

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

That chip now drives three things, which is why it lives in `PagesTabClient`
rather than inside `PageList`: which pages the list shows, which shelf a pin
lands on, and the default audience for a new page or link. The default follows
the filter only until Jenn ticks a box herself — the same don't-clobber rule as
`titleFromFile` directly beside it, and for the same reason: a default that
overwrites a choice she made is worse than no default. `PageEditor` implements
it as a render-phase comparison against the previous prop, not a `useEffect`;
`react-hooks/set-state-in-effect` rejects the effect form, and an effect would
render once with the stale selection before correcting it.

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
can never have a whiteboard. The Whiteboard tab follows the shared tab-presence
rule stated under *Files: pages and links* — present for anyone unlocked, empty
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
