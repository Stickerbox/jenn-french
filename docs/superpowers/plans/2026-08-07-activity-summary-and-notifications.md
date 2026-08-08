# Activity Summary and Notification Dots Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tell Jenn what changed on each student's page without opening every tab, and tell each party when the other has added something.

**Architecture:** One watermark timestamp per (party, surface) on `Group`, following the existing `Group.teacherLastReadAt`. Three pure modules in `lib/` turn rows plus a watermark into counts. One read model assembles them. Three surfaces render them: bullet lists on the admin student cards, dots on the student page's tabs, dots on each file tile.

**Tech Stack:** Next.js App Router (RSC + server actions), Prisma on SQLite, Tailwind v4, vitest, framer-motion.

**Spec:** `docs/superpowers/specs/2026-08-07-activity-summary-and-notifications-design.md`. Read it before starting. It records why each rejected alternative was rejected.

---

## Before you start

This codebase has strong conventions. Four matter here:

1. **Logic belongs in `lib/`.** Anything with a rule in it is a pure function in `lib/` with a test in `tests/lib/`. Components and Prisma access are not unit-tested.
2. **Comments explain the "why", especially the counter-intuitive.** Most comments here record a decision and the failure that motivated it. Do not add comments that restate the code.
3. **Only the `Locale` crosses into a client component, never the resolved `Strings` object.** The values are functions and React cannot serialise them. That mistake ships a request-time 500 past lint, `tsc`, the tests and the build.
4. **User-facing strings live in `lib/strings.ts`**, in both locales, both objects annotated `Strings`.

**`node_modules` is not installed in this checkout.** Run this once before Task 1, or every command below fails with `eslint: command not found`:

```bash
npm install
```

Run this before you claim any task is done:

```bash
npx prisma generate && npm run lint && npm run typecheck && npm test
```

---

## File structure

### Created

| File | Responsibility |
|---|---|
| `lib/unseen.ts` | Counting rows newer than a watermark, authored by the other party |
| `lib/homework-status.ts` | One worksheet → exactly one of four states, including the 7-day rule |
| `lib/student-summary.ts` | Counts → an ordered list of bullet keys |
| `lib/student-activity.ts` | The Prisma read model that feeds the admin cards |
| `app/seen-actions.ts` | `markTabSeen`, `markWorksheetOpened` |
| `components/student/MarkTabSeen.tsx` | Fires a seen action once on mount |
| `components/admin/StudentCard.tsx` | One student's card with its bullet list |
| `components/ui/UnseenDot.tsx` | The dot, with its `sr-only` label |
| `tests/lib/unseen.test.ts` | |
| `tests/lib/homework-status.test.ts` | |
| `tests/lib/student-summary.test.ts` | |

### Modified

| File | Change |
|---|---|
| `prisma/schema.prisma` | 6 watermarks, `Flashcard.fromTeacher`, `ActionItem.doneByTeacher`, `WorksheetOpen` |
| `app/deck-actions.ts` | Write both new author fields from the resolved role |
| `lib/strings.ts` | Bullet sentences and dot labels, both locales |
| `components/admin/GroupList.tsx` | `Tile` → `StudentCard`, grid layout |
| `app/admin/page.tsx` | `GroupsTab` calls the read model |
| `components/student/StudentTabs.tsx` | `dots` prop |
| `components/ui/PageTile.tsx` | `dot` prop |
| `components/student/FilesTab.tsx` | Pass `dot` per tile |
| `app/g/[slug]/page.tsx` | Compute dots, mount `MarkTabSeen` |
| `app/g/[slug]/w/[pageSlug]/page.tsx` | Mount the worksheet-open marker |

---

## Task 1: Schema and migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_activity_watermarks/migration.sql`

- [ ] **Step 1: Add the six watermarks to `Group`**

In `prisma/schema.prisma`, find `teacherLastReadAt` in `model Group` and add below it:

```prisma
  // What Jenn and the student have each already looked at, one column per
  // (party, surface). The mechanism is Group.teacherLastReadAt directly above,
  // and the count is the same shape: rows newer than the mark. Six columns and
  // not three because the student asks the same question about Jenn that Jenn
  // asks about the student, and a per-tutor flag cannot answer both.
  //
  // Null means "has never looked", not "has seen it all" — the same reading
  // teacherLastReadAt has. Correct for a student created after this shipped:
  // they have no rows yet.
  //
  // There is deliberately no studentSeenChatAt. The chat FAB already carries
  // its own unread dot, stored per device under `chat-seen:<slug>`, and two
  // query paths for one number are two things that can disagree — the reason
  // unreadCounts was removed when listConversations absorbed it.
  teacherSeenFilesAt DateTime?
  teacherSeenDeckAt  DateTime?
  teacherSeenTodoAt  DateTime?
  studentSeenFilesAt DateTime?
  studentSeenDeckAt  DateTime?
  studentSeenTodoAt  DateTime?
```

Then add to `Group`'s relation list, beside `actionItems`:

```prisma
  worksheetOpens WorksheetOpen[]
```

- [ ] **Step 2: Add the author column to `Flashcard`**

In `model Flashcard`, add directly above `lastViewedAt`:

```prisma
  // Who added it. A boolean for the reason Message.fromTeacher is one: there
  // are exactly two participants and one of them has no row to point at.
  //
  // Without it a dot cannot mean "the other party added this", so a student's
  // own card would light their own tab. ActionItem.fromTeacher is the twin.
  //
  // The default exists only to admit the rows already in this table. Every
  // writer sets it explicitly, from the role the guard resolved.
  fromTeacher Boolean @default(false)
```

- [ ] **Step 3: Add the tick author to `ActionItem`**

In `model ActionItem`, add directly below `doneAt`:

```prisma
  // Who ticked it, null while the row is open. doneAt records WHEN and either
  // party can tick, so without this Jenn ticking her own item counts as the
  // student completing work.
  //
  // A nullable boolean rather than a second timestamp: doneAt already answers
  // when, and two clocks on one transition is the trap PageVersion.sentAt
  // records.
  doneByTeacher Boolean?
```

- [ ] **Step 4: Add the `WorksheetOpen` model**

Add at the end of `prisma/schema.prisma`:

```prisma
// A student has opened this worksheet. One row per (page, student), rewritten
// on each open, so it means "last opened" and not "opened N times".
//
// NOT a column on PageVersion, and the reason must not be undone. A student
// who opens a worksheet and saves nothing has no PageVersion row, so stamping
// an openedAt there means creating an empty slot — and three rules read row
// existence as "this party has saved something": visibleSlots would give Jenn
// a "Marie's answers" tab holding nothing, sendState would move the student's
// Send from empty to ready with nothing to send, and shelfSlotCount would
// badge the shelf before any work exists. The three-slot rule is enforced by
// @@unique([pageId, groupId, fromTeacher]) at the database level, and that is
// exactly what makes row existence worth trusting.
//
// An open is a visit and a version is content. They have different lifetimes,
// so they get different rows.
model WorksheetOpen {
  pageId  String
  groupId String
  page    Page  @relation(fields: [pageId], references: [id], onDelete: Cascade)
  group   Group @relation(fields: [groupId], references: [id], onDelete: Cascade)

  // Written explicitly by the action on both branches of its upsert, NOT
  // @updatedAt: Prisma does not reliably bump an @updatedAt field on an update
  // with an empty data object, which is exactly the shape an upsert's update
  // branch would otherwise have here.
  openedAt DateTime @default(now())

  @@id([pageId, groupId])
}
```

Add to `model Page`'s relation list, beside `pins`:

```prisma
  opens     WorksheetOpen[]
```

- [ ] **Step 5: Generate the migration without applying it**

```bash
npx prisma migrate dev --create-only --name activity_watermarks
```

Expected: a new folder under `prisma/migrations/` containing `migration.sql`, and the message `You can now edit it`.

- [ ] **Step 6: Hand-edit the migration to backfill the watermarks**

Open the generated `migration.sql` and append at the end:

```sql
-- Existing students have already been seen. Without this the first render
-- tells Jenn she has 47 new flashcards, all of them written by her, months
-- ago — and a feature whose first impression is a wrong number is one she
-- learns to ignore.
--
-- CURRENT_TIMESTAMP is what Prisma itself writes for a DEFAULT on this
-- connector (see Flashcard.createdAt in 20260807195633), so the stored form is
-- the one the client already reads back.
UPDATE "Group" SET
  "teacherSeenFilesAt" = CURRENT_TIMESTAMP,
  "teacherSeenDeckAt"  = CURRENT_TIMESTAMP,
  "teacherSeenTodoAt"  = CURRENT_TIMESTAMP,
  "studentSeenFilesAt" = CURRENT_TIMESTAMP,
  "studentSeenDeckAt"  = CURRENT_TIMESTAMP,
  "studentSeenTodoAt"  = CURRENT_TIMESTAMP;
```

