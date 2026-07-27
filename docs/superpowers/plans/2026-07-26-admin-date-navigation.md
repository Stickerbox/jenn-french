# Admin Date Navigation and Delete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the admin date a real coordinate — pick a day and the page loads that day's card, or the compose flow if there is none — and let a card be deleted.

**Architecture:** The date moves out of `CardEditor`'s state and into the URL. Both admin pages read a `?date=` searchParam, query that date, and pass `key={initialDate}` to `CardEditor` so React remounts it per date and its `useState` initialisers re-run. A sibling `AdminDatePicker` above the editor navigates. Delete is two new server actions plus an inline confirm in the editor.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript 5 strict, Tailwind v4, Prisma 6 + SQLite, Vitest (node environment).

**Spec:** `docs/superpowers/specs/2026-07-26-admin-date-navigation-design.md`

## Global Constraints

- `parseAdminDate` must **not** clamp future dates. The student page clamps on purpose; the teacher pre-posts ahead on purpose. Clamping here makes future days unreachable.
- `key={initialDate}` on `<CardEditor>` is required in both pages. Without it React reuses the instance across a `?date=` change, the `useState` initialisers never re-run, and nothing in this plan works.
- Every new server action calls `requireTeacher()` first, matching every other write in `app/actions.ts`.
- Every `<button>` added inside the editor's `<form>` must carry `type="button"`. The default is `type="submit"`, so a delete button without it saves the card instead of deleting it.
- Vitest runs with `environment: "node"` and `globals: true`. There is no React Testing Library and no HTTP mocking layer — **do not add either**. Only pure functions get unit tests.
- `lib/admin-date.ts` must import nothing. A test that reaches it must not pull in Prisma.
- Every new module uses the `@/` path alias (configured in both `tsconfig.json` and `vitest.config.ts`).
- TypeScript is `strict` with `isolatedModules: true` — type-only imports must use `import type`.
- Do not change the Prisma schema. Deleting a card is a row delete.
- Commit after every task. Do not push.

---

### Task 1: The date parser

Pure, dependency-free, and the only new logic that can be wrong in an interesting way.

**Files:**
- Create: `lib/admin-date.ts`
- Test: `tests/lib/admin-date.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `export function parseAdminDate(value: string | undefined, today: string): string` — takes the raw searchParam and today as `YYYY-MM-DD`, returns a valid `YYYY-MM-DD`.

- [ ] **Step 1: Write the failing test**

Create `tests/lib/admin-date.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseAdminDate } from "@/lib/admin-date";

