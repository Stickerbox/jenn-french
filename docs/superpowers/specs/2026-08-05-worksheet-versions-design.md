# Worksheet versions

**2026-08-05**

## The problem

Homework is a PDF today. Jenn sends one, the student prints or annotates it,
sends it back, and Jenn corrects it during the lesson and returns a corrected
copy if it is worth returning. Three documents exist and none of them is
addressable: they are attachments in whatever the student used to send them.
Nothing on the shelf records that homework was set, done, or marked.

This replaces that round trip with three **versions of one page**, all three
reachable from the tile the worksheet already occupies on the student's shelf.

## What is being built

A page Jenn has ticked as a worksheet gains up to two saved versions per
student, beside the page itself:

| Slot | Written by | Stored as |
|---|---|---|
| the blank | Jenn, at publish | `Page.html` / `Page.pdf` — unchanged |
| the student's | the student | a `PageVersion` row |
| Jenn's correction | Jenn | a `PageVersion` row |

Both parties see all three. The shelf tile carries a count badge when more than
one exists, and opens a chooser listing them.

An html worksheet is filled in **in the browser** and saved with a pill on the
document. A pdf worksheet is downloaded, edited in whatever the student has, and
**re-uploaded** — the round trip that happens today, except the result lands on
the shelf under the worksheet it answers instead of in a message thread.

## The three versions are not three pages

The obvious model — each version is another `Page` row with a parent pointer —
gets slugs, the existing viewer, previews and print for free, and is **wrong**.
`/p/[slug]` is public and a slug is derived from a title, so this publishes a
named student's homework to anyone who tries `devoir-3-marie`. The rest of the
shelf design has been careful that anything identifying lives behind a token.
A version is never reachable from `/p/`.

Versions as chat attachments were also rejected: `Message` is a body and a
boolean, so that is "build attachments for chat" wearing a worksheet's clothes,
and it loses the slot model entirely.

## An html version is a snapshot, not an answer set

The lighter design — capture `{field: value}` and replay it into the live
document — was considered and refused. It only works for standard form
controls, and these worksheets come out of Dia, which writes drag-and-drop
matching, div-based pickers, generated question lists and canvases. A worksheet
built that way would silently save nothing, and "silently saves nothing" is the
failure this whole feature exists to remove.

So a version is a **serialised snapshot of the rendered DOM**. Everything the
document's JavaScript did — toggled classes, moved elements, inserted text — is
DOM by the time Save is pressed, so cloning the tree captures it without
knowing anything about it. `contenteditable` content comes along for free for
the same reason.

Two consequences fall out of that choice and both are load-bearing.

**Every `<script>` is stripped from the clone**, including the bootstrap that
took the snapshot — so a stored version contains no code of ours, the same
discipline that keeps the print listener out of the admin's `<a download>`. The
alternative, keeping scripts, restores perfectly on a document whose JS only
wires event handlers and **silently wipes everything** on a document whose JS
rebuilds the DOM on load. Deterministic and degraded beats sometimes-perfect.

**A stripped snapshot is still typeable.** Text fields, checkboxes and `:checked`
CSS are browser behaviour, not JavaScript. That is what lets Jenn open the
student's version and write corrections into it, and it is why the correction is
the *same operation* as the attempt rather than a second feature. What is dead
is the worksheet's own logic — a "check my answers" button will not work in a
saved version. Reopening the blank always gives the live original, so nothing is
permanently lost.

A third property falls out for free: because a snapshot is self-contained,
**replacing the worksheet later cannot corrupt a version already saved.** There
is no field-alignment problem to guard against, which is the main thing that
would have made the answer-set design fragile.

## Schema

