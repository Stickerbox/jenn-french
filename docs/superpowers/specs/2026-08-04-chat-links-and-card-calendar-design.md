# Chat links on the shelf, a card calendar, and three withheld controls — design

2026-08-04

## Baseline

This spec is written against a tree in which every spec dated on or before
2026-08-04 is built. Specifically:

- **`2026-08-04-chat-inbox-design.md` is built.** `components/chat/TeacherInbox.tsx`
  renders on `/admin`, `/admin/pages/[slug]` and `/g/[slug]`, owns the
  `StreamProvider`, and its `InboxFab` sits at `bottom-6 right-4`.
- **`2026-08-04-teacher-ergonomics-design.md` is built.** `/g/[slug]` carries the
  *← Back to admin* link, `teacherPageLabel`, the suppressed `LiveBanner`, and
  `PdfPreview`'s cached first-page JPEG.
- **`2026-08-03-student-login-design.md` is built.** `lib/student-gate.ts` decides
  six states; `unlocked` is `gate === "signed-in"`.
- **`2026-08-02-shelf-fabs-and-student-page-fixes-design.md` is built.**
  `ShelfFab` sits at `bottom-6 right-24`, left of the student's `ChatFab`.
- **`2026-08-03-page-pdf-support-design.md` and
  `2026-08-03-inlining-page-assets-design.md` are built.**

Nothing in this spec requires a migration. No column is added, dropped or
changed.

## Problem

Five asks from the person who uses this every day. They are one spec because
three of them are the same shape — *the UI withholds something the server
already permits* — and because items 1 and 4 are the two ends of one loop: the
first creates link rows on shelves automatically, and the second is the only way
to get rid of one.

1. **A link shared in the chat stays in the chat.** Jenn pastes a Google Doc into
   a lesson conversation, the student reads it that evening, and next week
   neither of them can find it: it is somewhere in a scrolling log. The shelf is
   the thing that exists to hold it, and adding it there is a second deliberate
   gesture that nobody makes.

2. **The teacher is offered *Se déconnecter* on a student's page.** `studentGate`
   returns `signed-in` for Jenn-with-a-token, so `StudentAuthPanel` renders in
   its signed-in mode and shows a student's sign-out control to the teacher. It
   is not merely mislabelled: `signOutStudent` clears **the student's** cookie
   for that slug, which is what `unlocked` is derived from — so pressing it drops
   her out of *Les fichiers* and *Le tableau* on the page she is standing on,
   with no way back but the admin.

3. **The `+` button is invisible on `/admin`.** `AdminChrome`'s `Fab` is at
   `bottom-6 right-4 z-50`. `InboxFab`'s is at `bottom-6 right-4 z-50`. Both are
   `fixed`, `<TeacherInbox />` renders after `<AdminChrome>` in
   `app/admin/page.tsx`, so the chat bubble paints over the `+` exactly. The one
   control that adds a student, a link or a page is unreachable on the screen
   that lists all three.

4. **A link cannot be deleted.** The admin's only delete control is
   `PageEditor`'s *Delete page*, reached from a tile's pencil.
   `app/admin/pages/[slug]/page.tsx` deliberately 404s on a link row — a link has
   no document to edit — and `PageList` therefore hides the pencil for links. So
   a PDF and an HTML page can be deleted and a link cannot, anywhere in the
   admin. The gap is in the UI alone: `deletePage` is a plain teacher-only
   delete that has never cared what kind a row is.

5. **A student can only see this week.** `WeekDayPicker` computes its five days
   from `today` and offers no way to reach another week, so a card posted last
   Tuesday is gone the moment Monday arrives. The week-range line above it also
   reads `weekRange(today)` rather than the selected week, so it could not
   describe another week even if one were reachable.

## 0 · Shared plumbing

Three pieces are introduced for item 5 and named here because two of them change
files the other items also touch.

### `lib/week.ts` — `mondayOf` and `weekDates`

```ts
export function mondayOf(date: Date): Date;
export function weekDates(date: Date): Date[]; // five, Monday → Friday
```

`weekRange` is rewritten in terms of `mondayOf`. The arithmetic
`dayOfWeek === 0 ? 6 : dayOfWeek - 1` currently exists three times — in
`weekRange`, in `monthWeekdayRows`, and in `WeekDayPicker`'s private
`currentWeekDates` — and each copy carries the same comment explaining that a
Sunday belongs to the week that just ended. Two of the three collapse here.
`lib/month-grid.ts` is deliberately **left alone**: it steps over weekends as it
walks and has its own tests, and rewriting a tested module to save four lines is
not what this change is for.