const TODAY = "2026-07-26";

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

  it("returns a past date unchanged", () => {
    expect(parseAdminDate("2026-01-15", TODAY)).toBe("2026-01-15");
  });

  it("returns a future date unchanged, without clamping", () => {
    expect(parseAdminDate("2027-03-09", TODAY)).toBe("2027-03-09");
  });

  it("returns today's own date unchanged", () => {
    expect(parseAdminDate(TODAY, TODAY)).toBe(TODAY);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/lib/admin-date.test.ts`
Expected: FAIL — cannot resolve `@/lib/admin-date`.

- [ ] **Step 3: Write the implementation**

Create `lib/admin-date.ts`:

```ts
// Deliberately does NOT clamp future dates the way the student page's
// parseDate does. Students must not read ahead; the teacher pre-posts ahead
// on purpose, and clamping would make those days unreachable from /admin.
export function parseAdminDate(
  value: string | undefined,
  today: string,
): string {
  if (!value) return today;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return today;

  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return today;

  // Date rolls overflow forward: "2026-02-31" parses to March 3rd rather than
  // failing. Comparing the normalised output against the input rejects any
  // value that silently shifted.
  if (parsed.toISOString().slice(0, 10) !== value) return today;

  return value;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/lib/admin-date.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/admin-date.ts tests/lib/admin-date.test.ts
git commit -m "feat: parse the admin date param without clamping the future"
```

---

### Task 2: The delete actions

Server-only. Also corrects the revalidation path on the override upsert, which this task's sibling delete action sits directly beside.

**Files:**
- Modify: `app/actions.ts:73-85` (`upsertOverrideCard`), then append two actions

**Interfaces:**
- Consumes: `requireTeacher`, `prisma`, `revalidatePath` — all already imported in this file.
- Produces:
  - `export async function deleteGlobalCard(dateStr: string): Promise<void>`
  - `export async function deleteOverrideCard(groupId: string, slug: string, dateStr: string): Promise<void>`
  - `upsertOverrideCard` gains a `slug` parameter: `(groupId: string, slug: string, input: CardInput)`

- [ ] **Step 1: Give `upsertOverrideCard` the slug it needs to revalidate correctly**

In `app/actions.ts`, replace the whole `upsertOverrideCard` function with:

```ts
export async function upsertOverrideCard(
  groupId: string,
  slug: string,
  input: CardInput,
) {
  await requireTeacher();

  const date = new Date(`${input.date}T00:00:00Z`);

  await prisma.card.upsert({
    where: { groupId_date: { groupId, date } },
    create: { groupId, date, ...toCardData(input) },
    update: toCardData(input),
  });

  revalidatePath(`/admin/${slug}`);
}
```

The old body revalidated `/admin` — the global page, not the group page it had just written to.

- [ ] **Step 2: Append the two delete actions**

At the end of `app/actions.ts`:

```ts
// deleteMany rather than delete: delete throws P2025 when the row is already
// gone, which turns a double-click or a stale tab into an error the teacher
// cannot act on. Deleting nothing is the same outcome they asked for.
export async function deleteGlobalCard(dateStr: string) {
  await requireTeacher();

  const date = new Date(`${dateStr}T00:00:00Z`);
  await prisma.globalCard.deleteMany({ where: { date } });

  revalidatePath("/admin");
}

export async function deleteOverrideCard(
  groupId: string,
  slug: string,
  dateStr: string,
) {
  await requireTeacher();

  const date = new Date(`${dateStr}T00:00:00Z`);
  await prisma.card.deleteMany({ where: { groupId, date } });

  revalidatePath(`/admin/${slug}`);
}
```

- [ ] **Step 3: Type-check and lint**

Run: `npm run typecheck`
Expected: FAIL, with one error in `app/admin/[slug]/page.tsx` — `upsertOverrideCard.bind(null, group.id)` no longer matches the new three-parameter signature. This is expected and is fixed in Task 5. Confirm the error is **only** that call site and nothing else.

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/actions.ts
git commit -m "feat: add card delete actions, fix override revalidation path

Saving a group override revalidated /admin rather than the group page it
had just written to. The new delete action revalidates the same paths, so
the wrong one could not be left beside the right one."
```

Note: the tree does not typecheck between this task and Task 5. That is expected — the signature change and its call site are reviewed as separate deliverables.

---

### Task 3: The date picker

A client component whose whole job is to turn a date change into a navigation.

**Files:**
- Create: `components/admin/AdminDatePicker.tsx`

**Interfaces:**
- Consumes: `Input` from `@/components/ui/Input`, `useRouter` from `next/navigation`.
- Produces: `export function AdminDatePicker({ basePath, selected }: { basePath: string; selected: string }): ReactElement`

- [ ] **Step 1: Write the component**

Create `components/admin/AdminDatePicker.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/Input";

export function AdminDatePicker({
  basePath,
  selected,
}: {
  basePath: string;
  selected: string;
}) {
  const router = useRouter();

  return (
    <label className="mx-auto mb-6 block w-full max-w-[560px] text-sm font-medium text-[var(--color-ink)]">
      Date
      <Input
        type="date"
        value={selected}
        onChange={(e) => {
          const next = e.target.value;
          // Clearing a date input fires onChange with "". Navigating on that
          // would drop ?date= entirely and bounce the teacher back to today
          // mid-edit, so treat it as no change at all.
          if (!next) return;
          router.push(`${basePath}?date=${next}`, { scroll: false });
        }}
      />
    </label>
  );
}
```

`{ scroll: false }` matches `WeekDayPicker`, which already navigates this way on the student side.

- [ ] **Step 2: Type-check and lint**

Run: `npm run typecheck`
Expected: the single pre-existing `upsertOverrideCard` error from Task 2 and nothing new.

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add components/admin/AdminDatePicker.tsx
git commit -m "feat: add the admin date picker"
```

---

### Task 4: The editor gives up the date and gains delete

**Files:**
- Modify: `components/admin/CardEditor.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `CardEditor` gains one optional prop — `onDelete?: (date: string) => Promise<void>`. `initialDate`, `initialValues`, and `onSubmit` are unchanged.

- [ ] **Step 1: Add the `onDelete` prop**

In `components/admin/CardEditor.tsx`, replace the component signature (currently lines 28-36) with:

```tsx
export function CardEditor({
  initialDate,
  initialValues,
  onSubmit,
  onDelete,
}: {
  initialDate: string;
  initialValues?: Partial<CardInput>;
  onSubmit: (input: CardInput) => Promise<void>;
  onDelete?: (date: string) => Promise<void>;
}) {
```

- [ ] **Step 2: Add the delete state**

Directly after the existing `const [aiError, setAiError] = useState<string | null>(null);` line, add:

```tsx
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
```

- [ ] **Step 3: Add the delete handler**

Directly after the existing `handleSubmit` function, add:

```tsx
  async function handleDelete() {
    if (!onDelete) return;
    setDeleting(true);
    setError(null);
    try {
      await onDelete(values.date);
      // Drop back to compose on the same date, blank. The teacher stays on
      // the day they were looking at, now ready to generate again.
      setValues({
        date: values.date,
        subject: "",
        usage: "",
        pronunciation: "",
        englishPrompt: "",
        hint: "",
        frenchAnswer: "",
        examples: "",
        tip: "",
        idiom: "",
      });
      setConfirmingDelete(false);
      setStage("compose");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the card");
    } finally {
      setDeleting(false);
    }
  }
```

- [ ] **Step 4: Remove the date input**

The date is now owned by the URL. Delete this entire block from the editing-stage form (currently lines 194-202):

```tsx
      <label className="text-sm font-medium text-[var(--color-ink)]">
        Date *
        <Input
          type="date"
          value={values.date}
          onChange={(e) => update("date", e.target.value)}
          required
        />
      </label>
```

Leave everything else in the form untouched. `values.date` is still seeded from `initialDate` and still travels in `CardInput` — it just has no editable control any more.

- [ ] **Step 5: Add the delete affordance**

In the same form, directly after the closing `</Button>` of the Save button and **before** the `{error && (` block, add:

```tsx
      {onDelete &&
        (confirmingDelete ? (
          <div className="flex items-center justify-center gap-4 text-sm">
            <span className="text-[var(--color-ink-muted)]">
              Delete this card?
            </span>
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              disabled={deleting}
              className="text-[var(--color-ink-muted)] underline disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="font-medium text-[var(--color-accent)] underline disabled:opacity-50"
            >
              {deleting ? "Deleting…" : "Delete"}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            className="mx-auto text-sm text-[var(--color-ink-muted)] underline"
          >
            Delete card
          </button>
        ))}
```

All three buttons carry `type="button"`. They sit inside the editor's `<form>`, where the default `type="submit"` would make "Delete card" save the card instead.

This block is inside the editing-stage return, so it never renders during compose — there is nothing to delete from there.

- [ ] **Step 6: Type-check, lint, and run the suite**

Run: `npm run typecheck`
Expected: the single pre-existing `upsertOverrideCard` error from Task 2 and nothing new. In particular, no unused-import error for `Input` — the compose stage still uses it.

Run: `npm run lint && npm test`
Expected: PASS, 35 tests.

- [ ] **Step 7: Commit**

```bash
git add components/admin/CardEditor.tsx
git commit -m "feat: move the date out of the editor, add delete

The date input edited the record rather than selecting a day, so changing
it retargeted the loaded card at another date and saved a duplicate. The
URL owns the date now; delete returns the day to the compose flow."
```

---

### Task 5: Wire both admin pages

The integration task — where `?date=`, the picker, the remount key, and delete all meet.

**Files:**
- Modify: `app/admin/page.tsx`
- Modify: `app/admin/[slug]/page.tsx`

**Interfaces:**
- Consumes: `parseAdminDate` (Task 1); `deleteGlobalCard`, `deleteOverrideCard`, and the new three-parameter `upsertOverrideCard` (Task 2); `AdminDatePicker` (Task 3); `CardEditor`'s `onDelete` prop (Task 4).
- Produces: nothing later tasks consume.

- [ ] **Step 1: Rewrite the global admin page**

Replace the whole of `app/admin/page.tsx` with:

```tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentTeacher } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import {
  upsertGlobalCard,
  createGroup,
  deleteGlobalCard,
} from "@/app/actions";
import { logout } from "@/app/auth-actions";
import { CardEditor } from "@/components/admin/CardEditor";
import { AdminDatePicker } from "@/components/admin/AdminDatePicker";
import { NewGroupForm } from "@/components/admin/NewGroupForm";
import { toCardFormValues } from "@/lib/cards";
import { parseAdminDate } from "@/lib/admin-date";

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const teacher = await getCurrentTeacher();
  if (!teacher) redirect("/login");

  const { date } = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const selected = parseAdminDate(date, today);
  const selectedDate = new Date(`${selected}T00:00:00Z`);

  const groups = await prisma.group.findMany({ orderBy: { name: "asc" } });
  const existingCard = await prisma.globalCard.findUnique({
    where: { date: selectedDate },
  });

  return (
    <main className="min-h-screen bg-[var(--color-bg)] px-4 py-12">
      <div className="mx-auto max-w-xl">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="font-[var(--font-display)] text-3xl italic text-[var(--color-ink)]">
            Daily word
          </h1>
          <form action={logout}>
            <button
              type="submit"
              className="font-[var(--font-body)] text-sm text-[var(--color-ink-muted)] underline"
            >
              Log out
            </button>
          </form>
        </div>

        <AdminDatePicker basePath="/admin" selected={selected} />

        <CardEditor
          key={selected}
          initialDate={selected}
          initialValues={toCardFormValues(existingCard)}
          onSubmit={upsertGlobalCard}
          onDelete={deleteGlobalCard}
        />

        <h2 className="mb-4 mt-12 font-[var(--font-display)] text-2xl italic text-[var(--color-ink)]">
          Groups
        </h2>
        <ul className="mb-6 flex flex-col gap-2">
          {groups.map((group) => (
            <li key={group.id}>
              <Link
                href={`/admin/${group.slug}`}
                className="text-[var(--color-accent)] underline"
              >
                {group.name} (/g/{group.slug})
              </Link>
            </li>
          ))}
          {groups.length === 0 && (
            <li className="text-sm text-[var(--color-ink-muted)]">
              No groups yet.
            </li>
          )}
        </ul>
        <NewGroupForm onSubmit={createGroup} />
      </div>
    </main>
  );
}
```

Two things to notice. `key={selected}` is the line the whole feature rests on. And the heading changed from "Today's word" to "Daily word", because the page is no longer always about today.

- [ ] **Step 2: Rewrite the group admin page**

Replace the whole of `app/admin/[slug]/page.tsx` with:

```tsx
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getCurrentTeacher } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { upsertOverrideCard, deleteOverrideCard } from "@/app/actions";
import { CardEditor } from "@/components/admin/CardEditor";
import { AdminDatePicker } from "@/components/admin/AdminDatePicker";
import { toCardFormValues } from "@/lib/cards";
import { parseAdminDate } from "@/lib/admin-date";

export default async function GroupAdminPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  const teacher = await getCurrentTeacher();
  if (!teacher) redirect("/login");

  const { slug } = await params;
  const { date } = await searchParams;

  const group = await prisma.group.findUnique({
    where: { slug },
    include: { cards: { orderBy: { date: "desc" } } },
  });
  if (!group) notFound();

  const today = new Date().toISOString().slice(0, 10);
  const selected = parseAdminDate(date, today);
  const selectedDate = new Date(`${selected}T00:00:00Z`);

  // group.cards is already the group's full card list (fetched above), so
  // find the selected date's override there instead of issuing a second query.
  const existingCard =
    group.cards.find((card) => card.date.getTime() === selectedDate.getTime()) ??
    null;

  return (
    <main className="min-h-screen bg-[var(--color-bg)] px-4 py-12">
      <div className="mx-auto max-w-xl">
        <h1 className="mb-8 font-[var(--font-display)] text-3xl italic text-[var(--color-ink)]">
          {group.name} overrides
        </h1>

        <AdminDatePicker basePath={`/admin/${slug}`} selected={selected} />

        <CardEditor
          key={selected}
          initialDate={selected}
          initialValues={toCardFormValues(existingCard)}
          onSubmit={upsertOverrideCard.bind(null, group.id, group.slug)}
          onDelete={deleteOverrideCard.bind(null, group.id, group.slug)}
        />

        <h2 className="mb-4 mt-12 font-[var(--font-display)] text-2xl italic text-[var(--color-ink)]">
          Existing overrides
        </h2>
        <ul className="flex flex-col gap-1 font-[var(--font-body)] text-sm text-[var(--color-ink-muted)]">
          {group.cards.map((card) => {
            const cardDate = card.date.toISOString().slice(0, 10);
            return (
              <li key={card.id}>
                <Link
                  href={`/admin/${slug}?date=${cardDate}`}
                  className="text-[var(--color-accent)] underline"
                >
                  {cardDate}
                </Link>{" "}
                — {card.frenchAnswer}
              </li>
            );
          })}
          {group.cards.length === 0 && <li>No overrides yet.</li>}
        </ul>
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Type-check, lint, and run the suite**

Run: `npm run typecheck`
Expected: PASS. The `upsertOverrideCard` error introduced in Task 2 is resolved here by the updated `.bind` call.

Run: `npm run lint && npm test`
Expected: PASS, 35 tests.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: PASS. If Apple Silicon SWC bindings fail, use `npm run build -- --webpack`.

- [ ] **Step 5: Commit**

```bash
git add app/admin/page.tsx app/admin/[slug]/page.tsx
git commit -m "feat: drive the admin pages from a date param

Both pages read ?date=, query that date, and key the editor on it so React
remounts per date and the compose/editing decision is made again. The
overrides list links to its own dates."
```

---

### Task 6: Verify end to end

Nothing above exercises the browser, and the whole point of the feature is a navigation.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`
Then sign in at `http://localhost:3000/login` with your passkey.

- [ ] **Step 2: The core path**

1. Open `/admin`. It shows today, exactly as before.
2. Change the date to a day with **no** card. The URL becomes `/admin?date=...` and the page shows the three compose fields and a disabled Generate. **This is the behaviour the whole plan exists for.**
3. Change to a day that **has** a card. It opens in the editor, populated with that card.
4. Change back and forth once more. Confirm the editor never shows the previous date's content — that is the remount key doing its job.

- [ ] **Step 3: The save hazard is gone**

1. Navigate to an empty future date, generate, and save.
2. Go back to today. Today's card must be **unchanged** — the old behaviour would have written today's content onto the other date.
3. Confirm the new card exists on the date you chose.

- [ ] **Step 4: Delete**

1. On a date with a card, click "Delete card". Confirm the inline `Delete this card?` appears with Cancel and Delete.
2. Click Cancel. The card is still there.
3. Click Delete card, then Delete. The same date drops to the compose flow with three empty fields.
4. Reload. The card is still gone.

- [ ] **Step 5: The group page**

1. Open `/admin/<a-group-slug>`. Confirm the date picker and delete behave identically.
2. Confirm the "Existing overrides" rows are links, and clicking one navigates to that date.
3. Create an override for a date that also has a global card. Delete the override. Open `/g/<slug>?date=` for that date and confirm the group now shows the **global** word rather than nothing.

- [ ] **Step 6: Students still cannot read ahead**

Open `/g/<slug>?date=` with a future date that you pre-posted. It must still clamp to today — only the admin side allows the future.

- [ ] **Step 7: Final check**

Run: `npm run lint && npm run typecheck && npm test && npm run build`
Expected: all pass.

Confirm `git status` is clean.

---

## Self-Review

**Spec coverage.** Date in the URL → Tasks 1 and 5. No clamping → Task 1 (tested explicitly). `key={initialDate}` → Task 5 Step 1 and Step 2, verified in Task 6 Step 2.4. Picker as a page-level sibling → Tasks 3 and 5. Editor loses the date input → Task 4 Step 4, hazard verified in Task 6 Step 3. Delete actions → Task 2. Delete UI with inline confirm → Task 4 Step 5, verified in Task 6 Step 4. Override fallback semantics → verified in Task 6 Step 5.3. Overrides list links → Task 5 Step 2. `revalidatePath` fix → Task 2 Step 1. `parseAdminDate` in its own Prisma-free module → Task 1. Testing → Task 1 only, matching the spec's statement that it is the sole new pure logic.

**Placeholders.** None: every code step carries the code, and every run step carries the command and its expected result — including the two steps where the expected result is a specific, deliberate failure.

**Type consistency.** `parseAdminDate(value, today) => string` is defined in Task 1 and called in Task 5 with `(date, today)`. `deleteGlobalCard(dateStr)` and `deleteOverrideCard(groupId, slug, dateStr)` are defined in Task 2; Task 5 binds the latter's first two parameters, leaving `(dateStr) => Promise<void>`, which matches `CardEditor`'s `onDelete?: (date: string) => Promise<void>` from Task 4. `upsertOverrideCard(groupId, slug, input)` is widened in Task 2 and its only call site updated in Task 5. `AdminDatePicker({ basePath, selected })` is defined in Task 3 and used with both prop names in Task 5.

**Deliberate cross-task breakage.** Task 2 widens `upsertOverrideCard` and Task 5 fixes its call site, so `npm run typecheck` fails on exactly one known line for Tasks 2, 3, and 4. Each of those tasks states the expected error. The alternative — folding the signature change into Task 5 — would have bundled a bug fix into the integration task and made the delete actions unreviewable on their own.
