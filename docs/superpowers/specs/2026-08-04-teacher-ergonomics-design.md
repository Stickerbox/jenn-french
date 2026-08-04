# Teacher ergonomics: leaving a board, whose page it is, PDF previews, one-click invites — design

2026-08-04

## Baseline

This spec is written against a tree in which:

- **`2026-08-03-student-login-design.md` is built.** `Group` carries `email`,
  `passwordHash` and `claimedAt`; `lib/student-gate.ts` exists; the admin
  Students tab shows an invite link when unclaimed and
  `email · signed up <date>` when claimed, with one button that reads
  *New invite link* or *Reset sign-in*.
- **`2026-08-03-page-pdf-support-design.md` is built.** `Page` carries `pdf` and
  `pdfSize`, `/p/[slug]/pdf` serves the bytes, `components/ui/PdfPreview.tsx`
  draws a glyph and a file size, and a PDF is staged in the admin's page form
  and uploaded as `FormData`.
- **`2026-08-04-chat-inbox-design.md` is *not* built.** `GroupList` still reads
  `GroupSummary.unread` from `unreadCounts()`, and the chat FAB on `/g/[slug]`
  is still gated on `unlocked`.

Section 6 records where this change and the chat inbox touch the same files, so
whichever lands second has one place to look.

## Problem

Six complaints from the person who uses this every day, collected as five asks.
They are one spec because four of them land in the same two files —
`app/g/[slug]/page.tsx` and `components/whiteboard/BoardEditor.tsx` — and
because items 1 and 4 are the same bug from two ends: the button that gets her
back to the admin is one more way to destroy a board.

1. **A live whiteboard is destroyed by any click that leaves the page.** The tab
   strip is `next/link`, so *Les fichiers* is a soft navigation: the page
   re-renders with a new `tab`, `BoardTab` unmounts, `BoardEditor` goes with it,
   and the op log — which `/finish` treats as authoritative — dies in component
   state. Nothing warns her, nothing is saved, and `beforeunload` never fires
   because the document never unloaded.

   The server end is worse and is not obvious from the client. `liveBoards.open`
   returns `false` when a board is already open for that group, and
   `/api/whiteboard/[slug]/open` turns that into a 409. Nothing calls
   `liveBoards.discard` on unmount. So a board abandoned by navigation or by
   closing the tab **stays in the `globalThis` map indefinitely**, and her next
   *Nouveau tableau* for that student opens with `liveError` set — *"Diffusion en
   direct indisponible"* — for the rest of the process's life. The student's live
   view is silently dead and nothing in the UI explains why.

2. **Her own page greets her as her student.** `/g/marie` renders *Bonjour
   Marie* at Jenn, in French, from `lib/student-greeting.ts`. It is the student's
   page, not hers, and the header says the opposite.

3. **She is told she is drawing.** `LiveBanner` renders *Jenn dessine en ce
   moment* on the card and files tabs for anyone `unlocked`, and Jenn is
   `unlocked` when she opens a student from the admin. So while she draws, a
   banner on her own other tab announces her to herself, with a button offering
   to take her to the board she is already on. `BoardTab` already gates its live
   view on `!isTeacher`; the banner was missed.

4. **There is no way back to the admin.** Opening a student from the Students tab
   is a one-way trip. The only route back is the browser's Back button or typing
   the URL, and Back is exactly the gesture item 1 makes expensive.

5. **A PDF tile is a red glyph and a file size.** Every PDF on a shelf looks like
   every other PDF, so a student with four worksheets has to open them to find
   the one they want. HTML pages have had a live thumbnail since they shipped;
   PDFs were left out with the reason recorded and revisitable.

6. **The invite link has to be copied by hand.** The Students tab prints
   `/g/marie?k=<token>` inside a `<code>`, and Jenn selects it with the mouse,
   copies it, and pastes it. It is not even a working URL — it has no origin, so
   the paste needs editing before it can be sent. *Reset sign-in* sits below it
   as a text button, in a list where it is the rarest thing she will ever press
   and the most prominent control on the row.

## Goal

Jenn cannot lose a board by accident. Her own page says whose page it is and
gets her back to the admin in one click. A PDF on a shelf looks like the
document it is. Sending a student their invite is one click and produces a link
that works when pasted.

Nothing changes for a student, anywhere in this build, except that a PDF tile
now shows a picture.

## Non-goals

**No new access rule, and no change to an existing one.** `chatRole`,
`shelfRole`, `studentGate`, `readToken`, `middleware.ts` and every route handler
are untouched. Item 2's header and item 4's link are gated on
`getCurrentTeacher()`, which `app/g/[slug]/page.tsx` already reads and already
uses to decide the delete and read-marker controls. Item 3 removes a UI element
from one audience. Nothing in this spec makes anything reachable that was not
reachable before.

**No server-side PDF rendering.** The 2026-08-03 spec's reasoning holds
unchanged: Chromium, poppler or a native binding on a 2 GB `t3.small` where
`npm run build` already needs swap to survive. The thumbnail is rendered in
Jenn's browser, exactly as a whiteboard thumbnail is, for exactly the same
stated reason.

