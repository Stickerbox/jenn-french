# Files: links, per-shelf pinning, and the whiteboard text fix

2026-07-31

Five changes, three of them to the files shelf and two independent of it:

1. The shelf holds **links** as well as uploaded HTML pages. Both Jenn and a
   student can add one, and either side can filter the shelf by kind.
2. A link's tile preview is a **bundled brand icon** chosen from its URL.
3. The whiteboard's **Text tool does nothing** — a bug.
4. Adding a page in the admin **defaults its audience to the active filter**.
5. **Both parties can pin**, on the student's page.

Items 3 and 4 are independent of the rest and of each other. Items 1, 2 and 5
share a data model and are specified together.

## Decisions taken

| Question | Decision | Rejected |
|---|---|---|
| Where does a link live? | One `Page` table with a `kind` column | A separate `Link` model; a generated redirect page |
| Whose pin is a pin? | Per-shelf, `PagePin(pageId, groupId)` | One global `Page.pinnedAt`; two pin concepts |
| Do Everyone pins inherit? | **No.** Strictly per-shelf | Inheriting, mirroring how pages inherit |
| Where does a link preview come from? | A bundled icon chosen by URL | Server-side `og:image` fetch; a favicon service |
| Are student-added links visible to Jenn? | Yes, and attributed | Invisible; visible but anonymous |
| How is any of this verified? | Extracted `lib/` logic + a human gate | Playwright; jsdom component tests |

