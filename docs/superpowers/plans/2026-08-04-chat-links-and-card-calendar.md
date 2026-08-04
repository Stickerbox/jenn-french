# Chat Links, Card Calendar and Three Withheld Controls — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** File links shared in the lesson chat onto that student's Files shelf automatically, give the student's card page a month calendar so they can read past cards, and stop the UI withholding three controls the server already permits — per `docs/superpowers/specs/2026-08-04-chat-links-and-card-calendar-design.md`.

**Architecture:** Four new pure modules in `lib/` carry every rule (URL extraction, day selectability, the Monday arithmetic, the auth-panel decision) and are unit-tested without a database. One new Prisma module files chat links, called from the single existing chat POST route. One shared `MonthCalendar` panel is extracted from the admin's date picker and rendered by both pickers, each keeping its own trigger and dismissal. The remaining three items are prop and className changes to existing components.

**Tech Stack:** Next.js 16 (App Router), TypeScript 5 strict, React 19, Tailwind CSS v4 (PostCSS, no config file), Prisma 6 + SQLite, Vitest, ESLint 9.

---

## Global Constraints

- **No migration.** No column is added, dropped or changed. Do not touch `prisma/schema.prisma`. If you find yourself wanting to, stop and re-read the spec.
- **Read the spec first:** `docs/superpowers/specs/2026-08-04-chat-links-and-card-calendar-design.md`. It records *why* each decision is what it is; this plan records *how*.
- **Logic belongs in `lib/`.** Anything with a rule in it is a pure function in `lib/` with a test in `tests/lib/`. Components and Prisma access are not unit-tested; the pure modules underneath them are.
- **Comments explain the why, especially the counter-intuitive.** Most comments in this codebase record a decision and the failure that motivated it. The comments in this plan's code blocks are part of the deliverable — **copy them verbatim**, do not summarise them away.
- **Every date is UTC midnight**, built as ``new Date(`${str}T00:00:00Z`)`` and formatted with `timeZone: "UTC"`. `lib/chat-time.ts` is the only module in this project that reads a local zone. Nothing you write here may follow it.
- **"Student" is the UI word, "Group" is the code word.** `group` in `lib/`, `prisma/` and route segments; `student` in copy and in new modules with no reason to touch the model.
- **Imports use the `@/` alias** for repo-root-relative paths.
- Tailwind classes only; design tokens are the CSS custom properties in `app/globals.css`. Two distinct palettes: `--color-*` (admin) and `--card-*` (flashcard template). Never mix them in one component.
- **Commit after every task**, with the trailer shown in each commit step. This is required by the organisation's git-attribution policy, not a stylistic preference.
- Run `npx vitest run <file>` for one file while iterating; the full check before you claim a task is done is in Task 13.

## File Structure

**New — pure, tested**

| File | Responsibility |
|---|---|
| `lib/chat-links.ts` | Which URLs in a message body become shelf links. Nothing else. |
| `lib/card-dates.ts` | Whether a student may open the card for a given date. |

**New — impure**

| File | Responsibility |
|---|---|
| `lib/shelf-links.ts` | Files extracted links onto one shelf, skipping duplicates. Prisma; never throws. |
| `components/ui/MonthCalendar.tsx` | The month grid *panel* inside a date popover. No open state, no trigger, no dismissal. |
| `components/student/CardDateNav.tsx` | Every date control on the student's card tab: range trigger, calendar, *Aujourd'hui*, five day dots. |

**Deleted**

| File | Why |
|---|---|
| `components/WeekDayPicker.tsx` | Absorbed by `CardDateNav`. The student page is its only caller. |

**Modified**

`lib/week.ts` · `lib/cards.ts` · `lib/student-gate.ts` · `app/api/chat/[slug]/route.ts` · `app/g/[slug]/page.tsx` · `app/admin/page.tsx` · `components/admin/AdminChrome.tsx` · `components/admin/AdminDatePicker.tsx` · `components/admin/PageList.tsx` · `components/admin/PagesTabClient.tsx` · `components/student/CardHeading.tsx` · `components/student/FilesTab.tsx` · `components/student/StudentAuthPanel.tsx` · `tests/lib/week.test.ts` · `tests/lib/student-gate.test.ts` · `CLAUDE.md`

## Task Order

Tasks 1–3 are pure modules with no dependents yet, so they cannot break anything. Task 4 completes spec item 1. Tasks 5–8 are the three withheld controls (items 2, 3, 4) and are independent of each other. Tasks 9–11 build item 5, and **Task 9 must land before Task 11** because `CardDateNav` renders the component Task 9 extracts. Task 12 is the CLAUDE.md update; Task 13 is full verification.

---

### Task 1: `mondayOf` and `weekDates` in `lib/week.ts`

The arithmetic `dayOfWeek === 0 ? 6 : dayOfWeek - 1` is written out three times in this codebase. Two of the three collapse here. `weekDates` is the point: it takes *any* date, which is what later lets the student's day strip show the selected week instead of the current one.

`lib/month-grid.ts` also contains a copy and is **deliberately left alone** — it steps over weekends as it walks and has its own tests, and rewriting a tested module to save four lines is not what this change is for.

**Files:**
- Modify: `lib/week.ts:19-30` (`weekRange`)
- Test: `tests/lib/week.test.ts`

- [x] **Step 1: Write the failing tests**

Add these two `describe` blocks to `tests/lib/week.test.ts`, after the existing `weekRange` block. The file's `utc` and `iso` helpers already exist at the top — use them, do not redefine them.

```ts
describe("mondayOf", () => {
  it("returns the date itself for a Monday", () => {
    expect(iso(mondayOf(utc("2026-07-27")))).toBe("2026-07-27");
  });

  it("steps back to Monday from a midweek day", () => {
    expect(iso(mondayOf(utc("2026-07-29")))).toBe("2026-07-27");
  });

  it("steps back to Monday from the Friday itself", () => {
    expect(iso(mondayOf(utc("2026-07-31")))).toBe("2026-07-27");
  });

  it("treats Saturday as part of the week just finished", () => {
    expect(iso(mondayOf(utc("2026-08-01")))).toBe("2026-07-27");
  });

  it("counts a Sunday back six days, not none", () => {
    // The rule the whole module turns on: a Sunday belongs to the week that has
    // just ended, so it must not resolve to the Monday of the week ahead.
    expect(iso(mondayOf(utc("2026-08-02")))).toBe("2026-07-27");
  });

  it("steps back across a month boundary", () => {
    expect(iso(mondayOf(utc("2026-09-02")))).toBe("2026-08-31");
  });

  it("does not mutate the date it was given", () => {
    const input = utc("2026-07-29");
    mondayOf(input);
    expect(iso(input)).toBe("2026-07-29");
  });
});

describe("weekDates", () => {
  const july = [
    "2026-07-27",
    "2026-07-28",
    "2026-07-29",
    "2026-07-30",
    "2026-07-31",
  ];

  it("returns the five teaching days, Monday first", () => {
    expect(weekDates(utc("2026-07-29")).map(iso)).toEqual(july);
  });

  it("returns the same five days from any day of that week, weekend included", () => {
    for (const day of ["2026-07-27", "2026-07-31", "2026-08-01", "2026-08-02"]) {
      expect(weekDates(utc(day)).map(iso)).toEqual(july);
    }
  });

  it("crosses a month boundary inside one week", () => {
    expect(weekDates(utc("2026-09-01")).map(iso)).toEqual([
      "2026-08-31",
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
      "2026-09-04",
    ]);
  });

  it("does not mutate the date it was given", () => {
    const input = utc("2026-09-01");
    weekDates(input);
    expect(iso(input)).toBe("2026-09-01");
  });
});
```

Extend the import on line 2 of the same file:

```ts
import {
  weekRange,
  formatWeekRange,
  latestViewableDate,
  mondayOf,
  weekDates,
} from "@/lib/week";
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/lib/week.test.ts`

Expected: FAIL. The message names the missing exports — `mondayOf is not a function` / `weekDates is not a function`.

- [x] **Step 3: Implement both functions and rewrite `weekRange` in their terms**

In `lib/week.ts`, replace the whole `weekRange` function (currently lines 16–30, including its comment) with:

```ts
// The Monday of the week containing `date`. A Sunday counts back six days, not
// none: the teaching week runs Monday to Friday and a Sunday belongs to the
// week that has just ended, not the one about to start.
//
// Extracted because this arithmetic was written out three times — here, in the
// student page's day strip, and in lib/month-grid.ts — and each copy carried
// its own version of the sentence above. month-grid.ts keeps its copy: it steps
// over the weekend as it walks a whole month, which is a different job.
export function mondayOf(date: Date): Date {
  const dayOfWeek = date.getUTCDay(); // 0 = Sunday
  const monday = new Date(date);
  monday.setUTCDate(
    monday.getUTCDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1),
  );
  return monday;
}

// The five teaching days of the week containing `date`, Monday first.
//
// It takes any date rather than today, and that is the entire reason it exists:
// the student's day strip used to compute its five days from `today` and so
// could only ever show the week we are in.
export function weekDates(date: Date): Date[] {
  const monday = mondayOf(date);
  return Array.from({ length: 5 }, (_, index) => {
    const day = new Date(monday);
    day.setUTCDate(day.getUTCDate() + index);
    return day;
  });
}

// The teaching week runs Monday to Friday, matching the five days the student's
// day strip offers. Saturday and Sunday belong to the week that has just ended,
// not the one about to start.
export function weekRange(date: Date): { start: Date; end: Date } {
  const start = mondayOf(date);

  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 4); // Monday + 4 = Friday

  return { start, end };
}
```

`new Date(date)` copies rather than aliases, which is what keeps the three "does not mutate" tests green.

