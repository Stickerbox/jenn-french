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

`happy-dom` is a devDependency for exactly one file, `tests/lib/snapshot-dom.test.ts`, opted
into with a per-file `@vitest-environment happy-dom` docblock rather than a
config change — the global environment stays `node`, which every other test in
the suite runs against and none of them needs a DOM.

CI (`.github/workflows/ci.yml`) runs, in order: `prisma generate` → lint → `tsc
--noEmit` → test → build. Run those locally before claiming work is done.

Env vars live in two gitignored files: `.env` holds `DATABASE_URL`
(`file:./dev.db`), `.env.local` holds `RP_ID`, `ORIGIN`, `ANTHROPIC_API_KEY`,
`PAGES_UPLOAD_TOKEN`. Prisma reads `.env`; Next.js reads both.

## Routes

| Route | Who | Notes |
|---|---|---|
| `/` | public | landing page — **but a signed-in visitor is redirected off it**: a teacher session goes to `/admin`, a live student cookie to that student's `/g/[slug]`. `/?stay=1` is the escape hatch and renders the page for anyone; the link to it is drawn only when a redirect would otherwise have fired |
| `/g/[slug]` | students | the card for `?date=` (public); `?tab=files`, `?tab=board` and the student's own chat need the student to be signed in — a valid `chatToken` cookie **and** a claimed account — teacher included, who once unlocked also gets *Nouveau tableau* and a delete per board — except the everyone group, whose files are public and which has neither chat nor whiteboard. **Jenn's own chat is her inbox FAB and follows her session, not the token** — the only thing on this page that does, and it carries the delete and read-marker controls with it. Everything the gate controls is unchanged. Both extra tabs are present for anyone unlocked, empty state and all. **An unlocked teacher has no card tab** and lands on Files; an untokened teacher is just a visitor and still gets the public card. Adding to the shelf is a `+` FAB left of the chat button, present on every tab, and either party may pin a page. **Its menu depends on who is looking**: a student gets *Ajouter un lien* and *Ajouter un PDF*, Jenn gets *Add a link*, *Add a page* and *Add a PDF* — she keeps the full admin menu on the one screen where "put this on Marie's shelf" is the obvious act, and the student loses the HTML paste box, because they may upload a PDF and not a website. `addShelfPage` keeps its guard and its tests; what changed is which control is drawn. Jenn also gets a pencil on each editable tile. The card tab carries the week's five day dots, a week-range line that opens a month calendar, and *Aujourd'hui*; a day with no card cannot be selected. A teacher session also adds a *← Back to admin* link and turns the header line into *Marie Dupont's page* in place of the student's *Bonjour Marie*, and **suppresses `LiveBanner`** — she is the only person who can be drawing |
| `/signin` | students | sign in with an email address and a password, from anywhere |
| `/login` | teacher | passkey register/authenticate |
| `/admin` | teacher | three tabs via `?tab=` — the global card for `?date=` (default), groups, pages |
| `/p/[slug]` | public | an uploaded HTML page, in a sandboxed iframe; a pdf row redirects to `/p/[slug]/pdf` |
| `/p/[slug]/pdf` | public | an uploaded PDF, in the browser's own viewer |
| `GET /p/[slug]/thumb` | public | a page's cached preview picture — a pdf's first page, or an html page's captured top |
| `/f/[token]` | students | that student's files, at an opaque unguessable link |
| `/admin/pages/[slug]` | teacher | edits one uploaded page |
| `POST /api/pages` | token | publishes a page from outside the browser |
| `POST /api/chat/[slug]` | token or teacher | send one message |
| `GET /api/chat/[slug]/stream` | token or teacher | the SSE stream |
| `GET /api/inbox/stream` | teacher | every conversation on one stream, plus `?board=` |
| `POST /api/whiteboard/[slug]/finish` | teacher | saves a whole board |
| `POST /api/whiteboard/[slug]/open` | teacher | starts a live board |
| `POST /api/whiteboard/[slug]/ops` | teacher | appends and fans out ops |
| `POST /api/whiteboard/[slug]/discard` | teacher | drops a live board, saving nothing |
| `GET /api/whiteboard/[slug]/[id]` | token or teacher | a board's ops, for the JPEG export |
| `/g/[slug]/w/[pageSlug]` | student or teacher | the worksheet shell: full-screen frame, version switcher, Save pill, print pill |
| `GET /g/[slug]/w/[pageSlug]/raw` | student or teacher | `?v=blank\|student\|teacher`; the document, under `SANDBOXED_DOCUMENT_CSP` |
| `GET /g/[slug]/w/[pageSlug]/pdf` | student or teacher | a pdf version, top-level, in the browser's own viewer |
| `POST /api/worksheets/[slug]/[pageSlug]` | student or teacher | saves the caller's own slot |
| `/api/auth/*` | — | WebAuthn ceremonies (server actions everywhere except here, `/api/pages`, `/api/chat/*`, `/api/inbox/*`, `/api/whiteboard/*`, `/api/worksheets/*`, and `/p/[slug]/raw`) |

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
`mondayOf` is where that rule lives and `weekDates` returns the five teaching
days of any date's week. `lib/month-grid.ts` keeps its own copy of the same
arithmetic on purpose — it steps over the weekend while walking a whole month,
which is a different job.

One deliberate exception, added 2026-08-04: **chat message grouping and
timestamps are in the reader's local zone**, not UTC. `lib/chat-time.ts` is the
only module here that omits `timeZone: "UTC"`, and `groupByDay` keys on its
`localDayKey`. A card belongs to a teaching day Jenn picked; a message belongs
to the moment someone typed it, and "8:02 p.m." under tomorrow's date is not
consistency. The consequence: a message's day heading depends on who is reading
it, and nothing in the chat may render on the server — see *Lesson chat*.

The student page clamps `?date=` to `latestViewableDate(today)` so students cannot
read ahead of pre-posted cards. `parseAdminDate` deliberately does *not* clamp —
pre-posting is the teacher's workflow, and clamping would make those days
unreachable from `/admin`. It does, however, snap a weekend date forward to the
following Monday, including its `today` fallback, so `/admin` never opens on a
non-teaching day; the five-column calendar is the UI half of the same rule.

Two more things enforce the same bound now that the card page has a calendar
students can page through. `listCardDates` (`lib/cards.ts`) filters to
`<= latestViewableDate(today)` **in the query**, so the dates of pre-posted
cards never reach the browser at all, and `isSelectableCardDate`
(`lib/card-dates.ts`) re-checks it, because the calendar can page into a month
the query said nothing about. A day with no card is disabled rather than absent:
a calendar missing a Tuesday reads as a rendering fault. One value —
`latestViewableDate(today)` — is both that ceiling and the day *Aujourd'hui*
goes to, passed as a single prop because they are the same rule; on a weekend
that is the Friday that closed the week, so the button appears to do nothing if
you push the real Saturday and let `parseDate` clamp it back.

### Auth

Exactly one teacher and exactly one passkey. `register-begin` returns 400 once a
passkey exists, and there is no UI to add a second or remove one — transferring the
account means deleting the `Passkey` row on the server (see `docs/DEPLOYMENT.md`).
The session is a 7-day httpOnly cookie holding the teacher id (`lib/session.ts`);
deleting the passkey does not invalidate it.