`weekDates` is the point of the extraction. `currentWeekDates` took `today`;
`weekDates` takes any date, which is the whole of "the strip shows the selected
week".

### `lib/card-dates.ts` — which days a student may open

```ts
export function isSelectableCardDate(
  date: string,
  input: { cardDates: ReadonlySet<string>; latest: string },
): boolean;
```

`date <= latest && cardDates.has(date)`. Both halves are load-bearing and the
first is not redundant with the query that produces `cardDates`: the calendar can
page into next month, and a cell there must be dead even though no card date was
shipped for it. ISO-8601 dates compare correctly as strings, which is why this is
a comparison and not a `Date` round trip.

### `components/ui/MonthCalendar.tsx` — the panel, not the picker

The popover **body** extracted from `AdminDatePicker`: the month stepper, the
five-column weekday grid built from `monthWeekdayRows`, and the
selected/today/out-of-month/disabled styling.

```ts
export type CalendarTone = "admin" | "card";

export function MonthCalendar(props: {
  selected: string;
  today: string;
  locale: string;                       // aria-labels only
  tone: CalendarTone;
  labels: {
    dialog: string;
    previousMonth: string;
    nextMonth: string;
    monthNames: readonly string[];
    weekdays: readonly string[];        // full names; the grid shows initials
  };
  // Undefined means every teaching day is selectable, which is the admin's
  // rule: pre-posting ahead is Jenn's workflow and clamping would make those
  // days unreachable from /admin.
  isEnabled?: (date: string) => boolean;
  onChoose: (date: string) => void;
  className?: string;                   // position, as Fab takes its position
}): ReactNode;
```

`tone` and `labels` rather than a locale switch, following `KindFilter` and
`FilterChip`: a component that knows both palettes and both languages is a
component that has to be edited to add a third. `className` carries position for
the reason `Fab`'s comment gives — there are two placements and each is one
Tailwind pair.

It owns the month cursor, seeded from `selected` on mount. Both callers render it
as `{open && <MonthCalendar … />}`, so mounting *is* the seeding, and
`AdminDatePicker`'s current re-seed inside `toggle()` is deleted rather than
moved: it existed only because the panel never unmounted.

**Open/dismiss state stays with each caller**, duplicated. That is deliberate.
The two triggers are a labelled admin field and a French week-range line, and
each restores focus to its own trigger ref on Escape and on choose; sharing that
would mean handing the ref back out through a render prop, which is more
machinery than the twenty lines it saves. The panel is shared, the wiring is not.

`AdminDatePicker` keeps its trigger, its formatting, its `en-CA` locale and its
`basePath` push, and loses only the panel markup. Its behaviour must not change
in any visible way — no `isEnabled`, no new props, same classes.

## 1 · A link in the chat becomes a link on the shelf

### `lib/chat-links.ts` (pure)

```ts
export const MAX_LINKS_PER_MESSAGE = 5;

export function extractLinks(body: string, max?: number): string[];
```

Finds `https?://…` runs, trims trailing punctuation, hands each to the existing
`parseLinkUrl`, keeps the ones it accepts, de-duplicates on the normalised
string, and returns at most `max`.

Four decisions inside it:

- **`parseLinkUrl` is reused, not re-implemented.** It is already the one guard
  between a student's typing and an `href`, and it rejects every scheme but http
  and https. A second URL validator beside it is a second place for
  `javascript:` to get through.
- **A scheme is required.** `parseLinkUrl` prefixes `https://` onto a
  scheme-less string, which is right for a field labelled *Adresse du lien* and
  wrong for prose: every `mot.Ensuite` and `3.Regarde` in a French sentence
  looks like a hostname. Requiring `http://` or `https://` in the message is the
  difference between a feature and a shelf full of garbage. The cost, accepted:
  a student who types a bare `www.tv5.ca` gets no shelf row.
- **Trailing punctuation is stripped**, because a URL at the end of a sentence is
  the common case and `…/verbes.` is a 404. The set is
  `` . , ; : ! ? ' " » … ] } `` and — conditionally — `)`, stripped **only when
  the URL contains no `(`**, so a Wikipedia link survives. Accepted
  imperfection, in the register of `titleFromUrl`'s note about short all-letter
  ids: a URL that genuinely ends in a full stop is mangled, and nothing here can
  tell the two apart.
