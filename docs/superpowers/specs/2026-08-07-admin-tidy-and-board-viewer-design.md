# Admin tidy-up and the whiteboard viewer

2026-08-07

## Scope

This is the first of three specs. It holds four small changes. Two later specs
add the Flashcards tab and the Action items tab. Those two need a Prisma model
each. This one needs none.

| # | Change | Surface |
|---|---|---|
| 1 | Hide the Everyone group from the admin | `/admin`, and the edit overlay on `/g/[slug]` |
| 2 | Open a saved whiteboard in a viewer | `/g/[slug]?tab=board` |
| 3 | Put the shelf filters behind an icon | `/g/[slug]?tab=files`, `/f/[token]` |
| 4 | Close the edit overlay after a save | `/admin`, `/g/[slug]` |

Row 1 reaches `/g/[slug]` because `PageEditOverlay` renders `PageEditor` there,
and that form carries the audience pills.

There is **no schema change and no migration** in this spec.

---

## 1. Hide the Everyone group

### The problem

One group row carries `isEveryone`. On production it is `all` / "Everyone".
Jenn sees it in three places, and in all three it looks like a student:

- the Students tab lists it beside Marie and Luc;
- the Pages tab draws it as a filter chip beside the real students;
- the three audience forms draw it as a pill beside the real students.

It is not a student. It has no chat, no whiteboard, no password and no email.
`studentGate` refuses it in its first clause. A row that looks like a student
but answers to none of a student's rules is confusing.

### What changes

The row leaves the Students tab and the Pages tab chip row. It **stays** in the
audience forms, under a different label: *All students* / *Tous les élèves*.

That label is the whole decision. The row's job in the audience form is to name
an audience. Its job in the other two lists was to name a student, and it never
was one. The name comes from the dictionary, not from `Group.name`, so Jenn can
still rename the row in the database without changing what the form says.

### The module

`lib/audience.ts` is new. It holds three pure functions and has a test file.

```ts
visibleStudents(groups)                        // Students tab
audienceOptions(groups, allStudentsLabel)      // the three audience forms
visibleGroupChips(names, everyoneName)         // Pages tab chips
```

`audienceOptions` returns `{ id, label }[]`. It keeps the everyone row in place
rather than moving it to the front. The list is already sorted by name and a
second ordering rule would be one more thing to keep in step.

`visibleGroupChips` takes names, not rows. The Pages tab builds its chips from
`pageGroupNames(pages)`, which reads the names off the pages themselves, and
`filterPagesByGroup` matches on the name. The function matches that shape rather
than forcing the caller to convert.

### The call sites

| File | Change |
|---|---|
| `app/admin/page.tsx` | `GroupsTab` filters with `visibleStudents` |
| `components/admin/PageList.tsx` | filters `groupNames` with `visibleGroupChips` |
| `components/admin/AdminChrome.tsx` | its `groups` prop gains `isEveryone` |
| `components/admin/NewPageForm.tsx` | draws pills from `audienceOptions` |
| `components/admin/AddLinkForm.tsx` | draws pills from `audienceOptions` |
| `components/admin/PageEditor.tsx` | draws pills from `audienceOptions` |
| `app/page-actions.ts` | `loadPageForEdit` selects `isEveryone` |
| `lib/strings.ts` | adds `admin.audience.allStudents` |

### What does not change

No access rule moves. `chatRole`, `shelfRole`, `studentGate` and
`worksheetOpenable` all read `isEveryone` and all keep their present answers.
`effectivePages` still merges the shared shelf onto every student's shelf.
`canDeleteGroup` still refuses to delete the row. `/g/all` still renders.

`filterPagesByGroup` keeps its widening rule: a student's chip includes pages
shared with everyone, because a shared page is something that student has. That
rule matters more now, not less. It is how Jenn finds a shared page after the
everyone chip is gone.

### The accepted cost

The admin loses its only link to `/g/all`. Jenn must type the URL to see the
shared shelf as a shelf. This is accepted because the change exists to stop her
treating that shelf as a student. She can still find every shared page from any
student's chip, and she can still edit its audience from the tile's pencil.

`Page.sharedWithEveryone` stays in `listPagesForAdmin`. It drives the widening
above. Its comment in `lib/pages.ts` says it also drives "the tile's marker";
that marker does not exist in `PageList` today, and this spec does not add one.
Correct the comment.