**No pdf.js on a student's shelf.** See section 5; this is the boundary that
makes the retirement below a bounded one rather than a reversal.

**No backfill of PDFs uploaded before this change.** They keep the glyph. The
feature is a day old, so the population is small, and re-uploading a file is a
control that already exists. A backfill would need either a headless renderer on
the server — the dependency this refuses — or a write path from a page render,
which is worse.

**No resume of an abandoned board.** *Fermer sans enregistrer* discards, and so
does closing the tab. Storing a partial board so it could be picked up later
would mean a mutable board row, and immutability-once-saved is the property that
makes `Whiteboard.thumbnail` safe.

**No trapping of the browser Back button.** See *Rejected*.

**No student-visible change to items 1–4.** A student has no board editor, no
teacher header, and no admin to go back to.

## What this retires

One sentence, from `2026-08-03-page-pdf-support-design.md` § *`PdfPreview`*:

> A rendered first page would be a better thumbnail. It would also need pdf.js,
> on a shelf that mounts a dozen tiles at once, which is the same trade the
> preview frames already refuse.

Retired, and **the boundary is the point**: pdf.js is never loaded on a shelf.
It is loaded in the admin, behind a dynamic `import()`, by the person who chose
to upload a PDF, at the moment she uploads it. The shelf receives a JPEG through
an `<img>` tag. The trade that sentence refused — a dozen renderers mounting at
once on a student's phone — is not the trade being made.

What survives from that spec, and must keep surviving:

- **`/p/[slug]/raw` refuses everything that is not an html row**, and
  `/p/[slug]/pdf` refuses everything that is not a pdf row. The new thumbnail
  route is a third mirror of the same contract.
- **A PDF is not framed.** `/p/[slug]` still redirects a pdf row to a top-level
  navigation, for the iOS Safari truncation reason.
- **`allow-same-origin` is still forbidden** on `/p/[slug]`, and nothing here
  touches that sandbox or the raw route's CSP.
- **Upload is teacher-only.** Students still get `addShelfLink` and
  `addShelfPage`; nothing in this change hands them a blob.

## Scope

New:

- `lib/leave-guard.ts` — `shouldGuardNavigation`, `navigationTarget`
- `lib/page-thumb.ts` — `MAX_THUMB_BYTES`, `validatePageThumb`
- `components/whiteboard/LeaveBoardDialog.tsx`
- `components/admin/pdf-thumbnail.ts` — `renderPdfThumbnail`, impure by design
- `app/p/[slug]/thumb/route.ts`
- `tests/lib/leave-guard.test.ts`, `tests/lib/page-thumb.test.ts`

Changed:

- `prisma/schema.prisma` — `Page.pdfThumb`, `Page.pdfThumbAt`, plus a migration
- `lib/whiteboard-ops.ts` — `boardHasContent`
- `lib/student-greeting.ts` — `teacherPageLabel`
- `lib/pages.ts` — `savePage`'s pdf member takes a thumbnail; `pdfThumbAt` in
  both list selects; `updatePageMeta` untouched, deliberately
- `app/page-actions.ts` — `createPdfPage` and `updatePdfPage` read the thumbnail
- `app/g/[slug]/page.tsx` — the teacher's header line, the back link, the
  `LiveBanner` gate
- `components/whiteboard/BoardEditor.tsx` — the guard, the dialog, `persist()`
- `components/ui/PdfPreview.tsx` — a thumbnail when there is one
- `components/student/FilesTab.tsx`, `components/admin/PageList.tsx` — pass the
  version through
- The admin's page-creating form — staging only, never submitting on select
- `components/admin/GroupList.tsx` — three icons, no printed link
- `components/card-styles.ts` — `tileActionClass`, hoisted out of `PageList`
- `package.json` / `package-lock.json` — `pdfjs-dist`
- `tests/lib/whiteboard-ops.test.ts`, `tests/lib/student-greeting.test.ts`
- `CLAUDE.md`, `docs/DEPLOYMENT.md`

Unchanged, and worth saying so:

- `lib/chat-access.ts`, `lib/shelf-access.ts`, `lib/student-gate.ts`,
  `lib/student-tokens.ts`, `middleware.ts`. No authorisation rule moves.
- `lib/page-kind.ts`. `pdfThumbAt` is **not** a discriminator: a row with a
  thumbnail and no `pdfSize` is a broken row and must keep resolving exactly as
  it does today. Adding a fourth fallback clause would make a corrupt row
  render an `<img>` with no document behind it.
- `lib/effective-pages.ts`, `lib/page-pins.ts`, `lib/page-sections.ts`,
  `lib/page-filters.ts`. A thumbnail is not a kind, an audience, a date or a
  pin.
- `components/ui/Tile.tsx` and `components/ui/PageTile.tsx`. Both already take
  their actions as a `ReactNode`; three icons is what that slot is for.
