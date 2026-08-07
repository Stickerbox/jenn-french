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
  - components/pdf/**
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

**"Typeable" is narrower than it sounds, and the editable probe answers
whether the caller's own saved copy still is** (2026-08-06). What survives a
strip is what the *browser* drives: text fields, checkboxes, selects,
`contenteditable`, `:checked`. What does not is everything the page's own
JavaScript drove — and a Dia worksheet is often exactly that: clickable
answers, drag-and-drop matching, div-based pickers. Measured, not assumed: a
real worksheet answered by clicking animated elements came back inert. There
is no Save pill for that answer to gate any more (see below); it now draws the
`stuck` hint beside Recommencer / Delete correction instead, so a document
that came back inert says so next to the control that gets a party off it,
rather than sitting there silently offering fields nobody can fill in.

**Which tabs may write is decided first, by two rules, not one.**
`canSaveFromSlot` (`lib/worksheet-save-slots.ts`) governs a PDF worksheet's
upload button: Jenn on all three tabs, a student on the blank and on their own
answers, never on Jenn's correction. `isWritableSlot`, beside it in the same
file, governs an html worksheet's auto-save and answers differently for Jenn —
**on purpose**. A student is the same case both ways, and harder under
auto-save than under a pill: typing over Jenn's correction used to require a
press to destroy an attempt, and now a stray keystroke does it by itself, so
`isWritableSlot` still confines her to `slot === "student"`. Jenn is where the
two rules part. A PDF version is an upload — a deliberate act she performs from
wherever she is standing — so `canSaveFromSlot` leaves all three of her tabs
open. An html version is auto-saved ten seconds after a keystroke, with no
press in which to reconsider, so `isWritableSlot` gives her exactly one
writable tab: any of the three while she has no correction yet, because her
first keystroke seeds it and where it lands decides whether that correction is
an answer key or an annotated attempt — and only her own tab once a correction
exists, because reopening the student's attempt a second time and typing would
silently overwrite the one she already made, with no version history to
recover it from. **Do not delete either function as a duplicate of the
other**, and do not let a fix to one drift into the other's territory: a press
and a ten-second timer are not the same act, and the two page kinds they gate
are not the same risk.

| Tab | Jenn, PDF | Jenn, html, no correction | Jenn, html, has correction | Student |
|---|---|---|---|---|
| Blank | write | write | read-only | read-only |
| Student's attempt | write | write | read-only | write |
| Jenn's correction | write | write | write | read-only |

Blank/Student reads read-only rather than n/a on purpose: `isWritableSlot`
answers `slot === "student"` for a student regardless of whether they can
reach `slot` — its own test says so directly, "not a tab they can reach, but
the predicate must not depend on that" — because a student's tab is always
`"student"` from the moment they open a fresh worksheet, blank content served
under that slot until their first save gives it a row. The cell records what
the predicate answers, not a tab that exists in the product.

The table's read-only cells are where `stuck` and the *Lecture seule* /
*Read-only* marker matter: the document still **types** on a read-only tab —
text fields, checkboxes and `:checked` are browser behaviour, and stopping
them would mean rewriting the served document — so the marker exists precisely
because the tab would otherwise look writable right up until the debounce
tried to save and silently lost the keystrokes. Jenn's own way back onto a
locked tab is deleting her correction (below); a student's is `Recommencer` on
their own slot, the button that exists because auto-save removed the only
other way out of an inert worksheet.

Within a writable tab the pill used to be drawn on the **blank always**, and on
a **saved version only when that version answers that it still has an editable
field**. `hasEditableFields` (`lib/editable-fields.ts`) is the predicate, and
`withEditableBootstrap` inlines its source into the served document the way
`withSnapshotBootstrap` inlines `snapshotDocument`'s — same ES5 rule, same
`toString()` test, for the same reason. The shell asks on the iframe's `load`
and listens for the reply; the frame has an opaque origin, so it has to answer
for itself. That probe still runs and still feeds `editable`, but Save is gone;
what it now gates is the *stuck* hint beside Recommencer/Delete correction —
`writable && ownExists && editable === false` — since a disabled document with
no explanation beside it reads as a broken page rather than a worksheet that
cannot be re-typed.

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

**Save is not a control any more — it is a ten-second timer, and what a party
presses instead is Send or Recommencer/Delete correction, each following the
CALLER'S OWN row rather than the tab that happens to be open.**
`useWorksheetAutosave` (`components/worksheet/useWorksheetAutosave.ts`)
restarts a `DEBOUNCE_MS` (10 000 ms) timeout on every `DIRTY_MESSAGE` — posted
on every `input` and `change` event, captured on `document` so a page that
stops them bubbling is still heard — counted from the LAST keystroke rather
than the first, so a run of typing costs one write instead of one per pause.
That same `dirty` flag arms the browser's `beforeunload` prompt, gated on
`writable` as well since warning somebody about typing they have no way to
save is a dead end; `onSaved` clears it after the write lands, never before,
or a student could walk away from work that was never stored. Browser Back is
the same accepted gap the whiteboard's leave-guard records — `beforeunload`
does not fire for an App Router `popstate` — but every other way out of this
page is a real navigation, because the tabs and the back control are plain
anchors rather than `next/link`. `flush()` clears the pending timer and writes
immediately if anything is outstanding, and answers whether the write landed;
Send calls it and awaits the answer BEFORE it POSTs to `/send`, because a
notice about work that was never stored is worse than a late notice.

**`sentAt` is nulled by `saveHtmlVersion`/`savePdfVersion` on every write — in
both the create and the update branch — rather than left standing so
`sendState` could compare it against `updatedAt`.** Two timestamps written by
the same request can tie: SQLite's stored precision does not guarantee a save
and its own mark differ, so a comparison risks reading a version as "still
sent" in the instant it stops being true. A null answers a yes/no question with
no clock in it — `findVersionMeta`'s `sentAt` is either there, meaning nothing
has touched the row since the last notice, or gone, meaning something has.
`sendState` (`lib/worksheet-send.ts`) folds that boolean together with `dirty`
— checked FIRST, because the last ten seconds of typing have not reached the
server's `sentAt` at all — into three states: `"empty"` (nothing to send,
drawn disabled so the control is where it will be rather than appearing from
nowhere), `"ready"` (unannounced work exists), and `"sent"` (announced and
unchanged, drawn disabled and SAYING so — a control that vanishes after a
press tells a student nothing about whether the press worked).

**The first save moves the shell in place, and does not reload.** `onSaved`
(`WorksheetShell.tsx`) adds the caller's own slot to `tabs`, moves `current` to
it, and calls ``window.history.replaceState(null, "", `?v=${mine}`)`` — a
`history` call, not a `router.push`, because the frame's DOM already IS the
new version; a reload would fetch the same bytes back and throw away any key
pressed during it. This is what Jenn sees making a fresh correction: she opens
the student's attempt with no correction yet, types, and ten seconds later she
is on "My correction" holding the exact document she has been typing in, its
address now agreeing with where the write went.

**Delete is `POST /api/worksheets/[slug]/[pageSlug]/restart`, one route behind
two labels — Recommencer to a student, Delete correction to Jenn — and it
always deletes the CALLER'S OWN row, never a row named by the tab that is
open.** `DeleteVersionButton` is drawn whenever `ownExists`, which for Jenn is
all three of her tabs at once: one stray keystroke on the blank creates a
correction and locks the other two (see the table above), so a control that
unlocks them is useless if it is reachable only from the tab she must first
know to open. For a student it is the sole way out of a click-driven worksheet
that auto-save has answered into an inert copy — there is no blank left to
fall back to under one tab, the way there was under a pill and two. It
confirms first, because there is no version history behind it: the row is
simply gone. On success it navigates with `window.location.href`, not a
reload, to `/g/{groupSlug}/w/{pageSlug}` with NO `?v=` — the tab that was open
no longer exists, and the page must pick each party's correct default for
itself.

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

**THE VERSION-PICKER DIALOG IS GONE** (2026-08-07), for both parties.
`components/worksheet/VersionChooser.tsx` is deleted and a worksheet tile is a
plain anchor again. It was answering a question its own destination answers
better: the worksheet page carries the same versions as tabs, in the same
order, above the document — so the dialog asked which version to open and then
opened a page whose first control was that same choice. For a student it was
worse than redundant, since it turned "open my homework" into a two-step with
a question in the middle that has one obvious answer. Do not reintroduce it as
"just for the teacher"; her tabs are the same tabs.

A consequence worth knowing: the tile being an anchor again is what puts it
back under the whiteboard's capture-phase leave-guard, which is the reason the
dialog's own rows had to be anchors while it existed.

**The shelf tile still carries a count badge, and it counts what THIS reader
can open** — `shelfSlotCount(page.versions, audience)` (`lib/page-versions.ts`),
which goes through `visibleSlots` rather than counting rows. It lives only in
`FilesTab`, gated on `groupSlug` as well, so `/f/[token]` has none.

That count replaced a `versions.length + 1` that counted the blank for
everybody. **That was right while both parties saw three tabs, and became a lie
the day the student dropped to their own copy:** one saved attempt read as two,
so the shelf badged a student's own typing as though something had arrived, and
the tile opened a dialog offering a blank they cannot reach. Deriving badge,
tabs and count from one module is the fix — the next change to who-sees-what
cannot leave the shelf behind. Jenn's numbers are unchanged.

So a student's badge appears **only once Jenn has corrected**, which is exactly
when it means something: there is new work to read. Opening the tile then lands
on the correction, not on their own answers (`readSlot`,
`app/g/[slug]/w/[pageSlug]/page.tsx`) — it is the part that changed, and their
answers are one tab away.

**A student's version tabs are drawn even when there is only one of them**, via
`WorksheetHeading`'s `showWhenAlone`. Their lone *Mes réponses* is a label
saying whose copy this is, not a chooser that cannot act, and it is the anchor
Jenn's correction appears beside — without it the strip materialises out of
nothing the day she corrects, which reads as a glitch rather than as news. Jenn
keeps the old rule and gets the document's title until a second version exists.
A pdf worksheet keeps it too: `showWhenAlone` is a prop and not
`audience === "student"` precisely so that path stays untouched.

A pdf worksheet's tile points at `/g/[slug]/w/[pageSlug]` — the same route an
html worksheet's tile opens — rather than skipping ahead to the raw bytes,
because that route no longer redirects a pdf row out to the browser's own
viewer; it renders `PdfShell` over `PdfDocumentView` and carries the upload
control itself (see `.claude/rules/files-pages-pdfs.md`'s "A PDF is never
framed" for the fuller change). **The version tabs are one component**, `WorksheetHeading`, shared by
the html shell and the pdf one — they were written twice, with a comment on
the second copy asking the reader to keep them in step by eye, and the two had
already drifted. **The tabs hide when there is nothing to choose**: `slots`
always holds the blank, so a worksheet nobody has saved to drew a strip of one
tab, already selected, that did nothing when pressed — above every worksheet
on its first opening, which is most of them. The document's title takes that
place instead, the same `ShellTitle` `/p/[slug]` shows, so the bar always says
what you are looking at and starts offering versions the moment a second one
exists. The bar itself is `ShellBar` (`components/ui/ShellBar.tsx`) in two
variants: `floating` over the html shell's `fixed inset-0` iframe, `sticky`
over the pdf viewer's canvases, which flow. **The chooser's rows are anchors,
not buttons**, the same reason the admin's pencil had to stay one: the
whiteboard's leave-guard is a capture-phase `click` listener on `document`
that inspects anchors, so a row is protected by it without knowing it
exists, and a `router.push` handler would slip past it.

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
