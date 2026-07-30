# Admin UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `/admin` into a screen a non-technical teacher can use — the daily word alone on landing, Groups and Pages behind tabs, searchable card-style lists, and no raw HTML anywhere.

**Architecture:** Two new pure modules in `lib/` carry the only real rules (tab parsing, accent-insensitive search) and are the only things under test, per this codebase's convention. A shared `Tile` component gives the student pages list and both admin lists one appearance. `app/admin/page.tsx` branches on a parsed `?tab=` and runs only the active tab's queries. The page editor's raw-HTML textarea is replaced by a drop zone; the HTML round trip becomes download → edit elsewhere → re-upload.

**Tech Stack:** Next.js App Router (server components + `"use client"` islands), Prisma/SQLite, Tailwind v4 via PostCSS with CSS custom properties in `app/globals.css`, Vitest.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-07-30-admin-ui-redesign-design.md`. Read it before starting.
- **Logic belongs in `lib/`.** Anything with a rule in it is a pure function in `lib/` with a test in `tests/lib/`. Components and Prisma access are not unit-tested.
- **Comments explain the "why", especially the counter-intuitive.** Do not add comments that restate the code. Every comment shown in this plan is part of the deliverable — reproduce it.
- **Imports** use the `@/` alias for repo-root-relative paths.
- **Admin copy is English** ("Log out", "No pages yet", "2 of 9"). French is the students' side of the site. The one exception is dates: `formatLongDate` renders `fr-CA` and is reused as-is in admin rather than growing a second formatter.
- **Never touch** `app/p/[slug]/raw/route.ts` or its CSP. `app/page-actions.ts`, `app/actions.ts`, `app/ai-actions.ts` keep their exact current signatures and behaviour.
- **Never touch** the `RichText` fields inside the flashcard editor (`components/admin/CardEditor.tsx`, `SectionEditor.tsx`, `RichText.tsx`). They wear the `--card-*` palette on purpose.
- **Local checks:** `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`. CI runs all four in that order.

---

### Task 1: Tab parsing

**Files:**
- Create: `lib/admin-tab.ts`
- Test: `tests/lib/admin-tab.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `ADMIN_TABS: readonly ["daily", "groups", "pages"]`, `type AdminTab = "daily" | "groups" | "pages"`, `parseAdminTab(value: string | undefined): AdminTab`.

- [ ] **Step 1: Write the failing test**

Create `tests/lib/admin-tab.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseAdminTab } from "@/lib/admin-tab";

describe("parseAdminTab", () => {
  it("returns each of the three tabs unchanged", () => {
    expect(parseAdminTab("daily")).toBe("daily");
    expect(parseAdminTab("groups")).toBe("groups");
    expect(parseAdminTab("pages")).toBe("pages");
  });

  it("defaults to the daily word when the param is absent", () => {
    expect(parseAdminTab(undefined)).toBe("daily");
  });

  it("defaults to the daily word for an empty string", () => {
    expect(parseAdminTab("")).toBe("daily");
  });

  it("defaults to the daily word for an unrecognised value", () => {
    expect(parseAdminTab("settings")).toBe("daily");
  });

  it("is case sensitive, so a capitalised value falls back", () => {
    expect(parseAdminTab("Pages")).toBe("daily");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/lib/admin-tab.test.ts`
Expected: FAIL — cannot resolve `@/lib/admin-tab`.

- [ ] **Step 3: Write the implementation**

Create `lib/admin-tab.ts`:

```ts
export const ADMIN_TABS = ["daily", "groups", "pages"] as const;

export type AdminTab = (typeof ADMIN_TABS)[number];

// Unknown and absent values both land on the daily word, because that is the
// screen /admin exists for. A mistyped ?tab= should show her today's card,
// not an error page.
export function parseAdminTab(value: string | undefined): AdminTab {
  const tabs: readonly string[] = ADMIN_TABS;
  return tabs.includes(value ?? "") ? (value as AdminTab) : "daily";
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/lib/admin-tab.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/admin-tab.ts tests/lib/admin-tab.test.ts
git commit -m "feat: parse the admin ?tab= param"
```

---

### Task 2: Accent-insensitive search filters

**Files:**
- Create: `lib/admin-search.ts`
- Test: `tests/lib/admin-search.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `normalise(value: string): string`
  - `type SearchablePage = { title: string; groupNames: string[] }`
  - `type SearchableGroup = { name: string; slug: string }`
  - `filterPages<T extends SearchablePage>(pages: T[], query: string): T[]`
  - `filterGroups<T extends SearchableGroup>(groups: T[], query: string): T[]`

The generic `T extends …` signatures matter: callers pass their own richer row types (`PageSummary`, `GroupSummary`) and must get the same type back, not a narrowed one.

- [ ] **Step 1: Write the failing test**

Create `tests/lib/admin-search.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { normalise, filterPages, filterGroups } from "@/lib/admin-search";

const pages = [
  { title: "Verbes au passé", groupNames: ["A1", "Ados"] },
  { title: "Les nombres", groupNames: ["A1"] },
  { title: "Où est le chat", groupNames: [] },
];

const groups = [
  { name: "Débutants", slug: "a1" },
  { name: "Ados", slug: "teens" },
];

describe("normalise", () => {
  it("lowercases", () => {
    expect(normalise("PASSE")).toBe("passe");
  });

  it("strips diacritics", () => {
    expect(normalise("passé")).toBe("passe");
    expect(normalise("Où")).toBe("ou");
  });
});