The last row is the one that shapes the plan most, and is expanded under
[Verification](#verification-and-the-human-gate).

## Retiring an earlier decision

`2026-07-31-page-tiles-design.md` says, of the tile's `preview` slot:

> There is deliberately no `PagePreview` discriminated union, no `kind` column,
> and no second renderer written speculatively. There is one kind of page.

That was correct when it was written and is now obsolete: there are two kinds.
The same spec anticipated this under *"The seam for general links"*, and the
seam holds — the `preview` slot needs no change at all. It takes a `ReactNode`,
and the link variant passes a different node. The prediction that a cross-origin
URL generally cannot be framed is also borne out; nothing here tries to.

`PageTile` does gain **one** optional prop, `external`, for a reason the earlier
spec did not foresee: the tile's title is a `next/link` `<Link>`, and an
off-site destination must be an `<a target="_blank" rel="noopener noreferrer">`
instead. `rel="noopener"` is not cosmetic — without it the opened page gets a
`window.opener` handle back to the student's session and can navigate it
somewhere else (reverse tabnabbing). One boolean, switching the element the
stretched link renders as; the layout, badge and action slots are untouched.

## 1. Data model

```prisma
model Page {
  id             String      @id @default(cuid())
  slug           String      @unique
  title          String
  kind           String      @default("html")   // "html" | "link"
  html           String?                        // null on a link
  url            String?                        // null on an html page
  addedByStudent Boolean     @default(false)
  createdAt      DateTime    @default(now())
  updatedAt      DateTime    @updatedAt
  groups         PageGroup[]
  pins           PagePin[]
  // pinnedAt removed — see PagePin
}

model PagePin {
  pageId   String
  groupId  String
  pinnedAt DateTime @default(now())
  page     Page     @relation(fields: [pageId], references: [id], onDelete: Cascade)
  group    Group    @relation(fields: [groupId], references: [id], onDelete: Cascade)

  @@id([pageId, groupId])
}
```

`kind` is a `String`, not a Prisma enum: Prisma has no enum support on SQLite.
It therefore gets `readPageKind` in `lib/page-kind.ts`, which never throws. This
is the same contract `readSections` and `readOps` already have, for the same
reason — the column's type in the database is wider than the type in TypeScript,
and a row written by a future migration or a hand-edited database must not crash
a shelf.

It takes the **row**, not the string:

```ts
readPageKind({ kind, url }): "html" | "link"
```

Falling back to `"html"` on an unrecognised string would be the wrong repair for
the row it is most likely to meet — one with a populated `url` and a null
`html`, which would then render as a page with no document. So an unrecognised
`kind` resolves by `url`: present means link, absent means html.

It reads `url` and not `html` on purpose. The shelf queries never select `html`
— that column holds a whole document, and selecting it to render a grid of
thumbnails would pull every page's markup to draw a list of titles.

`html` becomes nullable. Every read path that touches it must now handle null;
those are enumerated in [§3](#3-links).

`PagePin` deliberately does **not** mirror `PageGroup`. A student may pin a page
that reaches them through the Everyone group, so a pin can exist for a
`(page, group)` pair that has no `PageGroup` row. That is intended, not a
dangling reference — the pin says "this page sits at the top of that shelf", and
the shelf is assembled by `listPagesForGroup`, not by `PageGroup` alone.

### Pins do not inherit

A pin on the Everyone group's shelf appears at `/g/all` and nowhere else. It
does not propagate to each student the way the *page* does.

This is a deliberate asymmetry and it has a cost worth stating plainly: pinning
one reference for twelve students is twelve pins, and there is no single action
that pins for the class. The alternative — inheriting, with a student's own pin
overriding — was considered and rejected as a second merge rule to keep in step
with `effectivePages`. If Jenn asks for a class-wide pin later, the honest
implementation is inheritance, and this paragraph is the record of why it is not
here yet.

### The migration is the sharpest risk in this work

Prisma generates schema-only migrations. It will **not** write the data
backfill, and the generated SQL for dropping `Page.pinnedAt` under SQLite is a
table rebuild that discards the column's contents silently — no error, no
warning, and every pin Jenn has set is gone on a live database.

The migration SQL must therefore be **hand-edited** so that

```sql
INSERT INTO PagePin (pageId, groupId, pinnedAt)
SELECT p.id, pg.groupId, p.pinnedAt
FROM Page p JOIN PageGroup pg ON pg.pageId = p.id
WHERE p.pinnedAt IS NOT NULL;
```

runs **before** the rebuild that drops the column. A page that is pinned but
assigned to no group loses its pin, which is correct: it was on no shelf.

`docs/DEPLOYMENT.md`'s backup step runs before this deploys. This gets its own
step in the plan with its own verification, not a bullet inside a larger one.

## 2. Access

### Who may add a link

The control renders on `/g/[slug]?tab=files` when the page's own `unlocked` flag
is true. The server action authorises independently. That split — render on
`unlocked`, authorise on the server's own check — is exactly what the chat
already does (`ChatFab` renders on `unlocked`; `POST /api/chat/[slug]`
authorises for itself).

The authorisation rule is **not** `chatRole`, and the difference matters.
`chatRole` refuses the Everyone group *before* it checks the teacher, so that
"not even the teacher can open a conversation there by accident". That is right
for a conversation and wrong for curation: the shared shelf is Jenn's to fill,
and reusing `chatRole` would lock her out of a workflow she already has for
pages.

So `lib/shelf-access.ts` holds a sibling rule, `shelfRole`, ordered differently:

```ts
shelfRole({ isTeacher, isEveryone, chatToken, presented }): "teacher" | "student" | null
```

- **Teacher first.** Jenn may add and pin on any shelf, Everyone included.
- **A student is refused on the Everyone shelf**, checked explicitly. Its
  `chatToken` is null so no token could match anyway, but the flag is checked
  too, so the guarantee does not rest on a data invariant a later migration
  could quietly break. This is what stops `/g/all` — the one shelf that is
  public with no token — from being an unauthenticated write endpoint.
- **Otherwise a token match**, and only against that group's own token.

The same rule authorises adding a link, pinning, and a student's delete. Three
call sites, one function, tested once.

The daily card stays public and untouched. An untokened visit to `/g/marie`
renders what it always rendered.

### Tab presence

Both the Files and Whiteboard tabs are **present for anyone unlocked, empty
state and all.** The rule already existed for the whiteboard and is now general:

```
has.files = unlocked || pages.length > 0
has.board = unlocked
```

The second clause on `files` exists only for the Everyone group, whose shelf is
public and has no unlocked state to key off.

Without this, a student with an empty shelf has no way to reach the control that
fills it — the tab that holds it is hidden precisely because it is empty.

### Deletion

Jenn deletes anything, as now. A student may delete a row only when **all** of:

- `addedByStudent` is true,
- `kind === "link"`,
- the page's group set is exactly their own group.

So a student can retract their own mistake, and can never remove something of
Jenn's or anything another student can see. The third condition is what makes
the second and third safe together: a `Page` row is shared, and deleting one
assigned to several groups would remove it from all of them.

## 3. Links

### URL validation is a security control

`parseLinkUrl` in `lib/link-url.ts` is the guard, and students now supply its
input:

- trim; reject empty
- prefix a bare `docs.google.com/…` with `https://`
- parse with `new URL()`; **reject every scheme but `http:` and `https:`**
- require a host
- cap the length at 2048

The scheme check is the point. A `javascript:` or `data:` URL rendered into an
`href` is stored cross-site scripting, reachable by any student with a chat
token. Returns a result object rather than throwing, matching `validatePageHtml`.

### Brand mapping

`linkBrand(url)` in `lib/link-brand.ts` returns one of

```
"google-docs" | "google-sheets" | "google-slides" | "google-forms"
| "google-drive" | "youtube" | "pdf" | "generic"
```

Matched on host **and path** — `docs.google.com/document`,
`docs.google.com/spreadsheets` and `docs.google.com/presentation` share a host
and are three different products. It never throws; malformed input returns
`generic`. A companion `linkHostLabel(url)` returns the bare host for the text
under the glyph.

No network request is made, by the server or the browser. This is the reason
the option was chosen: the CSP on `/p/[slug]/raw` admits no `https:` in any
directive precisely because a subresource load is a real GET, and CLAUDE.md
records that nothing loads from a CDN. A server-side `og:image` fetch would also
be request forgery by design — students supply the URL — and would fail on the
headline case anyway, since a Google Doc that is not public returns a sign-in
page.

*Trademark:* the plan bundles Google's official product SVGs with a source
comment. They are usable to refer to the product, but they are not ours, and the
fallback if that is unwanted is a generic document glyph tinted in the product's
colour. Recorded here so the choice is visible rather than assumed.

### Rendering

`LinkPreview` fills `PageTile`'s existing `preview` slot: the brand glyph on a
tinted 4:3 box with the host beneath. `PageTile` and `HtmlPreview` are unchanged.

A link tile's `href` is the external URL directly, with
`target="_blank" rel="noopener noreferrer"` — not a `/p/[slug]` redirect. The
slug still exists (it is derived from the title as now, and identifies the row
in pin and delete actions), but it addresses nothing renderable.

### Guards on the HTML routes

Three routes assume `html` is present and must now reject a link row explicitly:

| Route | Behaviour on a link row |
|---|---|
| `/p/[slug]` | 404 |
| `/p/[slug]/raw` | 404 |
| `POST /api/pages` | 400, "That slug belongs to a link." |

404 rather than a redirect to the external URL: `/p/` means "a page we host",
and an open redirect on a public route is a phishing primitive.

`savePage`'s input becomes a discriminated union on `kind`, and `validate()` in
`app/page-actions.ts` branches — `validatePageHtml` for an html page,
`parseLinkUrl` for a link.

## 4. The shelf, both sides

A kind filter — **All / Pages / Links** — appears on the admin's Pages tab and
on the student's files tab. `GroupChip` is extracted from `PageList` into a
shared `FilterChip` taking a `tone` prop, because the admin renders in
`--color-*` and the student in `--card-*`; per CLAUDE.md the card palette
travels with the flashcard template, and both page lists already sit inside it.

`filterPagesByKind` in `lib/page-filters.ts` is the rule. It composes with the
existing `filterPages` and `filterPagesByGroup`, and sections still form over
the filtered set so a heading never sits above nothing.

The student's files tab also gains the search field, reusing the tested
`filterPages`; `SearchablePage.groupNames` becomes optional so a student row,
which has no group names, satisfies it.

### `FilesTab` becomes a client component

It needs filter state. The consequence that matters: it must take `today` as a
prop instead of calling `new Date()` inline, for the reason `PageList` already
documents —

> a clock read on both sides of hydration can straddle a week boundary and
> produce different sections for the same list — a hydration mismatch that would
> appear once a week, at midnight, and be unreproducible by daylight.

Converting the component without moving the clock read ships that bug to the
student side. Both `/g/[slug]` and `/f/[token]` pass it.

### Adding a link is one row, not a form

The emphasis in the request was that adding a link should be *easy*. On both
surfaces it is a single always-visible row — a title field, a URL field, a
button — not a step inside the collapsible "Add a page" editor, which is a
screenful of controls for uploading a document.

## 5. Pinning (item 5)

`setPagePinned(slug, pinned)` becomes `setShelfPin(slug, groupId, pinned)`,
authorised by teacher session **or** `chatRole` for that group. It writes or
deletes one `PagePin` row, with `deleteMany`/`upsert` rather than `delete`, so a
double-click or a stale tab is a no-op rather than a P2025 — the convention
already in `deletePage` and the old `setPagePinned`.

`applyPins(pages, pins)` in `lib/page-pins.ts` folds a shelf's pin rows onto each
page as a `pinnedAt` field. This is what keeps **`sectionPages` completely
unchanged**: it still reads `pinnedAt` off each row and still puts a pinned page
only under Pinned, never also under its date. Resolving whose pin that is
happens one layer down.

- **Student page.** Jenn and the student both get the interactive pin in the
  tile footer, acting on that student's shelf. The read-only marker students
  have today becomes a control.
- **Admin.** The pin acts on the shelf named by the **active student chip**, and
  is disabled with a hint when "All" is selected — "All" is not a shelf, so
  there is no pin to toggle. `listPagesForAdmin` returns each page's full pin
  set and the client selects the active group's.

A consequence, recorded because it will look like a bug otherwise: with no chip
selected, the admin's **Pinned section does not appear at all.** Nothing is
pinned on "All", because "All" is not a shelf. Selecting Marie shows Marie's
pinned items at the top — which is consistent with the filter already answering
"what does Marie have?".

## 6. Default audience from the filter (item 4)

Selecting the Marie chip and then adding a page pre-ticks Marie.

`PageList` owns the chip state today and `PageEditor` is its sibling, so the
state lifts one level into a small `PagesTabClient` wrapper rendering both.
Putting the filter in the URL alongside `?tab=` and `?date=` was the considered
alternative; it was rejected because it would split the pair — the search box
would stay local while its neighbour became a navigation.

The rule for not clobbering Jenn's intent copies the `titleFromFile` precedent
in `PageEditor` verbatim: the selection follows the filter until she ticks a box
herself, and then stops following. A default she did not ask for must never
overwrite a choice she made.

`defaultGroupIds(activeChip, groups)` in `lib/default-audience.ts` is the
mapping — chip names are display names, `PageEditor` wants ids.

## 7. The whiteboard Text tool (item 3)

**Symptom:** the Text button selects, but no text can be typed.

**Hypothesis, not yet a diagnosis.** `handlePointerDown`
(`components/whiteboard/BoardEditor.tsx:187`) calls `setPointerCapture` before
the tool branch and never calls `preventDefault()`. `pointerdown` is a discrete
event, so React flushes the state update and `TextLayer`'s focus effect
synchronously. The browser then dispatches the compatibility `mousedown`,
retargeted to the captured surface `div`, whose default action moves focus. The
`div` is not focusable, so focus lands on `<body>`, the textarea blurs,
`onBlur={onCommit}` fires with an empty value, and `commitDraft` calls
`setDraft(null)`. The box opens and closes inside the one click.

**Confirm before fixing.** Log `document.activeElement` in the blur handler and
check it is `<body>`, and check whether the draft survives when the tool branch
returns before `setPointerCapture`. `handleDoubleClick` opens a draft by a
different path and must be checked too.

**Fix.** Branch on `text` *before* taking capture, and `preventDefault()` there.
A text placement has no drag, so it never wanted capture; suppressing the
compatibility mouse event removes the focus theft.

**Made testable.** The decision extracts to `pointerDownIntent({tool, hasDraft,
saving})` in `lib/whiteboard-tools.ts`, returning a tagged action —
`"ignore" | "open-text" | "select" | "erase" | "start-stroke"` — with
`capturesPointer` and `preventsDefault` flags. `BoardEditor` becomes a thin
dispatcher over it. The rule *"text takes no capture and prevents default"* is
then a unit test, and the component keeps no branching logic of its own. This
follows the standing convention rather than fighting it.

## Verification and the human gate

The implementing session has **no browser**. This constrains what may be claimed.

**jsdom is not an option for item 3, and the plan must not add it.** jsdom
implements neither pointer capture nor the focus-on-mousedown default action, so
a jsdom test of this bug passes identically before and after the fix. That is
worse than no test: it is false confidence, and it would also be the project's
first component test against an explicit convention that components are not
unit-tested.

Playwright would genuinely catch it — headless Chromium implements both — and
was offered and declined. It stays available if interaction bugs recur.

So:

1. Every new rule is a pure function in `lib/` with a test in `tests/lib/`.
   `npm test` proves the **logic**.
2. `npm run typecheck` and `npm run build` carry the weight for the
   `FilesTab` client conversion, the RSC boundaries, and the nullable `html`
   fanout. These catch a class of error no unit test would.
3. The implementing session **stops at a human verification gate**, states
   plainly that it cannot confirm the browser behaviour, and hands back a
   written reproduction script. Under `verification-before-completion` it may
   not claim item 3 is fixed on its own authority — a passing `npm test` proves
   the decision function, not the cure.

CI order, run locally before any claim of completeness:
`npx prisma generate` → `npm run lint` → `npm run typecheck` → `npm test` →
`npm run build`.

## Logic and tests

New pure modules, each with a test file in `tests/lib/`:

| Module | Rule |
|---|---|
| `lib/link-url.ts` | `parseLinkUrl` — scheme allowlist, bare-host prefixing, length cap |
| `lib/link-brand.ts` | `linkBrand`, `linkHostLabel` — host+path → brand, never throws |
| `lib/page-kind.ts` | `readPageKind` — widen-to-narrow guard, resolving by column when `kind` is unrecognised |
| `lib/shelf-access.ts` | `shelfRole`, `canStudentDelete` — who may write to a shelf, and to which row |
| `lib/page-pins.ts` | `applyPins` — fold a shelf's pins onto its pages |
| `lib/page-filters.ts` | `filterPagesByKind` |
| `lib/default-audience.ts` | `defaultGroupIds` — active chip → group ids |
| `lib/whiteboard-tools.ts` | `pointerDownIntent` — tool → action, capture, preventDefault |

Existing tests to update: `admin-search.test.ts` (optional `groupNames`).
`page-sections.test.ts` and `effective-pages.test.ts` should need **no
changes** — if they do, `applyPins` is in the wrong place.

## Documentation

CLAUDE.md is part of the deliverable:

- `/g/[slug]` route row — tabs always present when unlocked; both parties add
  links and pin.
- **Uploaded pages** → pages *and* links: the `kind` column, why the "one kind
  of page" reasoning is retired, the three route guards, the no-network preview
  rule.
- The `pinnedAt` paragraph — rewritten for `PagePin`, keeping the
  "only under Pinned" rule, and recording that pins do not inherit.
- **Whiteboards** — fold "the Whiteboard tab is present for anyone unlocked"
  into the shared Files-and-Whiteboard rule so it is stated once.
- The admin-filter paragraph — the filter is now also the default audience and
  the pin target.

## What this deliberately does not do

- **No link health checking.** Nothing verifies a URL still resolves. A dead
  link stays on the shelf until someone removes it.
- **No fetched thumbnails**, now or scheduled. The `preview` slot remains the
  seam if that changes.
- **No class-wide pin.** See [Pins do not inherit](#pins-do-not-inherit).
- **No rate limiting on student link adds.** The chat token is the control, and
  it is already the control for posting unlimited chat messages. If that proves
  wrong it is a shared problem with the chat, not a link problem.
- **No `filesToken` UI restoration.** Out of scope; `/f/[token]` gains the
  `today` prop and nothing else.