- [x] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/lib/week.test.ts`

Expected: PASS, all blocks. The pre-existing `weekRange` assertions passing unchanged is what proves this was a refactor and not a behaviour change — if any of them fail, `mondayOf` is wrong, not the test.

- [x] **Step 5: Commit**

```bash
git add lib/week.ts tests/lib/week.test.ts && git commit -m "refactor: extract mondayOf and weekDates in lib/week" --trailer "Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 2: `lib/card-dates.ts` — which days a student may open

**Files:**
- Create: `lib/card-dates.ts`
- Test: `tests/lib/card-dates.test.ts`

- [x] **Step 1: Write the failing test**

Create `tests/lib/card-dates.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isSelectableCardDate } from "@/lib/card-dates";

// Cards on Monday and Wednesday of the week of 27 July, and one the following
// Monday that is past the bound — a card Jenn has pre-posted.
const cardDates = new Set([
  "2026-07-27",
  "2026-07-29",
  "2026-08-03",
]);
const latest = "2026-07-31";

describe("isSelectableCardDate", () => {
  it("admits a day inside the bound that has a card", () => {
    expect(isSelectableCardDate("2026-07-27", { cardDates, latest })).toBe(true);
  });

  it("refuses a day inside the bound with no card", () => {
    expect(isSelectableCardDate("2026-07-28", { cardDates, latest })).toBe(
      false,
    );
  });

  it("refuses a day past the bound even when it has a card", () => {
    // The clause that is NOT redundant with the query: the calendar can page
    // into next month, and a pre-posted card reached that way must stay dead.
    expect(isSelectableCardDate("2026-08-03", { cardDates, latest })).toBe(
      false,
    );
  });

  it("admits the bound itself when it has a card", () => {
    expect(
      isSelectableCardDate("2026-07-29", { cardDates, latest: "2026-07-29" }),
    ).toBe(true);
  });

  it("refuses a day older than every card", () => {
    expect(isSelectableCardDate("2026-01-05", { cardDates, latest })).toBe(
      false,
    );
  });

  it("refuses everything when there are no cards at all", () => {
    expect(
      isSelectableCardDate("2026-07-27", { cardDates: new Set(), latest }),
    ).toBe(false);
  });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/lib/card-dates.test.ts`

Expected: FAIL — `Failed to resolve import "@/lib/card-dates"`.

- [x] **Step 3: Write the implementation**

Create `lib/card-dates.ts`:

```ts
// Whether a student may open the card for `date`.
//
// Two conditions, and the second is NOT redundant with the query that produced
// `cardDates`. That query is already bounded to `latest` so the dates of
// pre-posted cards never reach the browser — but the calendar can page into a
// month the query said nothing about, and a cell there must be dead rather
// than merely absent from the list.
export function isSelectableCardDate(
  date: string,
  input: { cardDates: ReadonlySet<string>; latest: string },
): boolean {
  // ISO-8601 dates compare correctly as strings, so this needs no Date round
  // trip — and therefore cannot pick up a timezone on the way through one.
  if (date > input.latest) return false;

  return input.cardDates.has(date);
}
```

- [x] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/lib/card-dates.test.ts`

Expected: PASS, 6 tests.

- [x] **Step 5: Commit**

```bash
git add lib/card-dates.ts tests/lib/card-dates.test.ts && git commit -m "feat: add isSelectableCardDate" --trailer "Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 3: `lib/chat-links.ts` — which URLs in a message become links

**Files:**
- Create: `lib/chat-links.ts`
- Test: `tests/lib/chat-links.test.ts`
- Read first (do not modify): `lib/link-url.ts`

Note before you start: `parseLinkUrl` returns `new URL(...).toString()`, which **normalises**. `https://tv5.ca` comes back as `https://tv5.ca/` with a trailing slash. Every expected value below reflects that; it is not a typo, and it is already how `addShelfLink` stores a link today.

- [x] **Step 1: Write the failing test**

Create `tests/lib/chat-links.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { extractLinks, MAX_LINKS_PER_MESSAGE } from "@/lib/chat-links";

describe("extractLinks", () => {
  it("finds a message that is nothing but a URL", () => {
    expect(extractLinks("https://tv5.ca")).toEqual(["https://tv5.ca/"]);
  });

  it("finds a URL inside a sentence", () => {
    expect(
      extractLinks("regarde ça https://conjuguemos.com/verbes stp"),
    ).toEqual(["https://conjuguemos.com/verbes"]);
  });

  it("drops a trailing full stop rather than storing a 404", () => {
    expect(extractLinks("c'est ici https://conjuguemos.com/verbes.")).toEqual([
      "https://conjuguemos.com/verbes",
    ]);
  });

  it("drops a trailing comma and a wrapping quote", () => {
    expect(extractLinks('https://tv5.ca, et aussi "https://arte.tv"')).toEqual([
      "https://tv5.ca/",
      "https://arte.tv/",
    ]);
  });

  it("keeps a closing paren that has an opening paren to match", () => {
    // A Wikipedia URL is the case this clause exists for.
    expect(
      extractLinks("https://fr.wikipedia.org/wiki/Accent_(linguistique)"),
    ).toEqual(["https://fr.wikipedia.org/wiki/Accent_(linguistique)"]);
  });

  it("drops a closing paren with nothing inside the URL to match it", () => {
    expect(extractLinks("(voir https://tv5.ca)")).toEqual(["https://tv5.ca/"]);
  });

  it("finds two URLs in one message", () => {
    expect(
      extractLinks("https://conjuguemos.com/verbes et aussi https://tv5.ca"),
    ).toEqual(["https://conjuguemos.com/verbes", "https://tv5.ca/"]);
  });

  it("returns the same URL once however many times it appears", () => {
    expect(extractLinks("https://tv5.ca et encore https://tv5.ca")).toEqual([
      "https://tv5.ca/",
    ]);
  });

  it("caps how many one message can file", () => {
    const body = ["a", "b", "c", "d", "e", "f", "g"]
      .map((host) => `https://${host}.com`)
      .join(" ");
    expect(extractLinks(body)).toHaveLength(MAX_LINKS_PER_MESSAGE);
  });

  it("honours an explicit cap", () => {
    expect(extractLinks("https://a.com https://b.com", 1)).toEqual([
      "https://a.com/",
    ]);
  });

  it("ignores a javascript: URL", () => {
    // Nothing but http and https is matched in the first place, which is the
    // outer half of the guard; parseLinkUrl is the inner half.
    expect(extractLinks("javascript:alert(1)")).toEqual([]);
  });

  it("ignores a scheme-less host, because prose is full of things that look like one", () => {
    expect(extractLinks("va sur www.tv5.ca. Ensuite regarde.")).toEqual([]);
  });

  it("ignores a URL past parseLinkUrl's length cap", () => {
    expect(extractLinks(`https://tv5.ca/${"a".repeat(2100)}`)).toEqual([]);
  });

  it("returns nothing for a message with no URL", () => {
    expect(extractLinks("bonjour, comment ça va ?")).toEqual([]);
  });

  it("returns nothing for an empty message", () => {
    expect(extractLinks("")).toEqual([]);
  });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/lib/chat-links.test.ts`

Expected: FAIL — `Failed to resolve import "@/lib/chat-links"`.

- [x] **Step 3: Write the implementation**

Create `lib/chat-links.ts`:

```ts
import { parseLinkUrl } from "@/lib/link-url";

// A message is MAX_MESSAGE_LENGTH (4000) characters, which is room for dozens
// of URLs, and anyone holding a student's token could otherwise turn one POST
// into forty page rows. A ceiling on abuse rather than a guess about real use —
// the same kind of bound as MAX_REPLAY and MAX_PDF_BYTES.
//
// Links past this are dropped silently. There is no channel to report them on,
// and the message itself still carries every one of them.
export const MAX_LINKS_PER_MESSAGE = 5;

