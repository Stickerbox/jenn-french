# Teacher-Authored Card Sections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the fixed back of the flashcard into an ordered list of sections the teacher names, writes, reorders and deletes herself.

**Architecture:** A nullable `sections Json` column on both card tables holds `[{title, body}]` in display order. All the logic that can be wrong — reading an untyped column, normalising on save, moving a section, seeding a new card, backfilling the old columns, and deciding whether a body should render as an idiom box — lives in one pure module, `lib/sections.ts`, with tests. The four existing columns are backfilled and then left alone, so a bad outcome is fixed by deploying the previous commit rather than restoring a database.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript 5 strict, Tailwind v4, Prisma 6 + SQLite, Vitest (node environment), `@anthropic-ai/sdk` on `claude-sonnet-5`.

**Spec:** `docs/superpowers/specs/2026-07-27-card-sections-design.md`

## Global Constraints

- **Do not drop, rename or stop populating `examples`, `pronunciation`, `tip` or `idiom`.** They are the rollback path. Prisma's `update` only writes the fields you pass, so update payloads must omit them entirely.
- `sections` is `Json?` — nullable — so the migration touches no existing row.
- **Every read of `sections` goes through `readSections`.** Prisma types a Json column as `JsonValue`; nothing else may assume its shape.
- Section order is array order. There is no `position` field.
- Vitest runs `environment: "node"` with `globals: true`. There is no React Testing Library and no HTTP mocking layer — **do not add either**. Only pure functions get unit tests.
- Every new module uses the `@/` path alias.
- TypeScript is `strict` with `isolatedModules: true` — type-only imports use `import type`.
- Reordering is `↑`/`↓` buttons. **Do not add a drag-and-drop dependency.**
- Claude is never asked for the Québec pronunciation.
- Commit after every task. Do not push.

### Expected build breakage

Task 3 changes `CardInput` and `CardContent`. Four files consume the removed fields: `components/admin/CardEditor.tsx` (Task 5), `components/Flashcard.tsx` (Task 6), `lib/card-suggestions.ts` and `tests/lib/card-suggestions.test.ts` (both Task 4). **`npm run typecheck` therefore fails from Task 3 until Task 6 completes.** Each affected task states exactly which files it expects to see; a file outside that list is a real finding, not noise.

---

### Task 1: The sections module

Every piece of logic that can be quietly wrong. Pure, no imports.