---

## 2. Whiteboard viewer

### The problem

A saved board can only be downloaded. Both parties must leave the page, open a
file, and come back. The tile shows a thumbnail of page 1 and nothing else.

### What a board actually is

A board is **vector ops**, not a picture. `Whiteboard.thumbnail` is a JPEG of
page 1 alone. The download builds its image at the moment it is pressed, from
the ops, through `exportLayout` and `drawOps`.

`exportLayout` caps the canvas area. iOS Safari returns a blank canvas past
about 16.7M pixels. A board of ten pages is at that cap, so its pages are
already scaled down before anything is saved. Zooming into that image would show
the downscale, not the drawing.

So the viewer redraws the ops. It does not magnify a picture. Zooming in makes
the strokes sharper.

### The module

`lib/board-zoom.ts` is new. It holds three pure functions and has a test file.

```ts
fitScale(viewport, content)               // the opening scale
clampScale(scale)                         // between MIN_SCALE and MAX_SCALE
clampPan(offset, scale, viewport, content) // keeps the drawing on screen
```

`scale` is a multiplier of the fit, so `1` always means "the whole page is
visible" at every window size. `MIN_SCALE` is `1` and `MAX_SCALE` is `8`. There
is no zoom-out below the fit: a page smaller than its viewport has empty space
around it and nothing to look for in that space.

`clampPan` is the one with a real rule in it. Without it a drag can push the
drawing off the edge and leave an empty viewport, with nothing on screen to
explain how to get back.

### The components

**`components/whiteboard/BoardViewer.tsx`** is new and is a client component.

- It renders at `z-[60]` over the whole screen, and it calls `useOverlayLock`.
  That is the existing rule: `AddSheet` and `ChatPanel` already do this, so the
  two fixed corner buttons hide below `md` while an overlay is open.
- It fetches the scene once from `GET /api/whiteboard/[slug]/[id]`. That route
  is unchanged. It already authorises both parties through `chatRole`, and it
  already answers `private, max-age=3600`, which is safe because a saved board
  never changes.
- It draws one page at a time with the existing `BoardCanvas`. Page arrows move
  between pages. A board of one page draws no arrows.
- Drag pans. Wheel and pinch zoom. Buttons give minus, the current percentage,
  and plus. Escape closes.
- The canvas backing store is sized by `devicePixelRatio * scale` and is capped
  by `MAX_CANVAS_AREA`, reused from `lib/whiteboard-export.ts`. The same iOS
  limit applies here, and two copies of that number would drift.
- A failed fetch shows one sentence and keeps the download control reachable.

**`components/whiteboard/board-download.ts`** is new. It holds the stacked-JPEG
code that lives inside `BoardTile` today. The tile and the viewer both call it.
It is impure, so it is not in `lib/` — the same split
`components/pdf-thumbnail.ts` and `components/html-thumbnail.ts` already make.

**`components/whiteboard/BoardTile.tsx`** changes. The thumbnail becomes the
control that opens the viewer. *Télécharger* and *Supprimer* keep their place in
the tile's footer, and both do the same work as before — but their text now
comes from the dictionary, for the reason the next section gives.

### Access

Nothing new. The viewer reads the route that already exists, under the check
that already guards it. The everyone group has no `chatToken`, so it can have no
board, and `chatRole` refuses it before anything else.

### The whiteboard tab gets localised, and that is a deliberate widening

Every whiteboard component is hardcoded French today. There is no `locale` prop
anywhere in `components/whiteboard/`. The strings are *Nouveau tableau*,
*Aucun tableau pour l'instant !*, *Page N — Jenn dessine…*, *Télécharger*,
*Supprimer* and *Jenn dessine en ce moment*.

That is a gap against the standing rule: language follows the browser, on both
surfaces. It can be left alone, but not while adding a control beside it. A new
viewer reading the dictionary would draw *Close* and *Page 2 of 4* beside
*Télécharger*, and one tab in two languages is worse than either language alone.

So this spec threads `locale` through the board tab and moves those six strings
into `lib/strings.ts` beside the viewer's own. `app/g/[slug]/page.tsx` already
holds `locale` and already renders `BoardTab` and `LiveBanner`, so it passes the
value to both. `BoardTab` passes it to `BoardTile` and `BoardViewer`.

