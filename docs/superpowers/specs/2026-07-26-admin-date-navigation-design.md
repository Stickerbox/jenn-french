# Admin date navigation and delete — design

Date: 2026-07-26

## Problem

`/admin` shows today's card and nothing else. The page hardcodes today,
queries that one date, and hands the result to `CardEditor`.

The date input inside the editor looks like it selects a day, but it does not.
It edits `values.date` — a field on the record being saved. Changing it
refetches nothing and remounts nothing, so the editor keeps showing the card it
loaded at mount while quietly retargeting it at a different day. Pressing Save
then writes today's content to that other date, duplicating the card rather
than creating a new one.

So there is no way to reach a date that has no card, which means the two-stage
Generate flow is unreachable for every day except a today that happens to be
empty. There is also no way to delete a card once written.

## Goal

Make the date a real coordinate: pick a day, and the page loads that day. A
date with a card opens in the editor; a date without one opens in the compose
flow. Cards can be deleted, which returns that date to compose.

## Scope

New:

- `components/admin/AdminDatePicker.tsx` — the date input, as navigation
- `lib/admin-date.ts` — `parseAdminDate`, parse and validate, no clamping
- `deleteGlobalCard` and `deleteOverrideCard` in `app/actions.ts`
- `tests/lib/admin-date.test.ts`

`parseAdminDate` gets its own module rather than joining `lib/cards.ts`,
which imports Prisma. The vitest suite is node-only and mocks nothing, so a
test importing this function must not drag a database client in behind it.

Changed:

- `app/admin/page.tsx` — reads `?date=`, queries that date, keys the editor
- `app/admin/[slug]/page.tsx` — the same, plus the overrides list becomes links
- `components/admin/CardEditor.tsx` — date input removed, delete added
- `app/actions.ts` — `upsertOverrideCard` revalidates the right path

Unchanged:

- `lib/card-ai.ts`, `app/ai-actions.ts`, `lib/card-suggestions.ts`
- `components/InlineMarkup.tsx`, `components/Flashcard.tsx`
- The `CardInput` type, both upsert actions' signatures
- The Prisma schema — deleting a card is a row delete, not a migration

## The date lives in the URL

```
/admin?date=2026-07-28              /admin/marie?date=2026-07-28
      |                                   |
      v                                   v
  parseAdminDate                     parseAdminDate
      |                                   |
      v                                   v
  query GlobalCard                   find in group.cards
      |                                   |
      +----------------> CardEditor <-----+
                         key={initialDate}
```

Both admin pages take `searchParams: Promise<{ date?: string }>` and resolve it
through `parseAdminDate`, which returns today for a missing or unparseable
value. It does **not** clamp future dates. The student page clamps deliberately,
so students cannot read ahead; the teacher pre-posts ahead on purpose, and that
is the whole reason to reach a future date.

Every date change is therefore an ordinary navigation. The server component
re-runs, queries that date, and passes fresh `initialDate` and `initialValues`.
Nothing about the two-stage flow changes: each date is a genuine page load, so
"one generation per page load" continues to mean what it meant.

### `key={initialDate}` is load-bearing

Navigating from `?date=A` to `?date=B` re-renders `CardEditor` but does not
remount it. React keeps the instance at the same position in the tree, so its
`useState` initialisers do not run again — including the one that decides
between `compose` and `editing`, and the one that seeds `values` from
`initialValues`. The editor would receive new props and ignore them, which is
the present bug wearing a different hat.

Passing `key={initialDate}` makes React treat each date as a different
component instance and remount it. Without that one attribute the rest of this
design compiles, renders, and does nothing.

## The editor no longer owns the date

`AdminDatePicker` is rendered by each page as a sibling above `<CardEditor>`,
not from inside it. That placement is what puts it above both stages at once,
and it keeps the picker out of the remount that `key={initialDate}` forces. It
pushes `?date=` on change and is the only date control on the page.

`CardEditor` drops its date input. `date` still travels inside `CardInput`,
because both upsert actions key on it, but it is seeded from `initialDate` and
never mutated. The retarget-and-duplicate hazard is then gone by construction
rather than by validation — there is no longer an input capable of expressing
it.

This is a change to the two-stage design, which said the date input appears in
the editing stage. It now sits above both stages instead, because a date
control that only appears once you already have a card cannot be what takes you
to a date that has none.

## Delete

Two server actions, each calling `requireTeacher()` first, matching every other
write in `app/actions.ts`:

| Action | Deletes | Revalidates |
| --- | --- | --- |
| `deleteGlobalCard(date)` | the `GlobalCard` for that date | `/admin` |
| `deleteOverrideCard(groupId, date)` | that group's `Card` for that date | `/admin/[slug]` |

`CardEditor` takes an optional `onDelete` prop and renders a quiet, text-only
"Delete card" beneath Save, **only in the editing stage** — there is nothing to
delete from compose. Clicking it swaps that line for an inline
`Delete this card? [Cancel] [Delete]`, held in component state.

The confirmation is inline rather than `window.confirm`, which cannot be styled
to match the page and blocks the main thread while it is open.

On success the editor blanks its fields, returns to `compose` for the same
date, and calls `router.refresh()`. The teacher stays on the day they were
looking at, now empty and ready to generate again.

### Deleting an override does not blank the group's day

`getEffectiveCard` resolves a group's card by taking the most recent override
on or before the date, and the most recent global card on or before it, then
picking between them. Deleting one override does not leave a hole: the group
falls back to the global word, which is the behaviour an override is defined
against. Deleting a *global* card does remove that day's word for everyone who
has no override.

## Finding the dates that exist

`/admin/[slug]` already lists every saved override by date. Those rows become
links to `?date=`, which is the whole of the discoverability work.

`/admin` gets no such list. Today is reachable by default and any other date is
one input away, and a list of every global card ever written is a component and
a query bought for a problem nobody has reported yet.

## An incidental fix

`upsertOverrideCard` calls `revalidatePath("/admin")` rather than
`` revalidatePath(`/admin/${slug}`) ``. Saving an override therefore revalidates
the wrong page; today this is masked because `CardEditor` calls
`router.refresh()` after save. The delete actions revalidate these same paths,
and adding a correct one beside an incorrect one would be worse than fixing it.

## Testing

`parseAdminDate` is the only new pure logic, and it carries the decisions worth
getting wrong: a missing value yields today, an unparseable value yields today,
a valid past date is returned as given, and — the one that separates it from
the student page's `parseDate` — a future date is returned rather than clamped.

Everything else is server wiring and UI, verified with `npm run lint`,
`npm run typecheck`, `npm test`, `npm run build`, and by running the app. The
vitest suite stays node-only with no React Testing Library and no HTTP mocking
layer.

Manual checks that matter:

1. `/admin` with no `?date=` opens on today, exactly as before.
2. Changing the date to a day with no card opens the compose flow with three
   empty fields — this is the behaviour the whole design exists for.
3. Changing to a day that has a card opens the editor populated with it.
4. Generating on a new date, then changing the date and coming back, shows the
   unsaved draft is gone — the remount is doing its job.
5. Save on a navigated-to date writes to *that* date, and today's card is
   untouched.
6. Delete asks for confirmation, and on confirm the same date drops to compose.
7. Deleting a group override makes `/g/[slug]` fall back to the global word for
   that date rather than showing nothing.
8. A future date is reachable and saveable; `/g/[slug]` still refuses to show
   it to students.

## Out of scope

No list of global cards on `/admin`, no week-strip picker on the admin pages,
no undo for delete, no bulk delete, no copying a card from one date to another,
and no change to how students resolve which card they see. Delete is immediate
and permanent once confirmed.
