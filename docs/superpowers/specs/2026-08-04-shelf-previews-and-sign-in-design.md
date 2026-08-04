# Shelf uploads, stored previews, and signing in by email — design

Date: 2026-08-04

Five changes that share no single theme, gathered here because they were asked
for together and because three of them touch the same tile.

## Problem

**A student cannot hand Jenn a file.** The shelf FAB offers a link and a pasted
document. A student with a scanned worksheet, a PDF a parent printed for them,
or homework exported from Word has no way to put it on their own shelf.
Uploading a PDF is teacher-only, and the previous spec said so deliberately:
*"A student upload would put unvalidated binary in the database served from our
own origin, and would need `canStudentDelete` extended from rows-with-a-url to
rows-with-a-blob — a separate decision."* This is that decision, and half of
its stated cost has already been paid — see *Student PDF upload* below.

**Jenn's FAB shrinks when she opens a student.** On `/admin` she can add a
link, a document or a PDF. On `/g/marie` — the screen where she can see what
Marie actually has — she gets the student's two-item French menu. The one place
where "put this on Marie's shelf" is the obvious act is the place with the
fewest ways to do it.

**The dia script talks to nobody.** Every message it prints was written for a
terminal, and the teacher runs it from a Shortcut. The comment at `die()`
records the discovery that Shortcuts discards stdout — but that turned out to
be only half true, and the success chatter now surfaces as a banner reading
`Publishing "Top 10 Québécois Words" (13003 bytes) to http://localhost:3000 …`
which tells her a number she cannot use about a step that already finished.
Separately, Dia writes a recurring artifact whose title has the shape *The X
Brief*; it is never published, and it crowds the ten-row picker.

**A page that uses a CDN previews blank.** This is the one worth stating
carefully, because two different faults produce the same empty tile:

1. `inlinePage` folds an allowlisted CDN's JavaScript and CSS into the stored
   document, so the page at `/p/[slug]` works. But `HtmlPreview` frames it with
   `sandbox=""`, so the inlined script never runs, and a page whose layout is
   drawn by Tailwind's CDN build or by a chart library previews as a blank
   white box. `2026-07-31-page-tiles-design.md` names this cost and accepts it:
   *"a page drawn entirely by JavaScript previews blank … that is not detectable
   from out here."*
2. A host that is **not** in `ASSET_HOSTS` is left external, and the raw
   route's CSP — which admits no `https:` anywhere — blocks it. That page is
   broken at `/p/[slug]` too, not only in the tile.

The reported symptom is artifacts published from Dia that link out to external
JavaScript and CSS. Fault 1 is the common one and the one this design fixes.
Fault 2 is a real page being broken and must not be *hidden* by the fix.

There is a second, quieter cost in the same place. A shelf of a dozen tiles
lays out a dozen full documents at 500% width on every visit. `?v=` caching
removed the network fetch; it did not remove the layout.

**Jenn cannot rename a page from a student's shelf.** On `/admin` a tile has a
pencil. On `/g/marie` the same tile has a pin and an ×. Renaming means going
back to the admin, finding the page among everyone else's, and renaming it
there. And on both screens the pencil is a *navigation*: it replaces the list
with a form on its own URL, so correcting a title costs the list position, the
search text and the active student chip.

**A student who loses their link has nowhere to go.** Sign-in is per-page:
`/g/marie` carries the form, and the form is scoped to the slug in the URL. A
student who has bookmarked nothing, or a parent on a new phone, has no door at
all — the landing page offers *Word of the day*, which lands on the everyone
group. `docs` records that "I forgot my password" is Jenn pressing Reset
sign-in; "I forgot which page is mine" has no answer at all.

## Goals

- A student can upload a PDF to their own shelf, and only a PDF.
- Jenn gets her full add menu on a student's page, targeted at that student.
- The dia script is silent under Shortcuts and unchanged in a terminal, hides
  *The X Brief*, and opens the published page's editor on success.
- An HTML page's tile shows a stored JPEG of the page **as a student sees it**,
  rendered once, with the live iframe still there as the fallback.
- Jenn can rename a page from either screen, in an overlay, without losing the
  list behind it.
- A student can sign in with an email address and a password from the landing
  page and be taken to their own page.

## Non-goals