**Files:**
- Create: `lib/sections.ts`
- Test: `tests/lib/sections.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `export type CardSection = { title: string; body: string }`
  - `export const PRONUNCIATION_TITLE: string`
  - `export function readSections(value: unknown): CardSection[]`
  - `export function normaliseSections(sections: CardSection[]): CardSection[]`
  - `export function moveSection(sections: CardSection[], index: number, direction: -1 | 1): CardSection[]`
  - `export function seedSections(grammar: string, idiom: string): CardSection[]`
  - `export function backfillSections(card: { examples: string | null; pronunciation: string | null; tip: string | null; idiom: string | null }): CardSection[]`
  - `export function isExpressionBody(body: string): boolean`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/sections.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  readSections,
  normaliseSections,
  moveSection,
  seedSections,
  backfillSections,
  isExpressionBody,
  PRONUNCIATION_TITLE,
  type CardSection,
} from "@/lib/sections";

const s = (title: string, body: string): CardSection => ({ title, body });

describe("readSections", () => {
  it("returns an empty list for null or undefined", () => {
    expect(readSections(null)).toEqual([]);
    expect(readSections(undefined)).toEqual([]);
  });

  it("returns an empty list for a value that is not an array", () => {
    expect(readSections("Grammar")).toEqual([]);
    expect(readSections({ title: "Grammar", body: "x" })).toEqual([]);
    expect(readSections(42)).toEqual([]);
  });

  it("reads a well-formed array", () => {
    expect(readSections([{ title: "Grammar", body: "x" }])).toEqual([
      s("Grammar", "x"),
    ]);
  });

  it("drops malformed entries but keeps the good ones", () => {
    expect(
      readSections([
        { title: "Grammar", body: "x" },
        null,
        "nope",
        { title: "no body" },
        { title: 7, body: "wrong type" },
        { title: "Tip", body: "y" },
      ]),
    ).toEqual([s("Grammar", "x"), s("Tip", "y")]);
  });

  it("ignores extra properties rather than carrying them through", () => {
    expect(readSections([{ title: "A", body: "b", position: 3 }])).toEqual([
      s("A", "b"),
    ]);
  });
});

describe("normaliseSections", () => {
  it("trims titles and bodies", () => {
    expect(normaliseSections([s("  Grammar  ", "  x  ")])).toEqual([
      s("Grammar", "x"),
    ]);
  });

  it("drops sections that are blank in both fields", () => {
    expect(normaliseSections([s("A", "b"), s("", ""), s("  ", "  ")])).toEqual([
      s("A", "b"),
    ]);
  });

  it("keeps a section with a title and no body", () => {
    expect(normaliseSections([s("Register", "")])).toEqual([s("Register", "")]);
  });

  it("keeps a section with a body and no title", () => {
    expect(normaliseSections([s("", "orphan text")])).toEqual([
      s("", "orphan text"),
    ]);
  });

  it("does not mutate its argument", () => {
    const input = [s(" A ", " b ")];
    normaliseSections(input);
    expect(input).toEqual([s(" A ", " b ")]);
  });
});

describe("moveSection", () => {
  const three = [s("A", ""), s("B", ""), s("C", "")];

  it("moves a section up", () => {
    expect(moveSection(three, 1, -1).map((x) => x.title)).toEqual([
      "B",
      "A",
      "C",
    ]);
  });

  it("moves a section down", () => {
    expect(moveSection(three, 1, 1).map((x) => x.title)).toEqual([
      "A",
      "C",
      "B",
    ]);
  });

  it("is a no-op at the top", () => {
    expect(moveSection(three, 0, -1)).toEqual(three);
  });

  it("is a no-op at the bottom", () => {
    expect(moveSection(three, 2, 1)).toEqual(three);
  });

  it("is a no-op for an index outside the list", () => {
    expect(moveSection(three, 9, -1)).toEqual(three);
    expect(moveSection(three, -1, 1)).toEqual(three);
  });

  it("does not mutate its argument", () => {
    moveSection(three, 1, -1);
    expect(three.map((x) => x.title)).toEqual(["A", "B", "C"]);
  });
});

describe("seedSections", () => {
  it("produces Grammar, an empty pronunciation, and the idiom in order", () => {
    expect(seedSections("g", "i")).toEqual([
      s("Grammar", "g"),
      s(PRONUNCIATION_TITLE, ""),
      s("Idiom of the day", "i"),
    ]);
  });
});

describe("backfillSections", () => {
  it("maps all four columns in render order", () => {
    expect(
      backfillSections({
        examples: "g",
        pronunciation: "p",
        tip: "t",
        idiom: "i",
      }),
    ).toEqual([
      s("Grammar", "g"),
      s(PRONUNCIATION_TITLE, "p"),
      s("Tip", "t"),
      s("Idiom of the day", "i"),
    ]);
  });

  it("skips blank and null columns", () => {
    expect(
      backfillSections({
        examples: "g",
        pronunciation: null,
        tip: "   ",
        idiom: "i",
      }),
    ).toEqual([s("Grammar", "g"), s("Idiom of the day", "i")]);
  });

  it("returns an empty list when every column is empty", () => {
    expect(
      backfillSections({
        examples: "",
        pronunciation: null,
        tip: null,
        idiom: null,
      }),
    ).toEqual([]);
  });
});

describe("isExpressionBody", () => {
  it("is true for the expression-and-meaning shape", () => {
    expect(isExpressionBody("**sur la galerie** — on the porch")).toBe(true);
    expect(isExpressionBody("**être à boutte** - exhausted")).toBe(true);
    expect(isExpressionBody("**avoir de la misère** – a hard time")).toBe(true);
  });

  it("is false for prose that merely contains bold", () => {
    expect(
      isExpressionBody("être → **j'étais**, faire → **faisait**."),
    ).toBe(false);
  });

  it("is false for a bold expression with no meaning after it", () => {
    expect(isExpressionBody("**pantoute**")).toBe(false);
  });

  it("is false for an empty body", () => {
    expect(isExpressionBody("")).toBe(false);
    expect(isExpressionBody("   ")).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/lib/sections.test.ts`
Expected: FAIL — cannot resolve `@/lib/sections`.

- [ ] **Step 3: Write the implementation**

Create `lib/sections.ts`:

```ts
export type CardSection = { title: string; body: string };

export const PRONUNCIATION_TITLE = "Québec Pronunciation";

// Prisma types a Json column as JsonValue, which is to say it does not type it
// at all. Everything read from the database comes through here, so a
// hand-edited row or a half-finished migration produces a card with missing
// sections rather than a student page that throws.
export function readSections(value: unknown): CardSection[] {
  if (!Array.isArray(value)) return [];

  const sections: CardSection[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;
    const { title, body } = entry as Record<string, unknown>;
    if (typeof title !== "string" || typeof body !== "string") continue;
    sections.push({ title, body });
  }
  return sections;
}

// A section blank in both fields is the editor's trailing placeholder, or one
// the teacher started and abandoned. Neither should reach the database. A
// section with only a title is kept: she is writing the heading first.
export function normaliseSections(sections: CardSection[]): CardSection[] {
  return sections
    .map((section) => ({
      title: section.title.trim(),
      body: section.body.trim(),
    }))
    .filter((section) => section.title !== "" || section.body !== "");
}

export function moveSection(
  sections: CardSection[],
  index: number,
  direction: -1 | 1,
): CardSection[] {
  const target = index + direction;
  if (index < 0 || index >= sections.length) return sections;
  if (target < 0 || target >= sections.length) return sections;

  const next = [...sections];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

// Pronunciation is seeded empty rather than fixed: it is on every new card so
// the teacher never has to create it, but it is an ordinary section she can
// rename, move or delete on any given card.
export function seedSections(grammar: string, idiom: string): CardSection[] {
  return [
    { title: "Grammar", body: grammar },
    { title: PRONUNCIATION_TITLE, body: "" },
    { title: "Idiom of the day", body: idiom },
  ];
}

// The order here is the order these four fields render in today, so a card
// written before sections existed looks exactly as it did.
export function backfillSections(card: {
  examples: string | null;
  pronunciation: string | null;
  tip: string | null;
  idiom: string | null;
}): CardSection[] {
  const columns: [string, string | null][] = [
    ["Grammar", card.examples],
    [PRONUNCIATION_TITLE, card.pronunciation],
    ["Tip", card.tip],
    ["Idiom of the day", card.idiom],
  ];

  return columns
    .filter(([, body]) => body !== null && body.trim() !== "")
    .map(([title, body]) => ({ title, body: (body as string).trim() }));
}

// Drives the idiom box on the student card. Keyed to the shape of the text
// rather than the section's title, so the styling survives the teacher
// renaming or moving the section — and she can get it on any section.
const EXPRESSION_SHAPE = /^\s*\*\*[^*]+\*\*\s*[—–-]\s*\S/;

export function isExpressionBody(body: string): boolean {
  return EXPRESSION_SHAPE.test(body);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/lib/sections.test.ts`
Expected: PASS, 24 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/sections.ts tests/lib/sections.test.ts
git commit -m "feat: add the card sections module"
```

---

### Task 2: Schema, migration and backfill

Adds the column and fills it. Nothing reads it yet, so this task is safe to deploy on its own.

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<generated>/migration.sql` (by the CLI)
- Create: `scripts/backfill-sections.mjs`

**Interfaces:**
- Consumes: `backfillSections`, `readSections` from Task 1.
- Produces: a `sections` column on `GlobalCard` and `Card`.

- [ ] **Step 1: Add the column to both models**

In `prisma/schema.prisma`, add one line to `model GlobalCard`, after `idiom`:

```prisma
  sections      Json?
```

And the identical line to `model Card`, after its `idiom` field.

Change nothing else. The four existing columns stay exactly as they are — they are the rollback path.

- [ ] **Step 2: Generate the migration**

Run: `npx prisma migrate dev --name add_card_sections`
Expected: a new directory under `prisma/migrations/`, and `Your database is now in sync with your schema.`

- [ ] **Step 3: Confirm the migration only adds columns**

Run: `cat prisma/migrations/*add_card_sections/migration.sql`
Expected: `ALTER TABLE` statements adding `sections` to both tables, and **no `DROP`**. If a table rebuild appears, stop — something else changed.

- [ ] **Step 4: Write the backfill script**

Create `scripts/backfill-sections.mjs`:

```js
// One-off, run once per environment after the migration. Idempotent: a card
// that already has sections is skipped, so re-running is safe.
import { PrismaClient } from "@prisma/client";
import { backfillSections, readSections } from "../lib/sections.ts";

const prisma = new PrismaClient();

async function backfill(name, findMany, update) {
  const cards = await findMany();
  let filled = 0;
  let skipped = 0;

  for (const card of cards) {
    if (readSections(card.sections).length > 0) {
      skipped += 1;
      continue;
    }
    const sections = backfillSections(card);
    await update(card.id, sections);
    filled += 1;
  }

  console.log(`${name}: ${filled} filled, ${skipped} already had sections`);
}

await backfill(
  "GlobalCard",
  () => prisma.globalCard.findMany(),
  (id, sections) => prisma.globalCard.update({ where: { id }, data: { sections } }),
);

await backfill(
  "Card",
  () => prisma.card.findMany(),
  (id, sections) => prisma.card.update({ where: { id }, data: { sections } }),
);

await prisma.$disconnect();
```

- [ ] **Step 5: Run the backfill locally**

Run: `npx tsx scripts/backfill-sections.mjs`

