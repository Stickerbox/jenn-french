# Admin Card Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the admin flashcard form's plain text fields with an editable, non-flipping rendering of the card itself — front panel on top, back panel below — so the teacher types directly where the text will appear.

**Architecture:** Extract the class strings and date formatter shared by the student card into `components/card-styles.ts` and `lib/format.ts`, build a borderless `EditableText` primitive, then assemble `components/admin/CardEditor.tsx` from those pieces. `CardEditor` keeps the exact props contract of the `CardForm` it replaces, so the two admin pages change only their import and tag, and no server action changes.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4 (CSS custom properties defined in `app/globals.css`), Vitest.

Spec: `docs/superpowers/specs/2026-07-26-admin-card-editor-design.md`

## Global Constraints

- Only three fields are required: `date`, `englishPrompt`, `frenchAnswer`. Their visible labels carry a trailing `*`. No other label carries a marker and no other field blocks a save.
- The editor does not flip. No framer-motion, no `[perspective:...]`, no `[backface-visibility:...]`, no "tap to reveal the answer" line, no Flip button.
- The server actions in `app/actions.ts` and the `CardInput` type are not modified.
- The Groups list and New group form on `/admin`, and the "Existing overrides" list on `/admin/[slug]`, are not modified.
- `components/Flashcard.tsx` must render byte-identical output before and after this work — only the *source* of its class strings and date formatter changes.
- Card visual tokens come from the existing CSS custom properties: `--card-paper`, `--card-paper-back`, `--card-line`, `--card-ink`, `--card-bleu`, `--card-bleu-soft`, `--card-or`, `--card-rouge`, `--card-moss`, `--card-shadow`, `--card-font-mono`, `--card-font-serif`. Do not introduce new colour values.
- All new components that use hooks or event handlers need the `"use client"` directive on line 1.
- Use `cn()` from `@/lib/utils` when combining class strings.
- Verification commands: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `lib/format.ts` | Create. `formatCardDate(date: Date): string` — the `fr-CA` short date label. Pure, unit tested. |
| `tests/lib/format.test.ts` | Create. Tests for `formatCardDate`. |
| `components/card-styles.ts` | Create. Exported class-string constants shared by the student card and the editor. No JSX, no React import. |
| `components/Flashcard.tsx` | Modify. Imports the constants and the formatter instead of defining them inline. Rendered output unchanged. |
| `components/admin/EditableText.tsx` | Create. The borderless input/auto-growing textarea primitive. |
| `components/admin/CardEditor.tsx` | Create. The two stacked panels, state, and save handling. Replaces `CardForm`. |
| `components/admin/CardForm.tsx` | Delete, in the same task that switches both pages over. |
| `app/admin/page.tsx` | Modify. Import and tag change only. |
| `app/admin/[slug]/page.tsx` | Modify. Import and tag change only. |

---

### Task 1: Shared date formatter

Pull the date label formatter out of `Flashcard.tsx` so the editor's two panels can render the same label, and so it can be unit tested.

**Files:**
- Create: `lib/format.ts`
- Create: `tests/lib/format.test.ts`
- Modify: `components/Flashcard.tsx:7-13` (delete the local `formatDate`), `components/Flashcard.tsx:24` (call the import)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `formatCardDate(date: Date): string` from `@/lib/format`. Task 4 and Task 5 call it.

- [ ] **Step 1: Write the failing test**

Create `tests/lib/format.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { formatCardDate } from "@/lib/format";

describe("formatCardDate", () => {
  it("formats a date as a short fr-CA weekday label", () => {
    expect(formatCardDate(new Date("2026-07-26T00:00:00Z"))).toBe(
      new Date("2026-07-26T00:00:00Z").toLocaleDateString("fr-CA", {
        weekday: "short",
        month: "short",
        day: "numeric",
      }),
    );
  });

  it("includes the weekday, month and day parts", () => {
    const label = formatCardDate(new Date("2026-07-26T00:00:00Z"));
    expect(label).toMatch(/\d/);
    expect(label.length).toBeGreaterThan(5);
  });
});
```

