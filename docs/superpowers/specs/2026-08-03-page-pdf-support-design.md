# PDFs: printing a page, and uploading one — design

Date: 2026-08-03

## Problem

Two gaps, at opposite ends of the same feature.

**A student cannot keep a page.** `/p/[slug]` renders a worksheet as a live
page, which is the whole point of the feature — but a student who wants it on
paper, or in a folder on their laptop, or to hand to a parent, has nothing to
click. The browser's print dialog is reachable from a menu on a desktop and
buried in a share sheet on a phone, and even when found it does not work:
`/p/[slug]` frames the document, and printing the shell prints one clipped page
of a six-page worksheet.

**Jenn cannot upload a PDF.** Not everything she hands out is a page she wrote.
A conjugation table from a textbook, a scanned exercise, a PDF a colleague sent
her — the shelf has no shape for any of it. Today she has one workaround, and it
is a bad one: upload the PDF to Google Drive and add a link. That puts a
teaching document behind a third party's sign-in wall, which is exactly the case
`linkBrand` already documents as the reason it never fetches an og:image.

The second gap is worth stating carefully, because the spec that created this
feature (`2026-07-30-uploaded-pages-design.md`) exists to escape PDFs:
*"Flattening a page to a PDF throws away everything that made it a page."* That
is still true and nothing here disputes it. A page Jenn writes should stay a
page. But a PDF someone else wrote is not a flattened page — it is a document
that arrived as a PDF, and refusing to host it does not make it a page, it
makes it a Google Drive link.

## Goal

A student on `/p/[slug]` can turn the page into a PDF in one click, using the
browser's own print-to-PDF, with anything they have typed into the page still in
it.

Jenn can drop a `.pdf` into the same control she drops a `.html` into, and it
lands on a shelf as a tile beside the others. A student clicking it gets the
PDF in the browser's own viewer, with the download and print buttons that viewer
already has.

## Non-goals

**No server-side HTML-to-PDF rendering.** It is the obvious answer and it is the
wrong one here. Puppeteer or Playwright would be this project's first heavy
dependency — some 300 MB of Chromium on a `t3.small` where `docs/DEPLOY.md`
already warns that `npm run build` can exhaust the 2 GB of RAM and needs swap to
survive. Worse, it means running Jenn's HTML through a real browser *on the
server*, which is the one place the current design carefully never does: the
whole `/p/[slug]` security model is an opaque origin in the student's browser,
and a server-side renderer has none of that.

**No PDF rendering library on the client either.** `jsPDF` + `html2canvas` would
have to run *inside* the sandboxed frame, where the CSP admits nothing from a
CDN, so it would have to be bundled and injected. It produces a rasterised
document with unselectable text. The browser already has a better renderer.

**`POST /api/pages` stays HTML-only.** The publishing tools exist because Dia is
sandboxed and cannot complete a passkey login; that is a constraint about HTML
Jenn wrote in Dia, and a PDF has no such story — she has the file on her Mac and
the admin area open. Sending bytes through that endpoint means base64 in JSON,
which inflates by a third and would not fit the budget described under *Size*
below. Out of scope, deliberately, and revisitable.

**A companion PDF beside an HTML page is out of scope.** `tools/html-to-pdf.swift`
already renders a local HTML file to a paginated Letter PDF via WKWebView, so
the highest-fidelity path — Jenn renders a PDF on her Mac at publish time and it
is stored beside the document — is a small follow-on once the storage and
serving below exist. It is left out of this cut because it needs a drift rule
(republishing the HTML must invalidate the stale PDF) and because print-to-PDF
covers the case for every page that already exists, today, with no new bytes.

## Scope

New:

- `lib/page-pdf.ts` — `MAX_PDF_BYTES`, `validatePagePdf`
- `lib/pdf-filename.ts` — `contentDispositionInline`
- `lib/printable-bootstrap.ts` — `PRINT_MESSAGE`, `withPrintableBootstrap`
- `lib/page-target.ts` — `pageTarget`, so the three-way branch over `kind` that
  both page lists were about to grow is one tested rule instead of two ternaries
- `app/p/[slug]/pdf/route.ts` — the stored PDF, with its headers
- `components/ui/PdfPreview.tsx` — the tile preview for a PDF
- `components/PrintButton.tsx` — the pill on the page shell
- `tests/lib/page-pdf.test.ts`, `tests/lib/pdf-filename.test.ts`,
  `tests/lib/printable-bootstrap.test.ts`, `tests/lib/page-target.test.ts`

