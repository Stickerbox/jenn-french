# Activity summary, student cards and notification dots

Date: 2026-08-07

Jenn teaches several students and each one has five surfaces: a chat, a shelf,
a deck, a checklist and a whiteboard. Nothing tells her which of them changed.
She opens each student in turn and reads every tab to find out.

This adds one answer, on three surfaces:

1. Each student's row in `/admin?tab=groups` becomes a card carrying a short
   bullet list of what changed and what is owed.
2. The tabs on `/g/[slug]` carry a dot when the other party has added something
   the reader has not seen.
3. Each tile on the Files tab carries the same dot, for the same reason.

All three read one model. The dot on a tab is true when any tile under it is
true, derived from the same function, so a tab cannot claim work that no tile
shows.

## The mechanism: a watermark, not a flag per row

`Group.teacherLastReadAt` already exists and already works this way. It is one
timestamp, and the unread count is the student's messages newer than it. This
follows it rather than inventing a second mechanism beside it.

The rejected alternative was a `viewedByTutor` boolean on each row, set from an
`IntersectionObserver` as tiles scrolled into view. It is more exact — it
survives a visit that never reached the bottom of the list — and it costs:

- a column on four tables, and a `viewedByStudent` twin on each for surface 3,
  because a per-tutor flag cannot answer a question the student is asking;
- a second write-on-read path, batched from the browser, on four surfaces;
- scroll position deciding what Jenn is told next time.

`markFlashcardViewed` is currently the only write-on-read in this codebase and
its own comment explains why it refuses the teacher. Adding four more, in both
directions, to avoid six nullable columns is the wrong trade at this size.

**The counting lives behind one pure function.** Every surface calls
`countUnseen`. If the exactness ever matters more than the cost, the mechanism
changes inside `lib/unseen.ts` and the query that feeds it, and no card, tab or
tile component learns about it.

## Schema

### `Group` gains six watermarks

```prisma
teacherSeenFilesAt DateTime?
teacherSeenDeckAt  DateTime?
teacherSeenTodoAt  DateTime?
studentSeenFilesAt DateTime?
studentSeenDeckAt  DateTime?
studentSeenTodoAt  DateTime?
```

Six and not three. Surface 3 is the mirror of surfaces 1 and 2: the student
asks the same question about Jenn that Jenn asks about the student. One column
per (party, surface) keeps the two sides symmetric and keeps every count a
comparison against a single value.

Null means "has never looked", exactly as `teacherLastReadAt` does. For a
student created after this ships that is correct — they have no rows yet.

**The migration sets all six to the migration time for rows that already
exist.** Without that, the first render tells Jenn she has 47 new flashcards,
all of them written by her, months ago. A feature whose first impression is a
wrong number is one she will learn to ignore.

There is deliberately no `studentSeenChatAt`. The chat FAB already carries its
own unread dot and stores its state per device in `localStorage` under
`chat-seen:<slug>`. A second mechanism for one number is two things that can
disagree — the reason `unreadCounts` was removed when `listConversations`
absorbed it.

### `Flashcard` gains `fromTeacher Boolean @default(false)`

Either party may add a card and nothing recorded which. Without an author a dot
cannot mean "the other party added this", so a student's own card would light
their own tab.

`ActionItem.fromTeacher` is the model to copy, including how it is written:
from the role the guard resolved, never from an argument. A client that can
name its own author can put words in Jenn's mouth on a surface she shares.

The default exists only to admit the rows already in the table. Every writer
sets it explicitly, and the migration's watermarks mean the wrong default is
never read for an existing row.

### `ActionItem` gains `doneByTeacher Boolean?`

`doneAt` records when a row was ticked, not who ticked it, and either party can.
Without this, Jenn ticking her own item counts as the student completing work.

Null when the row is open. A nullable boolean rather than a second timestamp:
`doneAt` already answers *when*, and two clocks on one transition is the
mistake `sentAt` records under *Worksheet versions*.

### `WorksheetOpen` is new

```prisma
model WorksheetOpen {
  pageId   String
  groupId  String
  page     Page  @relation(fields: [pageId], references: [id], onDelete: Cascade)
  group    Group @relation(fields: [groupId], references: [id], onDelete: Cascade)
  openedAt DateTime @updatedAt

  @@id([pageId, groupId])
}
```

**This is a separate row because `PageVersion.openedAt` does not work, and the
reason should be recorded before someone tries it again.**

A student who opens a worksheet and saves nothing has no `PageVersion` row.
Stamping an `openedAt` there means creating an empty slot, and three existing
rules read *row existence* as "this party has saved something":

| Rule | File | What an empty row breaks |
|---|---|---|
| `visibleSlots` | `lib/worksheet-slots.ts` | Jenn gets a *Marie's answers* tab holding nothing |
| `sendState` | `lib/worksheet-send.ts` | the student's Send moves `empty` → `ready` with nothing to send |
| `shelfSlotCount` | `lib/page-versions.ts` | the shelf badge appears before any work exists |