**No server-side rendering of anything.** `2026-08-03-page-pdf-support-design.md`
refused Puppeteer for a `t3.small` where `npm run build` already needs swap, and
refused running Jenn's HTML through a real browser on the server because the
whole `/p/[slug]` model is an opaque origin in someone else's browser. Both
refusals stand and both apply to HTML thumbnails.

**No new CSP directive, and no new sandbox token.** The capture below runs
inside the existing policy. A design that needed the policy widened would be
the wrong design: `2026-08-03-inlining-page-assets-design.md` states plainly
that the CSP "was not widened to make this work and must not be."

**No backfill script.** A stored preview is an optimisation over a working
fallback, exactly as `pdfThumb` is over the glyph. Pages with no JPEG keep the
live iframe and are captured the next time Jenn opens the Pages tab.

**No password reset, and still no email sent.** Unchanged: the cure is Jenn
pressing Reset sign-in.

**No rename for a link row.** `/admin/pages/[slug]` 404s on a link and
`PageList` gives it a trash icon instead of a pencil. That is unchanged on both
screens, so the two agree; a link's title is derived from its URL and is not
editable anywhere today. Out of scope, deliberately, and revisitable.

---

## Student PDF upload

`addShelfPdf(groupId, formData)` joins `addShelfLink` and `addShelfPage` in
`app/page-actions.ts`, authorised by the same `requireShelfRole(groupId)` — so
the everyone group and an untokened visitor are refused by a rule that already
exists and is already tested, rather than by a second one written here. It sets
`addedByStudent: role === "student"`, as its two siblings do.

**`canStudentDelete` needs no change, and this is what makes the change safe.**
The refusal quoted above named a specific piece of work: that predicate keyed
off `kind`, so a student could only ever delete a row with a URL. It was since
rewritten to key off `addedByStudent`, with a comment recording why —
*"the kind used to stand in for it and stopped being able to"*. A student's own
PDF, assigned to their shelf alone, is therefore already deletable by them, and
the server already re-checks it in `deleteShelfLink` regardless of which
controls a tile rendered. The CLAUDE.md paragraph stating the opposite is now
wrong and is rewritten as part of this change.

The other half of the refusal — *"unvalidated binary in the database served
from our own origin"* — is answered the way it is for Jenn: `validatePagePdf`
checks the 3 MB cap and the `%PDF-` prefix, `/p/[slug]/pdf` serves it with
`nosniff` and a `Content-Disposition` built by `contentDispositionInline`, and
there is no PDF sanitiser for the reason there is no HTML one. What changes is
*who* can reach it, and the honest statement of that is: a student can now put
3 MB of bytes on a public slug. The mitigations are the ones the shelf already
has — the slug is derived from a title, `/p/[slug]` carries `noindex`, and Jenn
can delete anything on any shelf.

The bytes travel as a `File` in `FormData` for the reason
`2026-08-03-page-pdf-support-design.md` gives: base64 costs a third more, and
3 MB of PDF would arrive as 4 MB against nginx's `4m`.

`renderPdfThumbnail` moves from `components/admin/pdf-thumbnail.ts` to
`components/pdf-thumbnail.ts`. It stops being admin-only, and its own comment —
*"it runs once, in the admin, in Jenn's browser"* — stops being true. The
accepted cost is that a student staging a PDF fetches pdf.js once, at that
moment, on their phone. The module already resolves `null` on a dead worker or
a ten-second render, and **an upload must never fail because a preview did
not**, so the worst case on a slow connection is a glyph.

### Which menu each party gets

`ShelfFab` takes a `role: "student" | "teacher"` prop. The page already computes
`viewerIsTeacher`.

| | Student | Jenn, on `/g/marie` |
|---|---|---|
| Link | *Ajouter un lien* | *Add a link* |
| Document | — | *Add a page* |
| PDF | *Ajouter un PDF* | *Add a PDF* |

A student loses the HTML paste box. "They can only upload a PDF, not a
website" is the rule, and it is a narrowing of what shipped:
`addShelfPage` stays on the server, guarded as it is, and becomes reachable
only through Jenn's menu. Keeping the action rather than deleting it is
deliberate — the guard, its tests and its `addedByStudent` behaviour are all
correct, and the change here is about which control is drawn.

Jenn's menu is English and the student's is French, following the split this
codebase keeps everywhere else. *Add a student* is **not** on it: creating a
student is an admin-level act, and it has no meaning inside one student's page.
The audience is fixed to the group whose page she is on — the actions are
already curried on `group.id`, so this costs nothing and there is no audience
picker to render.