Changed:

- `prisma/schema.prisma` — `Page.pdf`, `Page.pdfSize`, plus a migration
- `lib/page-kind.ts` — a third `PageKind`, and a required `pdfSize` argument
- `lib/pages.ts` — `savePage`'s third union member, `updatePageMeta`,
  `getPagePdf`, `pdfSize` in both list queries
- `app/page-actions.ts` — `createPdfPage`, `updatePdfPage`
- `app/p/[slug]/page.tsx` — `allow-modals`, the print pill, the pdf redirect
- `app/p/[slug]/raw/route.ts` — the `?printable=1` bootstrap
- `components/admin/HtmlDropZone.tsx` → `components/ui/FileDropZone.tsx`
- `components/admin/PageEditor.tsx` — kind-aware staging and submit
- `components/admin/PagesTabClient.tsx`, `components/admin/PageList.tsx`,
  `components/student/FilesTab.tsx`, `components/ui/KindFilter.tsx`,
  `components/ui/PageTile.tsx`
- `app/admin/pages/[slug]/page.tsx` — a pdf row is editable
- `app/admin/page.tsx` — wiring for the new actions
- `tests/lib/page-kind.test.ts`, `tests/lib/page-filters.test.ts`
- `CLAUDE.md`, `docs/DEPLOYMENT.md`

Unchanged, and worth saying so:

- `effectivePages`, `applyPins`, `sectionPages`, `page-section-labels`,
  `filterPagesByKind`, `admin-search` — a third kind is a third value in a
  discriminated union, not a change to how shelves merge, pin, section, filter
  or search.
- `parsePagePayload`, `validatePageHtml`, `MAX_PAGE_BYTES` — the HTML path is
  untouched, including its 2 MB cap.
- `/p/[slug]/raw`'s CSP, and its refusal of anything that is not an html row.
- Cards, chat, whiteboards, auth, dates.

## 1 · Printing a page to PDF

### The constraint

Four facts, and together they determine the design.

1. **`window.print()` is gated behind `allow-modals`.** The sandbox on
   `/p/[slug]` is `allow-scripts`, so a call to `print()` inside the frame is
   ignored — Chrome logs *"Ignored call to 'print()'. The document is sandboxed,
   and the 'allow-modals' keyword is not set."* MDN lists `print` alongside
   `alert`, `confirm` and `prompt` under that one token.
2. **The shell cannot reach into the frame.** No `allow-same-origin` means an
   opaque origin, so `iframe.contentWindow.print()` throws. That is the security
   model working, not an obstacle to route around.
3. **Printing the shell instead does not paginate.** The frame is
   `fixed inset-0`; a framed document prints clipped to its box. A six-page
   worksheet comes out as one page with five missing.
4. **So the call has to happen inside the frame** — which means something in the
   frame has to be listening, which means the served document has to carry a
   listener it did not come with.

### The design

`/p/[slug]` frames `/p/[slug]/raw?printable=1`. On that parameter — and only on
it — the raw route appends one small inline script to the document: a `message`
listener that calls `window.print()`. The sandbox becomes
`allow-scripts allow-modals`. A pill fixed to the corner of the shell posts
`"print-page"` into the frame.

The listener authenticates the sender with `event.source !== window.parent`
rather than checking `event.origin`. The document has an opaque origin and
cannot be told what the real one is without baking it into the injected string;
`event.source` is the precise question anyway — the only window that legitimately
drives this frame is the shell that created it, and the sandbox blocks the frame
from being given any other handle, because popups are not permitted.

### Why a message and not a reload

The obvious cheaper design is to skip the listener: put `?printable=1` on the src
and have the injected script call `print()` on load, so the pill just re-points
the iframe. It is rejected for one reason that settles it.

**These pages are interactive worksheets.** A student who fills in ten answers
and presses the pill must get those ten answers in the PDF. Re-pointing the
iframe reloads the document and destroys every one of them, silently, at exactly
the moment the student was trying to keep them. A message leaves the document —
and its state — alone.

### Why the parameter exists at all

The admin's download control is a plain `<a download href="/p/[slug]/raw">`, and
its purpose is a byte-exact round trip: download, edit in the tool the page was
written in, re-upload. Injecting the bootstrap unconditionally would put our
script into Jenn's source file, and the next upload would carry it back in and
be injected again. Gating on the parameter keeps un-parameterised `/raw` exactly
what it is today — her bytes, and nothing else. `HtmlPreview` frames the
un-parameterised route too, so no thumbnail carries a listener; it also has
`sandbox=""`, so it could not run one.

