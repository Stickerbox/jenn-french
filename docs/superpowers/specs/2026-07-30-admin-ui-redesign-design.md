# Admin UI for a non-technical teacher — design

Date: 2026-07-30

## Problem

`/admin` has grown by accretion. It is one long scroll holding three unrelated
jobs — write today's card, manage groups, manage uploaded pages — with no
separation between them, and the page editor's centrepiece is a textarea full
of raw HTML. Jenn is not a developer. The screen shows her machinery she has no
use for and buries the one thing she opens it for.

The lists are bare underlined links. The page list in particular looks nothing
like the list her students see, so there is no way for her to tell from the
admin screen what she has actually published.

## Goal

Opening `/admin` shows the daily word and nothing else. Groups and Pages are one
click away, each on its own screen, each searchable. Nothing anywhere in the
admin area displays HTML. The lists are cards that look like what a student
sees, not links.

## Scope

New:

- `lib/admin-tab.ts` — `parseAdminTab`
- `lib/admin-search.ts` — `filterPages`, `filterGroups`, `normalise`
- `components/ui/field.ts` — the shared field class string
- `components/ui/Tile.tsx` — the list tile, shared by student and admin lists
- `components/admin/SearchField.tsx`
- `components/admin/AdminTabs.tsx`
- `components/admin/HtmlDropZone.tsx`
- `tests/lib/admin-tab.test.ts`, `tests/lib/admin-search.test.ts`

Changed:

- `app/globals.css` — two field tokens
- `components/ui/Input.tsx`, `components/ui/Textarea.tsx` — consume the shared
  class; `inputClassName` moves out of `Input.tsx`
- `components/admin/AdminDatePicker.tsx` — new import path, popover fill
- `app/admin/page.tsx` — tabs, per-tab queries, centred layout
- `components/admin/PageList.tsx` — tiles, search, download
- `components/admin/GroupList.tsx` — tiles, search
- `components/admin/PageEditor.tsx` — drop zone replaces file input and
  textarea; group pills
- `app/admin/pages/[slug]/page.tsx` — restyled header
- `app/g/[slug]/pages/page.tsx` — renders the shared `Tile`
- `lib/pages.ts` — `listPagesForAdmin` selects `createdAt`
- `CLAUDE.md` — the `--card-*` scoping claim, and the `/admin` route row

Unchanged:

- `app/page-actions.ts`, `app/actions.ts`, `app/ai-actions.ts`. No server
  action's signature or behaviour changes.
- `app/p/[slug]/raw/route.ts` and its CSP. The download link needs no server
  support.
- Card resolution, sections, dates, Claude generation, auth.
- The RichText fields inside the flashcard editor.

## Tabs

`/admin` takes `?tab=`, with three values: `daily` (the default), `groups`,
`pages`. `parseAdminTab(value)` in `lib/admin-tab.ts` returns one of the three,
falling back to `daily` for anything unrecognised or absent — the same shape as
the existing `parseAdminDate`, and pure for the same reason.

```
                  Français avec Jenn                    Log out

              ( Daily word )  ( Groups )  ( Pages )
```

The strip is a `<nav aria-label="Admin sections">` of three `<Link>`s, the
active one carrying `aria-current="page"`. It is not an ARIA tablist: these are
navigations to distinct URLs, not panels swapped in place, and labelling them
`role="tab"` would promise keyboard behaviour that browser navigation does not
provide.

The Daily word link carries the current `?date=` so that leaving the tab and
coming back lands on the day she was working on. The Groups and Pages links
carry no date — neither screen has one.

A tab that is not active does not run its queries. `app/admin/page.tsx`
branches on the parsed tab and fetches only what that tab renders: the daily
word tab stops loading pages, the pages tab stops loading cards. The group list
is still needed by the Pages tab, because the page editor assigns groups.

There is no `<h1>` per panel. The active pill is the section's name, and the
nav with `aria-current` is the accessible equivalent; a heading repeating it
would be noise. The page's one `<h1>` is the wordmark.

