# Claude Card Autofill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a teacher type an English phrase, a French phrase, and a subject, press Generate, and have Claude draft the card's five supporting fields before the full front/back editor appears.

**Architecture:** A two-stage `CardEditor` — a three-field compose step gated behind a Generate button, then the existing front/back editor populated with Claude's output. The Claude call lives in `lib/card-ai.ts`, reached only through a server action that checks the teacher session. Claude returns inline markers (`**bold**`, `*italic*`, `` `code` ``) which are stored verbatim, so a shared `InlineMarkup` renderer draws them on both the student card and the editor.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript 5 strict, Tailwind v4, Prisma 6 + SQLite, Vitest (node environment), `@anthropic-ai/sdk`.

**Spec:** `docs/superpowers/specs/2026-07-26-claude-card-autofill-design.md`

## Global Constraints

- Model is `claude-haiku-4-5`, exported as a named constant. Do **not** substitute another model.
- Do **not** send `output_config.effort` — effort is Opus 4.5 and later, and returns a 400 on Haiku 4.5.
- Do **not** send a `thinking` parameter. Omitting it on Haiku 4.5 means no thinking, which is intended.
- Do **not** add `cache_control`. Haiku 4.5's minimum cacheable prefix is 4096 tokens; the system prompt is far shorter, so it would silently do nothing.
- Do **not** use `client.beta.messages` or the `fallbacks` parameter. Structured outputs are GA on `client.messages.create`.
- `ANTHROPIC_API_KEY` is read **only** inside `lib/card-ai.ts`. Never prefix it `NEXT_PUBLIC_`, never reference it from a client component, never commit it.
- Claude must never write the `subject` or `usage` fields. They are absent from the JSON schema, not merely discouraged in the prompt.
- Vitest runs with `environment: "node"` and `globals: true`. There is no React Testing Library and no HTTP mocking layer — **do not add either**. Only pure functions get unit tests. No test may make a live API call.
- Every new module uses the `@/` path alias (configured in both `tsconfig.json` and `vitest.config.ts`).
- TypeScript is `strict` with `isolatedModules: true` — type-only imports must use `import type`.
- Commit after every task. Do not push.

---

### Task 1: Inline markup parser

The pure tokeniser behind every rendered field. No React, no dependencies.

**Files:**
- Create: `lib/inline-markup.ts`
- Test: `tests/lib/inline-markup.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `export type MarkupToken = { type: "text" | "bold" | "italic" | "code"; value: string }` and `export function parseInlineMarkup(text: string): MarkupToken[]`.

- [ ] **Step 1: Write the failing test**

Create `tests/lib/inline-markup.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseInlineMarkup } from "@/lib/inline-markup";