- `components/whiteboard/BoardTab.tsx`. Its live view is already `!isTeacher`.
- `app/p/[slug]/page.tsx`, `app/p/[slug]/raw/route.ts`, `app/p/[slug]/pdf/route.ts`.
- `app/f/[token]/page.tsx`. It has its own header, already names the student,
  and is read-only; a PDF tile there picks up the thumbnail for free because it
  renders the same component.
- Cards, dates, the week, the chat, `Whiteboard` and `WhiteboardPage`.

---

## 1 · Leaving a live board

### Three exits, two mechanisms

| Exit | Fires | Gets |
|---|---|---|
| A link on the page — tab strip, back-to-admin, anything added later | a `click` | the dialog, with our two buttons |
| Closing or reloading the tab | `beforeunload`, then `pagehide` | the browser's own prompt, then a beacon that frees the server slot |
| Browser Back | neither, reliably | nothing. Documented gap, below |

### `shouldGuardNavigation`

`lib/leave-guard.ts` holds the rule as a pure function over plain facts, so the
listener in the component is four lines and the interesting part has a test:

```ts
export function shouldGuardNavigation(click: {
  // The resolved absolute href of the nearest ancestor <a>, or null.
  href: string | null;
  target: string | null;
  download: boolean;
  // A modifier or a non-primary button — the browser opens this elsewhere.
  modified: boolean;
  currentUrl: string;
}): boolean;
```

False when there is no href, when `target` names anything but this frame, when
the anchor carries `download`, when the click is modified, or when the href
differs from `currentUrl` **only** by a fragment. True otherwise — **including
an off-site href**, because leaving the site loses the board just as thoroughly
as switching tabs does.

The four false cases are all the same fact: the current document is not going
anywhere, so there is nothing to lose and a dialog would be a lie.

`navigationTarget(href, origin)` is the sibling rule: same-origin hrefs come
back as `{ kind: "internal", path }` for `router.push`, everything else as
`{ kind: "external", href }` for `location.assign`. A full page load for a tab
switch would work and would feel wrong.

### Why a capture-phase listener on `document`

`BoardEditor` installs `document.addEventListener("click", handler, true)` while
the board has content. Capture phase, so it runs before `next/link`'s own
handler and can `preventDefault` the navigation it is about to perform.

The alternative is a guard context that `StudentTabs`, the new back link, and
every future link consult — `next/link` in Next 16 has `onNavigate` with a
`preventDefault`, so this is available and typed. It is rejected on one property:
**it is a rule every future link author has to remember.** The back-to-admin
button in section 4 is precisely such a link, added in this same change, and the
next one will be added by someone who has not read this file.

`chatRole`'s comment makes the same argument about the same shape of risk — *"a
rule duplicated across two files is a rule that will eventually differ in one of
them, and the difference would be a hole rather than a bug report"*. Here the
difference would be a lost lesson.

The cost is that the listener can catch an anchor that did not need guarding.
That is the right direction to fail in, and it is the direction `readSections`,
`readOps` and `readPageKind` all already fail in: resolve toward the outcome
that is most likely to be what someone wanted.

### `boardHasContent`

The guard is armed on the same test `save()` already runs before refusing an
empty board, extracted so the two cannot disagree:

```ts
export function boardHasContent(ops: Op[]): boolean {
  return !dropTrailingEmptyPages(foldOps(ops)).every((p) => p.length === 0);
}
```

This matters more than de-duplication. If the guard used `ops.length > 0`, a
board holding one stroke and one `remove` of it would prompt, she would press
*Terminer et enregistrer*, and `save()` would refuse it as empty — a dialog whose
primary button cannot succeed. Sharing the predicate makes that unreachable.

### The dialog

`components/whiteboard/LeaveBoardDialog.tsx`, with three exits:

| Control | Does |
|---|---|
| *Terminer et enregistrer* | the existing save, then navigates |
| *Fermer sans enregistrer* | POSTs `/discard`, then navigates |
| X, Escape, the backdrop | closes and stays; the board is untouched |

Copy is **French**, matching every other string in `BoardEditor` — *Annuler*,
*Terminé*, *Le tableau est vide.* This is a deliberate exception to the
teacher-copy-is-English convention, and it is the surrounding file that decides:
a dialog in English inside a French toolbar would read as a different product.

It **is** `role="dialog" aria-modal="true"`, unlike `ChatWindow`, which
documents its own choice not to be. The contrast is the reason: the point of the
chat panel is that the page stays usable behind it, and the point of this one is
that the page must not be used until she answers.

`save()` splits into `persist(): Promise<boolean>` — the fetch and the empty
check, returning whether it stored — and the existing button's handler, which
calls `persist()` and then `onSaved()`. The dialog calls `persist()` and then
navigates. A failed save leaves the error rendered **inside the dialog** and the
dialog open, so she can retry or discard; closing it and dropping her on a page
with an error she cannot act on would be worse.

Once she has chosen, a `leaving` ref disarms both listeners. Without it an
external `location.assign` would immediately hit the `beforeunload` handler and
prompt her a second time for a decision she has already made.

