# Shelf FABs, cached previews and student-page fixes — design

Date: 2026-08-02

## Problem

Six unrelated complaints, collected after a week of real use. They are grouped
into one spec because four of them touch the same two files
(`app/g/[slug]/page.tsx` and the page-adding forms) and doing them separately
would mean rewriting the same JSX three times.

1. **Every page tile re-downloads its document.** `app/p/[slug]/raw/route.ts`
   sends `Cache-Control: no-store`, so each of the dozen `HtmlPreview` frames on
   a shelf issues a fresh GET on every mount. Nothing is reused between visits,
   between tabs, or between the admin and the student side.

2. **Adding anything means finding a different form.** There are four inline
   add-forms in three places: `NewGroupForm` at the bottom of the admin Students
   tab, `AddLinkForm` and a collapsed `PageEditor` at the bottom of the admin
   Pages tab, and `AddLinkRow` at the top of the student files tab. Each is a
   whole screen of controls sitting under a list, and the page one is behind a
   disclosure that makes the hard thing look like the easy one.

   Separately: publishing a page means producing an HTML *file*, which is a step
   Jenn does not need. She writes pages in a tool she can copy out of.

   And a student can add a link to their shelf but not a page, which is an
   asymmetry with no reason behind it.

3. **A student's page never says whose it is.** `/g/marie` and `/g/luc` render
   identically apart from the card.

4. **The page header is three titles deep.** `⚜ La carte du jour ⚜`, then
   *Français Avec Jenn*, then the tagline, then the week range — and then a tab
   strip that also says which section you are in. On the files and board tabs
   the top line is actively wrong: it says "the card of the day" above a shelf of
   worksheets.

5. **Adding a link asks for a title nobody wants to type.** Two fields where one
   would do, and the second is already optional with a fallback.

6. **The teacher sees a card tab she has no use for.** Opening a student from the
   admin Students tab lands her on the daily card, which is the same global card
   she just edited in `/admin`. The two things she actually came for — their
   shelf and their whiteboard — are one click further away.

A seventh item, opening the chat by default on desktop, was considered and
**dropped**: the chat stays closed on load exactly as it works today.

## Goal

Fix all six without adding a dependency, a migration, or a second way to do
anything. Every add-form collapses into one floating button per surface; the
preview stops re-fetching; and the student page's header stops repeating itself.

## Scope

New:

- `lib/page-version.ts` + test — the preview cache key
- `lib/page-title.ts` + test — a title derived from a pasted document
- `lib/link-title.ts` + test — a title derived from a URL
- `lib/student-greeting.ts` + test — "Bonjour Marie"
- `components/ui/Fab.tsx` — the round floating button, shared with the chat
- `components/ui/AddMenu.tsx` — the two-or-three-choice popover
- `components/ui/AddSheet.tsx` — the modal the chosen form renders into
- `components/ui/HtmlPasteBox.tsx` — paste-a-document, never shows it
- `components/admin/AdminChrome.tsx` — the admin's client shell and FAB
- `components/admin/NewPageForm.tsx` — the admin sheet's paste-a-page form
- `components/student/ShelfFab.tsx` — the student page's FAB and its two forms
- `components/student/CardHeading.tsx` — the eyebrow and week range, moved

Changed:

- `app/p/[slug]/raw/route.ts` — conditional cache headers, `X-Robots-Tag`
- `app/p/[slug]/page.tsx` — `noindex`
- `components/ui/HtmlPreview.tsx` — takes a `version`
- `lib/pages.ts` — `updatedAt` in the selects; `addedByStudent` for html
- `app/page-actions.ts` — `addShelfPage`; link titles derived
- `lib/shelf-access.ts` — `canStudentDelete` widens past links
- `lib/student-tab.ts` — a `card` availability flag
- `app/g/[slug]/page.tsx` — greeting, heading move, teacher tabs, the FAB
- `app/admin/page.tsx` — wrapped in `AdminChrome`; groups fetched once
- `components/admin/PagesTabClient.tsx` — chip comes from context
- `components/admin/PageEditor.tsx` — becomes edit-only: paste box instead of
  the drop zone, and it keeps its title field, because a published page's title
  stays editable. `initial` becomes required. Creating a page moves out to
  `NewPageForm`, taking `defaultGroupId` and the render-phase default-audience
  rule with it. Two small components with one job each, rather than one that
  branches on `initial` in four places.