describe("filterPages", () => {
  it("returns everything for an empty query", () => {
    expect(filterPages(pages, "")).toHaveLength(3);
  });

  it("returns everything for a whitespace-only query", () => {
    expect(filterPages(pages, "   ")).toHaveLength(3);
  });

  it("matches on the title", () => {
    expect(filterPages(pages, "nombres").map((p) => p.title)).toEqual([
      "Les nombres",
    ]);
  });

  it("matches on a group name", () => {
    expect(filterPages(pages, "ados").map((p) => p.title)).toEqual([
      "Verbes au passé",
    ]);
  });

  it("matches a query without the accent against a title with one", () => {
    expect(filterPages(pages, "passe").map((p) => p.title)).toEqual([
      "Verbes au passé",
    ]);
  });

  it("matches a query with an accent against a title without one", () => {
    expect(filterPages([{ title: "Passe compose", groupNames: [] }], "passé"))
      .toHaveLength(1);
  });

  it("ignores case", () => {
    expect(filterPages(pages, "VERBES")).toHaveLength(1);
  });

  it("returns nothing when nothing matches", () => {
    expect(filterPages(pages, "zzz")).toEqual([]);
  });

  it("keeps the caller's own fields on the rows it returns", () => {
    const rich = [{ title: "Les nombres", groupNames: [], slug: "les-nombres" }];
    expect(filterPages(rich, "nombres")[0].slug).toBe("les-nombres");
  });
});

