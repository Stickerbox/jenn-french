# Five-Day Teaching Week Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the teaching week from Monday–Saturday to Monday–Friday, re-dating every existing card at or after Monday 27 July 2026 onto consecutive weekday slots so no written content is lost or reordered.

**Architecture:** One pure function, `shiftToFiveDayWeek`, maps an old six-day-week slot to the new five-day one; a one-off Node script applies it to both card tables inside a transaction. A second pure function, `monthWeekdayRows`, produces the weekday-only grid for a new admin calendar that replaces the native date input, so a weekend is not clickable rather than clickable-and-corrected. Every rule lives in `lib/` with a test, per the repository convention.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript 5 strict, Tailwind v4, Prisma 6 + SQLite, Vitest (node environment).

**Spec:** `docs/superpowers/specs/2026-07-29-five-day-week-design.md`

## Global Constraints

- **Every date is UTC midnight**, constructed as `` new Date(`${str}T00:00:00Z`) `` and formatted with `timeZone: "UTC"`. Never use local-time `Date` constructors or `getDay()`/`setDate()` — always `getUTCDay()`/`setUTCDate()`.
- **The anchor is `2026-07-27`**, a Monday. It is a hardcoded constant, never derived from the clock: a run on the server next week must produce the same result as today's dry run.
- **No Prisma schema change and no migration.** The `date` columns and their unique constraints (`GlobalCard.date`, `Card.@@unique([groupId, date])`) are untouched; only values move.
- **The migration script is dry-run by default.** `--apply` is required before it writes.
- Vitest runs `environment: "node"` with `globals: true`. There is no React Testing Library and no HTTP mocking layer — **do not add either**. Only pure functions get unit tests; components are verified by running the app.
- Every new module uses the `@/` path alias. TypeScript is `strict` with `isolatedModules: true` — type-only imports use `import type`.
- **Comments explain the "why".** Every comment this plan asks you to write records a decision or a failure mode. Do not add comments that restate the code, and do not leave an existing comment describing six-day behaviour.
- **Do not add a date-picker dependency.** The calendar is built from `monthWeekdayRows` and plain buttons.
- Commit after every task. Do not push until Task 8.

### Expected build state

Unlike the card-sections plan, **no task leaves the build broken**. Every task changes an implementation and its tests together, so `npm run lint && npm run typecheck && npm test && npm run build` passes at the end of each one. A failure is a real finding, not expected churn.

### Calendar facts used throughout

These are load-bearing for the test expectations below. They are stated once here so no task has to re-derive them:

| Date | Day |
|---|---|
| 2026-07-27 | Monday (the anchor) |
| 2026-07-31 | Friday |
| 2026-08-01 | Saturday |
| 2026-08-02 | Sunday |
| 2026-08-03 | Monday |
| 2026-08-31 | Monday |
| 2026-11-01 | Sunday |
| 2026-06-01 | Monday |
| 2026-12-28 | Monday |
| 2028-02-01 | Tuesday (2028 is a leap year; 29 Feb 2028 is a Tuesday) |

---

### Task 1: The date mapping

The rule that decides where every card lands. Pure, no imports, no database.

**Files:**
- Create: `lib/reschedule.ts`
- Test: `tests/lib/reschedule.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `export function shiftToFiveDayWeek(date: Date, anchor: Date): Date`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/reschedule.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { shiftToFiveDayWeek } from "@/lib/reschedule";

const utc = (iso: string) => new Date(`${iso}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);

const ANCHOR = utc("2026-07-27"); // a Monday
const shift = (date: string) => iso(shiftToFiveDayWeek(utc(date), ANCHOR));