- `components/admin/AddLinkForm.tsx` — one field
- `components/admin/NewGroupForm.tsx` — unchanged; it just moves into the sheet
- `components/student/StudentTabs.tsx` — a `card` flag
- `components/student/FilesTab.tsx` — takes `version`; loses `onAddLink`
- `components/admin/PageList.tsx` — takes `version`
- `CLAUDE.md`

Deleted:

- `components/admin/HtmlDropZone.tsx`
- `components/admin/Collapsible.tsx` — `PagesTabClient` is its only caller
- `components/student/AddLinkRow.tsx`

Unchanged, deliberately:

- `prisma/schema.prisma`. `updatedAt` and `addedByStudent` both already exist;
  there is no migration in this change.
- The CSP on `/p/[slug]/raw`. Caching is a `Cache-Control` question and touches
  no directive in it.
- `sandbox=""` on the preview frame and `sandbox="allow-scripts"` on
  `/p/[slug]`. Neither moves.
- `lib/page-html.ts`. The paste box validates with the existing
  `validatePageHtml` and adds no second rule.
- `app/f/[token]/page.tsx`. It has its own header and already shows the
  student's name; the greeting is not extended to it.

---

## 1 · Cached HTML previews

### The constraint

The preview cannot be cached from the outside. `sandbox=""` gives the framed
document an opaque origin, so the parent can neither read it, snapshot it, nor
detect whether it rendered. There is no client-side lever at all — the only
thing that can make the browser reuse the response is a header on the response.

Storing a rendered thumbnail instead was rejected when the tiles were designed
(`2026-07-31-page-tiles-design.md`) and is rejected again for the same reason: a
raster thumbnail needs a headless browser on a small EC2 box running SQLite.

### The design

`/p/[slug]/raw` learns an optional `?v=` parameter.

```
lib/page-version.ts
  pageVersion(updatedAt: Date): string   // updatedAt.getTime().toString(36)
```

`HtmlPreview` takes a `version` prop beside `slug` and frames
`/p/<slug>/raw?v=<token>`. The route recomputes the token from the row it just
loaded and compares:

| Request | `Cache-Control` |
|---|---|
| `?v=` matches the row's own token | `private, max-age=31536000, immutable` |
| `?v=` absent, or stale | `no-store` (unchanged) |

**Comparing rather than trusting any `?v=` is the load-bearing part.** A stale
bookmarked URL carrying last week's token must not be answered with an immutable
header, or that browser is pinned to a document that no longer exists for a
year. A mismatch serves the current document with the current no-store
behaviour, which is correct rather than merely safe.

`private` keeps the response out of shared caches. The direct view at
`/p/[slug]`, the download link on the admin editor, and `POST /api/pages` all
address the unversioned URL and are unaffected.

### Invalidation

`Page.updatedAt` is `@updatedAt` and every write goes through `savePage`'s
upsert, so editing a page changes the token, which changes the URL, which is a
cache miss. There is nothing to expire and nothing to purge. `revalidatePages`
already revalidates `/p/${slug}` for the Next.js side.

`updatedAt` has to reach the callers that build the URL: it joins `SHELF_SELECT`
in `lib/pages.ts`, `getPageBySlug`'s select, `listPagesForAdmin`'s projection,
`PageSummary` in `PageList`, and `ShelfPage` in `FilesTab`.

### What this does not fix

It removes the network fetch. It does **not** remove the browser's parse and
layout of a dozen documents at 500% width, which is inherent to a live-iframe
thumbnail and is already mitigated by `loading="lazy"`. Anyone measuring this
afterwards should expect the network panel to go quiet and the layout cost to
stay where it is.

### The accepted cost

