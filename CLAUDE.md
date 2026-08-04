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
| `/g/[slug]` | students | the card for `?date=` (public); `?tab=files`, `?tab=board` and the student's own chat need the student to be signed in — a valid `chatToken` cookie **and** a claimed account — teacher included, who once unlocked also gets *Nouveau tableau* and a delete per board — except the everyone group, whose files are public and which has neither chat nor whiteboard. **Jenn's own chat is her inbox FAB and follows her session, not the token** — the only thing on this page that does, and it carries the delete and read-marker controls with it. Everything the gate controls is unchanged. Both extra tabs are present for anyone unlocked, empty state and all. **An unlocked teacher has no card tab** and lands on Files; an untokened teacher is just a visitor and still gets the public card. Adding a link or a page is a `+` FAB left of the chat button, present on every tab, and either party may pin a page. A teacher session also adds a *← Back to admin* link and turns the header line into *Marie Dupont's page* in place of the student's *Bonjour Marie*, and **suppresses `LiveBanner`** — she is the only person who can be drawing |
| `/login` | teacher | passkey register/authenticate |
| `/admin` | teacher | three tabs via `?tab=` — the global card for `?date=` (default), groups, pages |
| `/p/[slug]` | public | an uploaded HTML page, in a sandboxed iframe; a pdf row redirects to `/p/[slug]/pdf` |
| `/p/[slug]/pdf` | public | an uploaded PDF, in the browser's own viewer |
| `GET /p/[slug]/thumb` | public | a pdf page's cached first-page preview |
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
| `/api/auth/*` | — | WebAuthn ceremonies (server actions everywhere except here, `/api/pages`, `/api/chat/*`, `/api/inbox/*`, `/api/whiteboard/*`, and `/p/[slug]/raw`) |

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
sign-in form. `unlocked` is derived from the gate and still never consults the
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

Uploading a PDF is **teacher-only**. `createPdfPage` and `updatePdfPage` start
with `requireTeacher()`; students keep `addShelfLink` and `addShelfPage` and
nothing more. A student upload would put unvalidated binary in the database
served from our own origin, and would need `canStudentDelete` extended from
rows-with-a-url to rows-with-a-blob — a separate decision.

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

A pdf row also carries a **picture of its first page**: `pdfThumb` holds a JPEG
and `pdfThumbAt` says when it was written. Two columns, because the second does
two jobs a boolean could not. It is the **existence signal**, so no shelf query
ever selects `pdfThumb` — the same lesson `pdfSize` records one column earlier,
since a tile grid that loads a blob to decide whether to draw a picture has
already paid for the picture it might not draw. And it is the **cache version**:
`/p/[slug]/thumb` answers `public, max-age=31536000, immutable`, which is safe
**only** because the tile appends `?v=<pdfThumbAt>`. On a stable URL that year
would pin a replaced document's picture in every browser that had ever seen it.
The route and `PdfPreview` are two halves of one decision and neither can change
alone.

The bytes are a `Bytes` column and **not** a base64 data URL in a `String`,
which is what `Whiteboard.thumbnail` is. That one is inlined into an `<img src>`
and has no route to be served from; this one has three, so base64 would cost a
third more room in a database the nightly `VACUUM INTO` copies whole, for
nothing.

**pdf.js never loads on a shelf.** `renderPdfThumbnail`
(`components/admin/pdf-thumbnail.ts`) runs it behind a dynamic `import()` in the
admin, in Jenn's browser, at the moment she stages a PDF; the shelf receives a
JPEG through an `<img>`. That is what makes this consistent with the
2026-08-03 spec's refusal of pdf.js rather than a reversal of it — that refusal
was about a dozen renderers mounting at once on a student's phone. The module is
impure and so is deliberately **not** in `lib/`, the same split
`lib/whiteboard-thumbnail.ts` and `BoardEditor.renderThumbnail` already make. It
never throws: an encrypted, corrupt or zero-page PDF, a dead worker and a render
past ten seconds all return `null`, because **an upload must never fail because
a preview did not render** — the glyph is a working fallback.

`savePage` writes both columns on every call, joining its flat every-column
invariant. The reason is stronger here than the `readPageKind` one that
invariant was written for: a *missing* preview is a glyph, but a *stale* preview
is a picture of the previous document under the new document's title, which
reads as a working feature showing the wrong thing. `updatePageMeta` touches
neither, which is why renaming a PDF page keeps its picture.

PDFs uploaded before this existed have `null` in both and keep the glyph. There
is deliberately **no backfill**: a script would need the server-side renderer
this design refuses, and re-uploading is a control that already exists.

`/p/[slug]/raw` and `POST /api/pages` refuse everything that is not an html row
— 404 or 400, never a redirect to the external URL. An open redirect on a public
route is a phishing primitive. `/p/[slug]/pdf` is their mirror: it refuses
everything that is not a pdf row, and `/p/[slug]/thumb` is the third, refusing
everything that is not a pdf row *with* a thumbnail. Three routes rather than
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
of which controls the tile rendered. Because a student can now publish a
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
than closing over it. A relative ref is reported too, since only `index.html`
is ever uploaded. `scripts/backfill-page-assets.mjs` runs the same inliner over
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

### Lesson chat

A `Message` belongs to a group and carries `fromTeacher` rather than a sender
id, because there are exactly two participants and one of them has no row to
point at. There is no session or lesson model: the log is continuous and
`groupByDay` (`lib/chat-day.ts`) computes the date separators, in the reader's
local zone — the one deliberate exception to the project-wide UTC rule, see
*Dates*. Retention is forever, deliberately — this is a teaching record. Jenn
can delete an individual message, and can regenerate a student's tokens from
the admin, which revokes both at once.

Jenn chats from an inbox: one FAB, on `/admin`, `/admin/pages/[slug]` and
`/g/[slug]`, rendered by `components/chat/TeacherInbox.tsx` and invisible to
anyone without a teacher session. Students on the left with an unread dot and
the last line of the thread, the selected conversation on the right; below
`md` the two become full-screen levels with a back arrow between them.
Students keep the single-conversation `ChatFab`, which gains the same
full-screen treatment and no back arrow, because they have no second level.
`/admin/[slug]` no longer exists (it was the override-card editor removed
above, and never hosted chat).

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