---

## The dia script

### Hiding *The X Brief*

A title matching `^The .+ Brief$`, case-insensitively, is dropped inside
`candidate_rows`. Every selection path — the picker, `--list`, `--latest` and
the title search — reads through that one function, which is what makes the
four agree by construction rather than by four filters staying in step. It is
the same reasoning `JXA_ASSETS` records for sharing one ref filter between the
picker and the upload: *"Two copies of these rules would let the picker call a
file present and the upload skip it."*

The deliberate consequence: `publish-dia-artifact.sh "The Morning Brief"` says
*No page whose title contains 'The Morning Brief'*. That is the correct
behaviour for a rule that says these are never published, and it is discoverable
— the message names the search that found nothing.

The filter is on the title, not the folder name, because the folder is usually
`template_output`. It is anchored at both ends so *The Brief History of Québec*
and *Brief Notes* survive.

### What the teacher sees

Every `echo` on the success path, and the `gui_alert` on the failure path,
become conditional on a TTY. The script already draws this distinction and
already justifies it: *"This is environment detection, which the spec rejects
for selection … It is fine for presentation, which changes only visibility."*
The wording of every message is unchanged; only whether it is emitted changes.

- **In a terminal** (`[ -t 1 ]`): exactly today's behaviour, including the
  alert-free `die`, the skipped-asset report and the clipboard confirmation.
- **Under Shortcuts**: nothing. No stdout, no alert, no banner. Success opens a
  browser; failure does not.

`pbcopy` still runs in both cases — the copy is a side effect worth having, and
only the sentence announcing it was noise.

This is a knowing trade. A silent failure is indistinguishable from a
mis-clicked Shortcut, and the reason is exactly what would make it fixable. It
is accepted because the failure is *visible by absence*: the flow ends with a
browser opening, so a publish that fails is a click that did nothing, and the
same command in a terminal reports fully. `--list` and `--local` are terminal
paths and are unaffected.

### What opens on success

`/admin?tab=pages&edit=<slug>` — the Pages tab with the new editing overlay
open on the page just published. The script publishes with no groups assigned,
so the next step is always to pick an audience, and this lands there with the
list visible behind it. It replaces `open "$SITE/admin/pages/$SLUG"`, which
still works and is still a valid URL; see *Editing in an overlay*.

---

## Stored previews for HTML pages

### What is captured, and from where

An offscreen iframe points at `/p/[slug]/raw?v=<version>&capture=1` with
`sandbox="allow-scripts"`. Three properties follow, and each is the reason for
a choice that has an easier-looking alternative:

**Scripts run, so fault 1 disappears.** This is the whole feature. The
thumbnail frame on a shelf can never have `allow-scripts` —
`2026-07-31-page-tiles-design.md` is right that a dozen documents mounting at
once with autoplaying audio has no control surface — but *one* frame, once, in
Jenn's own browser, at a moment she initiated, is the trade `renderPdfThumbnail`
already makes for pdf.js. The rule being kept is "not a dozen at a time on a
student's phone", not "never".

**The real route under the real CSP, so fault 2 is not hidden.** The obvious
shortcut is to frame the HTML from memory via `srcdoc`, before it is stored.
That would render assets the stored page cannot load, and produce a tile that
looks perfect above a page that is broken — a working feature showing the wrong
thing, which is the exact failure `savePage`'s thumbnail invariant exists to
prevent. Capturing after the save, through the same route a student hits, means
the picture can only ever be honest. Fault 2 keeps its existing report: the
`SkippedAssets` notice, in words, on both admin write paths.

**No `allow-same-origin`, so the frame stays opaque.** Which means the parent
cannot read into it, which decides the next section.

### Rasterising inside the frame

The parent has no access to an opaque origin's DOM, so the capture has to be
performed by the document itself and the result posted out. That is exactly the
shape of the print feature, and it reuses its three load-bearing decisions:

- **A `?capture=1` gate.** Only the capture harness asks for it. The admin's
  `<a download>`, every `HtmlPreview` thumbnail and a student's own visit hit
  the route without it and get Jenn's bytes as she uploaded them. Injecting
  unconditionally would put our script into the file she downloads to edit and
  the next upload would carry it back in.