- **Five per message.** `MAX_MESSAGE_LENGTH` is 4000 characters, which is room
  for dozens of URLs, and anyone holding a student's token could otherwise turn
  one POST into forty page rows. The cap is the same kind of bound as
  `MAX_REPLAY` and `MAX_PDF_BYTES`: not a guess about real use, a ceiling on
  abuse. Links past the fifth are dropped silently — there is no channel to
  report them on and the message itself still carries every one of them.

### `lib/shelf-links.ts` (Prisma)

```ts
export async function addChatLinks(input: {
  groupId: string;
  body: string;
  fromTeacher: boolean;
}): Promise<string[]>;                   // the slugs created, in order
```

For each extracted URL: skip it if a `link` row with that exact `url` already
reaches this shelf; otherwise `savePage({ slug: null, kind: "link", title:
titleFromUrl(url), url, groupIds: [groupId], addedByStudent: !fromTeacher })`.

- **"Already reaches this shelf" includes the everyone group**, not just this
  group's own rows — `listPagesForGroup` merges both sets through
  `effectivePages`, so a link Jenn put on the shared shelf is already on this
  student's, and adding a second copy on re-share would show the same URL twice
  in one grid. One `findFirst` with
  `groups: { some: { OR: [{ groupId }, { group: { isEveryone: true } }] } }`.
- **The existing row is left completely alone** — its `createdAt`, its pin, its
  `addedByStudent`. Re-sharing a link is not a reason to reorder somebody's
  shelf.
- **`addedByStudent` mirrors the sender.** This is not cosmetic: it is exactly
  what `canStudentDelete` reads, so a link the student shared is one they can
  remove and a link Jenn shared is not. It is also why this module cannot simply
  call `addShelfLink` — that action derives the flag from `shelfRole` reading
  cookies, and this caller has already resolved the role.
- **It never throws.** Each URL is attempted inside its own `try`, and a failure
  is dropped. The same degrade-rather-than-throw contract as `readSections`,
  `readOps`, `readPageKind` and `inlinePage`'s `skipped`: a message must not fail
  because a link in it could not be filed.

### `app/api/chat/[slug]/route.ts`

After `createMessage`, before the `201`:

```ts
try {
  const added = await addChatLinks({
    groupId: group.id,
    body,
    fromTeacher: role === "teacher",
  });
  if (added.length > 0) {
    revalidatePath("/g/[slug]", "page");
    revalidatePath("/f/[token]", "page");
    revalidatePath("/admin");
  }
} catch {
  // Swallowed. The message is stored and published; the shelf is a
  // convenience laid on top of it and must never be able to fail a send.
}
```

Four properties of that placement:

- **After the write, never before.** Same ordering rule `createMessage` states
  about `chatBus.publish`: nothing observable may exist for a message the
  database did not store.
- **Awaited, not fire-and-forget.** It is one indexed `findFirst` and one insert
  against a local SQLite file, and `revalidatePath` after the response has gone
  out does nothing. The latency is the correct price.
- **The everyone group is refused for free.** `chatRole` returns `null` for it
  before it checks anything else, so the route has already 404ed and no
  auto-shelved link can ever land on the shared shelf.
- **`revalidatePages` cannot be reused, and the next reader will try.**
  It is private to `app/page-actions.ts`, and that file is `"use server"` — every
  export from it becomes a callable server action endpoint, so a shared helper
  cannot live there. The two `revalidatePath` calls are repeated here with this
  reason written beside them.

The shelf therefore updates on the next navigation to it, not live. A student
sitting **on** *Les fichiers* when a link arrives will not see it until they move.
Accepted: pushing it live means a new named SSE frame — with the no-`id:`
discipline board frames follow, so it cannot corrupt the chat's replay anchor —
plus client state for a grid that is currently pure server-rendered HTML. That is
a larger change than the feature is worth, and the tab switch is a `next/link`
navigation, which is the gesture this case actually consists of.

Two things this deliberately does not do. **The chat bubble still renders the URL
as plain text** — `MessageList` prints `{message.body}` and linkifying it is a
separate change to a component whose every date resolves in the reader's zone.
And **nothing tells either party a link was filed**; the tile appearing on the
shelf is the feedback.

## 2 · No student sign-out for the teacher

`studentGate` is **not touched**. Its clause order is the specification, `unlocked`
is derived from it, and the fix does not need a seventh state.

`lib/student-gate.ts` gains the panel's own rule instead:

```ts
export type AuthPanelMode = Extract<StudentGate, "signup" | "login" | "signed-in">;

export function authPanelMode(
  gate: StudentGate,
  isTeacher: boolean,
): AuthPanelMode | null;
```

`null` for a teacher, whatever the gate says; `null` for `unclaimed` and
`teacher-stale`, which `app/g/[slug]/page.tsx` renders itself because they name
the student; otherwise the gate value.

`AuthPanelMode` **moves here** from `components/student/StudentAuthPanel.tsx`,
which imports it back. The type was already `Extract<StudentGate, …>` — it has
always belonged beside the thing it extracts from, and now the function that
produces it lives there too, in the module whose test already enumerates every
state.

The page's three-way condition becomes one call:

```ts
const panelMode = authPanelMode(gate, viewerIsTeacher);
…
{panelMode && <StudentAuthPanel slug={slug} mode={panelMode} />}
```

`signup` and `login` were already unreachable for a teacher — clauses three and
four of the gate catch her first — so `signed-in` is the only mode this actually
withholds. The comment records why it matters rather than what it does:
`signOutStudent` clears the student's cookie, which is the thing `unlocked` reads,
so the control she was being offered would have locked her out of the two tabs
she came for.

## 3 · The `+` moves left of the chat bubble

`AdminChrome`'s `Fab` className: `bottom-6 right-4` → `bottom-6 right-24`.

That is the change. The comment points at `ShelfFab`, which made this exact
decision for this exact reason on the student page: side by side, neither button
ever covers the other and neither has to move; stacked, the upper one sits
where the open panel goes.

`AddMenu` stays at `bottom-24 right-4`, matching `ShelfFab`, where the menu
also hangs above the chat button rather than above its own trigger. It is 180px
wide and spans both buttons' columns either way, and changing it here would put
the admin and the student page out of step for no visible gain.

`/admin/pages/[slug]` keeps no `+`: it has no `AdminChrome`, and adding one there
means querying the group list on a screen that does not need it and deciding
where *Add a page* should land when you were already editing one. Out of scope
by decision, not oversight.

## 4 · A delete for links

### The admin tile

`PageList` gains a required `onDelete: (slug: string) => Promise<void>`, wired
through `PagesTabClient` from the existing `deletePage`. The action slot's
`page.kind !== "link"` guard becomes a ternary:

```
link  →  delete
else  →  pencil, download
```

A `TrashIcon` joins `PencilIcon` and `DownloadIcon` in the same file, drawn in
the same stroke idiom, and the button uses `tileActionClass` like its siblings.

This is not an inconsistency with the comment already at `PageList.tsx:251` —
*"A link has no document to edit or download, so it gets neither control rather
than two that fail"* — it is that sentence's third clause. The link tile trades
the two controls it cannot use for the one it can.

**No confirmation dialog**, matching `PageEditor`'s *Delete page*, which is also
a bare button. A link is a URL and a derived title; re-adding one is a paste.

`deletePage` needs no change: it is already `requireTeacher`, already
`deleteMany` so a double-click is a no-op, and already revalidates `/admin`.

### The student page shelf

`FilesTab` gains `canDeleteAny?: boolean`, false by default, and renders the ×
when `page.addedByStudent || canDeleteAny`. `app/g/[slug]/page.tsx` passes
`viewerIsTeacher`.

`deleteShelfLink` already permits this and has since it was written — *"The
teacher may remove anything; a student may remove only their own link"* — so this
adds no authority, it stops the UI withholding it. Every row rather than link
rows only: she can already pin anything on this shelf, and a delete that
applies to some tiles and not others is a rule to explain where there is no rule.

Item 1 is what makes it matter. Chat will now deposit rows with
`addedByStudent: false` onto student shelves, which is precisely the set she
could not remove from the page she is looking at.

`/f/[token]` is unaffected: it passes `canWrite={false}` and no `onDeleteLink`,
so the action slot does not render at all, and the new prop defaults to false.
`filesToken` addresses a shelf and must not carry the power to write to it.

## 5 · The student's card calendar

### The query

`lib/cards.ts` gains:

```ts
export async function listCardDates(upTo: Date): Promise<string[]>;
```

`GlobalCard.date` where `date <= upTo`, newest first, as `YYYY-MM-DD` strings.

The bound is applied **in the query**, with `latestViewableDate(today)` as
`upTo`, so the dates of pre-posted cards never reach the browser. Students must
not read ahead, and shipping tomorrow's date to a client that then greys the cell
out would still be telling them a card exists. `isSelectableCardDate` re-checks
the same bound as a second layer, because the calendar can page into a month the
query said nothing about.

