# Flashcards and action items — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two tabs to a student's page — a deck of two-sided flashcards either party can add and open full screen, and one shared checklist.

**Architecture:** Two new Prisma models behind one migration. One new pure module, `lib/flashcard-order.ts`, carries the only real rule (three sort orders, one of them a seeded shuffle) and is unit-tested; everything else is components and server actions, which this codebase deliberately does not unit-test. Both features reuse `chatRole` for access, so the everyone group is refused before anything else. The full-screen card is an overlay, not a route, following `BoardViewer`.

**Tech Stack:** Next.js App Router (server + client components), TypeScript, Tailwind v4, Prisma on SQLite, Vitest, framer-motion (already a dependency — the daily card uses it).

**Spec:** `docs/superpowers/specs/2026-08-07-flashcards-and-action-items-design.md`

---

## Before you start

Read `CLAUDE.md` at the repo root. These rules bite in this plan:

1. **A client component takes `locale: Locale`, never a resolved `Strings` object.** That object holds ~105 functions and React cannot serialize a function across the server/client boundary. The failure is a **runtime 500** with lint, tsc, tests and the build all green — it has shipped that way before. Call `getStrings(locale)` inside the client component.
2. **`lib/strings.ts` holds one `Strings` type and two objects both annotated as it.** Three edits per key or `tsc` fails naming it. That is the mechanism working.
3. **Interpolating values are functions, never placeholder templates.** French and English disagree about word order.
4. **Logic belongs in `lib/`** as pure functions with a test in `tests/lib/`. Components and Prisma access are not unit-tested.
5. **Comments record a decision and the failure that motivated it.** The comments in this plan are written that way deliberately — transcribe them, do not trim them.
6. **Every date is UTC**, constructed as ``new Date(`${str}T00:00:00Z`)`` and formatted with `timeZone: "UTC"`. `formatLongDate` already does this.
7. Anything that transitions carries `motion-reduce:transition-none`; anything that animates carries `motion-reduce:animate-none`.
8. **Two React Compiler lint rules are enforced and will reject ordinary-looking React.** `react-hooks/purity` refuses an impure call — `Math.random()`, `Date.now()` — anywhere in a component's function scope, even inside a handler that only runs on click. `react-hooks/set-state-in-effect` refuses `setState` called synchronously in an effect body, which rules out the usual "reset state when a prop changes" effect. The codebase's answer to the second is to **adjust state during render**: `const [last, setLast] = useState(x); if (last !== x) { setLast(x); … }`, as in `NewPageForm` (`lastDefault`) and `PageEditOverlay` (`lastSlug`). Do not add an eslint-disable for either — restructure, or stop and report.

Run after every task that changes code:

```bash
npx prisma generate && npm run lint && npm run typecheck && npm test
```

Expected lint result throughout: **exactly one** pre-existing warning, `lib/snapshot-dom.ts:77 'e' is defined but never used`. Anything else is yours.

`npm run build` needs network access for Google Fonts — run it once at the end (Task 11), not per task.

**Git note.** A pre-commit hook enforces an attribution trailer and rejects a chained `git add && git commit` *before the add runs*. Stage and commit as separate calls, and add `--trailer "Co-Authored-By: Claude Code <noreply@anthropic.com>"` if it rejects. Check `git show --stat HEAD` before reporting.

---

## File Structure

**New files**

| File | Responsibility |
|---|---|
| `prisma/migrations/<ts>_add_flashcards_and_action_items/migration.sql` | The two tables |
| `lib/flashcard-order.ts` | The three sort orders, including the seeded shuffle |
| `tests/lib/flashcard-order.test.ts` | Its tests |
| `lib/flashcards.ts` | The deck query |
| `lib/action-items.ts` | The checklist query |
| `app/deck-actions.ts` | Server actions for both features, behind one `chatRole` guard |
| `components/student/DeckTab.tsx` | The deck grid and its sort chips |
| `components/student/FlashcardViewer.tsx` | The full-screen flipping overlay |
| `components/student/AddFlashcardForm.tsx` | Front / back / note, inside the FAB's sheet |
| `components/student/TodoTab.tsx` | The checklist, its inline add field and its rows |

**Modified files**

| File | Change |
|---|---|
| `prisma/schema.prisma` | `Flashcard` and `ActionItem`, plus two relations on `Group` |
| `lib/student-tab.ts` | `"deck"` and `"todo"` join `StudentTab` |
| `tests/lib/student-tab.test.ts` | Cases for the two new tabs |
| `lib/strings.ts` | `student.tabs.deck`, `student.tabs.todo`, `student.deck.*`, `student.todo.*` |
| `components/student/StudentTabs.tsx` | Five tabs, and the strip scrolls |
| `components/student/ShelfFab.tsx` | *Add a flashcard* joins the menu |
| `app/g/[slug]/page.tsx` | Queries both lists, renders both tabs |
| `CLAUDE.md` | The routes table's `/g/[slug]` row |

**Deliberately not touched:** `components/Flashcard.tsx`, `CardFront.tsx`, `CardBack.tsx`. Those are the *daily* card. The viewer copies its flip technique but does not reuse the component — the daily card renders `CardContent`, a completely different shape, and bending it to take a two-field vocabulary card would put two unrelated jobs in one file.

---

## Task 1: The schema and the migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_flashcards_and_action_items/migration.sql` (generated)

- [ ] **Step 1: Add the two models**

Append to `prisma/schema.prisma`:

```prisma
// A two-sided vocabulary card on one student's deck. Whichever face was typed
// first is `front`, so "the dog" / "le chien" and the conjugated "vais" /
// "aller" both work without the model knowing which kind it is holding.
//
// NOT joined to anything but a group. Unlike Page, a card has no audience and
// no everyone-group inheritance: it is the vocabulary from one student's
// lesson, and chatRole refuses the everyone group before anything else.
model Flashcard {
  id      String @id @default(cuid())
  groupId String
  group   Group  @relation(fields: [groupId], references: [id], onDelete: Cascade)

  front String
  back  String
  // Drawn greyed on the back, beside the answer.
  note  String?

  // Null until the STUDENT opens this card full screen. Jenn's viewing never
  // writes here, and that is the whole rule: a card sits on one student's deck
  // but two people can open it, so if her browsing stamped this, flicking
  // through Marie's deck would tell Marie's app that Marie revised everything
  // — and the cards she is struggling with would drop to the bottom of the
  // list that exists to surface them.
  lastViewedAt DateTime?

  createdAt DateTime @default(now())

  @@index([groupId, createdAt])
}

// One shared checklist per student page. Either party adds, ticks, unticks and
// deletes; the list belongs to the page rather than to a person.
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

- [ ] **Step 2: Add the back-relations on `Group`**

Prisma requires both sides. Inside `model Group`, beside the existing `messages`, `whiteboards` and `versions` lines, add:

```prisma
  flashcards  Flashcard[]
  actionItems ActionItem[]