- **`event.source !== window.parent`, not `event.origin`.** The frame has no
  origin string to compare against; which window is asking is the precise
  question, and the sandbox forbids popups.
- **Appended, not spliced.** A document that has been through a text editor may
  have no `</body>`, or several.

`withCaptureBootstrap` therefore sits beside `withPrintableBootstrap` in
`lib/printable-bootstrap.ts` — one module, two injections, one gate rule.

The bootstrap serialises `document.documentElement` into an SVG `foreignObject`,
draws it into a canvas through an `<img>` with a `data:` URL, and posts a JPEG
blob to `window.parent`. **This needs no CSP change**: `img-src data: blob:` and
`script-src 'unsafe-inline'` are already in the policy, for other reasons.

Three costs, all accepted and all stated:

- A `<canvas>` inside the page serialises blank. A page that draws its content
  into a canvas previews empty — strictly no worse than today, where a page
  that draws anything with JavaScript previews empty.
- Serialisation happens after scripts have run, so DOM built by JavaScript *is*
  captured. That is the fix.
- `foreignObject` rasterisation is browser-dependent and historically fragile.
  The contract that contains that risk is below.

**The contract, which is the important part.** `captureHtmlThumbnail(slug,
version)` returns `Promise<Blob | null>`, never throws and never rejects — a
frame that will not load, a serialisation that fails, a tainted canvas, a
render past its timeout and an oversized result all resolve `null`. `null`
means "leave the live iframe in place", which is a working preview. Because
that contract is total, the implementation strategy inside the module can be
replaced — with `html2canvas`, or with nothing — without any caller learning
about it. It is the same contract `renderPdfThumbnail` has and for the same
reason: **a save must never fail because a preview did not render.**

Like its neighbour, the module is impure and therefore **not** in `lib/`. It
needs a DOM, an iframe and a message channel, and has no rule to test.

### Storage

`Page.pdfThumb` and `Page.pdfThumbAt` are renamed to `Page.thumb` and
`Page.thumbAt`, and `/p/[slug]/thumb` drops its pdf-only check.

The columns already mean *the picture* and *the existence signal plus the cache
version*, and neither meaning is about PDFs. A second pair would duplicate both
comments, give `savePage`'s every-column invariant four columns to keep
straight instead of two, and force `readPageKind`-shaped branching into a route
whose whole design note is that three routes are better than one handler
switching on kind. The rename is mechanical and the compiler names every site.

`validatePageThumb` (`lib/page-thumb.ts`) is unchanged and is already written
in the general: 128 KB, JPEG magic bytes, silent rejection. Its comment about
being client-supplied data that ends up in an `<img src>` on a student's shelf
applies verbatim to the new source.

### Who writes it, and when

`savePage` keeps nulling both thumbnail columns on every write. That is not an
obstacle to work around — a replaced document's old picture is stale, and *"a
stale preview is a picture of the previous document under the new document's
title, which reads as a working feature showing the wrong thing."* The capture
runs afterwards, against the stored page, and writes the column back through a
separate action.

`setPageThumb(slug, jpeg)` is that writer: teacher-only, one column pair, no
content. Three callers:

1. **`NewPageForm`**, after a document publishes cleanly.
2. **`PageEditor`**, after a document is replaced.
3. **`ThumbBackfill`**, on the admin Pages tab.

The gap between the save and the capture is a tile with no JPEG, which renders
the live iframe. Nothing is broken during it.

`setPageThumb` is teacher-only rather than shelf-role-authorised because HTML
publishing is teacher-only again after the FAB change above, and a PDF's
thumbnail still arrives in its upload's own `FormData` under
`requireShelfRole`. One authority per path, neither widened.

### The backfill that is not a script

`ThumbBackfill` is a client component on the admin Pages tab. It takes the list
of slugs whose `thumbAt` is null and whose kind is `html`, captures them **one
at a time**, offscreen, with a cap per visit, and calls `setPageThumb` for each
result that is not null. Serial and capped for the reason the shelf frame has
no `allow-scripts`: the objection was ever only to a dozen documents running
scripts at once.

This is what covers the case a publish-time capture cannot. `POST /api/pages`
has no browser — the dia script is a shell script talking to a server — so a
page published that way can only be captured later, in the admin. It covers
every page that already exists at the same time, which is why there is no
migration script. `scripts/backfill-page-assets.mjs` exists as a precedent for
the other approach and is precisely what this avoids: it needs a renderer this
design refuses.

