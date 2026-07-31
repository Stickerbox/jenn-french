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
| `/g/[slug]` | students | the card for `?date=` (public); `?tab=files` and the chat need the token, teacher included — a teacher session adds only the delete and read-marker controls once unlocked — except the everyone group, whose files are public and which has no chat |
| `/login` | teacher | passkey register/authenticate |
| `/admin` | teacher | three tabs via `?tab=` — the global card for `?date=` (default), groups, pages |
| `/p/[slug]` | public | an uploaded HTML page, in a sandboxed iframe |
| `/f/[token]` | students | that student's files, at an opaque unguessable link |
| `/admin/pages/[slug]` | teacher | edits one uploaded page |
| `POST /api/pages` | token | publishes a page from outside the browser |
| `POST /api/chat/[slug]` | token or teacher | send one message |
| `GET /api/chat/[slug]/stream` | token or teacher | the SSE stream |
| `/api/auth/*` | — | WebAuthn ceremonies (server actions everywhere except here, `/api/pages`, `/api/chat/*`, and `/p/[slug]/raw`) |

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
  `components/ui/Tile.tsx`, which the admin group and page lists render so Jenn
  sees her pages the way her students do. Repeated flashcard class strings live
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