**Read the rest of the generated SQL before applying it.** Prisma on SQLite reads some changes as a drop plus an add and generates an `INSERT ... SELECT` that silently discards column data. If you see a table rebuild, check that every existing column is carried across. This trap already cost this project one migration — see the `pdfThumb` rename note in `.claude/rules/files-pages-pdfs.md`.

- [ ] **Step 7: Apply it**

```bash
npx prisma migrate dev
npx prisma generate
```

Expected: `Your database is now in sync with your schema` and `Generated Prisma Client`.

- [ ] **Step 8: Verify the backfill landed**

```bash
npx prisma studio --browser none &
sleep 3 && kill %1
sqlite3 prisma/dev.db 'SELECT name, teacherSeenDeckAt FROM "Group";'
```

Expected: every existing row has a non-null `teacherSeenDeckAt`. If `sqlite3` is unavailable, skip this step — `npm test` in later tasks does not depend on it.

- [ ] **Step 9: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "Add the activity watermarks, the two author columns and WorksheetOpen

Six watermarks on Group, one per (party, surface), following
teacherLastReadAt. Flashcard gains an author because nothing recorded who
added a card, and ActionItem gains one for the tick because doneAt records
when and not who.

WorksheetOpen is a separate row rather than PageVersion.openedAt: an empty
version row breaks visibleSlots, sendState and shelfSlotCount, all three of
which read row existence as \"this party has saved something\".

The migration backfills existing rows so day one is quiet.

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 2: `lib/unseen.ts`

The counting rule, shared by all three surfaces.

**Files:**
- Create: `lib/unseen.ts`
- Test: `tests/lib/unseen.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/unseen.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { countUnseen, pageIsUnseen } from "@/lib/unseen";

const t = (iso: string) => new Date(iso);

describe("countUnseen", () => {
  it("counts the other party's rows newer than the watermark", () => {
    const rows = [
      { at: t("2026-08-05T10:00:00Z"), fromTeacher: false },
      { at: t("2026-08-07T10:00:00Z"), fromTeacher: false },
    ];
    expect(countUnseen(rows, t("2026-08-06T00:00:00Z"), true)).toBe(1);
  });

  it("never counts your own rows", () => {
    // The whole point of the author filter: a dot means "something happened
    // that you have not seen", so your own upload must not light your own tab.
    const rows = [{ at: t("2026-08-07T10:00:00Z"), fromTeacher: true }];
    expect(countUnseen(rows, t("2026-08-06T00:00:00Z"), true)).toBe(0);
    expect(countUnseen(rows, t("2026-08-06T00:00:00Z"), false)).toBe(1);
  });

  it("counts everything when the watermark is null", () => {
    // Null means "has never looked", not "has seen it all" — the same reading
    // teacherLastReadAt has.
    const rows = [
      { at: t("2020-01-01T00:00:00Z"), fromTeacher: false },
      { at: t("2026-08-07T10:00:00Z"), fromTeacher: false },
    ];
    expect(countUnseen(rows, null, true)).toBe(2);
  });

  it("excludes a row exactly on the watermark", () => {
    // Strictly newer. The watermark is stamped when the tab renders, so a row
    // written in that same millisecond was on screen.
    const rows = [{ at: t("2026-08-06T00:00:00Z"), fromTeacher: false }];
    expect(countUnseen(rows, t("2026-08-06T00:00:00Z"), true)).toBe(0);
  });

  it("counts nothing in an empty list", () => {
    expect(countUnseen([], null, true)).toBe(0);
  });
});

describe("pageIsUnseen", () => {
  const base = {
    createdAt: t("2026-08-01T00:00:00Z"),
    updatedAt: t("2026-08-01T00:00:00Z"),
    addedByStudent: false,
    versions: [],
  };

  it("is true for a page the other party added since the watermark", () => {
    const page = {
      ...base,
      createdAt: t("2026-08-07T10:00:00Z"),
      updatedAt: t("2026-08-07T10:00:00Z"),
      addedByStudent: true,
    };
    expect(pageIsUnseen(page, t("2026-08-06T00:00:00Z"), true)).toBe(true);
  });

  it("is false for a page you added yourself", () => {
    const page = {
      ...base,
      createdAt: t("2026-08-07T10:00:00Z"),
      updatedAt: t("2026-08-07T10:00:00Z"),
      addedByStudent: true,
    };
    expect(pageIsUnseen(page, t("2026-08-06T00:00:00Z"), false)).toBe(false);
  });

  it("is true for a version the other party saved", () => {
    const page = {
      ...base,
      versions: [{ fromTeacher: true, updatedAt: t("2026-08-07T10:00:00Z") }],
    };
    expect(pageIsUnseen(page, t("2026-08-06T00:00:00Z"), false)).toBe(true);
  });

  it("treats a content change on an older page as the teacher's", () => {
    // Only updatePage, updatePdfPage and updatePageMeta write updatedAt and
    // all three are requireTeacher(), so an edit is always Jenn's.
    const page = { ...base, updatedAt: t("2026-08-07T10:00:00Z") };
    expect(pageIsUnseen(page, t("2026-08-06T00:00:00Z"), false)).toBe(true);
    expect(pageIsUnseen(page, t("2026-08-06T00:00:00Z"), true)).toBe(false);
  });

  it("does not read a student's own fresh upload as a teacher edit", () => {
    // THE TWO-CLOCK TRAP. createdAt comes from SQLite's CURRENT_TIMESTAMP and
    // updatedAt from the client's Date, so on a fresh row they differ by
    // milliseconds in either direction. Comparing them would light the
    // student's own tile the instant they uploaded.
    const page = {
      ...base,
      createdAt: t("2026-08-07T10:00:00.000Z"),
      updatedAt: t("2026-08-07T10:00:00.004Z"),
      addedByStudent: true,
    };
    expect(pageIsUnseen(page, t("2026-08-06T00:00:00Z"), false)).toBe(false);
  });

  it("is false for a page nothing has touched since the watermark", () => {
    expect(pageIsUnseen(base, t("2026-08-06T00:00:00Z"), true)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run tests/lib/unseen.test.ts
```

Expected: FAIL — `Failed to resolve import "@/lib/unseen"`.

- [ ] **Step 3: Write the implementation**

Create `lib/unseen.ts`:

```ts
// A row somebody authored, at a time. Structural rather than a model type:
// four tables feed this and none of them agrees on a column name for either
// half — Page has addedByStudent, PageVersion and Flashcard have fromTeacher,
// ActionItem has doneByTeacher.
export type AuthoredRow = {
  at: Date;
  fromTeacher: boolean;
};

// Rows newer than the watermark, authored by the OTHER party.
//
// The author filter is the rule and not an optimisation. A dot means
// "something happened that you have not seen", so your own upload must never
// light your own tab. Every row this counts already carries an author, which
// is what makes this a filter rather than a column.
//
// A null watermark counts everything — it means "has never looked", not "has
// seen it all", the same reading teacherLastReadAt has.
//
// Strictly newer, so a row written in the millisecond the tab rendered is
// treated as seen. It was on screen.
export function countUnseen(
  rows: AuthoredRow[],
  seenAt: Date | null,
  viewerIsTeacher: boolean,
): number {
  return rows.filter(
    (row) =>
      row.fromTeacher !== viewerIsTeacher &&
      (seenAt === null || row.at.getTime() > seenAt.getTime()),
  ).length;
}

// Only what deciding a dot needs. Satisfied by lib/pages.ts's ShelfPage
// without a cast, which is why the fields are named as they are.
export type UnseenPage = {
  createdAt: Date;
  updatedAt: Date;
  addedByStudent: boolean;
  versions: { fromTeacher: boolean; updatedAt: Date }[];
};

// THE SHELF'S ONE PREDICATE. The tile dot, the tab dot and the admin card's
// file count all go through this, so a tab can never claim work that no tile
// shows — the failure the worksheet rules record about shelfSlotCount, whose
// fix was deriving badge, tabs and count from one module.
export function pageIsUnseen(
  page: UnseenPage,
  seenAt: Date | null,
  viewerIsTeacher: boolean,
): boolean {
  const rows: AuthoredRow[] = [
    { at: page.createdAt, fromTeacher: !page.addedByStudent },
    ...page.versions.map((version) => ({
      at: version.updatedAt,
      fromTeacher: version.fromTeacher,
    })),
  ];

  // A content change has no author column and needs none: updatePage,
  // updatePdfPage and updatePageMeta are the only writers of updatedAt and all
  // three are requireTeacher(), so an edit is always Jenn's.
  //
  // Gated on the page pre-dating the WATERMARK, and deliberately NOT on
  // updatedAt > createdAt. Prisma writes those two from different clocks —
  // SQLite's CURRENT_TIMESTAMP for the default and the client's Date for
  // @updatedAt — so on a fresh row they differ by milliseconds in either
  // direction, and comparing them would read a student's own upload as a
  // teacher edit in the instant they made it. This is the same two-clock trap
  // PageVersion.sentAt records.
  //
  // A page newer than the watermark needs no such row: its creation entry
  // above already decides it, with the correct author.
  if (seenAt !== null && page.createdAt.getTime() <= seenAt.getTime()) {
    rows.push({ at: page.updatedAt, fromTeacher: true });
  }

  return countUnseen(rows, seenAt, viewerIsTeacher) > 0;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run tests/lib/unseen.test.ts
```

Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/unseen.ts tests/lib/unseen.test.ts
git commit -m "Count what the other party has done since you last looked