It would also break this feature's own *not yet handed in* bullet, which reads
the same row. The worksheet rules already record that the badge counting the
blank "was right while both parties saw three tabs, and became a lie" the day
the student dropped to one copy. This is the same class of lie.

The three-slot rule is enforced by `@@unique([pageId, groupId, fromTeacher])`
at the database level, and that is exactly what makes row existence worth
trusting. An open is a visit, a version is content, and the two have different
lifetimes. They get different rows.

**The write happens on the gated worksheet route only** —
`/g/[slug]/w/[pageSlug]` — never on public `/p/[slug]`. That route is public
and shared across students, so it has no student to attribute a visit to.

The consequence, stated plainly: opening a **link** or a **PDF that is not a
worksheet** is not recorded. "Opened X document" in the original request is
therefore narrower than asked — it covers homework, which is the document whose
opening Jenn actually acts on.

## Pure modules

Three, each with a test, following the convention that anything with a rule in
it is a pure function in `lib/` with a test in `tests/lib/`.

### `lib/unseen.ts`

```
countUnseen(rows, seenAt, viewerIsTeacher) → number
```

Rows newer than the watermark, authored by the **other** party. A null
watermark counts everything.

The author filter is the whole point and it is the rule chosen over the
simpler alternative: a dot means *something happened that you have not seen*,
so your own upload must not light your own tab. Every row this counts already
carries an author — `Page.addedByStudent`, `PageVersion.fromTeacher`,
`Flashcard.fromTeacher`, `ActionItem.doneByTeacher` — so this is a filter and
not a column.

It also exports `pageIsUnseen(page, seenAt, viewerIsTeacher)`, true when since
the watermark the other party added the page, saved a version to it, or changed
its content. **The Files tab dot is `pages.some(pageIsUnseen)`, not a separate
count.** A tab claiming work that no tile shows is the failure the worksheet
rules name directly: deriving badge, tabs and count from one module is the fix.

A content change (`Page.updatedAt`) has no author column, and needs none: only
`updatePage`, `updatePdfPage` and `updatePageMeta` write it and all three are
`requireTeacher()`. An update is always Jenn's, so it lights the student's tile
and never her own.

**One tile, one dot, and the count matches.** *N new files* counts tiles, not
events: a page that was added and then had a version saved to it is one unseen
file, not two. The count is `pages.filter(pageIsUnseen).length` and the tab dot
is `pages.some(pageIsUnseen)` — the same predicate three times, which is what
stops the card, the tab and the shelf disagreeing.

**The shelf counted is the effective one**, from `listPagesForGroup`, so a page
Jenn assigns to the everyone group lights a dot on every student's Files tab.
That is correct: it is new to each of them, and inheritance is invisible to
callers by design. It also means one such page shows on every card at once,
which is the intended reading of "I shared something with the class".

### `lib/homework-status.ts`

One worksheet on one shelf resolves to exactly one state:

| State | Condition |
|---|---|
| `not-opened` | no `WorksheetOpen` row |
| `started` | opened, nothing handed in |
| `awaiting-correction` | handed in, no newer teacher version, **under 7 days** |
| `settled` | corrected, or handed in over 7 days ago |

The states are disjoint by construction, so the three bullets built from them
can never double-count one worksheet.

**The 7-day expiry is the one rule here that is about Jenn's real week rather
than about data.** *Awaiting correction* is a task, not news: it must not clear
because she glanced at the card, or an interruption spends the only signal that
Marie is waiting. But she often corrects live in the lesson and files nothing,
and a task that never clears becomes a permanent red mark she stops reading.
Seven days is the compromise, held as one named constant in this module.

It is a plain elapsed-time comparison in milliseconds. It deliberately does
**not** use `lib/week.ts`: that module answers which teaching day a card belongs
to, and this is a duration. There is no zone in it and no weekend rule.

### `lib/student-summary.ts`

Facts in, an ordered list of `{key, count}` out. **Keys, not sentences** —
`lib/page-sections.ts` sets that precedent, and here the words are French or
English by `Accept-Language`.

Order, most-owed first:

1. unread messages
2. homework to correct
3. homework started, not handed in
4. homework not opened
5. new flashcards
6. new files
7. action items done

A student with nothing returns an empty list and the card draws one muted line.

**No cap.** The seven are disjoint and rarely exceed three. A silent "+2 more"
hides exactly the item that was worth surfacing.

## The read model

`lib/student-activity.ts`, beside `lib/inbox.ts` and shaped like it. It runs a
small number of slim queries across **all** students at once and reduces them
in JS through the pure functions above.