### The two window listeners

**`beforeunload`, while dirty.** `event.preventDefault()`, and set the
deprecated `returnValue` too because some browsers still require it. The wording
is the browser's — *"Leave site? Changes you made may not be saved."* — and
cannot be replaced; that is the whole reason the in-app dialog exists rather
than relying on this alone. Installed only while dirty, because a prompt on a
board with nothing in it is noise that teaches her to ignore the prompt.

**`pagehide`, whenever the editor is mounted.** Not gated on dirty, and gated on
`!event.persisted`:

```ts
if (event.persisted) return;   // going into the back/forward cache, not away
navigator.sendBeacon(`/api/whiteboard/${slug}/discard`);
```

This is the fix for the 409 described in the problem statement, and its gating is
deliberately different from the prompt's. The prompt asks about *content*, which
an empty board does not have. The beacon frees a *server slot*, which an empty
board occupies just as fully. `pagehide` rather than `beforeunload` because
`beforeunload` fires before she has answered, and discarding a board she then
chose to keep would be the exact failure this section exists to prevent.

`sendBeacon` is the right tool and not a trick: it is specified to survive the
document's destruction, which `fetch` is not. The route reads nothing from the
request body, so a bodyless POST is a valid call to it — confirm that before
relying on it. Where `sendBeacon` is unavailable, `fetch(url, { method: "POST",
keepalive: true })` is the fallback.

### The residual: browser Back

`beforeunload` does not fire for an App Router `popstate`, and there is no
supported way to cancel one. Closing this would mean pushing a sentinel history
entry on mount and re-pushing it on every `popstate`, which breaks the back
button for the whole page and fails in ways no test here could catch.

It is therefore an **accepted, documented gap**, in the same register as the
sandbox residual `CLAUDE.md` already records: *"a sandboxed frame may navigate
itself, and no CSP directive prevents that."* It is narrowed by the rest of this
change — the in-app dialog covers the tab strip and the new back link, which are
the two reasons she currently reaches for Back at all — and the `pagehide`
beacon still frees the server slot, because a `popstate` that unmounts the page
does fire it.

---

## 2 · Whose page this is

`lib/student-greeting.ts` gains a second export beside `greeting`:

```ts
export function teacherPageLabel(name: string): string | null;
// "Marie Dupont" -> "Marie Dupont's page"
```

Same `null`-on-empty contract as `greeting`, and the caller still suppresses it
on `group.isEveryone` — the rule stays where it is, because this module has no
business knowing about the flag.

**The full name, not the first name.** `greeting` takes the first word because
*Bonjour Marie Dupont* is a summons rather than a hello. The teacher's line has
the opposite requirement: her problem is telling two students apart, and two
students can share a first name.

**The possessive is always `'s`**, including names that end in s — *Jonas's
page*. One rule with no special case, which is Chicago's position and is written
down here so nobody adds the special case later and breaks a test.

`app/g/[slug]/page.tsx` picks by audience:

```ts
const headerLine = group.isEveryone
  ? null
  : viewerIsTeacher
    ? teacherPageLabel(group.name)   // English, for Jenn
    : greeting(group.name);          // French, for the student
```

English for her line and French for theirs, following the split the codebase
already keeps.

---

## 3 · She is not told she is drawing

One clause, in `app/g/[slug]/page.tsx`:

```tsx
{unlocked && !viewerIsTeacher && tab !== "board" && <LiveBanner slug={slug} />}
```

In the page rather than inside `LiveBanner`, for the reason `greeting`'s comment
gives about `isEveryone`: the page already owns this composition — it decides
`unlocked`, it decides the tab — and the banner has no business learning who the
teacher is.

Unconditional for the teacher, with no "unless another teacher is drawing"
subtlety, because there is exactly one teacher and exactly one passkey. A live
board on a group is always hers.

`BoardTab`'s live view needs no change; it is already `!isTeacher`. Stated here
because the two look like the same fix and only one of them is missing.

---

## 4 · Back to admin

A `<Link href="/admin?tab=groups">` at the top left of `/g/[slug]`, rendered only
when `viewerIsTeacher`.

`?tab=groups` and not `?tab=daily`, because the Students tab is where she came
from and returning her somewhere else is a small lie the button would tell every
time. (`ADMIN_TABS` is `["daily", "groups", "pages"]`; `groups` is the value,
plural, per the model-word convention.)

Positioned `absolute left-4 top-4` inside the `<main>`, which gains `relative`.
`main` already has `py-12`, so the link sits inside 48px of existing top padding
and the centred header does not move by a pixel on any width. English copy —
*← Back to admin* — and the flashcard palette, because this page is
card-palette throughout.

**It is guarded by section 1 the moment it exists**, with no wiring of its own.
That is the capture-phase listener paying for itself on the first new link after
it was written.

---

## 5 · A PDF looks like the document it is

### Two columns