countUnseen filters on the author as well as the time, because a dot that
lights for your own upload stops meaning anything. pageIsUnseen is the one
predicate behind the tile dot, the tab dot and the admin card's file count,
so the three cannot disagree.

The content-change signal compares against the watermark rather than against
createdAt: Prisma writes createdAt and updatedAt from two different clocks.

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 3: `lib/homework-status.ts`

**Files:**
- Create: `lib/homework-status.ts`
- Test: `tests/lib/homework-status.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/homework-status.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { homeworkStatus, CORRECTION_WINDOW_MS } from "@/lib/homework-status";

const t = (iso: string) => new Date(iso);
const now = t("2026-08-07T12:00:00Z");

describe("homeworkStatus", () => {
  it("is not-opened when nothing has happened", () => {
    expect(
      homeworkStatus({
        openedAt: null,
        studentSentAt: null,
        teacherSavedAt: null,
        now,
      }),
    ).toBe("not-opened");
  });

  it("is started once opened with nothing handed in", () => {
    expect(
      homeworkStatus({
        openedAt: t("2026-08-06T09:00:00Z"),
        studentSentAt: null,
        teacherSavedAt: null,
        now,
      }),
    ).toBe("started");
  });

  it("is awaiting-correction once handed in", () => {
    expect(
      homeworkStatus({
        openedAt: t("2026-08-06T09:00:00Z"),
        studentSentAt: t("2026-08-06T10:00:00Z"),
        teacherSavedAt: null,
        now,
      }),
    ).toBe("awaiting-correction");
  });

  it("is settled once a correction is newer than the hand-in", () => {
    expect(
      homeworkStatus({
        openedAt: t("2026-08-06T09:00:00Z"),
        studentSentAt: t("2026-08-06T10:00:00Z"),
        teacherSavedAt: t("2026-08-06T11:00:00Z"),
        now,
      }),
    ).toBe("settled");
  });

  it("ignores a correction older than the hand-in", () => {
    // Jenn corrected, then the student handed in a revision. That is new work
    // owed back, not settled.
    expect(
      homeworkStatus({
        openedAt: t("2026-08-01T09:00:00Z"),
        studentSentAt: t("2026-08-06T10:00:00Z"),
        teacherSavedAt: t("2026-08-02T11:00:00Z"),
        now,
      }),
    ).toBe("awaiting-correction");
  });

  it("still awaits correction one millisecond inside the window", () => {
    const sent = new Date(now.getTime() - CORRECTION_WINDOW_MS + 1);
    expect(
      homeworkStatus({
        openedAt: sent,
        studentSentAt: sent,
        teacherSavedAt: null,
        now,
      }),
    ).toBe("awaiting-correction");
  });

  it("settles on the window boundary", () => {
    // Jenn often corrects live in the lesson and files nothing. A task that
    // never clears becomes a permanent mark she stops reading.
    const sent = new Date(now.getTime() - CORRECTION_WINDOW_MS);
    expect(
      homeworkStatus({
        openedAt: sent,
        studentSentAt: sent,
        teacherSavedAt: null,
        now,
      }),
    ).toBe("settled");
  });

  it("reports handed-in work even when no open was recorded", () => {
    // WorksheetOpen shipped after some worksheets had already been handed in,
    // so an absent open must not outrank a real hand-in.
    expect(
      homeworkStatus({
        openedAt: null,
        studentSentAt: t("2026-08-06T10:00:00Z"),
        teacherSavedAt: null,
        now,
      }),
    ).toBe("awaiting-correction");
  });

  it("holds a seven-day window", () => {
    expect(CORRECTION_WINDOW_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run tests/lib/homework-status.test.ts
```

Expected: FAIL — `Failed to resolve import "@/lib/homework-status"`.

- [ ] **Step 3: Write the implementation**

Create `lib/homework-status.ts`:

```ts
// One worksheet on one shelf is in exactly one of these. Disjoint by
// construction, so the three bullets built from them can never double-count a
// worksheet.
export type HomeworkState =
  | "not-opened"
  | "started"
  | "awaiting-correction"
  | "settled";

// Seven days, and this is the one rule here about Jenn's real week rather than
// about data.
//
// "Awaiting correction" is a TASK, not news. It must not clear because she
// glanced at the card — an interruption would spend the only signal that a
// student is waiting, which is why it has no watermark. But she often corrects
// live in the lesson and files nothing at all, and a task that never clears
// becomes a permanent mark she stops reading. This is the compromise.
export const CORRECTION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export function homeworkStatus({
  openedAt,
  studentSentAt,
  teacherSavedAt,
  now,
}: {
  openedAt: Date | null;
  // The student's own row, announced. Null covers both "no row" and "saved but
  // never sent" — sendState already treats an unannounced row as unfinished,
  // and Jenn is not owed a correction of work nobody handed her.
  studentSentAt: Date | null;
  teacherSavedAt: Date | null;
  // Passed in, never read as new Date() here, for the reason FilesTab takes a
  // `today` prop: a clock read inside a pure function is untestable and, on a
  // component, straddles hydration.
  now: Date;
}): HomeworkState {
  // Handed in outranks everything below it. WorksheetOpen shipped after some
  // worksheets had already been handed in, so those rows have no open and an
  // absent open must not outrank a real hand-in.
  if (studentSentAt !== null) {
    // Strictly newer, so a revision handed in after a correction is owed a
    // second one. Both timestamps are written by the client on separate
    // requests, so this is a real ordering rather than the two-clock
    // comparison PageVersion.sentAt refuses.
    if (
      teacherSavedAt !== null &&
      teacherSavedAt.getTime() > studentSentAt.getTime()
    ) {
      return "settled";
    }

    // Elapsed milliseconds, deliberately NOT lib/week.ts. That module answers
    // which teaching day a card belongs to; this is a duration, with no zone
    // in it and no weekend rule.
    if (now.getTime() - studentSentAt.getTime() >= CORRECTION_WINDOW_MS) {
      return "settled";
    }

    return "awaiting-correction";
  }

  if (openedAt !== null) return "started";
  return "not-opened";
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run tests/lib/homework-status.test.ts
```

Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/homework-status.ts tests/lib/homework-status.test.ts
git commit -m "Resolve one worksheet to one of four states

Disjoint by construction, so the three homework bullets cannot double-count a
worksheet. Awaiting correction carries a seven-day window: it is a task rather
than news, so it must not clear on a glance, but Jenn often corrects live in
the lesson and files nothing.

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 4: `lib/student-summary.ts`

**Files:**
- Create: `lib/student-summary.ts`
- Test: `tests/lib/student-summary.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/student-summary.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { summaryBullets, type SummaryCounts } from "@/lib/student-summary";

const none: SummaryCounts = {
  unreadMessages: 0,
  toCorrect: 0,
  started: 0,
  notOpened: 0,
  newFlashcards: 0,
  newFiles: 0,
  itemsDone: 0,
};

describe("summaryBullets", () => {
  it("returns nothing for a quiet student", () => {
    expect(summaryBullets(none)).toEqual([]);
  });

  it("drops a zero count rather than drawing it", () => {
    expect(summaryBullets({ ...none, newFiles: 2 })).toEqual([
      { key: "newFiles", count: 2 },
    ]);
  });

  it("orders most-owed first, regardless of the input order", () => {
    // Unread outranks homework because a message can say "I could not open
    // it"; homework outranks the activity counts because it is work Jenn owes
    // back.
    const bullets = summaryBullets({
      ...none,
      itemsDone: 1,
      newFlashcards: 3,
      toCorrect: 2,
      unreadMessages: 4,
    });
    expect(bullets.map((b) => b.key)).toEqual([
      "unreadMessages",
      "toCorrect",
      "newFlashcards",
      "itemsDone",
    ]);
  });

  it("keeps the three homework bullets in escalating order", () => {
    const bullets = summaryBullets({
      ...none,
      notOpened: 1,
      started: 1,
      toCorrect: 1,
    });
    expect(bullets.map((b) => b.key)).toEqual([
      "toCorrect",
      "started",
      "notOpened",
    ]);
  });

  it("does not cap the list", () => {
    // The seven are disjoint and rarely exceed three. A silent "+2 more" would
    // hide exactly the item that was worth surfacing.
    const bullets = summaryBullets({
      unreadMessages: 1,
      toCorrect: 1,
      started: 1,
      notOpened: 1,
      newFlashcards: 1,
      newFiles: 1,
      itemsDone: 1,
    });
    expect(bullets).toHaveLength(7);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run tests/lib/student-summary.test.ts
```

