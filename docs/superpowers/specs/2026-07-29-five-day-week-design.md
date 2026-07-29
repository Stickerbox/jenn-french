# Five-day teaching week — design

Date: 2026-07-29

## Problem

The teaching week runs Monday to Saturday. Jenn wants it to run Monday to
Friday. Saturday is not simply dropped: the cards already written for Saturdays
are content she wants to keep, and the cards written for the days after them are
in the order she intends them to be taught. Removing a day from the week has to
move the content, not delete it.

## Goal

The week becomes Monday to Friday everywhere — the student picker, the week
range in the header, the day a student lands on at the weekend, and the days
`/admin` will open. Every existing card at or after Monday 27 July 2026 keeps
its position in the teaching order and is re-dated onto the new five-day
calendar.

## Scope

New:

- `lib/reschedule.ts` — the old-slot-to-new-slot date mapping
- `tests/lib/reschedule.test.ts`
- `scripts/reschedule-five-day-week.mjs` — a one-off, run once per environment

Changed:

- `lib/week.ts` — `weekRange` ends on Friday; `latestViewableDate` clamps
  Saturday as well as Sunday
- `lib/admin-date.ts` — `parseAdminDate` snaps a weekend to the following Monday
- `components/WeekDayPicker.tsx` — five buttons instead of six
- `app/g/[slug]/page.tsx` — comment only
- `tests/lib/week.test.ts`, `tests/lib/admin-date.test.ts`
- `docs/DEPLOY.md` — the one-off script run

Unchanged:

- `prisma/schema.prisma`. Nothing about the shape of a card changes, so there is
  no Prisma migration. The `date` columns and their unique constraints stay
  exactly as they are; only the values move.
- Card resolution, card content, auth, Claude generation, group management.

## The re-dating rule

Cards keep their order and fill consecutive Monday–Friday slots. The drift is
not a constant: it grows by one day for every Saturday crossed.

```
BEFORE                    AFTER
Mon Jul 27  card A    ->  Mon Jul 27  card A
Tue Jul 28  card B    ->  Tue Jul 28  card B
Wed Jul 29  card C    ->  Wed Jul 29  card C
Thu Jul 30  card D    ->  Thu Jul 30  card D
Fri Jul 31  card E    ->  Fri Jul 31  card E
Sat Aug  1  card F    ->  Mon Aug  3  card F
Mon Aug  3  card G    ->  Tue Aug  4  card G
Tue Aug  4  card H    ->  Wed Aug  5  card H
Wed Aug  5  card I    ->  Thu Aug  6  card I
Thu Aug  6  card J    ->  Fri Aug  7  card J
Fri Aug  7  card K    ->  Mon Aug 10  card K   <- +3
Sat Aug  8  card L    ->  Tue Aug 11  card L
Mon Aug 10  card M    ->  Wed Aug 12  card M
```

Two rejected alternatives, recorded so they are not revisited:

- **Move only the Saturday cards.** Saturday's card collides with the Monday
  card already there, and one of the two has to be discarded.
- **Delete the Saturday cards.** No collision, but it throws away written
  content.

### The anchor

The mapping starts at **Monday 27 July 2026**, the Monday of the week the change
was made. Cards before it are left alone.

Monday to Friday of that week map to themselves, so the first card that actually
moves is Saturday 1 August. Nothing a student has already been shown changes
date. Cards on earlier Saturdays stay on those Saturdays; the picker only ever
renders the current week, so a past Saturday was already unreachable once its
week ended.

The anchor is a hardcoded constant in the script, not a value derived from the
clock. A run on the server a week after the dry run has to produce the same
result as the dry run.

### `lib/reschedule.ts`

```ts
shiftToFiveDayWeek(date: Date, anchor: Date): Date
```

It indexes the old calendar as six teaching days per week and the new one as
five, then maps position to position:

```
i   = weeksSince(anchor) * 6 + (dayOfWeek - 1)   // old slot, Mon = 0 … Sat = 5
new = anchor + floor(i / 5) * 7 + (i % 5) days   // the i-th Mon–Fri slot
```

`weeksSince` is `floor((date - anchor) / 7 days)`, which is only a week index
because the anchor is itself a Monday — the function requires that and should
say so.

- A date before the anchor is returned unchanged. That check comes first, so the
  negative week index it would otherwise produce never arises.
- A Sunday **throws**. It has no slot index in a Monday–Saturday week, so any
  Sunday card is a data anomaly rather than something the mapping should guess
  at. Only a Sunday at or after the anchor throws; one before it hits the
  unchanged case above. `dev.db` has a card on Sunday 26 July, which is before
  the anchor and so passes through untouched.
- The input `Date` is not mutated, matching the rest of `lib/week.ts`.