```prisma
// A JPEG of page 1, rendered by Jenn's browser at upload time. Bytes rather
// than a base64 data URL in a String — unlike Whiteboard.thumbnail, which is
// inlined into an <img src> and has no choice. This one is served from a route,
// so base64 would cost a third more room in a database the nightly
// VACUUM INTO copies whole, for nothing.
pdfThumb   Bytes?
// Existence signal and cache version in one column.
//
// Existence, because no shelf query may select `pdfThumb` — the same lesson
// `pdfSize` records: a tile grid that selects a blob to decide whether to draw
// a picture has already paid for the picture it might not draw.
//
// Version, because /p/[slug]/thumb answers `immutable` and the tile appends
// ?v= this. A replacement moves it, which is what makes a year-long cache
// safe on a mutable row.
pdfThumbAt DateTime?
```

Migration `add_pdf_thumbnails`. No backfill, and existing pdf rows come out
`null` on both, which reads as *no preview yet* — the state the fallback already
renders.

A timestamp rather than a `Boolean hasThumb` for the reason `PagePin.pinnedAt`
already gives: this project prefers a timestamp wherever one is meaningful, and
this one is doing a second job that a boolean cannot do.

### Rendering, in the admin, at upload time

`components/admin/pdf-thumbnail.ts`:

```ts
export const THUMB_WIDTH = 320;
export async function renderPdfThumbnail(file: File): Promise<Blob | null>;
```

Impure, and therefore **not** in `lib/`. This project's `lib/` means "a rule with
a test"; a function that needs a DOM canvas and a web worker has neither. The
whiteboard already made this exact split — `lib/whiteboard-thumbnail.ts` is the
*validator* and `renderThumbnail` lives at the bottom of `BoardEditor.tsx` — and
this follows it, sitting in its own module only because two forms need it.

- **`await import("pdfjs-dist")`, dynamic.** This is the load-bearing detail of
  the whole feature. A static import would put a PDF renderer in a chunk the
  router might ship anywhere; a dynamic one inside a `"use client"` admin
  component is fetched by Jenn, on the admin screen, the first time she stages a
  PDF. No student request ever touches it.
- **320px wide**, the same width `BoardEditor` renders a board thumbnail at, and
  about the rendered width of a tile in the 1152px four-column grid — so nothing
  upscales. Natural aspect ratio, not cropped at render time; the crop is CSS,
  so a later change can show the whole page without re-rendering every stored
  thumbnail.
- **JPEG at 0.6** via `canvas.toBlob`. A page of text lands at 15–40 KB.
- **It never throws and never rejects.** An encrypted PDF, a corrupt PDF, a
  zero-page PDF, a worker that failed to load, and a render that takes longer
  than a 10-second timeout all return `null`. **An upload must never fail
  because a preview did not render** — the glyph is a working fallback and this
  feature is a nicety on top of a document that has to store either way.

The worker needs `GlobalWorkerOptions.workerSrc` set to an asset URL the bundler
emits. `new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url)` is the
first thing to try; the legacy build and copying the worker into `public/` are
the fallbacks. This is the one part of this spec that cannot be settled without
running it — see *What cannot be verified without a browser*.

### Validation is a magic-byte check

`lib/page-thumb.ts`, a mirror of `lib/page-pdf.ts`:

```ts
export const MAX_THUMB_BYTES = 128 * 1024;
export function validatePageThumb(bytes: Uint8Array):
  | { ok: true }
  | { ok: false; reason: "empty" | "too-large" | "not-jpeg" };
```

JPEG is `FF D8 FF`, the same limited ambition as `validatePagePdf`'s `%PDF-` and
`validatePageHtml`'s `includes("<")`: it catches the obvious slip, and it is not
an attempt to parse an image.

The client renders this file, so in the normal case it is ours — but it arrives
over the network in a `FormData` field, which makes it client-supplied data that
ends up in an `<img src>` on a student's shelf. `lib/whiteboard-thumbnail.ts`'s
comment already states this reasoning for the case where only the teacher can
send it, and it applies here for the same reason.

**128 KB is a bound, not a target.** A 320px JPEG is well under it. The number
is chosen against the ceiling: `MAX_PDF_BYTES` is 3 MB and was picked as the
largest round number fitting inside the 4 MB `client_max_body_size` nginx was
raised to by hand, with room for the title and the group ids. 3 MB + 128 KB +
multipart overhead still clears it, so **this feature needs no server change** —
which is the property that keeps `docs/DEPLOYMENT.md` item 11 true.

### Transport and the write

The blob rides in the `FormData` that already carries the PDF —
`formData.set("thumb", blob, "thumb.jpg")` — so there is no second request and
no second authorisation. `createPdfPage` and `updatePdfPage` are already
`requireTeacher()`.

`savePage`'s pdf union member gains `thumb: Uint8Array | null`, and
**`pdfThumb`/`pdfThumbAt` join its flat invariant**: every content column
written on every call, one of them to `null`. That comment's stated reason is
that a stale column gives `readPageKind` two answers; the thumbnail's reason is
different and stronger. A *missing* preview is a glyph. A *stale* preview is a
picture of a document that is no longer there — the previous file's first page
under the new file's title. Replacing a PDF without a renderable preview must
null both columns, not keep the old ones.