Expected: FAIL — `Failed to resolve import "@/lib/student-summary"`.

- [ ] **Step 3: Write the implementation**

Create `lib/student-summary.ts`:

```ts
// Keys, not sentences. lib/page-sections.ts sets that precedent: the words are
// French or English by Accept-Language, and the counts need real plurals, so
// the dictionary owns them and this owns the order.
export type SummaryKey =
  | "unreadMessages"
  | "toCorrect"
  | "started"
  | "notOpened"
  | "newFlashcards"
  | "newFiles"
  | "itemsDone";

export type SummaryCounts = Record<SummaryKey, number>;

export type SummaryBullet = { key: SummaryKey; count: number };

// Most-owed first, and the order is the rule this module exists to hold.
//
// Unread messages outrank homework because a message can say "I could not open
// it". The three homework states outrank the activity counts because they are
// work Jenn owes back, and they escalate: something to correct is more urgent
// than something started, which is more urgent than something untouched. The
// last three are news rather than debt.
const ORDER: readonly SummaryKey[] = [
  "unreadMessages",
  "toCorrect",
  "started",
  "notOpened",
  "newFlashcards",
  "newFiles",
  "itemsDone",
];

// NO CAP, deliberately. The seven are disjoint — homeworkStatus returns one
// state per worksheet — and rarely exceed three. A silent "+2 more" would hide
// exactly the item that was worth surfacing.
export function summaryBullets(counts: SummaryCounts): SummaryBullet[] {
  return ORDER.map((key) => ({ key, count: counts[key] })).filter(
    (bullet) => bullet.count > 0,
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run tests/lib/student-summary.test.ts
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Run the whole suite and commit**

```bash
npm test
```

Expected: PASS, all files.

```bash
git add lib/student-summary.ts tests/lib/student-summary.test.ts
git commit -m "Order a student's bullets most-owed first

Keys rather than sentences, following page-sections: the words are French or
English by Accept-Language and the counts need real plurals, so the dictionary
owns the words and this owns the order. No cap — the seven are disjoint and a
silent truncation would hide the item worth surfacing.

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 5: Write the two author fields

Nothing records who added a flashcard, or who ticked an action item. Both dots depend on it.

**Files:**
- Modify: `app/deck-actions.ts:83-101` (`addFlashcard`), `app/deck-actions.ts:168-179` (`setActionItemDone`)

- [ ] **Step 1: Record the flashcard's author**

In `app/deck-actions.ts`, replace the body of `addFlashcard`:

```ts
export async function addFlashcard(
  groupId: string,
  input: { front: string; back: string; note: string },
): Promise<void> {
  const role = await requireDeckRole(groupId);

  await prisma.flashcard.create({
    data: {
      groupId,
      front: requireText(input.front, MAX_CARD_FACE),
      back: requireText(input.back, MAX_CARD_FACE),
      // An empty note is null, not "". The column is nullable so the viewer can
      // ask one question — is there a note — rather than two.
      note: input.note.trim() ? requireText(input.note, MAX_CARD_NOTE) : null,
      // From the ROLE the guard resolved, never from an argument — the same
      // rule addActionItem below states, and for the same reason: a client that
      // could name its own author could put words in Jenn's mouth on a deck she
      // shares with a student.
      fromTeacher: role === "teacher",
    },
  });

  revalidateDeck();
}
```

The only changes are `const role =` on the guard line and the `fromTeacher` field.

- [ ] **Step 2: Record who ticked an action item**

Replace `setActionItemDone`:

```ts
export async function setActionItemDone(
  groupId: string,
  id: string,
  done: boolean,
): Promise<void> {
  const role = await requireDeckRole(groupId);
  await prisma.actionItem.updateMany({
    where: { id, groupId },
    data: {
      doneAt: done ? new Date() : null,
      // Cleared alongside doneAt, so an untick leaves no author behind for the
      // next tick to inherit. doneAt already answers WHEN; this answers who,
      // which doneAt cannot, because either party may tick a shared list.
      doneByTeacher: done ? role === "teacher" : null,
    },
  });
  revalidateDeck();
}
```

- [ ] **Step 3: Check it compiles**

```bash
npm run typecheck && npm run lint
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/deck-actions.ts
git commit -m "Record who added a card and who ticked an item

Both from the role the guard resolved, never from an argument — the rule
addActionItem already states. A dot cannot mean \"the other party did this\"
without an author, so a student's own card would otherwise light their own tab.

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 6: The seen actions and the marker component

**Files:**
- Create: `app/seen-actions.ts`, `components/student/MarkTabSeen.tsx`

- [ ] **Step 1: Write the actions**

Create `app/seen-actions.ts`:

```ts
"use server";

import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getCurrentTeacher } from "@/lib/session";
import { chatRole, type ChatRole } from "@/lib/chat-access";
import { readToken, cookieNameFor } from "@/lib/student-tokens";

// The three tabs that carry a dot. Not `card` and not `board`: the card is the
// same global card for everyone, and a board is Jenn's to draw.
export type SeenSurface = "files" | "deck" | "todo";

// Which column each (role, surface) pair writes.
//
// A lookup table and NOT a name assembled from the argument. A column name
// built by concatenation is a column name the caller steers, and this action is
// reachable by both parties — the same reason addActionItem takes its author
// from the role rather than from the request.
const COLUMN = {
  teacher: {
    files: "teacherSeenFilesAt",
    deck: "teacherSeenDeckAt",
    todo: "teacherSeenTodoAt",
  },
  student: {
    files: "studentSeenFilesAt",
    deck: "studentSeenDeckAt",
    todo: "studentSeenTodoAt",
  },
} as const satisfies Record<
  Exclude<ChatRole, null>,
  Record<SeenSurface, string>
>;

// Resolves the caller's role without throwing. requireDeckRole in
// app/deck-actions.ts throws, which is right for an action somebody pressed;
// everything in this file is fired unawaited from an effect, where a throw is
// an uncaught rejection in the browser with nothing to catch it and nothing to
// show. markFlashcardViewed makes the same trade for the same reason.
async function readRole(groupId: string): Promise<{
  role: ChatRole;
} | null> {
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: { slug: true, isEveryone: true, chatToken: true },
  });
  if (!group) return null;

  const cookieStore = await cookies();
  // chatRole and not shelfRole. It refuses the everyone group before it checks
  // anything else, so /g/all gets no watermarks — correct, because there is no
  // student there for a visit to belong to.
  return {
    role: chatRole({
      isTeacher: Boolean(await getCurrentTeacher()),
      isEveryone: group.isEveryone,
      chatToken: group.chatToken,
      presented: readToken(
        undefined,
        cookieStore.get(cookieNameFor(group.slug))?.value,
      ),
    }),
  };
}

// A WRITE ON READ, and the second one in this codebase. markFlashcardViewed is
// the first and this follows it on both of the things that matter.
//
// It does NOT revalidate. The dot stays while the reader is on the tab and
// clears on the next navigation, which is when it matters. Revalidating would
// clear the dot out from under the person still looking at what it pointed to.
//
// It returns silently on every refusal rather than throwing, for the reason
// readRole gives above.
export async function markTabSeen(
  groupId: string,
  surface: SeenSurface,
): Promise<void> {
  const resolved = await readRole(groupId);
  if (!resolved?.role) return;

  await prisma.group.update({
    where: { id: groupId },
    data: { [COLUMN[resolved.role][surface]]: new Date() },
  });
}

// REFUSED FOR THE TEACHER, exactly as markFlashcardViewed is, and for a
// stronger reason: this feeds a bullet that says whether the STUDENT has looked
// at their homework. Jenn opening it to write a correction is not the student
// opening it, and stamping here would tell her they had started work they have
// never seen.
export async function markWorksheetOpened(
  groupId: string,
  pageId: string,
): Promise<void> {
  const resolved = await readRole(groupId);
  if (resolved?.role !== "student") return;

  // Rewritten on each open, so the row means "last opened" rather than
  // "opened once". Nothing reads the value except homeworkStatus, which only
  // asks whether it is there — but a stale timestamp in a table is a fact
  // waiting to be believed.
  await prisma.worksheetOpen.upsert({
    where: { pageId_groupId: { pageId, groupId } },
    create: { pageId, groupId, openedAt: new Date() },
    update: { openedAt: new Date() },
  });
}
```

- [ ] **Step 2: Write the marker component**

Create `components/student/MarkTabSeen.tsx`:

```tsx
"use client";

import { useEffect, useRef } from "react";