If `tsx` is not installed, run `npx --yes tsx scripts/backfill-sections.mjs`. It is needed only because the script imports a `.ts` module; do not add it as a project dependency.

Expected: two lines reporting counts, no errors.

- [ ] **Step 6: Verify a card round-trips**

Run:

```bash
node -e '
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
(async () => {
  const c = await p.globalCard.findFirst({ orderBy: { date: "desc" } });
  console.log(JSON.stringify(c?.sections, null, 2));
  await p.$disconnect();
})();
'
```

Expected: an array of `{title, body}` objects, in the order Grammar → Québec Pronunciation → Tip → Idiom of the day, skipping whichever were blank.

- [ ] **Step 7: Run the suite**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all pass. Nothing reads the new column yet.

- [ ] **Step 8: Commit**

```bash
git add prisma/schema.prisma prisma/migrations scripts/backfill-sections.mjs
git commit -m "feat: add a sections column and backfill it

The four existing columns are left populated and untouched: they are the
rollback path if the new shape misbehaves in production."
```

---

### Task 3: Carry sections through the data layer

**Files:**
- Modify: `app/actions.ts`
- Modify: `lib/cards.ts`
- Modify: `lib/card-resolution.ts`
- Modify: `tests/lib/card-resolution.test.ts` — its `makeCard` helper builds a `CardContent` and must follow the type

**Interfaces:**
- Consumes: `CardSection`, `readSections`, `normaliseSections` from Task 1.
- Produces:
  - `CardInput` gains `sections: CardSection[]` and loses `pronunciation`, `examples`, `tip`, `idiom`
  - `CardContent` gains `sections: CardSection[]`
  - `toCardFormValues` returns `sections`

- [ ] **Step 1: Change `CardInput` and the upsert payloads**

In `app/actions.ts`, replace the `CardInput` type and `toCardData` with:

```ts
export type CardInput = {
  date: string; // YYYY-MM-DD
  subject: string;
  usage: string;
  englishPrompt: string;
  hint: string;
  frenchAnswer: string;
  sections: CardSection[];
};

// Split in two on purpose. `update` omits examples/pronunciation/tip/idiom
// entirely, so Prisma leaves those columns exactly as the backfill left them —
// which is what makes them a usable rollback path. `create` has to supply
// `examples` because the column is non-nullable.
function toCreateData(input: CardInput) {
  return {
    subject: input.subject || null,
    usage: input.usage || null,
    englishPrompt: input.englishPrompt,
    hint: input.hint || null,
    frenchAnswer: input.frenchAnswer,
    examples: "",
    sections: normaliseSections(input.sections),
  };
}

function toUpdateData(input: CardInput) {
  return {
    subject: input.subject || null,
    usage: input.usage || null,
    englishPrompt: input.englishPrompt,
    hint: input.hint || null,
    frenchAnswer: input.frenchAnswer,
    sections: normaliseSections(input.sections),
  };
}
```

Add to the imports at the top of the file:

```ts
import { normaliseSections, type CardSection } from "@/lib/sections";
```

- [ ] **Step 2: Point both upserts at the new payloads**

In `upsertGlobalCard`, replace the `prisma.globalCard.upsert` call's data with:

```ts
  await prisma.globalCard.upsert({
    where: { date },
    create: { date, ...toCreateData(input) },
    update: toUpdateData(input),
  });
```

And in `upsertOverrideCard`:

```ts
  await prisma.card.upsert({
    where: { groupId_date: { groupId, date } },
    create: { groupId, date, ...toCreateData(input) },
    update: toUpdateData(input),
  });
```

- [ ] **Step 3: Read sections back in `lib/cards.ts`**

Replace `StoredCardFields` and `toCardFormValues` with:

```ts
type StoredCardFields = {
  subject: string | null;
  usage: string | null;
  englishPrompt: string;
  hint: string | null;
  frenchAnswer: string;
  sections: unknown;
};

export function toCardFormValues(
  card: StoredCardFields | null,
): Partial<CardInput> {
  if (!card) return {};
  return {
    subject: card.subject ?? "",
    usage: card.usage ?? "",
    englishPrompt: card.englishPrompt,
    hint: card.hint ?? "",
    frenchAnswer: card.frenchAnswer,
    sections: readSections(card.sections),
  };
}
```

And add to that file's imports:

```ts
import { readSections } from "@/lib/sections";
```

- [ ] **Step 4: Add sections to `CardContent`**

In `lib/card-resolution.ts`, replace the `CardContent` type with:

```ts
export type CardContent = {
  date: Date;
  subject: string | null;
  usage: string | null;
  englishPrompt: string;
  hint: string | null;
  frenchAnswer: string;
  sections: CardSection[];
};
```