```prisma
model Page {
  // Jenn's tick. Only an html or pdf row can carry it; a link has nothing to
  // fill in.
  worksheet Boolean       @default(false)
  versions  PageVersion[]
}

model PageVersion {
  id      String @id @default(cuid())
  pageId  String
  groupId String
  page    Page   @relation(fields: [pageId], references: [id], onDelete: Cascade)
  group   Group  @relation(fields: [groupId], references: [id], onDelete: Cascade)

  // Who saved it. A boolean for the reason Message.fromTeacher is one: there
  // are exactly two participants and one of them has no row to point at.
  fromTeacher Boolean

  // "html" | "pdf", copied from the page at save time and deliberately NOT read
  // back through the relation. savePage lets an html page be replaced by a pdf
  // at the same slug, which would silently retype every version already saved.
  kind     String
  // Exactly one branch is populated, mirroring Page's own three-column shape.
  snapshot Bytes?
  pdf      Bytes?
  pdfSize  Int?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  // THIS is the three-slot rule, enforced by the database rather than by a
  // convention inside an action.
  @@unique([pageId, groupId, fromTeacher])
}
```

`@@unique([pageId, groupId, fromTeacher])` is the whole "exactly three versions"
design. A save is an upsert against it; there is no counting, no pruning, and no
way for a fourth row to exist.

**The everyone group can never hold a version.** `/g/all` is public and
untokened, `shelfRole` already refuses students there, and Jenn on `/g/all` has
no student for a version to belong to. Same shape as chat and whiteboards, and
it is enforced by `chatRole`, which refuses that group before it checks anything
else.

`onDelete: Cascade` on both relations: deleting a page or a student takes its
versions with it.

### Why `snapshot` is compressed and `pdf` is not

An html snapshot is a whole document, and a 500 KB Dia artifact stores at
roughly 40–70 KB under brotli. Without that, this table becomes the largest
thing in a SQLite file the nightly `VACUUM INTO` copies whole. A PDF is already
compressed, so brotli would spend CPU to grow it.

**Brotli through the async API only** — `promisify(zlib.brotliCompress)`, never
`brotliCompressSync`. One pm2 fork process serves every SSE stream, and a
synchronous compression of a megabyte would stall the `: ping` heartbeats. This
is the same rule `lib/password-hash.ts` records for bcrypt, for the same reason.

### `readVersionKind`

`lib/page-version-kind.ts`, narrowing `kind` to `"html" | "pdf"` with the same
defensive contract `readPageKind`, `readSections` and `readOps` have: resolve on
`pdfSize` rather than trusting the string, because the row most likely to be
broken is one with content and a wrong kind.

Not `readPageKind` itself. That function can return `"link"`, which is
impossible here, and reusing it would push a dead case into every caller.

## Routes

`/p/[slug]` and `/p/[slug]/pdf` are **untouched**. A worksheet's blank stays
publicly viewable exactly as today; nothing about a saved version is reachable
from a guessable slug.

| Route | Who | Notes |
|---|---|---|
| `/g/[slug]/w/[pageSlug]` | student or teacher | the html shell: full-screen frame, version switcher, Save pill, print pill |
| `GET /g/[slug]/w/[pageSlug]/raw?v=` | student or teacher | `blank` \| `student` \| `teacher`; the document, under CSP |
| `GET /g/[slug]/w/[pageSlug]/pdf?v=` | student or teacher | a pdf version, top-level, in the browser's own viewer |
| `POST /api/worksheets/[slug]/[pageSlug]` | student or teacher | saves the caller's own slot |

### Authorisation

`chatRole` (`lib/chat-access.ts`) is reused **verbatim** — no new access module.
Its clause order is already exactly what this needs: it refuses the everyone
group *before* it checks the teacher, which here means neither party can save a
version where there is no student for one to belong to.

Three further guards sit in `lib/worksheet-access.ts`, pure and tested:

- the page must have `worksheet` set,
- it must be an html or pdf row, never a link,
- it must be on **this student's effective shelf** — otherwise a guessable page
  slug lets anyone attach versions to any document.

The shell additionally requires `unlocked` for a student, via `studentGate` as
the Files tab does, so an invite-holder who has not signed up yet cannot file
work.

`/f/[token]` gets none of this. That link is read-only and is the one shared
with a parent: the worksheet tile there points at the public blank, with no
badge, no chooser and no save. `filesToken` addresses a shelf, and a student's
answers are not the shelf.

### Containment

The raw route serves under the **same CSP as `/p/[slug]/raw`** — `default-src
'none'`, no `https:` in any directive, `connect-src 'none'` — and the shell
frames it `sandbox="allow-scripts allow-modals"`, never `allow-same-origin`,
which beside `allow-scripts` would let the page remove its own sandbox.
**No directive is widened for this feature and none may be.**