`no-store` currently keeps these documents out of the browser's disk cache.
After this change a versioned response is written to disk for a year. The
content is teaching material rather than anything secret, and `private` bars
shared caches, but on a shared family computer a page is now recoverable from
disk after the student closes the tab. Accepted knowingly.

---

## 2 · One FAB per surface

### Shared parts

`components/ui/Fab.tsx` is the round button, extracted from the markup already
inside `ChatFab` so the `+` and the chat bubble are one object rendered twice
rather than two that drift. `ChatFab` is refactored onto it in the same change;
if it is not, there are two definitions of the same circle immediately.

`AddMenu` is the popover the FAB opens: two or three labelled choices, dismissed
on Escape and on outside click. `AddSheet` is the centred modal the chosen form
renders into. Both are dumb containers — neither knows what a student, a link or
a page is.

### The admin

The FAB must be one control across all three tabs, which puts it outside the tab
bodies. But the audience default for a new link or page is the active student
chip, and that chip lives in `PagesTabClient`'s local state
(`PagesTabClient.tsx:37`).

`components/admin/AdminChrome.tsx` resolves this by owning the chip instead. It
is a `"use client"` shell that wraps the three tab bodies, holds
`const [chip, setChip] = useState<string | null>(null)`, publishes it through
context, and renders the FAB. `PagesTabClient` drops its `useState` and becomes
a consumer; its `defaultGroupId(chip, groups)` call is otherwise unchanged.

This works across the boundary: a client provider may wrap server-rendered
`children`, and a client component nested inside those children still reads the
context.

The FAB sits at `bottom-6 right-4` and offers **Student**, **Link**, **Page** on
every tab. On success it refreshes and routes to the tab that shows the result —
`?tab=groups` for a student, `?tab=pages` for a link or a page.

**Knowing regression:** `prisma.group.findMany` moves from `PagesTab` to the top
of `app/admin/page.tsx`, because the FAB needs the audience list on every tab.
That contradicts the "each tab runs only its own queries" comment at
`app/admin/page.tsx:67`. The comment is updated rather than quietly falsified;
one indexed query over a table with a handful of rows is the price of the
control being in one place.

### The student page

`components/student/ShelfFab.tsx` renders as a sibling of `ChatFab` inside
`StreamProvider`, on **every tab**, whenever `unlocked` — matching the chat
button, which is already page-level, and matching CLAUDE.md's existing rule that
a tab hosting a control is present for anyone unlocked. It offers **Lien** and
**Page**, in French. On success it routes to `?tab=files` so the result is
visible.

It renders as a sibling of `ChatFab` inside `StreamProvider` because that is the
branch `unlocked` already selects, not because it needs the stream — it does
not call `useStream` and must not start.

It sits at `bottom-6 right-24`, to the **left** of the chat button rather than
above it. Above is where the chat panel already lives
(`ChatWindow.tsx:54`, `bottom-24 right-4`), so a stacked FAB would sit behind an
open conversation. Side by side, neither control ever covers the other and
neither moves.

The everyone group's shelf is public and `unlocked` is false there, so it gets
no FAB — Jenn fills that shelf from the admin, as she does today.

### The paste box

`components/ui/HtmlPasteBox.tsx` is a `<textarea>` that never holds anything.
`onPaste` reads `event.clipboardData.getData("text/plain")` and calls
`preventDefault()`, so the document never enters the box in the first place —
there is nothing to hide, and no flash-then-vanish from clearing it afterwards.
A status line replaces the text: *"A page was pasted — 34 KB."* `onChange` is
handled too, for text arriving by drag or by a mobile keyboard, and blanks the
field the same way.

Validation is `validatePageHtml` from `lib/page-html.ts`, unchanged and reused
verbatim. It already enforces the 2 MB byte cap and already rejects a string
with no `<` in it, which is the "check if it is HTML" this asks for. A second
rule beside it would be a second thing to keep in step.

On `{ ok: false }` the admin shows `result.error` and the student surface shows
one French sentence, the same split `AddLinkRow` uses today: the action's
messages are written for Jenn and a student should not read them.

On `{ ok: true }` the title is derived and the page is saved immediately. There
is no confirm step.