## Centring

The header, the tab strip, and both list panels centre in a single column.

The daily word tab is left as it is. Its form-and-preview grid is already
centred as a whole at `lg`, and the `lg:mx-0` on the date picker and headings
exists so they share the form column's left edge — removing it would float them
into the gutter between the two columns.

Field labels stay left-aligned inside centred columns. A centred label sitting
over a full-width input reads as a mistake, not as symmetry. What centres is
the column, the headings, the empty states, and the search result count.

## Field styling

Two tokens in `app/globals.css`:

```css
--color-field: #F3E8D8;         /* a step darker than --color-bg #FBF3E9 */
--color-field-border: #CDB89A;  /* thin, distinctly darker than the fill */
```

`inputClassName` moves from `components/ui/Input.tsx` to
`components/ui/field.ts` as `fieldClassName`, and becomes:

- `rounded-xl` (from `rounded-lg`)
- `border border-[var(--color-field-border)]` (from `border-[…ink-muted]/30`)
- `bg-[var(--color-field)]` (from `bg-white`)
- `px-4 py-3` (from `px-3 py-2`)
- `text-base` at every width — the `sm:text-sm` shrink goes, since the ask is
  for a larger face, not a smaller one on desktop
- on focus: accent border plus a soft accent ring

`Input`, `Textarea` and `AdminDatePicker`'s trigger all consume it. The date
popover moves off `bg-white` onto `--color-field` so it matches the trigger it
drops out of.

`inputClassName` is not re-exported from `Input.tsx` under its old name. It has
exactly one other importer — `AdminDatePicker` — so the import is moved rather
than aliased, and the class string ends up with one home.

The RichText fields inside the flashcard editor keep the `--card-*` palette.
They are painted that way because the teacher types directly into a
representation of the student's card; giving them admin chrome would break the
one thing that editor does.

## Tiles

`components/ui/Tile.tsx` is presentational: paper fill, `--card-line` border,
`--card-shadow` lift, serif title, mono eyebrow line beneath. Props are `href`,
`title`, `eyebrow`, and an optional `action` slot rendered at the right.

Three call sites: the student `/g/[slug]/pages` list, the admin Pages list, the
admin Groups list.

The title is the link, stretched over the whole tile with `after:absolute
after:inset-0`; the `action` slot sits at `relative z-10` above it. This is
because a tile needs two independent targets — open, and download — and an
anchor inside an anchor is invalid HTML that browsers repair by splitting the
element.

Using the `--card-*` palette in the admin area is a deliberate extension of
where that palette applies. The point of the Pages list looking like the
student list is that Jenn can see what she published without leaving the admin
screen. `CLAUDE.md` currently says the palette is scoped to `/g/[slug]`; that
sentence has to change with this.

The shared tile carries `--card-shadow`, which the student tiles do not have
today. On `/g/[slug]/pages` the background gradient runs darker than the paper,
so the border alone is enough; on the admin cream the two are within a
hair of each other and the tile would dissolve. Adding the shadow to both is a
smaller change than forking the component, and it matches the flashcard, which
has always had it.

## Pages tab

```
┌──────────────────────────────────────────┐
│  Verbes au passé                     ⬇   │
│  30 JUILLET 2026 · A1, ADOS              │
└──────────────────────────────────────────┘
```

Title links to `/admin/pages/[slug]`. The eyebrow is `formatLongDate(createdAt)`
followed by the group names, or "no groups" when there are none. Admin copy
stays in English throughout, as it is today — French is the students' side of
the site.
`listPagesForAdmin` starts selecting `createdAt` to supply the date.

The download control is `<a href="/p/{slug}/raw" download="{slug}.html">` with
an `aria-label` naming the page. It needs no server change: the `download`
attribute forces a save-as for a same-origin response, so the raw route keeps
its exact current behaviour and its CSP, and no new authenticated surface is
introduced. The route is public already — this adds no access that did not
exist.

Below the list, the create form (§ Page editor).