`allow-scripts` is still required even though a snapshot's own scripts are
stripped: the blank version is Jenn's live worksheet, and the Save and print
bootstraps have to run.

The honest statement: a snapshot contains text a student typed, and a
`contenteditable` region captures as **real student-authored HTML**, so a
student can get markup into a document Jenn later opens. Stripping `<script>`
does not close that — `<img onerror>` survives. It is contained by the argument
already accepted twice here rather than by a new one: the frame has an opaque
origin, so it can read no cookie, no storage and no teacher session, and no CSP
directive admits a network destination to exfiltrate to. The blast radius is a
worksheet that looks broken.

A pdf version is served with `/p/[slug]/pdf`'s headers exactly —
`application/pdf`, `X-Content-Type-Options: nosniff`, `no-store`, and a
`Content-Disposition: inline` built by `contentDispositionInline`
(`lib/pdf-filename.ts`), which is a security control and not a formatter: it
carries a title into a response header, where a `"` ends the quoted form early
and a CR or LF is header injection. Its title folds in the version label, so
three downloads are *Devoir 3 — mes réponses.pdf* and not three files with one
name.

It carries **no CSP**, for the documented reason: a CSP on a PDF response
constrains the browser's own viewer, and a directive that breaks PDFium renders
a blank frame indistinguishable from a broken upload.

### Cache-Control is `no-store`, always

No `?v=` version token like `/p/[slug]/raw` has. That route can answer
`immutable` because it serves one public document; these serve one named
student's homework, and `private` on a shared device is not a guarantee worth
making.

### Save is a POST route, not a server action

Server actions cap request bodies at 1 MB by default, and raising that limit
globally to serve one feature is worse than a scoped route.

An html snapshot arrives as text and is read with `readBoundedBody`
(`lib/bounded-body.ts`), which counts bytes as they arrive and stops reading the
moment the cap is passed, rather than trusting `Content-Length` — a claim a
chunked request omits entirely and a hostile one can lie about.

A pdf version arrives as a `File` in `FormData`, exactly as `addShelfPdf` takes
one, because base64 costs a third more and 3 MB of PDF would arrive as 4 MB
against nginx's 4 MB limit. That branch is bounded by `validatePagePdf` after
parsing and by nginx before it, which is the arrangement the existing PDF upload
already uses — `readBoundedBody` cannot bound a body the framework has to parse
as multipart.

## Taking a snapshot

A **third injection** in `lib/printable-bootstrap.ts`, beside the print and
capture ones, under the same gate discipline: only `?snapshot=1` asks for it,
the three are mutually exclusive, and the admin's `<a download>` still gets
Jenn's bytes with none of them.

It authenticates its caller by `event.source !== window.parent`, never by
`event.origin` — the frame has an opaque origin and no origin string to compare
against; which window is asking is the precise question, and the sandbox forbids
popups so no other window can obtain a handle to post through.

On the message it clones `document.documentElement`, walks the live tree and the
clone in lockstep exactly as `settle()` already does, and reflects live state
into markup:

| Live | Written onto the clone |
|---|---|
| `input` (text, number, date…) | `value` attribute |
| `input` checkbox / radio | `checked` attribute |
| `textarea` | text content |
| `select` | `selected` on the chosen `option`s, single and multiple |
| `canvas` | replaced by `<img src=toDataURL()>` at the same size |
| contenteditable, JS-built DOM, toggled classes | already in the clone |

Then every `<script>` is removed and the result serialised.

### The walk is a real module

`lib/snapshot-dom.ts` exports a **self-contained** function, and the bootstrap
string inlines it via `Function.prototype.toString()` — the technique Playwright
uses for `page.evaluate`. Self-contained is a requirement, not a style note: no
imports, no closure over module scope, and no TypeScript syntax that compiles to
a helper, because the bundler's output is what ends up in the browser.