`updatePageMeta` — the title-and-audience path that exists so editing a PDF
page's audience does not lose its bytes — touches neither column, because it
touches no content column. That is not a change; it is the reason that function
exists, and it now protects one more thing.

### `/p/[slug]/thumb`

A third mirror of the contract `raw` and `pdf` already hold: 404 unless the row
resolves to `"pdf"` **and** `pdfThumbAt` is non-null.

| Header | Value | Why |
|---|---|---|
| `Content-Type` | `image/jpeg` | |
| `X-Content-Type-Options` | `nosniff` | Never let a mislabelled blob be re-interpreted as something executable. |
| `X-Robots-Tag` | `noindex` | Matches what the raw route grew on 2026-08-02. |
| `Cache-Control` | `public, max-age=31536000, immutable` | |

**The `immutable` year is safe only because the URL carries `?v=<pdfThumbAt>`.**
On a stable URL it would pin a replaced document's picture for a year in every
browser that had ever seen it. The route and the tile are two halves of one
decision, and neither can be changed alone.

No `Content-Disposition` — it is never downloaded — and no CSP, matching
`/p/[slug]/pdf`'s choice. There is nothing in an image response for a CSP to
constrain, and the argument against adding a directive whose effect on a
browser's own decoder cannot be verified from here applies unchanged.

Public, like `/p/[slug]` and `/p/[slug]/pdf`. It leaks strictly less than the
PDF it summarises, and the note in the PDF spec — a PDF put here is a PDF on the
public web, so student names and marks belong in the tokened chat — is unchanged
and still the thing to read before uploading.

### `PdfPreview`

Gains `thumbVersion: number | null`. Null renders today's `BrandGlyph
brand="pdf"` over `formatFileSize(pdfSize)`, byte for byte. Non-null renders:

```tsx
<img src={`/p/${slug}/thumb?v=${thumbVersion}`} loading="lazy" alt="" aria-hidden
     className="h-full w-full object-cover object-top" />