// A scheme is REQUIRED, and that is the load-bearing decision in this module.
// parseLinkUrl prefixes https:// onto a scheme-less string, which is right for a
// field labelled "Adresse du lien" and wrong for prose: "mot.Ensuite" and
// "3.Regarde" both look like hostnames to a URL parser. The cost, accepted: a
// bare www.tv5.ca typed into a message gets no shelf row.
const URL_PATTERN = /https?:\/\/[^\s<>"']+/gi;

// A URL at the end of a sentence is the common case, and ".../verbes." is a 404.
const TRAILING = /[.,;:!?'"»…\]}]+$/;

// A trailing ) is stripped only when the URL has no ( to match it, so
// /wiki/Accent_(linguistique) survives while "(voir https://tv5.ca)" does not
// keep the paren that closed the aside.
//
// Accepted imperfection, in the register of titleFromUrl's note about short
// all-letter ids: a URL that genuinely ends in a full stop is mangled, and
// nothing available here can tell the two apart.
function trimTrailing(candidate: string): string {
  let value = candidate.replace(TRAILING, "");

  while (value.endsWith(")") && !value.includes("(")) {
    value = value.slice(0, -1).replace(TRAILING, "");
  }

  return value;
}

// Every http(s) URL in a chat message, normalised, de-duplicated and capped.
//
// Validation is parseLinkUrl's, reused rather than re-expressed: it is already
// the one guard between somebody's typing and an href, and a second URL
// validator standing beside it is a second place for javascript: to get through.
export function extractLinks(
  body: string,
  max: number = MAX_LINKS_PER_MESSAGE,
): string[] {
  const found: string[] = [];
  const seen = new Set<string>();

  for (const match of body.matchAll(URL_PATTERN)) {
    if (found.length >= max) break;

    const parsed = parseLinkUrl(trimTrailing(match[0]));
    if (!parsed.ok) continue;

    // De-duplicated on parseLinkUrl's OUTPUT rather than the raw match, so the
    // same link written two ways in one message is filed once.
    if (seen.has(parsed.url)) continue;

    seen.add(parsed.url);
    found.push(parsed.url);
  }

  return found;
}
```

- [x] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/lib/chat-links.test.ts`

Expected: PASS, 15 tests.

If the Wikipedia case fails, check that you have not added `)` to `TRAILING` — it is handled only by the conditional loop, deliberately.

- [x] **Step 5: Commit**

```bash
git add lib/chat-links.ts tests/lib/chat-links.test.ts && git commit -m "feat: extract shareable links from a chat message body" --trailer "Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 4: File those links onto the shelf (spec item 1)

`lib/shelf-links.ts` touches Prisma, so like `lib/pages.ts` and `lib/inbox.ts` it is **not** unit-tested — the rule inside it is `extractLinks`, which Task 3 tested. Verification here is a manual round trip through the running app, scripted precisely in Step 5.

**Files:**
- Create: `lib/shelf-links.ts`
- Modify: `app/api/chat/[slug]/route.ts:62-63`
- Read first (do not modify): `lib/pages.ts` (`savePage`), `lib/link-title.ts` (`titleFromUrl`)

- [x] **Step 1: Write `lib/shelf-links.ts`**

```ts
import { prisma } from "@/lib/prisma";
import { savePage } from "@/lib/pages";
import { extractLinks } from "@/lib/chat-links";
import { titleFromUrl } from "@/lib/link-title";

// Whether this URL already reaches this shelf.
//
// The everyone group is in the OR because listPagesForGroup fetches both sets
// and hands them to effectivePages: a link Jenn put on the shared shelf is
// already on this student's, so a second copy on re-share would show the same
// URL twice in one grid.
async function alreadyShelved(groupId: string, url: string): Promise<boolean> {
  const existing = await prisma.page.findFirst({
    where: {
      url,
      kind: "link",
      groups: {
        some: { OR: [{ groupId }, { group: { isEveryone: true } }] },
      },
    },
    select: { id: true },
  });

  return existing !== null;
}

// Files every link in a chat message onto that conversation's shelf and returns
// the slugs it created.
//
// IT NEVER THROWS. Each URL is attempted on its own and a failure is dropped —
// the same degrade-rather-than-throw contract readSections, readOps,
// readPageKind and inlinePage's `skipped` have, for a stronger reason than any
// of them: the message is the thing being sent, and a link that could not be
// filed must not cost the sentence that mentioned it.
//
// A duplicate leaves the EXISTING row completely alone — its createdAt, its
// pin, its addedByStudent. Re-sharing a link is not a reason to reorder
// somebody's shelf.
export async function addChatLinks(input: {
  groupId: string;
  body: string;
  fromTeacher: boolean;
}): Promise<string[]> {
  const created: string[] = [];

  for (const url of extractLinks(input.body)) {
    try {
      if (await alreadyShelved(input.groupId, url)) continue;

      created.push(
        await savePage({
          slug: null,
          kind: "link",
          title: titleFromUrl(url),
          url,
          groupIds: [input.groupId],
          // Mirrors the sender, and this is not cosmetic: canStudentDelete
          // reads exactly this flag, so a link the student shared is one they
          // can remove and a link Jenn shared is not.
          //
          // It is also why this cannot simply call addShelfLink — that action
          // derives the flag from shelfRole reading cookies, and this caller
          // resolved the role already.
          addedByStudent: !input.fromTeacher,
        }),
      );
    } catch {
      // Dropped on purpose. See the contract above.
    }
  }

  return created;
}
```

- [x] **Step 2: Add the import and the `revalidatePath` import to the chat route**

At the top of `app/api/chat/[slug]/route.ts`, add two imports beside the existing ones:

```ts
import { revalidatePath } from "next/cache";
import { addChatLinks } from "@/lib/shelf-links";
```

- [x] **Step 3: Call it between `createMessage` and the response**

In the same file, replace these two lines (currently 62–63):

```ts
  const message = await createMessage(group.id, role === "teacher", body);
  return NextResponse.json(message, { status: 201 });
```

with:

```ts
  const message = await createMessage(group.id, role === "teacher", body);

  // After the write, never before — the ordering rule createMessage states
  // about chatBus.publish, for the same reason: nothing observable may exist
  // for a message the database did not store.
  //
  // Awaited rather than floated. It is one indexed findFirst and one insert
  // against a local SQLite file, and revalidatePath after the response has gone
  // out does nothing at all.
  //
  // The everyone group needs no clause here: chatRole refused it above, before
  // it checked anything else, so no auto-shelved link can ever reach the shared
  // shelf.
  try {
    const added = await addChatLinks({
      groupId: group.id,
      body,
      fromTeacher: role === "teacher",
    });

    if (added.length > 0) {
      // revalidatePages in app/page-actions.ts is the list these three
      // duplicate, and it CANNOT be imported: that file is "use server", so
      // every export from it becomes a callable server action endpoint.
      // /p/[slug] is absent from the list because a link row has no page to
      // serve, and /admin/pages/[slug] because it 404s on one.
      revalidatePath("/g/[slug]", "page");
      revalidatePath("/f/[token]", "page");
      revalidatePath("/admin");
    }
  } catch {
    // addChatLinks does not throw; this is the belt to its braces, guarding the
    // same invariant — a shelf write may never fail a message send.
  }

  return NextResponse.json(message, { status: 201 });
```

- [x] **Step 4: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint lib/shelf-links.ts "app/api/chat/[slug]/route.ts"`

Expected: no output from either. If `tsc` complains that `addedByStudent` is not assignable, you are on the `pdf` branch of `SavePageInput` — check that `kind: "link"` is present and spelled exactly.

- [ ] **Step 5: Verify the round trip in the running app** (manual — not run)

This is the only verification for this task, so do all of it.

1. Run `npm run dev`.
2. Sign in as the teacher at `/login`, go to `/admin?tab=groups`, and copy a **claimed** student's invite link. If no student is claimed, create one, open its invite link in a second browser profile, and complete the sign-up form.
3. As that student, open `/g/<slug>`, open the chat FAB, and send: `regarde ça https://conjuguemos.com/verbes et aussi https://tv5.ca`
4. Click *Les fichiers*. **Expected:** two new tiles, titled `Verbes` and `tv5.ca`, each showing a link preview glyph and each carrying a × (they are `addedByStudent`).
5. Send the same message again, then reload *Les fichiers*. **Expected:** still two tiles, not four.
6. As the teacher on `/admin`, open the inbox FAB, select that student, and send `voici la fiche https://example.com/fiche-de-verbes.pdf`.
7. Reload the student's `/g/<slug>?tab=files`. **Expected:** a third tile, `Fiche De Verbes`, **without** a × for the student — Jenn added it. (The teacher's × for it arrives in Task 8.)
8. Send a message with no URL. **Expected:** no new tile, and the message sends normally.
9. Send `va sur www.tv5.ca.` **Expected:** no new tile — the scheme-less case, working as designed.

- [x] **Step 6: Commit**

```bash
git add lib/shelf-links.ts "app/api/chat/[slug]/route.ts" && git commit -m "feat: file links shared in the chat onto the student's shelf" --trailer "Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 5: No student sign-out for the teacher (spec item 2)

`studentGate` itself is **not touched** — its clause order is documented as the specification and `unlocked` is derived from it. The panel's own rule goes beside it instead.

**Files:**
- Modify: `lib/student-gate.ts` (add at the end)
- Modify: `components/student/StudentAuthPanel.tsx:23-30`
- Modify: `app/g/[slug]/page.tsx:262-264`
- Test: `tests/lib/student-gate.test.ts`

- [x] **Step 1: Write the failing test**

Add to `tests/lib/student-gate.test.ts`, after the existing `studentGate` block:

```ts
describe("authPanelMode", () => {
  it("gives a student the mode matching their gate", () => {
    expect(authPanelMode("signup", false)).toBe("signup");
    expect(authPanelMode("login", false)).toBe("login");
    expect(authPanelMode("signed-in", false)).toBe("signed-in");
  });

  it("shows no panel where there is nothing to sign in to", () => {
    expect(authPanelMode("none", false)).toBeNull();
  });

  it("never offers the teacher a student's sign-out", () => {
    // The bug this function exists for. signOutStudent clears the STUDENT's
    // cookie for this slug, which is the thing `unlocked` reads — so the
    // control would have locked her out of Les fichiers and Le tableau.
    expect(authPanelMode("signed-in", true)).toBeNull();
  });

  it("leaves the two teacher-facing notices to the page", () => {
    // Both name the student, and that name must never reach a public page, so
    // the page renders them on a teacher-only branch rather than in the panel.
    expect(authPanelMode("unclaimed", true)).toBeNull();
    expect(authPanelMode("teacher-stale", true)).toBeNull();
  });

  it("shows the teacher no panel in any state whatsoever", () => {
    for (const gate of [
      "none",
      "signed-in",
      "unclaimed",
      "teacher-stale",
      "signup",
      "login",
    ] as const) {
      expect(authPanelMode(gate, true)).toBeNull();
    }
  });
});
```

Extend the import on line 2:

```ts
import { authPanelMode, studentGate } from "@/lib/student-gate";
```

- [x] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/lib/student-gate.test.ts`

Expected: FAIL — `authPanelMode is not a function`.

- [x] **Step 3: Implement it, and move the type**

Append to `lib/student-gate.ts`:

```ts
// The three states StudentAuthPanel can render. Tied to the gate's own type, so
// a new gate state cannot quietly bypass the component. It lived in the
// component until the function below joined it; a type that is an Extract of
// StudentGate belongs beside StudentGate.
export type AuthPanelMode = Extract<
  StudentGate,
  "signup" | "login" | "signed-in"
>;

// Which auth panel a visitor should be shown, or null for no panel at all.
//
// A predicate beside the gate rather than a seventh gate state: `unlocked` is
// `gate === "signed-in"` and is what admits the Files and Whiteboard tabs, so a
// state the teacher fell into instead would have to be added to that comparison
// too — inside a rule whose clause order is documented as the specification.
//
// isTeacher wins over everything, and this is the whole point of the function.
// The panel's signed-in mode renders "Se déconnecter", and signOutStudent
// clears the STUDENT's cookie for this slug — the cookie `unlocked` is derived
// from. Offering it to Jenn was offering to lock her out of the two tabs she
// opened the student's page for.
export function authPanelMode(
  gate: StudentGate,
  isTeacher: boolean,
): AuthPanelMode | null {
  if (isTeacher) return null;

  if (gate === "signup" || gate === "login" || gate === "signed-in") {
    return gate;
  }

  // "none" has nothing to sign in to. "unclaimed" and "teacher-stale" are
  // teacher-facing and unreachable above, and the page renders both itself
  // because each names the student.
  return null;
}
```

- [x] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/lib/student-gate.test.ts`

Expected: PASS — the existing `studentGate` block plus 6 new tests.

- [x] **Step 5: Point the component at the moved type**

In `components/student/StudentAuthPanel.tsx`, delete lines 23–30 (the comment and the local `export type AuthPanelMode = Extract<…>`) and change the type import on line 7 from:

```ts
import type { StudentGate } from "@/lib/student-gate";
```

to:

```ts
import type { AuthPanelMode } from "@/lib/student-gate";
```

`StudentGate` is not referenced anywhere else in that file — the only use was the `Extract` that has moved.

- [x] **Step 6: Use it in the page**

In `app/g/[slug]/page.tsx`, extend the import on line 21:

```ts
import { authPanelMode, studentGate } from "@/lib/student-gate";
```

Add one line directly after `const unlocked = gate === "signed-in";` (line 96):

```ts
  // Null for the teacher in every state — see authPanelMode. `unlocked` above
  // is untouched by this and still gates the tabs from the token alone.
  const panelMode = authPanelMode(gate, viewerIsTeacher);
```

Then replace the panel's render block (lines 262–264):

```tsx
      {(gate === "signup" || gate === "login" || gate === "signed-in") && (
        <StudentAuthPanel slug={slug} mode={gate} />
      )}
```

with:

```tsx
      {panelMode && <StudentAuthPanel slug={slug} mode={panelMode} />}
```

- [~] **Step 7: Typecheck** (done) **then verify in the app** (manual — not run)

Run: `npx tsc --noEmit`

Expected: no output.

Then with `npm run dev` running, as the **teacher**, open a claimed student from `/admin?tab=groups`.

**Expected:** no *Se déconnecter* anywhere on the page. The *← Back to admin* pill, the *Marie Dupont's page* header line, the Files and Whiteboard tabs and the inbox FAB are all still there — this change must take nothing else away.

Then open the same student's page in the student's own browser profile. **Expected:** *Se déconnecter* is still present for them.

- [x] **Step 8: Commit**

```bash
git add lib/student-gate.ts tests/lib/student-gate.test.ts components/student/StudentAuthPanel.tsx "app/g/[slug]/page.tsx" && git commit -m "fix: never show a student's sign-out control to the teacher" --trailer "Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 6: Uncover the `+` on `/admin` (spec item 3)

One className, and the comment beside it is most of the value — the next person to place a fixed button on this page needs to know why this one is not in the corner.

**Files:**
- Modify: `components/admin/AdminChrome.tsx:128-133`

- [x] **Step 1: Move the Fab and record why**

In `components/admin/AdminChrome.tsx`, replace the `<Fab>` opening tag (lines 128–133):

```tsx
      <Fab
        label="Add"
        expanded={open === "menu"}
        onClick={() => setOpen(open === null ? "menu" : null)}
        className="bottom-6 right-4"
      >
```

with:

```tsx
      <Fab
        label="Add"
        expanded={open === "menu"}
        onClick={() => setOpen(open === null ? "menu" : null)}
        // Left of the chat bubble, not underneath it. InboxFab is ALSO fixed at
        // bottom-6 right-4 with the same z-50, and <TeacherInbox /> renders
        // after this component in app/admin/page.tsx — so at right-4 this
        // button was painted over exactly, and the one control that adds a
        // student, a link or a page was unreachable on the screen that lists
        // all three.
        //
        // ShelfFab made this same move on the student page for the same reason:
        // side by side, neither ever covers the other and neither has to move.
        // Stacked is not an option — bottom-24 is where the open panel goes.
        className="bottom-6 right-24"
      >
```

`AddMenu` above it keeps `bottom-24 right-4`, matching `ShelfFab`, where the menu also hangs above the chat button rather than above its own trigger. Do not move it.

- [ ] **Step 2: Verify both buttons are reachable** (manual — not run)

With `npm run dev` running, sign in and open `/admin`.

**Expected:** two round buttons in the bottom-right, the `+` to the left of the speech bubble. Click the `+` — the *Add a student / Add a link / Add a page* menu opens. Press Escape, then click the bubble — the inbox opens. Check all three tabs (`?tab=daily`, `?tab=groups`, `?tab=pages`): the `+` is present on every one.

**Expected on `/admin/pages/<slug>`:** the chat bubble only, still no `+`. That screen has no `AdminChrome` and deliberately gains none.

- [x] **Step 3: Commit**

```bash
git add components/admin/AdminChrome.tsx && git commit -m "fix: move the admin add button out from under the chat FAB" --trailer "Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 7: A delete control for links in the admin (spec item 4)

Until now `/admin/pages/[slug]` 404s on a link row, `PageList` therefore hides the pencil for links, and `PageEditor`'s *Delete page* is the admin's only delete — so a link could not be removed anywhere. `deletePage` itself needs no change: it is already `requireTeacher`, already uses `deleteMany` so a double-click is a no-op, and already revalidates `/admin`.

**Files:**
- Modify: `components/admin/PageList.tsx` (icon, prop, action slot)
- Modify: `components/admin/PagesTabClient.tsx`
- Modify: `app/admin/page.tsx:21-26` and `:174-182`

- [x] **Step 1: Add a `TrashIcon` to `PageList.tsx`**

Directly after the existing `DownloadIcon` function (which ends at line 90), add:

```tsx
// A lid, a can, and the two ribs. Same stroke idiom as the two above, so the
// three read as one set in a tile's action row.
function TrashIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="m19 6-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}
```

- [x] **Step 2: Add the prop**

In the same file, add to the destructured parameters (after `onTogglePin,` on line 114) and to the type. The prop:

```tsx
  onDelete,
```

The type entry, placed after `onTogglePin`'s:

```tsx
  // Links only, in the UI below. It is the plain teacher-only deletePage, which
  // has never cared what kind a row is — the pencil that used to be the only
  // route to it is what excluded links.
  onDelete: (slug: string) => Promise<void>;
```

- [x] **Step 3: Turn the action slot's guard into a ternary**

Replace the `{page.kind !== "link" && ( … )}` block inside `action=` (lines 250–285, from the comment through the closing `)}`) with:

```tsx
                          {/* A link has no document to edit or download, so it
                              gets neither control rather than two that fail —
                              and this is that sentence's third clause. It
                              trades the two it cannot use for the one it can.
                              Until this existed a link could not be deleted at
                              all: /admin/pages/[slug] 404s on a link row and
                              PageEditor held the admin's only delete.

                              A PDF and a page keep both of theirs: editing
                              replaces the file or changes the audience, and the
                              download is the same <a download> pointed at the
                              bytes.

                              No confirmation, matching PageEditor's own bare
                              Delete page button. A link is a URL and a derived
                              title; re-adding one is a paste. */}
                          {page.kind === "link" ? (
                            <form action={onDelete.bind(null, page.slug)}>
                              <button
                                type="submit"
                                aria-label={`Delete ${page.title}`}
                                title="Delete"
                                className={tileActionClass}
                              >
                                <TrashIcon />
                              </button>
                            </form>
                          ) : (
                            <>
                              <Link
                                href={`/admin/pages/${page.slug}`}
                                aria-label={`Edit ${page.title}`}
                                title="Edit"
                                className={tileActionClass}
                              >
                                <PencilIcon />
                              </Link>

                              {/* No server support needed: `download` on a
                                  same-origin response forces a save-as, so the
                                  raw route keeps its exact behaviour and its
                                  CSP, and no new authenticated surface appears.
                                  That route is already public. */}
                              <a
                                href={
                                  page.kind === "pdf"
                                    ? `/p/${page.slug}/pdf`
                                    : `/p/${page.slug}/raw`
                                }
                                download={`${page.slug}.${page.kind === "pdf" ? "pdf" : "html"}`}
                                aria-label={`Download ${page.title}`}
                                title="Download"
                                className={tileActionClass}
                              >
                                <DownloadIcon />
                              </a>
                            </>
                          )}
