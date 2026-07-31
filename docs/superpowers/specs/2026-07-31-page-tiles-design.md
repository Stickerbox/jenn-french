# Page tiles with previews — design

Date: 2026-07-31

## Problem

Both page lists — the student's files shelf and the admin Pages tab — render a
column of full-width rows carrying a title and a date. Nothing on a row says
what the page *is*. A student who has eight pages on their shelf has eight
identical rectangles distinguished only by whatever Jenn typed in the title
field, and titles are written to be filed, not to be recognised.

## Goal

Both lists become a grid of tiles, each showing a scaled-down rendering of the
page it links to — the Google Docs arrangement. Recognition replaces reading.

The preview must cost nothing in new infrastructure: no headless browser, no
screenshot pipeline, no stored thumbnail column. The production box is a small
EC2 instance running SQLite on disk, and a render farm is not proportionate to
a shelf of a dozen worksheets.

## Scope

New:

- `components/ui/PageTile.tsx` — the tile: a preview slot, a footer, an
  optional actions slot
- `components/ui/HtmlPreview.tsx` — the scaled iframe
- `lib/page-tile.ts` — `pageAudienceLabel`
- `tests/lib/page-tile.test.ts`

Changed:

- `components/student/FilesTab.tsx` — list becomes grid
- `components/admin/PageList.tsx` — list becomes grid; the View and Download
  icons move into the tile footer
- `components/card-styles.ts` — the repeated grid and tile-frame class strings

Unchanged, deliberately:

- `app/p/[slug]/raw/route.ts` and its CSP. The preview needs no new route, no
  new header, and no relaxation of an existing one.
- `components/ui/Tile.tsx`. The admin Students list still renders it, and a
  student has nothing to preview.
- The `Page` model. No thumbnail column, no `kind` column, no migration.

## The preview

`HtmlPreview` frames the existing `/p/[slug]/raw` at a fixed layout size and
scales it down with CSS:

```
wrapper:  container-type: inline-size; aspect-ratio: 4 / 3; overflow: hidden
iframe:   width: 900px; height: 675px;
          transform: scale(calc(100cqw / 900)); transform-origin: top left
```

Container query units carry the whole rule. There is no `ResizeObserver`, no
measured width in state, and no breakpoint-specific scale factor: the frame
fits its column exactly at every column count, including ones added later.
675 = 900 × 3/4, so the scaled frame fills the 4:3 wrapper with no letterbox.

The 900px is load-bearing and not an arbitrary large number. An iframe sized to
the tile — 160px on a phone — makes the page lay itself out in *its own* mobile
breakpoint, so the thumbnail would show a layout that opening the page never
produces. Laying out at desktop width and scaling is what makes the preview a
preview.

### The frame is more sandboxed than the page

```
sandbox=""        no allow-scripts, no allow-same-origin, nothing
loading="lazy"
pointer-events-none
aria-hidden, inert
```

`/p/[slug]` grants `allow-scripts` because the interactivity is the entire
point of the feature. A thumbnail has the opposite requirement. A shelf is a
dozen documents mounted at once on a student's phone; their scripts would all
run, and an animation or an autoplaying `<audio>` inside a 160px tile is a bug
with no control surface to stop it. `sandbox=""` is strictly stronger than the
`/p/[slug]` frame, so it introduces no new exposure, and the raw route's
existing `frame-ancestors 'self'` already permits framing from our own pages.

**Never add `allow-scripts` to the preview frame.** The reasoning that justifies
it on `/p/[slug]` — the student is looking at the page and chose to open it —
does not transfer to a tile the student never asked to load.

`pointer-events-none` sends the tap to the tile's own stretched link rather
than into the framed document. `aria-hidden` and `inert` mark the frame
decorative: the title link is the tile's accessible name, and a screen reader
walking a shelf should hear eight titles, not eight documents.

### Accepted limitation