A failure is invisible and costs nothing: the row keeps a null `thumbAt` and is
retried on the next visit, behind the live iframe that was there all along.

### What the tile renders

`HtmlPreview` gains a `thumbVersion: number | null` prop with the same shape and
the same required-ness as `PdfPreview`'s: non-null draws
`<img src="/p/<slug>/thumb?v=<thumbVersion>">`, null keeps today's 500%/0.2
iframe. `PdfPreview` is otherwise untouched except for the column rename.

The `?v=` is not decoration. `/p/[slug]/thumb` answers `public, max-age=31536000,
immutable`, and on a stable URL that year would pin a replaced document's
picture into every browser that had ever seen it. That route and the two
previews are three parts of one decision and none can change alone.

---

## Editing in an overlay

### The pencil on a student's shelf

`FilesTab` gains the pencil for the teacher, under the same rule `PageList`
already applies: html and pdf rows get it, a link row keeps its ×. The two
screens then agree about which tiles are editable, which is worth more than
either rule on its own.

It is drawn only for the teacher. A student may add and delete their own rows;
retitling a page and reassigning its audience are Jenn's, and `updatePage`,
`updatePdfPage` and `deletePage` are all already `requireTeacher()`. **No new
authority is granted by this change** — only a control is drawn where the
authority already reached.

### `?edit=<slug>`, not local state

The overlay is opened by a search param and the pencil is a `<Link>`. Four
things follow, and the last is the one that would be hard to add later:

- **Back closes it.** A modal that swallows the back button on a phone is a
  trap, and this is the screen a student's parent might be looking over.
- **It has a URL.** Which is what lets the dia script open it directly, and
  what makes "keep `/admin/pages/[slug]`" a smaller decision than it looks.
- **The list is still there.** The current pencil replaces the page, so a
  rename costs the scroll position, the search text and the active chip. The
  chip especially — it drives which pin applies and a new page's audience.
- **On `/g/[slug]` the whiteboard's leave-guard protects it for free.** That
  guard is a capture-phase listener on `document` that inspects anchors,
  written that way precisely so *"a future link is protected without knowing
  the guard exists."* An anchor gets that; a button calling `router.push` would
  not, and opening this overlay mid-board would destroy the op log with no
  prompt. This is the reason the pencil must stay an anchor.

### What is inside it

`AddSheet` wrapping the existing `PageEditor`, unchanged. The editor needs
`groups` and an `initial` of title, html, groupIds, kind and pdfSize —
`getPageForAdmin` already returns exactly that shape. It is fetched on open
through a new teacher-only `loadPageForEdit(slug)` server action rather than
shipped with the list, following `loadConversation`: the payload includes a
whole document, and a shelf renders many tiles.

`/admin/pages/[slug]` is untouched. It keeps working for a bookmark, it is what
`PageEditor` was built for, and deleting a route to avoid having two ways in
would break the one URL a page's editor has ever had.

Two accepted awkwardnesses, both teacher-only: the overlay is styled in the
admin's `--color-*` palette and sits on a page drawn in `--card-*`, and the
audience checkboxes let Jenn un-assign the page from the very shelf she is
looking at. The second is real power exercised in the obvious place, and the
list refreshes underneath her.

---

## Signing in by email

### `Group.email` becomes unique

The schema comment argues the opposite — *"two siblings taught by Jenn share
one parent's inbox"* — and that argument is retired here. It was written when
sign-in was scoped to the slug in the URL, where uniqueness genuinely bought
nothing. A door that takes an email address and nothing else needs the address
to identify one student, and the alternatives are worse: silently choosing one
sibling, or a chooser that names other students to whoever typed the address.

**The migration can fail on real data.** A unique index over a column with two
equal non-null values is rejected, and this is the only change here that can
break on production and not in development. Checking for duplicates is a
blocking first step, not a footnote, and the fix if there are any is Jenn
deciding which student keeps the address.

`claimStudent` gains a case for it. A second student claiming with an address
already in use would otherwise hit a Prisma unique-constraint error and be
shown a generic failure; it becomes a specific, actionable sentence. This is
the one new specific message in an area whose whole design is uniform failures,
and the distinction holds: the uniform ones are about *sign-in*, where telling
someone which half was wrong is enumeration. A claim is already authorised by a
single-use invite for a named student, so there is nothing left to enumerate.