Students sign in with an email address and a password, on `/g/[slug]` itself.
`?k=<chatToken>` is no longer a key: it is a **single-use invitation** that
permits creating the account, and the first sign-in is the sign-up. Claiming
**rotates `chatToken`**, which spends the invitation — without that rotation,
`unlocked` (`holdsToken && claimed`) would admit anyone still holding a
forwarded copy of the same link, with no password. `filesToken` is not rotated
on claim, only on reset.

`studentGate` (`lib/student-gate.ts`) decides which of six states a visitor is
in, and its clause order is the specification — see the comments. Two clauses
exist for Jenn specifically: she must never be shown a sign-up form she could
complete on a student's behalf, and after a claim her stored cookie is stale, so
she is told to reopen the student from the admin rather than shown a student
sign-in form.

`authPanelMode` sits beside it and answers a narrower question — which form, if
any, to render — and returns `null` for the teacher in every state. That is not
cosmetic: the panel's signed-in mode is *Se déconnecter*, and `signOutStudent`
clears the **student's** cookie for that slug, which is the cookie `unlocked` is
derived from, so the control offered her a way to lock herself out of the Files
and Whiteboard tabs. It is a predicate rather than a seventh gate state because
`unlocked` compares against `signed-in` and a new state would have to be added
to that comparison too.

`unlocked` is derived from the gate and still never consults the
teacher session, which means **she cannot open the chat or a board for a student
who has not signed up yet**. That is deliberate: there is nobody on the other
end. Pages can still be assigned and pinned to that student from the admin.

Passwords are bcrypt, cost 12, through `lib/password-hash.ts` — **the async API
only**, because one pm2 fork process serves every SSE stream and a synchronous
hash would stall the `: ping` heartbeats. The 72-byte cap in
`lib/student-credentials.ts` is not cosmetic: bcrypt silently truncates past it,
and `tests/lib/password-hash.test.ts` pins that behaviour so the cap is not
"cleaned up" later. Sign-in failures are one message that names both fields, an
unclaimed student still costs a hash, and the form renders identically either
way — three halves of one defence against slug enumeration.

`resetStudentSignIn` (`app/actions.ts`) replaces the old
`regenerateStudentLinks`: it clears the credential and rotates both tokens,
because clearing a password without rotating would leave whoever is signed in
still signed in. It obliges Jenn to send the new invite — the student's page
cannot tell them their account was reset without telling a stranger the same
thing.

**One student, one token, one cookie.** A student has exactly one `chatToken`,
and therefore at most one `student-token-<slug>` cookie in their browser. That
is a product fact, not an accident of the current code: nothing here should
branch on a browser holding two students' cookies, and any text implying one
person manages several students is wrong. It is what lets the landing page take
the first `student-token-*` cookie it finds and redirect on it with nothing to
disambiguate (`studentSlugFromCookies`, `lib/landing-redirect.ts`).

That page still validates before it redirects, which is the part worth keeping.
It resolves the cookie against the database and goes to `/g/[slug]` **only** for
the state `studentGate` calls `signed-in` — the presented value equals the live
`chatToken` and `passwordHash` is non-null. A stale cookie, or one naming a
deleted group, falls through to the landing page: bouncing someone into a
sign-in form they did not ask for is worse than showing them Jenn's bio, and a
404 in place of the marketing page is worse still. The accepted cost is that
reading a cookie makes `/` **dynamic** rather than static. Middleware could have
kept it static, but middleware runs on the Edge runtime with no database, so it
could not tell a live token from a spent one.

**`/signin` is a second door, not a change to `/login`.** A student who has
bookmarked nothing — or who is on a new phone — had nowhere to go, because
sign-in was per-page and the form was scoped to the slug in the URL.
`signInByEmail` takes an address and a password and redirects to that student's
page. One page for both audiences was rejected: it would show every student a
*Sign in with passkey* button that is not for them, and put a student form on
the teacher's page. `/login` keeps the passkey ceremony and stays unadvertised,
and `signInStudent` is untouched, so a student who still has their link never
sees `/signin`.

`Group.email` is `@unique` for it, which retires the schema's old argument
against uniqueness — that argument was right when sign-in was scoped to a slug,
and a door taking an address and nothing else has to have that address name one
student. The alternatives were worse: silently choosing one of the matches, or a
chooser that reads other students' names out to whoever typed the address.
`claimStudent` catches the resulting `P2002` and returns a specific sentence —
the one specific message in an area whose whole design is uniform failures,
because the uniform ones are about *sign-in*, where naming which half was wrong
is enumeration, and a claim is already authorised by a single-use invite for a
named student.

Every defence in `signInStudent` is carried across deliberately, because this
endpoint is reachable **without knowing any slug** and is therefore a better
target than the per-page form: one message for every failure, a hash performed
even when no group matches (an instant answer would say which addresses are
real), and the throttle — `isLockedFor`, keyed `email:…` rather than `slug:…` so
the two namespaces cannot share a counter. Measured: a wrong password, an
unknown address and an unclaimed student all answer in ~305ms with the same
sentence, and the eleventh attempt locks.

Nothing here sends email. The address is stored for newsletters and chat alerts
later; "I forgot my password" is Jenn pressing Reset sign-in.

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

### Files: pages, links and PDFs

A `Page` is one of three things, discriminated by `kind`: an HTML document Jenn
wrote elsewhere, stored whole in the `html` column; a link to something we do
not host, stored in `url`; or a PDF she uploaded, stored whole in the `pdf`
column with its length in `pdfSize`. Exactly one content column is populated,
and `savePage` writes every one of them on every write — three to `null` — so a
replacement at the same slug can never leave a stale column behind for
`readPageKind` to choose between. Either way the row is joined to any number of
groups through `PageGroup`, has no date and no relationship to a card.

The HTML and the PDF bytes live in the database rather than on disk so the
nightly `VACUUM INTO` backup covers them for free: it covers a column, and a
directory not at all. A file on disk would be a second thing to restore in a
runbook whose restore is one `sqlite3` command, and it would have to survive a
deploy that rebuilds the app in place. `Bytes` on SQLite is already proven here
— `Passkey.publicKey` is one — so the idioms are its: `Buffer.from(...)` in,
`new Uint8Array(...)` out.

**A student may upload a PDF to their own shelf.** `addShelfPdf` is the third
sibling of `addShelfLink` and `addShelfPage` and shares their
`requireShelfRole` guard, so the everyone group and an untokened visitor are
refused by a rule that already existed and was already tested. `createPdfPage`
and `updatePdfPage` remain `requireTeacher()` — those are the *admin's* upload,
which takes an audience and can reach any shelf; two entry points because they
answer to different authorities, not because the bytes differ.

