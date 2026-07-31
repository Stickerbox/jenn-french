# Pinned Pages and Dated Sections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Jenn pin a page so it sits at the top of both her list and every student's shelf, and group everything unpinned under headings saying roughly when it arrived.

**Architecture:** One nullable `pinnedAt` column. One pure `sectionPages` in `lib/` that takes pages and today and returns ordered sections keyed — not labelled — so each surface keeps its own language. One server action to toggle. Both list components render the same sections with their own copy.

**Tech Stack:** Next.js 16 (App Router, server actions), React 19, Prisma 6 + SQLite, Tailwind v4 via PostCSS, Vitest, TypeScript.

**Design spec:** `docs/superpowers/specs/2026-07-31-page-pinning-and-sections-design.md` — read it before starting.

**Branch:** `page-pinning-sections`, already checked out. Do not create or switch branches.

## Global Constraints

- **Imports use the `@/` alias** for repo-root-relative paths.
- **Logic belongs in `lib/`** as pure functions with a test in `tests/lib/`. Components and Prisma access are *not* unit-tested in this repo — do not add component tests.
- **Every date is UTC midnight** and formatted with `timeZone: "UTC"`. Never use local-time getters (`getMonth`, `getDate`) — always `getUTCMonth`, `getUTCDate`, `getUTCFullYear`.
- **The teaching week runs Monday–Friday** (`lib/week.ts`). Both weekend days belong to the week that just ended.
- **Every mutating server action starts with a teacher check.** `requireTeacher()` already exists in `app/page-actions.ts`.
- **Deletes and now updates use `deleteMany`/`updateMany`** so a double-click or a stale tab is a no-op rather than a P2025.
- **Comments explain the "why", especially the counter-intuitive.** Do not add comments that restate the code.
- **Repeated flashcard class strings live in `components/card-styles.ts`.**
- **The flashcard palette is `--card-*`.** Do not introduce `--color-*` tokens into these tiles or headings.
- **"Student" is the UI word, "Group" is the code word.** `group` in `lib/`, `prisma/` and route segments; `student` in copy.
- **Verification**, in CI order: `npx prisma generate`, `npm run lint`, `npx tsc --noEmit`, `npm test`, `npm run build`.

## Note on one deliberate deviation from the spec

The spec says the section *labels* live in each list component. This plan puts them in `lib/page-section-labels.ts` instead, with tests. They are a pure mapping plus a locale-dependent month format — testable logic, which the standing convention places in `lib/`. `sectionPages` itself stays label-free, so the separation the spec cared about (the rule does not know who is asking) is preserved.

---

### Task 1: The column

Schema, migration, and reading the new field. No behaviour changes yet — the field is selected and ignored.

**Files:**
- Modify: `prisma/schema.prisma` — the `Page` model
- Create: a migration under `prisma/migrations/` (generated, not hand-written)
- Modify: `lib/pages.ts` — three `select` blocks and one mapped return

**Interfaces:**
- Consumes: nothing.
- Produces: `Page.pinnedAt: Date | null`, present on every object returned by `listPagesForGroup` and `listPagesForAdmin`. Tasks 2, 5 and 6 rely on it.

- [ ] **Step 1: Add the column**

In `prisma/schema.prisma`, inside `model Page`, add `pinnedAt` after `createdAt`:

```prisma
model Page {
  id        String      @id @default(cuid())
  slug      String      @unique
  title     String
  html      String
  createdAt DateTime    @default(now())
  // Null means unpinned. A timestamp rather than a boolean so pinned pages can
  // order by WHEN they were pinned — a boolean would leave them sorted by
  // creation date, which is the ordering pinning exists to override.
  pinnedAt  DateTime?
  updatedAt DateTime    @updatedAt
  groups    PageGroup[]
}
```

- [ ] **Step 2: Generate the migration**

Run: `npx prisma migrate dev --name add_page_pinning`
Expected: a new directory under `prisma/migrations/`, and the client regenerated. Every existing row gets `pinnedAt = NULL`, which is correct — no backfill.

- [ ] **Step 3: Select the field**

In `lib/pages.ts`, add `pinnedAt: true` to the `select` of BOTH queries inside `listPagesForGroup`:

```ts
  const [own, everyone] = await Promise.all([
    prisma.page.findMany({
      where: { groups: { some: { groupId } } },
      orderBy: { createdAt: "desc" },
      select: { id: true, slug: true, title: true, createdAt: true, pinnedAt: true },
    }),
    prisma.page.findMany({
      where: { groups: { some: { group: { isEveryone: true } } } },
      orderBy: { createdAt: "desc" },
      select: { id: true, slug: true, title: true, createdAt: true, pinnedAt: true },
    }),
  ]);
```

Then in `listPagesForAdmin`, add `pinnedAt: true` to its `select`, and `pinnedAt: page.pinnedAt,` to the object it maps each page into, beside `createdAt`.

Leave `getPageBySlug` and `getPageForAdmin` alone — neither renders a tile.

- [ ] **Step 4: Verify**

Run: `npx prisma generate && npx tsc --noEmit && npm run lint && npm test && npm run build`
Expected: all clean, 294 tests passing. Nothing consumes `pinnedAt` yet, so nothing should change behaviourally.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations lib/pages.ts
git commit -m "feat: add Page.pinnedAt and read it in the list queries"
```

---

### Task 2: The sectioning rule

The heart of the feature, and the only part with real logic. Pure, in `lib/`, TDD.

**Files:**
- Create: `lib/page-sections.ts`
- Create: `tests/lib/page-sections.test.ts`

**Interfaces:**
- Consumes: `weekRange` from `@/lib/week`.
- Produces:
  - `type SectionKey = { kind: "pinned" } | { kind: "thisWeek" } | { kind: "lastWeek" } | { kind: "month"; year: number; month: number }` — `month` is 0-indexed, matching `getUTCMonth()` and the `MONTHS` array in `lib/week.ts`
  - `type PageSection<T> = { key: SectionKey; pages: T[] }`
  - `sectionPages<T extends { createdAt: Date; pinnedAt: Date | null }>(pages: T[], today: Date): PageSection<T>[]`
  - Tasks 3, 5 and 6 rely on these.

- [ ] **Step 1: Write the failing test**

Create `tests/lib/page-sections.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { sectionPages } from "@/lib/page-sections";

const at = (iso: string) => new Date(`${iso}T00:00:00Z`);

// Friday. This week is Mon 27 - Fri 31 July; last week is Mon 20 - Fri 24.
const TODAY = at("2026-07-31");

const page = (id: string, created: string, pinned?: string) => ({
  id,
  createdAt: at(created),
  pinnedAt: pinned ? at(pinned) : null,
});

const kinds = (sections: { key: { kind: string } }[]) =>
  sections.map((s) => s.key.kind);

const ids = (section: { pages: { id: string }[] }) =>
  section.pages.map((p) => p.id);