This is a new function, not a resurrection: `getArchiveDates` and
`mergeArchiveDates` were deleted on 2026-07-31 because they queried the dropped
`Card` table. `GlobalCard` is the table that remains and this reads only it.

Sizing, so the next reader does not have to work it out: one row per teaching
day is about 260 strings a year, roughly 2.6 KB in the RSC payload, and it makes
the enabled-day rule a pure function of props with a test. If the archive ever
grows past the point where that is silly, the shape to reach for is a server
action fetching one visible month at a time — not a cap, which would silently
make old cards unreachable.

`app/g/[slug]/page.tsx` calls it only when `tab === "card"`. An unlocked teacher
has no card tab, so her page does not run this query at all.

### `components/student/CardDateNav.tsx` (client)

Replaces `components/WeekDayPicker.tsx`, which is **deleted** — the student page
is its only caller — and takes the week-range line over from `CardHeading`, which
keeps the ⚜ eyebrow and loses both props.

```ts
export function CardDateNav(props: {
  slug: string;
  selected: string;    // the date the page resolved to
  today: string;       // real today, for the calendar's "today" marker
  latest: string;      // latestViewableDate(today)
  cardDates: string[];
}): ReactNode;
```

**`latest` does two jobs and is deliberately one prop.** It is where
*Aujourd'hui* goes, and it is the ceiling `isSelectableCardDate` compares
against. They are the same date because they are the same rule — the latest day
a student may look at — and passing it twice under two names would let a future
edit change one and not the other.

`selected`, `today` and `latest` cross the boundary as `YYYY-MM-DD` strings, not
`Date`s, matching `AdminDatePicker` and `MonthCalendar`. `CardDateNav` parses
`selected` to UTC midnight once, at the top, for the two calls that need a
`Date` — `weekRange` and `weekDates`. Everything else stays string comparison.

It renders three things, in this order:

1. **The week-range trigger** — the `formatWeekRange` of the **selected** week,
   in place of the line `CardHeading` used to draw from `weekRange(today)`.
   Opening it shows `MonthCalendar` with `tone="card"`, `locale="fr-CA"`, and
   `isEnabled` closing over `cardDates` and `latest`. Choosing a day pushes
   `/g/${slug}?date=${date}` with `{ scroll: false }`, exactly as the strip does
   today.
2. **`Aujourd'hui`** — pushes `latest`, and is `disabled` with `opacity-40` when
   `selected === latest`, the pattern `PageList`'s pin button already uses for a
   control that is present but inapplicable.
3. **The five dots** for the selected week, unchanged in appearance, each
   `disabled` when `isSelectableCardDate` says no.

Three details that are easy to get wrong:

- **A selected day with no card still draws as selected.** `isSelected` styling is
  checked before the disabled styling, and `disabled` is set from selectability
  alone. This state is reachable two ways and both are intended: *Aujourd'hui* on
  a weekday Jenn skipped, and a hand-typed `?date=`. The existing *"Nothing
  posted yet — check back soon!"* is what the card slot shows, and it stays.
- **`Aujourd'hui` on a Saturday goes to Friday, and that is correct.**
  `latest` is `latestViewableDate(today)`, which `lib/week.ts` already snaps
  back to the Friday that closed the week, and `parseDate` clamps `?date=` to the
  same value. Pushing the real Saturday would be clamped straight back, so the
  button would appear to do nothing. Both weekend days behave this way; a
  teaching day with no card behaves as the bullet above describes.
- **Everything stays UTC.** All of the arithmetic here is
  `getUTC*`/`Date.UTC`, so this client component renders identically on both
  sides of hydration. `lib/chat-time.ts` remains the only module in this project
  that reads a local zone, and nothing in this one may follow it.

### Month names stay English

The card page's range line already reads `JULY 27 → JULY 31, 2026`, from the
uppercase English `MONTHS` in `lib/week.ts`, under a French eyebrow. The popover
is handed the same array, so its header agrees with the trigger that opens it.

French month names here would make the panel disagree with the line it hangs off,
and fixing that properly means localising `formatWeekRange` and its tests and
every other date on the page. That is a separate change and is explicitly not in
this one.

## 6 · Tests

Following the convention that anything with a rule in it is a pure function in
`lib/` with a test in `tests/lib/`, and that components and Prisma access are not
unit-tested:

- **New `tests/lib/chat-links.test.ts`** — a bare URL; one inside a sentence; a
  trailing full stop, comma and closing quote; a parenthesised URL and a
  Wikipedia URL containing `(`; two URLs in one message; the same URL twice in
  one message; more than five; `javascript:alert(1)`; a bare `www.tv5.ca`
  returning nothing; a URL past `MAX_URL_LENGTH`; a message with no URL.
- **New `tests/lib/card-dates.test.ts`** — a date with a card; without one; one
  past `latest` that *has* a card; the boundary date itself.
- **Extended `tests/lib/week.test.ts`** — `mondayOf` on each of the seven
  weekdays, including both weekend days snapping back; `weekDates` returning five
  consecutive Monday–Friday dates for a date anywhere in the week; the existing
  `weekRange` assertions unchanged, which is what proves the rewrite is a
  refactor.
- **Extended `tests/lib/student-gate.test.ts`** — `authPanelMode` for every
  `StudentGate` value crossed with both values of `isTeacher`.

`lib/shelf-links.ts` and `listCardDates` touch Prisma and so are not unit-tested,
like `lib/pages.ts` and `lib/inbox.ts`. The rule inside the first of them —
which URLs it is asked about — is `extractLinks`, which is.

CI order stands: `prisma generate` → lint → `tsc --noEmit` → test → build.

## 7 · Files

**New**

- `lib/chat-links.ts`
- `lib/shelf-links.ts`
- `lib/card-dates.ts`
- `components/ui/MonthCalendar.tsx`
- `components/student/CardDateNav.tsx`
- `tests/lib/chat-links.test.ts`
- `tests/lib/card-dates.test.ts`

**Deleted**

- `components/WeekDayPicker.tsx`

**Modified**

- `lib/week.ts` — `mondayOf`, `weekDates`; `weekRange` rewritten in their terms
- `lib/cards.ts` — `listCardDates`
- `lib/student-gate.ts` — `AuthPanelMode`, `authPanelMode`
- `app/api/chat/[slug]/route.ts` — the `addChatLinks` call and its revalidation
- `app/g/[slug]/page.tsx` — `authPanelMode`; `listCardDates`; `CardDateNav` in
  place of `WeekDayPicker`; `canDeleteAny` on `FilesTab`; `CardHeading` propless
- `app/admin/page.tsx` — `deletePage` passed to `PagesTabClient`
- `components/admin/AdminChrome.tsx` — the `Fab` className
- `components/admin/AdminDatePicker.tsx` — panel replaced by `MonthCalendar`
- `components/admin/PageList.tsx` — `onDelete`, `TrashIcon`, the action ternary
- `components/admin/PagesTabClient.tsx` — `onDelete` passthrough
- `components/student/CardHeading.tsx` — eyebrow only
- `components/student/FilesTab.tsx` — `canDeleteAny`
- `components/student/StudentAuthPanel.tsx` — imports `AuthPanelMode`
- `tests/lib/week.test.ts`, `tests/lib/student-gate.test.ts`

## 8 · Rejected

- **A seventh `studentGate` state for the teacher.** `unlocked` is
  `gate === "signed-in"` and is what gates the Files and Whiteboard tabs; adding
  a state she falls into instead would have to be added to that comparison too,
  in a rule whose clause order is documented as the specification. A predicate
  beside the gate changes nothing and is testable in the same table.
- **Linkifying chat messages.** A real improvement and a different change:
  `MessageList` is inside the tree where every timestamp resolves in the
  reader's zone, and it is not what "put the link on the shelf" asks for.
- **Live shelf updates over SSE.** Costed in section 1. The tab switch is a
  navigation, which is the gesture the case consists of.
- **`extractLinks` accepting scheme-less hosts.** Prose is full of things that
  look like hostnames.
- **Sharing the popover's open/dismiss wiring.** Two different triggers and two
  different focus targets; sharing it needs a render prop to reach the trigger
  ref, which is more machinery than twenty duplicated lines.
- **A per-visible-month card-date query.** Named as the shape to reach for if the
  archive ever justifies it. Today it would be three moving parts where one
  array does.
- **Deleting a link behind a confirmation.** `PageEditor` does not confirm, and
  re-adding a link is a paste.
- **`+` on `/admin/pages/[slug]`.** Section 3.
- **French month names in the popover.** Section 5; it would need the whole card
  page's dates localised to be an improvement rather than a new disagreement.