```

The pin `<form>` that follows it is unchanged and stays inside the same wrapping `<div className="flex items-center gap-1">`.

- [x] **Step 4: Pass it through `PagesTabClient`**

In `components/admin/PagesTabClient.tsx`, add to the destructured props and the type:

```tsx
  onDelete,
```

```tsx
  // Not curried on a group: deleting a page removes it from every shelf it is
  // on, which is why it is teacher-only and why the student page's
  // deleteShelfLink is a different action.
  onDelete: (slug: string) => Promise<void>;
```

and add `onDelete={onDelete}` to the `<PageList>` element, after `onTogglePin`.

- [x] **Step 5: Pass `deletePage` in from the page**

In `app/admin/page.tsx`, add `deletePage` to the existing `@/app/page-actions` import (lines 21–26):

```ts
import {
  createPage,
  createPdfPage,
  createLink,
  deletePage,
  setShelfPin,
} from "@/app/page-actions";
```

and add one prop to the `<PagesTabClient>` element inside `PagesTab` (line ~175):

```tsx
      onTogglePin={setShelfPin}
      onDelete={deletePage}
```

- [x] **Step 6: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint components/admin/PageList.tsx components/admin/PagesTabClient.tsx app/admin/page.tsx`

Expected: no output.

- [ ] **Step 7: Verify in the app** (manual — not run)