A page that draws itself entirely from JavaScript previews blank, because the
preview frame runs no JavaScript. This is not detectable from our side — the
frame has an opaque origin, so there is nothing to read back and no fallback to
trigger. Such a tile still carries its title and date, which is what the row it
replaced carried, so the failure mode is a return to today's behaviour rather
than a loss.

### Cost

Each visible tile is one request for the whole document, up to the 2 MB cap.
`loading="lazy"` keeps that to what is on screen. The raw route sends
`Cache-Control: no-store`, so previews are not cached; that stays as it is,
since the database is local and the alternative is reasoning about how long a
corrected page may keep showing its old thumbnail.

## The tile

`PageTile` takes:

```
preview:  ReactNode      the thumbnail, rendered in the 4:3 wrapper
href:     string         where the whole tile links
title:    string
eyebrow:  string
action?:  ReactNode      the admin's icons; absent on the student shelf
```

The title anchor stretches over the whole tile with `after:absolute
after:inset-0`, exactly as `Tile` does today and for the same reason: `action`
contains anchors, and an anchor nested inside an anchor is invalid HTML that
browsers repair by splitting the element.

Actions live in the footer beside the title, not floating over the preview.
They stay visible without a hover state, which matters because Jenn works from
an iPad, and they do not obscure the thing the tile exists to show.

The flashcard palette (`--card-*`) continues to apply in both lists, including
the admin one, for the reason already recorded in `Tile`: Jenn seeing her pages
the way her students see them is the point of the admin list resembling the
shelf.

## The grid

Both lists use the same rule: `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4`.

Two columns on a phone rather than one, because that is where students open the
shelf and a one-column grid of thumbnails is a longer scroll than the row list
it replaced — it would make the feature cost something to the people it is for.
At 160px a thumbnail is enough to recognise a page already seen, which is the
job; it is not enough to read one, which is not.

Explicit breakpoints rather than `auto-fill`/`minmax`, so the phone case is a
decision rather than a consequence of whatever minimum width happens to be
written.

`FilesTab`'s container loses its `max-w-[560px]`, which was sized for a single
column of rows and would cap the grid at two columns forever.

## The seam for general links

Support for linking to pages we do not host is planned but not built here.
`PageTile` accommodates it through one decision: **`preview` is a `ReactNode`
slot, not a slug.** Today both callers pass `<HtmlPreview slug={…} />`. A link
variant will pass a different node — a favicon-and-`og:image` card, or whatever
turns out to be fetchable — and `PageTile` needs no change, because it never
learns what kind of thing it is previewing.

There is deliberately no `PagePreview` discriminated union, no `kind` column,
and no second renderer written speculatively. There is one kind of page. The
slot is the entire seam and it costs nothing to leave open.

Note for whoever builds that: a cross-origin URL generally cannot be framed at
all (`X-Frame-Options`/`frame-ancestors` on the target), so the link variant
will not be `HtmlPreview` with a different `src`. It is a different renderer,
which is why the slot is a node rather than a URL.

## Logic and tests

The one rule-bearing fragment in this change is the admin eyebrow, currently a
nested ternary inline in `PageList`'s JSX:

```
shared with everyone  →  the page is on every student's shelf
no students           →  it is on nobody's
otherwise             →  the group names, joined
```

It moves to `lib/page-tile.ts` as `pageAudienceLabel`, a pure function over
`{ groupNames, sharedWithEveryone }`, with `tests/lib/page-tile.test.ts`
covering the three branches and the precedence between the first two. This
follows the standing convention: anything with a rule in it is a pure function
in `lib/` with a test in `tests/lib/`.

The components stay untested, as every component here does.

## Verification

`npm run lint`, `tsc --noEmit`, `npm test`, `npm run build` — the CI order.

Manually, in `npm run dev`:

- The student shelf at a phone width shows two columns, and at desktop width
  three then four.
- A page containing a script or an animation is motionless in its tile.
- Tapping anywhere on a tile opens the page; the admin's View and Download
  icons still do their own jobs and do not trigger the tile link.
- A shelf with one page and a shelf with none both look deliberate.