describe("shiftToFiveDayWeek", () => {
  it("leaves the anchor week's Monday to Friday where they are", () => {
    expect(shift("2026-07-27")).toBe("2026-07-27");
    expect(shift("2026-07-28")).toBe("2026-07-28");
    expect(shift("2026-07-29")).toBe("2026-07-29");
    expect(shift("2026-07-30")).toBe("2026-07-30");
    expect(shift("2026-07-31")).toBe("2026-07-31");
  });

  it("moves the first Saturday to the following Monday", () => {
    expect(shift("2026-08-01")).toBe("2026-08-03");
  });

  it("pushes the week after it forward by one day", () => {
    expect(shift("2026-08-03")).toBe("2026-08-04");
    expect(shift("2026-08-04")).toBe("2026-08-05");
    expect(shift("2026-08-05")).toBe("2026-08-06");
    expect(shift("2026-08-06")).toBe("2026-08-07");
  });

  it("compounds: the second Saturday costs another day", () => {
    // Friday of week two lands on Monday of week three, three days later.
    expect(shift("2026-08-07")).toBe("2026-08-10");
    expect(shift("2026-08-08")).toBe("2026-08-11");
    expect(shift("2026-08-10")).toBe("2026-08-12");
  });

  it("keeps compounding into later weeks", () => {
    // Three Saturdays have been removed by week four, so its Monday lands on
    // the Thursday. Note the calendar gap is not the number of Saturdays
    // crossed — a weekend absorbs part of it — which is why the slot index,
    // not a day count, is the thing being tested.
    expect(shift("2026-08-17")).toBe("2026-08-20");
  });

  it("crosses a month boundary", () => {
    expect(shift("2026-08-29")).toBe("2026-09-04");
  });

  it("returns a date before the anchor unchanged", () => {
    expect(shift("2026-07-24")).toBe("2026-07-24");
  });

  it("returns a Sunday before the anchor unchanged rather than throwing", () => {
    expect(shift("2026-07-26")).toBe("2026-07-26");
  });

  it("throws for a Sunday at or after the anchor", () => {
    expect(() => shift("2026-08-02")).toThrow(/Sunday/);
  });

  it("does not mutate the date it was given", () => {
    const input = utc("2026-08-01");
    shiftToFiveDayWeek(input, ANCHOR);
    expect(iso(input)).toBe("2026-08-01");
  });

  it("does not mutate the anchor it was given", () => {
    const anchor = utc("2026-07-27");
    shiftToFiveDayWeek(utc("2026-08-08"), anchor);
    expect(iso(anchor)).toBe("2026-07-27");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/lib/reschedule.test.ts`
Expected: FAIL — the suite cannot resolve `@/lib/reschedule`.

- [ ] **Step 3: Write the implementation**

Create `lib/reschedule.ts`:

```ts
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// Removing Saturday from the teaching week moves content rather than deleting
// it: cards keep their order and refill consecutive Monday-Friday slots. The
// drift is not constant — it grows by a day for every Saturday crossed, so
// week one shifts by 0-1 days, week two by 1-2, week three by 2-3.
//
// The mapping indexes the old calendar as six teaching days per week and the
// new one as five, then maps position to position. `anchor` must be a Monday
// at UTC midnight: the week index below is `floor(days / 7)`, which is only a
// week number because the count starts on a Monday.
export function shiftToFiveDayWeek(date: Date, anchor: Date): Date {
  // Checked first, so the negative week index a pre-anchor date would produce
  // never arises.
  if (date.getTime() < anchor.getTime()) return new Date(date);

  const dayOfWeek = date.getUTCDay(); // 0 = Sunday
  // Sunday has no slot in a Monday-Saturday week, so there is no honest answer
  // here. A Sunday card is a data anomaly for a human to resolve, not
  // something to round in one direction and hope.
  if (dayOfWeek === 0) {
    throw new Error(
      `No five-day slot for Sunday ${date.toISOString().slice(0, 10)}`,
    );
  }

  const weeks = Math.floor((date.getTime() - anchor.getTime()) / WEEK_MS);
  const oldSlot = weeks * 6 + (dayOfWeek - 1); // Monday = 0 ... Saturday = 5

  const shifted = new Date(anchor);
  shifted.setUTCDate(
    shifted.getUTCDate() + Math.floor(oldSlot / 5) * 7 + (oldSlot % 5),
  );
  return shifted;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/lib/reschedule.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/reschedule.ts tests/lib/reschedule.test.ts
git commit -m "feat: map six-day-week card dates onto a five-day week"
```

---

### Task 2: The week becomes Monday to Friday

**Files:**
- Modify: `lib/week.ts`
- Test: `tests/lib/week.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces:
  - `export function weekRange(date: Date): { start: Date; end: Date }` — unchanged signature, Friday end
  - `export function latestViewableDate(today: Date): Date` — unchanged signature, clamps Saturday and Sunday
  - `export const MONTHS: string[]` — the existing array, now **exported** for Task 6

- [ ] **Step 1: Rewrite the tests**

Replace the whole of `tests/lib/week.test.ts` with:

```ts
import { describe, it, expect } from "vitest";
import { weekRange, formatWeekRange, latestViewableDate } from "@/lib/week";

const utc = (iso: string) => new Date(`${iso}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);

describe("weekRange", () => {
  it("returns Monday to Friday for a Monday", () => {
    const { start, end } = weekRange(utc("2026-07-27"));
    expect(iso(start)).toBe("2026-07-27");
    expect(iso(end)).toBe("2026-07-31");
  });

  it("returns the same week from a midweek day", () => {
    const { start, end } = weekRange(utc("2026-07-29"));
    expect(iso(start)).toBe("2026-07-27");
    expect(iso(end)).toBe("2026-07-31");
  });

  it("returns the same week from the Friday itself", () => {
    const { start, end } = weekRange(utc("2026-07-31"));
    expect(iso(start)).toBe("2026-07-27");
    expect(iso(end)).toBe("2026-07-31");
  });

  it("treats Saturday as part of the week just finished", () => {
    const { start, end } = weekRange(utc("2026-08-01"));
    expect(iso(start)).toBe("2026-07-27");
    expect(iso(end)).toBe("2026-07-31");
  });

  it("treats Sunday as the end of the week just finished, not the start of the next", () => {
    const { start, end } = weekRange(utc("2026-08-02"));
    expect(iso(start)).toBe("2026-07-27");
    expect(iso(end)).toBe("2026-07-31");
  });

  it("does not mutate the date it was given", () => {
    const input = utc("2026-07-29");
    weekRange(input);
    expect(iso(input)).toBe("2026-07-29");
  });
});

describe("latestViewableDate", () => {
  it("returns today on a teaching day", () => {
    for (const d of [
      "2026-07-27", // Mon
      "2026-07-29", // Wed
      "2026-07-31", // Fri
    ]) {
      expect(iso(latestViewableDate(utc(d)))).toBe(d);
    }
  });

  it("returns Friday when today is Saturday", () => {
    expect(iso(latestViewableDate(utc("2026-08-01")))).toBe("2026-07-31");
  });

  it("returns Friday when today is Sunday", () => {
    expect(iso(latestViewableDate(utc("2026-08-02")))).toBe("2026-07-31");
  });

  it("steps back across a month boundary on Sunday", () => {
    // Sunday 1 March 2026 — the Friday that closed the week is in February.
    expect(iso(latestViewableDate(utc("2026-03-01")))).toBe("2026-02-27");
  });

  it("does not mutate the date it was given", () => {
    const input = utc("2026-08-02");
    latestViewableDate(input);
    expect(iso(input)).toBe("2026-08-02");
  });
});

describe("formatWeekRange", () => {
  it("formats a week spanning two months with one year", () => {
    const { start, end } = weekRange(utc("2026-08-31"));
    expect(formatWeekRange(start, end)).toBe("AUGUST 31 → SEPTEMBER 4, 2026");
  });

  it("formats a week inside a single month", () => {
    const { start, end } = weekRange(utc("2026-07-08"));
    expect(formatWeekRange(start, end)).toBe("JULY 6 → JULY 10, 2026");
  });

  it("shows both years when the week straddles New Year", () => {
    const { start, end } = weekRange(utc("2026-12-31"));
    expect(formatWeekRange(start, end)).toBe(
      "DECEMBER 28, 2026 → JANUARY 1, 2027",
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/lib/week.test.ts`
Expected: FAIL — several assertions expect Friday where the implementation still returns Saturday, and `latestViewableDate` returns Saturday unchanged for `2026-08-01`.

- [ ] **Step 3: Update the implementation**

In `lib/week.ts`, export `MONTHS` by changing its declaration line:

```ts
export const MONTHS = [
```

Replace the `weekRange` comment and body with:

```ts
// The teaching week runs Monday to Friday, matching the five days the
// WeekDayPicker offers. Saturday and Sunday belong to the week that has just
// ended, not the one about to start.
export function weekRange(date: Date): { start: Date; end: Date } {
  const dayOfWeek = date.getUTCDay(); // 0 = Sunday
  const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

  const start = new Date(date);
  start.setUTCDate(start.getUTCDate() - daysSinceMonday);

  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 4); // Monday + 4 = Friday

  return { start, end };
}
```

Replace the `latestViewableDate` comment and body with:

```ts
// The latest day a student may look at. Normally today — but neither weekend
// day is a teaching day and neither has a dot in the picker, so the page opens
// on the Friday that closed the week rather than on a blank day. This doubles
// as the ceiling for an explicit ?date=, which is also what keeps a Saturday
// card left behind by an earlier six-day week out of reach.
export function latestViewableDate(today: Date): Date {
  const dayOfWeek = today.getUTCDay(); // 0 = Sunday, 6 = Saturday
  if (dayOfWeek !== 0 && dayOfWeek !== 6) return today;

  const friday = new Date(today);
  friday.setUTCDate(friday.getUTCDate() - (dayOfWeek === 0 ? 2 : 1));
  return friday;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/lib/week.test.ts`
Expected: PASS, 14 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/week.ts tests/lib/week.test.ts
git commit -m "feat: end the teaching week on Friday"
```

---

### Task 3: Drop Saturday from the student picker

**Files:**
- Modify: `components/WeekDayPicker.tsx`
- Modify: `app/g/[slug]/page.tsx:15`

**Interfaces:**
- Consumes: `latestViewableDate` and `weekRange` from Task 2 (already wired; no signature change).
- Produces: nothing new.

- [ ] **Step 1: Remove the Samedi entry**

In `components/WeekDayPicker.tsx`, delete this line from `FRENCH_DAYS`:

```tsx
  { letter: "S", label: "Samedi" },
```

`currentWeekDates` maps over `FRENCH_DAYS`, so it produces five dates with no further change. Do not touch it.

- [ ] **Step 2: Correct the stale comment on the student page**

In `app/g/[slug]/page.tsx`, replace the comment inside `parseDate`:

```tsx
  // Clamp future-dated requests so students can never peek at words the
  // teacher has pre-posted ahead of time (a supported workflow). `latest` is
  // today, except at the weekend when it is the Friday that closed the week.
```

- [ ] **Step 3: Verify the whole suite and build still pass**

Run: `npm run lint && npm run typecheck && npm test && npm run build`
Expected: all pass. No test covers these two files directly; this step is here to catch a typo before it is committed.

- [ ] **Step 4: Commit**

```bash
git add components/WeekDayPicker.tsx "app/g/[slug]/page.tsx"
git commit -m "feat: show five day buttons on the student picker"
```

---

### Task 4: Snap admin weekend dates forward

The server-side backstop. Task 6 removes the weekend from the UI; this covers a hand-typed `?date=`, an old bookmark, or a link written before the week became five days.

**Files:**
- Modify: `lib/admin-date.ts`
- Test: `tests/lib/admin-date.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `export function parseAdminDate(value: string | undefined, today: string): string` — unchanged signature; the returned date is now never a Saturday or Sunday.

- [ ] **Step 1: Rewrite the tests**

Replace the whole of `tests/lib/admin-date.test.ts` with:

```ts
import { describe, it, expect } from "vitest";
import { parseAdminDate } from "@/lib/admin-date";

// A Wednesday. The old suite used a Sunday, which now snaps forward and would
// make every fallback assertion below say something it does not mean.
const TODAY = "2026-07-29";

describe("parseAdminDate", () => {
  it("returns today when the value is missing", () => {
    expect(parseAdminDate(undefined, TODAY)).toBe(TODAY);
  });

  it("returns today for an empty string", () => {
    expect(parseAdminDate("", TODAY)).toBe(TODAY);
  });

  it("returns today for an unparseable value", () => {
    expect(parseAdminDate("not-a-date", TODAY)).toBe(TODAY);
  });

  it("returns today for a wrongly shaped value", () => {
    expect(parseAdminDate("2026-7-4", TODAY)).toBe(TODAY);
  });

  it("returns today for a date that does not exist", () => {
    expect(parseAdminDate("2026-02-31", TODAY)).toBe(TODAY);
  });

  it("returns a past weekday unchanged", () => {
    expect(parseAdminDate("2026-01-15", TODAY)).toBe("2026-01-15");
  });

  it("returns a future weekday unchanged, without clamping", () => {
    expect(parseAdminDate("2027-03-09", TODAY)).toBe("2027-03-09");
  });

  it("returns today's own date unchanged", () => {
    expect(parseAdminDate(TODAY, TODAY)).toBe(TODAY);
  });
});

describe("parseAdminDate weekend snapping", () => {
  it("snaps a Saturday to the following Monday", () => {
    expect(parseAdminDate("2026-08-01", TODAY)).toBe("2026-08-03");
  });

  it("snaps a Sunday to the following Monday", () => {
    expect(parseAdminDate("2026-08-02", TODAY)).toBe("2026-08-03");
  });

  it("snaps across a month boundary", () => {
    // Saturday 31 October 2026.
    expect(parseAdminDate("2026-10-31", TODAY)).toBe("2026-11-02");
  });

  it("snaps a future weekend without clamping it to today", () => {
    // Saturday 13 March 2027 — still in the future after snapping.
    expect(parseAdminDate("2027-03-13", TODAY)).toBe("2027-03-15");
  });

  it("snaps the today fallback when today is itself a weekend", () => {
    expect(parseAdminDate(undefined, "2026-08-02")).toBe("2026-08-03");
  });

  it("snaps the today fallback when the value was unusable", () => {
    expect(parseAdminDate("not-a-date", "2026-08-01")).toBe("2026-08-03");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/lib/admin-date.test.ts`
Expected: FAIL — the six tests in the `weekend snapping` block all return the weekend date unchanged. The first block passes already.

- [ ] **Step 3: Rewrite the implementation**

Replace the whole of `lib/admin-date.ts` with:

```ts
// Returns the value only if it is a real, correctly shaped date. Date rolls
// overflow forward — "2026-02-31" parses to March 3rd rather than failing — so
// comparing the normalised output against the input rejects any value that
// silently shifted.
function validate(value: string | undefined): string | null {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;

  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  if (parsed.toISOString().slice(0, 10) !== value) return null;

  return value;
}

// The teaching week is Monday to Friday, so a weekend date is a day no student
// can ever be shown. The admin calendar has no weekend cell to click; this
// catches the ways round it — a hand-typed ?date=, an old bookmark, a link
// written while the week still ran to Saturday.
function snapWeekendForward(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  const dayOfWeek = date.getUTCDay(); // 0 = Sunday, 6 = Saturday
  if (dayOfWeek !== 0 && dayOfWeek !== 6) return value;

  date.setUTCDate(date.getUTCDate() + (dayOfWeek === 0 ? 1 : 2));
  return date.toISOString().slice(0, 10);
}

// Deliberately does NOT clamp future dates the way the student page's
// parseDate does. Students must not read ahead; the teacher pre-posts ahead on
// purpose, and clamping would make those days unreachable from /admin. The
// weekend snap above is a different rule and applies to the `today` fallback
// too, so the returned date is never a Saturday or Sunday.
export function parseAdminDate(
  value: string | undefined,
  today: string,
): string {
  return snapWeekendForward(validate(value) ?? today);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/lib/admin-date.test.ts`
Expected: PASS, 14 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/admin-date.ts tests/lib/admin-date.test.ts
git commit -m "feat: snap admin weekend dates to the following Monday"
```

---

### Task 5: The weekday-only month grid

The data behind the admin calendar. Pure, so the grid can be wrong in a test rather than in front of the teacher.

**Files:**
- Create: `lib/month-grid.ts`
- Test: `tests/lib/month-grid.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `export type MonthCell = { date: string; inMonth: boolean }` — `date` is `YYYY-MM-DD`
  - `export function monthWeekdayRows(year: number, month: number): MonthCell[][]` — `month` is 0-indexed, matching `Date.UTC`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/month-grid.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { monthWeekdayRows } from "@/lib/month-grid";

const dates = (rows: { date: string }[][]) => rows.map((r) => r.map((c) => c.date));

describe("monthWeekdayRows", () => {
  it("leads with the previous month when the 1st falls on a Saturday", () => {
    // August 2026 begins on a Saturday, so the week containing the 1st has no
    // August weekdays in it at all.
    const rows = monthWeekdayRows(2026, 7);
    expect(dates(rows)).toEqual([
      ["2026-07-27", "2026-07-28", "2026-07-29", "2026-07-30", "2026-07-31"],
      ["2026-08-03", "2026-08-04", "2026-08-05", "2026-08-06", "2026-08-07"],
      ["2026-08-10", "2026-08-11", "2026-08-12", "2026-08-13", "2026-08-14"],
      ["2026-08-17", "2026-08-18", "2026-08-19", "2026-08-20", "2026-08-21"],
      ["2026-08-24", "2026-08-25", "2026-08-26", "2026-08-27", "2026-08-28"],
      ["2026-08-31", "2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04"],
    ]);
  });

  it("marks cells outside the month", () => {
    const rows = monthWeekdayRows(2026, 7);
    expect(rows[0].every((c) => !c.inMonth)).toBe(true);
    expect(rows[1].every((c) => c.inMonth)).toBe(true);
    expect(rows[5].map((c) => c.inMonth)).toEqual([
      true,
      false,
      false,
      false,
      false,
    ]);
  });

  it("has no leading cells when the 1st falls on a Monday", () => {
    // June 2026 begins on a Monday and ends on Tuesday the 30th.
    const rows = monthWeekdayRows(2026, 5);
    expect(rows[0][0].date).toBe("2026-06-01");
    expect(rows[0].every((c) => c.inMonth)).toBe(true);
    expect(rows[rows.length - 1].map((c) => c.date)).toEqual([
      "2026-06-29",
      "2026-06-30",
      "2026-07-01",
      "2026-07-02",
      "2026-07-03",
    ]);
  });

  it("leads with the previous month when the 1st falls on a Sunday", () => {
    // November 2026 begins on a Sunday, which belongs to October's last week.
    const rows = monthWeekdayRows(2026, 10);
    expect(dates(rows)[0]).toEqual([
      "2026-10-26",
      "2026-10-27",
      "2026-10-28",
      "2026-10-29",
      "2026-10-30",
    ]);
    expect(rows[1][0].date).toBe("2026-11-02");
  });

  it("includes the 29th in a leap February", () => {
    // February 2028 begins on a Tuesday and ends on Tuesday the 29th.
    const rows = monthWeekdayRows(2028, 1);
    const inMonth = rows.flat().filter((c) => c.inMonth);
    expect(inMonth[0].date).toBe("2028-02-01");
    expect(inMonth[inMonth.length - 1].date).toBe("2028-02-29");
  });

  it("never produces a Saturday or Sunday, in any month of a year", () => {
    for (let month = 0; month < 12; month++) {
      for (const cell of monthWeekdayRows(2026, month).flat()) {
        const day = new Date(`${cell.date}T00:00:00Z`).getUTCDay();
        expect(day).toBeGreaterThanOrEqual(1);
        expect(day).toBeLessThanOrEqual(5);
      }
    }
  });

  it("always produces rows of exactly five cells", () => {
    for (let month = 0; month < 12; month++) {
      for (const row of monthWeekdayRows(2026, month)) {
        expect(row).toHaveLength(5);
      }
    }
  });

  it("marks inMonth for exactly the weekdays of the requested month", () => {
    // September 2026 has 22 weekdays.
    const inMonth = monthWeekdayRows(2026, 8)
      .flat()
      .filter((c) => c.inMonth);
    expect(inMonth).toHaveLength(22);
    expect(inMonth.every((c) => c.date.startsWith("2026-09-"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/lib/month-grid.test.ts`
Expected: FAIL — the suite cannot resolve `@/lib/month-grid`.

- [ ] **Step 3: Write the implementation**

Create `lib/month-grid.ts`:

```ts
export type MonthCell = { date: string; inMonth: boolean };

// Rows of exactly five cells, Monday to Friday. The weekend dates of each week
// are absent rather than blanked out: the admin calendar's whole purpose is
// that there is no Saturday cell to click, and a greyed-out one would be a
// weaker version of the same idea.
//
// Rows run from the Monday of the week containing the 1st to the Friday of the
// week containing the last day, so days from the neighbouring months appear at
// both ends. They stay selectable — Monday 31 August and Tuesday 1 September
// are consecutive teaching days, and changing month between them would be
// absurd. `month` is 0-indexed, matching Date.UTC.
export function monthWeekdayRows(year: number, month: number): MonthCell[][] {
  const first = new Date(Date.UTC(year, month, 1));
  const last = new Date(Date.UTC(year, month + 1, 0));

  // Sunday counts back six days, not none: a Sunday belongs to the week that
  // has just ended, the same rule lib/week.ts uses.
  const firstDayOfWeek = first.getUTCDay();
  const cursor = new Date(first);
  cursor.setUTCDate(
    cursor.getUTCDate() - (firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1),
  );

  const rows: MonthCell[][] = [];
  // The cursor sits on a Monday at the top of each pass, so this asks "does the
  // month reach into this week?" — true for the week holding the last day even
  // when that day is a Saturday or Sunday.
  while (cursor.getTime() <= last.getTime()) {
    const row: MonthCell[] = [];
    for (let i = 0; i < 5; i++) {
      row.push({
        date: cursor.toISOString().slice(0, 10),
        inMonth:
          cursor.getUTCFullYear() === year && cursor.getUTCMonth() === month,
      });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    cursor.setUTCDate(cursor.getUTCDate() + 2); // step over Saturday and Sunday
    rows.push(row);
  }

  return rows;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/lib/month-grid.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/month-grid.ts tests/lib/month-grid.test.ts
git commit -m "feat: build a weekday-only month grid"
```

---

### Task 6: The admin calendar

Replace the native date input, which takes only `min` and `max` and so cannot exclude a weekday.

**Files:**
- Modify: `components/ui/Input.tsx`
- Modify: `components/admin/AdminDatePicker.tsx` (full rewrite)
- Modify: `app/admin/page.tsx` — pass `today` to `AdminDatePicker`
- Modify: `app/admin/[slug]/page.tsx` — pass `today` to `AdminDatePicker`

**Interfaces:**
- Consumes:
  - `monthWeekdayRows(year, month)` and `MonthCell` from Task 5
  - `MONTHS` from Task 2
- Produces:
  - `export const inputClassName: string` from `components/ui/Input.tsx`
  - `AdminDatePicker` props become `{ basePath: string; selected: string; today: string }`

- [ ] **Step 1: Extract the field class string**

`AdminDatePicker`'s trigger is a `<button>`, so it cannot reuse the `Input` component, but it must look like the same form field. Replace the whole of `components/ui/Input.tsx` with:

```tsx
import { cn } from "@/lib/utils";
import type { InputHTMLAttributes } from "react";

// Shared with AdminDatePicker's trigger, which has to look like this field but
// is a button rather than an input.
export const inputClassName =
  "mt-1 block w-full rounded-lg border border-[var(--color-ink-muted)]/30 bg-white px-3 py-2 font-[family-name:var(--font-body)] text-base sm:text-sm text-[var(--color-ink)] focus:border-[var(--color-accent)] focus:outline-none";

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(inputClassName, className)} {...props} />;
}
```

- [ ] **Step 2: Rewrite the picker**

Replace the whole of `components/admin/AdminDatePicker.tsx` with:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { monthWeekdayRows } from "@/lib/month-grid";
import { MONTHS } from "@/lib/week";
import { inputClassName } from "@/components/ui/Input";
import { cn } from "@/lib/utils";

// Full names so React has a distinct key per column — two of the five initials
// are "M".
const WEEKDAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi"];

const utc = (value: string) => new Date(`${value}T00:00:00Z`);

function formatFull(value: string): string {
  return utc(value).toLocaleDateString("en-CA", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function AdminDatePicker({
  basePath,
  selected,
  today,
}: {
  basePath: string;
  selected: string;
  today: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // Which month the grid is showing. Seeded when the popover opens rather than
  // held in sync with `selected`, so opening always lands on the selected day's
  // month however far the teacher paged away last time.
  const [cursor, setCursor] = useState(() => ({
    year: utc(selected).getUTCFullYear(),
    month: utc(selected).getUTCMonth(),
  }));
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    // mousedown rather than click: a click that starts outside and ends on the
    // trigger would otherwise close and immediately reopen the popover.
    const onMouseDown = (event: MouseEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onMouseDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onMouseDown);
    };
  }, [open]);

  function toggle() {
    if (!open) {
      setCursor({
        year: utc(selected).getUTCFullYear(),
        month: utc(selected).getUTCMonth(),
      });
    }
    setOpen(!open);
  }

  function stepMonth(delta: number) {
    const stepped = new Date(Date.UTC(cursor.year, cursor.month + delta, 1));
    setCursor({
      year: stepped.getUTCFullYear(),
      month: stepped.getUTCMonth(),
    });
  }

  function choose(date: string) {
    setOpen(false);
    router.push(`${basePath}?date=${date}`, { scroll: false });
  }

  const rows = monthWeekdayRows(cursor.year, cursor.month);

  return (
    <div ref={rootRef} className="relative mx-auto mb-6 w-full max-w-[560px]">
      <span className="block text-sm font-medium text-[var(--color-ink)]">
        Date
      </span>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={toggle}
        // Capped rather than full-width: a date field needs about 220px, and
        // stretching it the whole width of the card made it the widest thing
        // on the page on a phone.
        className={cn(inputClassName, "max-w-[260px] text-left")}
      >
        {formatFull(selected)}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Choose a date"
          className="absolute left-0 z-20 mt-2 w-[300px] rounded-xl border border-[var(--color-ink-muted)]/20 bg-white p-3 shadow-lg"
        >
          <div className="flex items-center justify-between">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => stepMonth(-1)}
              className="rounded-full px-3 py-1 text-[var(--color-ink-muted)] transition-colors hover:bg-[var(--color-bg)]"
            >
              ‹
            </button>
            <span className="font-[family-name:var(--font-body)] text-xs font-semibold uppercase tracking-[2px] text-[var(--color-ink)]">
              {MONTHS[cursor.month]} {cursor.year}
            </span>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => stepMonth(1)}
              className="rounded-full px-3 py-1 text-[var(--color-ink-muted)] transition-colors hover:bg-[var(--color-bg)]"
            >
              ›
            </button>
          </div>

          <div className="mt-3 grid grid-cols-5 gap-1">
            {WEEKDAYS.map((name) => (
              <div
                key={name}
                aria-hidden
                className="py-1 text-center font-[family-name:var(--font-body)] text-[11px] font-semibold uppercase text-[var(--color-ink-muted)]"
              >
                {name[0]}
              </div>
            ))}

            {rows.flat().map((cell) => {
              const isSelected = cell.date === selected;
              const isToday = cell.date === today;

              return (
                <button
                  key={cell.date}
                  type="button"
                  aria-label={formatFull(cell.date)}
                  aria-pressed={isSelected}
                  aria-current={isToday ? "date" : undefined}
                  onClick={() => choose(cell.date)}
                  className={cn(
                    "rounded-lg py-1.5 text-center font-[family-name:var(--font-body)] text-sm transition-colors",
                    isSelected
                      ? "bg-[var(--color-accent)] font-semibold text-white"
                      : "text-[var(--color-ink)] hover:bg-[var(--color-bg)]",
                    !isSelected && isToday && "font-bold text-[var(--color-accent)]",
                    !cell.inMonth && "opacity-40",
                  )}
                >
                  {Number(cell.date.slice(8, 10))}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
```

There is no month bound in either direction. Pre-posting is a supported workflow, and a ceiling here would be the student page's rule leaking onto the teacher's side.

- [ ] **Step 3: Pass `today` from both admin pages**

`today` is already computed in both files, one line above the `parseAdminDate` call. Passing it keeps the clock out of the component, where it would be read during render.

In `app/admin/page.tsx`:

```tsx
          <AdminDatePicker basePath="/admin" selected={selected} today={today} />
```

In `app/admin/[slug]/page.tsx`:

```tsx
          <AdminDatePicker
            basePath={`/admin/${slug}`}
            selected={selected}
            today={today}
          />
```

- [ ] **Step 4: Verify the suite and build**

Run: `npm run lint && npm run typecheck && npm test && npm run build`
Expected: all pass.

- [ ] **Step 5: Check it in a browser**

Run: `npm run dev`, log in, and open `/admin`.

1. The Date field reads as a full date, e.g. `Wednesday, July 29, 2026`.
2. Clicking it opens a calendar with five columns headed `L M M J V`. **There is no Saturday or Sunday column.**
3. `‹` and `›` change month and select nothing.
4. Paging to August 2026 shows a dimmed 27–31 July on the first row and a dimmed 1–4 September on the last.
5. Clicking a dimmed 1 September navigates to `?date=2026-09-01` — adjacent-month days are selectable.
6. Clicking any day closes the popover and loads that date's card or the compose flow.
7. Escape closes the popover and returns focus to the trigger; clicking the page outside it closes it too.
8. `/admin/<a group slug>` behaves identically and navigates within `/admin/<slug>`.
9. Visiting `/admin?date=2026-08-01` by hand lands on Monday 3 August — Task 4's backstop.

- [ ] **Step 6: Commit**

```bash
git add components/ui/Input.tsx components/admin/AdminDatePicker.tsx app/admin/page.tsx "app/admin/[slug]/page.tsx"
git commit -m "feat: replace the admin date input with a weekday-only calendar"
```

---

### Task 7: The re-dating script

**Files:**
- Create: `scripts/reschedule-five-day-week.mjs`

**Interfaces:**
- Consumes: `shiftToFiveDayWeek(date, anchor)` from Task 1.
- Produces: nothing importable. This is a one-off, run once per environment.

- [ ] **Step 1: Write the script**

Create `scripts/reschedule-five-day-week.mjs`:

```js
// One-off, run once per environment. Removing Saturday from the teaching week
// moves content rather than deleting it, so this re-dates every card at or
// after the anchor onto consecutive Monday-Friday slots.
//
//   npx --yes tsx scripts/reschedule-five-day-week.mjs            # dry run
//   npx --yes tsx scripts/reschedule-five-day-week.mjs --apply    # writes
import { PrismaClient } from "@prisma/client";
import { shiftToFiveDayWeek } from "../lib/reschedule.ts";

const prisma = new PrismaClient();

// Hardcoded rather than derived from the clock: a run on the server a week
// after the dry run has to produce the same result as the dry run.
const ANCHOR = new Date("2026-07-27T00:00:00Z");

const apply = process.argv.includes("--apply");
const iso = (date) => date.toISOString().slice(0, 10);

async function finish(code) {
  await prisma.$disconnect();
  process.exit(code);
}

// Descending: date is unique on GlobalCard and (groupId, date) on Card, SQLite
// has no deferred constraint checking, and every card moves forward or stays
// put. Writing the furthest-future row first means each one always moves into a
// slot that has just been vacated.
const globals = await prisma.globalCard.findMany({
  where: { date: { gte: ANCHOR } },
  orderBy: { date: "desc" },
});
const overrides = await prisma.card.findMany({
  where: { date: { gte: ANCHOR } },
  orderBy: { date: "desc" },
});

const sundays = [...globals, ...overrides].filter(
  (card) => card.date.getUTCDay() === 0,
);
if (sundays.length > 0) {
  console.error("Cards sit on a Sunday at or after the anchor:");
  for (const card of sundays) console.error(`  ${iso(card.date)}  ${card.id}`);
  console.error("A Sunday has no slot in either week. Resolve these first.");
  await finish(1);
}

// The mapping is not idempotent — applied twice, a card on the second week's
// Tuesday moves to Wednesday and then to Thursday. After a successful apply no
// card sits on a Saturday, so this check makes a second run a no-op.
if (![...globals, ...overrides].some((card) => card.date.getUTCDay() === 6)) {
  console.log("already migrated, nothing to do");
  await finish(0);
}

const plan = (cards) =>
  cards.map((card) => ({ card, to: shiftToFiveDayWeek(card.date, ANCHOR) }));

const globalPlan = plan(globals);
const overridePlan = plan(overrides);

// Every card at or after the anchor is listed, unchanged ones included, so the
// printout is the whole affected set rather than a diff.
for (const { card, to } of globalPlan) {
  const same = card.date.getTime() === to.getTime();
  console.log(`GlobalCard  ${iso(card.date)} -> ${iso(to)}${same ? "  (unchanged)" : ""}`);
}
for (const { card, to } of overridePlan) {
  const same = card.date.getTime() === to.getTime();
  console.log(`Card ${card.groupId}  ${iso(card.date)} -> ${iso(to)}${same ? "  (unchanged)" : ""}`);
}

const moving = [...globalPlan, ...overridePlan].filter(
  ({ card, to }) => card.date.getTime() !== to.getTime(),
);

if (!apply) {
  console.log(`\n${moving.length} card(s) would move. Re-run with --apply to write.`);
  await finish(0);
}

await prisma.$transaction([
  ...globalPlan
    .filter(({ card, to }) => card.date.getTime() !== to.getTime())
    .map(({ card, to }) =>
      prisma.globalCard.update({ where: { id: card.id }, data: { date: to } }),
    ),
  ...overridePlan
    .filter(({ card, to }) => card.date.getTime() !== to.getTime())
    .map(({ card, to }) =>
      prisma.card.update({ where: { id: card.id }, data: { date: to } }),
    ),
]);

console.log(`\napplied: ${moving.length} card(s) moved`);
await finish(0);
```

- [ ] **Step 2: Run the dry run against the local database**

Run: `npx --yes tsx scripts/reschedule-five-day-week.mjs`
Expected: `already migrated, nothing to do`.

That is correct, not a failure: `dev.db` holds cards on Sunday 26 July and Monday 27 July only. The Sunday is before the anchor and so is not inspected, and there is no Saturday at or after the anchor. `tsx` is needed only because the script imports a `.ts` module — do not add it as a project dependency.

- [ ] **Step 3: Seed a Saturday locally so the mapping is actually exercised**

Run:

```bash
npx --yes tsx -e '
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
for (const [date, prompt] of [
  ["2026-08-01", "SEED SAT"],
  ["2026-08-03", "SEED MON"],
  ["2026-08-07", "SEED FRI"],
]) {
  await prisma.globalCard.create({
    data: {
      date: new Date(`${date}T00:00:00Z`),
      englishPrompt: prompt,
      frenchAnswer: prompt,
      examples: "",
    },
  });
}
await prisma.$disconnect();
'
```

- [ ] **Step 4: Dry-run again and read the mapping**

Run: `npx --yes tsx scripts/reschedule-five-day-week.mjs`
Expected, in descending date order, and **nothing written**:

```
GlobalCard  2026-08-07 -> 2026-08-10
GlobalCard  2026-08-03 -> 2026-08-04
GlobalCard  2026-08-01 -> 2026-08-03
GlobalCard  2026-07-27 -> 2026-07-27  (unchanged)

3 card(s) would move. Re-run with --apply to write.
```

- [ ] **Step 5: Apply, and confirm the rows moved**

Run:

```bash
npx --yes tsx scripts/reschedule-five-day-week.mjs --apply
npx --yes tsx scripts/reschedule-five-day-week.mjs
```

Expected: the first prints the same mapping then `applied: 3 card(s) moved`. The second prints `already migrated, nothing to do` — the guard has made the re-run a no-op, which is the property that matters most.

- [ ] **Step 6: Confirm the dates landed and clean up the seed**

Run:

```bash
npx --yes tsx -e '
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const seeded = await prisma.globalCard.findMany({
  where: { englishPrompt: { startsWith: "SEED " } },
  orderBy: { date: "asc" },
});
console.log(seeded.map((c) => `${c.date.toISOString().slice(0, 10)} ${c.englishPrompt}`));
await prisma.globalCard.deleteMany({ where: { englishPrompt: { startsWith: "SEED " } } });
await prisma.$disconnect();
'
```

Expected: `[ '2026-08-03 SEED SAT', '2026-08-04 SEED MON', '2026-08-10 SEED FRI' ]`, and the three rows are then deleted. Confirm `git status` shows no change to `prisma/dev.db` other than the file being gitignored.

- [ ] **Step 7: Commit**

```bash
git add scripts/reschedule-five-day-week.mjs
git commit -m "feat: add the one-off five-day-week re-dating script"
```

---

### Task 8: Document the rollout and deploy

**Files:**
- Modify: `docs/DEPLOY.md` — a new section after `## 4. Deploy`

**Interfaces:**
- Consumes: `scripts/reschedule-five-day-week.mjs` from Task 7.
- Produces: nothing.

- [ ] **Step 1: Document the one-off run**

In `docs/DEPLOY.md`, insert this section immediately after the `## 4. Deploy` section and before `---` / `## Installing deploy.sh (one time)`:

````markdown
## One-off: re-dating cards to the five-day week

Run **once**, on the deploy that moves the teaching week from Monday–Saturday to
Monday–Friday. `deploy.sh` does not run it; it is a data migration, not a schema
one, so nothing runs it for you.

```bash
ssh -i ~/.ssh/jenn-french.pem ubuntu@54.80.104.161
cd ~/jenn-french
~/backup-db.sh                                              # before anything
npx --yes tsx scripts/reschedule-five-day-week.mjs          # dry run, read it
npx --yes tsx scripts/reschedule-five-day-week.mjs --apply
pm2 restart jenn-french
```

Read the dry run before applying. It lists every card at or after Monday
27 July 2026 with the date it will move to, unchanged rows included.

Order matters: deploy the code **first**, then run the script. Between the two
there are Saturday cards the picker no longer offers, so that one day is
unreachable for a few minutes. The other order is worse — cards would be
re-dated while the picker still showed a Saturday dot pointing at a day that had
just been vacated.

Re-running is safe. Once no card sits on a Saturday the script prints
`already migrated, nothing to do` and writes nothing. **Rollback for a bad apply
is the backup from step one**, not a reverse run — the mapping only goes
forward.
````

- [ ] **Step 2: Run every check CI runs**

Run: `npm run lint && npm run typecheck && npm test && npm run build`
Expected: all pass. Do not continue on a failure.

- [ ] **Step 3: Check the student page end to end**

Run `npm run dev` and open `/g/all`.

1. The picker shows five dots, `L M M J V`. There is no `S`.
2. The header week range ends on a Friday.
3. `/g/all?date=2026-08-01` (a Saturday) clamps back rather than rendering a Saturday.
4. A weekday with a card still renders it; a weekday without one still says nothing was posted.

- [ ] **Step 4: Commit**

```bash
git add docs/DEPLOY.md
git commit -m "docs: record the one-off five-day-week re-dating run"
```

- [ ] **Step 5: Push and wait for CI**

```bash
git push origin main
gh run watch
```

Expected: green. Do not deploy a red build.

- [ ] **Step 6: Deploy, then re-date**

```bash
ssh -i ~/.ssh/jenn-french.pem ubuntu@54.80.104.161 './deploy.sh'

ssh -i ~/.ssh/jenn-french.pem ubuntu@54.80.104.161
cd ~/jenn-french
~/backup-db.sh
npx --yes tsx scripts/reschedule-five-day-week.mjs
```

**Stop and read the mapping.** Confirm the first Saturday listed moves to the
Monday after it and that the last date printed is where Jenn expects her
furthest pre-posted card to land. Then:

```bash
npx --yes tsx scripts/reschedule-five-day-week.mjs --apply
pm2 restart jenn-french
```

- [ ] **Step 7: Verify production**

Open `https://francaisavecjenn.ca/g/all`. The picker shows five dots, today's
card renders, and the dates that used to hold Saturday content now hold it on a
Monday. Log in to `/admin` and confirm the calendar has no weekend column.

---

## Self-Review

**Spec coverage.** The re-dating rule and its compounding drift → Task 1. The anchor at 2026-07-27 and its hardcoding → Task 1's tests and Task 7's constant. Sunday throws → Task 1. `weekRange` ending Friday and `latestViewableDate` clamping both weekend days → Task 2. Five buttons in the student picker → Task 3. `parseAdminDate` snapping weekends, fallback included → Task 4. The weekday-only month grid, whole weeks, selectable adjacent-month days → Task 5. The calendar replacing the native input, month arrows, Escape and outside-click, `aria-pressed`/`aria-current`, opening on the selected month, app palette, `Input` styling reused → Task 6. Dry run by default, one mapping for both tables, descending order inside a transaction, the idempotency guard, the Sunday abort → Task 7. Backup, deploy-then-script ordering, rollback via backup → Task 8. No Prisma migration, per Global Constraints.

**Placeholders.** None. Every code step carries the full file or the exact lines to change; every run step carries the command and its expected output, including Step 2 of Tasks 1 and 5 whose expected result is a specific failure, and Step 2 of Task 7 whose expected result is `already migrated, nothing to do` on a database that legitimately has nothing to migrate.

**Type consistency.** `shiftToFiveDayWeek(date, anchor)` is defined in Task 1 and called with that signature in Task 7. `monthWeekdayRows(year, month)` and `MonthCell { date, inMonth }` are defined in Task 5 and consumed in Task 6 as `rows.flat().map((cell) => …)` using `cell.date` and `cell.inMonth`. `MONTHS` is exported in Task 2 and imported in Task 6. `inputClassName` is exported in Task 6 Step 1 and used in Task 6 Step 2. `AdminDatePicker` gains a `today: string` prop in Task 6 Step 2 and both call sites are updated in Task 6 Step 3, so the prop is never missing at a compile step. `parseAdminDate`'s signature is unchanged in Task 4, so no caller moves.

**Ordering.** Task 7 depends on Task 1; Task 6 depends on Tasks 2 and 5; Task 8 depends on Task 7. Tasks 2, 3, 4 and 5 are independent of one another. No task leaves `npm run build` broken.