A pure function in `lib/` with a test in `tests/lib/`, per the repository
convention, so the rule is verifiable without a database.

## The migration script

`scripts/reschedule-five-day-week.mjs`, following the `backfill-sections.mjs`
precedent: a Node script that imports the tested `lib/` function rather than
hand-written SQL, so there is one implementation of the rule.

**Dry run by default.** It prints an `old → new` line for every card at or after
the anchor in both tables — including the ones whose date does not change, so
the printed list is the whole affected set rather than a diff — then exits.
`--apply` is required before it writes anything.

**One mapping, both tables.** `GlobalCard` and `Card` rows go through the same
`shiftToFiveDayWeek` call. A group's override has to land on the same new date
as the global card it overrides; resequencing each table independently by its
own row order would silently detach an override from its day.

**Descending date order, inside `prisma.$transaction`.** `date` is unique on
`GlobalCard` and `(groupId, date)` is unique on `Card`, and SQLite has no
deferred constraint checking, so the write order is load-bearing. Every card
moves forward or stays put, so writing the furthest-future card first means each
row always moves into a slot that has just been vacated. The transaction is
there because a half-applied week — some cards moved, some not — is harder to
recover from than a failed run.

**Idempotency guard.** The mapping is not idempotent: applied twice, a card on
Tuesday of the second week moves to Wednesday and then to Thursday. So before
doing anything else the script checks for a card on a Saturday at or after the
anchor; if there is none it prints `already migrated, nothing to do` and exits,
in dry-run mode and under `--apply` alike. After a successful apply that
condition is true by construction, so a second run is a no-op.

**Sunday abort.** If any card at or after the anchor falls on a Sunday, the
script lists those rows and exits without writing, in dry-run mode as well as
under `--apply`. That is a decision for the teacher, not the script.

## Front-end

| File | Change |
|---|---|
| `lib/week.ts` | `weekRange` end offset `+5` → `+4`. `latestViewableDate` returns that week's Friday for Saturday and for Sunday |
| `components/WeekDayPicker.tsx` | drop the `S` / Samedi entry; `FRENCH_DAYS` has five entries and `currentWeekDates` follows its length |
| `app/g/[slug]/page.tsx` | the comment on `parseDate` describing the Sunday case |
| `lib/admin-date.ts` | `parseAdminDate` snaps a Saturday or Sunday forward to the following Monday |

`latestViewableDate` is the ceiling for an explicit `?date=` as well as the
default landing day, so clamping Saturday there is what stops a student reading
a Saturday card that the migration has not moved yet, and what stops the page
opening on a day with no dot in the picker.

`parseAdminDate` applies the weekend snap to its `today` fallback as well as to
an explicit `?date=`, so `/admin` opened on a Saturday lands on the following
Monday. This is a deliberate change to the default day at the weekend: Jenn can
still reach the Friday just gone from the date picker, but the day the page
opens on moves. It stays true that `parseAdminDate` does **not** clamp future
dates — pre-posting is the whole workflow, and the snap is a different rule from
the student page's ceiling.

Comments in these files are rewritten rather than left describing a six-day
week. The existing ones record the failure that motivated each decision and are
worth keeping accurate.

## Testing

`tests/lib/reschedule.test.ts` (new):

- every row of the table above
- dates before the anchor returned unchanged
- the compounding weeks, +2 and +3
- a mapping that crosses a month boundary
- a Sunday throws
- the input `Date` is not mutated

`tests/lib/week.test.ts`:

- `weekRange` returns Monday to Friday, from a Monday, a midweek day, the Friday
  itself, and the Sunday that belongs to the week just ended
- `latestViewableDate` returns Friday for Saturday and for Sunday, and today for
  Monday through Friday
- the existing month- and year-boundary cases, re-based on Friday

`tests/lib/admin-date.test.ts`:

- a Saturday and a Sunday snap to the following Monday, including across a month
  boundary
- weekdays are untouched
- a future weekday is still not clamped
- malformed and overflowing values still fall back to `today` — and the fallback
  is itself snapped when `today` is a weekend

Components and Prisma access stay untested; the pure modules underneath them
carry the rules.

## Deployment

The only real content is on the server, so the script matters more than the code
deploy. Added to `docs/DEPLOY.md`:

1. Back up the database (`VACUUM INTO`, per `docs/DEPLOYMENT.md`).
2. Deploy the code as normal.
3. Run the script with no flags and read the printed mapping.
4. Run it again with `--apply`.

Between steps 2 and 3 the site is briefly inconsistent: Saturday cards still
exist but the picker no longer offers a Saturday, so that day is unreachable.
That is preferable to the other order, where cards would be resequenced while
the picker still showed a Saturday dot pointing at a day that had just been
vacated. Rollback for a bad apply is the backup from step 1, not a reverse run.