### The security delta of `allow-modals`

Worth stating plainly, because `CLAUDE.md` forbids adding a token to this
sandbox and someone will rightly stop at the diff.

The forbidden token is `allow-same-origin`, and the reason is specific: beside
`allow-scripts` it lets the framed document **remove its own sandbox**, which
collapses the entire model. `allow-modals` does nothing of the kind. It grants
`alert`, `confirm`, `prompt` and `print` — no origin, no cookies, no storage, no
access to the teacher session. The worst a hostile document can do with it is
block the tab with an `alert` loop, which it can already do with `while (true)`
under the `allow-scripts` it already has. The increment is a nuisance the page
could already cause, in exchange for the feature.

The documents are Jenn's own uploads, not student-supplied content, which is the
same trust boundary that justified `allow-scripts` in the first place.

### The accepted cost: fidelity

Print fidelity is the browser's, and for a page written for a screen it can be
poor — dark backgrounds dropped, a table cut across a page break, an element
positioned off the printable area. Nothing here fixes that, and nothing here
tries to: restyling Jenn's document is exactly what this feature has refused to
do since it shipped, and a print stylesheet we injected would be a guess about
someone else's design.

The fix belongs upstream, in the page: `@media print` rules in the documents
Jenn writes. That is a note in `tools/README.md` for the Claude that writes
them, not code here. A page with no print rules still prints; it prints like a
web page.

## 2 · A PDF is a third kind of page

### The data model

```prisma
// "html" | "link" | "pdf".
kind    String  @default("html")
html    String?
url     String?
// The document, for a pdf row. Bytes rather than base64 in a String: base64
// costs a third more room in a database the nightly VACUUM INTO copies whole.
pdf     Bytes?
// The size of that document. Not derived from `pdf` on read, because no shelf
// query selects `pdf` — see below.
pdfSize Int?
```

Three columns, exactly one populated — the same invariant `kind` already
carries, extended by one. `savePage` keeps writing every one of them on every
write, one of them to `null`, for the reason its comment already gives: a stale
column left behind by a replacement gives `readPageKind` two answers.

### Why the bytes go in SQLite

The same argument that put the HTML there: the nightly `VACUUM INTO` backup to
S3 covers a column for free, and covers a directory not at all. A PDF on disk
would be a second thing to restore, in a runbook whose restore procedure is one
`sqlite3` command, and it would have to survive a deploy that rebuilds the app
in place. S3 would mean an AWS SDK, credentials in the app rather than only in a
cron script, and a network dependency on the read path of a student's shelf.

`Bytes` on SQLite is already proven in this schema: `Passkey.publicKey` is one.
The idioms it establishes are the ones to follow — `Buffer.from(...)` on the way
in, `new Uint8Array(...)` on the way out.

### Why `pdfSize` is a column

It looks redundant. It is load-bearing, for a reason that is easy to miss:

**`readPageKind` cannot discriminate on a column the shelf refuses to load.**
Its fallback reads `url` and not `html` precisely because `SHELF_SELECT` omits
`html` — selecting a whole document to draw a grid of titles is the thing that
comment exists to prevent. A blob is that problem several times over. So the
defensive resolution needs a cheap signal, and a nullable integer is one.

It pays for itself twice: the size is what `PdfPreview` puts under the glyph,
via the `formatFileSize` that already exists for the drop zone.

### `readPageKind` gains a required argument

```ts
export function readPageKind(row: {
  kind: string;
  url: string | null;
  pdfSize: number | null;
}): PageKind
```

`pdfSize` is **required, not optional**, and every existing caller has to add it
to its `select`. That is the point. This function exists for one job — resolving
a row a migration or a hand-edited database left inconsistent — and a caller who
silently omits the pdf signal gets a broken pdf row resolved as `"html"`, which
renders an empty iframe: the precise failure the function's own comment says it
was written to prevent. Optional would compile everywhere and be wrong in the
one case that matters. Required makes the compiler name all six call sites.

Fallback order is `pdfSize`, then `url`, then `"html"`, on the same reasoning as
the existing order: resolve toward the row that is most likely to be real.

## 3 · Serving and opening a PDF

### The browser already has the viewer