With `npm run dev`, open `/admin?tab=pages`.

**Expected:** every link tile shows a trash icon and a pin, and no pencil or download. Every page and PDF tile shows a pencil, a download and a pin, and **no** trash. Filter by *Links* to see them together.

Click a link tile's trash. **Expected:** the tile is gone after the page re-renders, with no confirmation step. Reload — still gone.

Open a student's `/g/<slug>?tab=files` and confirm the link is gone from there too.

- [x] **Step 8: Commit**

```bash
git add components/admin/PageList.tsx components/admin/PagesTabClient.tsx app/admin/page.tsx && git commit -m "feat: delete a link from its tile in the admin Pages tab" --trailer "Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 8: The teacher's delete on the student's shelf (spec item 4, second half)

`deleteShelfLink` has permitted this since it was written — *"The teacher may remove anything; a student may remove only their own link"* — and the UI was the only thing withholding it. Task 4 is what makes it matter: chat now deposits rows with `addedByStudent: false` onto student shelves, which is precisely the set she could not remove from the page she is looking at.

**Files:**
- Modify: `components/student/FilesTab.tsx:41-58` and `:167-183`
- Modify: `app/g/[slug]/page.tsx:178-185`

- [x] **Step 1: Add the prop**

In `components/student/FilesTab.tsx`, add to the destructured parameters after `canWrite,`:

```tsx
  canDeleteAny = false,
```

and to the type, after `canWrite`'s entry:

```tsx
  // True only for the teacher. deleteShelfLink already authorises her to remove
  // anything on a student's shelf; this stops the tile withholding the control.
  //
  // Every row rather than link rows only: she can already pin anything here,
  // and a delete that applies to some tiles and not others is a rule to explain
  // where there is no rule.
  canDeleteAny?: boolean;