Note: the first test asserts against `toLocaleDateString` rather than a hardcoded string because ICU output differs between Node builds. The second test pins the shape.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/lib/format.test.ts`
Expected: FAIL — cannot resolve `@/lib/format`.

- [ ] **Step 3: Write the implementation**

Create `lib/format.ts`:

```ts
export function formatCardDate(date: Date): string {
  return date.toLocaleDateString("fr-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/lib/format.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Switch Flashcard over to the shared formatter**

In `components/Flashcard.tsx`, delete the local `formatDate` function (lines 7-13) and add the import beside the existing `CardContent` import:

```tsx
import { formatCardDate } from "@/lib/format";
import type { CardContent } from "@/lib/card-resolution";
```

Then change the one call site:

```tsx
const dateLabel = formatCardDate(card.date);
```

- [ ] **Step 6: Verify nothing broke**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all pass. `Flashcard` renders the same label as before — the function body was moved, not changed.

- [ ] **Step 7: Commit**

```bash
git add lib/format.ts tests/lib/format.test.ts components/Flashcard.tsx
git commit -m "refactor: extract shared card date formatter"
```

---

### Task 2: Shared card style constants

Extract the class strings the editor must match, so the two views cannot drift.

**Files:**
- Create: `components/card-styles.ts`
- Modify: `components/Flashcard.tsx` (use the constants)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: from `@/components/card-styles`:
  - `cardPanel: string` — border, radius, paper background, padding, shadow, flex column
  - `cardPanelBack: string` — same but the back paper colour
  - `accentBarClass: string` — the gradient bar's positioning classes
  - `accentBarStyle: { background: string }` — the gradient itself
  - `cardHeaderRow: string` — the dashed-underline header row
  - `cardDateLabel: string` — mono uppercase blue date text
  - `cardSubjectPill: string` — the rounded subject chip
  - `cardEyebrow: string` — the small mono uppercase label above a body region ("SAY IT IN FRENCH", "THE ANSWER")
  - `cardSectionHeading: string` — the rouge mono uppercase back-panel section heading
  Tasks 4 and 5 import all of these.

- [ ] **Step 1: Create the constants file**

Create `components/card-styles.ts`. Every value below is copied verbatim from the current `components/Flashcard.tsx` so the rendering does not change:

```ts
export const cardPanel =
  "relative flex flex-col rounded-[14px] border border-[var(--card-line)] bg-[var(--card-paper)] p-8 shadow-[var(--card-shadow)]";

export const cardPanelBack =
  "relative flex flex-col rounded-[14px] border border-[var(--card-line)] bg-[var(--card-paper-back)] p-8 shadow-[var(--card-shadow)]";

export const accentBarClass = "absolute inset-y-0 left-0 w-1.5 rounded-l-[14px]";

export const accentBarStyle = {
  background: "linear-gradient(var(--card-bleu), var(--card-or))",
};

export const cardHeaderRow =
  "mb-4 flex items-baseline justify-between border-b border-dashed border-[var(--card-line)] pb-3";

export const cardDateLabel =
  "font-[var(--card-font-mono)] text-xs font-bold uppercase tracking-wider text-[var(--card-bleu)]";

export const cardSubjectPill =
  "rounded-full bg-[var(--card-bleu-soft)] px-2.5 py-1 text-[11px] uppercase tracking-wide text-[var(--card-bleu)]";

export const cardEyebrow =
  "font-[var(--card-font-mono)] text-[11px] uppercase tracking-[2px] text-[#a89a7f]";

export const cardSectionHeading =
  "mb-1.5 font-[var(--card-font-mono)] text-[11px] uppercase tracking-wider text-[var(--card-rouge)]";
```

- [ ] **Step 2: Use the constants in Flashcard**

In `components/Flashcard.tsx`, add the import:

```tsx
import {
  accentBarClass,
  accentBarStyle,
  cardDateLabel,
  cardEyebrow,
  cardHeaderRow,
  cardPanel,
  cardPanelBack,
  cardSectionHeading,
  cardSubjectPill,
} from "@/components/card-styles";
```

Replace the `accentBar` constant with:

```tsx
const accentBar = <span className={accentBarClass} style={accentBarStyle} />;
```

Then swap the inline strings for the constants, preserving the classes that are specific to the flip layout. The front panel wrapper becomes:

```tsx
<div className={cn(cardPanel, "col-start-1 row-start-1 [backface-visibility:hidden]")}>
```

and the back panel wrapper becomes:

```tsx
<div
  className={cn(
    cardPanelBack,
    "col-start-1 row-start-1 [backface-visibility:hidden] [transform:rotateY(180deg)]",
  )}
>
```

Both panels already carried `relative flex flex-col`, which now comes from the constant. Add `import { cn } from "@/lib/utils";` at the top.

For the remaining swaps, replace each literal with the matching constant, keeping any extra classes via `cn(...)`:
- both header `<div>`s → `className={cardHeaderRow}`
- both date `<span>`s → `className={cardDateLabel}`
- both subject `<span>`s → `className={cardSubjectPill}`
- `"Say it in French"` wrapper → `className={cn("mb-2", cardEyebrow)}`
- `"The answer"` wrapper → `className={cn("mb-1", cardEyebrow)}`
- all four back `<h4>`s → `className={cardSectionHeading}`

- [ ] **Step 3: Verify the student card is unchanged**

Run: `npm test && npm run typecheck && npm run lint && npm run build`
Expected: all pass.

Then run the app (`npm run dev`) and load a group page with a saved card. The card must look exactly as it did before: same colours, spacing, borders, and the flip animation still works.

- [ ] **Step 4: Commit**

```bash
git add components/card-styles.ts components/Flashcard.tsx
git commit -m "refactor: extract shared card style constants"
```

---

### Task 3: EditableText primitive

One component backs every editable region in the card. It must look like rendered text, not like a form field.

**Files:**
- Create: `components/admin/EditableText.tsx`

**Interfaces:**
- Consumes: `cn` from `@/lib/utils`.
- Produces: from `@/components/admin/EditableText`:

```ts
type EditableTextProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  className?: string;   // typography classes of the surrounding card region
  multiline?: boolean;  // default false -> <input>, true -> auto-growing <textarea>
  required?: boolean;   // default false
  ariaLabel: string;    // accessible name, since there is no visible <label>
};

export function EditableText(props: EditableTextProps): JSX.Element;
```

Tasks 4 and 5 render this for every field.

- [ ] **Step 1: Write the component**

Create `components/admin/EditableText.tsx`:

```tsx
"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

const baseClass =
  "w-full rounded-sm border-0 bg-transparent p-0 outline-none transition-colors " +
  "placeholder:text-[#b0a488] hover:bg-[var(--card-line)]/25 " +
  "focus:bg-transparent focus:ring-0 " +
  "focus:border-b focus:border-dashed focus:border-[var(--card-line)]";

export function EditableText({
  value,
  onChange,
  placeholder,
  className,
  multiline = false,
  required = false,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  className?: string;
  multiline?: boolean;
  required?: boolean;
  ariaLabel: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value, multiline]);

  if (multiline) {
    return (
      <textarea
        ref={textareaRef}
        rows={1}
        aria-label={ariaLabel}
        required={required}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={cn(baseClass, "resize-none overflow-hidden", className)}
      />
    );
  }

  return (
    <input
      type="text"
      aria-label={ariaLabel}
      required={required}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={cn(baseClass, className)}
    />
  );
}
```

Notes for the implementer:
- `rows={1}` plus the `useEffect` height reset is what makes the textarea grow to fit instead of scrolling. The effect must run on every `value` change, which is why `value` is in the dependency array.
- `overflow-hidden` on the textarea prevents a scrollbar flashing during the resize.
- There is no visible `<label>` anywhere in the card, so `ariaLabel` is mandatory — screen readers would otherwise announce these as unnamed fields.

- [ ] **Step 2: Verify it compiles**

Run: `npm run typecheck && npm run lint`
Expected: both pass. (Nothing imports it yet; Task 4 is the first consumer.)

- [ ] **Step 3: Commit**

```bash
git add components/admin/EditableText.tsx
git commit -m "feat: add borderless EditableText primitive for the card editor"
```

---

### Task 4: CardEditor front panel, date field, and save

Build the editor with a working front panel end to end: date input, front card, Save button, error handling. The back panel arrives in Task 5. Nothing imports `CardEditor` yet, so `CardForm` keeps working throughout this task.

**Files:**
- Create: `components/admin/CardEditor.tsx`

**Interfaces:**
- Consumes: `formatCardDate` (Task 1); `cardPanel`, `accentBarClass`, `accentBarStyle`, `cardHeaderRow`, `cardDateLabel`, `cardSubjectPill`, `cardEyebrow` (Task 2); `EditableText` (Task 3); `CardInput` from `@/app/actions`; `Input` from `@/components/ui/Input`; `Button` from `@/components/ui/Button`; `cn` from `@/lib/utils`.
- Produces: from `@/components/admin/CardEditor`:

```ts
export function CardEditor(props: {
  initialDate: string;                    // YYYY-MM-DD
  initialValues?: Partial<CardInput>;
  onSubmit: (input: CardInput) => Promise<void>;
}): JSX.Element;
```

This is the same props contract as the `CardForm` it replaces. Task 6 wires it into both admin pages.

- [ ] **Step 1: Write the component**

Create `components/admin/CardEditor.tsx`:

```tsx
"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { EditableText } from "@/components/admin/EditableText";
import {
  accentBarClass,
  accentBarStyle,
  cardDateLabel,
  cardEyebrow,
  cardHeaderRow,
  cardPanel,
  cardSubjectPill,
} from "@/components/card-styles";
import { formatCardDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CardInput } from "@/app/actions";

const panelLabel =
  "mb-2 font-[var(--card-font-mono)] text-[11px] uppercase tracking-[2px] text-[var(--color-ink-muted)]";

export function CardEditor({
  initialDate,
  initialValues,
  onSubmit,
}: {
  initialDate: string;
  initialValues?: Partial<CardInput>;
  onSubmit: (input: CardInput) => Promise<void>;
}) {
  const router = useRouter();
  const [values, setValues] = useState<CardInput>({
    date: initialDate,
    subject: initialValues?.subject ?? "",
    usage: initialValues?.usage ?? "",
    pronunciation: initialValues?.pronunciation ?? "",
    englishPrompt: initialValues?.englishPrompt ?? "",
    hint: initialValues?.hint ?? "",
    frenchAnswer: initialValues?.frenchAnswer ?? "",
    examples: initialValues?.examples ?? "",
    tip: initialValues?.tip ?? "",
    idiom: initialValues?.idiom ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof CardInput>(key: K, value: CardInput[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSubmit(values);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  const dateLabel = values.date
    ? formatCardDate(new Date(`${values.date}T00:00:00Z`))
    : "—";

  const cardHeader = (
    <div className={cardHeaderRow}>
      <span className={cardDateLabel}>{dateLabel}</span>
      <EditableText
        value={values.subject}
        onChange={(v) => update("subject", v)}
        placeholder="Subject"
        ariaLabel="Subject"
        className={cn(cardSubjectPill, "w-auto max-w-[45%] text-right")}
      />
    </div>
  );

  return (
    <form
      onSubmit={handleSubmit}
      className="mx-auto flex w-full max-w-[560px] flex-col gap-6"
    >
      <label className="text-sm font-medium text-[var(--color-ink)]">
        Date *
        <Input
          type="date"
          value={values.date}
          onChange={(e) => update("date", e.target.value)}
          required
        />
      </label>

      <div>
        <div className={panelLabel}>Front</div>
        <div className={cardPanel}>
          <span className={accentBarClass} style={accentBarStyle} />
          {cardHeader}
          <EditableText
            value={values.usage}
            onChange={(v) => update("usage", v)}
            placeholder="Usage — e.g. Habits of the past"
            ariaLabel="Usage"
            className="mb-1.5 font-[var(--card-font-serif)] text-xs italic tracking-[0.3px] text-[var(--card-or)]"
          />
          <div className={cn("mb-2", cardEyebrow)}>Say it in French *</div>
          <EditableText
            value={values.englishPrompt}
            onChange={(v) => update("englishPrompt", v)}
            placeholder="English sentence to translate"
            ariaLabel="English sentence to translate"
            multiline
            required
            className="font-[var(--card-font-serif)] text-xl leading-relaxed text-[var(--card-ink)]"
          />
          <EditableText
            value={values.hint}
            onChange={(v) => update("hint", v)}
            placeholder="Hint (optional)"
            ariaLabel="Hint"
            multiline
            className="mt-4 font-[var(--card-font-serif)] text-sm italic text-[var(--card-moss)]"
          />
        </div>
      </div>

      <Button type="submit" disabled={saving}>
        {saving ? "Saving..." : "Save card"}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-[var(--color-accent)]">
          {error}
        </p>
      )}
    </form>
  );
}
```

Notes for the implementer:
- The `min-h-[460px]` from the student card is deliberately absent. The editor's panels size to their content; a forced height would leave a dead gap under the fields.
- `dateLabel` builds the `Date` with an explicit `T00:00:00Z` suffix, matching how `app/actions.ts` parses the same string. Parsing a bare `YYYY-MM-DD` differently in the two places would show the teacher one date and save another.
- The subject field gets `w-auto` because `EditableText`'s default `w-full` would stretch the pill across the header.

- [ ] **Step 2: Verify it compiles**

Run: `npm run typecheck && npm run lint`
Expected: both pass.

- [ ] **Step 3: Commit**

```bash
git add components/admin/CardEditor.tsx
git commit -m "feat: add card editor front panel"
```

---

### Task 5: CardEditor back panel

Add the second stacked panel. Every section heading renders even when its field is empty, so the teacher can add a tip or an idiom to a card that does not have one.

**Files:**
- Modify: `components/admin/CardEditor.tsx`

**Interfaces:**
- Consumes: everything from Task 4, plus `cardPanelBack` and `cardSectionHeading` from `@/components/card-styles`.
- Produces: no new exports.

- [ ] **Step 1: Extend the imports**

In `components/admin/CardEditor.tsx`, add `cardPanelBack` and `cardSectionHeading` to the existing `@/components/card-styles` import.

- [ ] **Step 2: Insert the back panel**

Add this block between the closing `</div>` of the Front block and the `<Button type="submit">`:

```tsx
      <div>
        <div className={panelLabel}>Back</div>
        <div className={cardPanelBack}>
          <span className={accentBarClass} style={accentBarStyle} />
          {cardHeader}
          <div className={cn("mb-1", cardEyebrow)}>The answer *</div>
          <EditableText
            value={values.frenchAnswer}
            onChange={(v) => update("frenchAnswer", v)}
            placeholder="French answer"
            ariaLabel="French answer"
            multiline
            required
            className="mb-5 font-[var(--card-font-serif)] text-2xl leading-snug text-[var(--card-bleu)]"
          />

          <div className="mb-4">
            <h4 className={cardSectionHeading}>Grammar</h4>
            <EditableText
              value={values.examples}
              onChange={(v) => update("examples", v)}
              placeholder="Grammar notes (optional)"
              ariaLabel="Grammar"
              multiline
              className="text-[15px] leading-relaxed text-[var(--card-ink)]"
            />
          </div>

          <div className="mb-4">
            <h4 className={cardSectionHeading}>Québec Pronunciation</h4>
            <EditableText
              value={values.pronunciation}
              onChange={(v) => update("pronunciation", v)}
              placeholder="Pronunciation (optional)"
              ariaLabel="Québec pronunciation"
              className="rounded bg-[#eef3ee] px-1.5 py-0.5 font-[var(--card-font-mono)] text-[13px] text-[var(--card-moss)]"
            />
          </div>

          <div className="mb-4">
            <h4 className={cardSectionHeading}>Tip</h4>
            <EditableText
              value={values.tip}
              onChange={(v) => update("tip", v)}
              placeholder="Tip (optional)"
              ariaLabel="Tip"
              multiline
              className="text-[15px] leading-relaxed text-[var(--card-ink)]"
            />
          </div>

          <div>
            <h4 className={cardSectionHeading}>Idiom of the day</h4>
            <div className="rounded-r-lg border-l-[3px] border-[var(--card-or)] bg-[#fbf1e2] p-3.5">
              <EditableText
                value={values.idiom}
                onChange={(v) => update("idiom", v)}
                placeholder="e.g. faire un lunch — to pack a lunch (optional)"
                ariaLabel="Idiom of the day"
                multiline
                className="text-[15px] italic text-[var(--card-rouge)]"
              />
            </div>
          </div>
        </div>
      </div>
```

Note: the back panel's section headings are always visible here, unlike `Flashcard.tsx`, which hides each one when its field is empty. That asymmetry is intentional and is the point of the editor.

- [ ] **Step 3: Verify it compiles**

Run: `npm run typecheck && npm run lint`
Expected: both pass.

- [ ] **Step 4: Commit**

```bash
git add components/admin/CardEditor.tsx
git commit -m "feat: add card editor back panel"
```

---

### Task 6: Swap both admin pages over and delete CardForm

**Files:**
- Modify: `app/admin/page.tsx:7` and `:33`
- Modify: `app/admin/[slug]/page.tsx:5` and `:30-33`
- Delete: `components/admin/CardForm.tsx`

**Interfaces:**
- Consumes: `CardEditor` (Tasks 4-5).
- Produces: nothing.

- [ ] **Step 1: Update `app/admin/page.tsx`**

Change the import on line 7 from:

```tsx
import { CardForm } from "@/components/admin/CardForm";
```

to:

```tsx
import { CardEditor } from "@/components/admin/CardEditor";
```

and the usage on line 33 from `<CardForm initialDate={today} onSubmit={upsertGlobalCard} />` to:

```tsx
<CardEditor initialDate={today} onSubmit={upsertGlobalCard} />
```

- [ ] **Step 2: Update `app/admin/[slug]/page.tsx`**

Same import swap on line 5, and change the usage to:

```tsx
<CardEditor
  initialDate={today}
  onSubmit={upsertOverrideCard.bind(null, group.id)}
/>
```

- [ ] **Step 3: Confirm nothing else imports CardForm**

Run: `grep -rn "CardForm" app components tests`
Expected: no matches outside `components/admin/CardForm.tsx` itself.

- [ ] **Step 4: Delete the old form**

```bash
git rm components/admin/CardForm.tsx
```

- [ ] **Step 5: Verify the whole project**

Run: `npm test && npm run typecheck && npm run lint && npm run build`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add app/admin/page.tsx "app/admin/[slug]/page.tsx"
git commit -m "feat: use the card editor on both admin pages"
```

---

### Task 7: Manual verification pass

The suite is pure-logic only, so the editor's behaviour has to be confirmed in a browser.

**Files:** none.

**Interfaces:** none.

- [ ] **Step 1: Start the app**

Run: `npm run dev`, then sign in and open `/admin`.

- [ ] **Step 2: Check the layout**

Confirm: a labelled `Date *` input, then a `Front` panel, then a `Back` panel below it, then `Save card`. No flip animation, no Flip button, no "tap to reveal the answer" line, and no leftover labelled text fields for subject/usage/prompt/hint/answer/grammar/pronunciation/tip/idiom.

- [ ] **Step 3: Check the required markers**

Confirm the `*` appears on exactly three labels: `Date *`, `Say it in French *`, `The answer *`. Nothing else has one.

- [ ] **Step 4: Check optional fields stay optional**

Fill in only the date, the English prompt, and the French answer. Leave subject, usage, hint, grammar, pronunciation, tip, and idiom blank. Click Save — it must succeed with no validation error.

- [ ] **Step 5: Check the student view**

Open the corresponding `/g/<slug>` page for that date. The card must show the prompt and answer with no empty section headings — no bare "Tip", no bare "Idiom of the day".

- [ ] **Step 6: Check required validation**

Reload `/admin`, clear the English prompt, and click Save. The browser must block the submit rather than saving an empty prompt.

- [ ] **Step 7: Check the date label binding**

Change the Date input. The date label in both the Front and Back panel headers must update to match, and both must show the same day you picked (not the day before).

- [ ] **Step 8: Check the group page**

Repeat steps 2 and 4 on `/admin/<slug>` for an existing group, then confirm the saved override appears in the "Existing overrides" list below and overrides the global card at `/g/<slug>`.

- [ ] **Step 9: Check text growth**

Type several lines into the English prompt and the grammar field. The fields must grow to fit the text instead of showing an inner scrollbar, and the panel must grow with them.

- [ ] **Step 10: Commit any fixes**

If any step above required a fix, commit it:

```bash
git add -A
git commit -m "fix: address card editor verification findings"
```