This is the whole answer to "how do we open a PDF": `Content-Type:
application/pdf` with `Content-Disposition: inline`, and every current browser
renders it in its built-in viewer — PDFium in Chrome and Edge, pdf.js in
Firefox, PDFKit in Safari. Those viewers come with page navigation, zoom, text
selection, search, a print button and a download button. There is nothing to
build and no library to add. A student who wants the file saved presses the
viewer's own download button.

### `/p/[slug]/pdf`, a route of its own

The bytes get their own route rather than a `kind` branch inside `/p/[slug]/raw`.
The raw route's headers are a carefully argued CSP for a hostile HTML document;
a PDF wants a different set entirely, and one handler serving two content types
under two header regimes is the kind of thing a later edit gets wrong. Keeping
them apart also means `raw` needs no change at all: it already refuses every row
that is not html, and that contract is still exactly right. The new route is its
mirror — it refuses every row that is not pdf.

Headers:

| Header | Value | Why |
|---|---|---|
| `Content-Type` | `application/pdf` | The viewer. |
| `Content-Disposition` | `inline; filename=…; filename*=…` | Inline so it opens rather than downloads; the filename is what the viewer's own download button saves as. |
| `X-Content-Type-Options` | `nosniff` | Never let a mislabelled upload be re-interpreted as something executable. |
| `Cache-Control` | `no-store` | Matches `raw`. |

**No `Content-Security-Policy`, deliberately.** A CSP on a PDF response
constrains the browser's own viewer, and what `default-src 'none'` does to
PDFium or pdf.js cannot be verified from here — a directive that breaks the
viewer produces a blank frame, which is indistinguishable from a broken upload.
The threat it would answer is small and known: a PDF may contain JavaScript, but
PDF script engines have no DOM and no access to the embedding origin's cookies
or storage, and these files are Jenn's uploads under a teacher-only control. If
PDFs are ever opened to student upload, this line is the first thing to
reconsider.

### The filename is a security control

`Content-Disposition` carries a page title into a response header, and a title
is a string Jenn typed. A `"` ends the quoted string early; a CR or LF would be
a response-header injection. `contentDispositionInline` in `lib/pdf-filename.ts`
is a pure function with a test, like every other rule in this codebase, and it
emits both forms:

- `filename="…"` — stripped to a conservative ASCII set, so any client can read
  it.
- `filename*=UTF-8''…` — percent-encoded per RFC 5987, so *Verbes irréguliers*
  keeps its accents in the browsers that prefer this form, which is all of them.

A title with nothing usable in it falls back to the slug, which is already
guaranteed to be a safe token by `slugify`.

### `/p/[slug]` redirects a pdf row

A pdf row cannot be served by `page.tsx`, because that path is a page component
and the bytes need a route handler. So `/p/[slug]` redirects to `/p/[slug]/pdf`
and the PDF opens as a **top-level navigation**.

That is the right outcome and not merely the available one. **A PDF must not be
framed**: iOS Safari renders only the first page of a PDF in an iframe, which
would silently truncate every multi-page worksheet on every iPhone — the device
most of these students will use. A top-level navigation has no such problem, and
it hands the student the viewer's full chrome instead of a frame with none.

`CLAUDE.md` says `/p/[slug]` must never redirect, and this does not contradict
it. That rule is about `page.url` — a redirect to an attacker-influenced
off-site URL on a public route is an open-redirect phishing primitive. This
redirect has no input in it: it is a constant path on our own origin, derived
from the row's kind.

A bookmarked `/p/[slug]` therefore keeps working, which is the property slugs
exist to protect.

### A PDF is as public as a page

`/p/[slug]/pdf` is public, exactly like `/p/[slug]` and `/p/[slug]/raw`. The
slug is the only thing standing in front of it, and slugs are derived from
titles, so they are guessable. Nothing changes about the shelf's access rules —
this is the property uploaded pages have had since they shipped — but it is
worth writing down where someone deciding what to upload will read it: a PDF put
here is a PDF on the public web. Student names, marks and anything else
identifying belong in the chat, which is tokened, not on a shelf.

## 4 · Uploading a PDF

### One control, widened

No second form and no kind toggle. The drop zone accepts `.html` and `.pdf` and
decides from the file which it got. That is the same move the original spec made
for upload-versus-paste — *"upload and paste are one control"* — and it is why
`HtmlDropZone` becomes `FileDropZone` and moves to `components/ui/`.

The zone stops enforcing the size cap. It cannot: the caps differ by kind (2 MB
of HTML, 3 MB of PDF) and the zone does not decide kind. It hands the `File` up,
and `PageEditor` — which does know — enforces the right one next to the right
validator. `PageEditor` reads text for an HTML file exactly as it does today,
and holds a PDF as a `File` without reading it.