The earlier spec refused this, and said a student upload "would need
`canStudentDelete` extended from rows-with-a-url to rows-with-a-blob — a
separate decision." This was that decision, and the extension turned out to be
already paid for: `canStudentDelete` had independently been rewritten to key off
`addedByStudent` rather than `kind` — its own comment anticipates "if a third
kind ever appears" — so a student's own PDF, assigned to their shelf alone, is
already deletable by them, and `deleteShelfLink` re-checks it server-side
regardless of which controls a tile rendered. **`canStudentDelete` needs no
change, and changing it would be the wrong move.** `SavePageInput`'s pdf branch
gained the `addedByStudent` field its comment used to say it deliberately
lacked.

The other half of the old refusal — unvalidated binary in the database served
from our own origin — is answered exactly as it is for Jenn: `validatePagePdf`,
`nosniff`, `contentDispositionInline`, and no sanitiser for the reason there is
no HTML one. What changed is *who* can reach it, and the honest statement is
that a student can now put 3 MB of bytes on a public slug. The mitigations are
the shelf's existing ones: the slug is derived from a title, `/p/[slug]` carries
`noindex`, and Jenn can delete anything on any shelf.

`MAX_PDF_BYTES` is 3 MB **because** nginx's `client_max_body_size` on the server
is `4m` (`docs/DEPLOYMENT.md` item 11). Raising the cap means an SSH session and
an nginx reload first; until someone does it the failure is a raw 413 that Next
never sees and the app cannot explain. `validatePagePdf` checks the size and
that the bytes begin `%PDF-`, with the same limited ambition as
`validatePageHtml`'s `includes("<")` — catch the wrong file, do not parse the
format. There is no PDF sanitiser, for the reason there is no HTML one.

The bytes travel to the server as a `File` in `FormData`, which is a deliberate
exception to the earlier rule that a page action takes a string and never
handles a file: base64 costs a third more, so 3 MB of PDF would arrive as 4 MB
against a 4 MB limit. The HTML path keeps its string argument.

`updatePageMeta` (`lib/pages.ts`) writes a title and an audience and touches no
content column, so renaming a PDF page does not read and rewrite 3 MB — and,
more importantly, `savePage` keeps its every-column invariant with no
"leave the bytes alone" hole in it.

The earlier spec said there was no `kind` column because there was one kind of
page. That was correct when it was written and is now retired.

`readPageKind` (`lib/page-kind.ts`) resolves an unrecognised `kind` by `pdfSize`
and then `url`, rather than defaulting to `"html"`: the row most likely to be
broken is one with content and a wrong kind, and calling that an HTML page
renders an empty iframe instead of a working link or document. Same defensive
contract as `readSections` and `readOps`.

That is also why `pdfSize` is a column rather than `pdf.length`. `readPageKind`
cannot discriminate on a column the shelf refuses to load, and no shelf query
selects `pdf` any more than it selects `html` — the same reason its fallback
reads `url`. A nullable integer is a signal a shelf can afford. It pays for
itself twice: it is what `PdfPreview` puts under the glyph, via
`formatFileSize`. The argument is **required**, not optional, so the compiler
names every query that has to select it; a caller that quietly omitted it would
resolve a broken pdf row as `"html"`, which is the precise failure the function
exists to prevent.

**Either kind of page can carry a picture of itself**: `thumb` holds a JPEG and
`thumbAt` says when it was written. Page 1 for a pdf, rendered by pdf.js; the
top of the laid-out document for an html row, via the `?capture=1` harness
below. One pair of columns rather than two, because they mean *the picture* and
*the existence signal plus the cache version* and neither meaning was ever about
PDFs — a second pair would duplicate both arguments and give `savePage`'s
every-column invariant four columns to keep straight instead of two. (They were
`pdfThumb`/`pdfThumbAt` until 2026-08-04; if you find the old names, that is
why.)

Two columns, because the second does two jobs a boolean could not. It is the
**existence signal**, so no shelf query ever selects `thumb` — the same lesson
`pdfSize` records one column earlier, since a tile grid that loads a blob to
decide whether to draw a picture has already paid for the picture it might not
draw. And it is the **cache version**: `/p/[slug]/thumb` answers
`public, max-age=31536000, immutable`, which is safe **only** because the tile
appends `?v=<thumbAt>`. On a stable URL that year would pin a replaced
document's picture in every browser that had ever seen it. That route and the
two previews are three parts of one decision and none can change alone.

**Renaming that migration is a trap worth remembering.** Prisma read the column
rename as a drop plus an add and generated an `INSERT ... SELECT` carrying
neither column, which would have discarded every stored preview silently, with a
green migration. The migration is edited by hand to move the bytes. Read the
generated SQL for any rename on SQLite.

The bytes are a `Bytes` column and **not** a base64 data URL in a `String`,
which is what `Whiteboard.thumbnail` is. That one is inlined into an `<img src>`
and has no route to be served from; this one has three, so base64 would cost a
third more room in a database the nightly `VACUUM INTO` copies whole, for
nothing.