describe("parseInlineMarkup", () => {
  it("returns nothing for an empty string", () => {
    expect(parseInlineMarkup("")).toEqual([]);
  });

  it("returns plain text as a single token", () => {
    expect(parseInlineMarkup("just words")).toEqual([
      { type: "text", value: "just words" },
    ]);
  });

  it("parses a bold span", () => {
    expect(parseInlineMarkup("**j'étais**")).toEqual([
      { type: "bold", value: "j'étais" },
    ]);
  });

  it("parses an italic span", () => {
    expect(parseInlineMarkup("*softly*")).toEqual([
      { type: "italic", value: "softly" },
    ]);
  });

  it("parses a code span", () => {
    expect(parseInlineMarkup("`ch'tais`")).toEqual([
      { type: "code", value: "ch'tais" },
    ]);
  });

  it("parses text around and between spans", () => {
    expect(parseInlineMarkup("être → **j'étais** in `dz` speech")).toEqual([
      { type: "text", value: "être → " },
      { type: "bold", value: "j'étais" },
      { type: "text", value: " in " },
      { type: "code", value: "dz" },
      { type: "text", value: " speech" },
    ]);
  });

  it("prefers bold over italic when markers could overlap", () => {
    expect(parseInlineMarkup("**both**")).toEqual([
      { type: "bold", value: "both" },
    ]);
  });

  it("leaves an unmatched marker as literal text", () => {
    expect(parseInlineMarkup("2 * 3 = 6")).toEqual([
      { type: "text", value: "2 * 3 = 6" },
    ]);
  });

  it("leaves an unclosed bold marker as literal text", () => {
    expect(parseInlineMarkup("**oops")).toEqual([
      { type: "text", value: "**oops" },
    ]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/lib/inline-markup.test.ts`
Expected: FAIL — cannot resolve `@/lib/inline-markup`.

- [ ] **Step 3: Write the implementation**

Create `lib/inline-markup.ts`:

```ts
export type MarkupToken = {
  type: "text" | "bold" | "italic" | "code";
  value: string;
};

// Alternation order matters: ** must be tried before *, or "**x**" would be
// read as an italic span containing "*x*". Each span's body excludes its own
// delimiter, so an unclosed marker simply fails to match and stays literal.
const SPAN = /\*\*([^*]+)\*\*|`([^`]+)`|\*([^*]+)\*/g;

export function parseInlineMarkup(text: string): MarkupToken[] {
  const tokens: MarkupToken[] = [];
  let cursor = 0;

  for (const match of text.matchAll(SPAN)) {
    const start = match.index;
    if (start > cursor) {
      tokens.push({ type: "text", value: text.slice(cursor, start) });
    }

    const [bold, code, italic] = [match[1], match[2], match[3]];
    if (bold !== undefined) tokens.push({ type: "bold", value: bold });
    else if (code !== undefined) tokens.push({ type: "code", value: code });
    else if (italic !== undefined) tokens.push({ type: "italic", value: italic });

    cursor = start + match[0].length;
  }

  if (cursor < text.length) {
    tokens.push({ type: "text", value: text.slice(cursor) });
  }

  return tokens;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/lib/inline-markup.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/inline-markup.ts tests/lib/inline-markup.test.ts
git commit -m "feat: parse inline bold, italic, and code markers"
```

---

### Task 2: Render markup on the student card

Turns tokens into JSX and fixes the pronunciation field, which currently wraps its entire value in one mono chip instead of carrying chips inside prose.

**Files:**
- Create: `components/InlineMarkup.tsx`
- Modify: `components/card-styles.ts` (append one export)
- Modify: `components/Flashcard.tsx:62-66, 96-137`

**Interfaces:**
- Consumes: `parseInlineMarkup`, `MarkupToken` from Task 1.
- Produces: `export function InlineMarkup({ text }: { text: string }): ReactElement` and `export const cardCodeChip: string`.

- [ ] **Step 1: Add the chip style to the shared stylesheet**

Append to `components/card-styles.ts`:

```ts
export const cardCodeChip =
  "rounded bg-[#eef3ee] px-1.5 py-0.5 font-[var(--card-font-mono)] text-[13px] text-[var(--card-moss)]";

export const cardProse =
  "whitespace-pre-line text-[15px] leading-relaxed text-[var(--card-ink)]";
```

- [ ] **Step 2: Write the renderer**

Create `components/InlineMarkup.tsx`:

```tsx
import { Fragment } from "react";
import { parseInlineMarkup } from "@/lib/inline-markup";
import { cardCodeChip } from "@/components/card-styles";

export function InlineMarkup({ text }: { text: string }) {
  return (
    <>
      {parseInlineMarkup(text).map((token, index) => {
        switch (token.type) {
          case "bold":
            return (
              <strong key={index} className="font-semibold">
                {token.value}
              </strong>
            );
          case "italic":
            return <em key={index}>{token.value}</em>;
          case "code":
            return (
              <code key={index} className={cardCodeChip}>
                {token.value}
              </code>
            );
          default:
            return <Fragment key={index}>{token.value}</Fragment>;
        }
      })}
    </>
  );
}
```

- [ ] **Step 3: Render markup in the hint on the card front**

In `components/Flashcard.tsx`, replace the `card.hint` paragraph body (currently `{card.hint}` at line 65) so the paragraph reads:

```tsx
{card.hint && (
  <p className="mt-4 whitespace-pre-line font-[var(--card-font-serif)] text-sm italic text-[var(--card-moss)]">
    <InlineMarkup text={card.hint} />
  </p>
)}
```

- [ ] **Step 4: Render markup in the four back-panel sections and fix pronunciation**

In `components/Flashcard.tsx`, replace the whole block from the `card.examples` section through the `card.idiom` section (lines 96–137) with:

```tsx
{card.examples && (
  <div className="mb-4">
    <h4 className={cardSectionHeading}>Grammar</h4>
    <p className={cardProse}>
      <InlineMarkup text={card.examples} />
    </p>
  </div>
)}
{card.pronunciation && (
  <div className="mb-4">
    <h4 className={cardSectionHeading}>Québec Pronunciation</h4>
    <p className={cardProse}>
      <InlineMarkup text={card.pronunciation} />
    </p>
  </div>
)}
{card.tip && (
  <div className="mb-4">
    <h4 className={cardSectionHeading}>Tip</h4>
    <p className={cardProse}>
      <InlineMarkup text={card.tip} />
    </p>
  </div>
)}
{card.idiom && (
  <div>
    <h4 className={cardSectionHeading}>Idiom of the day</h4>
    <div className="rounded-r-lg border-l-[3px] border-[var(--card-or)] bg-[#fbf1e2] p-3.5">
      <div className="whitespace-pre-line text-[15px] italic text-[var(--card-rouge)]">
        <InlineMarkup text={card.idiom} />
      </div>
    </div>
  </div>
)}
```

Note the pronunciation change: it was a `<span>` carrying the chip class around the entire value, and is now a normal prose paragraph. The chip now applies to `` `code` `` spans inside it.

- [ ] **Step 5: Update the imports in Flashcard**

In `components/Flashcard.tsx`, add `InlineMarkup` to the imports and add `cardProse` to the existing `@/components/card-styles` import list:

```tsx
import { InlineMarkup } from "@/components/InlineMarkup";
import {
  accentBarClass,
  accentBarStyle,
  cardDateLabel,
  cardEyebrow,
  cardHeaderRow,
  cardPanel,
  cardPanelBack,
  cardProse,
  cardSectionHeading,
  cardSubjectPill,
} from "@/components/card-styles";
```

- [ ] **Step 6: Verify it compiles and the suite still passes**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add components/InlineMarkup.tsx components/card-styles.ts components/Flashcard.tsx
git commit -m "feat: render inline markup on the student card

Pronunciation moves from one chip around the whole field to prose with
chips on code spans, matching the other back-panel sections."
```

---

### Task 3: The suggestion type and merge

Pure. Owns the `CardSuggestion` shape so the SDK module depends on this one, not the reverse — that keeps the Anthropic import off the test path.

**Files:**
- Create: `lib/card-suggestions.ts`
- Test: `tests/lib/card-suggestions.test.ts`

**Interfaces:**
- Consumes: `CardInput` from `@/app/actions`.
- Produces: `export type CardSuggestion = { hint: string; examples: string; pronunciation: string; tip: string; idiom: string }` and `export function applySuggestion(values: CardInput, suggestion: CardSuggestion): CardInput`.

- [ ] **Step 1: Write the failing test**

Create `tests/lib/card-suggestions.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { applySuggestion, type CardSuggestion } from "@/lib/card-suggestions";
import type { CardInput } from "@/app/actions";

const composed: CardInput = {
  date: "2026-07-26",
  subject: "Imparfait",
  usage: "",
  pronunciation: "",
  englishPrompt: "I used to pack a lunch every day",
  hint: "",
  frenchAnswer: "Je faisais un lunch chaque jour",
  examples: "",
  tip: "",
  idiom: "",
};

const suggestion: CardSuggestion = {
  hint: "Think **every day** — a repeated habit.",
  examples: "faire → **faisait**.",
  pronunciation: "**Lunch** `lonch` is the QC word.",
  tip: "Everyday register.",
  idiom: "**se pogner le beigne** — to laze about",
};

describe("applySuggestion", () => {
  it("sets the five generated fields", () => {
    const result = applySuggestion(composed, suggestion);
    expect(result.hint).toBe(suggestion.hint);
    expect(result.examples).toBe(suggestion.examples);
    expect(result.pronunciation).toBe(suggestion.pronunciation);
    expect(result.tip).toBe(suggestion.tip);
    expect(result.idiom).toBe(suggestion.idiom);
  });

  it("carries the teacher's fields through untouched", () => {
    const result = applySuggestion(composed, suggestion);
    expect(result.date).toBe("2026-07-26");
    expect(result.subject).toBe("Imparfait");
    expect(result.englishPrompt).toBe(composed.englishPrompt);
    expect(result.frenchAnswer).toBe(composed.frenchAnswer);
  });

  it("leaves usage blank, since nothing generates it", () => {
    expect(applySuggestion(composed, suggestion).usage).toBe("");
  });

  it("does not mutate the values it was given", () => {
    applySuggestion(composed, suggestion);
    expect(composed.hint).toBe("");
    expect(composed.examples).toBe("");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/lib/card-suggestions.test.ts`
Expected: FAIL — cannot resolve `@/lib/card-suggestions`.

- [ ] **Step 3: Write the implementation**

Create `lib/card-suggestions.ts`:

```ts
import type { CardInput } from "@/app/actions";

// The five fields Claude writes. Subject and usage are deliberately absent:
// the teacher owns those, and leaving them out of this type means there is no
// shape in which a generated value for them could reach the form.
export type CardSuggestion = {
  hint: string;
  examples: string;
  pronunciation: string;
  tip: string;
  idiom: string;
};

export function applySuggestion(
  values: CardInput,
  suggestion: CardSuggestion,
): CardInput {
  return {
    ...values,
    hint: suggestion.hint,
    examples: suggestion.examples,
    pronunciation: suggestion.pronunciation,
    tip: suggestion.tip,
    idiom: suggestion.idiom,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/lib/card-suggestions.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/card-suggestions.ts tests/lib/card-suggestions.test.ts
git commit -m "feat: add the card suggestion shape and merge"
```

---

### Task 4: The Claude call

The only module that imports the SDK or reads the API key.

**Files:**
- Modify: `package.json` (adds `@anthropic-ai/sdk`)
- Create: `lib/card-ai.ts`

**Interfaces:**
- Consumes: `CardSuggestion` from Task 3.
- Produces:
  - `export const MODEL = "claude-haiku-4-5"`
  - `export class CardAiError extends Error`
  - `export type SuggestionInput = { englishPrompt: string; frenchAnswer: string; subject: string }`
  - `export async function generateCardSuggestion(input: SuggestionInput): Promise<CardSuggestion>`

- [ ] **Step 1: Install the SDK**

```bash
npm install @anthropic-ai/sdk
```

- [ ] **Step 2: Add your API key to the local env file**

Append to `.env.local` (already gitignored — confirm with `git check-ignore .env.local` before writing):

```
ANTHROPIC_API_KEY="sk-ant-..."
```

Use a key issued for this project alone. Do not commit this file.

- [ ] **Step 3: Write the module**

Create `lib/card-ai.ts`:

```ts
import Anthropic from "@anthropic-ai/sdk";
import type { CardSuggestion } from "@/lib/card-suggestions";

export const MODEL = "claude-haiku-4-5";
const MAX_TOKENS = 2000;

// Every message here is shown to the teacher verbatim, so each one has to be
// something they can act on.
export class CardAiError extends Error {}

export type SuggestionInput = {
  englishPrompt: string;
  frenchAnswer: string;
  subject: string;
};

const SYSTEM_PROMPT = `You write supporting content for a daily French flashcard used by English-speaking learners of QUEBEC French.

The teacher gives you three things: an English phrase, its French translation, and a subject (the grammar point or theme, for example "Imparfait").

You return exactly five fields. You never write the subject or the usage field — those belong to the teacher.

FORMATTING
Plain text with three inline markers, and nothing else:
  **bold** for emphasis
  *italic* for softer emphasis
  \`code\` for phonetic renderings and spoken forms
No headings, no bullet lists, no links, no other Markdown. Never nest markers.

FIELDS

hint — One sentence nudging the learner toward the French phrase without containing any part of it. Bold the trigger word that signals the grammar point.

examples — The grammar note. Show where each conjugated verb in the French phrase comes from: infinitive in plain text, an arrow, then the conjugated form in bold. Finish with one short sentence giving the rule that separates this subject from the tense learners confuse it with. Example:
être → **j'étais**, faire → **faisait**, conduire → **conduisait**. Repeated "would" = imparfait, not conditionnel.

pronunciation — Quebec only. Mention France solely as a brief parenthetical contrast. Cover the words in the French phrase that Quebecois speakers say distinctively: vocabulary that differs from France, consonants that shift, contractions heard in fast speech. Bold the word under discussion and put its spoken rendering in \`code\`. One short sentence per distinctive word, at most four; if only one word is distinctive, write one sentence. Example:
**Lunch** \`lonch\` is the everyday QC word for a packed midday meal (France: "déjeuner/repas"). \`petit\` → soft "ts": \`p'tsi\`. \`conduisait\` → the **d** before **u/i** softens toward \`dz\`: \`con-dzui-zè\`. In fast QC speech, **j'étais** often contracts to \`ch'tais\`.

tip — One or two sentences of practical advice: register, a common learner mistake, or when a Quebecois speaker would actually say this.

idiom — A Quebecois idiom or expression connected to the card's theme, written as: **expression** — plain-English meaning. One line.`;

const SUGGESTION_SCHEMA = {
  type: "object",
  properties: {
    hint: { type: "string" },
    examples: { type: "string" },
    pronunciation: { type: "string" },
    tip: { type: "string" },
    idiom: { type: "string" },
  },
  required: ["hint", "examples", "pronunciation", "tip", "idiom"],
  additionalProperties: false,
};

let client: Anthropic | null = null;

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new CardAiError("Claude isn't configured on this server.");
  }
  if (!client) client = new Anthropic({ apiKey });
  return client;
}

export async function generateCardSuggestion(
  input: SuggestionInput,
): Promise<CardSuggestion> {
  const anthropic = getClient();

  let response;
  try {
    response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      output_config: {
        format: { type: "json_schema", schema: SUGGESTION_SCHEMA },
      },
      messages: [
        {
          role: "user",
          content: [
            `English phrase: ${input.englishPrompt}`,
            `French phrase: ${input.frenchAnswer}`,
            `Subject: ${input.subject}`,
          ].join("\n"),
        },
      ],
    });
  } catch (err) {
    // Most specific first: both of these extend APIError.
    if (err instanceof Anthropic.AuthenticationError) {
      throw new CardAiError("Claude rejected the API key.");
    }
    if (err instanceof Anthropic.RateLimitError) {
      throw new CardAiError("Claude is rate limited — try again in a moment.");
    }
    if (err instanceof Anthropic.APIError) {
      throw new CardAiError("Claude couldn't be reached. Try again.");
    }
    throw new CardAiError("Claude couldn't be reached. Try again.");
  }

  // A refusal is HTTP 200 with empty content, so this has to come before any
  // indexing into content.
  if (response.stop_reason === "refusal") {
    throw new CardAiError("Claude declined to answer this one.");
  }

  const block = response.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") {
    throw new CardAiError("Claude couldn't be reached. Try again.");
  }

  return JSON.parse(block.text) as CardSuggestion;
}
```

- [ ] **Step 4: Type-check**

Run: `npm run typecheck`
Expected: PASS.

If `output_config` is rejected because the installed SDK's typings lag the API, keep the request body identical and widen only that property — do not drop the field and do not switch to the beta endpoint:

```ts
      output_config: {
        format: { type: "json_schema", schema: SUGGESTION_SCHEMA },
      } as unknown as Anthropic.MessageCreateParams["output_config"],
```

- [ ] **Step 5: Lint and run the suite**

Run: `npm run lint && npm test`
Expected: all pass. No new tests here — this module is a network boundary and the suite has no mocking layer, by design.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json lib/card-ai.ts
git commit -m "feat: generate card fields with claude haiku 4.5

Structured outputs on the GA messages endpoint. No effort parameter,
no thinking config, and no cache_control: none are valid or useful on
this model."
```

---

### Task 5: The server action

Puts the call behind the same session gate as every write, and returns a result object rather than throwing — Next.js redacts server action error messages in production, so a thrown message would reach the teacher as generic noise.

**Files:**
- Create: `app/ai-actions.ts`

**Interfaces:**
- Consumes: `generateCardSuggestion`, `CardAiError`, `SuggestionInput` from Task 4; `CardSuggestion` from Task 3.
- Produces: `export type SuggestResult = { ok: true; suggestion: CardSuggestion } | { ok: false; error: string }` and `export async function suggestCardFields(input: SuggestionInput): Promise<SuggestResult>`.

- [ ] **Step 1: Write the action**

Create `app/ai-actions.ts`:

```ts
"use server";

import { getCurrentTeacher } from "@/lib/session";
import {
  CardAiError,
  generateCardSuggestion,
  type SuggestionInput,
} from "@/lib/card-ai";
import type { CardSuggestion } from "@/lib/card-suggestions";

export type SuggestResult =
  | { ok: true; suggestion: CardSuggestion }
  | { ok: false; error: string };

export async function suggestCardFields(
  input: SuggestionInput,
): Promise<SuggestResult> {
  // Without this the route is an unauthenticated endpoint that spends money
  // on the project's API key.
  const teacher = await getCurrentTeacher();
  if (!teacher) return { ok: false, error: "Unauthorized" };

  if (!input.englishPrompt.trim() || !input.frenchAnswer.trim() || !input.subject.trim()) {
    return { ok: false, error: "Fill in all three fields first." };
  }

  try {
    return { ok: true, suggestion: await generateCardSuggestion(input) };
  } catch (err) {
    // CardAiError messages are written for the teacher. Anything else could
    // carry request details, so it never leaves the server.
    if (err instanceof CardAiError) return { ok: false, error: err.message };
    console.error("suggestCardFields failed", err);
    return { ok: false, error: "Claude couldn't be reached. Try again." };
  }
}
```

- [ ] **Step 2: Type-check and lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/ai-actions.ts
git commit -m "feat: add the card suggestion server action

Teacher-gated, and returns a result object so the error text survives
Next's production error redaction."
```

---

### Task 6: The two-stage editor

The compose step, the Generate button, and the transition into the existing front/back editor.

**Files:**
- Modify: `components/admin/CardEditor.tsx`

**Interfaces:**
- Consumes: `suggestCardFields`, `SuggestResult` from Task 5; `applySuggestion` from Task 3.
- Produces: no change to the `CardEditor` props contract — `{ initialDate, initialValues?, onSubmit }` is unchanged, so neither admin page needs editing.

- [ ] **Step 1: Add the new imports**

In `components/admin/CardEditor.tsx`, add below the existing imports:

```tsx
import { suggestCardFields } from "@/app/ai-actions";
import { applySuggestion } from "@/lib/card-suggestions";
```

- [ ] **Step 2: Add the stage state**

Inside the `CardEditor` component, directly after the existing `const [error, setError] = useState<string | null>(null);` line, add:

```tsx
  // A card that already exists for this date opens straight in the editor —
  // it has been generated and saved once already.
  const [stage, setStage] = useState<"compose" | "generating" | "editing">(
    initialValues?.englishPrompt && initialValues?.frenchAnswer
      ? "editing"
      : "compose",
  );
  const [aiError, setAiError] = useState<string | null>(null);
```

- [ ] **Step 3: Add the generate handler**

Directly after the `update` function in the same component, add:

```tsx
  async function handleGenerate() {
    setAiError(null);
    setStage("generating");

    const result = await suggestCardFields({
      englishPrompt: values.englishPrompt,
      frenchAnswer: values.frenchAnswer,
      subject: values.subject,
    });

    if (!result.ok) {
      setAiError(result.error);
      setStage("compose");
      return;
    }

    setValues((prev) => applySuggestion(prev, result.suggestion));
    setStage("editing");
  }
```

- [ ] **Step 4: Render the compose stage**

In the same component, directly above the existing `return (` of the main form, add this early return:

```tsx
  if (stage !== "editing") {
    const busy = stage === "generating";
    const ready =
      values.englishPrompt.trim() !== "" &&
      values.frenchAnswer.trim() !== "" &&
      values.subject.trim() !== "";

    return (
      <div className="mx-auto flex w-full max-w-[560px] flex-col gap-6">
        <label className="text-sm font-medium text-[var(--color-ink)]">
          English phrase *
          <Input
            value={values.englishPrompt}
            onChange={(e) => update("englishPrompt", e.target.value)}
            placeholder="I used to pack a lunch every day"
            disabled={busy}
            required
          />
        </label>

        <label className="text-sm font-medium text-[var(--color-ink)]">
          French phrase *
          <Input
            value={values.frenchAnswer}
            onChange={(e) => update("frenchAnswer", e.target.value)}
            placeholder="Je faisais un lunch chaque jour"
            disabled={busy}
            required
          />
        </label>

        <label className="text-sm font-medium text-[var(--color-ink)]">
          Subject *
          <Input
            value={values.subject}
            onChange={(e) => update("subject", e.target.value)}
            placeholder="Imparfait"
            disabled={busy}
            required
          />
        </label>

        <Button type="button" onClick={handleGenerate} disabled={!ready || busy}>
          {busy ? (
            <span className="flex items-center justify-center gap-2">
              <span
                className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
                aria-hidden="true"
              />
              Generating…
            </span>
          ) : (
            "Generate"
          )}
        </Button>

        {aiError && (
          <p role="alert" className="text-sm text-[var(--color-accent)]">
            {aiError}
          </p>
        )}
      </div>
    );
  }
```

- [ ] **Step 5: Make the pronunciation field prose in the editor too**

The editor's pronunciation field still carries the old whole-field chip class. In the back panel, replace the `EditableText` for pronunciation with:

```tsx
            <EditableText
              value={values.pronunciation}
              onChange={(v) => update("pronunciation", v)}
              placeholder="Pronunciation (optional)"
              ariaLabel="Québec pronunciation"
              multiline
              className="text-[15px] leading-relaxed text-[var(--card-ink)]"
            />
```

The teacher edits the raw `**` and backticks here; the student card renders them.

- [ ] **Step 6: Type-check, lint, and run the suite**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all pass.

- [ ] **Step 7: Build**

Run: `npm run build`
Expected: PASS. If Apple Silicon SWC bindings fail, use `npm run build -- --webpack`.

- [ ] **Step 8: Commit**

```bash
git add components/admin/CardEditor.tsx
git commit -m "feat: gate the card editor behind a Generate step

Compose takes the English phrase, French phrase, and subject; Claude
fills the five supporting fields; the front/back editor then appears
populated. One generation per page load, no regenerate."
```

---

### Task 7: Verify end to end and record the new env var

The manual pass, because nothing above exercises the real API or the browser.

**Files:**
- Modify: `../Winery/WEBSITE_TEMPLATE.md` (a **separate repository** — commit there separately, or leave it staged for the user)

- [ ] **Step 1: Record the env var in the deployment reference**

In `../Winery/WEBSITE_TEMPLATE.md`, the Environment Variables table already lists `ANTHROPIC_API_KEY` as "Required for AI features" — confirm that row is present and accurate for this project, and add `jenn-french` to the deployment steps if that file has a per-project section. This file records the key being scraped from a compromised instance twice, so the point is that a fresh instance does not come up with the feature silently broken.

This is a different git repository. Do not include it in any commit made in `jenn-french`.

- [ ] **Step 2: Start the dev server**

Run: `npm run dev`
Then sign in at `http://localhost:3000/login` with your passkey.

- [ ] **Step 3: Walk the happy path on /admin**

1. Open `/admin`. Expect three fields — English phrase, French phrase, Subject — and a disabled Generate button. No date input, no card panels.
2. Fill two of the three. Generate stays disabled.
3. Fill the third. Generate becomes clickable.
4. Click it. The button shows a spinner and the fields go read-only.
5. On success the front/back editor appears, with the date input, the three typed values in place, and hint, grammar, pronunciation, tip, and idiom filled.
6. Confirm **subject is exactly what you typed** and **usage is empty**.
7. Save the card.

- [ ] **Step 4: Check the rules held**

Read the generated text and confirm:
- Grammar shows `infinitive → **conjugated**` derivations matching the subject.
- Pronunciation is about Québec, with `` `code` `` spans for spoken forms.
- Markers are `**`, `*`, and backticks only — no `#` headings or `-` bullets.

- [ ] **Step 5: Check the student card**

Open the group's `/g/[slug]` page for that date. Confirm:
- Bold, italics, and chips render. **No literal asterisks or backticks anywhere.**
- Pronunciation is prose with chips inside it, not one chip around the whole field.

- [ ] **Step 6: Check the once-per-load rule**

1. Reload `/admin`. The saved card opens **directly in the editing stage** — no compose step, no second API call.
2. In a fresh state (a date with no saved card), generate but do not save, then reload. It returns to compose and allows a new generation.

- [ ] **Step 7: Check the group page and the failure path**

1. Open `/admin/<a-group-slug>` and confirm it behaves identically to `/admin`.
2. Stop the dev server, comment out `ANTHROPIC_API_KEY` in `.env.local`, restart, and click Generate. Expect "Claude isn't configured on this server." below the button, with the three typed fields still in place and the button usable again.
3. Restore the key.

- [ ] **Step 8: Final check**

Run: `npm run lint && npm run typecheck && npm test && npm run build`
Expected: all pass.

Nothing to commit here — this task's only file change is in a separate
repository. Confirm `git status` in `jenn-french` is clean.

---

## Self-Review

**Spec coverage.** Two-stage flow → Task 6. Both admin pages → Task 6 (the props contract is unchanged, so both pages inherit it). One generation per page load → Task 6 Step 2, verified in Task 7 Step 6. Claude excluded from subject and usage → Task 3 (type) and Task 4 (schema), verified in Task 7 Step 3.6. Grammar and pronunciation rules → Task 4 system prompt. Length rules → Task 4 system prompt. Inline markup → Tasks 1 and 2. Pronunciation markup fix → Task 2 Step 4 and Task 6 Step 5. Merge rule → Task 3. Model constraints → Global Constraints and Task 4. Error table → Task 4 and Task 5. Key handling → Global Constraints, Task 4 Step 2, Task 7 Step 1. Testing → Tasks 1 and 3.

**Placeholders.** None: every code step carries the code, and every run step carries the command and expected result.

**Type consistency.** `CardSuggestion` is defined once in `lib/card-suggestions.ts` (Task 3) and imported by `lib/card-ai.ts` (Task 4) and `app/ai-actions.ts` (Task 5). `SuggestionInput` is defined in Task 4 and consumed in Task 5. `SuggestResult` is defined in Task 5 and consumed in Task 6. `parseInlineMarkup` / `MarkupToken` from Task 1 are consumed only in Task 2. `cardCodeChip` and `cardProse` are added in Task 2 Step 1 and used in Task 2 Steps 2 and 4.