And add:

```ts
import type { CardSection } from "@/lib/sections";
```

- [ ] **Step 5: Map the row to `CardContent` in `getEffectiveCard`**

In `lib/cards.ts`, `getEffectiveCard` currently returns the Prisma row straight through `pickEffectiveCard`. The row's `sections` is `JsonValue`, so it has to be read first. Replace the body of `getEffectiveCard` with:

```ts
export async function getEffectiveCard(
  groupId: string,
  date: Date,
): Promise<CardContent | null> {
  const [override, fallback] = await Promise.all([
    prisma.card.findUnique({ where: { groupId_date: { groupId, date } } }),
    prisma.globalCard.findUnique({ where: { date } }),
  ]);

  const toContent = (row: typeof override | typeof fallback): CardContent | null =>
    row === null
      ? null
      : {
          date: row.date,
          subject: row.subject,
          usage: row.usage,
          englishPrompt: row.englishPrompt,
          hint: row.hint,
          frenchAnswer: row.frenchAnswer,
          sections: readSections(row.sections),
        };

  return pickEffectiveCard(toContent(override), toContent(fallback));
}
```

- [ ] **Step 6: Type-check**

Run: `npm run typecheck`
Expected: **FAIL**, in exactly four files: `components/admin/CardEditor.tsx` (Task 5), `components/Flashcard.tsx` (Task 6), `lib/card-suggestions.ts` and `tests/lib/card-suggestions.test.ts` (both Task 4). Confirm no other file is named.

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/actions.ts lib/cards.ts lib/card-resolution.ts
git commit -m "feat: carry card sections through the data layer

Create and update payloads are split so update omits the four old columns,
leaving the backfilled values intact as a rollback path."
```

---

### Task 4: Claude writes three fields, not five

**Files:**
- Modify: `lib/card-ai.ts`
- Modify: `lib/card-suggestions.ts`

**Interfaces:**
- Consumes: `seedSections` from Task 1; `CardInput` from Task 3.
- Produces: `CardSuggestion` becomes `{ hint: string; grammar: string; idiom: string }`.

- [ ] **Step 1: Narrow the suggestion shape and seed sections from it**

Replace the whole of `lib/card-suggestions.ts` with:

```ts
import type { CardInput } from "@/app/actions";
import { seedSections } from "@/lib/sections";

// The three fields Claude writes. The Québec pronunciation is deliberately
// absent — the teacher writes it, and leaving it out of this type means there
// is no shape in which a generated value could reach the form.
export type CardSuggestion = {
  hint: string;
  grammar: string;
  idiom: string;
};

export function applySuggestion(
  values: CardInput,
  suggestion: CardSuggestion,
): CardInput {
  return {
    ...values,
    hint: suggestion.hint,
    sections: seedSections(suggestion.grammar, suggestion.idiom),
  };
}
```

- [ ] **Step 2: Update the existing suggestion test**

Replace the whole of `tests/lib/card-suggestions.test.ts` with:

```ts
import { describe, it, expect } from "vitest";
import { applySuggestion, type CardSuggestion } from "@/lib/card-suggestions";
import { PRONUNCIATION_TITLE } from "@/lib/sections";
import type { CardInput } from "@/app/actions";

const composed: CardInput = {
  date: "2026-07-27",
  subject: "Imparfait",
  usage: "",
  englishPrompt: "I used to pack a lunch every day",
  hint: "",
  frenchAnswer: "Je faisais un lunch chaque jour",
  sections: [],
};

const suggestion: CardSuggestion = {
  hint: "Think **every day** — a repeated habit.",
  grammar: "faire → **faisait**.",
  idiom: "**se pogner le beigne** — to laze about",
};

