# Teacher-authored card sections — design

Date: 2026-07-27

## Problem

The back of the card has four sections — Grammar, Québec Pronunciation, Tip,
Idiom of the day — and every one of them is hardcoded: a column in the Prisma
schema, a field in `CardInput`, a block in `Flashcard.tsx`, a block in
`CardEditor.tsx`, and a property in the Claude schema. Changing what a card
contains is a code change and a migration.

Two things have made that a problem at once. Jenn wants to write the Québec
pronunciation herself rather than have Claude attempt it, and she expects the
shape of a card to keep changing as she works out what her students need.

## Goal

The back of the card becomes an ordered list of sections the teacher owns.
Claude seeds two of them and leaves the rest alone. Adding, renaming,
reordering and removing a section is something Jenn does in the editor, not
something a developer does in the schema.

## Scope

New:

- `lib/sections.ts` — the `CardSection` type and its pure operations
- `components/admin/SectionEditor.tsx` — the repeating editor
- `tests/lib/sections.test.ts`
- A Prisma migration adding `sections` to both card tables
- `scripts/backfill-sections.mjs` — a one-off, run once per environment

Changed:

- `prisma/schema.prisma` — `sections Json?` on `GlobalCard` and `Card`
- `app/actions.ts` — `CardInput` carries sections; both upserts write them
- `lib/cards.ts` — `toCardFormValues` reads them
- `lib/card-resolution.ts` — `CardContent` carries them
- `lib/card-ai.ts` — the Claude schema drops from five fields to three
- `lib/card-suggestions.ts` — `CardSuggestion` and `applySuggestion`
- `components/Flashcard.tsx` — renders the list
- `components/admin/CardEditor.tsx` — hands the back panel to `SectionEditor`

Unchanged:

- The front of the card: date, subject, usage, English prompt, hint
- `frenchAnswer`, which stays a fixed field at the top of the back
- Auth, date navigation, card delete, group delete, the deployment

## The shape

```
FRONT                          BACK
+---------------------+        +---------------------------+
| date     (subject)  |        | date        (subject)     |
| usage               |        | THE ANSWER                |
| SAY IT IN FRENCH    |        | french answer             |
| english prompt      |        |---------------------------|
| hint                |        | Grammar          [↑][↓][x]|
+---------------------+        | Québec Pron.     [↑][↓][x]|
                               | Idiom of the day [↑][↓][x]|
                               | ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐   |
                               | │ Add new section     │   |
                               | └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘   |
                               +---------------------------+
```

## Storage

A single `sections Json?` column on `GlobalCard` and on `Card`, holding:

```json
[{ "title": "Grammar", "body": "être → **j'étais**, faire → **faisait**." }]
```

Display order is array order. There is no `position` field to keep in sync.

A related table was the alternative and is rejected: there are two card tables,
so it would mean either two join tables or a polymorphic key, and sections are
only ever read and written whole, with their card. Nothing queries across them.

`sections` is nullable so the column can be added without touching existing
rows. A null is read as an empty list.

Prisma types a `Json` column as `JsonValue`, which is to say it does not type
it at all — the database will hand back whatever is in there. Every read
therefore goes through one function in `lib/sections.ts` that returns a
`CardSection[]`: anything that is not an array of objects with string `title`
and `body` is discarded, and malformed entries within a valid array are
dropped rather than rendered. A hand-edited row, a half-finished migration or
a future schema change can then produce a card with missing sections, but not
a student page that throws. This is tested alongside the rest.

### The four old columns stay

`examples`, `pronunciation`, `tip` and `idiom` are backfilled into `sections`
and then left in the schema, unwritten and unread.

Dropping them in the same change that starts writing a new shape would mean
the only copy of a year's cards lives in a column format nobody has run in
production yet. Leaving them costs nothing and makes a mistake recoverable by
reverting code rather than restoring a database. A follow-up drops them once
Jenn has used this for a week.

## Backfill

For each existing card, in this order, skipping any field that is blank:

| Old column | Section title |
| --- | --- |
| `examples` | Grammar |
| `pronunciation` | Québec Pronunciation |
| `tip` | Tip |
| `idiom` | Idiom of the day |

That is the order they render in today, so every existing card looks exactly
as it did. A card that had a Tip keeps it, now as an ordinary section.

The mapping is a pure function, tested. The script that applies it is a thin
wrapper: read every card, map, write, report counts.

## Seeding a new card

When Generate succeeds, `applySuggestion` produces:

1. **Grammar** — Claude's text
2. **Québec Pronunciation** — empty, waiting for Jenn
3. **Idiom of the day** — Claude's text

Pronunciation is seeded rather than fixed. It appears on every new card so
Jenn never has to create it, but it is an ordinary section: she can rename it,
move it, or delete it on a card where there is nothing distinctive to say.
Deleting it on Tuesday's card does not affect Wednesday's, which is seeded
fresh.

## The editor

Each section is a title input, a body textarea, and three controls: **↑**, **↓**
and a delete. Up and down rather than dragging — no new dependency, works on
touch and with a keyboard, and Jenn is nudging three or four sections, not
sorting a long list. The first section's **↑** and the last section's **↓** are
disabled rather than hidden, so the controls do not jump around.

Beneath the last section sits an always-present empty one, placeholder
**"Add new section"**, drawn with a dashed red outline. Typing into either its
title or its body turns it into an ordinary section — the outline goes — and a
fresh dashed one appears below it. There is no "add" button to press.

On save, any section whose title and body are both blank is dropped, so the
trailing placeholder never reaches the database, and neither does a section
Jenn started and abandoned.

## Rendering on the student card

Each section renders its title in the existing red mono heading style and its
body as prose with inline markup, exactly as Grammar and Tip do today.

One exception, driven by content rather than title: a body shaped
`**expression** — meaning` renders in the gold-bordered box, with the
expression in red italic above its meaning. That is how the idiom looks today,
and tying it to the shape of the text rather than to the title "Idiom of the
day" means it survives Jenn renaming or moving that section — and lets her get
the same treatment on any section by writing that shape.

Sections with an empty body are skipped, so a seeded Québec Pronunciation that
Jenn has not filled in does not show students an empty heading.

## What Claude writes

| Field | Source |
| --- | --- |
| englishPrompt, frenchAnswer, subject | teacher — input to the prompt |
| usage, date | teacher — not sent |
| hint | Claude |
| grammar | Claude — becomes the Grammar section |
| idiom | Claude — becomes the Idiom of the day section |
| Québec pronunciation | **teacher** — seeded empty, Claude is not asked |
| any other section | teacher |

The Claude schema drops from five properties to three: `hint`, `grammar`,
`idiom`. `pronunciation` goes because Jenn is taking it over; `tip` goes
because it was only ever a section with a fixed name, and she can now make one.

Removing pronunciation from the prompt also removes the longest and most
error-prone instruction in it — four sentences of Québécois phonetics — which
should make the remaining three fields more reliable, not less.

## Testing

`lib/sections.ts` is pure and carries everything that can be quietly wrong:

- **normalise** — drops sections blank in both fields, trims titles and bodies,
  leaves a section with a title and no body alone (Jenn writing the heading
  first), and returns a new array rather than mutating
- **moveSection** — up and down, and both no-ops at the boundaries
- **seedSections** — produces the three seeded sections in the stated order
- **backfillSections** — the four-column mapping, including cards where some
  fields are blank and a card where all four are
- **isExpressionBody** — true for `**x** — y`, false for prose that merely
  contains bold, false for empty
- **readSections** — the untyped-column guard: a null, a string, an object, an
  array of the wrong shape and an array with one bad entry among good ones

Everything else is UI and server wiring, verified by `npm run lint`,
`npm run typecheck`, `npm test`, `npm run build`, and by running the app. The
vitest suite stays node-only, with no React Testing Library and no HTTP mocks.

Manual checks that matter:

1. An existing card still renders exactly as before, its Tip now a section.
2. Generate on a new date produces Grammar, an empty Québec Pronunciation, and
   Idiom of the day, in that order.
3. Typing in the dashed section makes a new dashed one appear below it.
4. Saving with the trailing placeholder untouched stores no empty section.
5. ↑ and ↓ reorder, and are inert at the ends.
6. The student card shows the sections in the teacher's order, skips an empty
   Québec Pronunciation, and still boxes the idiom after it has been renamed.

## Migration and rollout

1. Take a fresh backup — `~/backup-db.sh` on the server.
2. Deploy the schema migration adding the nullable column.
3. Run the backfill script; it prints how many cards it touched.
4. Check a card on `/g/all` before telling Jenn anything changed.

The old columns are still populated at every step, so a bad outcome is fixed by
deploying the previous commit rather than restoring a database.

## Out of scope

Drag-and-drop reordering, a per-section style toggle, section templates or
presets, Claude choosing its own section titles, dropping the four old columns,
and any change to the front of the card. Each is reasonable later; none is
needed to let Jenn shape the back of a card herself.
