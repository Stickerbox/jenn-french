---
name: files-pages-pdfs
description: Design rationale for pages, links and PDFs: the three page kinds, thumbnails, the publish/inline pipeline, shelves, pins and the sandbox/CSP model.
paths:
  - app/p/**
  - app/f/**
  - app/api/pages/**
  - app/page-actions.ts
  - app/admin/pages/**
  - lib/page-*.ts
  - lib/pages.ts
  - lib/asset-*.ts
  - lib/link-*.ts
  - lib/shelf-*.ts
  - lib/effective-pages.ts
  - lib/pdf-filename.ts
  - lib/printable-bootstrap.ts
  - components/pdf-thumbnail.ts
  - components/html-thumbnail.ts
  - components/pdf/**
  - components/admin/**
  - components/student/**
  - components/ui/PageTile.tsx
  - components/ui/HtmlPreview.tsx
  - components/ui/LinkPreview.tsx
  - components/ui/PdfPreview.tsx
  - components/ui/FileDropZone.tsx
  - components/ui/HtmlPasteBox.tsx
  - components/ui/KindFilter.tsx
  - components/ui/BrandGlyph.tsx
  - tools/publish-dia-artifact.sh
  - scripts/backfill-page-assets.mjs
  - tests/lib/page-*.test.ts
  - tests/lib/asset-*.test.ts
  - tests/lib/link-*.test.ts
  - tests/lib/shelf-*.test.ts
  - tests/lib/effective-pages.test.ts
  - tests/lib/pdf-filename.test.ts
  - tests/lib/printable-bootstrap.test.ts
---
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

**A PDF is never framed.** That is still true, and always will be: iOS Safari
renders only the first page of a PDF in an iframe, silently, which would
truncate every multi-page worksheet on the device most of these students use.
What changed on 2026-08-06 is *how* it stays true. `/p/[slug]` used to
**redirect** a pdf row to `/p/[slug]/pdf` and let it open as a top-level
navigation in the browser's own viewer — no iframe, because there was no
document to frame at all, just a hop to somewhere else. Now `/p/[slug]`
renders `PdfShell` (`components/pdf/PdfShell.tsx`) over `PdfDocumentView`
(`components/pdf/PdfDocumentView.tsx`), which rasterises every page onto its
own `<canvas>` with pdf.js and stacks them in a scrolling column — still not a
frame, a picture. The redirect is gone because there is no longer anywhere for
it to go: the PDF opens *inside* the site, under our own back control, instead
of handing the tab to the OS.

`/p/[slug]/pdf` is unchanged and matters more for it, not less: it is now
**both** the byte source PdfDocumentView streams from (`pdfjs.getDocument({
url })`, so the worker requests ranges rather than downloading the whole file
first) **and** the escape hatch PdfDocumentView's own failure state links to
when rendering fails outright — a corrupt or encrypted PDF, a timed-out
library fetch, a zero-page document. A bookmarked `/p/[slug]` still works for
the same reason it always did: the destination is chosen by the row's kind
with no input in it, never an open redirect. A shelf tile now points at
`/p/[slug]` itself rather than skipping ahead to the bytes (`pageTarget`,
`lib/page-target.ts`) — there is no hop left to skip.

Two costs were accepted to build this, both measured against the same iOS
ceiling `lib/whiteboard-export.ts`'s `MAX_CANVAS_AREA` answers to for its own
canvas: iOS Safari returns a **blank** canvas, not an error, past roughly
16.7M pixels, so each page's raster — not its CSS box, which already carries
the page's real aspect ratio from an untouched `getViewport({scale:1})` — is
capped a little under that and downscaled rather than left to fail silently.
And a document is **rendered lazily**, one `IntersectionObserver` per page
with roughly a screen of `rootMargin` on each side and at most two pages
decoding at once: rasterising a forty-page scan all at once on a phone is
worse than the flicker of a page arriving a moment before it is scrolled to.

The larger accepted cost is a narrowing, not a reversal, of the 2026-08-03
refusal of pdf.js. That refusal was about a shelf grid mounting a dozen
renderers at once for a wall of thumbnails — `PdfPreview` still never runs
pdf.js; it draws a stored JPEG through a plain `<img>`, exactly as before.
What is new is that **opening** a PDF, not just **uploading** one, now costs a
fetch of pdf.js and its worker (~1 MB) on whichever device does it — every
time, not once per student, since nothing caches the library across page
loads any more than `renderPdfThumbnail`'s did. The owner chose this
knowingly: framing a PDF was refused outright, and the alternative to
rasterising it ourselves was sending the reader back out to the OS's own
viewer, which is the exact experience — leaving the site to read a worksheet —
this feature exists to replace. `PdfDocumentView`'s own failure state, which
`fallbackHref` points at the same raw route, is what keeps that a fallback and
not a dead end.

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