The viewer adds: a close label, a page counter, a zoom-in and a zoom-out label,
a reset-zoom label, and one sentence for a failed fetch.

Each component takes `locale: Locale` and calls `getStrings(locale)` itself. It
does **not** take a resolved `Strings` object. That object holds functions, and
React cannot serialize a function across the server/client boundary — the
failure is a runtime 500 with lint, types, tests and the build all green.

---

## 3. Shelf filters behind an icon

### The problem

The shelf stacks three control rows above the tiles: a search field, four kind
chips, and two sort chips. On a phone that is most of the first screen, above
the files the student came to open.

### What changes

Both chip rows go inside a block that is closed by default. A filter icon sits
beside the search field. Pressing it opens the block. The label *Filtrer par :*
appears above the rows.

The icon carries `aria-expanded` and `aria-controls`, and the block carries the
matching id.

The open state is local to the component. It is closed on every load, and it is
not written to the URL or to storage. The filters themselves already behave that
way — `query`, `kind` and `sort` are `useState` and reset on a reload — so the
disclosure follows the controls it holds.

**When the block is closed and a filter is active, the icon carries a dot.**
Without it, a filtered list is a short list with no visible cause, which reads
as a fault rather than as a filter.

### The module

`lib/shelf-filters.ts` is new, with a test file.

```ts
filtersAreActive({ kind, sort })   // true when either is not its default
```

The defaults are `kind: "all"` and `sort: "created"`. The function exists so the
dot's rule is stated once and tested, rather than written inline as two
comparisons that a third filter would silently miss.

### Where it applies

`components/student/FilesTab.tsx`, which serves both `/g/[slug]?tab=files` and
`/f/[token]`.

**It does not apply to the admin Pages tab.** That tab has a fourth row, the
student chips, and that selection does three jobs: it filters the list, it
decides which shelf a pin lands on, and it sets the default audience for a new
page. Folding it away would hide a control that does more than filter. The two
lists are meant to look alike, and this is a stated exception to that, not an
oversight.

### Strings

`student.files.filterBy` — *Filtrer par :* / *Filter by:*
`student.files.filterToggle` — the icon's accessible name.

---

## 4. Close the edit overlay after a save

### The problem

`PageEditor.handleSubmit` sets a *Saved* flag and refreshes the list. It never
closes anything. `PageEditOverlay` wraps that form in an `AddSheet`, so after a
save the sheet stays open over a list that has already changed behind it.

The same form is also the body of `/admin/pages/[slug]`, which is a page and has
nothing to close.

### What changes

`PageEditor` gains an optional `onSaved`.

- The html branch calls it **only when the skipped list is empty**.
- The pdf branch always calls it. `updatePdfPage` returns `void` and reports no
  skipped assets, so there is nothing that branch could withhold the close for.
- `PageEditOverlay` passes `onClose`.
- `/admin/pages/[slug]` passes nothing and keeps its *Saved* flag.

### Why skipped assets keep the sheet open

The skipped list is not stored. It exists only in the reply to that one save. If
the sheet closes over it, Jenn has no way to learn that a published page is
missing its images. `NewPageForm` already keeps its sheet open for exactly this
reason. This makes the two forms agree instead of adding a second rule.

### The thumbnail capture

Unchanged. `captureAndStoreThumbnail` is already fired without `await` and calls
`router.refresh()` when it stores something. It runs against the stored page
through its own route, so closing the sheet first does not affect it.

---

## Testing

Three new unit-test files, one per new `lib/` module:

- `tests/lib/audience.test.ts`
- `tests/lib/board-zoom.test.ts`
- `tests/lib/shelf-filters.test.ts`

Components are not unit-tested here. That is the standing convention: the pure
modules underneath them are tested, and Prisma access is not.

`tests/lib/everyone.test.ts` is unchanged. `canDeleteGroup` and the two
constants keep their present behaviour.

Before the work is called done, run the CI order: `npx prisma generate`,
`npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.

## Out of scope

The Flashcards tab and the Action items tab. Each gets its own spec, and each
needs a Prisma model and a migration that this spec deliberately avoids.