describe("applySuggestion", () => {
  it("sets the hint", () => {
    expect(applySuggestion(composed, suggestion).hint).toBe(suggestion.hint);
  });

  it("seeds three sections in order", () => {
    expect(
      applySuggestion(composed, suggestion).sections.map((s) => s.title),
    ).toEqual(["Grammar", PRONUNCIATION_TITLE, "Idiom of the day"]);
  });

  it("puts Claude's text in Grammar and Idiom, and leaves pronunciation empty", () => {
    const [grammar, pronunciation, idiom] = applySuggestion(
      composed,
      suggestion,
    ).sections;
    expect(grammar.body).toBe(suggestion.grammar);
    expect(pronunciation.body).toBe("");
    expect(idiom.body).toBe(suggestion.idiom);
  });

  it("carries the teacher's fields through untouched", () => {
    const result = applySuggestion(composed, suggestion);
    expect(result.date).toBe("2026-07-27");
    expect(result.subject).toBe("Imparfait");
    expect(result.englishPrompt).toBe(composed.englishPrompt);
    expect(result.frenchAnswer).toBe(composed.frenchAnswer);
  });

  it("does not mutate the values it was given", () => {
    applySuggestion(composed, suggestion);
    expect(composed.hint).toBe("");
    expect(composed.sections).toEqual([]);
  });
});
```

- [ ] **Step 3: Narrow the Claude schema**

In `lib/card-ai.ts`, replace `SUGGESTION_SCHEMA` with:

```ts
const SUGGESTION_SCHEMA = {
  type: "object",
  properties: {
    hint: { type: "string" },
    grammar: { type: "string" },
    idiom: { type: "string" },
  },
  required: ["hint", "grammar", "idiom"],
  additionalProperties: false,
};
```

- [ ] **Step 4: Update the prompt**

In `lib/card-ai.ts`, in `SYSTEM_PROMPT`: change the line

```
You return exactly five fields. You never write the subject or the usage field — those belong to the teacher.
```

to

```
You return exactly three fields. You never write the subject, the usage field, or the Quebec pronunciation — those belong to the teacher.
```

Then delete the whole `pronunciation — ...` paragraph and its example line, and the whole `tip — ...` paragraph. Rename the `examples — ` field heading to `grammar — `, leaving its instruction text unchanged. Leave the `hint` and `idiom` paragraphs, the FORMATTING block, and the closing "Every field must be a complete, finished sentence" line exactly as they are.

- [ ] **Step 5: Run the suite**

Run: `npm test`
Expected: PASS. The suggestion tests now exercise the new shape.

Run: `npm run lint`
Expected: PASS.

Run: `npm run typecheck`
Expected: **FAIL**, now in exactly two files — `components/admin/CardEditor.tsx` (Task 5) and `components/Flashcard.tsx` (Task 6). The two `card-suggestions` files you just rewrote must be gone from the list.

- [ ] **Step 6: Commit**

```bash
git add lib/card-ai.ts lib/card-suggestions.ts tests/lib/card-suggestions.test.ts
git commit -m "feat: Claude writes hint, grammar and idiom only

The Quebec pronunciation is now the teacher's. Dropping it also removes the
longest and most error-prone instruction in the prompt."
```

---

### Task 5: The section editor

**Files:**
- Create: `components/admin/SectionEditor.tsx`
- Modify: `components/admin/CardEditor.tsx`

**Interfaces:**
- Consumes: `CardSection`, `moveSection` from Task 1.
- Produces: `export function SectionEditor({ sections, onChange }: { sections: CardSection[]; onChange: (sections: CardSection[]) => void })`

- [ ] **Step 1: Write the component**

Create `components/admin/SectionEditor.tsx`:

```tsx
"use client";

import { EditableText } from "@/components/admin/EditableText";
import { cardSectionHeading } from "@/components/card-styles";
import { moveSection, type CardSection } from "@/lib/sections";
import { cn } from "@/lib/utils";

const controlClass =
  "px-1.5 text-xs text-[var(--color-ink-muted)] transition-opacity hover:opacity-70 disabled:opacity-25";