This is worth one devDependency (`happy-dom`) and one trick. It is ~80 lines of
DOM traversal whose failure mode is a student's homework saved silently wrong,
and the existing bootstraps are tested only as strings — "does it contain
`event.source !== window.parent`" — which is right for a five-line print
listener and not for this. A hand-maintained second copy inside the string was
rejected: two implementations of one rule is the drift this codebase repeatedly
designs against.

## Failure is reported, never swallowed

This **inverts** the contract of `captureHtmlThumbnail` sitting beside it, and
the inversion is the point. That function returns `null` on every failure
because a missing preview leaves a working iframe in place. A silent Save loses a
student's homework.

So the frame replies `{ ok: false, reason }` on any throw rather than staying
silent, the shell times out at 10 s regardless, and the error stays on screen.
Nothing navigates away on Save, so a student whose network dropped still has
every answer in the DOM and can press it again.

`MAX_SNAPSHOT_BYTES` is 3 MB, chosen the way `MAX_PDF_BYTES` and
`MAX_UPLOAD_BYTES` were — the largest round number under nginx's
`client_max_body_size 4m`. It must exceed `MAX_PAGE_BYTES` (2 MB) because a
snapshot is the worksheet plus what the student typed plus any canvas rasterised
to a PNG data URL. The frame measures the serialised string and refuses before
posting, so an over-large save fails with a sentence rather than a raw 413 that
Next never sees and the app cannot explain.

Other degradations, all deliberate:

- **A tainted `<canvas>`** throws on `toDataURL`. That element is left as an
  empty canvas and the rest of the snapshot is saved: one blank box beats losing
  the page.
- **A replaced worksheet** does not invalidate versions already saved; they are
  self-contained documents. The chooser shows dates, so a version older than its
  worksheet is legible as such. Deleting a student's work because Jenn fixed a
  typo would be the worse failure.
- **Two tabs saving** is last-write-wins on the upsert. There is no lock; the
  slot is one person's own.
- **The chat line failing** never costs the save.

## What Jenn and the students see

### Marking a worksheet

A checkbox in `PageEditor` — *"Students can save their answers"* — shown for html
and pdf rows and not for links. Deliberately **not** in `NewPageForm`: there the
paste (or the file choice) *is* the submit and the form has no fields at all, so
adding one would contradict that flow. She ticks it in the edit overlay, which
`tools/publish-dia-artifact.sh` already opens after a publish and where she picks
the audience anyway.

`worksheet` is written by `updatePageMeta`, not `savePage`. It is metadata, so
re-flagging does not read and rewrite the document, `savePage`'s every-content-
column invariant keeps no hole in it, and a republish at the same slug **keeps
the flag** — the same way `addedByStudent` survives an edit.

### The tile

Each shelf row carries its versions for that group — `{ fromTeacher, updatedAt,
kind }[]` — fetched by one query beside the pins query and folded on by
`applyVersions` (`lib/page-versions.ts`), mirroring `applyPins`.

**Never the snapshots themselves.** A shelf query that loads a blob to draw a
badge has already paid for the thing the badge was avoiding — the same lesson
`pdfSize` and `thumbAt` each record one column apart.

`pageTarget` (`lib/page-target.ts`) gains the worksheet route, so both shelves
keep deciding a tile's destination in one tested place rather than growing a
second ternary each. It needs the group slug to do it, so the worksheet
destination is returned **only** when one is supplied: the admin Pages tab under
"All" and `/f/[token]` pass none and keep today's targets.

That is the same rule the pin control already follows, and for the same reason:
**"All" is not a shelf.** With no student selected there is no student whose
versions could be listed, so a worksheet tile on the admin Pages tab under "All"
carries no badge and opens the public page. It looks like a missing feature and
is not one — Jenn reaches a student's versions from that student's shelf, which
is the screen that says *Marie Dupont's page*.

### Opening one

| | html worksheet | pdf worksheet |
|---|---|---|
| tile, 1 version | opens the shell directly | opens the chooser |
| tile, 2–3 versions | opens the chooser | opens the chooser |
| viewing a version | shell frame, `?v=` | `/g/[slug]/w/[pageSlug]/pdf?v=`, top-level |
| saving | Save pill on the document | *Téléverser mes réponses* in the chooser |