```
lib/page-title.ts
  titleFromHtml(html: string): string | null
```

`<title>` first, then the first `<h1>`, tags stripped from inside, the five
named entities that matter decoded, whitespace collapsed, length capped. A
regex, not a parser — the same posture `lib/inline-markup.ts` takes, and for the
same reason: a wrong result here is cosmetic. `null` falls back to `"Page"`,
which `uniqueSlug` will disambiguate to `page-2`, `page-3`.

**Flagged cost:** a page's slug is derived from its title once and never moves,
because students bookmark these links. With no confirm step, a badly derived
title becomes a permanent slug. The title itself stays editable at
`/admin/pages/<slug>`; the slug does not. This is the price of the one-gesture
flow and is accepted.

`/admin/pages/[slug]` gets the paste box too, so there is one way to supply HTML
rather than two divergent ones. The download link there is unaffected: the round
trip becomes download → fix → copy → paste.

### Students may publish pages

`SavePageInput`'s html variant gains `addedByStudent?: boolean`, and
`savePage`'s create branch drops its `input.kind === "link" &&` guard so the
flag is honoured for both kinds. A new `addShelfPage(groupId, input)` in
`app/page-actions.ts` is authorised by the existing `requireShelfRole` — the
same guard `addShelfLink` uses, so the everyone group and untokened visitors are
refused by a rule that already exists and is already tested.

`canStudentDelete` widens: its first clause becomes "the student added it"
rather than "it is a link". The third clause — that the row is on nobody else's
shelf — is untouched and is what keeps the widening safe, because a `Page` row
is shared and deleting one assigned to several groups removes it from all of
them.

This is the one new surface in the change: a student can now store a document
served from our origin, and `/p/[slug]` is a public route whose slug is derived
from the title and therefore guessable. The sandbox and the CSP already contain
anything scripted inside it — that reasoning is unchanged and is why there is
still no HTML sanitiser. What is added is `robots: { index: false, follow: false }`
on `/p/[slug]` and `X-Robots-Tag: noindex` on the raw route, so nothing a
student publishes can be crawled. Jenn can delete any page; the student can
delete their own while it is on nobody else's shelf.

---

## 3 · The greeting

```
lib/student-greeting.ts
  greeting(name: string): string | null   // "Bonjour Marie"
```

The first whitespace-separated word of `Group.name`, which holds the student's
full name. `null` for an empty or whitespace-only name. The caller suppresses it
when `group.isEveryone`, because that row is named "Everyone" and *Bonjour
Everyone* is wrong in both languages.

It renders in the `/g/[slug]` header, in the slot the `⚜ La carte du jour ⚜`
eyebrow vacates in item 4. It is shown to untokened visitors as well: `/g/marie`
already spells the name in the URL, so there is nothing here a token was
protecting.

---

## 4 · The card heading moves under the tabs

The header keeps three things: *Français Avec Jenn* (still linking home), the
tagline, and the greeting. The `⚜ La carte du jour ⚜` eyebrow and the
`formatWeekRange` line leave it.

They move into `components/student/CardHeading.tsx`, which takes `weekStart` and
`weekEnd` and calls `formatWeekRange` itself. It is rendered **inside the card
tab's branch of the page body**, above `WeekDayPicker` — not inside
`StudentTabs`, and that placement is the whole decision:

- An untokened visitor has no tab strip at all — `StudentTabs` only renders when
  `pages.length > 0 || unlocked` — but still needs the heading. Hanging it off
  the strip would delete it for exactly the visitor who has nothing else.
- The teacher loses the card tab in item 6, and a heading that lives in the card
  branch disappears for her without a second rule saying so.

Tab labels stay *La carte*, *Les fichiers*, *Le tableau*. The strip is now what
tells you which section you are in, which is the job the header line was doing
badly.

---

## 5 · Adding a link is one field

Both link forms lose their title input. `AddLinkForm` (admin) keeps its audience
line — *"Will be shared with Marie."* — because that sentence answers a question
the single URL field otherwise leaves open.

```
lib/link-title.ts
  titleFromUrl(url: string): string
```