// Fires a seen action once, on mount, and renders nothing.
//
// The ref rather than an empty dependency array: React runs an effect twice in
// development under StrictMode, and this writes to the database. The action is
// idempotent, so the second write is harmless — but a stray write is still a
// stray write, and the guard costs one line.
//
// Fired WITHOUT awaiting, matching how DeckTab fires markFlashcardViewed. The
// reader is already looking at the tab; nothing on screen waits for this.
export function MarkTabSeen({ onSeen }: { onSeen: () => Promise<void> }) {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    // Swallowed deliberately. There is nothing to show a reader whose
    // watermark did not move, and an unhandled rejection in the console is
    // worse than a dot that clears on the next visit instead.
    void onSeen().catch(() => {});
  }, [onSeen]);

  return null;
}
```

- [ ] **Step 3: Check it compiles**

```bash
npx prisma generate && npm run typecheck && npm run lint
```

Expected: no errors. If `markWorksheetOpened` reports that `pageId_groupId` does not exist, Task 1's migration has not been generated — run `npx prisma generate` again.

- [ ] **Step 4: Commit**

```bash
git add app/seen-actions.ts components/student/MarkTabSeen.tsx
git commit -m "Stamp a watermark when a tab is opened

The second write-on-read in this codebase, following markFlashcardViewed: no
revalidatePath, because clearing a dot under the reader still looking at what
it pointed to is the same failure as reordering the deck mid-flip; and silent
refusals, because these are fired unawaited from an effect.

The role picks the column from a lookup table, never a name built from the
argument. markWorksheetOpened refuses the teacher — her opening a worksheet is
not the student opening it.

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 7: Record a student opening a worksheet

**Files:**
- Modify: `app/g/[slug]/w/[pageSlug]/page.tsx`

- [ ] **Step 1: Import the pieces**

Add to the imports at the top of `app/g/[slug]/w/[pageSlug]/page.tsx`:

```ts
import { MarkTabSeen } from "@/components/student/MarkTabSeen";
import { markWorksheetOpened } from "@/app/seen-actions";
```

- [ ] **Step 2: Build the marker once, above the pdf branch**

Find the line `const pdfSlots: VersionSlot[] = [` and insert directly **above** it:

```ts
  // Both shells mount this, so an open is recorded whichever kind the
  // worksheet is. Gated on the role here as well as inside the action: the
  // action is the authority and re-checks, but there is no reason to post from
  // Jenn's browser on every worksheet she opens.
  //
  // The bound ACTION, not an arrow — a closure cannot cross the server/client
  // boundary. Same shape as DeckTab's onViewed.
  const openMarker =
    context.role === "student" ? (
      <MarkTabSeen
        onSeen={markWorksheetOpened.bind(null, context.group.id, context.page.id)}
      />
    ) : null;
```

- [ ] **Step 3: Mount it in the pdf branch**

In the `if (context.page.kind === "pdf")` branch, wrap the returned `<PdfShell …>` in a fragment:

```tsx
    return (
      <>
        {openMarker}
        <PdfShell
          ariaLabel={t.versionsLabel}
          …unchanged…
        />
      </>
    );
```

Leave every prop on `PdfShell` exactly as it is. The only change is the wrapping fragment and the marker line.

- [ ] **Step 4: Mount it in the html branch**

Do the same to the final `return` of the function, wrapping `<WorksheetShell …>`:

```tsx
  return (
    <>
      {openMarker}
      <WorksheetShell
        …unchanged…
      />
    </>
  );
```

- [ ] **Step 5: Verify by hand**

```bash
npm run dev
```

Open a student's worksheet from their shelf with their invite link, then check the row landed:

```bash
sqlite3 prisma/dev.db 'SELECT * FROM "WorksheetOpen";'
```

Expected: one row. Open the same worksheet as the teacher and confirm **no** new row appears for a page the student has not opened.

- [ ] **Step 6: Commit**

```bash
git add "app/g/[slug]/w/[pageSlug]/page.tsx"
git commit -m "Record a student opening a worksheet

Both shells mount the marker, so an open is recorded for a pdf worksheet as
well as an html one. Gated on the role at the call site as well as inside the
action: the action is the authority, but there is no reason to post from Jenn's
browser on every worksheet she opens.

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 8: The read model

**Files:**
- Create: `lib/student-activity.ts`

- [ ] **Step 1: Write it**

Create `lib/student-activity.ts`:

```ts
import { prisma } from "@/lib/prisma";
import { listPagesForGroup } from "@/lib/pages";
import { readPageKind } from "@/lib/page-kind";
import { countUnseen, pageIsUnseen } from "@/lib/unseen";
import { homeworkStatus } from "@/lib/homework-status";
import type { SummaryCounts } from "@/lib/student-summary";

// Everything on a student's card EXCEPT the unread count.
//
// Unread is absent deliberately. listConversations already owns that number and
// the Students tab already calls it; computing it a second time here would be
// two query paths for one figure, which is exactly why unreadCounts was removed
// when listConversations absorbed it. The caller merges the two.
export type ActivityCounts = Omit<SummaryCounts, "unreadMessages">;

// The everyone group is absent rather than empty, matching listConversations:
// it has no deck, no checklist and a public shelf, so there is no student whose
// activity it would summarise.
//
// This runs a handful of queries per student against a SQLite file on the same
// box, the same shape and the same size as listConversations — see its note.
// If N ever justifies otherwise the shape to reach for is a maintained count
// column, and nothing outside this module changes.
export async function listStudentActivity(
  // Passed in, never read as new Date() here: homeworkStatus needs it, and a
  // clock read buried in a read model is untestable from the outside.
  now: Date,
): Promise<Map<string, ActivityCounts>> {
  const groups = await prisma.group.findMany({
    where: { isEveryone: false },
    select: {
      id: true,
      teacherSeenFilesAt: true,
      teacherSeenDeckAt: true,
      teacherSeenTodoAt: true,
    },
  });

  const entries = await Promise.all(
    groups.map(async (group) => {
      const [flashcards, items, pages, versions, opens] = await Promise.all([
        prisma.flashcard.findMany({
          where: { groupId: group.id },
          select: { createdAt: true, fromTeacher: true },
        }),
        prisma.actionItem.findMany({
          where: { groupId: group.id, doneAt: { not: null } },
          select: { doneAt: true, doneByTeacher: true },
        }),
        // The EFFECTIVE shelf, so a page Jenn shared with the class counts on
        // every student's card. That is the intended reading of "I shared
        // something with the class", and inheritance is invisible to callers by
        // design.
        listPagesForGroup(group.id),
        // Queried here rather than taken from listPagesForGroup's own
        // `versions`, which does not carry sentAt. A separate read keeps
        // ShelfPage — and therefore FilesTab — untouched.
        prisma.pageVersion.findMany({
          where: { groupId: group.id },
          select: {
            pageId: true,
            fromTeacher: true,
            sentAt: true,
            updatedAt: true,
          },
        }),
        prisma.worksheetOpen.findMany({
          where: { groupId: group.id },
          select: { pageId: true, openedAt: true },
        }),
      ]);

      const openedAt = new Map(opens.map((open) => [open.pageId, open.openedAt]));
      const byPage = new Map<string, typeof versions>();
      for (const version of versions) {
        const list = byPage.get(version.pageId) ?? [];
        list.push(version);
        byPage.set(version.pageId, list);
      }

      let toCorrect = 0;
      let started = 0;
      let notOpened = 0;

      for (const page of pages) {
        if (!page.worksheet) continue;
        // worksheetOpenable already refuses a link, so a flagged link can never
        // have a version or an open — left in it would sit on the card as "not
        // opened" forever with no way to clear it.
        if (readPageKind(page) === "link") continue;

        const rows = byPage.get(page.id) ?? [];

        // The three-slot rule means at most one row per party, enforced by
        // @@unique([pageId, groupId, fromTeacher]) — so `find` is exact rather
        // than a first-of-many.
        const student = rows.find((row) => !row.fromTeacher);
        const teacher = rows.find((row) => row.fromTeacher);

        const state = homeworkStatus({
          openedAt: openedAt.get(page.id) ?? null,
          studentSentAt: student?.sentAt ?? null,
          teacherSavedAt: teacher?.updatedAt ?? null,
          now,
        });

        if (state === "awaiting-correction") toCorrect += 1;
        else if (state === "started") started += 1;
        else if (state === "not-opened") notOpened += 1;
      }

      const counts: ActivityCounts = {
        toCorrect,
        started,
        notOpened,

        newFlashcards: countUnseen(
          flashcards.map((card) => ({
            at: card.createdAt,
            fromTeacher: card.fromTeacher,
          })),
          group.teacherSeenDeckAt,
          true,
        ),

        // filter().length and not a count query: pageIsUnseen is the shelf's one
        // predicate, and a page that was added AND had a version saved to it is
        // one unseen file rather than two.
        newFiles: pages.filter((page) =>
          pageIsUnseen(
            {
              createdAt: page.createdAt,
              updatedAt: page.updatedAt,
              addedByStudent: page.addedByStudent,
              versions: (byPage.get(page.id) ?? []).map((row) => ({
                fromTeacher: row.fromTeacher,
                updatedAt: row.updatedAt,
              })),
            },
            group.teacherSeenFilesAt,
            true,
          ),
        ).length,

        // flatMap rather than a non-null assertion: the where clause guarantees
        // doneAt, and the type does not.
        //
        // A row ticked before this shipped has a null doneByTeacher and reads as
        // the student's. It never reaches the count anyway — the migration
        // backfilled every watermark to a time after those ticks.
        itemsDone: countUnseen(
          items.flatMap((item) =>
            item.doneAt
              ? [{ at: item.doneAt, fromTeacher: item.doneByTeacher ?? false }]
              : [],
          ),
          group.teacherSeenTodoAt,
          true,
        ),
      };

      return [group.id, counts] as const;
    }),
  );

  return new Map(entries);
}
```

- [ ] **Step 2: Check it compiles**

```bash
npm run typecheck && npm run lint
```

Expected: no errors. If `readPageKind` complains about its argument, check `lib/page-kind.ts` — it takes the whole row and needs `kind`, `url` and `pdfSize` selected, all of which `listPagesForGroup` already returns.

- [ ] **Step 3: Commit**

```bash
git add lib/student-activity.ts
git commit -m "Assemble each student's counts