`normaliseEmail` already trims and lowercases, so uniqueness is over the
normalised value, which is the only form ever written.

### `/signin`

A new route, French, students. `/login` keeps the passkey ceremony and is not
advertised. Two doors rather than one, because one page would show every
student a *Sign in with passkey* button that is not for them, and would put a
student form on the teacher's page. Neither audience is served by the merge.

`signInByEmail(email, password)` joins `signInStudent` in
`app/student-auth-actions.ts`. It finds the group by normalised email, verifies
the password, sets that slug's cookie with the same attributes
`setStudentCookie` already uses, and redirects to `/g/<slug>`.

Every existing defence is carried across deliberately, because this endpoint is
reachable without knowing any slug at all and is therefore a *better* target
than the per-page form:

- **One message for every failure**, naming both fields. Wrong address, wrong
  password, unclaimed student and everyone group are indistinguishable.
- **A hash is always performed.** When no group matches, hash the submitted
  password and throw the result away — the same trick `signInStudent` uses for
  an unclaimed student, for the same reason: an instant answer would tell
  someone which addresses are real.
- **The throttle applies.** `isSlugLocked(slug)` becomes `isLockedFor(key)`,
  and callers pass `"slug:marie"` or `"email:x@y.ca"`. Prefixed so the two
  namespaces cannot collide, and renamed because a function called
  `isSlugLocked` handed an email is a comment that lies. The pure half of
  `lib/login-throttle.ts` — `recordFailure`, `isLocked` and their tests — is
  untouched.

The existing note stands and now covers a fourth thing: this throttle is
correct **only** because pm2 runs one process in fork mode.

`signInStudent` stays. `/g/marie` keeps its own form, the invite flow is
unchanged, and a student who has their link never sees `/signin`.

### The landing page

A `Login` link, top right, to `/signin`. The page is currently a single
centred column with no navigation at all; this is the first thing on it that is
not about Jenn, which is why it is a small link in the corner rather than a
call to action competing with *Word of the day*.

---

## Data model

```prisma
model Group {
  // Was: deliberately NOT @unique, because sign-in was scoped to the slug.
  // /signin takes an address and nothing else, so it has to name one student.
  email String? @unique
}

model Page {
  // Renamed from pdfThumb / pdfThumbAt. The picture, and the existence signal
  // plus the cache version — neither meaning was ever about PDFs.
  thumb   Bytes?
  thumbAt DateTime?
}
```

Two migrations, and they are different in kind. The `Page` rename is
mechanical and cannot fail. The `Group` index can fail on production data and
is the reason the two are not one migration.

## Testing

The rules that are pure functions get tests in `tests/lib/`, following the
convention that components and Prisma access do not:

- `lib/printable-bootstrap.ts` — `withCaptureBootstrap` appends, leaves the
  original as a prefix, and is distinct from the print bootstrap.
- `lib/login-throttle.ts` — the rename, and that a slug key and an email key
  with the same text do not share a counter.
- `lib/student-credentials.ts` / `lib/student-auth-labels.ts` — whatever the
  new claim message needs.

Everything else is a component, a route or an action.

**Three behaviours cannot be verified from a terminal**, and the plan must say
so rather than let a green build imply otherwise:

1. The `foreignObject` capture, in a real browser, against a real Dia artifact
   that uses a CDN. This is the spike the whole of change 3 rests on.
2. A student uploading a PDF from a phone, including the pdf.js fetch.
3. The dia script under Shortcuts — that nothing is drawn, and the browser
   opens.

## Risks

**The capture may not work.** `foreignObject` rasterisation is the one piece
here that cannot be reasoned to correctness. It is contained by the module's
total contract — `null` leaves a working preview in place — and by doing it
first, before anything depends on it. If it fails, `html2canvas` is the
fallback and costs a dependency and an injection of its source into the
bootstrap; if that also fails, the honest outcome is that change 3 becomes only
the `<canvas>`-free half of itself and the live iframe stays.

**The unique index may not apply.** Blocking check, first task.

**A student's phone now downloads pdf.js.** Once, on upload. Bounded by a
ten-second timeout that degrades to a glyph.

**Silent failure in the dia script is a deliberate regression** in
observability, accepted because the absence of a browser window is the signal
and a terminal run still reports in full.