**pdf.js never loads on a shelf.** `renderPdfThumbnail`
(`components/pdf-thumbnail.ts` — it moved out of `admin/` when students gained
the upload, and is no longer Jenn's browser only) runs it behind a dynamic
`import()` at the moment someone stages a PDF; the shelf receives a JPEG through
an `<img>`. The dynamic import matters more for that move, not less: without it
a PDF renderer would ship in a chunk the router could serve to a student who
never uploads anything. The accepted cost is that a student staging a PDF
fetches pdf.js once, at that moment, on their phone. That is what makes this consistent with the
2026-08-03 spec's refusal of pdf.js rather than a reversal of it — that refusal
was about a dozen renderers mounting at once on a student's phone. The module is
impure and so is deliberately **not** in `lib/`, the same split
`lib/whiteboard-thumbnail.ts` and `BoardEditor.renderThumbnail` already make. It
never throws: an encrypted, corrupt or zero-page PDF, a dead worker and a render
that ran long all return `null`, because **an upload must never fail because
a preview did not render** — the glyph is a working fallback.

**Two budgets, not one, and the difference is a bug that shipped.** A single
ten-second race used to cover both fetching pdf.js and rendering with it. The
renderer and its worker are most of a megabyte, so on weak LTE the download
alone spent the whole budget and every student on a poor connection got the
glyph for a PDF that would have rendered fine. `LOAD_TIMEOUT_MS` (30 s) covers
the dynamic import; `RENDER_TIMEOUT_MS` (10 s) covers only the decode and draw.
Neither may be folded back into one.

The upload does not wait the render out either. `ShelfFab.submitPdf` races the
staged job against `THUMB_WAIT_MS` (3 s) and saves without a picture if it has
not finished — the render starts at *staging*, while they read the title field,
so three seconds is a grace period rather than the budget. `NewPageForm` still
awaits its job in full, deliberately: Jenn uploads from a desktop.

Anything either rule drops is picked up by `ThumbBackfill`, which now covers
**pdf rows as well as html ones** through `renderAndStorePdfThumbnail` — it
fetches the stored bytes back through the public `/p/[slug]/pdf`, renders them,
and stores the JPEG through the same teacher-only `setPageThumb`. **No authority
widened**: a student's own thumbnail still arrives inside its own upload's
FormData under `requireShelfRole`, and the backfill only ever runs in Jenn's
admin. It stays serial and capped per visit, for the reason it always was.

`savePage` writes both columns on every call, joining its flat every-column
invariant. The reason is stronger here than the `readPageKind` one that
invariant was written for: a *missing* preview is a glyph, but a *stale* preview
is a picture of the previous document under the new document's title, which
reads as a working feature showing the wrong thing. `updatePageMeta` touches
neither, which is why renaming a PDF page keeps its picture.

PDFs uploaded before this existed have `null` in both, and are filled in by
`ThumbBackfill` above the next time Jenn opens the Pages tab. There is still
deliberately **no backfill *script***, for either kind: one would need the
server-side renderer this design refuses. The browser doing the work is the
whole point, and it is why the backfill is a component and not a `scripts/`
file.

`/p/[slug]/raw` and `POST /api/pages` refuse everything that is not an html row
— 404 or 400, never a redirect to the external URL. An open redirect on a public
route is a phishing primitive. `/p/[slug]/pdf` is their mirror: it refuses
everything that is not a pdf row, and `/p/[slug]/thumb` is the third, refusing
everything that has no stored picture — of *either* kind, since the columns
behind it mean "the picture" and never meant "the PDF's picture". Three routes rather than
one handler switching on kind, because they want different headers and one
handler under three header regimes is what a later edit gets wrong.

**A PDF is never framed.** iOS Safari renders only the first page of a PDF in an
iframe, which would silently truncate every multi-page worksheet on the device
most of these students use. So `/p/[slug]` **redirects** a pdf row to
`/p/[slug]/pdf` and it opens as a top-level navigation in the browser's own
viewer, which brings page navigation, zoom, search, print and download with it —
nothing to build. That redirect is not the open redirect a link row is refused:
it is a constant path on our own origin chosen by the row's kind, with no input
in it, so a bookmarked `/p/[slug]` keeps working. A shelf tile skips the hop and
points at `/p/[slug]/pdf` directly (`pageTarget`, `lib/page-target.ts`).

The PDF response carries `application/pdf`, `X-Content-Type-Options: nosniff`,
`no-store`, and a `Content-Disposition: inline` built by
`contentDispositionInline` (`lib/pdf-filename.ts`) — a security control, not a
formatter: it carries a title Jenn typed into a response header, where a `"`
ends the quoted form early and a CR or LF is header injection. It emits both an
ASCII-allowlisted `filename` and an RFC 5987 `filename*`, and falls back to the
slug when a title has nothing usable in it.

It carries **no CSP, deliberately.** A CSP on a PDF response constrains the
browser's own viewer, and what `default-src 'none'` does to PDFium or pdf.js
cannot be verified from a terminal — a directive that breaks the viewer renders
a blank frame, indistinguishable from a broken upload. The threat is bounded: a
PDF may carry JavaScript, but a PDF script engine has no DOM and no access to
this origin's cookies or storage, and these are the teacher's own uploads. If
PDFs are ever opened to student upload, revisit that first.

A PDF here is as public as a page: the slug is the only thing in front of it and
slugs are guessable. Anything identifying belongs in the chat, which is tokened.

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
of which controls the tile rendered.

A third way in needs no control at all: **a link in a chat message is filed on
that conversation's shelf automatically**, by `addChatLinks`
(`lib/shelf-links.ts`) from the chat POST route, for whichever party sent it.
`extractLinks` (`lib/chat-links.ts`) decides which URLs count and reuses
`parseLinkUrl` rather than validating again — one guard, not two places for
`javascript:` to get through. A URL needs either a scheme or a leading `www.`,
because prose is full of things a URL parser would read as a hostname —
`mot.Ensuite` and `3.Regarde` are the cases that rule exists for, and neither
begins with `www.`, which is what makes that exception narrow enough to be
safe; five per message, because 4000
characters is room for forty page rows; and a URL already on that shelf, or on
the everyone shelf it inherits from, is skipped rather than duplicated.
`addedByStudent` mirrors the sender, which is what decides whether the student
can later delete it. It never throws and it runs after `createMessage`: a link
that cannot be filed must not cost the message that mentioned it. The shelf
updates on the next navigation to it, not live — there is deliberately no SSE
frame for this. The everyone group is excluded for free, since `chatRole`
refuses it before anything else.

Because a student can now publish a
document served from our origin, and a slug is derived from a title and so is
guessable, `/p/[slug]` carries `robots: { index: false, follow: false }` and its
raw route an `X-Robots-Tag`. The sandbox and the CSP are unchanged and are still
what contain anything scripted inside it. `/f/[token]` is read-only — `filesToken` addresses a shelf and
nothing else, so a link forwarded to a parent must not carry the power to write
to it.

`/p/[slug]` renders nothing but
`<iframe sandbox="allow-scripts allow-modals">` around
`/p/[slug]/raw?printable=1`, plus the print pill. `allow-scripts` without `allow-same-origin` gives the framed
document an opaque origin: its JavaScript runs, but it cannot read cookies,
storage, or the teacher session. **Never add `allow-same-origin`** — with
`allow-scripts` beside it, the page can remove its own sandbox. The CSP on the
raw route is the second layer, and **no directive in it admits `https:`** —
`connect-src 'none'` closes fetch, XHR and beacon, but a subresource load is a
real GET request, so `img-src https:` alone would let a page exfiltrate what a
student typed via `<img src="https://…?d=answer">`. Nothing loads from a CDN at
render time; a self-contained document is the only kind that works, and
publishing makes one. One residual is accepted and
unclosable: a sandboxed frame may navigate itself, and no CSP directive
prevents that. The raw route also answers a direct GET, so the page can be
loaded outside the iframe at the real origin; that is inert only because the
CSP travels with the response and the session cookie is httpOnly with no
`localStorage` in use.

A page that arrives referencing a CDN is rewritten at publish time rather than
served broken: `inlinePage` (`lib/page-inline.ts`) folds each external script,
stylesheet, image and font into the document, so `'unsafe-inline'` and
`img-src data:` — already in the policy — are all it needs to render. **The CSP
was not widened to make this work and must not be.** The step runs between
validation and `savePage` on both write paths (`app/api/pages/route.ts` and
`createPage`/`updatePage` in `app/page-actions.ts`); `/p/[slug]/raw` still serves
`page.html` verbatim, so the served document can never drift from the stored one
and the `<a download>` round trip is unaffected.

The fetcher (`lib/asset-fetch.ts`) takes a URL out of a request body and returns
its response into a public document, which makes it an SSRF read primitive and is
why it has five controls rather than none: the host allowlist in
`lib/asset-policy.ts`, https only, `redirect: "error"` — without which an
allowlisted host answering `302` to `http://169.254.169.254/` would walk straight
past the allowlist — a timeout, a bounded read, and a content-type check per kind
so a CDN's 404 page never lands inside a `<script>`. Module CDNs are deliberately
absent from that list: an inlined ES module's `import` has nothing to resolve
against, so inlining one turns a blocked page into a broken one. It is injected
into `lib/page-inline.ts` rather than imported by it, the arrangement
`lib/whiteboard-hit.ts` uses, so the depth and budget rules are tested with a
fake and no socket.

Two fetches deep and no further, counted in fetches: `fonts.googleapis.com`
answers with CSS that names fonts on `fonts.gstatic.com`, so one level would
inline the stylesheet and leave the typeface wrong with nothing to report. An
asset that cannot be inlined — unlisted host, failed fetch, wrong content type,
or a document that would pass 2 MB — is **left exactly as it was and reported**,
never a reason to fail a publish: the same degrade-rather-than-throw contract
`readSections`, `readOps` and `readPageKind` have. The report reaches Jenn three
ways, because there are three ways in: `skipped` in the `POST /api/pages` reply
(printed by `tools/publish-dia-artifact.sh`, counted by the extension) and the
`SkippedAssets` notice, which **both** admin write paths render — `PageEditor`
and `NewPageForm`, whose sheet stays open when there is something to say rather
than closing over it.

A relative ref is resolved from the files uploaded beside the document, when
there are any. `tools/publish-dia-artifact.sh` collects them — the document's
own refs plus one level through each stylesheet, since a `styles.css` naming a
local `.woff2` is the same shape as the Google Fonts case that set the depth
rule — and sends them as `assets: [{ path, base64 }]`. `lib/asset-path.ts` is
the **only** normaliser: the script uploads each key as the ref was written,
unfolded, and the server folds both that key and the document's ref, so the two
sides agree by construction rather than by two implementations of one rule
staying in step. A ref that escapes the artifact folder is refused on the
script's side by resolving symlinks and comparing against the resolved root —
a link inside `site/` pointing at `~/.ssh` carries no `..` to test for, and this
publishes what it reads to a public URL. The admin's paste box and the browser
extension can see no directory, so they upload no bundle and their relative refs
keep the older reason: `relative` says only the page itself was published,
`missing` says files were uploaded and this one was not among them, and the cure
differs. The request body may now reach `MAX_UPLOAD_BYTES` (3 MB, under nginx's
`4m`) because it carries base64; the stored document is still capped at
`MAX_PAGE_BYTES`, and the two stopped being the same measurement.

`tools/publish-dia-artifact.sh` is **silent under Shortcuts and unchanged in a
terminal**. Every success-path message goes through `say()`, which draws nothing
without a TTY, and the macOS alert on failure was removed rather than left
unreachable: it existed because a Shortcuts action discards stdout, but the same
mechanism was surfacing success chatter as a banner announcing a byte count
about a step that had already finished. The knowing trade is that a silent
failure looks like a mis-clicked Shortcut, accepted because the flow ends with a
browser opening — so a failed publish is a click that did nothing — and because
a terminal run still reports in full. This is the environment detection the spec
allows for *presentation* and forbids for *selection*, since a slug is
permanent. On success it opens `/admin?tab=pages&edit=<slug>`, the edit overlay
with the list behind it, because the script publishes with no groups and picking
an audience is always the next step.

Artifacts titled *The X Brief* are never offered. Dia regenerates one on a
schedule and it is not teaching material, so `candidate_rows` drops it — that
one function is what the picker, `--list`, `--latest` and the title search all
read through, which makes the four agree by construction. The real titles are
*The Monday Brief - June 22*, so the pattern anchors at the start and at a word
boundary after *Brief* — **not** at the end of the string, which was the first
attempt and matched none of them. *The Brief History of Québec* survives because
the rule needs a word between *The* and *Brief*, and *Brief Notes* because it
does not start with *The*. Applied after `decode_entities`, and the filter runs
**before** the ten-row trim: trimming first spent the picker's slots on rows
that were then dropped, and Dia writes one of these most days. The deliberate consequence: searching for one reports *No
page whose title contains …*, which is correct for a rule saying these are never
published.

`scripts/backfill-page-assets.mjs` runs the same inliner over
pages published before this existed; like `backfill-sections.mjs` it imports
`../lib/*.ts`, which needs `scripts/run-ts.mjs` to resolve the `@/` alias —
Node's type stripper runs the TypeScript but resolves modules the way Node does.

`allow-modals` is the second token, and it is **not** comparable to the
forbidden one. `allow-same-origin` beside `allow-scripts` lets the page delete
its own sandbox, which collapses the whole model; `allow-modals` grants `alert`,
`confirm`, `prompt` and `print` — no origin, no cookies, no storage. It is there
because `window.print()` is gated behind it: without it the call inside the
frame is ignored outright. The worst it grants a hostile document is blocking
the tab with an alert loop, which the `allow-scripts` it already has could do
with `while (true)`.

Printing has to happen **inside** the frame: the shell cannot reach into an
opaque origin, and printing the shell prints one clipped page of a six-page
worksheet. So `/p/[slug]/raw?printable=1` appends a small listener
(`withPrintableBootstrap`, `lib/printable-bootstrap.ts`) and the pill posts
`"print-page"` into the frame. Three things about that are load-bearing:

- **The gate.** Only the shell asks for `?printable=1`. The admin's
  `<a download>` and every `HtmlPreview` thumbnail hit the route without it and
  get Jenn's bytes exactly as she uploaded them — injecting unconditionally
  would put our script in the file she downloads to edit, and the next upload
  would carry it back in.
- **A message, not a reload.** Re-pointing the iframe at a printable URL would
  reload the document and destroy every answer a student had typed into the
  worksheet, at the moment they were trying to keep them.
- **`event.source !== window.parent`, not `event.origin`.** The frame has an
  opaque origin and no origin string to compare against; which window is asking
  is the precise question, and the sandbox forbids popups, so no other window
  can obtain a handle to post through.

Print fidelity is the browser's, and it can be poor for a page written for a
screen. The fix belongs upstream, in `@media print` rules in the document Jenn
writes — a print stylesheet injected here would be a guess about someone else's
design, which is what this feature has refused to do since it shipped.

**One declaration is excepted, and the distinction is the whole argument.**
`withPrintableBootstrap` also injects
`@media print { html { print-color-adjust: exact } }`, because Chrome's
*Background graphics* checkbox is off by default, is unreachable from a page,
and without it every coloured panel prints white. That rule guesses at nothing:
it moves no box, changes no spacing, typography or page break. It does not
decide how the document should look — it stops the browser discarding colours
the document already chose. It carries no `!important` and sits on `html` rather
than `*`, and since the property inherits that makes it a **default the document
can still override**, which is the same author-intent-wins the refusal above
protects. Anything that moved a box would still be forbidden. It rides the
`?printable=1` gate, so the stored document, the admin's download and every
preview are untouched.

The button that triggers it reads *Enregistrer en PDF* with a save icon. It said
just `PDF` until 2026-08-04, with the full sentence only in a `title` attribute
— invisible on a phone, where most of these students are, so the control read as
a file-type badge rather than something to press.

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

**An html tile can show a stored JPEG instead**, and that is what makes a page
whose layout is drawn by JavaScript preview as itself rather than as a blank
box — the `sandbox=""` frame above can never run a script and must not.
`?capture=1` on the raw route appends `withCaptureBootstrap`
(`lib/printable-bootstrap.ts`), beside `withPrintableBootstrap` and under the
same gate rule: only the capture harness asks for it, and the two are
independent, because the admin's `<a download>` must keep returning Jenn's bytes
and a student's print must not carry a capture listener.

`captureHtmlThumbnail` (`components/html-thumbnail.ts`, impure and so not in
`lib/`) frames that route in an offscreen iframe with `sandbox="allow-scripts"`
— **never `allow-same-origin`**, which beside it would let the page remove its
own sandbox. That opaque origin is why the document rasterises *itself* and
posts a JPEG out, rather than the parent reading its DOM. It frames the **stored
page through its real route under the real CSP**, not the HTML in memory: a
preview rendered from markup the stored page cannot load would be a working
feature showing the wrong thing, and the capture therefore runs *after* the
save. **No CSP directive was widened for any of this** and none may be.

The contract is total — `Promise<Blob | null>`, never throws — so `null` means
"leave the live iframe in place", which is a working preview, and the
implementation can be replaced without a caller learning about it. Two guards
inside it were added because the capture was measured rather than assumed:
`document.fonts.ready` before serialising, since these artifacts inline their
typefaces and serialising early rasterises with *no text at all*; and a blank
check, because a background-only capture is still a valid JPEG and storing one
would *replace* the working iframe with a flat rectangle.

**It is not reliable on large documents.** A ~500 KB artifact percent-encodes
into a ~1.5 MB data URL and the decode often fails; measured at roughly one run
in three, against every run for smaller pages. `blob:` was tried — it is in the
CSP already — and is worse, never loading from the frame's opaque origin.
html2canvas was tried per the plan's fallback and made failures deterministic
without fixing any, so it was reverted rather than kept as an unearned
dependency. A failed capture stores nothing, so this is strictly better than the
old behaviour and never worse.

`ThumbBackfill` (`components/admin/ThumbBackfill.tsx`) captures missing previews
on the Pages tab, one at a time and capped per visit — serial for the reason a
shelf frame has no `allow-scripts`. It is what covers pages published through
`POST /api/pages`, where there is no browser to capture in, and it is why there
is **no backfill script**: one would need the server-side renderer this design
refuses.

In the admin the tile links to `/p/[slug]` and a pencil icon
opens the editor **in an overlay** (below), not the reverse — following a
thumbnail should show the page it is a thumbnail of.

A **link** tile shows a trash icon in place of that pencil and the download
beside it, which is the third clause of the same sentence: it trades the two
controls it cannot use for the one it can. Until that existed a link could not
be deleted anywhere — `/admin/pages/[slug]` 404s on a link row and
`PageEditor`'s *Delete page* was the admin's only delete. It calls the same
teacher-only `deletePage`, with no confirmation, matching that button. On a
student's shelf the teacher now gets the × on **every** row (`canDeleteAny`),
which adds no authority — `deleteShelfLink` has always let her remove anything
there — and matters because chat-filed links arrive with `addedByStudent` false,
precisely the set she could not reach. `canStudentDelete` is unchanged and is
still re-checked on the server regardless of which controls a tile rendered.

**Editing happens in an overlay, on both screens.** The pencil is
`?edit=<slug>`, which `PageEditOverlay` reads to fetch one page through the
teacher-only `loadPageForEdit` — fetched on open rather than shipped with the
list, following `loadConversation`, because the payload is a whole document and
a shelf renders many tiles. It wraps the **unmodified** `PageEditor`, so there
is one edit form and no second copy to drift.

A search param rather than local state, for four reasons and the last is the one
that would be hard to add later: Back closes it; it has a URL, which is what the
dia script opens after publishing; the list stays mounted, so a rename no longer
costs the scroll position, the search text or the active student chip; and **the
pencil is an anchor**, which the whiteboard's leave-guard — a capture-phase
`click` listener on `document` that inspects anchors — therefore protects for
free. A button calling `router.push` would slip past it and opening this overlay
during a live board would destroy the op log with no prompt. **Keep it an
anchor.**

Jenn gets the pencil on a student's shelf too, under the rule `PageList` already
applies: html and pdf rows get it, a link row keeps its ×, so the two screens
agree about which tiles are editable. It grants **no new authority** —
`updatePage`, `updatePdfPage` and `deletePage` were already `requireTeacher()`;
only a control is drawn where the authority already reached. `/f/[token]` is
read-only and gets none of it. `/admin/pages/[slug]` is untouched and still
works for a bookmark.

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

A PDF cannot be pasted, so it is the one staging control that is still a file
input: `FileDropZone` (`components/ui/FileDropZone.tsx`) hands the `File` up
**unread** and enforces no cap of its own — the caps differ by kind (2 MB of
HTML, 3 MB of PDF) and the zone does not decide kind, so the caller checks the
right one beside the right validator, and the server checks it again as the
authority. In `NewPageForm` **choosing the PDF is the submit**, the same
one-gesture flow as the paste beside it, with the title derived from the
filename instead of from `titleFromHtml`. In `PageEditor` it stages a
replacement and Save commits it; saving with nothing staged is a rename or a
change of audience, which `updatePdfPage` routes to `updatePageMeta` so the
bytes are left alone. Which control the editor shows is decided by the row's
kind: a pdf row gets the drop zone, an html row the paste box.

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

### Worksheet versions

A page Jenn ticks `worksheet` gains up to two saved versions per student,
beside the blank: an attempt and a correction. **Three versions, two rows** —
the blank is `Page.html` / `Page.pdf` and was never a row to begin with.
`PageVersion.fromTeacher` is a boolean for the reason `Message.fromTeacher` is
one: there are exactly two participants and one has no row to point at.
`@@unique([pageId, groupId, fromTeacher])` **is** the three-slot rule — a save
is an upsert against it, so there is no counting, no pruning, and no way for a
fourth row to exist. It is enforced by the database, not by a convention
inside an action.

**A version is not a `Page` row.** `/p/[slug]` is public and a slug is derived
from a title, so a version-as-page would publish a named student's homework to
anyone who tried `devoir-3-marie`. Access instead runs through `chatRole`,
reused **verbatim** — no new access module — because its clause order already
refuses the everyone group before it checks the teacher, which is what keeps
`/g/all` out for both parties: there is no student there for a version to
belong to. Three further guards specific to the page sit in
`lib/worksheet-access.ts` (`worksheetOpenable`): it must be flagged, it must
not be a link, and it must be on *this* student's effective shelf — without
that a guessable page slug would let anyone attach versions to any document.

**An html version is a serialised DOM snapshot, not an answer set.** These
worksheets come out of Dia and are full of drag-and-drop matching and
div-based pickers that a `{field: value}` capture could not replay.
`snapshotDocument` (`lib/snapshot-dom.ts`) clones the live tree instead, which
catches anything the page's own JavaScript did — toggled classes, moved
elements — without knowing what any of it means. **Every `<script>` is
stripped from the clone**, including the bootstrap that took it: keeping
scripts restores perfectly on a document whose JS only wires event handlers
and **silently wipes everything** on one that rebuilds the DOM on load, and
deterministic-and-degraded beats sometimes-perfect. **A stripped snapshot is
still typeable** — text fields, checkboxes and `:checked` CSS are browser
behaviour, not JavaScript — which is what makes the correction the *same
operation* as the attempt rather than a second feature: Jenn opens the
student's version and types into it.

`snapshotDocument` is inlined into the served document as a `<script>` via
`Function.prototype.toString()`, the technique Playwright uses for
`page.evaluate`. **It must stay self-contained** — no imports, no closure over
module scope, no syntax that compiles to a helper call — because it is the
*bundled* output, not the source, that ends up in a student's browser; it is
written in ES5 `var` for that reason, and its test runs the actual
`toString()` output rather than trusting the source file.

`snapshot` is brotli-compressed before storage (`lib/snapshot-codec.ts`) so a
500 KB Dia artifact costs roughly 40-70 KB in a SQLite file the nightly
`VACUUM INTO` copies whole; `pdf` is left alone, since it is already
compressed and brotli would spend CPU to grow it. **Brotli through the async
API only**, never `brotliCompressSync` — one pm2 fork process serves every SSE
stream, and a synchronous compress of a megabyte would stall the `: ping`
heartbeats. That joins the chat bus, the live board, and the sign-in throttle
on the list of things that depend on pm2 staying in fork mode.

`MAX_SNAPSHOT_BYTES` is 3 MB **because** nginx's `client_max_body_size` on the
server is `4m` — the same ceiling `MAX_PDF_BYTES` answers to. The frame
measures its own serialised string against it before posting, so an
over-large save fails with a sentence in the shell rather than a raw 413
nginx returns and Next never sees.

The shelf tile carries a count badge once more than one version exists. That
badge lives only in `FilesTab` (the student shelf), gated on `groupSlug &&
versionCount(page.versions) > 1` — `/f/[token]` supplies no `groupSlug`, so
its badge is off for that reason alone. Opening a tile goes straight to the
shell for an html worksheet holding only the blank, but a pdf worksheet
always opens the chooser (`components/worksheet/VersionChooser.tsx`), even at
one version: a PDF opens top-level in the browser's own viewer, with nowhere
in it to put a Save control, so the chooser is the only surface that can hold
the upload button. **The chooser's rows are anchors, not buttons**, the same
reason the admin's pencil had to stay one: the whiteboard's leave-guard is a
capture-phase `click` listener on `document` that inspects anchors, so a row
is protected by it without knowing it exists, and a `router.push` handler
would slip past it.

**The badge and the worksheet target are two different mechanisms, and their
absence in the admin has two different causes — do not read them as one
rule.** `pageTarget` needs a group slug to build the worksheet route, because
a version belongs to (page, student) and there is no student in a bare page
row: the admin Pages tab supplies one when a student chip is active, so a
worksheet tile there correctly routes to that student's shelf, and supplies
none under "All", where it keeps today's target — "All" is not a shelf, the
same rule the pin control already follows. The badge is unrelated: `PageList`'s
row type (`PageSummary`) carries no `versions` field at all, and `PageList`
never passes a `badge` prop to `PageTile`, so **the admin Pages tab never
renders a badge under any selection**, student chip or not — not because of
groupSlug, but because the badge was never wired there. Anyone later adding
`versions` to `PageSummary` to fix that must not assume the group-slug rule
above already covers it; it doesn't.

### Lesson chat

A `Message` belongs to a group and carries `fromTeacher` rather than a sender
id, because there are exactly two participants and one of them has no row to
point at. There is no session or lesson model: the log is continuous and
`groupByDay` (`lib/chat-day.ts`) computes the date separators, in the reader's
local zone — the one deliberate exception to the project-wide UTC rule, see
*Dates*. Retention is forever, deliberately — this is a teaching record. Jenn
can delete an individual message, and can regenerate a student's tokens from
the admin, which revokes both at once.

A message carrying a URL also files it on that student's shelf — see *Files:
pages, links and PDFs*. The message text is unchanged and still renders as
plain text; linkifying it is deliberately not part of that.

Jenn chats from an inbox: one FAB, on `/admin`, `/admin/pages/[slug]` and
`/g/[slug]`, rendered by `components/chat/TeacherInbox.tsx` and invisible to
anyone without a teacher session. Students on the left with an unread dot and
the last line of the thread, the selected conversation on the right; below
`md` the two become full-screen levels with a back arrow between them.
Students keep the single-conversation `ChatFab`, which gains the same
full-screen treatment and no back arrow, because they have no second level.
`/admin/[slug]` no longer exists (it was the override-card editor removed
above, and never hosted chat).

**The inbox remembers where she was.** `resolveInboxSelection`
(`lib/inbox-selection.ts`) answers what the panel opens on, from four inputs and
in this clause order: `initialSelectedId` still wins, so standing on a student's
page and pressing the FAB lands in that conversation; then a selection stored on
this device; then, at `md` and up, the first conversation in the ordered list;
then, below `md`, the list itself. An id that is no longer in the list — a
student deleted since — falls through rather than selecting a group that does
not exist, which is why both the pinned and the stored branches test membership
rather than trusting the value.

Two details are load-bearing. It is read in the **click handler**, never during
render: `InboxFab`'s button does render on the server, so a render-phase
`localStorage` or `matchMedia` read is a hydration mismatch — the same rule the
rest of this section states, reached from the other direction. And opening onto
the list on a phone must **not** call `select()`, because `select()` stamps the
conversation read: marking the first student's thread read while showing Jenn a
list would clear an unread dot she never saw.

Storage is one `chat-inbox-selection` key in `localStorage`, per device, the
precedent `chat-seen:<slug>` already set — the panel's state is a fact about
this browser, not about a student. It parses defensively and answers `null` to
anything malformed, the contract `readSections`, `readOps` and `readPageKind`
all carry.

**Her FAB follows her session, not the token.** That changes no access rule:
`chatRole` has always answered `"teacher"` on the session alone, and both the
POST and the SSE route have always honoured it — the UI was the only thing
withholding her own conversations from her. `unlocked` is untouched, still
derived from `studentGate`, and still gates the Files tab, the Whiteboard tab
and everything inside them from the token alone. The student sign-in design's
*Why `unlocked` does not consult the teacher session* therefore still holds
verbatim: it is a rule about `unlocked`, and this is not `unlocked`.

**A student who has not signed up is listed and read-only.** That design's
other consequence — "there is nobody on the other end of a conversation nobody
has claimed" — is kept rather than quietly dropped: the row shows *Hasn't
signed up yet*, and selecting it replaces the composer with that sentence and
the invite link. Listing them rather than hiding them is deliberate; a student
created ten seconds ago being absent from the inbox reads as a bug. `claimed`
is `passwordHash !== null`, the same fact the gate reads, selected by
`listConversations` and never re-derived. The invite link itself is fetched by
the `inviteLink` server action rather than shipped in that list, because it is
a live `chatToken` and the list renders on every teacher page.

A student's row in the admin carries **three icon buttons** in `Tile`'s action
slot: copy the invite link (only while unclaimed — a claimed student's invite is
spent), reset sign-in / new invite link (present in **both** claim states, label
switching, because it is the only way to revoke an invite that leaked before it
was used), and delete. The invite URL is no longer printed in a `<code>` to be
selected by hand — it was never paste-able, having no origin. It is now copied
**absolute**, built in the click handler from `window.location.origin` rather
than the `ORIGIN` env var: what she wants to send is a link to the site she is
looking at, and where those two disagree the browser is right. Building it during
render instead would be a hydration mismatch.

**The panel's own shape.** `ChatPanel` is still one tree for both sizes driven
entirely by CSS, and still must not read `matchMedia` during render. One
exception is made in an **effect**, which is safe because the panel is mounted
from an `open` state that starts `false` and so never renders on the server:
below `md` it drives its own `top` and `height` from `window.visualViewport`.
iOS Safari does not shrink a `fixed inset-0` element when the on-screen keyboard
opens — the visual viewport shrinks and the layout viewport, and so `100dvh`,
does not — which pushed the header and its X above what the reader could see, on
the device most of these students use. At `md` and up the inline style is
cleared so the floating panel's own classes take back over.

The X is now drawn in **every** state. It used to hide whenever the back arrow
showed, which left Jenn inside a student's conversation on a phone with no way
to close the panel at all without going back to the list first; back and close
are different actions. The back control is one button wrapping the arrow *and*
the title, because the arrow alone was a 14px hit target.

Message bubbles group into runs (`groupIntoRuns`, `lib/chat-run.ts`): consecutive
messages from one sender collapse, a gap over five minutes starts a new run even
from the same sender, and one timestamp is drawn per run rather than under every
bubble. It runs **inside** each day group, so `groupByDay` is untouched and still
owns the date separators.

The three animations (`panel-rise`, `panel-pop`, `bubble-in`) live as named
keyframes in `app/globals.css` and each consumer carries
`motion-reduce:animate-none`. The variant sits on the element rather than a rule
matching class names, because the duration lives inside the Tailwind utility —
a global override would have to substring-match a generated class string and
would break silently the first time a caller chose a different duration.

The header line on `/g/[slug]` is chosen by audience: `greeting` gives the
student *Bonjour Marie* in French from the first word of the name, and
`teacherPageLabel` gives Jenn *Marie Dupont's page* in English from the whole
name — her problem is telling two students apart, and two students can share a
first name. The possessive is always `'s`, including a name ending in s. The
caller suppresses both on the everyone group, which is named "Everyone" and is
nobody's page.

Each student row carries two tokens. `chatToken` unlocks the files tab and the
chat on `/g/[slug]`, but only once the student has claimed their account — on
its own it now only permits *creating* that account (see *Auth*);
`filesToken` addresses `/f/[token]` and nothing else, so
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

Delivery is SSE with an in-process `EventEmitter` (`lib/chat-bus.ts`) over two
endpoints. Students connect to `/api/chat/[slug]/stream`, which replays that
one conversation in full. Jenn connects to `/api/inbox/stream`, which
subscribes to a broadcast channel — not to each group id, because enumerating
at connect misses a student created afterwards — and **sends no first-connect
backlog at all**: every conversation, on every admin page load, with retention
set to forever, is what that would cost. Her list arrives with the page and a
selected conversation loads its own history through the `loadConversation`
server action. A `Last-Event-ID` reconnect still replays, capped at 500 and
newest-first, so a deploy mid-lesson costs a blink.

That endpoint is `/api/inbox/stream` and not `/api/chat/stream` because a
static `stream` segment under `app/api/chat/` would take routing precedence
over `app/api/chat/[slug]/`, silently shadowing a student whose name produced
the slug `stream`.

`?board=<slug>` folds a group's board frames into her stream, so on a student's
page she still holds exactly one `EventSource` — the property `StreamProvider`
exists to protect. It takes a URL rather than a slug now, built by
`lib/stream-url.ts`, and its `messages` array is flat and multi-conversation:
`ChatMessage` carries the `groupId` the payload always had, and
`lib/chat-select.ts` picks one conversation out.

Two details keep either stream alive behind nginx without any nginx change:
`X-Accel-Buffering: no` disables its response buffering, and a `: ping` comment
every 20 seconds stays under the default 60-second `proxy_read_timeout`.
Messages are ordered by `(createdAt, id)`, not `createdAt` alone — a review
found that two messages landing in the same millisecond made `gt createdAt`
drop the second one on every future reconnect, since a `Last-Event-ID` replay
has no other anchor to resume from.

**Both emitters are still correct only because pm2 runs this app as a single
process in fork mode.** Under cluster mode a message would reach only the
viewers on the same worker, silently. Four things now depend on that: the
chat bus, the live board, the sign-in throttle, and this stream.

**Nothing in the chat may render on the server.** Every heading and timestamp
resolves in the runtime's timezone, so an SSR pass would produce different HTML
from the hydration pass. What protects it is that both FABs mount their panel
on an `open` state that starts `false`. A change that renders a panel eagerly
breaks production and nothing else.

`listConversations` (`lib/inbox.ts`) is the single read model behind both the
inbox list and the Students tab's `· N unread` eyebrow, which reads
`teacherLastReadAt` as it always did; `unreadCounts` was removed rather than
kept beside it, because two query paths for one number are two things that can
disagree. It runs 2N queries for N students against a local SQLite file —
legible at this size; the shape to reach for if that ever changes is a
`lastMessageAt` column maintained on write.

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
  strings. `tileActionClass` is one of them: the round icon button in a tile's
  action slot, rendered by both the page list and the student list.
- **Imports** use the `@/` alias for repo-root-relative paths.
- Server actions call `revalidatePath` for the page they affect. Deletes use
  `deleteMany` so a double-click or stale tab is a no-op rather than a P2025.
- **Two fixed buttons share the bottom-right corner.** `InboxFab` is at
  `bottom-6 right-4` on `/admin`, `/admin/pages/[slug]` and `/g/[slug]`; the add
  `+` sits at `bottom-6 right-24`, to its left, in both `AdminChrome` and
  `ShelfFab`. They are the same `z-50`, so a third fixed control at `right-4`
  will silently paint over one of them — which is exactly what the admin's `+`
  did until 2026-08-04. `bottom-24` is not a free slot either: that is where the
  open panel and the add menu go.
- **An open overlay hides both of them, below `md` only.** `AddSheet` and
  `ChatPanel` were `z-50` too and render *earlier* in the tree, so on a phone
  the `+` painted on top of the PDF sheet's own submit button and both buttons
  sat on top of the full-screen chat. Both overlays are `z-[60]` now, but that
  alone only fixes the overlap: over a dimmed backdrop the button would still be
  visible, just behind the card. So they call `useOverlayLock`
  (`components/ui/OverlayProvider.tsx`, mounted in `app/layout.tsx`) and `Fab`
  hides itself while the count is above zero. **Below `md` only** — at desktop
  size the chat panel floats with the page readable behind it and the FAB is
  what closes it, so hiding it there would strand the panel. `AddMenu`
  deliberately does *not* lock: the FAB is its anchor. The provider is UI
  plumbing rather than a rule, which is why it has no `lib/` module and no unit
  test; that is a deliberate exception to the convention above it, not an
  oversight.

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