The title still comes from the filename, with the same don't-clobber rule
`titleFromFile` already implements, extended to strip `.pdf`.

### The transport is `FormData`

Bytes reach the server as a `File` inside a `FormData` argument to a server
action, not as a base64 string.

This is a documented deviation from `2026-07-30-uploaded-pages-design.md`, which
says *"the server action therefore takes a string and never handles a file"*.
The reason is arithmetic. The budget is `bodySizeLimit: "4mb"` in
`next.config.ts` and `client_max_body_size 4m` in nginx, and base64 costs a
third more: a 3 MB PDF would arrive as 4 MB of JSON plus the rest of the
payload, and get a 413 from nginx before Next ever saw it. `FormData` sends the
bytes as bytes. It is also the one server-action shape Next has always
supported for files, so it needs nothing experimental.

The HTML path keeps its string argument. Nothing about it changed.

### Size: 3 MB, chosen to need no server change

`MAX_PDF_BYTES` is 3 MB. Not a guess — it is the largest round number that fits
inside the 4 MB ceiling with room for the title, the group ids and multipart
overhead.

The ceiling is the one that hurts to move. `docs/DEPLOYMENT.md` item 11 records
that nginx's `client_max_body_size` had to be raised to `4m` by hand, on the
server, for HTML uploads to work at all — and that when it is too low the
failure is a raw nginx 413 that Next never sees, so the app cannot explain it.
Anything above 3 MB means an SSH session and an nginx reload before the feature
works in production, and a version of the app that is silently broken until
someone does it.

3 MB covers a text worksheet (50–300 KB from a print-to-PDF), most
image-bearing PDFs, and a short scan. It does not cover a long colour scan, and
the error message says so in words Jenn can act on.

### Teacher only

`createPdfPage` and `updatePdfPage` start with `requireTeacher()`, like
`createPage`. Students keep exactly the power they have — `addShelfLink`, which
stores a URL and no bytes.

This is a real boundary and not caution for its own sake. A student upload would
put unvalidated binary in the database, served from our own origin into the
browser's PDF engine, and would need `canStudentDelete`'s rules extended from
rows-with-a-url to rows-with-a-blob. None of that is impossible; all of it is a
separate decision, and this is not the change to smuggle it into.

### Validation is a magic-byte check

`validatePagePdf` checks three things: that there are bytes, that there are not
more than `MAX_PDF_BYTES` of them, and that they begin `%PDF-`.

The prefix check is the same kind of guard as `validatePageHtml`'s
`html.includes("<")`, with the same limited ambition — it catches the obvious
slip of picking the wrong file, and it is not an attempt to parse or sanitise a
PDF. There is no PDF sanitiser here for the same reason there is no HTML one:
the thing that contains a hostile document is the reader it is opened in, and
rewriting Jenn's file would be a guess about a format we do not model.

## 5 · The shelf and the admin

### A third filter chip

`KindFilter`'s `labels` prop gains `pdf` — "PDFs" in the admin, "Les PDF" on the
shelf. That the labels are passed in rather than switched on a locale flag is
why this is a two-line change on each side; the comment on that component
predicted this exact edit.

`filterPagesByKind` needs no change. It is generic over
`{ kind: PageKind }`, and a third value in the union is a third value it already
handles.

### `PdfPreview`

A third renderer for `PageTile`'s `preview` slot, beside `HtmlPreview` and
`LinkPreview`, and the second one to cash in the decision to make that slot a
`ReactNode`. It is `LinkPreview`'s shape: `BrandGlyph brand="pdf"` — the red PDF
sheet that already exists, because a PDF *link* has always had one — over a
caption that is `formatFileSize(pdfSize)` where the link's is its host.

A rendered first page would be a better thumbnail. It would also need pdf.js, on
a shelf that mounts a dozen tiles at once, which is the same trade the preview
frames already refuse.

### `PageTile`'s `external` prop becomes `newTab`

A PDF tile opens in a new tab, so the shelf stays where the student left it
while they read — and because a `next/link` prefetch of a route whose only job
is to 307 to a blob is wasted work.

That is the behaviour `external` already implements, so the prop is reused and
**renamed**. Leaving it called `external` while passing it for a same-origin
route of our own would make its comment — *"an off-site destination"* — false,
and this codebase's comments are load-bearing. The `rel="noopener"` it carries
stays: it costs nothing on our own origin and the comment explaining why it
matters for off-site links stays true for the case it was written about.