```

- **`object-cover object-top`.** A Letter page is portrait and the slot is
  `aspect-[4/3]`; `contain` would letterbox a page into a stripe with two grey
  bars. Cropping to the top shows the title and the first lines — the part that
  identifies the document, which is the only thing a preview is for — and it
  matches `HtmlPreview`, which also fills and clips.
- **`alt=""` and `aria-hidden`**, for the reason `HtmlPreview`'s comment gives:
  the tile's title link is its accessible name, so a screen reader walking a
  shelf hears eight titles rather than eight documents.
- **`loading="lazy"`**, which is what makes a dozen tiles cost only the visible
  ones.
- The file-size caption drops when there is a picture. There is no room for
  both, the picture is the better cue, and the size is still shown in the admin
  editor's drop zone where it is a fact about an upload rather than decoration.

`SHELF_SELECT` gains `pdfThumbAt` and does **not** gain `pdfThumb`; mirror the
existing comment about `html`, because this is the same mistake one column
further on.

### One control, and it does not submit

The second half of the complaint: staging a PDF must not upload it. She picks the
file, then the student, then presses Save.

Stated as behaviour rather than a diff, because the create form has moved twice
in three days:

1. Choosing or dropping a file **never** submits and never closes the sheet.
2. After choosing, the form shows the filename and size, the title prefilled from
   the filename with the existing don't-clobber rule intact, the audience
   checkboxes still editable, and a way to replace or clear the file.
3. **The thumbnail renders while she picks the audience.** The render is kicked
   off on stage, a *Préparation de l'aperçu…* note shows while it is in flight,
   and Save awaits the in-flight promise if it has not settled. The work is free
   because it happens during a decision she was making anyway.
4. Exactly one submit path: the Save button. No `onChange` on the file input
   calls a server action, and nothing calls `requestSubmit()`.
5. Save stays disabled until there is something to save — the existing
   `hasContent` rule — and while a submit is in flight.

If a thumbnail fails, Save proceeds without one. Point 3's note must not become a
gate.

---

## 6 · Three icons on a student

`components/admin/GroupList.tsx`. The `action` slot of `Tile` takes a
`flex items-center gap-1` row of icon buttons, mirroring `PageList`'s block —
inline SVG with a comment describing its strokes, `aria-label` carrying the
student's name, `title` short.

| Icon | Shown when | Does |
|---|---|---|
| Link | unclaimed and `chatToken !== null` | copies the absolute invite URL |
| Key | claimed | the existing reset, confirm and all |
| Trash | `canDeleteGroup(group)` | the existing delete, confirm and all |

The printed `<code>/g/marie?k=…</code>` goes away. It existed only to be
selected by hand, and it was never a paste-able link: it has no origin.

**The copied string is absolute** — `${window.location.origin}/g/${slug}?k=${token}`
— built in the click handler rather than during render, so there is no value that
differs between the server and the browser. `window.location.origin` rather than
the `ORIGIN` env var: what she wants to send is a link to the site she is looking
at, and on a box where those two ever disagree the browser is right.

On success the icon becomes a check and the tooltip reads *Copied* for about two
seconds. On failure — `navigator.clipboard` needs a secure context, which https
and localhost both are, so this should not happen — the row reveals a read-only
input holding the URL with its text selected, because the manual path must still
exist rather than the button silently doing nothing.

**The reset button stays present when unclaimed**, reading *New invite link*
there and *Reset sign-in* when claimed. This is one control more than the literal
request, and the reason is in the student-login spec: an unclaimed student's
invite may have leaked before it was used, and that button is the only way to
revoke it. Delete-and-recreate is not a substitute — it takes their pages, pins,
chat and boards with it. So an unclaimed row shows three icons and a claimed row
shows two.

The label is **Reset sign-in**, not *Reset password*. The action clears the email
as well as the hash, and Jenn never sees, sets or transmits a password — the
spec that built it is explicit about that, and a label promising otherwise
invites the question.

Both confirms keep their existing inline rows and their existing copy. After a
reset, `router.refresh()` flips the tile to unclaimed and the copy icon appears
in place — which is how the student-login spec's requirement that the confirm
*"hands her the new link immediately afterwards"* is satisfied, without building
a second surface to hold it.

`pageActionClass` is hoisted from `PageList.tsx` into
`components/card-styles.ts` as `tileActionClass` and imported by both, per
`CLAUDE.md`: *"Repeated flashcard class strings live in
`components/card-styles.ts` — extend that rather than duplicating the strings."*

### Where this meets the chat inbox

`2026-08-04-chat-inbox-design.md` replaces `unreadCounts()` with
`listConversations()` and changes this tile's **eyebrow**. This change touches
its **action slot**. They should merge cleanly; whichever lands second should
re-read the other's treatment of `GroupSummary`.

---

## Testing

Pure modules in `lib/` get tests; components, routes and Prisma access do not,
per the project convention.

| File | Cases that matter |
|---|---|
| `tests/lib/leave-guard.test.ts` | a modified click is ignored; `target="_blank"` is ignored; a named-frame target is ignored; `download` is ignored; a hash-only change is ignored; **same path, different query is guarded** — the tab strip's exact case; an off-site href is guarded; a null href is ignored; `navigationTarget` splits same-origin from cross-origin and keeps the query and hash on the internal path |
| `tests/lib/whiteboard-ops.test.ts` | extended: `boardHasContent` is false for `[]`, false for a page holding a stroke and a `remove` of it, true for one stroke, true for a stroke on page 3 with pages 1–2 empty |
| `tests/lib/student-greeting.test.ts` | extended: `teacherPageLabel("Marie Dupont")` is `"Marie Dupont's page"`; a name ending in s takes `'s`; a one-word name works; empty and whitespace return null; `greeting` is unchanged |
| `tests/lib/page-thumb.test.ts` | `FF D8 FF` accepted; PNG rejected; `%PDF-` rejected; two bytes rejected; empty rejected; one byte over the cap rejected; the cap is exactly 128 KB |
| `tests/lib/page-kind.test.ts` | unchanged, deliberately. A pdf row with a thumbnail resolves the same as one without |

CI order is unchanged: `prisma generate` → lint → `tsc --noEmit` → test → build.

## What cannot be verified without a browser

Listed so they are checked deliberately rather than assumed.

1. **The pdf.js worker resolves under Next 16.** That
   `GlobalWorkerOptions.workerSrc` points at an asset the bundler actually
   emitted, that no `canvas` polyfill is dragged into the server build, and that
   a real PDF renders. If the build complains about `canvas`, the known
   workarounds are the legacy build and a webpack/Turbopack alias.
2. **The capture-phase listener beats `next/link`.** One click on *Les fichiers*
   mid-board, in Chrome and in Safari, confirming the dialog appears and the
   navigation does not.
3. **`beforeunload` fires.** Chrome requires prior interaction with the page
   before it will prompt; drawing counts, but confirm it.
4. **The `pagehide` beacon frees the slot.** Draw, close the tab, reopen the
   student, press *Nouveau tableau*, and confirm no *Diffusion en direct
   indisponible*. This is the regression that motivated the listener.
5. **Clipboard write on Safari**, which is strict about the write happening
   inside the user gesture. Ours is, but it is worth one real click.
6. **The thumbnail cache invalidates.** Replace a PDF and confirm the tile's
   `?v=` moves and the new picture appears — an `immutable` year is unforgiving
   of a mistake here.
7. **A real worksheet's thumbnail is recognisable** at tile size, cropped to
   4:3 from the top. If it is not, the lever is the crop, not the render.

## Documentation

`CLAUDE.md`:

- Routes table: `/p/[slug]/thumb`.
- *Files: pages and links*: the two thumbnail columns, why the bytes are not
  base64 here when `Whiteboard.thumbnail` is, why `pdfThumbAt` carries two jobs,
  that pdf.js is admin-only behind a dynamic import, and that
  `immutable` depends on the `?v=`.
- *Whiteboards*: the leave guard — that the log lives in component state and any
  navigation destroys it, that the guard is a capture-phase listener precisely so
  a new link is protected without being told to be, that `pagehide` discards to
  free `liveBoards`, and that browser Back is an accepted gap.
- The `/g/[slug]` row and the *Lesson chat* paragraph: the teacher's header line,
  the back link, and that `LiveBanner` is suppressed for her.
- *Conventions*: `tileActionClass` alongside the existing note about
  `card-styles.ts`.
- The Students-tab description: three icons, and that the invite link is copied
  rather than printed.

`docs/DEPLOYMENT.md`: item 11 gains `MAX_THUMB_BYTES` beside `MAX_PDF_BYTES` in
the sentence tying both to `client_max_body_size 4m`, so the next person to raise
either finds the server-side step from the constant rather than after a 413.

## Build order

Each step leaves the tree green.

1. `lib/leave-guard.ts`, `boardHasContent`, and their tests. No UI; the whole
   rule set is verifiable before anything renders.
2. `LeaveBoardDialog` and the `BoardEditor` wiring — the dialog, `persist()`, and
   both window listeners.
3. `teacherPageLabel` and its test; the header line and the `LiveBanner` gate in
   `app/g/[slug]/page.tsx`.
4. The back-to-admin link. After 1–2 deliberately, so it is born guarded.
5. `lib/page-thumb.ts` and its test; the migration; `savePage`, the selects, the
   two actions, and `/p/[slug]/thumb`.
6. `renderPdfThumbnail`, the staging fix, and `PdfPreview`.
7. `tileActionClass`; the `GroupList` icons.
8. Docs.

## Rejected

**A navigation-guard context with `next/link`'s `onNavigate`.** The conventional
shape, typed, and available in Next 16. Rejected because it is a rule every
future link author must remember, and the first new link — section 4's — was
written in the same change as the guard. The failure mode is a lost lesson with
no error.

**Auto-saving the board on navigation instead of asking.** Removes a click and
removes her ability to throw away a board she does not want, which is what
*Annuler* exists for. It would also save boards she abandoned by mistake, and a
saved board is immutable.

**Hiding the tab strip while a board is live.** Removes the exit rather than
guarding it, and traps her on the board tab with no way to check a worksheet
mid-lesson.

**Trapping the browser Back button.** Needs a sentinel history entry re-pushed
on every `popstate`, which breaks Back for the whole page and cannot be tested
in this project's harness. Documented as a gap instead.

**`beforeunload` alone, with no in-app dialog.** It does not fire for a soft
navigation, which is the case that actually loses boards today, and its wording
is the browser's — so *Close and save* would be unreachable.

**Discarding the live board in `beforeunload` rather than `pagehide`.**
`beforeunload` fires before she answers the prompt, so cancelling it would leave
her drawing onto a board the server had already thrown away.

**Server-side PDF rendering** — Chromium, poppler, or a native binding — on the
reasoning `2026-08-03-page-pdf-support-design.md` already sets out about a 2 GB
`t3.small`.

**Rendering the thumbnail lazily on the shelf and caching it there.** It needs
pdf.js in the student bundle, and a write path from an unauthenticated page
render into the database. Both are things this project has refused before, for
reasons that have not changed.

**A JPEG data URL in a `String` column, mirroring `Whiteboard.thumbnail`.**
Cheaper — no route, no cache headers, no version column, and the tested
`isThumbnail` validator already exists. Rejected because it would put roughly a
quarter-megabyte of base64 into every shelf render, uncacheably, which is
problem #1 of `2026-08-02-shelf-fabs-and-student-page-fixes-design.md`
reintroduced in the one form that cannot be fixed with a cache header. The
whiteboard archive is inlined because it has no route to serve from; a page
already has three.

**`pdfThumbSize Int?` as the existence signal**, mirroring `pdfSize` exactly.
Symmetrical, but nothing displays the size, and a timestamp carries existence
*and* the cache version — two jobs in one column, in a schema that already
prefers timestamps to booleans wherever one means something.

**Backfilling thumbnails for PDFs uploaded before this change.** A script needs
the server-side renderer this refuses; a self-healing render in the admin needs a
component and an action for a population the feature's age bounds to a handful.
Re-uploading is a control that already exists.

**Cropping the thumbnail at render time to 4:3.** Would save a few kilobytes and
would freeze the crop into every stored file. The crop is a presentation choice
and belongs in CSS, where changing it does not invalidate a year of caches.

**Dropping the reset button on an unclaimed student**, which is what the request
literally asked for. It is the only way to revoke a leaked invite that has not
been used yet, and the alternative loses the student's pages, pins, chat and
boards.

**Naming the reset *Reset password*.** Jenn never sees or sets a password, and
the action clears the email too.