export function SectionEditor({
  sections,
  onChange,
}: {
  sections: CardSection[];
  onChange: (sections: CardSection[]) => void;
}) {
  // The trailing entry is the placeholder. It lives in the rendered list but
  // not in `sections`, so it cannot be saved and cannot be reordered; typing
  // into it appends a real section and a fresh placeholder takes its place.
  const rows = [...sections, { title: "", body: "" }];

  function update(index: number, patch: Partial<CardSection>) {
    const next = rows.map((row, i) => (i === index ? { ...row, ...patch } : row));
    // Drop a trailing placeholder the teacher has not touched.
    const last = next[next.length - 1];
    if (last.title === "" && last.body === "") next.pop();
    onChange(next);
  }

  return (
    <div className="flex flex-col gap-4">
      {rows.map((section, index) => {
        const isPlaceholder = index === sections.length;

        return (
          <div
            key={index}
            className={cn(
              "rounded-lg p-3",
              isPlaceholder &&
                "border border-dashed border-[var(--card-rouge)]/60",
            )}
          >
            <div className="mb-1 flex items-center justify-between gap-2">
              <EditableText
                value={section.title}
                onChange={(v) => update(index, { title: v })}
                placeholder={isPlaceholder ? "Add new section" : "Section title"}
                ariaLabel={
                  isPlaceholder ? "New section title" : `${section.title} title`
                }
                className={cn(cardSectionHeading, "mb-0")}
              />

              {!isPlaceholder && (
                <div className="flex shrink-0 items-center">
                  <button
                    type="button"
                    aria-label={`Move ${section.title} up`}
                    disabled={index === 0}
                    onClick={() => onChange(moveSection(sections, index, -1))}
                    className={controlClass}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${section.title} down`}
                    disabled={index === sections.length - 1}
                    onClick={() => onChange(moveSection(sections, index, 1))}
                    className={controlClass}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${section.title}`}
                    onClick={() =>
                      onChange(sections.filter((_, i) => i !== index))
                    }
                    className={controlClass}
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>

            <EditableText
              value={section.body}
              onChange={(v) => update(index, { body: v })}
              placeholder={isPlaceholder ? "" : "Section text"}
              ariaLabel={
                isPlaceholder ? "New section text" : `${section.title} text`
              }
              multiline
              className="text-[15px] leading-relaxed text-[var(--card-ink)]"
            />
          </div>
        );
      })}
    </div>
  );
}
```

Every button carries `type="button"`: these render inside the editor's `<form>`, where the HTML default is `type="submit"` and would save the card instead.

- [ ] **Step 2: Replace the four fixed blocks in `CardEditor.tsx`**

In `components/admin/CardEditor.tsx`, delete the four blocks in the back panel — the `card.examples` Grammar block, the Québec Pronunciation block, the Tip block, and the Idiom of the day block — that is, everything after the `frenchAnswer` `EditableText` and before the closing `</div>` of the back panel. Replace all four with:

```tsx
            <SectionEditor
              sections={values.sections}
              onChange={(sections) => update("sections", sections)}
            />
```

- [ ] **Step 3: Fix the state initialiser and imports**

In the same file, the `useState<CardInput>` initialiser lists the removed fields. Replace those four lines — `pronunciation`, `examples`, `tip`, `idiom` — with one:

```tsx
    sections: initialValues?.sections ?? [],
```

Add to the imports:

```tsx
import { SectionEditor } from "@/components/admin/SectionEditor";
```

Then remove `cardSectionHeading` from the `@/components/card-styles` import list if nothing else in the file uses it, and remove any now-unused import that `npm run lint` reports.

- [ ] **Step 4: Fix the blank-values object in `handleDelete`**

In the same file, `handleDelete` resets `values` to a blank card listing every field. Replace its four removed fields with `sections: []`, leaving `date: values.date` as it is.

- [ ] **Step 5: Type-check and lint**

Run: `npm run typecheck`
Expected: **FAIL**, now only in `components/Flashcard.tsx`. `CardEditor.tsx` must no longer appear.

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add components/admin/SectionEditor.tsx components/admin/CardEditor.tsx
git commit -m "feat: edit the back of the card as a list of sections

A dashed placeholder sits below the last section; typing in it makes it real
and a new placeholder appears. Blank sections never reach the database."
```

---

### Task 6: Render sections on the student card

**Files:**
- Modify: `components/Flashcard.tsx`

**Interfaces:**
- Consumes: `CardSection`, `isExpressionBody` from Task 1; `splitIdiom` from the existing `lib/idiom.ts`; `CardContent.sections` from Task 3.
- Produces: nothing later tasks consume.

- [ ] **Step 1: Replace the four fixed blocks**

In `components/Flashcard.tsx`, delete the four blocks — `card.examples`, `card.pronunciation`, `card.tip` and `card.idiom` — and replace all four with:

```tsx
            {card.sections
              .filter((section) => section.body.trim() !== "")
              .map((section, index) => (
                <div key={index} className="mb-4 last:mb-0">
                  {section.title && (
                    <h4 className={cardSectionHeading}>{section.title}</h4>
                  )}
                  {isExpressionBody(section.body) ? (
                    <div className="rounded-r-lg border-l-[3px] border-[var(--card-or)] bg-[#fbf1e2] p-3.5">
                      {(() => {
                        const { expression, meaning } = splitIdiom(section.body);
                        return (
                          <>
                            {expression && (
                              <div className="font-[family-name:var(--card-font-serif)] text-[19px] italic leading-snug text-[var(--card-rouge)]">
                                <InlineMarkup text={expression} />
                              </div>
                            )}
                            {meaning && (
                              <div className="mt-1 whitespace-pre-line font-[family-name:var(--card-font-serif)] text-[15px] leading-relaxed text-[var(--card-ink)]">
                                <InlineMarkup text={meaning} />
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  ) : (
                    <p className={cardProse}>
                      <InlineMarkup text={section.body} />
                    </p>
                  )}
                </div>
              ))}
```

A section with an empty body is skipped, so a seeded Québec Pronunciation the teacher has not filled in shows students nothing rather than a bare heading.

- [ ] **Step 2: Update the imports**

Add to `components/Flashcard.tsx`:

```tsx
import { isExpressionBody } from "@/lib/sections";
```

`splitIdiom`, `InlineMarkup`, `cardProse` and `cardSectionHeading` are already imported. Remove any import `npm run lint` now reports as unused.

- [ ] **Step 3: Type-check, lint, test**

Run: `npm run typecheck`
Expected: **PASS.** The breakage opened in Task 3 is now closed.

Run: `npm run lint && npm test`
Expected: PASS, 80 tests (55 before this plan, plus 24 in Task 1, plus one net in Task 4).

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: PASS. If Apple Silicon SWC bindings fail, use `npm run build -- --webpack`.

- [ ] **Step 5: Commit**

```bash
git add components/Flashcard.tsx
git commit -m "feat: render the card back from its sections

A body shaped **expression** — meaning renders in the idiom box, keyed to the
text rather than the section title so it survives a rename."
```

---

### Task 7: Verify in the browser, then deploy

Nothing above exercises a browser, and this is the first change to alter the production schema.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`
Then sign in at `http://localhost:3000/login`.

- [ ] **Step 2: Check an existing card is unchanged**

Open `/g/all`. A card written before this change must render exactly as it did: same sections, same order, the idiom still in its gold box.

- [ ] **Step 3: Check the editor**

On `/admin`, open a date that has a card:

1. The back shows its sections, each with ↑ ↓ ✕.
2. The first section's ↑ and the last section's ↓ are disabled.
3. ↑ and ↓ reorder; ✕ removes.
4. A dashed red section sits at the bottom, placeholder "Add new section".
5. Typing a title into it removes the dashes and a new dashed one appears below.
6. Save, reload: the order is kept and no empty section was stored.

- [ ] **Step 4: Check generation**

On a date with no card, fill the three compose fields and press Generate. Expect exactly three sections — **Grammar** with content, **Québec Pronunciation** empty, **Idiom of the day** with content — in that order, plus the dashed placeholder. Confirm Claude wrote nothing into the pronunciation.

- [ ] **Step 5: Check the student view**

Save that card and open `/g/all` for its date. The empty Québec Pronunciation must not appear. Rename "Idiom of the day" to something else and confirm it still renders in the gold box.

- [ ] **Step 6: Final check**

Run: `npm run lint && npm run typecheck && npm test && npm run build`
Expected: all pass.

- [ ] **Step 7: Deploy**

```bash
git push origin main
ssh -i ~/.ssh/jenn-french.pem ubuntu@54.80.104.161
cd ~/jenn-french
~/backup-db.sh                    # fresh backup BEFORE the migration
git pull
npm ci
npx prisma migrate deploy
npx --yes tsx scripts/backfill-sections.mjs
npm run build
pm2 restart jenn-french
```

Then open `https://francaisavecjenn.ca/g/all` and confirm a real card renders as it did before. The four old columns are still populated at every step, so a bad outcome is fixed by deploying the previous commit — not by restoring a database.

---

## Self-Review

**Spec coverage.** JSON column on both tables → Task 2. Untyped-column guard → Task 1 (`readSections`), applied in Task 3. Old columns retained → Global Constraints and Task 3's split create/update payloads. Backfill mapping and order → Task 1 (`backfillSections`), applied in Task 2. Seeding → Task 1 (`seedSections`), applied in Task 4. Editor with ↑ ↓ delete and the dashed placeholder → Task 5. Blank sections dropped on save → Task 1 (`normaliseSections`), applied in Task 3. Rendering with the content-driven idiom box → Task 6. Claude narrowed to three fields → Task 4. Testing → Task 1 and Task 4. Migration and rollout → Task 7 Step 7.

**Placeholders.** None: every code step carries the code, and every run step carries the command and its expected result — including the three steps whose expected result is a specific, deliberate failure.

**Type consistency.** `CardSection` is defined once in Task 1 and imported by Tasks 3, 4, 5 and 6. `PRONUNCIATION_TITLE` is used in Task 1's tests and Task 4's. `CardInput` loses four fields and gains `sections` in Task 3; its consumers are repaired in Tasks 5 and 6. `CardSuggestion` becomes `{hint, grammar, idiom}` in Task 4, matching the schema written in the same task. `moveSection(sections, index, direction)` is defined in Task 1 and called with that signature in Task 5. `isExpressionBody` is defined in Task 1 and called in Task 6. `splitIdiom` is pre-existing and unchanged.

**Deliberate cross-task breakage.** `npm run typecheck` fails from Task 3 through Task 5 and passes again at Task 6. Tasks 3, 4 and 5 each state exactly which files should appear in the errors, so an unexpected file is a signal rather than noise. The alternative — one task changing the type and both components together — would have been a single unreviewable commit touching six files.