describe("sectionPages", () => {
  it("returns nothing for no pages", () => {
    expect(sectionPages([], TODAY)).toEqual([]);
  });

  it("puts a page from today in this week", () => {
    const result = sectionPages([page("a", "2026-07-31")], TODAY);
    expect(kinds(result)).toEqual(["thisWeek"]);
  });

  it("puts Monday of this week in this week, and the Friday before in last week", () => {
    const result = sectionPages(
      [page("mon", "2026-07-27"), page("fri", "2026-07-24")],
      TODAY,
    );
    expect(kinds(result)).toEqual(["thisWeek", "lastWeek"]);
    expect(ids(result[0])).toEqual(["mon"]);
    expect(ids(result[1])).toEqual(["fri"]);
  });

  // weekRange ends on Friday. A closed range would drop this page into a month
  // section BELOW pages a week older than it.
  it("keeps a Saturday page in the week that just ended", () => {
    const saturday = at("2026-08-01");
    const result = sectionPages([page("sat", "2026-08-01")], saturday);
    expect(kinds(result)).toEqual(["thisWeek"]);
  });

  it("splits everything older into one section per month, newest first", () => {
    const result = sectionPages(
      [page("jul", "2026-07-06"), page("jun", "2026-06-15")],
      TODAY,
    );
    expect(result.map((s) => s.key)).toEqual([
      { kind: "month", year: 2026, month: 6 },
      { kind: "month", year: 2026, month: 5 },
    ]);
  });

  it("keeps two Julys a year apart in two sections", () => {
    const result = sectionPages(
      [page("new", "2026-07-06"), page("old", "2025-07-06")],
      TODAY,
    );
    expect(result.map((s) => s.key)).toEqual([
      { kind: "month", year: 2026, month: 6 },
      { kind: "month", year: 2025, month: 6 },
    ]);
  });

  it("lifts a pinned page out of its date section", () => {
    const result = sectionPages([page("p", "2025-01-05", "2026-07-30")], TODAY);
    expect(kinds(result)).toEqual(["pinned"]);
    expect(ids(result[0])).toEqual(["p"]);
  });

  it("orders pinned pages by when they were pinned, not when they were made", () => {
    const result = sectionPages(
      [
        page("madeLast", "2026-06-01", "2026-07-01"),
        page("pinnedLast", "2026-01-01", "2026-07-29"),
      ],
      TODAY,
    );
    expect(ids(result[0])).toEqual(["pinnedLast", "madeLast"]);
  });

  it("orders every other section newest first", () => {
    const result = sectionPages(
      [page("older", "2026-07-27"), page("newer", "2026-07-30")],
      TODAY,
    );
    expect(ids(result[0])).toEqual(["newer", "older"]);
  });

  it("puts pinned first, then this week, then last week, then months", () => {
    const result = sectionPages(
      [
        page("month", "2026-05-02"),
        page("last", "2026-07-22"),
        page("this", "2026-07-29"),
        page("pin", "2026-05-02", "2026-07-30"),
      ],
      TODAY,
    );
    expect(kinds(result)).toEqual([
      "pinned",
      "thisWeek",
      "lastWeek",
      "month",
    ]);
  });

  it("omits sections with no pages", () => {
    const result = sectionPages([page("a", "2026-07-29")], TODAY);
    expect(result).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/lib/page-sections.test.ts`
Expected: FAIL — cannot resolve `@/lib/page-sections`.

- [ ] **Step 3: Write the implementation**

Create `lib/page-sections.ts`:

```ts
import { weekRange } from "@/lib/week";

// `month` is 0-indexed, matching getUTCMonth() and the MONTHS array in
// lib/week.ts, so a label can index straight into it.
export type SectionKey =
  | { kind: "pinned" }
  | { kind: "thisWeek" }
  | { kind: "lastWeek" }
  | { kind: "month"; year: number; month: number };

export type PageSection<T> = { key: SectionKey; pages: T[] };

type Sectionable = { createdAt: Date; pinnedAt: Date | null };

// Keys, not labels. The admin says "This week" and the student says "Cette
// semaine"; a function returning display strings would have to know which
// surface called it, and the rule and the copy would be stuck in one file.
export function sectionPages<T extends Sectionable>(
  pages: T[],
  today: Date,
): PageSection<T>[] {
  const thisWeekStart = weekRange(today).start;
  const lastWeekStart = new Date(thisWeekStart);
  lastWeekStart.setUTCDate(lastWeekStart.getUTCDate() - 7);

  const pinned: T[] = [];
  const thisWeek: T[] = [];
  const lastWeek: T[] = [];
  // Keyed by year AND month so two Julys a year apart stay two sections.
  const months = new Map<string, T[]>();

  for (const page of pages) {
    if (page.pinnedAt) {
      // Only here, never also under its date: "always at the top" means one
      // place, not two.
      pinned.push(page);
    } else if (page.createdAt >= thisWeekStart) {
      // No upper bound. weekRange ends on Friday, so a closed range would drop
      // a page added on the Saturday into a month section below pages a week
      // older than it — and the weekend belongs to the week that just ended
      // everywhere else in this project too.
      thisWeek.push(page);
    } else if (page.createdAt >= lastWeekStart) {
      lastWeek.push(page);
    } else {
      const key = `${page.createdAt.getUTCFullYear()}-${page.createdAt.getUTCMonth()}`;
      const bucket = months.get(key);
      if (bucket) bucket.push(page);
      else months.set(key, [page]);
    }
  }

  const byNewest = (a: T, b: T) => b.createdAt.getTime() - a.createdAt.getTime();

  const sections: PageSection<T>[] = [];

  if (pinned.length > 0) {
    sections.push({
      key: { kind: "pinned" },
      // By pinnedAt, not createdAt — the whole reason the column is a
      // timestamp. The ?? 0 is unreachable: every page in here has one.
      pages: [...pinned].sort(
        (a, b) => (b.pinnedAt?.getTime() ?? 0) - (a.pinnedAt?.getTime() ?? 0),
      ),
    });
  }

  if (thisWeek.length > 0) {
    sections.push({ key: { kind: "thisWeek" }, pages: [...thisWeek].sort(byNewest) });
  }

  if (lastWeek.length > 0) {
    sections.push({ key: { kind: "lastWeek" }, pages: [...lastWeek].sort(byNewest) });
  }

  const monthSections = [...months.values()]
    .map((bucket) => {
      const sorted = [...bucket].sort(byNewest);
      return {
        key: {
          kind: "month" as const,
          year: sorted[0].createdAt.getUTCFullYear(),
          month: sorted[0].createdAt.getUTCMonth(),
        },
        pages: sorted,
      };
    })
    .sort((a, b) => b.key.year - a.key.year || b.key.month - a.key.month);

  return [...sections, ...monthSections];
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/lib/page-sections.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/page-sections.ts tests/lib/page-sections.test.ts
git commit -m "feat: group pages into pinned and dated sections"
```

---

### Task 3: The labels and the action

The two label mappings, and the server action that toggles a pin.

**Files:**
- Create: `lib/page-section-labels.ts`
- Create: `tests/lib/page-section-labels.test.ts`
- Modify: `app/page-actions.ts` — add `setPagePinned`, and one line in `revalidatePages`

**Interfaces:**
- Consumes: `SectionKey` from `@/lib/page-sections`, `MONTHS` from `@/lib/week`, `requireTeacher` and `revalidatePages` (both already in `app/page-actions.ts`).
- Produces:
  - `adminSectionLabel(key: SectionKey): string`
  - `studentSectionLabel(key: SectionKey): string`
  - `setPagePinned(slug: string, pinned: boolean): Promise<void>`
  - Tasks 5 and 6 rely on all three.

- [ ] **Step 1: Write the failing label test**

Create `tests/lib/page-section-labels.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  adminSectionLabel,
  studentSectionLabel,
} from "@/lib/page-section-labels";

describe("adminSectionLabel", () => {
  it("names the three fixed sections", () => {
    expect(adminSectionLabel({ kind: "pinned" })).toBe("Pinned");
    expect(adminSectionLabel({ kind: "thisWeek" })).toBe("This week");
    expect(adminSectionLabel({ kind: "lastWeek" })).toBe("Last week");
  });

  // The year is always present: a shelf spanning a year boundary would
  // otherwise show two headings both reading "JULY".
  it("names a month with its year", () => {
    expect(adminSectionLabel({ kind: "month", year: 2026, month: 6 })).toBe(
      "JULY 2026",
    );
  });
});

describe("studentSectionLabel", () => {
  it("names the three fixed sections in French", () => {
    expect(studentSectionLabel({ kind: "pinned" })).toBe("Épinglé");
    expect(studentSectionLabel({ kind: "thisWeek" })).toBe("Cette semaine");
    expect(studentSectionLabel({ kind: "lastWeek" })).toBe("La semaine dernière");
  });

  it("names a month in French with its year", () => {
    expect(studentSectionLabel({ kind: "month", year: 2026, month: 6 })).toBe(
      "JUILLET 2026",
    );
  });

  it("names January, the month index most likely to be off by one", () => {
    expect(studentSectionLabel({ kind: "month", year: 2026, month: 0 })).toBe(
      "JANVIER 2026",
    );
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/lib/page-section-labels.test.ts`
Expected: FAIL — cannot resolve `@/lib/page-section-labels`.

- [ ] **Step 3: Write the labels**

Create `lib/page-section-labels.ts`:

```ts
import type { SectionKey } from "@/lib/page-sections";
import { MONTHS } from "@/lib/week";

export function adminSectionLabel(key: SectionKey): string {
  switch (key.kind) {
    case "pinned":
      return "Pinned";
    case "thisWeek":
      return "This week";
    case "lastWeek":
      return "Last week";
    case "month":
      // MONTHS is already uppercase and 0-indexed, like key.month.
      return `${MONTHS[key.month]} ${key.year}`;
  }
}

export function studentSectionLabel(key: SectionKey): string {
  switch (key.kind) {
    case "pinned":
      return "Épinglé";
    case "thisWeek":
      return "Cette semaine";
    case "lastWeek":
      return "La semaine dernière";
    case "month":
      // Built through the same fr-CA/UTC path the student's dates already take,
      // rather than a second hand-written month table to keep in step.
      return new Date(Date.UTC(key.year, key.month, 1))
        .toLocaleDateString("fr-CA", {
          month: "long",
          year: "numeric",
          timeZone: "UTC",
        })
        .toUpperCase();
  }
}
```

- [ ] **Step 4: Run the label tests**

Run: `npx vitest run tests/lib/page-section-labels.test.ts`
Expected: PASS, 5 tests.

If the French month assertions fail, print what `studentSectionLabel` actually returned and report it rather than editing the test to match — the fr-CA long month for July is "juillet", so `"JUILLET 2026"` is expected. A mismatch means the format options are wrong, not the expectation.

- [ ] **Step 5: Add the server action**

In `app/page-actions.ts`, add one line to `revalidatePages` — the student shelf shows pages too, and pinning changes their order there:

```ts
function revalidatePages(slug: string) {
  revalidatePath("/admin");
  revalidatePath(`/admin/pages/${slug}`);
  revalidatePath(`/p/${slug}`);
  revalidatePath("/f/[token]", "page");
  // The files tab lives here as well, and a pin reorders it.
  revalidatePath("/g/[slug]", "page");
}
```

Then add the action at the end of the file:

```ts
export async function setPagePinned(
  slug: string,
  pinned: boolean,
): Promise<void> {
  await requireTeacher();

  // updateMany rather than update, for the reason deletePage uses deleteMany:
  // a stale tab pinning a page that has since been deleted should be a no-op,
  // not a P2025 the teacher cannot act on.
  await prisma.page.updateMany({
    where: { slug },
    data: { pinnedAt: pinned ? new Date() : null },
  });

  revalidatePages(slug);
}
```

- [ ] **Step 6: Verify everything**

Run: `npx tsc --noEmit && npm run lint && npm test && npm run build`
Expected: all clean, 310 tests passing.

- [ ] **Step 7: Commit**

```bash
git add lib/page-section-labels.ts tests/lib/page-section-labels.test.ts app/page-actions.ts
git commit -m "feat: add section labels and the pin toggle action"
```

---

### Task 4: The badge slot, the pin icon, and the heading style

Shared presentation pieces both lists need. Nothing renders them yet.

**Files:**
- Create: `components/ui/PinIcon.tsx`
- Modify: `components/ui/PageTile.tsx` — one new optional prop
- Modify: `components/card-styles.ts` — append one class string

**Interfaces:**
- Consumes: `cn` from `@/lib/utils`.
- Produces:
  - `PinIcon({ filled }: { filled?: boolean })`
  - `PageTile`'s new `badge?: ReactNode` prop
  - `pageSectionHeading: string` from `components/card-styles.ts`
  - Tasks 5 and 6 rely on all three.

- [ ] **Step 1: Write the pin icon**

Create `components/ui/PinIcon.tsx`:

```tsx
// Hand-rolled rather than pulled from lucide, matching the other icons in this
// project: a pin head, a shaft, and the two shoulders that make it read as a
// pin rather than a nail.
export function PinIcon({ filled = false }: { filled?: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 17v5" />
      <path d="M9 3h6l-1 6 3 3v2H7v-2l3-3-1-6Z" />
    </svg>
  );
}
```

- [ ] **Step 2: Add the heading class**

Append to `components/card-styles.ts`:

```ts
// The heading above a run of tiles. A rule runs from the words to the end of
// the row so the sections read as bands across the grid rather than as words
// floating above the first tile.
export const pageSectionHeading =
  "mb-3 mt-8 flex items-center gap-3 font-[family-name:var(--card-font-mono)] text-[11px] uppercase tracking-[2px] text-[var(--card-bleu)] first:mt-0 after:h-px after:flex-1 after:bg-[var(--card-line)]";
```

- [ ] **Step 3: Add the badge slot to `PageTile`**

In `components/ui/PageTile.tsx`, add `badge` to the destructured props and to the type:

```tsx
export function PageTile({
  href,
  title,
  eyebrow,
  preview,
  badge,
  action,
  className,
}: {
  href: string;
  title: string;
  eyebrow: string;
  // A node rather than a slug, deliberately. Support for links to pages we do
  // not host is planned; that variant passes its own renderer here and this
  // component does not change, because it never learns what kind of thing it
  // is previewing. A cross-origin URL generally cannot be framed at all, so
  // that renderer will not be HtmlPreview with a different src.
  preview: ReactNode;
  // A marker over the preview's corner — today a pin. A slot for the same
  // reason as `preview`: the tile does not learn what a pin is, and a later
  // marker needs no change here. Decorative only; it never takes a click.
  badge?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
```

Then render it immediately after `{preview}`, inside the frame:

```tsx
      {preview}

      {/* pointer-events-none so the marker never eats the tile's stretched
          link. The interactive pin lives in `action`, in the footer. */}
      {badge && (
        <div className="pointer-events-none absolute right-2 top-2 z-10">
          {badge}
        </div>
      )}
```

`pageTileFrame` already carries `relative`, so `absolute` resolves against the tile.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npm run lint && npm test && npm run build`
Expected: all clean. `badge` is optional, so both existing callers still typecheck untouched.

- [ ] **Step 5: Commit**

```bash
git add components/ui/PinIcon.tsx components/ui/PageTile.tsx components/card-styles.ts
git commit -m "feat: add the pin icon, a tile badge slot, and the section heading"
```

---

### Task 5: The admin list

Sections, the pin control, and the label mapping, in the teacher's Pages tab.

**Files:**
- Modify: `components/admin/PageList.tsx` — `PageSummary`, imports, a new prop, the list render
- Modify: `app/admin/page.tsx` — pass the action down

**Interfaces:**
- Consumes: `sectionPages` (Task 2), `adminSectionLabel` (Task 3), `setPagePinned` (Task 3), `PinIcon`, `pageSectionHeading`, `PageTile`'s `badge` (Task 4).
- Produces: `PageList`'s new required prop `onTogglePin: (slug: string, pinned: boolean) => Promise<void>`.

- [ ] **Step 1: Extend `PageSummary` and the imports**

In `components/admin/PageList.tsx`, add `pinnedAt` to the exported type:

```tsx
export type PageSummary = {
  id: string;
  slug: string;
  title: string;
  createdAt: Date;
  pinnedAt: Date | null;
  groupNames: string[];
  sharedWithEveryone: boolean;
};
```

Add these imports beside the existing ones:

```tsx
import { PinIcon } from "@/components/ui/PinIcon";
import { pageGrid, pageSectionHeading } from "@/components/card-styles";
import { sectionPages } from "@/lib/page-sections";
import { adminSectionLabel } from "@/lib/page-section-labels";
```

(The existing `import { pageGrid } from "@/components/card-styles";` is replaced by the two-name version above — do not leave both.)

- [ ] **Step 2: Take the action as a prop**

`PageList` is a `"use client"` component, so it cannot import a server action's module directly; the action is passed in, the way `GroupList` already takes `onDelete`. Change the signature:

```tsx
export function PageList({
  pages,
  everyoneName,
  onTogglePin,
}: {
  pages: PageSummary[];
  // Read from the flagged row rather than from a constant: the name is the
  // teacher's to change, and a stale literal here would silently stop a
  // student's chip widening to their inherited pages.
  everyoneName: string | null;
  onTogglePin: (slug: string, pinned: boolean) => Promise<void>;
  // Passed in rather than read as `new Date()` here. This is a client
  // component that also renders on the server, and a clock read on both sides
  // of hydration can straddle a week boundary and produce different sections
  // for the same list — a hydration mismatch that would appear once a week, at
  // midnight, and be unreproducible by daylight.
  today: Date;
}) {
```

- [ ] **Step 3: Section the filtered list**

Immediately after the existing `const visible = filterPagesByGroup(...)` line, add:

```tsx
  // Sections form over the FILTERED set, not the whole list — a heading above
  // nothing would be a bug the search field caused.
  const sections = sectionPages(visible, today);
```

- [ ] **Step 4: Replace the single grid with one grid per section**

Replace the whole `{visible.length === 0 ? ( ... ) : ( <ul className={pageGrid}> ... </ul> )}` expression with:

```tsx
      {sections.length === 0 ? (
        <p className="text-center text-sm text-[var(--color-ink-muted)]">
          Nothing matches that.
        </p>
      ) : (
        sections.map((section) => (
          <section key={`${section.key.kind}-${adminSectionLabel(section.key)}`}>
            <h3 className={pageSectionHeading}>
              {adminSectionLabel(section.key)}
            </h3>

            <ul className={pageGrid}>
              {section.pages.map((page) => (
                <li key={page.id}>
                  {/* The tile opens the page, the way the student's does, and
                      the way the thumbnail already promises. /p/[slug] is the
                      page itself, sandboxed exactly as a student gets it — a
                      page has no group-scoped URL, so this is the link
                      whatever groups it belongs to. Editing moved to its own
                      icon: the preview is what she recognises a page by, so
                      following it should show her the page, not a form. */}
                  <PageTile
                    href={`/p/${page.slug}`}
                    title={page.title}
                    eyebrow={`${formatLongDate(page.createdAt)} · ${pageAudienceLabel(page)}`}
                    preview={<HtmlPreview slug={page.slug} />}
                    action={
                      <div className="flex items-center gap-1">
                        <Link
                          href={`/admin/pages/${page.slug}`}
                          aria-label={`Edit ${page.title}`}
                          title="Edit"
                          className={pageActionClass}
                        >
                          <PencilIcon />
                        </Link>

                        {/* No server support needed: `download` on a
                            same-origin response forces a save-as, so the raw
                            route keeps its exact behaviour and its CSP, and no
                            new authenticated surface appears. That route is
                            already public. */}
                        <a
                          href={`/p/${page.slug}/raw`}
                          download={`${page.slug}.html`}
                          aria-label={`Download ${page.title}`}
                          title="Download"
                          className={pageActionClass}
                        >
                          <DownloadIcon />
                        </a>

                        {/* A form, not a link: it mutates. Bound with the
                            NEGATION of the current state, so the button says
                            what it will do rather than what is true. */}
                        <form
                          action={onTogglePin.bind(
                            null,
                            page.slug,
                            page.pinnedAt === null,
                          )}
                        >
                          <button
                            type="submit"
                            aria-label={
                              page.pinnedAt
                                ? `Unpin ${page.title}`
                                : `Pin ${page.title}`
                            }
                            title={page.pinnedAt ? "Unpin" : "Pin"}
                            className={pageActionClass}
                          >
                            <PinIcon filled={page.pinnedAt !== null} />
                          </button>
                        </form>
                      </div>
                    }
                  />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
```

Note the empty-state condition changed from `visible.length === 0` to `sections.length === 0`. They are equivalent — `sectionPages` returns no empty sections — but reading the thing being rendered is what keeps them equivalent as the code moves.

The `pages.length === 0` early return ("No pages yet.") above stays exactly as it is.

- [ ] **Step 5: Pass the action from the admin page**

In `app/admin/page.tsx`, add `setPagePinned` to the existing import from `@/app/page-actions` (it already imports `createPage` from there), and pass it:

```tsx
      <PageList
        pages={pages}
        everyoneName={everyoneName}
        onTogglePin={setPagePinned}
        today={new Date()}
      />
```

`PagesTab` is an async server component, so this clock read happens once, on
the server, and the client renders the same sections it was sent.

- [ ] **Step 6: Verify**

Run: `npm run lint && npx tsc --noEmit && npm test && npm run build`
Expected: all clean. If `tsc` complains that `pages` is missing `pinnedAt`, Task 1 Step 3 did not add it to `listPagesForAdmin`'s mapped return — fix that there, not by loosening the type here.

- [ ] **Step 7: Commit**

```bash
git add components/admin/PageList.tsx app/admin/page.tsx
git commit -m "feat: section the admin pages list and add the pin control"
```

---

### Task 6: The student shelf

The same sections, in French, with a pin marker and no control.

**Files:**
- Modify: `components/student/FilesTab.tsx` — whole file

**Interfaces:**
- Consumes: `sectionPages` (Task 2), `studentSectionLabel` (Task 3), `PinIcon`, `pageSectionHeading`, `PageTile`'s `badge` (Task 4).
- Produces: `FilesTab`'s prop type gains `pinnedAt: Date | null`. Both call sites pass `listPagesForGroup`'s rows straight through, so neither needs editing.

- [ ] **Step 1: Rewrite the file**

Replace `components/student/FilesTab.tsx` with:

```tsx
import { PageTile } from "@/components/ui/PageTile";
import { HtmlPreview } from "@/components/ui/HtmlPreview";
import { PinIcon } from "@/components/ui/PinIcon";
import { pageGrid, pageSectionHeading } from "@/components/card-styles";
import { sectionPages } from "@/lib/page-sections";
import { studentSectionLabel } from "@/lib/page-section-labels";
import { formatLongDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export function FilesTab({
  pages,
}: {
  pages: {
    slug: string;
    title: string;
    createdAt: Date;
    pinnedAt: Date | null;
  }[];
}) {
  if (pages.length === 0) {
    return (
      <p className="text-center font-[family-name:var(--card-font-serif)] italic text-[var(--card-moss)]">
        Rien ici pour l&apos;instant.
      </p>
    );
  }

  const sections = sectionPages(pages, new Date());

  // The old 560px cap was sized for one column of rows and would pin the grid
  // at two columns forever. 1152px is the admin's own content width, so a tile
  // is the same size on both sides — which is the point of the two lists
  // looking alike.
  return (
    <div className="mx-auto max-w-[1152px]">
      {sections.map((section) => (
        <section key={`${section.key.kind}-${studentSectionLabel(section.key)}`}>
          <h2 className={pageSectionHeading}>
            {studentSectionLabel(section.key)}
          </h2>

          <ul className={cn(pageGrid)}>
            {section.pages.map((page) => (
              <li key={page.slug}>
                <PageTile
                  href={`/p/${page.slug}`}
                  title={page.title}
                  eyebrow={formatLongDate(page.createdAt)}
                  preview={<HtmlPreview slug={page.slug} />}
                  // Students get the marker but no control. Without it a page
                  // sitting above a newer one looks like a sorting bug.
                  badge={
                    page.pinnedAt ? (
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--card-paper)] text-[var(--card-bleu)] shadow-[var(--card-shadow)]">
                        <PinIcon filled />
                      </span>
                    ) : undefined
                  }
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npm run lint && npx tsc --noEmit && npm test && npm run build`
Expected: all clean. Both call sites (`app/g/[slug]/page.tsx`, `app/f/[token]/page.tsx`) must still typecheck without edits — they pass `listPagesForGroup`'s rows straight through, and Task 1 added `pinnedAt` to those.

- [ ] **Step 3: Prove it renders**

You have no browser. Start the dev server in the BACKGROUND, wait a few seconds, and use `curl`:

```bash
sqlite3 prisma/dev.db "select slug, chatToken from \"Group\";"
```

Then fetch a student's files tab with `curl -s -L "http://localhost:3000/g/<slug>?tab=files&k=<chatToken>"` and confirm:

- one `<h2>` per section, carrying French copy
- one `<ul>` per section, each with the grid classes
- no `<h2>` above zero tiles

To check the pinned path, pin a page directly in the database and re-fetch:

```bash
sqlite3 prisma/dev.db "update Page set pinnedAt = datetime('now') where slug = '<a-slug>';"
```

Confirm the ÉPINGLÉ heading appears first and that the tile carries the badge markup. Then unpin it again:

```bash
sqlite3 prisma/dev.db "update Page set pinnedAt = null where slug = '<a-slug>';"
```

Leave the database as you found it. Report exactly which checks you ran and their output. Do NOT claim the visual layout is correct — you cannot see it. Kill the dev server when done.

- [ ] **Step 4: Commit**

```bash
git add components/student/FilesTab.tsx
git commit -m "feat: section the student shelf and mark pinned pages"
```

---

### Task 7: Record it in CLAUDE.md

**Files:**
- Modify: `CLAUDE.md` — the "Uploaded pages" section under "Architecture"

**Interfaces:**
- Consumes: nothing.
- Produces: nothing.

- [ ] **Step 1: Add the paragraph**

In `CLAUDE.md`, in the "Uploaded pages" section, insert after the paragraph that begins "Both grids are 1152px wide":

```markdown
A page carries `pinnedAt`, null when unpinned. A timestamp rather than a
boolean because pinned pages order among themselves by *when they were pinned* —
a boolean would leave them sorted by creation date, the ordering pinning exists
to override, and re-pinning would do nothing. `sectionPages`
(`lib/page-sections.ts`) splits a list into Pinned, This week, Last week, and
one section per older month; a pinned page appears **only** under Pinned, never
also under its date. It returns section *keys*, not labels, because the admin
says "This week" and the student says "Cette semaine" —
`lib/page-section-labels.ts` holds both mappings. `thisWeek` has no upper
bound: `weekRange` ends on Friday, so a closed range would drop a page added on
the Saturday into a month section below pages a week older than it. Sections
form over the admin's *filtered* set, so a search never leaves a heading above
nothing. Jenn pins from the tile footer; students see a marker and no control.
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: record pinning and the sectioning rule"
```

---

## Done when

`npx prisma generate`, `npm run lint`, `npx tsc --noEmit`, `npm test` and `npm run build` are all clean, and pinning a page in the admin moves it to the top of both the admin list and every student's shelf, with the marker showing on the student tile and the headings re-forming correctly when the admin list is filtered.