describe("filterGroups", () => {
  it("returns everything for an empty query", () => {
    expect(filterGroups(groups, "")).toHaveLength(2);
  });

  it("matches on the name, accent-insensitively", () => {
    expect(filterGroups(groups, "debutants").map((g) => g.slug)).toEqual(["a1"]);
  });

  it("matches on the slug", () => {
    expect(filterGroups(groups, "teens").map((g) => g.name)).toEqual(["Ados"]);
  });

  it("returns nothing when nothing matches", () => {
    expect(filterGroups(groups, "zzz")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/lib/admin-search.test.ts`
Expected: FAIL — cannot resolve `@/lib/admin-search`.

- [ ] **Step 3: Write the implementation**

Create `lib/admin-search.ts`:

```ts
// Both the query and the field go through this, so "passe" finds "passé" and
// "passé" finds "passe". Almost every title Jenn writes has an accent in it,
// and a search box that demands the right accent is a search box she cannot
// use.
export function normalise(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

export type SearchablePage = { title: string; groupNames: string[] };

export type SearchableGroup = { name: string; slug: string };

function matches(query: string, fields: string[]): boolean {
  const needle = normalise(query);
  return fields.some((field) => normalise(field).includes(needle));
}

export function filterPages<T extends SearchablePage>(
  pages: T[],
  query: string,
): T[] {
  if (query.trim() === "") return pages;
  return pages.filter((page) =>
    matches(query, [page.title, ...page.groupNames]),
  );
}

export function filterGroups<T extends SearchableGroup>(
  groups: T[],
  query: string,
): T[] {
  if (query.trim() === "") return groups;
  return groups.filter((group) => matches(query, [group.name, group.slug]));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/lib/admin-search.test.ts`
Expected: PASS, 15 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/admin-search.ts tests/lib/admin-search.test.ts
git commit -m "feat: add accent-insensitive filters for the admin lists"
```

---

### Task 3: Field styling

**Files:**
- Modify: `app/globals.css` (the `:root` block, after `--color-accent-soft`)
- Create: `components/ui/field.ts`
- Modify: `components/ui/Input.tsx` (whole file)
- Modify: `components/ui/Textarea.tsx` (whole file)
- Modify: `components/admin/AdminDatePicker.tsx` (the `inputClassName` import, and the popover container's classes)

**Interfaces:**
- Consumes: nothing.
- Produces: `fieldClassName: string` from `@/components/ui/field`. The old `inputClassName` export from `@/components/ui/Input` is **removed**, not aliased — it has exactly one other importer, so the import moves rather than the name lingering in two places.

- [ ] **Step 1: Add the two tokens**

In `app/globals.css`, inside `:root`, immediately after the `--color-accent-soft` line:

```css
  /* Form fields sit a step darker than the page, with a line dark enough to
     read as an edge rather than a shadow. White fields disappeared into the
     cream background. */
  --color-field: #F3E8D8;
  --color-field-border: #CDB89A;
```

- [ ] **Step 2: Create the shared class**

Create `components/ui/field.ts`:

```ts
// Shared by Input, Textarea, and AdminDatePicker's trigger — which has to look
// like a field but is a button, so it cannot just render <Input>.
export const fieldClassName =
  "mt-1 block w-full rounded-xl border border-[var(--color-field-border)] bg-[var(--color-field)] px-4 py-3 font-[family-name:var(--font-body)] text-base text-[var(--color-ink)] placeholder:text-[var(--color-ink-muted)]/60 focus:border-[var(--color-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20";
```

Note what changed from the old string: `rounded-lg` → `rounded-xl`, `px-3 py-2` → `px-4 py-3`, `bg-white` → the token, and `text-base sm:text-sm` → `text-base` everywhere. The `sm:text-sm` shrink goes because the ask is a larger face, not a smaller one on desktop.

- [ ] **Step 3: Point Input at it**

Replace the whole of `components/ui/Input.tsx`:

```tsx
import { cn } from "@/lib/utils";
import { fieldClassName } from "@/components/ui/field";
import type { InputHTMLAttributes } from "react";

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(fieldClassName, className)} {...props} />;
}
```

- [ ] **Step 4: Point Textarea at it**

Replace the whole of `components/ui/Textarea.tsx`. It currently duplicates the class string by hand; that duplicate is what this deletes.

```tsx
import { cn } from "@/lib/utils";
import { fieldClassName } from "@/components/ui/field";
import type { TextareaHTMLAttributes } from "react";

export function Textarea({
  className,
  rows = 3,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea rows={rows} className={cn(fieldClassName, className)} {...props} />
  );
}
```

- [ ] **Step 5: Move the date picker's import and repaint its popover**

In `components/admin/AdminDatePicker.tsx`:

Change the import line

```ts
import { inputClassName } from "@/components/ui/Input";
```

to

```ts
import { fieldClassName } from "@/components/ui/field";
```

and the trigger's `className` from `cn(inputClassName, …)` to `cn(fieldClassName, …)`.

Then, on the popover container `<div role="dialog">`, change

```
rounded-xl border border-[var(--color-ink-muted)]/20 bg-white p-3 shadow-lg
```

to

```
rounded-xl border border-[var(--color-field-border)] bg-[var(--color-field)] p-3 shadow-lg
```

The day cells' `hover:bg-[var(--color-bg)]` stays: `--color-bg` is now *lighter* than the popover, so the hover still reads.

- [ ] **Step 6: Verify nothing else imported the old name**

Run: `npm run typecheck`
Expected: PASS. A failure here means another file imported `inputClassName`; fix it by importing `fieldClassName` from `@/components/ui/field`.

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 7: Look at it**

Run: `npm run dev`, open `http://localhost:3000/admin`, log in, and confirm the date trigger and the group/page form fields are visibly darker than the page with a clear thin border, taller, and set in a larger face. Open the date popover and confirm it matches the trigger.

- [ ] **Step 8: Commit**

```bash
git add app/globals.css components/ui/field.ts components/ui/Input.tsx components/ui/Textarea.tsx components/admin/AdminDatePicker.tsx
git commit -m "feat: give form fields a darker fill, a real border, and more room"
```

---

### Task 4: The shared list tile

**Files:**
- Create: `components/ui/Tile.tsx`
- Modify: `app/g/[slug]/pages/page.tsx` (the `<ul>` block, lines ~45-59)

**Interfaces:**
- Consumes: `cardEyebrow` from `@/components/card-styles`, `cn` from `@/lib/utils`.
- Produces: `Tile({ href, title, eyebrow, action?, className? })` — a server-safe presentational component. `action` is a `ReactNode` rendered at the right of the tile, above the title's click overlay.

- [ ] **Step 1: Create the component**

Create `components/ui/Tile.tsx`:

```tsx
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { cardEyebrow } from "@/components/card-styles";

// The flashcard palette, deliberately, in the admin lists as well as the
// student one: the point of the pages list looking like the student's list is
// that Jenn can see what she published without leaving the admin screen.
export function Tile({
  href,
  title,
  eyebrow,
  action,
  className,
}: {
  href: string;
  title: string;
  eyebrow: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative flex items-center justify-between gap-4 rounded-[14px] border border-[var(--card-line)] bg-[var(--card-paper)] px-5 py-4 shadow-[var(--card-shadow)] transition-opacity hover:opacity-85",
        className,
      )}
    >
      <div className="min-w-0">
        {/* The link is stretched over the whole tile rather than wrapping it:
            `action` is itself interactive, and an anchor inside an anchor is
            invalid HTML that browsers repair by splitting the element. */}
        <Link
          href={href}
          className="font-[family-name:var(--card-font-serif)] text-lg text-[var(--card-ink)] after:absolute after:inset-0"
        >
          {title}
        </Link>
        <span className={cn("mt-1 block", cardEyebrow)}>{eyebrow}</span>
      </div>

      {action && <div className="relative z-10 shrink-0">{action}</div>}
    </div>
  );
}
```

- [ ] **Step 2: Use it on the student pages list**

In `app/g/[slug]/pages/page.tsx`, add to the imports:

```ts
import { Tile } from "@/components/ui/Tile";
```

Delete the now-unused `cardEyebrow` import (the tile owns it) — keep the `Link` import, it is still used by the header and the footer link.

Replace the whole `<ul>` block with:

```tsx
          <ul className="flex flex-col gap-3">
            {pages.map((page) => (
              <li key={page.slug}>
                <Tile
                  href={`/p/${page.slug}`}
                  title={page.title}
                  eyebrow={formatLongDate(page.createdAt)}
                />
              </li>
            ))}
          </ul>
```

The student tiles gain `--card-shadow`, which they did not have. On `/g/[slug]/pages` the background gradient runs darker than the paper so the border alone sufficed; on the admin cream the two are within a hair of each other and the tile would dissolve. One shadowed component is a smaller change than two forks of it, and it matches the flashcard, which has always had one.

- [ ] **Step 3: Verify**

Run: `npm run lint && npm run typecheck`
Expected: PASS. A lint failure about an unused `cardEyebrow` import means Step 2's deletion was missed.

- [ ] **Step 4: Look at it**

With `npm run dev`, open `/g/<a real group slug>/pages` and confirm the tiles still show the title and the French date, now with a soft shadow, and that clicking anywhere on a tile opens the page.

- [ ] **Step 5: Commit**

```bash
git add components/ui/Tile.tsx app/g/\[slug\]/pages/page.tsx
git commit -m "feat: extract the page list tile so admin can wear it too"
```

---

### Task 5: The search field

**Files:**
- Create: `components/admin/SearchField.tsx`

**Interfaces:**
- Consumes: `fieldClassName` from `@/components/ui/field` (Task 3).
- Produces: `SearchField({ label, value, onChange, shown, total })` — a `"use client"` controlled component. `label` is both the placeholder and the accessible name. `shown`/`total` drive the count line, which renders only while a query is present.

- [ ] **Step 1: Create the component**

Create `components/admin/SearchField.tsx`:

```tsx
"use client";

import { fieldClassName } from "@/components/ui/field";
import { cn } from "@/lib/utils";

export function SearchField({
  label,
  value,
  onChange,
  shown,
  total,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  shown: number;
  total: number;
}) {
  return (
    <div className="mb-5">
      <div className="relative">
        <input
          type="search"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={label}
          aria-label={label}
          // WebKit draws its own clear button inside a type="search" input,
          // which would sit under ours. The semantics are worth keeping; the
          // second X is not.
          className={cn(
            fieldClassName,
            "mt-0 pr-20 [&::-webkit-search-cancel-button]:appearance-none",
          )}
        />
        {value !== "" && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="absolute inset-y-0 right-4 text-sm text-[var(--color-ink-muted)] underline"
          >
            Clear
          </button>
        )}
      </div>

      {value !== "" && (
        // The count is what tells her a short list is filtered rather than
        // emptied — without it, searching looks like losing pages.
        <p className="mt-2 text-center text-sm text-[var(--color-ink-muted)]">
          {shown} of {total}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npm run lint && npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add components/admin/SearchField.tsx
git commit -m "feat: add the admin search field"
```

---

### Task 6: Pages list — tiles, search, download

**Files:**
- Modify: `lib/pages.ts` (`listPagesForAdmin`, ~line 66)
- Modify: `components/admin/PageList.tsx` (whole file)

**Interfaces:**
- Consumes: `Tile` (Task 4), `SearchField` (Task 5), `filterPages` (Task 2), `formatLongDate` from `@/lib/format`.
- Produces: `PageSummary = { id, slug, title, createdAt: Date, groupNames: string[] }` — note the added `createdAt`. `listPagesForAdmin()` now returns rows carrying `createdAt` and the existing `groupIds`.

- [ ] **Step 1: Select `createdAt` in the query**

In `lib/pages.ts`, in `listPagesForAdmin`, add `createdAt: true` to the `select` block and `createdAt: page.createdAt` to the mapped object:

```ts
export async function listPagesForAdmin() {
  const pages = await prisma.page.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      slug: true,
      title: true,
      createdAt: true,
      groups: { select: { group: { select: { id: true, name: true } } } },
    },
  });

  return pages.map((page) => ({
    id: page.id,
    slug: page.slug,
    title: page.title,
    createdAt: page.createdAt,
    groupIds: page.groups.map((g) => g.group.id),
    groupNames: page.groups.map((g) => g.group.name),
  }));
}
```

- [ ] **Step 2: Rewrite the list**

Replace the whole of `components/admin/PageList.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Tile } from "@/components/ui/Tile";
import { SearchField } from "@/components/admin/SearchField";
import { filterPages } from "@/lib/admin-search";
import { formatLongDate } from "@/lib/format";

export type PageSummary = {
  id: string;
  slug: string;
  title: string;
  createdAt: Date;
  groupNames: string[];
};

// Same three strokes as a download icon anywhere: a shaft, a chevron, a floor.
function DownloadIcon() {
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
      <path d="M12 3v12" />
      <path d="m7 12 5 5 5-5" />
      <path d="M5 21h14" />
    </svg>
  );
}

export function PageList({ pages }: { pages: PageSummary[] }) {
  const [query, setQuery] = useState("");
  const visible = filterPages(pages, query);

  if (pages.length === 0) {
    return (
      <p className="mb-8 text-center text-sm text-[var(--color-ink-muted)]">
        No pages yet.
      </p>
    );
  }

  return (
    <div className="mb-10">
      <SearchField
        label="Search pages"
        value={query}
        onChange={setQuery}
        shown={visible.length}
        total={pages.length}
      />

      {visible.length === 0 ? (
        <p className="text-center text-sm text-[var(--color-ink-muted)]">
          Nothing matches that.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {visible.map((page) => (
            <li key={page.id}>
              <Tile
                href={`/admin/pages/${page.slug}`}
                title={page.title}
                eyebrow={`${formatLongDate(page.createdAt)} · ${
                  page.groupNames.length === 0
                    ? "no groups"
                    : page.groupNames.join(", ")
                }`}
                action={
                  // No server support needed: `download` on a same-origin
                  // response forces a save-as, so the raw route keeps its
                  // exact behaviour and its CSP, and no new authenticated
                  // surface appears. That route is already public.
                  <a
                    href={`/p/${page.slug}/raw`}
                    download={`${page.slug}.html`}
                    aria-label={`Download ${page.title}`}
                    title="Download"
                    className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--card-bleu)] transition-colors hover:bg-[var(--card-bleu-soft)]"
                  >
                    <DownloadIcon />
                  </a>
                }
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify**

Run: `npm run lint && npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Look at it**

With `npm run dev`, open `/admin` and scroll to the Pages section (still at the bottom of the page until Task 8 moves it). Confirm: tiles instead of links; the date and group names in the eyebrow; typing a group name in the search box filters the list and the "N of M" count appears; the Clear button empties it; the download icon saves an `.html` file rather than navigating.

If you have no pages locally, create one through the form at the bottom of `/admin` first.

- [ ] **Step 5: Commit**

```bash
git add lib/pages.ts components/admin/PageList.tsx
git commit -m "feat: show pages as searchable student-style tiles with a download"
```

---

### Task 7: Groups list — tiles and search

**Files:**
- Modify: `components/admin/GroupList.tsx` (whole file)

**Interfaces:**
- Consumes: `Tile` (Task 4), `SearchField` (Task 5), `filterGroups` (Task 2).
- Produces: `GroupSummary = { id, name, slug, cardCount }` — unchanged from today, so `app/admin/page.tsx` needs no change here.

The delete confirmation renders *below* the tile rather than inside its action slot. The confirm row is a sentence plus two buttons; squeezed into the right-hand slot it would wrap badly on a phone, and the tile's own click overlay makes an in-slot layout fussy.

- [ ] **Step 1: Rewrite the list**

Replace the whole of `components/admin/GroupList.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Tile } from "@/components/ui/Tile";
import { SearchField } from "@/components/admin/SearchField";
import { filterGroups } from "@/lib/admin-search";

export type GroupSummary = {
  id: string;
  name: string;
  slug: string;
  cardCount: number;
};

export function GroupList({
  groups,
  onDelete,
}: {
  groups: GroupSummary[];
  onDelete: (groupId: string) => Promise<void>;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const visible = filterGroups(groups, query);

  async function handleDelete(id: string) {
    setDeleting(id);
    setError(null);
    try {
      await onDelete(id);
      setConfirming(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the group");
    } finally {
      setDeleting(null);
    }
  }

  if (groups.length === 0) {
    return (
      <p className="mb-8 text-center text-sm text-[var(--color-ink-muted)]">
        No groups yet.
      </p>
    );
  }

  return (
    <div className="mb-10">
      <SearchField
        label="Search groups"
        value={query}
        onChange={setQuery}
        shown={visible.length}
        total={groups.length}
      />

      {visible.length === 0 ? (
        <p className="text-center text-sm text-[var(--color-ink-muted)]">
          Nothing matches that.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {visible.map((group) => (
            <li key={group.id}>
              <Tile
                href={`/admin/${group.slug}`}
                title={group.name}
                eyebrow={`${group.cardCount} card${
                  group.cardCount === 1 ? "" : "s"
                } · /g/${group.slug}`}
                action={
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setConfirming(group.id);
                    }}
                    className="text-sm text-[var(--color-ink-muted)] underline"
                  >
                    Delete
                  </button>
                }
              />

              {confirming === group.id && (
                <div className="mt-2 flex flex-wrap items-baseline justify-center gap-3 text-sm">
                  <span className="text-[var(--color-ink-muted)]">
                    Delete {group.name}
                    {group.cardCount > 0
                      ? ` and its ${group.cardCount} card${
                          group.cardCount === 1 ? "" : "s"
                        }?`
                      : "?"}
                  </span>
                  <button
                    type="button"
                    onClick={() => setConfirming(null)}
                    disabled={deleting !== null}
                    className="text-[var(--color-ink-muted)] underline disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(group.id)}
                    disabled={deleting !== null}
                    className="font-medium text-[var(--color-accent)] underline disabled:opacity-50"
                  >
                    {deleting === group.id ? "Deleting…" : "Delete"}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p role="alert" className="mt-4 text-center text-sm text-[var(--color-accent)]">
          {error}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npm run lint && npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Look at it**

With `npm run dev`, open `/admin` and scroll to Groups. Confirm: tiles with the card count and student path; search filters; clicking a tile opens `/admin/<slug>`; Delete opens the confirm row beneath the tile and still names the card count; Cancel closes it.

- [ ] **Step 4: Commit**

```bash
git add components/admin/GroupList.tsx
git commit -m "feat: show groups as searchable tiles"
```

---

### Task 8: Tabs on /admin

**Files:**
- Create: `components/admin/AdminTabs.tsx`
- Modify: `app/admin/page.tsx` (whole file)

**Interfaces:**
- Consumes: `parseAdminTab`, `AdminTab` (Task 1); `PageList`, `GroupList` (Tasks 6, 7).
- Produces: `AdminTabs({ active: AdminTab, date: string })`.

The three tab bodies stay as `async` functions inside `app/admin/page.tsx` rather than moving to `components/`. Prisma access lives in the route in this codebase, and splitting the queries away from the route that owns them would break that.

- [ ] **Step 1: Create the tab strip**

Create `components/admin/AdminTabs.tsx`:

```tsx
import Link from "next/link";
import { cn } from "@/lib/utils";
import type { AdminTab } from "@/lib/admin-tab";

// Only the daily word has a date. Carrying ?date= on its link is what makes
// leaving the tab and coming back land on the day she was working on.
const TABS: { tab: AdminTab; label: string; href: (date: string) => string }[] = [
  { tab: "daily", label: "Daily word", href: (date) => `/admin?date=${date}` },
  { tab: "groups", label: "Groups", href: () => "/admin?tab=groups" },
  { tab: "pages", label: "Pages", href: () => "/admin?tab=pages" },
];

export function AdminTabs({ active, date }: { active: AdminTab; date: string }) {
  return (
    // A nav of links, not an ARIA tablist: these are navigations to distinct
    // URLs, not panels swapped in place, and role="tab" would promise
    // arrow-key behaviour that browser navigation does not provide.
    <nav aria-label="Admin sections" className="mb-10 flex justify-center">
      <div className="flex gap-1 rounded-full border border-[var(--color-field-border)] bg-[var(--color-field)] p-1">
        {TABS.map(({ tab, label, href }) => (
          <Link
            key={tab}
            href={href(date)}
            aria-current={tab === active ? "page" : undefined}
            className={cn(
              "rounded-full px-5 py-2 font-[family-name:var(--font-body)] text-sm transition-colors",
              tab === active
                ? "bg-[var(--color-accent)] font-medium text-white"
                : "text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]",
            )}
          >
            {label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
```

- [ ] **Step 2: Rewrite the admin page**

Replace the whole of `app/admin/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { getCurrentTeacher } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import {
  upsertGlobalCard,
  createGroup,
  deleteGlobalCard,
  deleteGroup,
} from "@/app/actions";
import { logout } from "@/app/auth-actions";
import { CardEditor } from "@/components/admin/CardEditor";
import { AdminDatePicker } from "@/components/admin/AdminDatePicker";
import { AdminTabs } from "@/components/admin/AdminTabs";
import { NewGroupForm } from "@/components/admin/NewGroupForm";
import { GroupList } from "@/components/admin/GroupList";
import { toCardFormValues } from "@/lib/cards";
import { parseAdminDate } from "@/lib/admin-date";
import { parseAdminTab } from "@/lib/admin-tab";
import { createPage } from "@/app/page-actions";
import { listPagesForAdmin } from "@/lib/pages";
import { PageList } from "@/components/admin/PageList";
import { PageEditor } from "@/components/admin/PageEditor";

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; tab?: string }>;
}) {
  const teacher = await getCurrentTeacher();
  if (!teacher) redirect("/login");

  const { date, tab } = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const selected = parseAdminDate(date, today);
  const active = parseAdminTab(tab);

  return (
    <main className="min-h-screen bg-[var(--color-bg)] px-4 py-12">
      <div className="mx-auto max-w-xl lg:max-w-[1152px]">
        <header className="relative mb-8 text-center">
          <h1 className="font-[family-name:var(--font-display)] text-3xl italic text-[var(--color-ink)]">
            Français avec Jenn
          </h1>
          {/* Absolute rather than a flex row, so the title centres on the
              page instead of on the space the Log out button leaves it. */}
          <form action={logout} className="absolute right-0 top-1">
            <button
              type="submit"
              className="font-[family-name:var(--font-body)] text-sm text-[var(--color-ink-muted)] underline"
            >
              Log out
            </button>
          </form>
        </header>

        <AdminTabs active={active} date={selected} />

        {active === "daily" && <DailyWordTab selected={selected} today={today} />}
        {active === "groups" && <GroupsTab />}
        {active === "pages" && <PagesTab />}
      </div>
    </main>
  );
}

// Each tab runs only its own queries. The daily word no longer pays for the
// page list, and the page list no longer pays for a card it does not show.
async function DailyWordTab({
  selected,
  today,
}: {
  selected: string;
  today: string;
}) {
  const existingCard = await prisma.globalCard.findUnique({
    where: { date: new Date(`${selected}T00:00:00Z`) },
  });

  return (
    <>
      {/* max-w-[560px] with lg:mx-0: below lg this centres like everything
          else, but above lg the container is 1152px and the editor is a
          two-column grid, so without lg:mx-0 the picker would float into the
          gutter instead of sharing the form column's left edge. */}
      <div className="mx-auto w-full max-w-[560px] lg:mx-0">
        <AdminDatePicker basePath="/admin" selected={selected} today={today} />
      </div>

      <CardEditor
        key={selected}
        initialDate={selected}
        initialValues={toCardFormValues(existingCard)}
        onSubmit={upsertGlobalCard}
        onDelete={deleteGlobalCard}
      />
    </>
  );
}

async function GroupsTab() {
  const groups = await prisma.group.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { cards: true } } },
  });

  return (
    <div className="mx-auto w-full max-w-[560px]">
      <GroupList
        groups={groups.map((g) => ({
          id: g.id,
          name: g.name,
          slug: g.slug,
          cardCount: g._count.cards,
        }))}
        onDelete={deleteGroup}
      />

      <h2 className="mb-4 text-center font-[family-name:var(--font-display)] text-2xl italic text-[var(--color-ink)]">
        Add a group
      </h2>
      <NewGroupForm onSubmit={createGroup} />
    </div>
  );
}

async function PagesTab() {
  // The group list is still needed here: the editor below assigns pages to
  // groups.
  const [pages, groups] = await Promise.all([
    listPagesForAdmin(),
    prisma.group.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <div className="mx-auto w-full max-w-[560px]">
      <PageList pages={pages} />

      <h2 className="mb-4 text-center font-[family-name:var(--font-display)] text-2xl italic text-[var(--color-ink)]">
        Add a page
      </h2>
      <PageEditor groups={groups} submitLabel="Publish page" onSubmit={createPage} />
    </div>
  );
}
```

Note what is gone: the `Daily word` `<h1>` (the active pill is the section's name now, and the nav's `aria-current` is the accessible equivalent), and the `Groups`/`Pages` `<h2>`s over the lists — the remaining `<h2>`s label the forms.

- [ ] **Step 3: Verify**

Run: `npm run lint && npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 4: Look at it**

With `npm run dev`:
- `/admin` shows the wordmark, the tab strip with **Daily word** active, the date picker and the card editor — and nothing about groups or pages.
- Clicking **Groups** goes to `/admin?tab=groups` and shows only groups.
- Clicking **Pages** goes to `/admin?tab=pages` and shows only pages.
- Pick a date, switch to Pages, click **Daily word** — you land back on that date, not today.
- The browser Back button walks the tabs.
- `/admin?tab=nonsense` shows the daily word.

- [ ] **Step 5: Commit**

```bash
git add components/admin/AdminTabs.tsx app/admin/page.tsx
git commit -m "feat: split admin into daily word, groups, and pages tabs"
```

---

### Task 9: A page editor with no HTML in it

**Files:**
- Create: `components/admin/HtmlDropZone.tsx`
- Modify: `components/admin/PageEditor.tsx` (whole file)
- Modify: `app/admin/pages/[slug]/page.tsx` (the header block, lines ~27-44)

**Interfaces:**
- Consumes: `MAX_PAGE_BYTES` from `@/lib/page-html`, `Button` from `@/components/ui/Button`, `Input` from `@/components/ui/Input`.
- Produces: `HtmlDropZone({ fileName, hasExisting, onFile, onError })`, where `onFile: (file: File, text: string) => void`.
- `PageEditor`'s own props are unchanged: `{ groups, initial?, submitLabel, onSubmit, onDelete? }`. `app/page-actions.ts` is untouched — the html string still lives in `PageEditor` state, so opening a page and saving without touching the file re-submits the identical html.

- [ ] **Step 1: Create the drop zone**

Create `components/admin/HtmlDropZone.tsx`:

```tsx
"use client";

import { useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { cn } from "@/lib/utils";
import { MAX_PAGE_BYTES } from "@/lib/page-html";

export function HtmlDropZone({
  fileName,
  hasExisting,
  onFile,
  onError,
}: {
  fileName: string | null;
  // Distinguishes "nothing chosen and nothing stored" on the create form from
  // "nothing chosen this session, but a file is already published" on the
  // edit screen. Without it the edit screen would look empty and unsaved.
  hasExisting: boolean;
  onFile: (file: File, text: string) => void;
  onError: (message: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  async function accept(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_PAGE_BYTES) {
      onError("That page is larger than 2 MB.");
      return;
    }
    onFile(file, await file.text());
  }

  async function handleChange(event: ChangeEvent<HTMLInputElement>) {
    await accept(event.target.files?.[0]);
    // Cleared so choosing the same file twice in a row still fires a change.
    event.target.value = "";
  }

  async function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    await accept(event.dataTransfer.files?.[0]);
  }

  const status = fileName
    ? fileName
    : hasExisting
      ? "A file is published. Drop a new one to replace it."
      : "Drop an HTML file here, or click to choose one";

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={cn(
        "mt-1 rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors",
        dragging
          ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)]"
          : "border-[var(--color-field-border)] bg-[var(--color-field)]",
      )}
    >
      <p className="text-sm font-normal text-[var(--color-ink-muted)]">
        {status}
      </p>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="mt-3 rounded-full border border-[var(--color-field-border)] bg-[var(--color-bg)] px-5 py-2 text-sm font-medium text-[var(--color-ink)] transition-opacity hover:opacity-80"
      >
        {fileName || hasExisting ? "Choose a different file" : "Choose a file"}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".html,.htm,text/html"
        onChange={handleChange}
        className="sr-only"
      />
    </div>
  );
}
```

- [ ] **Step 2: Rewrite the editor**

Replace the whole of `components/admin/PageEditor.tsx`. The `Textarea` import goes with the textarea, and `titleFromFile` keeps working exactly as it does today.

```tsx
"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { HtmlDropZone } from "@/components/admin/HtmlDropZone";
import { cn } from "@/lib/utils";
import type { PageInput } from "@/app/page-actions";

export type PageEditorGroup = { id: string; name: string };

export function PageEditor({
  groups,
  initial,
  submitLabel,
  onSubmit,
  onDelete,
}: {
  groups: PageEditorGroup[];
  initial?: { title: string; html: string; groupIds: string[] };
  submitLabel: string;
  onSubmit: (input: PageInput) => Promise<unknown>;
  onDelete?: () => Promise<void>;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initial?.title ?? "");
  // The html still lives here, exactly as before — the drop zone simply never
  // shows it. Saving an existing page without touching the file therefore
  // re-submits the identical html and page-actions needs no change.
  const [html, setHtml] = useState(initial?.html ?? "");
  const [fileName, setFileName] = useState<string | null>(null);
  const [groupIds, setGroupIds] = useState<string[]>(initial?.groupIds ?? []);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Tracks whether the current title came from a filename rather than typing:
  // a filename-derived title should follow the file when it's swapped for
  // another, but a title the teacher typed herself must never be overwritten.
  const [titleFromFile, setTitleFromFile] = useState(false);

  // The file never reaches the server: it is read in the browser and the text
  // goes straight into state, so the source stays editable by re-uploading.
  function handleFile(file: File, text: string) {
    setError(null);
    setHtml(text);
    setFileName(file.name);
    if (!title || titleFromFile) {
      setTitle(file.name.replace(/\.html?$/i, ""));
      setTitleFromFile(true);
    }
  }

  function toggleGroup(id: string) {
    setGroupIds((current) =>
      current.includes(id) ? current.filter((g) => g !== id) : [...current, id],
    );
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      await onSubmit({ title, html, groupIds });
      setSaved(true);
      if (!initial) {
        setTitle("");
        setHtml("");
        setFileName(null);
        setGroupIds([]);
        setTitleFromFile(false);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!onDelete) return;
    setDeleting(true);
    setError(null);
    try {
      await onDelete();
      router.push("/admin?tab=pages");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the page");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <label className="text-sm font-medium text-[var(--color-ink)]">
        Title
        <Input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            setTitleFromFile(false);
          }}
          required
        />
      </label>

      <fieldset className="text-sm font-medium text-[var(--color-ink)]">
        <legend className="mb-2">Groups</legend>
        {groups.length === 0 ? (
          <p className="text-sm font-normal text-[var(--color-ink-muted)]">
            No groups yet.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {groups.map((group) => {
              const checked = groupIds.includes(group.id);
              return (
                // A real checkbox, visually hidden inside its own label: the
                // pill is appearance only, so keyboard and screen readers get
                // the control they already understood.
                <label
                  key={group.id}
                  className={cn(
                    "cursor-pointer rounded-full border px-4 py-2 text-sm font-normal transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--color-accent)]/40",
                    checked
                      ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-ink)]"
                      : "border-[var(--color-field-border)] bg-[var(--color-field)] text-[var(--color-ink-muted)]",
                  )}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={checked}
                    onChange={() => toggleGroup(group.id)}
                  />
                  {group.name}
                </label>
              );
            })}
          </div>
        )}
      </fieldset>

      <div className="text-sm font-medium text-[var(--color-ink)]">
        Page file
        <HtmlDropZone
          fileName={fileName}
          hasExisting={Boolean(initial)}
          onFile={handleFile}
          onError={setError}
        />
      </div>

      <div className="flex items-center justify-center gap-4">
        <Button type="submit" disabled={saving || deleting || html.trim() === ""}>
          {saving ? "Saving..." : submitLabel}
        </Button>
        {onDelete && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={saving || deleting}
            className="text-sm text-[var(--color-ink-muted)] underline"
          >
            {deleting ? "Deleting..." : "Delete page"}
          </button>
        )}
        {saved && (
          <span className="text-sm text-[var(--color-ink-muted)]">Saved</span>
        )}
      </div>

      {error && (
        <p role="alert" className="text-center text-sm text-[var(--color-accent)]">
          {error}
        </p>
      )}
    </form>
  );
}
```

Two behaviour changes worth naming: submit is disabled until there is html (on the create form that means until a file has been read), and delete now returns to `/admin?tab=pages` rather than `/admin`, so she lands back on the list she deleted from.

- [ ] **Step 3: Restyle the single-page editor's header**

In `app/admin/pages/[slug]/page.tsx`, replace the `<Link href="/admin">` and the two elements after it with a centred header pointing back at the Pages tab:

```tsx
        <Link
          href="/admin?tab=pages"
          className="mb-6 inline-block text-sm text-[var(--color-ink-muted)] underline"
        >
          ← Pages
        </Link>

        <h1 className="mb-2 text-center font-[family-name:var(--font-display)] text-3xl italic text-[var(--color-ink)]">
          {page.title}
        </h1>
        <p className="mb-8 text-center text-sm text-[var(--color-ink-muted)]">
          <a href={`/p/${page.slug}`} className="underline">
            /p/{page.slug}
          </a>{" "}
          — the link stays the same when you rename the page.
        </p>
```

- [ ] **Step 4: Verify**

Run: `npm run lint && npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 5: Look at it**

With `npm run dev`, on `/admin?tab=pages`:
- The create form shows Title, group pills, and a drop target — **no HTML anywhere**.
- Publish is disabled until a file is chosen.
- Dragging an `.html` file onto the zone highlights it, fills the filename, and fills the title; then typing over the title and dropping a second file leaves your typed title alone.
- A file over 2 MB shows "That page is larger than 2 MB." and does not load.
- Group pills toggle, and Tab + Space still works on them.
- Open an existing page from a tile: the zone says a file is published, and pressing Save without touching it leaves the page rendering identically at `/p/<slug>`.
- Delete returns you to `/admin?tab=pages`.

- [ ] **Step 6: Commit**

```bash
git add components/admin/HtmlDropZone.tsx components/admin/PageEditor.tsx app/admin/pages/\[slug\]/page.tsx
git commit -m "feat: replace the HTML textarea with a drop zone"
```

---

### Task 10: Documentation and the full check

**Files:**
- Modify: `CLAUDE.md` (the routes table, the styling bullet under Conventions, the "Uploaded pages" section)

**Interfaces:**
- Consumes: everything above.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Update the routes table**

In `CLAUDE.md`, change the `/admin` row's Notes cell from

```
edits the **global** card for `?date=` + group management
```

to

```
three tabs via `?tab=` — the global card for `?date=` (default), groups, pages
```

- [ ] **Step 2: Correct the palette-scoping claim**

Under **Conventions**, in the **Styling** bullet, replace

```
the Québec flashcard template (`--card-*`), the latter scoped to `/g/[slug]`
```

with

```
the Québec flashcard template (`--card-*`). The latter is scoped to the
student card pages and to `components/ui/Tile.tsx`, which the admin group and
page lists also use — so Jenn sees her pages the way her students do
```

- [ ] **Step 3: Record the editor's new shape**

At the end of the **Uploaded pages** section in `CLAUDE.md`, add:

```markdown
The admin editor shows no HTML at all: `PageEditor` holds the document in
state and `HtmlDropZone` takes a file, so the round trip for a correction is
download → edit in the tool she wrote it in → re-upload. The download is a
plain `<a download>` pointing at `/p/[slug]/raw`, which is why that route and
its CSP needed no change to support it.
```

- [ ] **Step 4: Run the full CI sequence**

Run, in this order, and confirm each passes before the next:

```bash
npx prisma generate
npm run lint
npm run typecheck
npm test
npm run build
```

Expected: all pass. `npm test` should show the two new files among the suites, with 5 and 15 tests.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: record the admin tabs, the shared tile, and the HTML-free editor"
```

---

## Self-review notes

Checked against the spec, section by section:

- **Tabs** → Tasks 1, 8. Includes the `aria-current` nav (not a tablist), `?date=` carried on the Daily word link, per-tab queries, and no per-panel `<h1>`.
- **Centring** → Task 8 (header, strip, both panels) and Tasks 6/7/9 (headings, empty states, counts centred; labels left).
- **Field styling** → Task 3, including the removal of `inputClassName` rather than an alias.
- **Tiles** → Task 4, including the stretched link, the `z-10` action slot, and the shadow added to the student view.
- **Pages tab** → Task 6, including `createdAt` in `listPagesForAdmin` and the no-server-change download.
- **Groups tab** → Task 7.
- **Search** → Tasks 2, 5, 6, 7.
- **Page editor** → Task 9.
- **Tests** → Tasks 1, 2.
- **Documentation** → Task 10.

Name consistency verified across tasks: `fieldClassName`, `parseAdminTab`, `AdminTab`, `filterPages`, `filterGroups`, `normalise`, `Tile`, `SearchField`, `HtmlDropZone`, `PageSummary.createdAt`, `GroupSummary`.