## Groups tab

The same tiles. Title is the group name linking to `/admin/[slug]`; eyebrow is
the card count and the student path, e.g. `12 CARDS · /g/a1`. The delete
control occupies the `action` slot and keeps the existing two-step confirm,
including its warning naming the number of cards that go with the group.

Below the list, the restyled "Add a group" form.

## Search

`lib/admin-search.ts`:

- `normalise(value)` — lowercase, then strip diacritics via
  `normalize("NFD").replace(/\p{Diacritic}/gu, "")`
- `filterPages(pages, query)` — matches title **or** any group name
- `filterGroups(groups, query)` — matches name or slug

An empty or whitespace-only query returns the input unchanged.

Diacritic stripping is the reason this is a lib module with tests rather than an
inline `includes`. Almost every page title Jenn writes has an accent in it, and
a teacher typing `passe` into a search box expects to find *Verbes au passé*.
The rule is one-directional by construction: both sides are normalised, so
`passé` also finds a page titled `passe`.

Filtering happens on the client over the already-loaded array. Both lists are
small enough that a round trip per keystroke would be slower than no round trip,
and the server component has already paid for the full list.

`components/admin/SearchField.tsx` renders the input (in the new field styling),
a clear button that appears once there is a query, and the count — "2 of 9" —
which is what tells her the list is filtered rather than empty. When a query
matches nothing, the panel says so and offers the clear button; it does not
render an empty list.

## Page editor

The `HTML source` textarea and the bare `<input type="file">` are both removed.

`components/admin/HtmlDropZone.tsx` replaces them: a labelled drop target that
also opens the file picker on click, showing the chosen file's name and size
once one is selected. It keeps both existing behaviours from `PageEditor` —
the `MAX_PAGE_BYTES` check with its message, and the `titleFromFile` rule where
a filename-derived title follows a swapped file but a typed title is never
overwritten.

The html string stays in `PageEditor`'s state exactly as it does now; the drop
zone simply never displays it. Opening an existing page and saving without
touching the file therefore re-submits the identical html, and
`app/page-actions.ts` needs no change. On the create form, where there is no
initial html, submit stays disabled until a file has been read.

Group assignment becomes pill toggles rather than bare checkboxes — real
`<input type="checkbox">` elements inside labels, visually hidden, with the
label styled as a pill that fills with `--color-accent-soft` when checked. The
control stays keyboard- and screen-reader-native; only its appearance changes.

Delete keeps its existing loading state and behaviour.

## Tests

- `tests/lib/admin-tab.test.ts` — `parseAdminTab` for each valid value, for
  `undefined`, and for an unrecognised string.
- `tests/lib/admin-search.test.ts` — empty query passes everything through;
  title match; group-name match; slug match; accent-insensitive match in both
  directions; case-insensitive match; no match returns empty.

Components and Prisma access stay untested, per the existing convention. The two
new pure modules are where the rules live.

## Documentation

`CLAUDE.md`:

- The styling section's claim that the `--card-*` palette is "scoped to
  `/g/[slug]`" becomes: scoped to the student card template and the shared list
  tile, which the admin lists use so the teacher sees what her students see.
- The routes table's `/admin` row gains the `?tab=` param.
- The uploaded-pages section notes that the admin editor no longer shows HTML,
  and that the round trip for a correction is download → edit → re-upload.

## Rejected

**Separate `/admin/groups` and `/admin/pages` routes.** Bookmarkable and
back-button-native, but three top-level screens for what is one workspace. The
tab strip keeps the whole admin area visible as one thing. `?tab=` preserves
bookmarking and the back button anyway, since it is still a URL.

**Keeping the HTML source behind an "Advanced" disclosure.** A closed
disclosure is still a thing she can open and be confused by, and the download
gives her the file in the editor she actually writes in. A disclosure would be
the better trade only if downloading were unavailable.

**A sanitiser or an HTML preview in the editor.** Out of scope, and the first
is deliberately absent from this codebase — see the uploaded-pages spec.