Shaped like lib/inbox.ts and carrying its note: a handful of queries per
student against a local SQLite file, legible at this size. Unread is
deliberately absent — listConversations owns that number and two query paths
for one figure are two things that can disagree.

The shelf counted is the effective one, so a page shared with the class counts
on every student's card.

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 9: The dictionary

`lib/strings.ts` holds one `Strings` type and two objects both annotated as it, so a key missing on either side is a compile error naming the key. Add to all three.

**Files:**
- Modify: `lib/strings.ts`

- [ ] **Step 1: Add the type members**

In the `Strings` type, find `groups: {` (around line 384, under `admin`) and add these members inside it, directly below `unreadCount`:

```ts
      // The bullet sentences. FUNCTIONS and not placeholder templates: French
      // and English disagree about agreement as well as word order, and a
      // template scheme invites building sentences by concatenation.
      summaryToCorrect: (count: number) => string;
      summaryStarted: (count: number) => string;
      summaryNotOpened: (count: number) => string;
      summaryNewFlashcards: (count: number) => string;
      summaryNewFiles: (count: number) => string;
      summaryItemsDone: (count: number) => string;
      // Drawn when a student has no bullets at all. A card with an empty gap
      // under the name reads as a row that failed to load.
      summaryNothingNew: string;
```

Then find the student `tabs: {` block (around line 96) and add inside it, below `todo`:

```ts
      // Read out beside the dot, which is aria-hidden. ConversationList's
      // unread dot is the precedent and FilterDisclosure is the second use.
      unseenLabel: string;
```

- [ ] **Step 2: Add the French values**

Find the French `groups: {` (around line 985) and add below `unreadCount`:

```ts
      summaryToCorrect: (count) =>
        `${count} devoir${count > 1 ? "s" : ""} à corriger`,
      summaryStarted: (count) =>
        `${count} devoir${count > 1 ? "s" : ""} commencé${count > 1 ? "s" : ""}`,
      summaryNotOpened: (count) =>
        `${count} devoir${count > 1 ? "s" : ""} pas encore ouvert${count > 1 ? "s" : ""}`,
      summaryNewFlashcards: (count) =>
        `${count} nouvelle${count > 1 ? "s" : ""} carte${count > 1 ? "s" : ""}`,
      summaryNewFiles: (count) =>
        `${count} nouveau${count > 1 ? "x" : ""} fichier${count > 1 ? "s" : ""}`,
      summaryItemsDone: (count) =>
        `${count} tâche${count > 1 ? "s" : ""} terminée${count > 1 ? "s" : ""}`,
      summaryNothingNew: "Rien de nouveau.",
```

Find the French `tabs: {` (around line 724) and add below `todo`:

```ts
      unseenLabel: "Nouveau",
```

- [ ] **Step 3: Add the English values**

Find the English `groups: {` (around line 1526) and add below `unreadCount`:

```ts
      summaryToCorrect: (count) =>
        `${count} homework to correct`,
      summaryStarted: (count) =>
        `${count} homework started`,
      summaryNotOpened: (count) =>
        `${count} homework not opened`,
      summaryNewFlashcards: (count) =>
        `${count} new flashcard${count > 1 ? "s" : ""}`,
      summaryNewFiles: (count) =>
        `${count} new file${count > 1 ? "s" : ""}`,
      summaryItemsDone: (count) =>
        `${count} to-do${count > 1 ? "s" : ""} done`,
      summaryNothingNew: "Nothing new.",
```

"Homework" is uncountable in English and takes no plural, which is why those three take a count and never an `s`. They are still functions, because the type says so on both sides and the French ones genuinely need it.

Find the English `tabs: {` (around line 1276) and add below `todo`:

```ts
      unseenLabel: "New",
```

- [ ] **Step 4: Check both objects satisfy the type**

```bash
npm run typecheck
```

Expected: no errors. An error naming a key means one of the two objects is missing it — that is the whole reason both are annotated.

- [ ] **Step 5: Commit**