`lib/inbox.ts`'s own note applies unchanged and is carried forward: this is a
SQLite file on the same box, serving one tutor. If N ever justifies otherwise
the shape to reach for is a maintained count column, and nothing outside this
module changes.

## Surface 1: the admin student cards

`components/admin/StudentCard.tsx` replaces the `Tile` inside `GroupList`.
The search field, the delete and reset confirm rows and the error line are
untouched.

```
┌──────────────────────────────────────┐
│ Marie Dupont              🔗  🔑  🗑 │
│                                      │
│ • 2 unread messages                  │
│ • 1 homework to correct              │
│ • 3 new flashcards                   │
│                                      │
│ marie@example.com · signed up 4 Aug  │
└──────────────────────────────────────┘
```

A two-column grid at 1152px, collapsing to one below `lg` — the Pages grid's
own breakpoint, so the two admin lists agree. `items-start`: a busy student's
card is taller than a quiet one.

**The card copies `Tile`'s structure exactly.** The name is the anchor,
stretched with `after:absolute after:inset-0`; the three icons sit in a
`relative z-10` box above it. That is not a style choice — an anchor inside an
anchor is invalid HTML that browsers repair by splitting the element, which is
what `Tile`'s own comment records. The focus ring is drawn on the card via
`has-[a:focus-visible]`, for the reason given there.

Students stay in **name order**. A list that reorders itself by activity makes
a student hard to find between visits, and the search field is what finds them.

`visibleStudents` still withholds the everyone group, so it gets no card. It
has no chat, deck or checklist, and its shelf is public — there is nobody whose
activity it would summarise.

## Surface 2: tab dots on `/g/[slug]`

`StudentTabs` takes `dots: Record<StudentTab, boolean>`. A circle at the pill's
top-right, on **Files**, **Vocabulaire** and **À faire**.

It follows `ConversationList`'s unread dot verbatim: the circle is
`aria-hidden` with an `sr-only` word beside it. `FilterDisclosure` already
reuses that pattern for its filter icon, so this is a third use of one
precedent rather than a new one.

The dot fires for the other party's work only, so Marie's own upload lights
Jenn's tab and not Marie's.

Out of scope, deliberately: the **Whiteboard** tab and the **card** tab.
Neither was asked for, and the card is the same global card for everyone.

## Surface 3: per-file dots

`PageTile`'s one `badge` slot is already spent on the worksheet version count.
It gains a separate `dot?: boolean`, drawn in the opposite corner. Overloading
the badge would make one slot mean two things and force the caller to choose
which to show.

`/f/[token]` gets no dots. That link is read-only and addresses a shelf and
nothing else, so a parent holding it must not be told what the student has not
read.

## Stamping

`components/student/MarkTabSeen.tsx`, a client component mounted on the active
tab. It calls `markTabSeen(groupId, tab)` once and does not await it.

Two rules come straight from `markFlashcardViewed`:

- **The role decides which column is written**, never an argument.
- **No `revalidatePath`.** The dot stays while you are on the tab and clears on
  the next navigation. Clearing it under the reader is the same failure as
  reordering the deck mid-flip.

Authority is `chatRole`, which refuses the everyone group before it checks
anything else. `/g/all` therefore has no dots and no watermarks, which is
right: there is no student there for a visit to belong to.

**One cost is accepted and stated.** An unlocked teacher has no card tab and
lands on Files, so opening a student from the admin always stamps
`teacherSeenFilesAt`. *N new files* clears more eagerly than the other bullets.
This is honest rather than wrong — she is looking at the shelf — but it means
the files bullet is a weaker signal than the homework ones, which do not clear
on sight at all.

## Language

Every new string goes into `lib/strings.ts` under both locales, both objects
annotated `Strings`, so a missing key is a compile error naming the key.

Counts need real plurals, so each is a **function**, never a placeholder
template:

```ts
newFlashcards: (n: number) =>
  n === 1 ? "1 nouvelle carte" : `${n} nouvelles cartes`,
```

Only the `Locale` crosses into a client component, never the resolved object.
That boundary is what once shipped a request-time 500 past lint, `tsc`, the
tests and the build.

## Tests

Pure modules are tested; components and Prisma access are not.

- `tests/lib/unseen.test.ts` — the author filter both directions, a null
  watermark, and `pageIsUnseen` agreeing with the tab dot built from it
- `tests/lib/homework-status.test.ts` — each state, and both sides of the
  7-day boundary
- `tests/lib/student-summary.test.ts` — bullet order, the disjoint homework
  states, and the empty case

## Out of scope

- **Opening a link or a non-worksheet PDF.** Only worksheets record an open.
- **A Whiteboard tab dot.**
- **A student-side unread-message dot.** The chat FAB already has one.
- **Reordering students by activity.**
- **Animating the student card grid.** `GroupList` has no list animation today
  and adding one is a separate change.
