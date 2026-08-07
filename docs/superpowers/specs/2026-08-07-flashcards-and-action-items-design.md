# Flashcards and action items

2026-08-07

## Scope

Two new tabs on `/g/[slug]`, in one spec because they share the tab plumbing and
designing that twice would give it two chances to disagree with itself. They are
otherwise independent and can be built in either order.

| Tab | What it is |
|---|---|
| Vocabulaire / Vocabulary | A deck of two-sided cards, added by either party, opened full screen |
| À faire / To do | One shared checklist |

This is the second and third of the three specs planned on 2026-08-07. The first,
`2026-08-07-admin-tidy-and-board-viewer-design.md`, has shipped.

**This spec needs a schema change and one migration.** Two new models, no changes
to existing ones.

---

## 1. The data

```prisma
model Flashcard {
  id      String @id @default(cuid())
  groupId String
  group   Group  @relation(fields: [groupId], references: [id], onDelete: Cascade)

  // The two faces. Whichever was typed first is the front, so an English word
  // and its translation, or a conjugated verb and its infinitive, both work
  // without the model knowing which kind it is holding.
  front String
  back  String
  // Optional, drawn greyed on the back beside the answer.
  note  String?

  // Null until the STUDENT opens this card full screen. See "who stamps it"
  // below — this is the one field on either model with a rule behind it.
  lastViewedAt DateTime?

  createdAt DateTime @default(now())

  @@index([groupId, createdAt])
}

model ActionItem {
  id      String @id @default(cuid())
  groupId String
  group   Group  @relation(fields: [groupId], references: [id], onDelete: Cascade)

  text String
  // Who added it. A boolean for the reason Message.fromTeacher is one: there
  // are exactly two participants and one of them has no row to point at.
  fromTeacher Boolean
  // Null means open. A timestamp rather than a boolean, following pinnedAt and
  // sentAt: it records WHEN, and re-ticking a row does something.
  doneAt DateTime?

  createdAt DateTime @default(now())

  @@index([groupId, createdAt])
}
```

**`Flashcard` deliberately has no `addedByStudent`.** Either party may delete any
card, so nothing would read it. If deletion is ever narrowed to "your own", that
column is the change — do not add it speculatively now.

**Neither model inherits from the everyone group.** A card is the vocabulary from
one student's lesson and a checklist is between two people. Both actions reuse
`chatRole` (`lib/chat-access.ts`), which refuses the everyone group in its first
clause — the same reuse the whiteboard makes, for the same reason: that group has
no `chatToken`, so there is nobody on the other end.

---

## 2. Tabs

`parseStudentTab` (`lib/student-tab.ts`) gains `"cards"` and `"todo"`. Both are
available on `unlocked`, exactly as Files and Whiteboard are, so its `available`
record grows from three keys to five. Its existing comment about a forwarded
`?tab=` landing on a tab that should not exist applies unchanged to both.

### Naming, which is not cosmetic

The obvious French label for a flashcard tab is *Les cartes*, and the daily-card
tab is already *La carte*. One letter apart, adjacent in the strip, meaning
entirely different things. So:

| Tab | French | English |
|---|---|---|
| daily card | La carte | The card |
| files | Les fichiers | Files |
| whiteboard | Le tableau | Whiteboard |
| flashcards | **Vocabulaire** | **Vocabulary** |
| action items | **À faire** | **To do** |

*Vocabulaire* also says what the deck is for, which *Les cartes* does not.

### The strip has to scroll

`StudentTabs` is `mx-auto mb-[var(--space-5)] flex max-w-[560px] justify-center`
around a `rounded-full` pill row. Three tabs fit a phone. Five do not — the
French set is roughly 380px of text before padding, inside a strip that is the
first thing on the page.

The nav becomes horizontally scrollable and drops `justify-center` at narrow
widths, keeping it centred once there is room. That is the treatment `ShellBar`'s
middle track already uses, and for the same reason: three French version labels
are wider than a phone.

Each tab keeps its `min-h-[44px]` hit box. The pill row must not shrink its
padding to fit — a strip that squashes is worse than one that scrolls, because a
squashed strip looks correct and is unusable.

---

## 3. Flashcards

### Who stamps `lastViewedAt`, and why it matters

**Only a student's viewing writes it, and only from the full-screen view.**

A card sits on one student's deck but two people can open it. If Jenn's browsing
stamped the same field the revision order reads from, then flicking through
Marie's deck on Monday would tell Marie's app that Marie revised everything on
Monday — and the cards she is struggling with would drop to the bottom of the
list that exists to surface them. Her review would bury exactly what it is for.

This is the first **write on read** in this codebase. Every other write here is a
deliberate act: a save, a send, a pin. Two consequences to keep:

- The write is fired and **not awaited**. It must never delay the flip or fail
  the view. A dropped stamp costs one card's ordering; a blocked flip costs the
  feature.
- It runs on **open**, not on flip. Opening a card is the act of studying it,
  whether or not you needed the answer.

### The ordering module