The one place the kinds diverge is where a save control can live, and the
difference is principled: **we can decorate an HTML document and we cannot
decorate a PDF.** A PDF must open as a top-level navigation in the browser's own
viewer — iOS Safari renders only the first page of a framed PDF, which would
truncate every multi-page worksheet on the device most of these students use —
and there is nowhere in that viewer to put a button. That is why a pdf worksheet
opens the chooser even at one version: the chooser is the only surface it has.

**The chooser's rows are anchors, not buttons.** The whiteboard's leave-guard is
a capture-phase `click` listener on `document` that inspects anchors, so anchors
are protected by it without knowing it exists — the same reason the admin's
pencil had to stay one.

### Labels

Chosen by audience, the way `greeting` and `teacherPageLabel` already split, in a
pure `lib/version-labels.ts` holding both mappings. The same labels drive the
chooser and the switcher inside the shell.

| Slot | Student | Jenn |
|---|---|---|
| blank | *Le devoir* | *The worksheet* |
| student | *Mes réponses* | *Marie's answers* |
| teacher | *La correction de Jenn* | *My correction* |

### Save writes to your own slot, from whatever you are looking at

One rule, no modes. A student who opens Jenn's correction, fixes their mistakes
and saves writes their own version; Jenn opening the blank and filling in a model
answer writes hers. The alternative — Save disabled unless you are on "your"
version — is a rule that has to be explained.

The pill reads *Enregistrer mes réponses* for a student and *Save correction* for
Jenn, and reports: idle → *Enregistrement…* → *Enregistré* → an error that stays.

### The notification

One line posted into that student's conversation after the save commits —
*« Devoir 3 » : mes réponses sont enregistrées* from the student, *J'ai corrigé
« Devoir 3 »* from Jenn. It rides the existing unread dot and SSE stream, so it
arrives wherever each party already looks, and it costs no new notification
model.

Same contract as `addChatLinks`: it runs **after** the write and **never
throws** — a notification that fails must not cost the homework it was
announcing.

Every save posts a line, with no dedupe window. A re-save is a real event, Jenn
can already delete an individual message, and a time window would be a magic
number standing in for a judgement nobody has had to make yet.

## Tests

Pure modules in `lib/` with tests in `tests/lib/`, per the project rule. Route
handlers, the shell and the chooser are components and Prisma access, so the
modules underneath them are what is tested.

| Module | What is pinned |
|---|---|
| `lib/snapshot-dom.ts` | the walk, against happy-dom fixtures: checked box, filled textarea, selected option, multiple select, canvas → img, contenteditable survives, **every `<script>` stripped including the bootstrap's own**, and the output re-parses to the same state |
| `lib/version-labels.ts` | both audiences × three slots; a student never sees an English label |
| `lib/page-versions.ts` | `applyVersions` — count, ordering, a page with no versions, versions from another group never leaking on |
| `lib/page-version-kind.ts` | both kinds, and the `pdfSize` fallback on a row with a wrong `kind` string |
| `lib/worksheet-access.ts` | not a worksheet, a link row, not on this shelf, and both kinds passing |
| `lib/page-target.ts` | a worksheet with a group slug, a worksheet without one, and every existing case unchanged |
| `lib/printable-bootstrap.ts` | the third bootstrap's gate: absent without `?snapshot=1`, and all three mutually exclusive |

`chatRole`, `validatePagePdf` and `contentDispositionInline` are reused unchanged
and keep the tests they have.

## Out of scope

Stated rather than left quiet:

- **A link row cannot be a worksheet.** There is nothing to fill in.
- **A version's kind always matches its page's.** A student cannot answer an
  html worksheet by uploading a photographed PDF of it. That is a real workflow
  and it is deliberately deferred: it breaks the one-kind-per-page assumption
  that keeps the chooser and the routes simple, and it is addable later without
  moving anything already built.
- **No versions on `/g/all`**, and none reachable from `/f/[token]`.
- **No history beyond the three slots**, and no control to delete a version —
  re-saving replaces it.
- **No auto-grading**, and no drawing or annotation layer over a worksheet. Jenn
  corrects by typing into the student's version, which is what the round trip
  does today.
- **No per-version thumbnail.** The tile keeps showing the blank's picture.