```

- [ ] **Step 3: Generate the migration**

```bash
npx prisma migrate dev --name add_flashcards_and_action_items
```

Expected: a new folder under `prisma/migrations/` containing `CREATE TABLE "Flashcard"` and `CREATE TABLE "ActionItem"`, and the client regenerated.

**If it reports drift, or offers to reset the database, STOP and report it.** Do not accept a reset — that wipes the local development data. A clean schema addition should need neither.

- [ ] **Step 4: Read the generated SQL**

```bash
cat prisma/migrations/*_add_flashcards_and_action_items/migration.sql
```

Confirm it is two `CREATE TABLE` statements plus their indexes, and that it **drops nothing and alters nothing**. This codebase has been bitten before by Prisma turning an intended change into a drop-and-recreate that silently discarded rows — see `CLAUDE.md`'s note on the thumbnail rename. Two new tables should not touch an existing one; if the SQL mentions any table other than `Flashcard` and `ActionItem`, stop and report.

- [ ] **Step 5: Verify**

```bash
npx prisma generate && npm run lint && npm run typecheck && npm test
```

Expected: clean but for the known warning; 1112 tests still passing.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "$(cat <<'EOF'
Add the flashcard and action-item tables

Two models, no changes to existing ones. Flashcard deliberately carries
no addedByStudent: either party may delete any card, so nothing would
read it. ActionItem's doneAt is a timestamp rather than a boolean,
following pinnedAt and sentAt — it records when, and re-ticking does
something.

lastViewedAt is the field with a rule behind it, recorded on the column.

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: The two new tabs in `parseStudentTab`

**Files:**
- Modify: `lib/student-tab.ts`
- Modify: `tests/lib/student-tab.test.ts`

- [ ] **Step 1: Write the failing tests**

Open `tests/lib/student-tab.test.ts` and read the existing cases first so your additions match their style and their helper shapes. The `available` record grows from three keys to five, so **every existing call site in that file needs the two new keys added** — do that first and confirm the suite still passes, then add these cases:

```ts
  it("honours ?tab=deck when the deck is available", () => {
    expect(
      parseStudentTab("deck", {
        card: true,
        files: true,
        board: true,
        deck: true,
        todo: true,
      }),
    ).toBe("deck");
  });

  it("honours ?tab=todo when the checklist is available", () => {
    expect(
      parseStudentTab("todo", {
        card: true,
        files: true,
        board: true,
        deck: true,
        todo: true,
      }),
    ).toBe("todo");
  });

  it("falls back rather than opening a tab a visitor should not have", () => {
    // A forwarded link. An untokened visitor has the card and nothing else,
    // and must land on it rather than on an empty deck.
    expect(
      parseStudentTab("deck", {
        card: true,
        files: false,
        board: false,
        deck: false,
        todo: false,
      }),
    ).toBe("card");
  });

  it("falls back to the deck when it is the first tab available", () => {
    // The fallback path for `deck` specifically. Not reachable through today's
    // only caller, which derives all four non-card flags from `unlocked` — but
    // the function's own contract should not depend on one caller's habits.
    expect(
      parseStudentTab(undefined, {
        card: false,
        files: false,
        board: false,
        deck: true,
        todo: true,
      }),
    ).toBe("deck");
  });

  it("falls back to the checklist when it is all that is left", () => {
    expect(
      parseStudentTab(undefined, {
        card: false,
        files: false,
        board: false,
        deck: false,
        todo: true,
      }),
    ).toBe("todo");
  });

  it("prefers the deck over the checklist for a teacher with no card tab", () => {
    // An unlocked teacher has no card tab, so the fallback order decides. It
    // runs card, files, board, deck, todo — files first, because that is the
    // tab she opens a student to see.
    expect(
      parseStudentTab(undefined, {
        card: false,
        files: true,
        board: true,
        deck: true,
        todo: true,
      }),
    ).toBe("files");
  });
```

- [ ] **Step 2: Run and see them fail**

```bash
npx vitest run tests/lib/student-tab.test.ts
```

Expected: FAIL — TypeScript rejects the extra `cards`/`todo` keys, or the two new values are not assignable to `StudentTab`.

- [ ] **Step 3: Widen the module**

Replace the whole of `lib/student-tab.ts` with:

```ts
export type StudentTab = "card" | "files" | "board" | "deck" | "todo";

// A record rather than positional booleans: two flags called with the wrong
// order is a silent bug, and five would make it certain.
//
// Availability is the whole point of the second argument. An untokened visitor
// has none of the extra tabs, and a forwarded ?tab= link must land them on
// the card rather than on a tab that should not exist for them.
//
// `card` joins them because the teacher does not get one: she opens a student
// from the admin to see their shelf and their board, and the daily card there
// is the same global card she just finished editing.
export function parseStudentTab(
  value: string | undefined,
  available: {
    card: boolean;
    files: boolean;
    board: boolean;
    deck: boolean;
    todo: boolean;
  },
): StudentTab {
  if (value === "card" && available.card) return "card";
  if (value === "files" && available.files) return "files";
  if (value === "board" && available.board) return "board";
  if (value === "deck" && available.deck) return "deck";
  if (value === "todo" && available.todo) return "todo";

  // The fallback order, and it is not the same as the strip's order by
  // accident: files comes before the deck because an unlocked teacher has no
  // card tab, and the shelf is what she opens a student to see.
  if (available.card) return "card";
  if (available.files) return "files";
  if (available.board) return "board";
  if (available.deck) return "deck";
  if (available.todo) return "todo";

  // Unreachable: the card is only ever withheld from a teacher, who is unlocked
  // and therefore has every other tab. A total function still needs an answer,
  // and the card branch degrades to "nothing posted yet" rather than to a crash.
  return "card";
}
```

- [ ] **Step 4: Run and see them pass**

```bash
npx vitest run tests/lib/student-tab.test.ts
```

Expected: PASS, including every pre-existing case.

- [ ] **Step 5: Fix the one caller**

`app/g/[slug]/page.tsx` calls `parseStudentTab` with three keys and will no longer compile. Find:

```tsx
  const tab = parseStudentTab(tab_, {
    card: showCard,
    files: unlocked || pages.length > 0,
    board: unlocked,
  });
```

and replace with:

```tsx
  const tab = parseStudentTab(tab_, {
    card: showCard,
    files: unlocked || pages.length > 0,
    board: unlocked,
    // Both new tabs follow the same rule Files and Whiteboard already use:
    // present for anyone unlocked, empty state and all.
    deck: unlocked,
    todo: unlocked,
  });
```

`StudentTabs`' `has` prop also takes three keys and is typed inline; widen it the same way in Task 5. For now, add the two keys to the `<StudentTabs has={{ … }} />` call in this file so the build stays green:

```tsx
          has={{
            card: showCard,
            files: unlocked || pages.length > 0,
            board: unlocked,
            deck: unlocked,
            todo: unlocked,
          }}
```

- [ ] **Step 6: Verify**

```bash
npx prisma generate && npm run lint && npm run typecheck && npm test
```

`typecheck` will still fail on `StudentTabs`' own prop type until Task 5 widens it. That is expected **only if** the error names `components/student/StudentTabs.tsx`. Any other error is yours. If you would rather keep every task green, widen that prop type here as well — it is three lines and Task 5 will find it already done.

- [ ] **Step 7: Commit**

```bash
git add lib/student-tab.ts tests/lib/student-tab.test.ts "app/g/[slug]/page.tsx"
git commit -m "$(cat <<'EOF'
Teach the tab parser about the deck and the checklist

Five tabs now, and the fallback order is deliberate: files before the
deck, because an unlocked teacher has no card tab and the shelf is what
she opens a student to see.

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `lib/flashcard-order.ts`

The only real rule in this feature. Pure, and unit-tested.

**Files:**
- Create: `lib/flashcard-order.ts`
- Test: `tests/lib/flashcard-order.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/flashcard-order.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { orderFlashcards, type FlashcardSort } from "@/lib/flashcard-order";

const at = (iso: string) => new Date(`${iso}T00:00:00Z`);

// Deliberately NOT in creation order, so a test that passes by accident of
// input order fails here.
const cards = [
  { id: "a", createdAt: at("2026-06-01"), lastViewedAt: at("2026-06-10") },
  { id: "b", createdAt: at("2026-06-03"), lastViewedAt: null },
  { id: "c", createdAt: at("2026-06-02"), lastViewedAt: at("2026-06-05") },
  { id: "d", createdAt: at("2026-06-05"), lastViewedAt: null },
  { id: "e", createdAt: at("2026-06-04"), lastViewedAt: at("2026-06-20") },
];

const ids = (rows: { id: string }[]) => rows.map((row) => row.id);

describe("added", () => {
  it("puts the newest first", () => {
    expect(ids(orderFlashcards(cards, "added", 1))).toEqual([
      "d",
      "e",
      "b",
      "c",
      "a",
    ]);
  });

  it("breaks ties on the original position", () => {
    // Two cards written by the same import in the same millisecond. Left to
    // engine sort stability this is a guarantee that is easy to lose without
    // noticing — the same reason sortPages pins it.
    const tied = [
      { id: "first", createdAt: at("2026-06-01"), lastViewedAt: null },
      { id: "second", createdAt: at("2026-06-01"), lastViewedAt: null },
    ];
    expect(ids(orderFlashcards(tied, "added", 1))).toEqual(["first", "second"]);
  });
});

describe("revision", () => {
  it("puts never-viewed cards first, then the longest unseen", () => {
    // b and d have never been opened, so they lead in their original order.
    // Then c (5 June) before a (10 June) before e (20 June).
    expect(ids(orderFlashcards(cards, "revision", 1))).toEqual([
      "b",
      "d",
      "c",
      "a",
      "e",
    ]);
  });

  it("treats a null as needing revision most, not least", () => {
    // The trap: a null coerced through a date comparison sorts as either the
    // oldest or the newest possible moment depending on how it is written, and
    // one of those silently buries every card nobody has opened.
    const rows = [
      { id: "seen-long-ago", createdAt: at("2026-01-01"), lastViewedAt: at("2020-01-01") },
      { id: "never-seen", createdAt: at("2026-01-01"), lastViewedAt: null },
    ];
    expect(ids(orderFlashcards(rows, "revision", 1))).toEqual([
      "never-seen",
      "seen-long-ago",
    ]);
  });
});

describe("random", () => {
  it("is stable for one seed", () => {
    // The shelf re-renders as the reader flips and pages. A shuffle that moved
    // under them on every render would be unusable, and would also differ
    // across hydration.
    expect(ids(orderFlashcards(cards, "random", 1))).toEqual(
      ids(orderFlashcards(cards, "random", 1)),
    );
  });

  it("produces a known order for a known seed", () => {
    expect(ids(orderFlashcards(cards, "random", 1))).toEqual([
      "e",
      "c",
      "b",
      "a",
      "d",
    ]);
  });

  it("produces a different order for a different seed", () => {
    expect(ids(orderFlashcards(cards, "random", 2))).toEqual([
      "c",
      "e",
      "a",
      "b",
      "d",
    ]);
  });

  it("keeps every card", () => {
    expect(ids(orderFlashcards(cards, "random", 7)).sort()).toEqual([
      "a",
      "b",
      "c",
      "d",
      "e",
    ]);
  });
});

describe("every sort", () => {
  it("returns a new array and leaves the input alone", () => {
    const before = ids(cards);
    for (const sort of ["added", "random", "revision"] as FlashcardSort[]) {
      const result = orderFlashcards(cards, sort, 3);
      expect(result).not.toBe(cards);
      expect(ids(cards)).toEqual(before);
    }
  });

  it("answers an empty deck with an empty list", () => {
    for (const sort of ["added", "random", "revision"] as FlashcardSort[]) {
      expect(orderFlashcards([], sort, 1)).toEqual([]);
    }
  });
});
```

- [ ] **Step 2: Run it and see it fail**

```bash
npx vitest run tests/lib/flashcard-order.test.ts
```

Expected: FAIL, `Failed to load url @/lib/flashcard-order`.

- [ ] **Step 3: Write the module**

Create `lib/flashcard-order.ts`:

```ts
// How a deck is ordered. Three answers, and only one of them is arithmetic —
// the other two are rules about what a reader is trying to do.

export type FlashcardSort = "added" | "random" | "revision";

type Row = { createdAt: Date; lastViewedAt: Date | null };

// A tiny deterministic generator (mulberry32), so a seed produces the same
// order every time it is asked.
//
// Math.random() would be wrong here twice over. The shelf is a client
// component fed server-rendered data, so an unseeded shuffle differs across
// hydration — the same class of fault FilesTab's `today` prop already avoids
// by being passed in rather than read as `new Date()`. And the deck re-renders
// as the reader flips and pages, so an order that was recomputed each time
// would move under them mid-read.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Fisher-Yates, drawing from the seeded generator. On a copy: every branch here
// returns a new array, so a caller can pass the same list to two sorts without
// the first rearranging it.
function shuffle<T>(items: T[], seed: number): T[] {
  const next = mulberry32(seed);
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Ties break on the cards' ORIGINAL array position rather than on engine sort
// stability — that guarantee is easy to lose without noticing, and this list
// has a real way to produce a tie: two cards added in the same second.
// sortPages records the same decision for the same reason.
function byIndex<T>(rows: T[], compare: (a: T, b: T) => number): T[] {
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => compare(a.row, b.row) || a.index - b.index)
    .map(({ row }) => row);
}

export function orderFlashcards<T extends Row>(
  cards: T[],
  sort: FlashcardSort,
  // Held in client state and regenerated only when Random is chosen. Taken as
  // an argument rather than made here so this module stays pure and testable.
  seed: number,
): T[] {
  if (sort === "random") return shuffle(cards, seed);

  if (sort === "revision") {
    // A card never opened needs revision MORE than one opened a month ago, so
    // nulls lead. Written as an explicit branch rather than by coercing null
    // through the date comparison: a null that became 0 would sort as 1970 and
    // happen to be right, and a null that became NaN would sort unpredictably
    // and be wrong — and neither says which was intended.
    return byIndex(cards, (a, b) => {
      if (a.lastViewedAt === null && b.lastViewedAt === null) return 0;
      if (a.lastViewedAt === null) return -1;
      if (b.lastViewedAt === null) return 1;
      return a.lastViewedAt.getTime() - b.lastViewedAt.getTime();
    });
  }

  return byIndex(cards, (a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}
```

- [ ] **Step 4: Run it and see it pass**

```bash
npx vitest run tests/lib/flashcard-order.test.ts
```

Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/flashcard-order.ts tests/lib/flashcard-order.test.ts
git commit -m "$(cat <<'EOF'
Add the deck's three orderings

Never-viewed cards lead the revision order, written as an explicit
branch rather than by coercing a null through a date comparison — one
coercion sorts them first by accident and the other buries them, and
neither says which was meant.

Random is seeded rather than Math.random at render: the shelf is a
client component fed server data, so an unseeded shuffle differs across
hydration and moves under the reader as they page.

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: The strings

**Files:**
- Modify: `lib/strings.ts` (the `Strings` type, the French object, the English object)

Three edits per block. Leaving one out is a compile error naming the key.

Disambiguate the three `student` areas by their values: the type's are `string` or function signatures, the French object's are French text, the English object's are English text.

- [ ] **Step 1: Add the two tab labels to the type**

Find `tabs: {` inside the `Strings` type's `student` area — it is the one whose members are `sectionsLabel`, `card`, `files`, `board`, all typed `string`. Replace it with:

```ts
    tabs: {
      sectionsLabel: string;
      card: string;
      files: string;
      board: string;
      // NOT "Les cartes". The daily-card tab above is "La carte", and two
      // adjacent tabs one letter apart, meaning different things, is a trap.
      // "Vocabulaire" also says what the deck is for.
      deck: string;
      todo: string;
    };
```

- [ ] **Step 2: Add the two new blocks to the type**

Directly after the `board: { … };` block in the `Strings` type's `student` area, add:

```ts
    deck: {
      empty: string;
      sort: {
        group: string;
        added: string;
        random: string;
        revision: string;
      };
      open: (front: string) => string;
      flip: string;
      previous: string;
      next: string;
      position: (index: number, total: number) => string;
      close: string;
      delete: string;
      deleteConfirm: string;
      deleteCancel: string;
      addTitle: string;
      frontLabel: string;
      backLabel: string;
      noteLabel: string;
      noteHint: string;
      save: string;
      addError: string;
    };

    todo: {
      empty: string;
      addPlaceholder: string;
      add: string;
      toggle: (text: string) => string;
      delete: (text: string) => string;
      byTeacher: string;
      error: string;
    };
```

- [ ] **Step 3: Add the French values**

In the French object's `student` area, add the two tab labels to its `tabs` block:

```ts
      deck: "Vocabulaire",
      todo: "À faire",
```

and, directly after its `board: { … },` block:

```ts
    deck: {
      empty: "Aucune carte pour l'instant !",
      sort: {
        group: "Trier par",
        added: "Ajout",
        random: "Aléatoire",
        revision: "À réviser",
      },
      open: (front) => `Ouvrir la carte « ${front} »`,
      flip: "Retourner",
      previous: "Carte précédente",
      next: "Carte suivante",
      position: (index, total) => `Carte ${index} sur ${total}`,
      close: "Fermer",
      delete: "Supprimer cette carte",
      deleteConfirm: "Supprimer ?",
      deleteCancel: "Annuler",
      addTitle: "Ajouter une carte",
      frontLabel: "Recto",
      backLabel: "Verso",
      noteLabel: "Note",
      noteHint: "Facultatif",
      save: "Ajouter",
      addError: "La carte n'a pas pu être ajoutée.",
    },

    todo: {
      empty: "Rien à faire pour l'instant !",
      addPlaceholder: "Ajouter une tâche…",
      add: "Ajouter",
      toggle: (text) => `Cocher « ${text} »`,
      delete: (text) => `Supprimer « ${text} »`,
      byTeacher: "Jenn",
      error: "Ça n'a pas fonctionné. Réessayez.",
    },
```

` ` is a non-breaking space, written as an escape so it is visible and greppable. French puts a space before `!`, `?` and inside `« »`, and it must be non-breaking or the punctuation wraps onto its own line. `BoardTab` and `LeaveBoardDialog` already do this.

- [ ] **Step 4: Add the English values**

In the English object's `student` area, add to its `tabs` block:

```ts
      deck: "Vocabulary",
      todo: "To-do",
```

and, in the same position as the French:

```ts
    deck: {
      empty: "No cards yet!",
      sort: {
        group: "Sort by",
        added: "Added",
        random: "Random",
        revision: "Needs revision",
      },
      open: (front) => `Open the card “${front}”`,
      flip: "Flip",
      previous: "Previous card",
      next: "Next card",
      position: (index, total) => `Card ${index} of ${total}`,
      close: "Close",
      delete: "Delete this card",
      deleteConfirm: "Delete?",
      deleteCancel: "Cancel",
      addTitle: "Add a flashcard",
      frontLabel: "Front",
      backLabel: "Back",
      noteLabel: "Note",
      noteHint: "Optional",
      save: "Add",
      addError: "That card could not be added.",
    },

    todo: {
      empty: "Nothing to do yet!",
      addPlaceholder: "Add an item…",
      add: "Add",
      toggle: (text) => `Tick “${text}”`,
      delete: (text) => `Delete “${text}”`,
      byTeacher: "Jenn",
      error: "That did not work. Try again.",
    },
```

- [ ] **Step 5: Verify**

```bash
npm run typecheck
```

Expected: silent. If it names a key, one of the three edits for that key is missing.

- [ ] **Step 6: Commit**

```bash
git add lib/strings.ts
git commit -m "$(cat <<'EOF'
Name the deck and the checklist in both languages

The flashcard tab is "Vocabulaire", not "Les cartes": the daily-card tab
is already "La carte", and two adjacent tabs one letter apart meaning
different things is a trap. It also says what the deck is for.

French punctuation spacing uses an explicit   so it is greppable and
cannot silently become a breaking space, the convention BoardTab and
LeaveBoardDialog already follow.

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Five tabs, and a strip that scrolls

Three tabs fit a phone. Five do not — the French set is roughly 380px of text before padding, in a strip capped at 560px and centred. It is also the first thing on the page, so a strip that wraps or squashes is the first thing a student sees go wrong.

**Files:**
- Modify: `components/student/StudentTabs.tsx`

- [ ] **Step 1: Widen the prop and add the two tabs**

In `components/student/StudentTabs.tsx`, replace the `has` prop type:

```ts
  has: { card: boolean; files: boolean; board: boolean };
```

with:

```ts
  has: {
    card: boolean;
    files: boolean;
    board: boolean;
    deck: boolean;
    todo: boolean;
  };
```

Then extend the `tabs` array, after the `board` entry:

```tsx
    ...(has.deck
      ? [{ tab: "deck" as const, label: student.tabs.deck, href: `/g/${slug}?tab=deck` }]
      : []),
    ...(has.todo
      ? [{ tab: "todo" as const, label: student.tabs.todo, href: `/g/${slug}?tab=todo` }]
      : []),
```

- [ ] **Step 2: Make the strip scroll instead of squashing**

Replace the `<nav>`'s className:

```tsx
      className="mx-auto mb-[var(--space-5)] flex max-w-[560px] justify-center"
```

with:

```tsx
      // SCROLLS RATHER THAN SQUASHING. Three tabs fit a phone and five do not:
      // the French labels are roughly 380px of text before padding, inside a
      // strip that is the first thing on this page. A strip that shrank its
      // padding to fit would look correct and be unusable — the same reason
      // ShellBar's middle track scrolls rather than compressing three French
      // version labels.
      //
      // Centring is `mx-auto` ON THE CHILD below, and deliberately NOT
      // `justify-center` here. Combining justify-center with overflow-x-auto
      // is a known trap: when the content is wider than the box, flexbox
      // centres the overflow, so BOTH ends are clipped and scrollLeft starts
      // in the middle — the reader has to scroll two directions to reach
      // either end. Auto margins centre when there is room and collapse to
      // zero when there is not, at every width, which also removes the need
      // to guess with a breakpoint whether five labels happen to fit.
      className="mx-auto mb-[var(--space-5)] flex max-w-[560px] overflow-x-auto"
```

- [ ] **Step 3: Stop the pills shrinking**

The inner `<div>` is `flex gap-1 rounded-full …`. A flex child in an overflow container can still shrink. Add `w-max shrink-0` to it:

```tsx
      <div className="mx-auto flex w-max shrink-0 gap-1 rounded-full border border-[var(--card-line)] bg-[var(--card-paper)] p-1">
```

And add `shrink-0` and `whitespace-nowrap` to each `<Link>`'s className, at the front of the `cn(` list:

```tsx
              "flex min-h-[44px] shrink-0 items-center whitespace-nowrap rounded-full px-5 py-2 font-[family-name:var(--card-font-serif)] text-sm transition-colors duration-150 motion-reduce:transition-none",
```

Without these the pills compress and the labels wrap to two lines inside a rounded pill, which is worse than either scrolling or clipping.

- [ ] **Step 4: Verify**

```bash
npx prisma generate && npm run lint && npm run typecheck && npm test
```

Expected: clean but for the known warning. If `typecheck` still complains about `app/g/[slug]/page.tsx`, its `has={{ … }}` call is missing the two keys Task 2 added.

- [ ] **Step 5: Commit**

```bash
git add components/student/StudentTabs.tsx
git commit -m "$(cat <<'EOF'
Give the tab strip two more tabs and somewhere to put them

Three fit a phone and five do not. The strip scrolls rather than
squashing: a row that shrinks its padding to fit looks correct and is
unusable, which is the same reason ShellBar's middle track scrolls.

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: The two query modules

Prisma access lives in `lib/`, following `lib/whiteboards.ts`. Two files rather than one, because a card and a checklist item have nothing to do with each other and will not change together.

**Files:**
- Create: `lib/deck-limits.ts`
- Create: `lib/flashcards.ts`
- Create: `lib/action-items.ts`

`lib/deck-limits.ts` holds three numbers and **imports nothing**. That matters:
the server actions bound input against them and the forms cap their inputs with
the same values, so it is reached from both sides of the server/client
boundary. A module that imported `@/lib/prisma` to hold a constant would pull
Prisma into the browser bundle.

```ts
// The bounds on a card and a checklist row, in characters.
//
// Imported by BOTH the server actions that enforce them and the forms that cap
// their inputs, which is why this file imports nothing — anything reaching for
// prisma here would drag it into the browser bundle.
//
// The form's maxLength is the courtesy and the action's check is the
// authority: a client is not an authority on length, and the input attribute
// is trivially removed.
export const MAX_CARD_FACE = 200;
export const MAX_CARD_NOTE = 500;
export const MAX_ITEM_TEXT = 300;
```

Neither is unit-tested — this codebase does not unit-test Prisma access, only the pure modules underneath it. `lib/flashcard-order.ts` is where the rule lives and it already has tests.

- [ ] **Step 1: Write `lib/flashcards.ts`**

```ts
import { prisma } from "@/lib/prisma";

// What the deck needs, and nothing more. `note` rides along because the viewer
// shows it on the back and a deck is a handful of short rows — unlike a shelf,
// there is no large column here worth a second query to avoid.
export type FlashcardRow = {
  id: string;
  front: string;
  back: string;
  note: string | null;
  lastViewedAt: Date | null;
  createdAt: Date;
};

export async function listFlashcards(groupId: string): Promise<FlashcardRow[]> {
  return prisma.flashcard.findMany({
    where: { groupId },
    // createdAt desc is the "Ajout" default. The other two orders are applied
    // in the browser by orderFlashcards, because Random needs a seed that only
    // the client has and Revision has to re-sort the moment a card is opened.
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      front: true,
      back: true,
      note: true,
      lastViewedAt: true,
      createdAt: true,
    },
  });
}
```

The `id: "desc"` tiebreak matters for the same reason `listWhiteboards` has one: two cards added in the same second would otherwise come back in whatever order SQLite chose that day, and the grid would reshuffle between visits for no reason a reader could explain.

- [ ] **Step 2: Write `lib/action-items.ts`**

```ts
import { prisma } from "@/lib/prisma";

export type ActionItemRow = {
  id: string;
  text: string;
  fromTeacher: boolean;
  doneAt: Date | null;
  createdAt: Date;
};

export async function listActionItems(
  groupId: string,
): Promise<ActionItemRow[]> {
  return prisma.actionItem.findMany({
    where: { groupId },
    // Creation order, oldest first, and done rows are NOT moved to the bottom.
    // A row that jumps the instant it is ticked makes an accidental tick hard
    // to undo, because the row you meant to press is no longer where you
    // pressed. It is struck through in place instead.
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      text: true,
      fromTeacher: true,
      doneAt: true,
      createdAt: true,
    },
  });
}
```

- [ ] **Step 3: Verify**

```bash
npx prisma generate && npm run lint && npm run typecheck && npm test
```

Expected: clean but for the known warning. Nothing imports these yet; that is Task 10.

- [ ] **Step 4: Commit**

```bash
git add lib/flashcards.ts lib/action-items.ts
git commit -m "$(cat <<'EOF'
Add the deck and checklist queries

Two files rather than one: a card and a checklist item have nothing to
do with each other and will not change together.

Both carry an id tiebreak, for the reason listWhiteboards does — two
rows written in the same second would otherwise come back in whatever
order SQLite chose, and the list would reshuffle between visits with no
cause a reader could see.

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: The server actions

**Files:**
- Create: `app/deck-actions.ts`

One file for both features, because they share the guard and the guard is the interesting part.

- [ ] **Step 1: Write the module**

Create `app/deck-actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getCurrentTeacher } from "@/lib/session";
import { chatRole, type ChatRole } from "@/lib/chat-access";
import { readToken, cookieNameFor } from "@/lib/student-tokens";
import { currentStrings } from "@/lib/locale";
import {
  MAX_CARD_FACE,
  MAX_CARD_NOTE,
  MAX_ITEM_TEXT,
} from "@/lib/deck-limits";

// chatRole and NOT shelfRole, and the difference is the everyone group.
// shelfRole answers "teacher" before it tests isEveryone, deliberately, because
// the shared shelf is Jenn's to fill. Neither of these features has a shared
// version: a deck is one student's vocabulary and a checklist is between two
// people, so the everyone group must be refused for BOTH parties — which is
// chatRole's first clause, and the same reuse the whiteboard makes.
//
// The token is read from the cookie here and never taken as an argument, so a
// client cannot assert one. requireShelfRole in app/page-actions.ts is the
// shape this follows.
async function requireDeckRole(groupId: string): Promise<ChatRole> {
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: { slug: true, isEveryone: true, chatToken: true },
  });
  if (!group) {
    const strings = await currentStrings();
    throw new Error(strings.admin.actions.unauthorized);
  }

  const teacher = await getCurrentTeacher();
  const cookieStore = await cookies();
  const role = chatRole({
    isTeacher: Boolean(teacher),
    isEveryone: group.isEveryone,
    chatToken: group.chatToken,
    presented: readToken(
      undefined,
      cookieStore.get(cookieNameFor(group.slug))?.value,
    ),
  });
  if (!role) {
    const strings = await currentStrings();
    throw new Error(strings.admin.actions.unauthorized);
  }
  return role;
}

// One path, revalidated by both features. A pattern rather than a slug: a card
// and an item both live under /g/[slug], and the tab is a search param rather
// than a segment.
function revalidateDeck() {
  revalidatePath("/g/[slug]", "page");
}

function requireText(value: string, max: number): string {
  const text = value.trim();
  // Bounded on the way in as well as by the column, because a client is not an
  // authority on length. An empty card or an empty checklist row is a row
  // nobody can read or press.
  //
  // REJECTS rather than truncating, which is what every other bounded input
  // here does — validatePageHtml returns an error over MAX_PAGE_BYTES and
  // parseMessageBody returns null, which the chat route turns into a 400.
  // Truncating would save a teacher's 250-character card as 200 characters
  // with no signal at all: the action resolves, the sheet closes, and the
  // last fifty characters are simply gone.
  //
  // The message is internal and written for a stack trace. Both forms discard
  // it and show their own dictionary sentence, the rule ShelfFab's catches
  // already follow — and both cap their inputs with the same constant, so
  // reaching this needs the attribute removed by hand.
  if (!text) throw new Error("Empty");
  if (text.length > max) throw new Error("Too long");
  return text;
}

export async function addFlashcard(
  groupId: string,
  input: { front: string; back: string; note: string },
): Promise<void> {
  await requireDeckRole(groupId);

  await prisma.flashcard.create({
    data: {
      groupId,
      front: requireText(input.front, MAX_CARD_FACE),
      back: requireText(input.back, MAX_CARD_FACE),
      // An empty note is null, not "". The column is nullable so the viewer can
      // ask one question — is there a note — rather than two.
      note: input.note.trim() ? requireText(input.note, MAX_CARD_NOTE) : null,
    },
  });

  revalidateDeck();
}

export async function deleteFlashcard(
  groupId: string,
  id: string,
): Promise<void> {
  await requireDeckRole(groupId);
  // deleteMany, and scoped by groupId as well as id: a double-click or a stale
  // tab is a no-op rather than a P2025, and a card id guessed from one
  // student's deck cannot be deleted through another's.
  await prisma.flashcard.deleteMany({ where: { id, groupId } });
  revalidateDeck();
}

// THE WRITE ON READ. The only one in this codebase — every other write here is
// a deliberate act, a save or a send or a pin.
//
// Two things about it are load-bearing. It is refused for the teacher, because
// a card sits on one student's deck but two people can open it: if Jenn's
// browsing stamped this, flicking through Marie's deck would tell Marie's app
// that Marie revised everything, and the cards she is struggling with would
// drop to the bottom of the list that exists to surface them.
//
// It returns SILENTLY for the teacher rather than throwing, which bends this
// codebase's own rule that silence is for a resource already gone and a policy
// refusal throws (see setShelfPin). The bend is deliberate: unlike deleteGroup
// or setShelfPin, nobody pressed anything here — it is fired unawaited on every
// card opened, so a throw would be an uncaught rejection in the browser for
// every card Jenn looks at, with nothing to catch it and nothing to show.
//
// And it does NOT revalidate. The caller fires it without awaiting, and a
// revalidation would re-render the deck underneath a reader who is mid-flip and
// reorder it under them when the sort is "À réviser". The new timestamp is
// picked up on the next navigation, which is when it matters.
export async function markFlashcardViewed(
  groupId: string,
  id: string,
): Promise<void> {
  const role = await requireDeckRole(groupId);
  if (role !== "student") return;

  await prisma.flashcard.updateMany({
    where: { id, groupId },
    data: { lastViewedAt: new Date() },
  });
}

export async function addActionItem(
  groupId: string,
  text: string,
): Promise<void> {
  const role = await requireDeckRole(groupId);

  await prisma.actionItem.create({
    data: {
      groupId,
      text: requireText(text, MAX_ITEM_TEXT),
      // From the ROLE the guard resolved, never from an argument. A client that
      // could name its own author could put words in Jenn's mouth on a list she
      // shares with a student.
      fromTeacher: role === "teacher",
    },
  });

  revalidateDeck();
}

export async function setActionItemDone(
  groupId: string,
  id: string,
  done: boolean,
): Promise<void> {
  await requireDeckRole(groupId);
  await prisma.actionItem.updateMany({
    where: { id, groupId },
    data: { doneAt: done ? new Date() : null },
  });
  revalidateDeck();
}

export async function deleteActionItem(
  groupId: string,
  id: string,
): Promise<void> {
  await requireDeckRole(groupId);
  await prisma.actionItem.deleteMany({ where: { id, groupId } });
  revalidateDeck();
}
```

- [ ] **Step 2: Verify**

```bash
npx prisma generate && npm run lint && npm run typecheck && npm test
```

Expected: clean but for the known warning.

- [ ] **Step 3: Commit**

```bash
git add app/deck-actions.ts
git commit -m "$(cat <<'EOF'
Add the deck and checklist actions behind one guard

chatRole rather than shelfRole, and the difference is the everyone
group: shelfRole answers "teacher" before it tests isEveryone because
the shared shelf is Jenn's to fill, and neither of these features has a
shared version.

markFlashcardViewed is the first write-on-read in this codebase. It is
refused for the teacher — her browsing a deck would otherwise bury the
cards the student is struggling with — and it deliberately does not
revalidate, or the deck would reorder under a reader mid-flip.

fromTeacher comes from the resolved role and never from an argument.

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: The deck tab and its viewer

**Files:**
- Create: `components/student/DeckTab.tsx`
- Create: `components/student/FlashcardViewer.tsx`

- [ ] **Step 1: Write the viewer**

Create `components/student/FlashcardViewer.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useOverlayLock } from "@/components/ui/OverlayProvider";
import { cardDateLabel, cardFocusRing } from "@/components/card-styles";
import { formatLongDate } from "@/lib/format";
import { getStrings } from "@/lib/strings";
import type { Locale } from "@/lib/i18n";
import type { FlashcardRow } from "@/lib/flashcards";
import { cn } from "@/lib/utils";

const controlClass = cn(
  "flex h-11 min-w-11 items-center justify-center rounded-full border border-[var(--card-line)] bg-[var(--card-paper)] px-3 font-[family-name:var(--card-font-serif)] text-sm text-[var(--card-moss)] shadow-[var(--card-shadow)] transition-colors duration-150 hover:bg-[var(--card-section)] disabled:opacity-40 motion-reduce:transition-none",
  cardFocusRing,
);

const faceClass =
  "col-start-1 row-start-1 flex flex-col items-center justify-center rounded-2xl border border-[var(--card-line)] bg-[var(--card-paper)] p-8 text-center shadow-[var(--card-shadow)] [backface-visibility:hidden]";

// One card, full screen, over the deck.
//
// An OVERLAY and not a route, following BoardViewer: a card is not a
// bookmarkable thing and the deck is the unit a reader navigates. It takes the
// deck already ordered, so Random and À réviser carry in from the shelf rather
// than being recomputed here against a different seed.
export function FlashcardViewer({
  cards,
  index,
  locale,
  onIndex,
  onClose,
  onDelete,
}: {
  // Already ordered by the shelf.
  cards: FlashcardRow[];
  index: number;
  // A client component takes the LOCALE, never a resolved Strings object: that
  // object holds functions and React cannot serialize a function across the
  // server/client boundary. See lib/strings.ts.
  locale: Locale;
  // Stamping lastViewedAt happens in DeckTab's own handler, NOT here — see
  // its `show`. This component only reports which card should be current.
  onIndex: (next: number) => void;
  onClose: () => void;
  onDelete: (id: string) => Promise<void>;
}) {
  const t = getStrings(locale).student.deck;

  // Hides the two fixed corner buttons below `md` for the life of this mount,
  // the rule AddSheet, ChatPanel and BoardViewer all follow. Without it the
  // shelf's + and the chat bubble paint over the card's own controls.
  useOverlayLock();

  const [flipped, setFlipped] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const card = cards[index];

  // Moving to a card shows its FRONT, and clears a half-pressed delete. A card
  // that opened already flipped would answer a question the reader had not
  // been asked.
  //
  // Adjusted during render rather than in an effect, which is the shape
  // NewPageForm and PageEditOverlay already use for the same job:
  // react-hooks/set-state-in-effect rejects the effect form, and an effect
  // would paint the previous card's flipped face for one frame before
  // correcting it.
  const [lastIndex, setLastIndex] = useState(index);
  if (lastIndex !== index) {
    setLastIndex(index);
    setFlipped(false);
    setConfirming(false);
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft" && index > 0) onIndex(index - 1);
      if (event.key === "ArrowRight" && index < cards.length - 1) {
        onIndex(index + 1);
      }
      if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        setFlipped((value) => !value);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [index, cards.length, onIndex, onClose]);

  if (!card) return null;

  async function remove() {
    setBusy(true);
    try {
      await onDelete(card.id);
      // The deck is one shorter now. Move to the card that took this one's
      // place, or close if it was the last — a viewer left open on an empty
      // frame reads as a crash.
      if (cards.length <= 1) onClose();
      else onIndex(Math.min(index, cards.length - 2));
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={card.front}
      className="fixed inset-0 z-[60] flex flex-col bg-[var(--card-page-bg)]"
    >
      <div className="flex items-start justify-between gap-2 px-4 py-3">
        <span className={cardDateLabel}>
          {formatLongDate(card.createdAt, locale)}
        </span>

        <div className="flex items-center gap-2">
          {confirming ? (
            <>
              <button
                type="button"
                onClick={() => void remove()}
                disabled={busy}
                className={cn(controlClass, "text-[var(--card-rouge)]")}
              >
                {t.deleteConfirm}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={busy}
                className={controlClass}
              >
                {t.deleteCancel}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              aria-label={t.delete}
              className={controlClass}
            >
              <TrashIcon />
            </button>
          )}
          <button type="button" onClick={onClose} className={controlClass}>
            {t.close}
          </button>
        </div>
      </div>

      {/* The same flip the daily card uses — perspective on the wrapper, one
          grid cell holding two faces, the back pre-rotated. */}
      <div className="flex flex-1 items-center justify-center px-4">
        <div
          className="w-full max-w-[560px] cursor-pointer [perspective:2000px]"
          onClick={() => setFlipped((value) => !value)}
        >
          <motion.div
            className="grid min-h-[320px] w-full grid-cols-1"
            animate={{ rotateY: flipped ? 180 : 0 }}
            transition={{ duration: 0.6, ease: [0.4, 0.15, 0.2, 1] }}
            style={{ transformStyle: "preserve-3d" }}
          >
            <div className={faceClass}>
              <p className="font-[family-name:var(--card-font-serif)] text-3xl text-[var(--card-ink)]">
                {card.front}
              </p>
            </div>

            <div className={cn(faceClass, "[transform:rotateY(180deg)]")}>
              <p className="font-[family-name:var(--card-font-serif)] text-3xl text-[var(--card-ink)]">
                {card.back}
              </p>
              {card.note && (
                <p className="mt-4 font-[family-name:var(--card-font-serif)] text-sm italic text-[var(--card-moss)]">
                  {card.note}
                </p>
              )}
            </div>
          </motion.div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <button
          type="button"
          onClick={() => onIndex(index - 1)}
          disabled={index === 0}
          aria-label={t.previous}
          className={controlClass}
        >
          ‹
        </button>

        <div className="flex items-center gap-3">
          <span className="font-[family-name:var(--card-font-serif)] text-sm text-[var(--card-moss)]">
            {t.position(index + 1, cards.length)}
          </span>
          <button
            type="button"
            onClick={() => setFlipped((value) => !value)}
            className={controlClass}
          >
            {t.flip}
          </button>
        </div>

        <button
          type="button"
          onClick={() => onIndex(index + 1)}
          disabled={index >= cards.length - 1}
          aria-label={t.next}
          className={controlClass}
        >
          ›
        </button>
      </div>
    </div>
  );
}

