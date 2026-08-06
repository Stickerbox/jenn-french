---
name: worksheets
description: Design rationale for worksheet versions: the three-slot rule, DOM snapshots, which tabs may save, and the editable-field probe.
paths:
  - app/g/**
  - app/api/worksheets/**
  - lib/worksheet-*.ts
  - lib/snapshot-*.ts
  - lib/editable-fields.ts
  - lib/page-version*.ts
  - components/worksheet/**
  - tests/lib/worksheet-*.test.ts
  - tests/lib/snapshot-*.test.ts
  - tests/lib/editable-fields.test.ts
  - tests/lib/page-version*.test.ts
---
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

**"Typeable" is narrower than it sounds, and the Save pill asks the document
whether it applies** (2026-08-06). What survives a strip is what the *browser*
drives: text fields, checkboxes, selects, `contenteditable`, `:checked`. What
does not is everything the page's own JavaScript drove — and a Dia worksheet is
often exactly that: clickable answers, drag-and-drop matching, div-based
pickers. Measured, not assumed: a real worksheet answered by clicking animated
elements came back inert, and the pill over it offered to re-save a document
nobody could edit.

**Which tabs may draw it is decided first**, by `canSaveFromSlot`
(`lib/worksheet-save-slots.ts`): Jenn on all three, a student on the blank and
on their own answers, **never on Jenn's correction**. That asymmetry is not
politeness. A save writes the CALLER'S slot from whatever view called it, so a
student saving from the correction would file Jenn's marks as their own
attempt, and what they actually handed in would be gone. Jenn saving from the
student's attempt is the opposite: it is how a correction is made.

Within those tabs the pill is drawn on the **blank always**, and on a **saved
version only when that version answers that it still has an editable field**.
`hasEditableFields` (`lib/editable-fields.ts`) is the predicate, and
`withEditableBootstrap` inlines its source into the served document the way
`withSnapshotBootstrap` inlines `snapshotDocument`'s — same ES5 rule, same
`toString()` test, for the same reason. The shell asks on the iframe's `load`
and listens for the reply; the frame has an opaque origin, so it has to answer
for itself.

Three things about that are load-bearing. **The blank is never probed** — it is
the live document with its scripts intact, and a click-driven worksheet has no
fields for the probe to find, so gating the blank on the answer would hide the
only way to save exactly the worksheets this exists to serve. **The state is
three-valued**, `null` until the answer arrives, because a pill that appears
and then vanishes reads as a fault. And **visibility is judged from the markup,
not from layout**: `getClientRects` needs a layout engine, which the test
environment does not have, and an untestable rule sitting between a student and
their homework is worse than a coarser one that is pinned — so a field hidden
by a stylesheet still counts as editable.

**The pill is disabled until the document reports a change, and the same
signal arms the browser's leave prompt.** The frame posts `DIRTY_MESSAGE` on
every `input` and `change` event — captured on `document`, so a page that stops
them bubbling is still heard — and the shell holds one `dirty` flag from it.
That flag greys the pill and registers a `beforeunload`, so leaving with
unsaved answers raises the browser's own dialog; `onSaved` clears it after the
write lands, never before, or a student could walk away from work that was
never stored. It is one flag and not two because it answers one question: is
there work here worth keeping? The prompt is gated on `canSave` as well, since
warning somebody about typing they have no way to save is a dead end. Browser
Back is the same accepted gap the whiteboard's leave-guard records —
`beforeunload` does not fire for an App Router `popstate` — but every other way
out of this page is a real navigation, because the tabs and the back control
are plain anchors rather than `next/link`.

The route is untouched and still writes the caller's own slot from whatever
view called it, so this withholds a control and adds no access rule. The
residual cost: on a click-driven worksheet, revising still restarts from the
blank, and Jenn's correction of one is an answer key rather than an annotated
attempt. Removing *that* is not a change to this control — it means making a
stored snapshot live again, which is the trade `lib/snapshot-dom.ts` records
and refuses.

**A new html page is a worksheet by default; a pdf and a link are not.**
`savePage` sets `worksheet: input.kind === "html"` in its **create** branch
only — the same shape as `addedByStudent` beside it, and it does not reopen the
rule that keeps `worksheet` out of `savePage`: that rule is about an *edit*,
which must never rewrite a flag Jenn set by hand, and `update` still leaves it
alone. `updatePageMeta` remains the only way to change it. The reason is that
almost every html page published here is a Dia worksheet, and the flag was
reachable only by reopening the editor after publishing — so the feature was
off for every page nobody went back to. A pdf keeps `false`: it cannot be
filled in in the browser, so its versions are uploads, which is a deliberate
act and a poor default.

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