```

Defaulting to `false` is what leaves `/f/[token]` untouched — that page passes neither this nor `onDeleteLink`, and `canWrite={false}` means the whole action slot is `undefined` there anyway. `filesToken` addresses a shelf and must never carry the power to write to it.

- [x] **Step 2: Widen the condition**

Replace the delete block's guard (lines 167–172, comment included):

```tsx
                              {/* Anything they published, link or page, while
                                  nobody else can see it yet. The server
                                  re-checks with canStudentDelete; this just
                                  avoids showing a control that would fail. */}
                              {page.addedByStudent &&
                                onDeleteLink && (
```

with:

```tsx
                              {/* For a student: anything they published, link
                                  or page, while nobody else can see it yet —
                                  the server re-checks with canStudentDelete and
                                  this only avoids showing a control that would
                                  fail. For the teacher: everything, which
                                  deleteShelfLink has always allowed her.
                                  Chat-filed links land here with
                                  addedByStudent false, and hers were the rows
                                  she could not reach. */}
                              {(page.addedByStudent || canDeleteAny) &&
                                onDeleteLink && (
```

Everything inside the block — the `<form>`, the button, the `×` — is unchanged.

- [x] **Step 3: Pass it from the page**

In `app/g/[slug]/page.tsx`, add one prop to the `<FilesTab>` element (lines 178–185):

```tsx
        <FilesTab
          pages={pages}
          today={today}
          canWrite={unlocked}
          canDeleteAny={viewerIsTeacher}
          onTogglePin={setShelfPin.bind(null, group.id)}
          onDeleteLink={deleteShelfLink.bind(null, group.id)}
        />
```

- [x] **Step 4: Typecheck**

Run: `npx tsc --noEmit`

Expected: no output.

- [ ] **Step 5: Verify both roles** (manual — not run)

With `npm run dev`, as the **teacher**, open a claimed student from `/admin?tab=groups` and go to *Les fichiers*.

**Expected:** every tile has both a pin and a ×, including pages Jenn added and links the chat filed for her. Delete one; it disappears from the student's shelf and from `/admin?tab=pages`.

As the **student**, on the same shelf: **expected** a × only on rows they added themselves — a link Jenn shared still has a pin and no ×. This is `canStudentDelete` unchanged, and the server re-checks it regardless of what the tile drew.

On `/f/<filesToken>`: **expected** no pins and no ×, exactly as before. A pinned page shows the corner marker instead.

- [x] **Step 6: Commit**

```bash
git add components/student/FilesTab.tsx "app/g/[slug]/page.tsx" && git commit -m "feat: let the teacher delete any row from a student's shelf" --trailer "Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 9: Extract `MonthCalendar` from `AdminDatePicker`

A pure refactor with **no visible change to the admin**. That is the acceptance criterion: if the admin's date popover looks or behaves one pixel differently afterwards, something is wrong. `AdminDatePicker` gains no `isEnabled` — every teaching day stays clickable there, because pre-posting ahead is Jenn's workflow and clamping would make those days unreachable from `/admin`.

**Files:**
- Create: `components/ui/MonthCalendar.tsx`
- Rewrite: `components/admin/AdminDatePicker.tsx`
- Read first (do not modify): `lib/month-grid.ts`

- [x] **Step 1: Create `components/ui/MonthCalendar.tsx`**

```tsx
"use client";

import { useState } from "react";
import { monthWeekdayRows } from "@/lib/month-grid";
import { cn } from "@/lib/utils";

export type CalendarTone = "admin" | "card";

export type CalendarLabels = {
  dialog: string;
  previousMonth: string;
  nextMonth: string;
  monthNames: readonly string[];
  // Full names, not initials: two of the five are "M" in both English and
  // French, and React needs a distinct key per column. The grid renders the
  // first letter of each.
  weekdays: readonly string[];
};

const utc = (value: string) => new Date(`${value}T00:00:00Z`);

// Two palettes rather than one with overrides. The admin's --color-* tokens and
// the flashcard template's --card-* tokens are separate systems (see the styling
// note in CLAUDE.md), and a shared class string with three exceptions threaded
// through it is how they get mixed up.
const TONES = {
  admin: {
    panel: "border-[var(--color-field-border)] bg-[var(--color-field)]",
    step: "text-[var(--color-ink-muted)] hover:bg-[var(--color-bg)]",
    month: "font-[family-name:var(--font-body)] text-[var(--color-ink)]",
    weekday:
      "font-[family-name:var(--font-body)] text-[var(--color-ink-muted)]",
    day: "font-[family-name:var(--font-body)]",
    selected: "bg-[var(--color-accent)] font-semibold text-white",
    idle: "text-[var(--color-ink)] hover:bg-[var(--color-bg)]",
    today: "font-bold text-[var(--color-accent)]",
  },
  card: {
    panel: "border-[var(--card-line)] bg-[var(--card-paper)]",
    step: "text-[var(--card-moss)] hover:bg-[var(--card-bleu-soft)]",
    month: "font-[family-name:var(--card-font-mono)] text-[var(--card-ink)]",
    weekday: "font-[family-name:var(--card-font-mono)] text-[var(--card-moss)]",
    day: "font-[family-name:var(--card-font-mono)]",
    selected: "bg-[var(--card-bleu)] font-semibold text-white",
    idle: "text-[var(--card-ink)] hover:bg-[var(--card-bleu-soft)]",
    today: "font-bold text-[var(--card-bleu)]",
  },
} as const;

// The month grid inside a date popover: a stepper, five weekday columns, and a
// button per teaching day. Extracted from AdminDatePicker so the student's card
// page uses the same calendar rather than a second one that drifts from it.
//
// It does NOT own the popover's open state, its trigger, or dismissal. Each
// caller keeps those, deliberately: the two triggers are a labelled admin field
// and a French week-range line, and each restores focus to its own ref on
// Escape and on choose. Sharing that would mean handing the ref back out through
// a render prop, which is more machinery than the twenty lines it saves.
//
// Position comes in through `className`, for the reason Fab's comment gives.
export function MonthCalendar({
  selected,
  today,
  locale,
  tone,
  labels,
  isEnabled,
  onChoose,
  className,
}: {
  selected: string;
  today: string;
  // aria-labels only. Nothing VISIBLE here is locale-formatted — the month
  // header comes from labels.monthNames — so this cannot cause the hydration
  // mismatch a toLocaleDateString in rendered text would.
  locale: string;
  tone: CalendarTone;
  labels: CalendarLabels;
  // Undefined means every teaching day is selectable, which is the ADMIN's
  // rule: pre-posting ahead is Jenn's workflow and clamping would make those
  // days unreachable from /admin. The student page passes a predicate.
  isEnabled?: (date: string) => boolean;
  onChoose: (date: string) => void;
  className?: string;
}) {
  // Seeded from `selected` on mount, and that is the whole of keeping it in
  // step. Both callers render this as {open && <MonthCalendar />}, so mounting
  // IS the seeding — which is why AdminDatePicker's old re-seed inside toggle()
  // is gone rather than moved here. It existed only because the panel never
  // unmounted.
  const [cursor, setCursor] = useState(() => ({
    year: utc(selected).getUTCFullYear(),
    month: utc(selected).getUTCMonth(),
  }));

  const palette = TONES[tone];
  const rows = monthWeekdayRows(cursor.year, cursor.month);

  function stepMonth(delta: number) {
    const stepped = new Date(Date.UTC(cursor.year, cursor.month + delta, 1));
    setCursor({
      year: stepped.getUTCFullYear(),
      month: stepped.getUTCMonth(),
    });
  }

  function formatFull(value: string): string {
    return utc(value).toLocaleDateString(locale, {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
  }

  return (
    <div
      role="dialog"
      aria-label={labels.dialog}
      className={cn(
        "absolute z-20 mt-2 w-[300px] max-w-[calc(100vw-2rem)] rounded-xl border p-3 shadow-lg",
        palette.panel,
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <button
          type="button"
          aria-label={labels.previousMonth}
          onClick={() => stepMonth(-1)}
          className={cn(
            "rounded-full px-3 py-1 transition-colors",
            palette.step,
          )}
        >
          ‹
        </button>
        <span
          className={cn(
            "text-xs font-semibold uppercase tracking-[2px]",
            palette.month,
          )}
        >
          {labels.monthNames[cursor.month]} {cursor.year}
        </span>
        <button
          type="button"
          aria-label={labels.nextMonth}
          onClick={() => stepMonth(1)}
          className={cn(
            "rounded-full px-3 py-1 transition-colors",
            palette.step,
          )}
        >
          ›
        </button>
      </div>

      <div className="mt-3 grid grid-cols-5 gap-1">
        {labels.weekdays.map((name) => (
          <div
            key={name}
            aria-hidden
            className={cn(
              "py-1 text-center text-[11px] font-semibold uppercase",
              palette.weekday,
            )}
          >
            {name[0]}
          </div>
        ))}

        {rows.flat().map((cell) => {
          const isSelected = cell.date === selected;
          const isToday = cell.date === today;
          const enabled = isEnabled ? isEnabled(cell.date) : true;

          return (
            <button
              key={cell.date}
              type="button"
              aria-label={formatFull(cell.date)}
              aria-pressed={isSelected}
              aria-current={isToday ? "date" : undefined}
              // A day with no card is dead rather than absent from the grid: a
              // calendar missing a Tuesday reads as a rendering fault.
              disabled={!enabled}
              onClick={() => onChoose(cell.date)}
              className={cn(
                "rounded-lg py-1.5 text-center text-sm transition-colors",
                palette.day,
                // isSelected FIRST, so a selected day with no card still draws
                // as selected. The student page reaches that state two ways:
                // Aujourd'hui on a day Jenn skipped, and a hand-typed ?date=.
                isSelected ? palette.selected : enabled ? palette.idle : "",
                !isSelected && !enabled && "opacity-30",
                !isSelected && enabled && isToday && palette.today,
                !cell.inMonth && "opacity-40",
              )}
            >
              {Number(cell.date.slice(8, 10))}
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

- [x] **Step 2: Rewrite `components/admin/AdminDatePicker.tsx`**

Replace the whole file. The trigger, the `en-CA` formatting, the dismissal effect and the `basePath` push are unchanged; the panel markup, the `cursor` state, `stepMonth` and the re-seed inside `toggle()` are gone.

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MonthCalendar } from "@/components/ui/MonthCalendar";
import { MONTHS } from "@/lib/week";
import { fieldClassName } from "@/components/ui/field";
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

  function choose(date: string) {
    setOpen(false);
    // The day button just clicked unmounts with the popover, which would
    // otherwise drop focus to <body> mid-keyboard-workflow. Match the
    // Escape path, which already restores it to the trigger.
    triggerRef.current?.focus();
    router.push(`${basePath}?date=${date}`, { scroll: false });
  }

  return (
    // No bottom margin: both places this renders are gap-6 flex columns
    // inside CardEditor, which space it already.
    <div ref={rootRef} className="relative mx-auto w-full max-w-[560px]">
      <span
        id="admin-date-label"
        className="block text-sm font-medium text-[var(--color-ink)]"
      >
        Date
      </span>
      <button
        ref={triggerRef}
        id="admin-date-trigger"
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        // aria-labelledby replaces the accessible name outright, so both ids
        // are listed — the label for "Date" and the button itself for the
        // formatted date text.
        aria-labelledby="admin-date-label admin-date-trigger"
        onClick={() => setOpen(!open)}
        // Capped rather than full-width: a date field needs about 260px, and
        // stretching it the whole width of the card made it the widest thing
        // on the page on a phone.
        className={cn(
          fieldClassName,
          "max-w-[260px] whitespace-nowrap text-left",
        )}
      >
        {formatFull(selected)}
      </button>

      {open && (
        // No isEnabled: every teaching day stays selectable here. Pre-posting
        // ahead is Jenn's workflow, and a bound would make those days
        // unreachable from /admin — the same reason parseAdminDate does not
        // clamp future dates the way the student page's parseDate does.
        <MonthCalendar
          selected={selected}
          today={today}
          locale="en-CA"
          tone="admin"
          labels={{
            dialog: "Choose a date",
            previousMonth: "Previous month",
            nextMonth: "Next month",
            monthNames: MONTHS,
            weekdays: WEEKDAYS,
          }}
          onChoose={choose}
          className="left-0"
        />
      )}
    </div>
  );
}
```

`className="left-0"` is not optional — the old panel had `left-0` baked in, and position now arrives as a prop. Without it the popover is positioned by whatever the browser infers and drifts right.

- [x] **Step 3: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint components/ui/MonthCalendar.tsx components/admin/AdminDatePicker.tsx`

Expected: no output. If eslint reports `react-hooks/refs`, you have read a ref during render — the two refs here are only touched inside the effect and the handlers, so re-check against the code above.

- [ ] **Step 4: Verify the admin popover is unchanged** (manual — not run)

With `npm run dev`, open `/admin?tab=daily` and click the date field.

**Expected, all of it as before:** the popover opens flush with the field's left edge; the header reads e.g. `AUGUST 2026`; five columns headed `L M M J V`; `‹` and `›` step months; today is bold and accent-coloured; the selected day is a filled accent pill; neighbouring-month days are faded but clickable; **no day is disabled**; Escape closes it and returns focus to the field; clicking outside closes it; clicking a day navigates to `?date=`.

One behaviour to check specifically, because it is the thing the refactor changed internally: page forward two months, press Escape, then reopen. **Expected:** it opens on the selected day's month again, not on the month you paged to. That is the seed-on-mount working.

- [x] **Step 5: Commit**

```bash
git add components/ui/MonthCalendar.tsx components/admin/AdminDatePicker.tsx && git commit -m "refactor: extract MonthCalendar from AdminDatePicker" --trailer "Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 10: `listCardDates` in `lib/cards.ts`

**Files:**
- Modify: `lib/cards.ts` (append)

- [x] **Step 1: Add the query**

Append to `lib/cards.ts`:

```ts
// Every date a student may open a card for: one row per GlobalCard, bounded,
// newest first.
//
// The bound is applied HERE rather than in the browser, so the dates of
// pre-posted cards never reach it. Students must not read ahead, and shipping
// tomorrow's date to a page that then greys the cell out would still be telling
// them a card exists for tomorrow.
//
// A new function, not a resurrection: getArchiveDates and mergeArchiveDates
// were deleted on 2026-07-31 because they queried the dropped `Card` table.
// This reads GlobalCard, which is the one that remains.
//
// Uncapped, deliberately. One row per teaching day is about 260 strings a year —
// a couple of kilobytes — and it makes the enabled-day rule a pure function of
// props with a test. A cap would silently make old cards unreachable, which is
// the opposite of what an archive is for. If the size ever matters, the shape to
// reach for is a server action fetching one visible month at a time.
export async function listCardDates(upTo: Date): Promise<string[]> {
  const rows = await prisma.globalCard.findMany({
    where: { date: { lte: upTo } },
    orderBy: { date: "desc" },
    select: { date: true },
  });

  // Every date in this project is UTC midnight, so slicing the ISO string is
  // the same operation the rest of the codebase performs on one.
  return rows.map((row) => row.date.toISOString().slice(0, 10));
}
```

`prisma` is already imported at the top of that file — do not add a second import.

- [x] **Step 2: Typecheck**

Run: `npx tsc --noEmit`

Expected: no output.

- [x] **Step 3: Commit**

```bash
git add lib/cards.ts && git commit -m "feat: add listCardDates for the student's card calendar" --trailer "Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 11: `CardDateNav` (spec item 5)

The visible half of item 5. `CardDateNav` absorbs `WeekDayPicker` and takes the week-range line over from `CardHeading`. **Task 9 must be done first** — this renders the component it extracted.

**Files:**
- Create: `components/student/CardDateNav.tsx`
- Rewrite: `components/student/CardHeading.tsx`
- Delete: `components/WeekDayPicker.tsx`
- Modify: `app/g/[slug]/page.tsx` (imports, the date block, the card branch)

- [x] **Step 1: Create `components/student/CardDateNav.tsx`**

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MonthCalendar } from "@/components/ui/MonthCalendar";
import { isSelectableCardDate } from "@/lib/card-dates";
import { MONTHS, formatWeekRange, weekDates, weekRange } from "@/lib/week";
import { cn } from "@/lib/utils";

// Full names so React has a distinct key per column — two of the five initials
// are "M".
const FRENCH_DAYS = [
  { letter: "L", label: "Lundi" },
  { letter: "M", label: "Mardi" },
  { letter: "M", label: "Mercredi" },
  { letter: "J", label: "Jeudi" },
  { letter: "V", label: "Vendredi" },
];

const utc = (value: string) => new Date(`${value}T00:00:00Z`);
const iso = (date: Date) => date.toISOString().slice(0, 10);

// Every date control on the card tab: the week-range line, the month calendar
// behind it, Aujourd'hui, and the five day dots.
//
// It replaces WeekDayPicker, which computed its five days from `today` and so
// could only ever show the week we are in, and it takes the range line over from
// CardHeading, which drew it from weekRange(today) and so could not have
// described another week even once one became reachable.
//
// All of the arithmetic here is getUTC*/Date.UTC and every rendered date comes
// from a string, so this renders identically on both sides of hydration.
// lib/chat-time.ts is the only module in this project that reads a local zone,
// and nothing here may follow it.
export function CardDateNav({
  slug,
  selected,
  today,
  latest,
  cardDates,
}: {
  slug: string;
  selected: string;
  // Real today, for the calendar's own "today" marker. Not a bound.
  today: string;
  // latestViewableDate(today), doing two jobs on purpose: it is where
  // Aujourd'hui goes AND the ceiling isSelectableCardDate compares against.
  // They are the same date because they are the same rule — the latest day a
  // student may look at — and two props would let one change without the other.
  latest: string;
  cardDates: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Duplicated from AdminDatePicker rather than shared, and MonthCalendar's own
  // comment says why: the trigger and the focus target are this component's,
  // and sharing them would need a render prop.
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

  function go(date: string) {
    router.push(`/g/${slug}?date=${date}`, { scroll: false });
  }

  function choose(date: string) {
    setOpen(false);
    triggerRef.current?.focus();
    go(date);
  }

  const selectedDate = utc(selected);
  const { start, end } = weekRange(selectedDate);
  const days = weekDates(selectedDate);

  const cards = new Set(cardDates);
  const selectable = (date: string) =>
    isSelectableCardDate(date, { cardDates: cards, latest });

  return (
    <div ref={rootRef} className="relative mx-auto mb-8 max-w-[560px]">
      <div className="flex flex-col items-center gap-1.5">
        {/* The week range is the calendar's trigger now, rather than a static
            line above a strip that could not leave this week. */}
        <button
          ref={triggerRef}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="rounded-full px-3 py-1 font-[family-name:var(--card-font-mono)] text-[12px] uppercase tracking-[2px] text-[#8a7f6c] transition-colors hover:bg-[var(--card-bleu-soft)] hover:text-[var(--card-bleu)]"
        >
          {formatWeekRange(start, end)} ⌄
        </button>

        {/* Disabled rather than hidden when they are already there, the pattern
            PageList's pin button uses for a control that is present but
            inapplicable — a control that vanishes is one they have to
            rediscover. */}
        <button
          type="button"
          onClick={() => go(latest)}
          disabled={selected === latest}
          className="font-[family-name:var(--card-font-serif)] text-sm text-[var(--card-bleu)] underline transition-opacity disabled:opacity-40 disabled:no-underline"
        >
          Aujourd&apos;hui
        </button>
      </div>

      {open && (
        <MonthCalendar
          selected={selected}
          today={today}
          locale="fr-CA"
          tone="card"
          labels={{
            dialog: "Choisir une date",
            previousMonth: "Mois précédent",
            nextMonth: "Mois suivant",
            // English and uppercase, matching the trigger directly above it,
            // which has always read "JULY 27 → JULY 31, 2026" under a French
            // eyebrow. French month names here would make the panel disagree
            // with the line that opens it; localising every date on the card
            // page is a separate change.
            monthNames: MONTHS,
            weekdays: FRENCH_DAYS.map((day) => day.label),
          }}
          isEnabled={selectable}
          onChoose={choose}
          className="left-1/2 -translate-x-1/2"
        />
      )}

      <div className="mt-4 flex justify-center gap-2">
        {days.map((date, index) => {
          const dateStr = iso(date);
          const isSelected = dateStr === selected;
          const enabled = selectable(dateStr);
          const { letter, label } = FRENCH_DAYS[index];

          return (
            <button
              key={dateStr}
              type="button"
              aria-label={label}
              title={label}
              // A day with nothing posted is not a destination. Before this the
              // dot was always live and led to "Nothing posted yet".
              disabled={!enabled}
              onClick={() => go(dateStr)}
              className={cn(
                "flex h-[34px] w-[34px] items-center justify-center rounded-full border-[1.5px] font-[family-name:var(--card-font-mono)] text-xs font-bold transition-all",
                // isSelected FIRST, so a selected day with no card still draws
                // as selected. Reachable via Aujourd'hui on a weekday Jenn
                // skipped, and via a hand-typed ?date=.
                isSelected
                  ? "scale-[1.12] border-[var(--card-bleu)] bg-[var(--card-bleu)] text-white"
                  : enabled
                    ? "border-[var(--card-line)] bg-[var(--card-paper)] text-[#9c8f75] hover:border-[var(--card-bleu)] hover:text-[var(--card-bleu)]"
                    : "border-[var(--card-line)] bg-transparent text-[#c9bfae]",
              )}
            >
              {letter}
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

- [x] **Step 2: Rewrite `components/student/CardHeading.tsx`**

Replace the whole file. It keeps the eyebrow, loses the range line and therefore both props and the `formatWeekRange` import. The three-bullet placement comment is retained because it is still true and still the reason this component exists at all.

```tsx
// The ⚜ eyebrow. The week range that used to sit under it moved to
// CardDateNav, which owns every date control on this tab: the range is the
// SELECTED week now and doubles as the button that opens the calendar, and
// neither of those is a static server-rendered line.
//
// This renders inside the CARD TAB'S BRANCH of the page body, not inside
// StudentTabs, and that placement is the whole decision:
//
//   - The tab strip only renders when a visitor has more than the card. An
//     untokened visitor has no strip at all and still needs this heading;
//     hanging it off the strip would delete it for exactly the person who has
//     nothing else on the page.
//   - The teacher has no card tab. Living in the card branch means she loses
//     this without a second rule anywhere saying so.
export function CardHeading() {
  return (
    <div className="mx-auto mb-6 max-w-[560px] text-center">
      <div className="font-[family-name:var(--card-font-serif)] text-[13px] uppercase tracking-[6px] text-[var(--card-bleu)] opacity-80">
        ⚜ La carte du jour ⚜
      </div>
    </div>
  );
}
```

The eyebrow's `mb-2` is dropped along with the line it was spacing from.

- [x] **Step 3: Delete `WeekDayPicker`**

```bash
git rm components/WeekDayPicker.tsx
```

- [x] **Step 4: Rewire `app/g/[slug]/page.tsx`**

Four edits.

**(a)** Replace the two imports on lines 7–8:

```ts
import { WeekDayPicker } from "@/components/WeekDayPicker";
import { weekRange, latestViewableDate } from "@/lib/week";
```

with:

```ts
import { CardDateNav } from "@/components/student/CardDateNav";
import { latestViewableDate } from "@/lib/week";
```

**(b)** Extend the `@/lib/cards` import on line 5:

```ts
import { getEffectiveCard, listCardDates } from "@/lib/cards";
```

**(c)** Replace the date block (lines 127–133):

```ts
  const todayStr = new Date().toISOString().slice(0, 10);
  const today = new Date(`${todayStr}T00:00:00Z`);
  const selectedDate = parseDate(date, latestViewableDate(today));
  const card = await getEffectiveCard(selectedDate);

  const selected = selectedDate.toISOString().slice(0, 10);
  const { start: weekStart, end: weekEnd } = weekRange(today);
```

with:

```ts
  const todayStr = new Date().toISOString().slice(0, 10);
  const today = new Date(`${todayStr}T00:00:00Z`);
  // One value doing two jobs, deliberately: the ceiling parseDate clamps to,
  // and the day Aujourd'hui goes to. Both are "the latest day a student may
  // look at", which on a weekend is the Friday that closed the week.
  const latest = latestViewableDate(today);
  const selectedDate = parseDate(date, latest);
  const card = await getEffectiveCard(selectedDate);

  const selected = selectedDate.toISOString().slice(0, 10);
  // Only for the card tab, and bounded, so the dates of pre-posted cards never
  // reach the browser. An unlocked teacher has no card tab, so her page does
  // not run this query at all.
  const cardDates = tab === "card" ? await listCardDates(latest) : [];
```

`tab` is computed on line 121, above this block, so it is in scope. Do not move either.

**(d)** Replace the card branch's first two elements (lines 168–169):

```tsx
          <CardHeading weekStart={weekStart} weekEnd={weekEnd} />
          <WeekDayPicker slug={slug} today={today} selected={selected} />
```

with:

```tsx
          <CardHeading />
          <CardDateNav
            slug={slug}
            selected={selected}
            today={todayStr}
            latest={latest.toISOString().slice(0, 10)}
            cardDates={cardDates}
          />
```

- [x] **Step 5: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint components/student/CardDateNav.tsx components/student/CardHeading.tsx "app/g/[slug]/page.tsx"`

Expected: no output. If `tsc` reports `weekStart`/`weekEnd` unused or undefined, edit (c) or (d) is half-applied.

- [ ] **Step 6: Verify against real data** (manual — not run)

You need cards on several dates across two months. If the dev database is thin, create them: `/admin?tab=daily`, pick a date in the calendar, fill *English prompt* and *French answer*, save; repeat. Make at least one **weekday with no card** inside a week that has others, and leave at least one week entirely empty.

Then open `/g/<slug>` as a student and check each of these:

1. **The strip shows the selected week.** Click the week-range line, page back a month, pick a day. The five dots below are now that week's, and the range line reads that week.
2. **A day with no card cannot be clicked** — faded, both in the strip and in the calendar grid. Confirm the specific weekday you left empty.
3. **A future day cannot be clicked.** In the calendar, page forward: every day after today is faded, including any you pre-posted a card for.
4. **The calendar opens on the selected day's month.** Page two months back, Escape, reopen — it returns to the selected day's month.
5. **Escape and outside-click close it**, and focus returns to the range line.
6. **`Aujourd'hui`** returns you to today's card and is then greyed out. On a Saturday or Sunday it lands on Friday — that is `latestViewableDate` and is correct.
7. **A day with no card still shows as selected** when you reach it directly: load `/g/<slug>?date=<an empty weekday>`. The dot is filled, the card slot reads *Nothing posted yet — check back soon!*
8. **Nothing shifts on hydration.** Reload with the network throttled; the strip and range must not flicker to different values.
9. **An untokened visitor** (a private window, no `?k=`) still gets the eyebrow, the range line, the calendar and the strip. The card is public and this navigation is part of it.
10. **The teacher, unlocked**, still has no card tab and lands on *Les fichiers*.

- [x] **Step 7: Commit**

```bash
git add components/student/CardDateNav.tsx components/student/CardHeading.tsx "app/g/[slug]/page.tsx" && git commit -m "feat: give the student's card page a month calendar and a Today button" --trailer "Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 12: Update `CLAUDE.md`

`CLAUDE.md` is this project's spec of record and five of its statements are now wrong or incomplete. Each edit below quotes an existing sentence to anchor on — search for it, then insert as directed. Do not restructure anything else; the file is long and a diff that moves paragraphs hides the parts that matter.

**Files:**
- Modify: `CLAUDE.md`

- [x] **Step 1: The `/g/[slug]` routes-table row**

Find this fragment inside the `/g/[slug]` row of the Routes table:

> Adding a link or a page is a `+` FAB left of the chat button, present on every tab, and either party may pin a page.

Insert immediately after it, in the same cell:

```
The card tab carries the week's five day dots, a week-range line that opens a month calendar, and *Aujourd'hui*; a day with no card cannot be selected.
```

- [x] **Step 2: The Dates section**

Find:

> The teaching week runs Monday–Friday; both Saturday and Sunday belong to the week that just ended (`lib/week.ts`).

Insert directly after that sentence:

```
`mondayOf` is where that rule lives and `weekDates` returns the five teaching
days of any date's week. `lib/month-grid.ts` keeps its own copy of the same
arithmetic on purpose — it steps over the weekend while walking a whole month,
which is a different job.
```

Then find:

> The student page clamps `?date=` to `latestViewableDate(today)` so students cannot read ahead of pre-posted cards.

and insert after it:

```
Two more things enforce the same bound now that the card page has a calendar
students can page through. `listCardDates` (`lib/cards.ts`) filters to
`<= latestViewableDate(today)` **in the query**, so the dates of pre-posted
cards never reach the browser at all, and `isSelectableCardDate`
(`lib/card-dates.ts`) re-checks it, because the calendar can page into a month
the query said nothing about. A day with no card is disabled rather than absent:
a calendar missing a Tuesday reads as a rendering fault. One value —
`latestViewableDate(today)` — is both that ceiling and the day *Aujourd'hui*
goes to, passed as a single prop because they are the same rule; on a weekend
that is the Friday that closed the week, so the button appears to do nothing if
you push the real Saturday and let `parseDate` clamp it back.
```

- [x] **Step 3: The Auth section**

Find:

> `studentGate` (`lib/student-gate.ts`) decides which of six states a visitor is in, and its clause order is the specification — see the comments.

Insert directly after that sentence:

```
`authPanelMode` sits beside it and answers a narrower question — which form, if
any, to render — and returns `null` for the teacher in every state. That is not
cosmetic: the panel's signed-in mode is *Se déconnecter*, and `signOutStudent`
clears the **student's** cookie for that slug, which is the cookie `unlocked` is
derived from, so the control offered her a way to lock herself out of the Files
and Whiteboard tabs. It is a predicate rather than a seventh gate state because
`unlocked` compares against `signed-in` and a new state would have to be added
to that comparison too.
```

- [x] **Step 4: The Files section — chat links and the two deletes**

Find:

> A student may add a page as well as a link — `addShelfPage` is `addShelfLink`'s sibling and shares its `requireShelfRole` guard.

Insert directly after that sentence:

```
A third way in needs no control at all: **a link in a chat message is filed on
that conversation's shelf automatically**, by `addChatLinks`
(`lib/shelf-links.ts`) from the chat POST route, for whichever party sent it.
`extractLinks` (`lib/chat-links.ts`) decides which URLs count and reuses
`parseLinkUrl` rather than validating again — one guard, not two places for
`javascript:` to get through. A scheme is required, because prose is full of
things a URL parser would read as a hostname; five per message, because 4000
characters is room for forty page rows; and a URL already on that shelf, or on
the everyone shelf it inherits from, is skipped rather than duplicated.
`addedByStudent` mirrors the sender, which is what decides whether the student
can later delete it. It never throws and it runs after `createMessage`: a link
that cannot be filed must not cost the message that mentioned it. The shelf
updates on the next navigation to it, not live — there is deliberately no SSE
frame for this. The everyone group is excluded for free, since `chatRole`
refuses it before anything else.
```

Then find:

> In the admin the tile links to `/p/[slug]` and a pencil icon links to the editor, not the reverse — following a thumbnail should show the page it is a thumbnail of.

and insert after it:

```
A **link** tile shows a trash icon in place of that pencil and the download
beside it, which is the third clause of the same sentence: it trades the two
controls it cannot use for the one it can. Until that existed a link could not
be deleted anywhere — `/admin/pages/[slug]` 404s on a link row and
`PageEditor`'s *Delete page* was the admin's only delete. It calls the same
teacher-only `deletePage`, with no confirmation, matching that button. On a
student's shelf the teacher now gets the × on **every** row (`canDeleteAny`),
which adds no authority — `deleteShelfLink` has always let her remove anything
there — and matters because chat-filed links arrive with `addedByStudent` false,
precisely the set she could not reach. `canStudentDelete` is unchanged and is
still re-checked on the server regardless of which controls a tile rendered.
```

- [x] **Step 5: The Lesson chat section**

Find:

> Retention is forever, deliberately — this is a teaching record.

Insert directly after that sentence:

```
A message carrying a URL also files it on that student's shelf — see *Files:
pages, links and PDFs*. The message text is unchanged and still renders as
plain text; linkifying it is deliberately not part of that.
```

- [x] **Step 6: The `+` FAB, in the Conventions section**

This one has no existing sentence to anchor on, because nothing in `CLAUDE.md`
records where the fixed buttons sit. Append it as a **new final bullet** to the
`## Conventions` list, directly after the bullet beginning *"Server actions call
`revalidatePath`"*:

```
- **Two fixed buttons share the bottom-right corner.** `InboxFab` is at
  `bottom-6 right-4` on `/admin`, `/admin/pages/[slug]` and `/g/[slug]`; the add
  `+` sits at `bottom-6 right-24`, to its left, in both `AdminChrome` and
  `ShelfFab`. They are the same `z-50`, so a third fixed control at `right-4`
  will silently paint over one of them — which is exactly what the admin's `+`
  did until 2026-08-04. `bottom-24` is not a free slot either: that is where the
  open panel and the add menu go.
```

- [x] **Step 7: Verify the file still reads straight**

Run: `git diff CLAUDE.md`

Read every hunk. Each insertion must sit inside the section it belongs to, not straddle a heading, and must not repeat a sentence already two paragraphs above it.

- [x] **Step 8: Commit**

```bash
git add CLAUDE.md && git commit -m "docs: record chat links, the card calendar and the three uncovered controls" --trailer "Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 13: Full verification

CI (`.github/workflows/ci.yml`) runs these in this order. Run all of them locally before claiming the work is done — a green `vitest` is not a green build, and this change touches component trees `tsc` will have opinions about.

**Files:** none modified.

- [x] **Step 1: Regenerate the Prisma client**

Run: `npx prisma generate`

Expected: `Generated Prisma Client`. No migration was added, so nothing else should happen. If Prisma reports a schema drift, something in this plan was misapplied — no task touches `schema.prisma`.

- [x] **Step 2: Lint**

Run: `npm run lint`

Expected: no output, exit 0.

- [x] **Step 3: Typecheck**

Run: `npm run typecheck`

Expected: no output, exit 0.

- [x] **Step 4: Tests**

Run: `npm test`

Expected: every file passes, including the four this plan touched — `chat-links`, `card-dates`, `week`, `student-gate`. Confirm the counts: `week.test.ts` gained 11 tests, `student-gate.test.ts` gained 6, `chat-links.test.ts` has 15, `card-dates.test.ts` has 6.

- [x] **Step 5: Build**

Run: `npm run build`

Expected: a successful build. Watch specifically for a `useState`/`useEffect` error naming `MonthCalendar` or `CardDateNav` — both need `"use client"` on line 1, and `CardHeading` must **not** have it.

- [ ] **Step 6: Final regression sweep in the running app**

`npm run dev`, then confirm nothing on the list below broke. These are the things this change stood next to without meaning to touch:

1. `/admin?tab=daily` — the date field's popover behaves exactly as it did (Task 9, Step 4).
2. `/admin?tab=pages` — pencil, download and pin still work on a PDF and on an HTML page; the student filter chips still filter; pinning is still disabled under *All*.
3. `/g/<slug>` as a student — the chat sends and receives, *Les fichiers* and *Le tableau* both open, adding a link through the `+` FAB still works.
4. `/g/<slug>` as the teacher — the inbox FAB opens on that student's conversation, *← Back to admin* works, no card tab, no *Se déconnecter*.
5. A live whiteboard — start one as the teacher, draw, and click *Les fichiers*: the leave-guard dialog still appears. `CardDateNav` added anchors and buttons to a page that guard watches, and a `router.push` from a button is not an anchor click, so the guard should be unaffected — confirm it.
6. `/f/<filesToken>` — read-only shelf, no pins, no ×.
7. `/p/<slug>` for an HTML page and for a PDF — the iframe and the redirect to `/p/<slug>/pdf`.

- [ ] **Step 7: Confirm the spec is satisfied, item by item**

Re-read `docs/superpowers/specs/2026-08-04-chat-links-and-card-calendar-design.md` sections 1–5 and check each numbered problem is actually fixed in the running app. Do not tick this from the code alone.

- [ ] **Step 8: Commit anything outstanding**

If Steps 1–6 required a fix, commit it:

```bash
git add -A && git commit -m "fix: address verification findings" --trailer "Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

Otherwise there is nothing to commit and the work is complete.

---

## Notes for whoever executes this

- **Tasks 1–3 and 10 are safe in any order.** Tasks 5, 6, 7, 8 are independent of each other and of everything else. The only hard ordering is **9 before 11**, and **3 before 4**.
- **If a manual verification step contradicts this plan, trust the app.** Several steps describe pixel-level behaviour of an existing component; if the admin popover already behaved differently from Task 9 Step 4's description before you started, note it and move on rather than "fixing" it.
- **Do not add a migration, an SSE frame, a confirmation dialog, or a `+` on the page editor.** Each is listed in the spec's section 8 as a considered and rejected option, with the reason. If one turns out to be necessary, that is a spec change and worth raising rather than absorbing.