// Local to the file that draws it, the same way ShellBar keeps its own back
// arrow rather than an icon module for a handful of one-off shapes.
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
      <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
    </svg>
  );
}
```

- [ ] **Step 2: Write the deck tab**

Create `components/student/DeckTab.tsx`:

```tsx
"use client";

import { useState } from "react";
import { FilterChip } from "@/components/ui/FilterChip";
import { FlashcardViewer } from "@/components/student/FlashcardViewer";
import { orderFlashcards, type FlashcardSort } from "@/lib/flashcard-order";
import { cardDateLabel, cardFocusRing, emptyStateText } from "@/components/card-styles";
import { formatLongDate } from "@/lib/format";
import { getStrings } from "@/lib/strings";
import type { Locale } from "@/lib/i18n";
import type { FlashcardRow } from "@/lib/flashcards";
import { cn } from "@/lib/utils";

export function DeckTab({
  cards,
  isTeacher,
  locale,
  onDelete,
  onViewed,
}: {
  cards: FlashcardRow[];
  isTeacher: boolean;
  // See lib/strings.ts: the locale crosses, the dictionary does not.
  locale: Locale;
  onDelete: (id: string) => Promise<void>;
  // The bound markFlashcardViewed. Returns a promise this component
  // deliberately does not await.
  onViewed: (id: string) => Promise<void>;
}) {
  const t = getStrings(locale).student.deck;
  const [sort, setSort] = useState<FlashcardSort>("added");
  const [seed, setSeed] = useState(1);
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  function chooseSort(next: FlashcardSort) {
    // Pressing Random again reshuffles, which is what a reader expects of it —
    // so the seed has to change. It is a COUNTER and not Math.random(), for
    // two reasons. The React Compiler's purity rule refuses an impure call
    // anywhere in a component's scope, invocation timing notwithstanding. And
    // a random seed generated in a state initialiser would differ across
    // hydration, ordering the deck one way in the HTML and another the moment
    // React took over. A counter has neither problem and costs nothing: the
    // orders it walks are arbitrary with respect to the cards, which is all
    // "random" has to mean here.
    if (next === "random") setSeed((current) => current + 1);
    setSort(next);
    // The open card's index refers to the OLD order. Closing is honest;
    // silently showing a different card is not.
    setOpenIndex(null);
  }

  const ordered = orderFlashcards(cards, sort, seed);

  // Making a card current — from the grid or from the viewer's arrows — is the
  // one place lastViewedAt is stamped.
  //
  // A HANDLER and not an effect, deliberately. An effect keyed on the current
  // card would re-fire whenever its dependencies changed identity, and
  // `onViewed` is a bound server action whose identity this component does not
  // control — so a stamp could fire on renders caused by something else
  // entirely. Opening a card is a click; treat it as one.
  //
  // Fired without awaiting: a dropped stamp costs one card's ordering, and a
  // blocked open costs the feature. The action itself refuses the teacher, so
  // the isTeacher check here only avoids a request that would do nothing.
  function show(index: number) {
    setOpenIndex(index);
    const card = ordered[index];
    if (card && !isTeacher) void onViewed(card.id);
  }

  const options: { sort: FlashcardSort; label: string }[] = [
    { sort: "added", label: t.sort.added },
    { sort: "random", label: t.sort.random },
    { sort: "revision", label: t.sort.revision },
  ];

  return (
    <div className="mx-auto max-w-[1152px]">
      {cards.length > 0 && (
        <div
          role="group"
          aria-label={t.sort.group}
          className="mb-5 flex flex-wrap justify-center gap-2"
        >
          {options.map((option) => (
            <FilterChip
              key={option.sort}
              tone="card"
              active={sort === option.sort}
              onClick={() => chooseSort(option.sort)}
            >
              {option.label}
            </FilterChip>
          ))}
        </div>
      )}

      {cards.length === 0 ? (
        <p className={emptyStateText}>{t.empty}</p>
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {ordered.map((card, index) => (
            <li key={card.id}>
              <button
                type="button"
                onClick={() => show(index)}
                aria-label={t.open(card.front)}
                className={cn(
                  "flex min-h-[132px] w-full flex-col justify-between rounded-2xl border border-[var(--card-line)] bg-[var(--card-paper)] p-4 text-left shadow-[var(--card-shadow)] transition-colors duration-150 hover:bg-[var(--card-section)] motion-reduce:transition-none",
                  cardFocusRing,
                )}
              >
                <span className={cardDateLabel}>
                  {formatLongDate(card.createdAt, locale)}
                </span>
                {/* The front only. A tile that showed the answer would make the
                    deck a glossary and the revision order meaningless. */}
                <span className="font-[family-name:var(--card-font-serif)] text-lg text-[var(--card-ink)]">
                  {card.front}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {openIndex !== null && (
        <FlashcardViewer
          cards={ordered}
          index={openIndex}
          locale={locale}
          // `show`, not setOpenIndex: paging with the arrows makes a new card
          // current, and that is a view.
          onIndex={show}
          onClose={() => setOpenIndex(null)}
          onDelete={onDelete}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify**

```bash
npx prisma generate && npm run lint && npm run typecheck && npm test
```

Expected: clean but for the known warning. Nothing renders these yet — Task 10 wires them.

- [ ] **Step 4: Commit**

```bash
git add components/student/DeckTab.tsx components/student/FlashcardViewer.tsx
git commit -m "$(cat <<'EOF'
Add the deck grid and its full-screen card

An overlay rather than a route, following BoardViewer: a card is not a
bookmarkable thing and the deck is the unit a reader navigates. It takes
the deck already ordered, so Random and À réviser carry in from the
shelf rather than being recomputed against a second seed.

The Random seed is generated in the click handler and never in a state
initialiser — an initialiser runs during the server render too, and the
deck would be ordered one way in the HTML and another after hydration.

Moving to a card shows its front. A card that opened already flipped
would answer a question the reader had not been asked.

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
)"
```

---

## Task 8b: Fix the viewer's keyboard handling and its two faces

**Added after Task 8's review. Task 8 is committed (`a059532`) and these are defects in it.** Do this before Task 9.

- [ ] **Step 1: Stop the global key handler hijacking every button**

`components/student/FlashcardViewer.tsx`'s `keydown` listener is on `document` and calls `event.preventDefault()` for Space and Enter with no check on the target. `preventDefault` on `keydown` cancels the browser's own keyboard activation of whatever has focus — so a keyboard user who tabs to **Close** and presses Enter gets a flipped card and no close. The same kills Previous, Next, and both delete buttons. `BoardViewer`'s listener only handles Escape and does not have this problem.

Replace the Space/Enter branch so it only flips when focus is not on a control:

```tsx
      if (event.key === " " || event.key === "Enter") {
        // Only when nothing focusable owns the keystroke. This listener is on
        // `document`, and preventDefault on keydown cancels the browser's own
        // activation of the focused element — without this check, tabbing to
        // Close and pressing Enter flips the card instead of closing, and the
        // same kills every other button in the dialog. The Flip button below
        // handles the keyboard case for itself, natively.
        const target = event.target as HTMLElement | null;
        if (target?.closest("button")) return;
        event.preventDefault();
        setFlipped((value) => !value);
      }
```

- [ ] **Step 2: Hide the face nobody is looking at**

`backface-visibility: hidden` is visual only. Both faces are in the accessibility tree at all times, so a screen-reader user hears the answer beside the question — which defeats the entire flip-to-reveal design and, with it, the point of the revision ordering.

Add `aria-hidden` to each face, keyed on `flipped`: the front face gets `aria-hidden={flipped}`, the back face `aria-hidden={!flipped}`. Add a comment saying why: `backface-visibility` hides pixels, not content.

- [ ] **Step 3: Make the dialog's name follow the face**

The dialog's `aria-label={card.front}` never changes, so it is wrong whenever the card is flipped. Make it track the state: `aria-label={flipped ? card.back : card.front}`.

- [ ] **Step 4: Make the flip wrapper reachable**

The wrapper is a plain `<div onClick>`. Once Step 1 lands, the accidental "any Enter anywhere flips" fallback is gone, so this becomes a real dead end for a keyboard user who has not found the Flip button.

Add the string in all three places in `lib/strings.ts`, in the `deck` block beside `flip`:
`flipHint` — French `"Retourner la carte"`, English `"Flip the card"`.

**Written as: give the wrapper `role="button"`, `tabIndex={0}`, an `aria-label` and an `onKeyDown`. That was tried and reverted — do not put it back.** ARIA makes a button's children presentational, so the role plus a label exposes the whole card as the single word *Flip*: `front`, `back` and `note` all leave the accessibility tree, and Step 2's `aria-hidden` pair becomes dead code, since both faces were already excluded. A screen-reader user would press Space and hear nothing, which is the exact dead end this step exists to close.

What shipped instead, in `b0a2954`. The wrapper stays a plain `<div onClick>`, and the keyboard is served by moving focus rather than by adding a control:

- The dialog gets `tabIndex={-1}` and takes focus on mount, which `aria-modal` asks for anyway. Step 1's guard then passes, so Space and Enter flip. A click on the card — not itself focusable — returns focus to the dialog, so the mouse and the keyboard end in the same state.
- Focus goes back to the opener on unmount, guarded by `isConnected` because the close may be a delete. `document.activeElement` rather than a `triggerRef`, since the trigger is one tile of a mapped grid; the cost is that Safari, which does not focus a button on click, restores nothing — and a reader who never had focus on the tile has none to give back.
- **Step 1's guard had to change with it.** `closest("button")` is not enough: the browser drops focus to `<body>` whenever a focused control is disabled or unmounted, which `‹`, `›`, the trash and Confirm all do to themselves, and `<body>` is not a button. Paging to the last card with Enter then made the *next* Enter flip it. The test is `document.activeElement !== dialogRef.current`.
- **Tab is trapped.** `aria-modal` is a hint to assistive tech and does nothing to the tab order, so Shift+Tab off the dialog reached the deck tile painted underneath the opaque overlay, where Enter fires `show()` and re-stamps another card's `lastViewedAt` — Step 1's failure arriving by the other door. The trap re-queries its stops on every keystroke, so the trash/Confirm swap and the disabled arrows are always current, and it pulls focus back in when it has fallen to `<body>`.
- `flipHint` is still added, and is still used — as the Flip button's `aria-label`. Both dictionaries keep the visible label as the opening words of the spoken one, so WCAG 2.5.3 label-in-name holds.

- [ ] **Step 4b: Announce the face that arrives, and reset the flip on delete**

Two defects the steps above surface rather than cause.

Step 2's `aria-hidden` swap changes which text is in the tree but announces nothing, and a dialog's name is read on open and never again — so a flip was silent. An `sr-only` `aria-live="polite"` region, empty until flipped, then holding `card.back`, fixes it: its nodes are genuinely **added** on the flip, which is the trigger every screen reader honours, where un-hiding a subtree is an attribute change iOS VoiceOver commonly ignores — and that is the device most of these students read on. The accepted cost is stated in the code: while flipped the answer is in the tree twice, because no region can announce without also being readable. The note is not repeated; it is the long half and it is on the face.

And `remove()` closes over the pre-delete `cards`, so `onIndex(Math.min(index, cards.length - 2))` hands back the index it was already on for any card but the last. The prop does not change, the render-phase reset never fires, and `cards[index]` is a different card once the deck reloads — so deleting a flipped card showed the next one with its answer already up. `remove()` calls `setFlipped(false)` itself.

- [ ] **Step 5: Verify**

```bash
npm run lint && npm run typecheck && npm test
```

Only `lib/snapshot-dom.ts:77`; silent; 1129 in 102 files. **No eslint-disable** — if a hook rule fires, restructure or stop and report.

- [ ] **Step 6: Commit**

Stage and commit separately, `--trailer "Co-Authored-By: Claude Code <noreply@anthropic.com>"` if the hook rejects. No `--amend`. Record in the body that a `document`-level `preventDefault` on Enter had been cancelling activation of every button in the dialog, and that `backface-visibility` hides pixels rather than content.


---

## Task 9: Adding a card

The `+` FAB already exists on `/g/[slug]` with a role-dependent menu. A flashcard joins it rather than getting a control of its own.

**Files:**
- Create: `components/student/AddFlashcardForm.tsx`
- Modify: `components/student/ShelfFab.tsx`

- [ ] **Step 1: Write the form**

Create `components/student/AddFlashcardForm.tsx`:

```tsx
"use client";

import { useState, type FormEvent } from "react";
import { fieldClassName } from "@/components/ui/field";
import { cardFocusRing, formErrorText } from "@/components/card-styles";
import { getStrings } from "@/lib/strings";
import { MAX_CARD_FACE, MAX_CARD_NOTE } from "@/lib/deck-limits";
import type { Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const submitClass = cn(
  "min-h-[44px] rounded-full bg-[var(--card-bleu)] px-5 py-2.5 font-[family-name:var(--card-font-serif)] text-sm text-white transition-opacity duration-150 hover:opacity-90 disabled:opacity-50 motion-reduce:transition-none",
  cardFocusRing,
);

export function AddFlashcardForm({
  locale,
  onAdd,
  onDone,
}: {
  // See lib/strings.ts: the locale crosses, the dictionary does not.
  locale: Locale;
  onAdd: (input: { front: string; back: string; note: string }) => Promise<void>;
  onDone: () => void;
}) {
  const t = getStrings(locale).student.deck;
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onAdd({ front, back, note });
      onDone();
    } catch {
      // The action's own thrown messages are internal and written for a stack
      // trace. The visitor gets one sentence from the dictionary instead of a
      // leaked internal string — the rule ShelfFab's own catches already
      // follow.
      setError(t.addError);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <label className="text-sm font-medium text-[var(--card-ink)]">
        {t.frontLabel}
        <input
          value={front}
          onChange={(event) => setFront(event.target.value)}
          required
          autoFocus
          // The courtesy; the action is the authority. Without it an
          // over-long card fails on submit with a generic sentence, which
          // tells the writer nothing about what to shorten.
          maxLength={MAX_CARD_FACE}
          className={cn(fieldClassName, "mt-1")}
        />
      </label>

      <label className="text-sm font-medium text-[var(--card-ink)]">
        {t.backLabel}
        <input
          value={back}
          onChange={(event) => setBack(event.target.value)}
          required
          maxLength={MAX_CARD_FACE}
          className={cn(fieldClassName, "mt-1")}
        />
      </label>

      <label className="text-sm font-medium text-[var(--card-ink)]">
        {t.noteLabel}{" "}
        <span className="font-normal text-[var(--color-ink-muted)]">
          {t.noteHint}
        </span>
        <input
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={MAX_CARD_NOTE}
          className={cn(fieldClassName, "mt-1")}
        />
      </label>

      <button
        type="submit"
        disabled={saving || front.trim() === "" || back.trim() === ""}
        className={submitClass}
      >
        {saving ? getStrings(locale).common.saving : t.save}
      </button>

      {error && (
        <p role="alert" className={formErrorText}>
          {error}
        </p>
      )}
    </form>
  );
}
```

- [ ] **Step 2: Add it to the FAB menu**

In `components/student/ShelfFab.tsx`:

Add the imports:

```ts
import { AddFlashcardForm } from "@/components/student/AddFlashcardForm";
```

Widen the `Open` union:

```ts
type Open = null | "menu" | "link" | "page" | "pdf" | "card";
```

Add a prop, beside `onAddPdf`:

```ts
  // Both roles get this one — a card is vocabulary from the lesson and either
  // party writes it down. Unlike onAddPage, which is Jenn's alone because a
  // student may upload a PDF and not a whole website.
  onAddFlashcard: (input: {
    front: string;
    back: string;
    note: string;
  }) => Promise<void>;
```

Add `onAddFlashcard,` to the destructured parameter list.

Add the entry to **both** arms of the `choices` array, after `pdf`:

```ts
          { key: "card", label: strings.student.deck.addTitle },
```

so the teacher's arm reads link / page / pdf / card and the student's reads link / pdf / card.

Add the sheet, beside the existing `open === "pdf"` block:

```tsx
      {open === "card" && (
        <AddSheet
          title={strings.student.deck.addTitle}
          closeLabel={strings.common.close}
          onClose={() => setOpen(null)}
        >
          <AddFlashcardForm
            locale={locale}
            onAdd={onAddFlashcard}
            onDone={() => {
              setOpen(null);
              // The deck is server-rendered, so a refresh is what makes the new
              // card appear rather than a local insert that could disagree
              // with it — the same reason `done()` above refreshes.
              router.push("?tab=deck");
              router.refresh();
            }}
          />
        </AddSheet>
      )}
```

- [ ] **Step 3: Verify**

```bash
npx prisma generate && npm run lint && npm run typecheck && npm test
```

`typecheck` will report that `app/g/[slug]/page.tsx` does not pass `onAddFlashcard`. That is expected and Task 11 fixes it. Any other error is yours.

- [ ] **Step 4: Commit**

```bash
git add components/student/AddFlashcardForm.tsx components/student/ShelfFab.tsx
git commit -m "$(cat <<'EOF'
Let either party add a flashcard from the + menu

Both roles get it, unlike "add a page" which is Jenn's alone: a card is
vocabulary from the lesson and either party writes it down.

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: The checklist

**Files:**
- Create: `components/student/TodoTab.tsx`

No `lib/` module: there is no rule here beyond "creation order", which the query already applies. Adding one would be ceremony.

- [ ] **Step 1: Write it**

Create `components/student/TodoTab.tsx`:

```tsx
"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { fieldClassName } from "@/components/ui/field";
import { cardFocusRing, emptyStateText, formErrorText } from "@/components/card-styles";
import { getStrings } from "@/lib/strings";
import { MAX_ITEM_TEXT } from "@/lib/deck-limits";
import type { Locale } from "@/lib/i18n";
import type { ActionItemRow } from "@/lib/action-items";
import { cn } from "@/lib/utils";

export function TodoTab({
  items,
  studentName,
  locale,
  onAdd,
  onSetDone,
  onDelete,
}: {
  items: ActionItemRow[];
  // The student whose page this is. Needed because the list is SHARED and both
  // parties read it: a relative label like "Me" would be a lie to whichever of
  // them is not the one who added the row.
  studentName: string;
  // See lib/strings.ts: the locale crosses, the dictionary does not.
  locale: Locale;
  onAdd: (text: string) => Promise<void>;
  onSetDone: (id: string, done: boolean) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const strings = getStrings(locale);
  const t = strings.student.todo;
  const router = useRouter();

  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Ids the reader has just ticked or unticked, held until the server catches
  // up. Optimistic: a checkbox that waited for a round trip before moving
  // feels broken on a phone.
  const [pending, setPending] = useState<Record<string, boolean>>({});

  async function add(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onAdd(text);
      setText("");
      router.refresh();
    } catch {
      setError(t.error);
    } finally {
      setSaving(false);
    }
  }

  async function toggle(id: string, done: boolean) {
    setPending((current) => ({ ...current, [id]: done }));
    setError(null);
    try {
      await onSetDone(id, done);
      router.refresh();
    } catch {
      // Put the row back where it was. An optimistic update that silently
      // stuck would tell the reader an item is done when the server disagrees.
      setPending((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
      setError(t.error);
    }
  }

  async function remove(id: string) {
    setError(null);
    try {
      await onDelete(id);
      router.refresh();
    } catch {
      setError(t.error);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[560px]">
      {items.length === 0 ? (
        <p className={emptyStateText}>{t.empty}</p>
      ) : (
        <ul className="mb-5 flex flex-col gap-1">
          {items.map((item) => {
            // The pending value wins while a write is in flight, so the row
            // moves the moment it is pressed.
            const done = pending[item.id] ?? item.doneAt !== null;
            return (
              <li
                key={item.id}
                className="flex items-center gap-3 rounded-xl border border-[var(--card-line)] bg-[var(--card-paper)] px-3 py-2"
              >
                <input
                  type="checkbox"
                  checked={done}
                  onChange={() => void toggle(item.id, !done)}
                  aria-label={t.toggle(item.text)}
                  className={cn("h-5 w-5 shrink-0 accent-[var(--card-bleu)]", cardFocusRing)}
                />

                {/* Struck through IN PLACE. A row that jumped to the bottom the
                    instant it was ticked would make an accidental tick hard to
                    undo, because the row you meant to press is no longer where
                    you pressed. */}
                <span
                  className={cn(
                    "min-w-0 flex-1 font-[family-name:var(--card-font-serif)] text-sm text-[var(--card-ink)]",
                    done && "text-[var(--card-moss)] line-through opacity-70",
                  )}
                >
                  {item.text}
                </span>

                {/* Text, not a colour or an icon: a shared list where you
                    cannot tell who set an item is the thing fromTeacher exists
                    to prevent, and a colour alone says nothing to a screen
                    reader.
                    
                    NAMES, never "me". Both parties read this same list, so a
                    viewer-relative label would tell Jenn that a row the student
                    added was her own. */}
                <span className="shrink-0 text-xs text-[var(--color-ink-muted)]">
                  {item.fromTeacher ? t.byTeacher : studentName}
                </span>

                {/* No confirmation, matching the link tile's own delete: an
                    item is one line of text and re-adding it is retyping it.
                    The flashcard's trash DOES confirm — a card is two fields
                    and a note. */}
                <button
                  type="button"
                  onClick={() => void remove(item.id)}
                  aria-label={t.delete(item.text)}
                  className={cn(
                    "flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--card-moss)] transition-colors duration-150 hover:text-[var(--card-rouge)] motion-reduce:transition-none",
                    cardFocusRing,
                  )}
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* Always visible, at the foot of the list. No FAB and no sheet: the
          request was "easy to add another item", and a two-gesture flow
          through a modal is not that. */}
      <form onSubmit={add} className="flex gap-2">
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={t.addPlaceholder}
          aria-label={t.addPlaceholder}
          // The courtesy; the action is the authority.
          maxLength={MAX_ITEM_TEXT}
          className={cn(fieldClassName, "mt-0 flex-1")}
        />
        <button
          type="submit"
          disabled={saving || text.trim() === ""}
          className={cn(
            "min-h-[44px] shrink-0 rounded-full bg-[var(--card-bleu)] px-5 font-[family-name:var(--card-font-serif)] text-sm text-white transition-opacity duration-150 hover:opacity-90 disabled:opacity-50 motion-reduce:transition-none",
            cardFocusRing,
          )}
        >
          {t.add}
        </button>
      </form>

      {error && (
        <p role="alert" className={cn("mt-3", formErrorText)}>
          {error}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify**

```bash
npx prisma generate && npm run lint && npm run typecheck && npm test
```

Expected: the same `onAddFlashcard` error from Task 9 and nothing new.

- [ ] **Step 3: Commit**

```bash
git add components/student/TodoTab.tsx
git commit -m "$(cat <<'EOF'
Add the shared checklist

Done rows are struck through in place rather than moved to the bottom: a
row that jumps the instant it is ticked makes an accidental tick hard to
undo, because the row you meant to press is no longer where you pressed.

The add field is always visible at the foot of the list — no FAB, no
sheet. The ask was "easy to add another item" and a two-gesture flow
through a modal is not that.

Who added an item is text, not a colour: a colour alone says nothing to
a screen reader, and telling the two apart is what fromTeacher is for.

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Wire both tabs into the page

**Files:**
- Modify: `app/g/[slug]/page.tsx`

**The one thing to get right here.** A server component may pass a **server action** to a client component, because Next serialises it as a reference. It may **not** pass an arbitrary arrow function — that is a closure, and closures do not cross the boundary. So every handler below is a `.bind(null, group.id)` of an action from `app/deck-actions.ts`, never an inline `(id) => …`.

- [ ] **Step 1: Add the imports**

```ts
import { listFlashcards } from "@/lib/flashcards";
import { listActionItems } from "@/lib/action-items";
import { DeckTab } from "@/components/student/DeckTab";
import { TodoTab } from "@/components/student/TodoTab";
import {
  addFlashcard,
  deleteFlashcard,
  markFlashcardViewed,
  addActionItem,
  setActionItemDone,
  deleteActionItem,
} from "@/app/deck-actions";
```

- [ ] **Step 2: Query both lists**

Beside the existing `const boards = unlocked ? await listWhiteboards(group.id) : [];`, add:

```ts
  // Both follow the same rule the shelf and the board already do: fetched only
  // when the visitor is unlocked, because an untokened visitor has neither tab
  // and a query for a list they cannot see is a query for nothing.
  const flashcards = unlocked ? await listFlashcards(group.id) : [];
  const actionItems = unlocked ? await listActionItems(group.id) : [];
```

- [ ] **Step 3: Render the two tabs**

The tab body is a chain of ternaries ending in the `<BoardTab …/>`. Change that final `: (` branch so the chain continues. Find:

```tsx
      ) : (
        <BoardTab
```

and replace with:

```tsx
      ) : tab === "deck" ? (
        <DeckTab
          cards={flashcards}
          isTeacher={viewerIsTeacher}
          locale={locale}
          onDelete={deleteFlashcard.bind(null, group.id)}
          // The bound ACTION, not an arrow — a closure cannot cross the
          // server/client boundary. DeckTab fires it without awaiting, from
          // the handler that makes a card current.
          onViewed={markFlashcardViewed.bind(null, group.id)}
        />
      ) : tab === "todo" ? (
        <TodoTab
          items={actionItems}
          studentName={group.name}
          locale={locale}
          onAdd={addActionItem.bind(null, group.id)}
          onSetDone={setActionItemDone.bind(null, group.id)}
          onDelete={deleteActionItem.bind(null, group.id)}
        />
      ) : (
        <BoardTab
```

- [ ] **Step 4: Give both FABs the new handler**

There are **two** `<ShelfFab …/>` render sites in this file — one inside the `viewerIsTeacher` branch, one inside the student branch. Both need the prop, or the one you miss throws at render:

```tsx
            onAddFlashcard={addFlashcard.bind(null, group.id)}
```

Add it beside the existing `onAddPdf={…}` in each.

- [ ] **Step 5: Verify**

```bash
npx prisma generate && npm run lint && npm run typecheck && npm test
```

Expected: clean but for the known warning. The `onAddFlashcard` error from Task 9 should now be gone.

- [ ] **Step 6: Check the behaviour by hand**

`npm run dev`, then as a signed-in student on `/g/<slug>`:

- Five tabs. On a narrow window the strip scrolls horizontally rather than wrapping or squashing.
- `?tab=deck` shows the empty state. The `+` FAB offers *Ajouter une carte*; add one with a front, a back and a note.
- The tile shows the front and its added date. Open it: the front fills the screen, tapping flips to the back with the note greyed beneath.
- Add three more cards. The arrows and the ← → keys move through them; each new card opens on its front.
- Choose *Aléatoire*. The order changes. Press it again — it changes again. Open a card, close it, and confirm the order has not moved.
- Choose *À réviser*. Cards you have never opened come first.
- Delete a card from the viewer: it asks first, then moves to the next card, and closes if it was the last.
- `?tab=todo`: add an item with the field at the foot, tick it (it strikes through in place, it does not jump), untick it, delete it.
- Reload and confirm everything persisted.

Then as the teacher, opening the same student from `/admin`:

- Both tabs are present. She can add a card and an item; her items read *Jenn*.
- **Open a card as Jenn, then check the database:** `lastViewedAt` must not have changed. That is the rule this feature is built around and the only way to see it is to look.

```bash
sqlite3 prisma/dev.db "select id, front, lastViewedAt from Flashcard;"
```

- [ ] **Step 7: Commit**

```bash
git add "app/g/[slug]/page.tsx"
git commit -m "$(cat <<'EOF'
Put the deck and the checklist on the student page

Every handler is a bound server action rather than an inline arrow: a
closure cannot cross the server/client boundary, and the failure is a
runtime error rather than a type one.

Both lists are fetched only when the visitor is unlocked, the rule the
shelf and the board already follow.

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Record the reasoning, and verify the whole thing

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the routes table**

In `CLAUDE.md`'s routes table, in the `/g/[slug]` row, append to the notes:

```
Two more tabs as of 2026-08-07, both gated on `unlocked` like Files and Whiteboard. **Vocabulaire** is a deck of two-sided cards either party may add and delete, opened in a full-screen overlay that reuses the daily card's flip; it sorts by Ajout, Aléatoire or À réviser (`lib/flashcard-order.ts`). It is called *Vocabulaire* and not *Les cartes* because the daily-card tab is *La carte* and two adjacent tabs one letter apart is a trap. **À faire** is one shared checklist — either party adds, ticks and deletes, and a done row is struck through **in place** rather than moved, so an accidental tick is easy to undo. Both use `chatRole`, so the everyone group has neither. The tab strip scrolls horizontally now: three tabs fit a phone and five do not
```

- [ ] **Step 2: Record the write-on-read**

`CLAUDE.md`'s Conventions section holds the rules that must be visible without opening a subsystem file. Add a bullet:

```
- **`markFlashcardViewed` is the only write-on-read in this codebase**, and it
  is refused for the teacher. A card sits on one student's deck but two people
  can open it, so if Jenn's browsing stamped `lastViewedAt`, flicking through a
  deck would tell that student's app they had revised everything — and the
  cards they are struggling with would drop off the top of the list that exists
  to surface them. It also does not `revalidatePath`: the caller fires it
  without awaiting, and a revalidation would reorder the deck under a reader
  mid-flip.
```

- [ ] **Step 3: Run the full CI order, including the build**

```bash
npx prisma generate && npm run lint && npm run typecheck && npm test && npm run build
```

Expected:
- `eslint .` reports exactly one warning, `lib/snapshot-dom.ts:77 'e' is defined but never used`. **Any other warning or error is yours.**
- `tsc --noEmit` prints nothing.
- Vitest passes every file: 1112 before this plan, plus 10 for `flashcard-order` and 6 added to `student-tab` — expect **1128**.
- `next build` completes. **It fetches Fraunces and Inter from `fonts.googleapis.com`**, so it needs network access; a sandbox that blocks that host fails with `Failed to fetch 'Fraunces' from Google Fonts`, which is not a code fault.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "$(cat <<'EOF'
Record the deck, the checklist and the write-on-read

The write-on-read goes in the always-loaded conventions rather than a
subsystem file: it is the only one in this codebase, and a rule that
says "this is the exception" has to be visible without opening the file
that contains it.

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 5: Final check of the branch**

```bash
git log --oneline main..HEAD
git diff --stat main..HEAD
```

Expected: twelve commits plus the spec. No file outside the File Structure table should appear.

---

## Done means

- `npm run lint`, `npm run typecheck`, `npm test` and `npm run build` all pass, with only the one pre-existing lint warning.
- A signed-in student sees five tabs and the strip scrolls on a phone.
- Either party can add a card, open it full screen, flip it, page through the deck and delete one with a confirmation.
- The three sorts work, Random reshuffles when re-chosen and holds still otherwise, and never-opened cards lead À réviser.
- Opening a card as the student stamps `lastViewedAt`; opening it as Jenn does not.
- Either party can add, tick, untick and delete a checklist item, and a ticked row stays where it is.