Take the last path segment that is not noise, drop its extension, turn `-` and
`_` into spaces, title-case it. Noise means an empty segment, a known routing
word (`edit`, `view`, `index`, `d`, `e`, `preview`), or an opaque identifier —
a segment long enough and mixed enough to be a key rather than a name. When
nothing usable survives, fall back to the hostname with `www.` stripped, which
is the fallback `validateLink` already applies today when the title field is
left blank.

```
.../documents/verb-conjugation.pdf          → "Verb Conjugation"
https://docs.google.com/document/d/1AbC/edit → "docs.google.com"
https://youtu.be/xY12                        → "youtu.be"
```

**No request is made.** The title is derived from the URL string alone, by the
server or by nobody. Fetching the page to read its real `<title>` was considered
and rejected: it is a server-side request to a student-supplied URL, which is
the request forgery `lib/link-brand.ts:19-22` was written to avoid, and for the
case this feature exists to serve — a Google Doc that is not public — it would
return the title of a sign-in page.

`validateLink` in `app/page-actions.ts` calls `titleFromUrl` where it currently
reads `input.title.trim() || hostname`. `title` is dropped from `LinkInput` and
from `addShelfLink`'s inline input type, leaving `{ url }` and `{ url, groupIds }`.
The derivation is server-side, so both callers get it for free and neither can
skip it or disagree about it.

`FilesTab` loses its `onAddLink` prop entirely along with `AddLinkRow`; the
action is bound to `ShelfFab` in `app/g/[slug]/page.tsx` instead.

---

## 6 · The teacher has no card tab

`parseStudentTab`'s `available` record gains a third flag:

```ts
parseStudentTab(value, { card: boolean, files: boolean, board: boolean })
```

The fallback stops being an unconditional `"card"` and becomes `files → board →
card` when `card` is unavailable. A teacher opening a student is always unlocked
and therefore always has both, so she lands on Files.

```ts
const showCard = !(viewerIsTeacher && unlocked);
```

Hiding it only when she is *unlocked* is deliberate. A teacher who opens
`/g/marie` with no `?k=` in the URL is, as far as this page is concerned, a
visitor with the public card and nothing else; hiding the card there would serve
her a page with no tabs and no content. She reaches a student from the Students
tab, which appends the token, so the intended path always gets the intended
result.

`StudentTabs` takes `has.card` and omits the pill. `CardHeading` needs no extra
guard — it lives in the card branch, which she can no longer reach.

---

## Testing

Four new pure modules, four new files under `tests/lib/`, per the repo
convention that anything with a rule in it is a pure function with a test and
that components and Prisma access are not unit-tested:

- `tests/lib/page-version.test.ts`
- `tests/lib/page-title.test.ts`
- `tests/lib/link-title.test.ts`
- `tests/lib/student-greeting.test.ts`

`tests/lib/student-tab.test.ts` is extended for the `card` flag, including the
fallback order and the case where no tab is available at all.

`tests/lib/shelf-access.test.ts` is extended for `canStudentDelete` accepting an
html page and still refusing one on a second shelf.

No component tests. No migration, so no `prisma migrate`. CI order is unchanged:
`prisma generate` → lint → `tsc --noEmit` → test → build.

## Documentation

`CLAUDE.md` needs five edits, all of which are statements this change falsifies:

1. The `/g/[slug]` row of the route table — the card tab is now conditional, and
   both extra tabs now host an add control reached from a page-level FAB.
2. *"The admin editor shows no HTML at all: `PageEditor` holds the document in
   state and `HtmlDropZone` takes a file"* — the drop zone is gone and the round
   trip is now download → edit → copy → paste.
3. The raw route's caching contract — `no-store` is no longer unconditional, and
   why the `?v=` comparison exists.
4. The tab-presence rule under *Files: pages and links* — the control that fills
   an empty shelf is now the FAB, not something inside the tab, which weakens
   the original argument for showing an empty tab. The tabs still show; the
   reason changes.
5. A note that students may now publish HTML, that `canStudentDelete` no longer
   means links-only, and that `/p/[slug]` is `noindex` because of it.