### The admin's per-tile controls

The edit and download icons are gated on `page.kind === "html"` today, with a
comment saying a link gets neither *"rather than two that fail"*. A pdf row can
support both — editing means replacing the file or changing the audience, and
downloading is the same `<a download>` pointed at `/p/[slug]/pdf` — so the gate
becomes `page.kind !== "link"`, which keeps the comment true and stops the list
from being edited again for a fourth kind.

`/admin/pages/[slug]` currently 404s anything that is not html. It now 404s only
a link, and renders the editor for a pdf row with the existing file described
rather than shown — `FileDropZone`'s `hasExisting` state already says exactly
that.

### Editing a PDF page's title or audience

Saving that form without choosing a new file must not lose the document. It is
also the common case: changing which students see a page is the main reason to
open the editor at all.

`updatePdfPage` handles it by not going through `savePage` when no file was
staged. A new `updatePageMeta` writes the title and replaces the group rows and
touches no content column. Keeping it out of `savePage` is what preserves that
function's flat invariant — every content column written on every call, one to
`null` — rather than introducing a nullable-means-leave-it-alone case into the
one place that invariant is enforced.

## Testing

Pure functions in `lib/`, tested in `tests/lib/`, per the project convention.
Components and Prisma access stay untested, as everywhere else here.

| File | Cases that matter |
|---|---|
| `tests/lib/page-pdf.test.ts` | `%PDF-` accepted; HTML bytes rejected; PNG bytes rejected; empty rejected; one byte over the cap rejected; the cap is exactly 3 MB. |
| `tests/lib/pdf-filename.test.ts` | ASCII title round-trips; accents survive in `filename*`; `"` and `\` cannot break out of the quoted form; **CR and LF never appear in the output**; a title of pure punctuation falls back to the slug; the result always ends `.pdf`. |
| `tests/lib/printable-bootstrap.test.ts` | The bootstrap is appended, the original document is a prefix of the result, the listener checks `window.parent`, and the message constant is the one the shell sends. |
| `tests/lib/page-kind.test.ts` | Extended: `"pdf"` read directly; an unrecognised kind with a `pdfSize` resolves to `"pdf"`; `pdfSize` beats `url` when a corrupt row has both; a null `pdfSize` still resolves as before. |
| `tests/lib/page-target.test.ts` | An html page opens in this tab; a pdf goes straight to the bytes in a new one; a link goes off-site; a link row with no `url` gets a dead href rather than throwing. |
| `tests/lib/page-filters.test.ts` | Extended: filtering to `"pdf"`. `filterPagesByKind` itself needs no change, and the test is there to say so. |

### What cannot be verified without a browser

Stated so it is checked deliberately rather than assumed:

1. **Print inside the sandboxed frame, end to end.** The `allow-modals`
   requirement is documented, but that the dialog appears, paginates the frame's
   document, and includes typed-in answers needs one real run in Chrome and one
   in Safari.
2. **A PDF at top level on iOS Safari.** The reason for the redirect is the
   framed-PDF truncation; that the top-level route displays correctly on a real
   iPhone should be confirmed, along with the download button in the viewer.
3. **Print fidelity of an existing page.** Expected to be imperfect. Worth
   looking at one real worksheet before deciding whether the `@media print` note
   in `tools/README.md` needs to be stronger than a note.

## Documentation

`CLAUDE.md`:

- Routes table: `/p/[slug]/pdf`.
- *Files: pages and links* becomes the three-kind story — the `pdf`/`pdfSize`
  columns, why the bytes are in the database, why `pdfSize` exists, the
  teacher-only upload, and the 3 MB cap tied to the nginx ceiling.
- The `/p/[slug]` sandbox paragraph: `allow-modals` is present, what it grants,
  and that `allow-same-origin` is still the forbidden one and why the two are
  not comparable.
- The `?printable=1` bootstrap, the `event.source` check, and the reason a
  message beats a reload.
- Why a PDF is not framed, and why the pdf redirect is not the open redirect the
  link rows are forbidden.

`docs/DEPLOYMENT.md`: item 11 gains a sentence tying `client_max_body_size 4m`
to `MAX_PDF_BYTES`, so the next person to raise the PDF cap finds the server-side
step from the constant rather than after a 413.

`tools/README.md`: a note that pages should carry `@media print` rules, and that
`html-to-pdf.swift` is the high-fidelity path when a page has to print exactly.