`lib/flashcard-order.ts` is new and holds the only real rule here. It is pure and
has a test file.

```ts
type FlashcardSort = "added" | "random" | "revision";
orderFlashcards(cards, sort, seed): T[]
```

- **`added`** — newest first. The default, matching the shelf's own default.
- **`revision`** — **never-viewed first**, then oldest `lastViewedAt`. A card
  never opened needs revision more than one opened a month ago, and a null that
  sorted as "very old" or "very new" by accident would put the newest cards
  either always first or never first.
- **`random`** — a **seeded** shuffle, not `Math.random()` at render.

The seed is why this takes a third argument. The shelf is a client component fed
server-rendered data, so an unseeded shuffle differs across hydration — the same
class of fault `FilesTab`'s `today` prop already avoids by being passed in rather
than read as `new Date()`. The seed is generated once, in client state, when
Random is chosen; the order is then stable while the reader pages through it and
identical on both sides of hydration. Choosing Random again reshuffles.

Ties break on the cards' original array position rather than on engine sort
stability, the rule `sortPages` already records.

### The shelf

A grid of small cards showing the front only, under one row of three chips:

| Sort | French | English |
|---|---|---|
| `added` | Ajout | Added |
| `random` | Aléatoire | Random |
| `revision` | À réviser | Needs revision |

**The chips are always visible** — no disclosure. The filter icon added in the
previous spec exists because the shelf stacked a search field and two chip rows;
this is one row and nothing else, so hiding it would cost a tap and save nothing.

### The viewer

A full-screen overlay at `z-[60]` calling `useOverlayLock`, the pattern
`BoardViewer` and `AddSheet` share. **Not a route** — a card is not a
bookmarkable thing, and the deck is the unit a reader navigates.

- Reuses the daily card's `rotateY` flip (`components/Flashcard.tsx`). Front on
  open, tap or Enter to reveal the back; the note sits greyed beneath the answer.
- The added date is top-left in `cardDateLabel` — the daily card's own date
  style, monospace and uppercase — formatted by `formatLongDate(date, locale)`,
  which is already `timeZone: "UTC"` like every other date here.
- A trash icon top-right **confirms before deleting**, following
  `DeleteVersionButton`: there is no undo and no history behind a card. After a
  delete the viewer moves to the **next** card in the current order, or closes if
  that was the last one. It does not stay open on an empty frame.
- Left and right arrows, and the keyboard's, move through the deck **in the
  shelf's current order**, so Random and À réviser carry into the viewer.
  Escape closes.
- Moving to a card resets it to its front. A card that opened already flipped
  would answer a question the reader had not been asked.

### Adding

Joins the existing `+` FAB menu (`ShelfFab`) as *Ajouter une carte* / *Add a
flashcard*, opening an `AddSheet` with front, back and an optional note. Both
parties get the item; the menu already differs by role and this entry does not.

---

## 4. Action items

Deliberately much smaller, and it gets **no `lib/` module** — there is no rule in
it beyond "creation order". Adding one would be ceremony.

- A list. Each row is a checkbox and its text, struck through and dimmed when
  done, followed by a small muted label naming who added it: Jenn's name from the
  dictionary, or the student's own name from `Group.name`. The label is text, not
  a colour or an icon — a shared list where you cannot tell who set an item is
  the thing `fromTeacher` exists to prevent, and a colour alone would not say it
  to a screen reader.
- Each row carries an `×` that deletes without confirming, matching the link
  tile's own delete: an item is one line of text and re-adding it is retyping it.
  That is a different judgement from the flashcard's trash icon, which confirms —
  a card is two fields and a note.
- **Done items stay in place.** Moving a row the instant it is ticked makes an
  accidental tick hard to undo, because the row you meant to press is no longer
  where you pressed.
- One always-visible field at the foot of the list adds an item on Enter. **No
  FAB and no sheet** — the request was "easy to add another item", and a
  two-gesture flow through a modal is not that.
- Ticking is optimistic: the row updates immediately and the server action
  follows. A failure reverts the row and says so.
- Either party may add, tick, untick and delete. The list belongs to the page,
  not to a person.

---

## 5. Testing

One new unit-test file, `tests/lib/flashcard-order.test.ts`, covering the three
orderings, the never-viewed-first rule, seed stability across repeated calls, and
tie-breaking on original position.

Components and Prisma access stay untested, per the standing convention: the pure
modules underneath them are what carry rules.

Before the work is called done, run the CI order: `npx prisma generate`,
`npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.

---

## 6. Out of scope

Stated so they are not read as omissions:

- **Spaced repetition and view counts.** `lastViewedAt` is a sort key, not a
  schedule. A count would be the start of an algorithm; this is an ordering.
- **Editing a card.** Delete and re-add. A two-field card is cheaper to retype
  than an edit path is to build and guard.
- **Decks shared across students.** No everyone-group inheritance, per §1.
- **Drag to reorder.** The three sorts are the ordering.
- **Due dates on action items.** A checklist, not a planner.