```bash
git add lib/strings.ts
git commit -m "Add the bullet sentences and the dot label

Functions taking a count, never placeholder templates: French agrees the
adjective and the noun and English does not pluralise \"homework\" at all.

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 10: The unseen dot

One component, used by both the tab strip and the file tile.

**Files:**
- Create: `components/ui/UnseenDot.tsx`

- [ ] **Step 1: Write it**

Create `components/ui/UnseenDot.tsx`:

```tsx
// The dot, and the word behind it.
//
// aria-hidden on the circle with an sr-only label beside it — ConversationList's
// unread dot is the precedent and FilterDisclosure's "Filters active" is the
// second use. A colour alone is not a signal to a reader who cannot see it.
//
// --card-rouge rather than --color-accent: the accent is the lilac that carries
// white button text, and this circle carries none. Rouge is the palette's
// attention colour and reads against both the paper pill and the bleu active
// one.
export function UnseenDot({ label }: { label: string }) {
  return (
    <>
      <span
        aria-hidden
        className="block h-2 w-2 rounded-full bg-[var(--card-rouge)]"
      />
      <span className="sr-only">{label}</span>
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/ui/UnseenDot.tsx
git commit -m "Add the unseen dot

aria-hidden circle with an sr-only word beside it, the third use of
ConversationList's precedent. A colour alone is not a signal.

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 11: The admin student cards

**Files:**
- Create: `components/admin/StudentCard.tsx`
- Modify: `components/admin/GroupList.tsx`, `app/admin/page.tsx:211-242`

- [ ] **Step 1: Write the card**

Create `components/admin/StudentCard.tsx`:

```tsx
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { SummaryBullet } from "@/lib/student-summary";
import type { Locale } from "@/lib/i18n";
import { getStrings } from "@/lib/strings";

// Copies Tile's structure rather than extending it, because the two differ in
// the one thing Tile's layout is built around: Tile is a row with its action
// opposite the title, and this is a card with a block of text under it.
//
// What is NOT changed is the link mechanism. The name is the anchor, stretched
// over the card with after:absolute after:inset-0, and the icons sit in a
// relative z-10 box above it — an anchor inside an anchor is invalid HTML that
// browsers repair by splitting the element. The focus ring is drawn on the card
// via has-[a:focus-visible] for the same reason Tile draws it there: an outline
// on the stretched anchor would ring the small name text, not the card.
export function StudentCard({
  href,
  name,
  bullets,
  footer,
  action,
  locale,
}: {
  href: string;
  name: string;
  bullets: SummaryBullet[];
  // The email and claim line, built by the caller because it already owns the
  // date formatting and the two claim states.
  footer?: ReactNode;
  action?: ReactNode;
  locale: Locale;
}) {
  const labels = getStrings(locale).admin.groups;

  // One place mapping a key to its sentence. summaryBullets owns the order and
  // this owns nothing but the words — the split lib/page-section-labels.ts
  // already makes.
  const say = (bullet: SummaryBullet): string => {
    switch (bullet.key) {
      case "unreadMessages":
        return labels.unreadCount(bullet.count);
      case "toCorrect":
        return labels.summaryToCorrect(bullet.count);
      case "started":
        return labels.summaryStarted(bullet.count);
      case "notOpened":
        return labels.summaryNotOpened(bullet.count);
      case "newFlashcards":
        return labels.summaryNewFlashcards(bullet.count);
      case "newFiles":
        return labels.summaryNewFiles(bullet.count);
      case "itemsDone":
        return labels.summaryItemsDone(bullet.count);
    }
  };

  return (
    <div
      className={cn(
        "relative flex h-full flex-col rounded-[14px] border border-[var(--card-line)] bg-[var(--card-paper)] px-5 py-4 shadow-[var(--card-shadow)] transition-opacity duration-150 hover:opacity-85 motion-reduce:transition-none",
        "has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-[var(--card-bleu)] has-[a:focus-visible]:ring-offset-2 has-[a:focus-visible]:ring-offset-[var(--card-paper)]",
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <Link
          href={href}
          className="min-w-0 font-[family-name:var(--card-font-serif)] text-lg font-semibold text-[var(--card-ink)] after:absolute after:inset-0 focus-visible:outline-none"
        >
          {name}
        </Link>
        {action && <div className="relative z-10 shrink-0">{action}</div>}
      </div>

      {/* list-none with its own bullet glyph: a real list-disc marker sits
          outside the padding box and lines up with nothing else on the card. */}
      {bullets.length > 0 ? (
        <ul className="mt-2 space-y-0.5">
          {bullets.map((bullet) => (
            <li
              key={bullet.key}
              className="flex gap-2 text-[13px] font-light leading-snug text-[var(--color-ink-muted)]"
            >
              <span aria-hidden>•</span>
              <span>{say(bullet)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-[13px] font-light text-[var(--color-ink-muted)]">
          {labels.summaryNothingNew}
        </p>
      )}

      {/* mt-auto so the footer sits on the card's floor. Cards in a row stretch
          to the tallest, and a claim line floating mid-card under a short
          bullet list reads as a layout fault. */}
      {footer && <div className="relative z-10 mt-auto pt-3">{footer}</div>}
    </div>
  );
}
```

- [ ] **Step 2: Rewire `GroupList`**

In `components/admin/GroupList.tsx`:

1. Replace the `Tile` import with:

```ts
import { StudentCard } from "@/components/admin/StudentCard";
import type { SummaryBullet } from "@/lib/student-summary";
```

2. Add `bullets` to `GroupSummary`, replacing the `unread` field:

```ts
export type GroupSummary = {
  id: string;
  name: string;
  slug: string;
  isEveryone: boolean;
  // Already ordered and already filtered of zeroes by summaryBullets. This
  // component decides nothing about which bullets exist — only how they look.
  bullets: SummaryBullet[];
  chatToken: string | null;
  // Null until the student signs up. Both move together, so either one answers
  // "claimed?" — email is the one displayed.
  email: string | null;
  claimedAt: Date | null;
};
```

3. Replace the `<ul className="flex flex-col gap-3">` wrapper with the grid:

```tsx
        <ul className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-2">
```

`items-stretch` and `h-full` on the card together are what make two cards in a row the same height. Without them a short card floats against a tall neighbour.

4. Replace the `<Tile … />` element with:

```tsx
                <StudentCard
                  href={`/g/${group.slug}?k=${group.chatToken ?? ""}`}
                  name={group.name}
                  bullets={group.bullets}
                  locale={locale}
                  action={ /* the existing action JSX, unchanged */ }
                  footer={ /* see step 3 */ }
                />
```

Keep the `canDeleteGroup(group) ? (…) : (…)` action expression exactly as it is, including its comment.

5. Move the existing `{group.chatToken && (<>…</>)}` block — the email line, the copy fallback and the reset confirm — out of the `<li>` and into the card's `footer` prop. The delete confirm row stays outside the card, below it, where it already is.

- [ ] **Step 3: Feed it from the admin**

In `app/admin/page.tsx`, replace `GroupsTab` entirely:

```tsx
// Each tab runs its own queries, apart from the group list the FAB above needs
// on all three.
async function GroupsTab({ locale }: { locale: Locale }) {
  // The query still fetches every row and the everyone one is dropped on the
  // way into the list, rather than filtered in the `where`. Two reasons: the
  // maps below are built from listConversations and listStudentActivity, which
  // already exclude it, so a narrower query would buy nothing; and a UI rule
  // belongs in a predicate with a test on it, not in a Prisma clause. See
  // lib/audience.ts.
  //
  // `now` is read once, here, and threaded into the read model — not inside it.
  // Two students' cards resolving the seven-day window against two different
  // clocks is a difference nobody could reproduce.
  const now = new Date();
  const [groups, conversations, activity] = await Promise.all([
    prisma.group.findMany({ orderBy: { name: "asc" } }),
    listConversations(),
    listStudentActivity(now),
  ]);
  const unread = new Map(conversations.map((c) => [c.groupId, c.unread]));

  return (
    <div className="mx-auto w-full max-w-[1152px]">
      <GroupList
        groups={visibleStudents(groups).map((g) => {
          const counts = activity.get(g.id);
          return {
            id: g.id,
            name: g.name,
            slug: g.slug,
            isEveryone: g.isEveryone,
            // Assembled HERE rather than inside the read model, because unread
            // comes from listConversations and the read model deliberately does
            // not compute it — two query paths for one number are two things
            // that can disagree.
            bullets: summaryBullets({
              unreadMessages: unread.get(g.id) ?? 0,
              toCorrect: counts?.toCorrect ?? 0,
              started: counts?.started ?? 0,
              notOpened: counts?.notOpened ?? 0,
              newFlashcards: counts?.newFlashcards ?? 0,
              newFiles: counts?.newFiles ?? 0,
              itemsDone: counts?.itemsDone ?? 0,
            }),
            chatToken: g.chatToken,
            email: g.email,
            claimedAt: g.claimedAt,
          };
        })}
        onDelete={deleteGroup}
        onReset={resetStudentSignIn}
        locale={locale}
      />
    </div>
  );
}
```

Add the two imports at the top of `app/admin/page.tsx`:

```ts
import { listStudentActivity } from "@/lib/student-activity";
import { summaryBullets } from "@/lib/student-summary";
```

Note the wrapper width changed from `max-w-[560px]` to `max-w-[1152px]`, so the two-column grid has room. That matches the Pages tab, which already breaks out of the 560px column for its grid.

- [ ] **Step 4: Check and look at it**

```bash
npm run typecheck && npm run lint && npm run dev
```

Open `/admin?tab=groups`. Expected: two columns above 1024px, one below. A student with nothing shows *Nothing new.* / *Rien de nouveau.* Tab to a card and confirm the ring draws around the whole card, not around the name.

- [ ] **Step 5: Commit**

```bash
git add components/admin/StudentCard.tsx components/admin/GroupList.tsx app/admin/page.tsx
git commit -m "Turn the students list into cards with a summary

Two columns at 1152px, collapsing to one below lg — the Pages grid's own
breakpoint, so the two admin lists agree. The card copies Tile's stretched-link
structure rather than extending Tile: an anchor inside an anchor is invalid
HTML, and the focus ring belongs on the card.

Students stay in name order. A list that reorders itself by activity makes a
student hard to find between visits, and the search field is what finds them.

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 12: Tab dots and file dots

**Files:**
- Modify: `components/student/StudentTabs.tsx`, `components/ui/PageTile.tsx`, `components/student/FilesTab.tsx`, `app/g/[slug]/page.tsx`

- [ ] **Step 1: Give `StudentTabs` a `dots` prop**

In `components/student/StudentTabs.tsx`, add the import:

```ts
import { UnseenDot } from "@/components/ui/UnseenDot";
```

Add to the props, after `has`:

```ts
  // Only the three surfaces that carry a watermark. The card is the same
  // global card for everyone and a board is Jenn's to draw, so neither has an
  // "other party added this" to report.
  dots: { files: boolean; deck: boolean; todo: boolean };
```

Change the `tabs` array entries to carry a dot. Each of the five spread entries gains a `dot` field — `false` for `card` and `board`, and the matching flag for the other three:

```ts
  const tabs: { tab: StudentTab; label: string; href: string; dot: boolean }[] = [
    ...(has.card
      ? [{ tab: "card" as const, label: student.tabs.card, href: `/g/${slug}?date=${date}`, dot: false }]
      : []),
    ...(has.files
      ? [{ tab: "files" as const, label: student.tabs.files, href: `/g/${slug}?tab=files`, dot: dots.files }]
      : []),
    ...(has.board
      ? [{ tab: "board" as const, label: student.tabs.board, href: `/g/${slug}?tab=board`, dot: false }]
      : []),
    ...(has.deck
      ? [{ tab: "deck" as const, label: student.tabs.deck, href: `/g/${slug}?tab=deck`, dot: dots.deck }]
      : []),
    ...(has.todo
      ? [{ tab: "todo" as const, label: student.tabs.todo, href: `/g/${slug}?tab=todo`, dot: dots.todo }]
      : []),
  ];
```

Then in the `tabs.map`, destructure `dot` and draw it inside the `<Link>`, after `{label}`:

```tsx
        {tabs.map(({ tab, label, href, dot }) => (
          <Link
            key={tab}
            href={href}
            aria-current={tab === active ? "page" : undefined}
            className={cn(
              // …unchanged class list…
            )}
          >
            {label}
            {/* Inside the pill and after the label rather than absolutely
                positioned over its corner: the strip scrolls horizontally, and
                an element hanging outside a scrolling child is clipped by the
                container's own overflow. */}
            {dot && (
              <span className="ml-1.5 flex items-center">
                <UnseenDot label={student.tabs.unseenLabel} />
              </span>
            )}
          </Link>
        ))}
```

- [ ] **Step 2: Give `PageTile` a `dot` prop**

In `components/ui/PageTile.tsx`, add to the props type, below `badge`:

```ts
  // The other party has touched this page since you last opened the shelf. A
  // separate slot from `badge`, which already carries the pin and the version
  // count: one slot meaning two things would force the caller to choose which
  // to draw.
  dot?: ReactNode;
```

Add `dot` to the destructured parameter list beside `badge`, and render it opposite the badge, directly after the badge block:

```tsx
      {dot && (
        <div className="pointer-events-none absolute left-2 top-2 z-10">
          {dot}
        </div>
      )}
```

- [ ] **Step 3: Pass a dot per tile in `FilesTab`**

In `components/student/FilesTab.tsx`, add the imports:

```ts
import { UnseenDot } from "@/components/ui/UnseenDot";
import { pageIsUnseen } from "@/lib/unseen";
```

Add two props to the component, after `groupSlug`:

```ts
  // The reader's own watermark for this shelf, and which party they are. Both
  // null on /f/[token] and on the public everyone shelf, where there is nobody
  // to have a watermark — a read-only link addresses a shelf and nothing else,
  // so a parent holding it must not be told what the student has not read.
  seenAt?: Date | null;
  viewerIsTeacher?: boolean;
```

With defaults in the destructure: `seenAt = null`, `viewerIsTeacher = false`.

Find the `<PageTile` element and add:

```tsx
                dot={
                  // canWrite stands in for "this reader has a watermark": it is
                  // false for an untokened visitor and on the public everyone
                  // shelf, which are exactly the two cases with nobody to
                  // report to.
                  canWrite && pageIsUnseen(page, seenAt, viewerIsTeacher) ? (
                    <UnseenDot label={strings.student.tabs.unseenLabel} />
                  ) : null
                }
```

`ShelfPage` already carries `createdAt`, `updatedAt`, `addedByStudent` and `versions`, so it satisfies `UnseenPage` with no mapping.

- [ ] **Step 4: Compute the dots and mount the markers**

In `app/g/[slug]/page.tsx`, add the imports:

```ts
import { MarkTabSeen } from "@/components/student/MarkTabSeen";
import { markTabSeen } from "@/app/seen-actions";
import { pageIsUnseen, countUnseen } from "@/lib/unseen";
```

The page already selects the group. Add the six watermark columns to that `select`. Then, after the `tab` is resolved and before `body` is built, add:

```tsx
  // Which watermark this reader reads. The everyone group has neither, which is
  // chatRole's own first clause reaching this page: its shelf is public and it
  // has no student for a visit to belong to.
  const seen = group.isEveryone
    ? { files: null, deck: null, todo: null }
    : viewerIsTeacher
      ? {
          files: group.teacherSeenFilesAt,
          deck: group.teacherSeenDeckAt,
          todo: group.teacherSeenTodoAt,
        }
      : {
          files: group.studentSeenFilesAt,
          deck: group.studentSeenDeckAt,
          todo: group.studentSeenTodoAt,
        };

  // The tab dot is the shelf's own predicate over the whole list, NOT a second
  // count. A Files tab lit above a shelf with no marked tile is the failure the
  // worksheet rules record about shelfSlotCount.
  const dots = unlocked
    ? {
        files: pages.some((page) => pageIsUnseen(page, seen.files, viewerIsTeacher)),
        deck:
          countUnseen(
            flashcards.map((card) => ({
              at: card.createdAt,
              fromTeacher: card.fromTeacher,
            })),
            seen.deck,
            viewerIsTeacher,
          ) > 0,
        todo:
          countUnseen(
            actionItems.flatMap((item) =>
              item.doneAt
                ? [{ at: item.doneAt, fromTeacher: item.doneByTeacher ?? false }]
                : [],
            ),
            seen.todo,
            viewerIsTeacher,
          ) > 0,
      }
    : { files: false, deck: false, todo: false };
```

`flashcards` must now select `fromTeacher` and `actionItems` must select `doneByTeacher` — add both to `lib/flashcards.ts`'s `FlashcardRow`/`select` and `lib/action-items.ts`'s `ActionItemRow`/`select`.

Pass `dots` to `<StudentTabs …>`, and add to `<FilesTab …>`:

```tsx
          seenAt={seen.files}
          viewerIsTeacher={viewerIsTeacher}
```

Finally, mount the marker for the active tab. Add inside `body`, as its first child:

```tsx
      {/* Stamps the watermark for whichever tab is open. Only the three that
          have one, and never on the everyone group — markTabSeen refuses it
          anyway through chatRole, but there is no reason to post.

          THE COST, stated: an unlocked teacher has no card tab and lands on
          Files, so opening a student from the admin always stamps
          teacherSeenFilesAt. That is honest — she is looking at the shelf — but
          it makes "N new files" a weaker signal than the homework bullets,
          which have no watermark and do not clear on sight at all. */}
      {unlocked &&
        !group.isEveryone &&
        (tab === "files" || tab === "deck" || tab === "todo") && (
          <MarkTabSeen onSeen={markTabSeen.bind(null, group.id, tab)} />
        )}
```

- [ ] **Step 5: Check and look at it**

```bash
npm run typecheck && npm run lint && npm run dev
```

Sign in as a student in one browser and as the teacher in another. Add a flashcard as the student. Expected: a dot on Jenn's *Vocabulaire* tab and **none** on the student's. Open the tab as Jenn, navigate away and back — the dot is gone.

- [ ] **Step 6: Commit**

```bash
git add components/student/StudentTabs.tsx components/ui/PageTile.tsx components/student/FilesTab.tsx "app/g/[slug]/page.tsx" lib/flashcards.ts lib/action-items.ts
git commit -m "Put dots on the tabs and on each file

The Files tab dot is pages.some(pageIsUnseen), not a second count, so a lit tab
always has a marked tile under it — the failure the worksheet rules record
about shelfSlotCount.

The dot sits inside the pill rather than over its corner: the strip scrolls
horizontally and an element hanging outside a scrolling child is clipped.

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 13: Verify the whole thing

- [ ] **Step 1: Run everything CI runs, in CI's order**

```bash
npx prisma generate && npm run lint && npm run typecheck && npm test && npm run build
```

Expected: all five pass. **Do not claim the work is done on a partial run** — the build is what catches a `Strings` object crossing into a client component, which lint, `tsc` and the tests all miss.

- [ ] **Step 2: Walk the four rules that were nearly broken**

Confirm by hand, on `/g/[slug]` as the student:

- A worksheet nobody has saved to shows **no** version tabs and **no** shelf badge. (`WorksheetOpen` must not have created a `PageVersion`.)
- The Send button on a fresh worksheet is drawn and **disabled**.
- Opening a worksheet as Jenn does **not** move that student's *not opened* bullet.
- `/g/all` has no dots and no watermark writes.

- [ ] **Step 3: Update `CLAUDE.md`**

Add the new surfaces to the routes table and a short *Activity and unseen state* section under Architecture. Record the two rules that must not be relaxed:

- `WorksheetOpen` is a separate row and must not be folded into `PageVersion`.
- The Files tab dot and the tile dots derive from one predicate.

- [ ] **Step 4: Final commit**

```bash
git add CLAUDE.md
git commit -m "Record the activity summary and the unseen dots

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Self-review notes

Checked against the spec:

| Spec section | Task |
|---|---|
| Six watermarks, backfilled | 1 |
| `Flashcard.fromTeacher`, `ActionItem.doneByTeacher` | 1, 5 |
| `WorksheetOpen` | 1, 7 |
| `lib/unseen.ts` | 2 |
| `lib/homework-status.ts` + 7-day rule | 3 |
| `lib/student-summary.ts` | 4 |
| The read model | 8 |
| Admin student cards | 9, 11 |
| Tab dots | 9, 10, 12 |
| Per-file dots | 10, 12 |
| Stamping, `chatRole`, no `revalidatePath` | 6, 12 |
| Language | 9 |
| Tests | 2, 3, 4 |

**Two deviations from the spec, both deliberate:**

1. The spec said the everyone group gets no dots because `chatRole` refuses it. Task 12 also gates the UI on `group.isEveryone`, so no request is made at all. The action still refuses — the guard is not moved, only doubled, which is this codebase's pattern.
2. `FilesTab` takes `seenAt` and `viewerIsTeacher` rather than a precomputed `dot` per page. The tab dot and the tile dots then provably call one function with one watermark, which the spec requires and a precomputed list would only promise.
