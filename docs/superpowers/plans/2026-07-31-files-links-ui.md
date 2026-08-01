# Files: Links and Per-Shelf Pins — Interface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put links on both shelves — a kind filter, an icon preview, a one-row add control, and a pin either party can press.

**Architecture:** `PageTile` already takes its preview as a `ReactNode` slot, so a link tile is a new renderer beside `HtmlPreview` rather than a change to the tile. The admin's student chip lifts into a client wrapper so it can drive three things at once: the filter, the pin target, and a new page's default audience. `FilesTab` becomes a client component and therefore has to take `today` as a prop.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript, Tailwind v4, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-31-files-links-and-fixes-design.md` §2-§6.

**Depends on:** `docs/superpowers/plans/2026-07-31-files-links-data.md`, complete and green. Every `lib/` function and server action this plan calls is built there.

---

## Critical context for whoever executes this

**You cannot see any of this.** No browser. `npm run typecheck` and
`npm run build` are your real checks — the build compiles every client component
and catches a server action passed wrongly across the RSC boundary, a missing
`"use client"`, or a `Date` that will not serialise. Task 9 is a hard stop where
you hand a review script to a human. Do not claim the interface looks right.

**Do not add component tests.** The convention is that components and Prisma
access are not unit-tested; the pure modules underneath them are, and those all
exist already from the data plan.

**Palette rule.** There are two token sets. The admin app uses `--color-*`. The
Québec flashcard template uses `--card-*`, and it travels with the template
rather than with a route — which is why `PageTile` and both page grids already
use `--card-*` on *both* sides of the site. When you add a control next to a
tile, match the tokens already in that file.

**Repeated flashcard class strings live in `components/card-styles.ts`.** Extend
that file rather than duplicating a string.

---

## File Structure

| File | Responsibility |
|---|---|
| `components/ui/PageTile.tsx` | **Modify.** One optional `external` prop. |
| `components/ui/LinkPreview.tsx` | **Create.** The `preview` node for a link — glyph plus host. |
| `components/ui/BrandGlyph.tsx` | **Create.** One inline SVG per `LinkBrand`. |
| `components/ui/FilterChip.tsx` | **Create.** `GroupChip` generalised, with an admin and a card skin. |
| `components/ui/KindFilter.tsx` | **Create.** The All / Pages / Links chip row, both sides. |
| `components/admin/PageList.tsx` | **Modify.** Chip state becomes props; kind filter; link tiles; pin needs a shelf. |
| `components/admin/AddLinkForm.tsx` | **Create.** Title + URL + a group picker, one row. |
| `components/admin/PageEditor.tsx` | **Modify.** `defaultGroupId`, and the don't-clobber rule. |
| `components/admin/PagesTabClient.tsx` | **Create.** Owns the student chip; feeds list, pin and both add forms. |
| `app/admin/page.tsx` | **Modify.** `PagesTab` renders the wrapper. |
| `components/student/FilesTab.tsx` | **Modify.** Becomes a client component; filters, add, pin, delete. |
| `components/student/AddLinkRow.tsx` | **Create.** The student's two-field add control. |
| `app/g/[slug]/page.tsx` | **Modify.** `has.files` rule; pass `today` and the bound actions. |
| `app/f/[token]/page.tsx` | **Modify.** Pass `today`; read-only. |
| `CLAUDE.md` | **Modify.** Five sections. |

---

### Task 1: `PageTile` learns about off-site destinations

**Files:**
- Modify: `components/ui/PageTile.tsx`

- [ ] **Step 1: Add the prop**

In `components/ui/PageTile.tsx`, add `external` to the props type, after `href`:

```tsx
  // An off-site destination. The title has to become a plain <a> rather than a
  // next/link <Link>, and it must carry rel="noopener" — without it the opened
  // page gets a window.opener handle back to this tab and can navigate it
  // somewhere else while the student is reading (reverse tabnabbing).
  external?: boolean;
```

- [ ] **Step 2: Branch on it**

Replace the `<Link>` element (currently lines 47-52) with:

```tsx
        {external ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="block truncate font-[family-name:var(--card-font-serif)] text-[15px] text-[var(--card-ink)] after:absolute after:inset-0"
          >
            {title}
          </a>
        ) : (
          <Link
            href={href}
            className="block truncate font-[family-name:var(--card-font-serif)] text-[15px] text-[var(--card-ink)] after:absolute after:inset-0"
          >
            {title}
          </Link>
        )}
```

The duplicated class string is deliberate: it is one string in one file, and
hoisting it to a constant to avoid repeating it twice reads worse than the
repetition.

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Expected: no new errors from this file.

- [ ] **Step 4: Commit**

```bash
git add components/ui/PageTile.tsx
git commit -m "feat: let a PageTile point off-site

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 2: The link preview

> **Trademark note, and a deviation to report.** This ships recognisable
> product-coloured glyphs — a lined sheet in Docs blue, a grid in Sheets green —
> not Google's official marks, because their path data cannot be reproduced
> accurately from memory and an approximation of a logo looks worse than an
> honest icon. Swapping in the official SVGs later is a change to
> `BrandGlyph.tsx` alone. **Say this plainly in your report.**

**Files:**
- Create: `components/ui/BrandGlyph.tsx`, `components/ui/LinkPreview.tsx`

- [ ] **Step 1: Write the glyphs**

Create `components/ui/BrandGlyph.tsx`:

```tsx
import type { LinkBrand } from "@/lib/link-brand";

// Product colours, literal rather than --card-* tokens: these identify someone
// else's product, so they must not shift when this project's palette does.
const TINT: Record<LinkBrand, string> = {
  "google-docs": "#1a73e8",
  "google-sheets": "#0f9d58",
  "google-slides": "#f4b400",
  "google-forms": "#7248b9",
  "google-drive": "#1a73e8",
  youtube: "#ff0000",
  pdf: "#d93025",
  generic: "#5f6368",
};

// A sheet with a folded corner, plus per-product marks on its face.
function Sheet({ children }: { children?: React.ReactNode }) {
  return (
    <>
      <path d="M14 6h14l10 10v26a2 2 0 0 1-2 2H14a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z" fill="currentColor" opacity="0.14" />
      <path d="M14 6h14l10 10v26a2 2 0 0 1-2 2H14a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z" fill="none" stroke="currentColor" strokeWidth="2.5" />
      <path d="M28 6v10h10" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
      {children}
    </>
  );
}

function Marks({ brand }: { brand: LinkBrand }) {
  switch (brand) {
    case "google-docs":
      return (
        <g stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M18 24h14M18 30h14M18 36h9" />
        </g>
      );
    case "google-sheets":
      return (
        <g stroke="currentColor" strokeWidth="2.5">
          <path d="M18 23h14v14H18z" fill="none" />
          <path d="M18 30h14M25 23v14" />
        </g>
      );
    case "google-slides":
      return <path d="M18 24h14v12H18z" fill="none" stroke="currentColor" strokeWidth="2.5" />;
    case "google-forms":
      return (
        <g stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M18 24l2.5 2.5L25 22M18 33l2.5 2.5L25 31M29 25h5M29 34h5" />
        </g>
      );
    case "pdf":
      return (
        <text x="25" y="36" textAnchor="middle" fontSize="11" fontWeight="700" fill="currentColor">
          PDF
        </text>
      );
    default:
      return null;
  }
}

export function BrandGlyph({ brand }: { brand: LinkBrand }) {
  const colour = TINT[brand];

  // Drive, YouTube and generic are not sheets, so they draw their own whole
  // shape rather than marks on one.
  if (brand === "google-drive") {
    return (
      <svg viewBox="0 0 50 50" width="56" height="56" style={{ color: colour }} aria-hidden="true">
        <path d="M19 7h12l13 22-6 11H12L6 29Z" fill="currentColor" opacity="0.14" />
        <path d="M19 7h12l13 22-6 11H12L6 29Z" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
      </svg>
    );
  }

  if (brand === "youtube") {
    return (
      <svg viewBox="0 0 50 50" width="56" height="56" style={{ color: colour }} aria-hidden="true">
        <rect x="6" y="12" width="38" height="26" rx="6" fill="currentColor" opacity="0.14" />
        <rect x="6" y="12" width="38" height="26" rx="6" fill="none" stroke="currentColor" strokeWidth="2.5" />
        <path d="M21 19l11 6-11 6Z" fill="currentColor" />
      </svg>
    );
  }

  if (brand === "generic") {
    return (
      <svg viewBox="0 0 50 50" width="56" height="56" style={{ color: colour }} aria-hidden="true">
        <g fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
          <path d="M21 29a7 7 0 0 1 0-10l5-5a7 7 0 0 1 10 10l-2 2" />
          <path d="M29 21a7 7 0 0 1 0 10l-5 5a7 7 0 0 1-10-10l2-2" />
        </g>
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 50 50" width="56" height="56" style={{ color: colour }} aria-hidden="true">
      <Sheet />
      <Marks brand={brand} />
    </svg>
  );
}
```

- [ ] **Step 2: Write the preview**

Create `components/ui/LinkPreview.tsx`:

```tsx
import { linkBrand, linkHostLabel } from "@/lib/link-brand";
import { cn } from "@/lib/utils";

// The link half of PageTile's `preview` slot, sitting beside HtmlPreview. The
// slot was left as a ReactNode for exactly this: a cross-origin URL generally
// cannot be framed at all, so this is a different renderer rather than
// HtmlPreview with another src.
//
// Nothing here makes a request. Not a favicon, not an og:image — no third party
// learns that a student opened their shelf.
export function LinkPreview({
  url,
  className,
}: {
  url: string;
  className?: string;
}) {
  const host = linkHostLabel(url);

  return (
    <div
      className={cn(
        "flex aspect-[4/3] flex-col items-center justify-center gap-2 bg-[var(--card-paper-back)]",
        className,
      )}
    >
      <BrandGlyph brand={linkBrand(url)} />
      {/* The host is the recognition cue when the glyph is the generic one, and
          it is the only place the destination is visible before clicking. */}
      {host && (
        <span className="max-w-[85%] truncate font-[family-name:var(--card-font-mono)] text-[10px] uppercase tracking-[1px] text-[var(--card-moss)]">
          {host}
        </span>
      )}
    </div>
  );
}
```

Add the import at the top: `import { BrandGlyph } from "@/components/ui/BrandGlyph";`

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/ui/BrandGlyph.tsx components/ui/LinkPreview.tsx
git commit -m "feat: add a no-network link tile preview

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 3: One chip component, two skins, and the kind filter

**Files:**
- Create: `components/ui/FilterChip.tsx`, `components/ui/KindFilter.tsx`

- [ ] **Step 1: Generalise the chip**

Create `components/ui/FilterChip.tsx` — this is `GroupChip` lifted out of
`PageList` with a tone added:

```tsx
"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Two skins because there are two palettes: the admin app in --color-* and the
// flashcard template in --card-*. Same control, and the student's shelf has to
// look like the student's shelf.
export type ChipTone = "admin" | "card";

const TONES: Record<ChipTone, { on: string; off: string }> = {
  admin: {
    on: "border-[var(--color-accent)] bg-[var(--color-accent)] font-medium text-white",
    off: "border-[var(--color-field-border)] bg-[var(--color-field)] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]",
  },
  card: {
    on: "border-[var(--card-bleu)] bg-[var(--card-bleu)] font-medium text-white",
    off: "border-[var(--card-line)] bg-[var(--card-paper)] text-[var(--card-moss)] hover:text-[var(--card-ink)]",
  },
};

export function FilterChip({
  active,
  tone,
  onClick,
  children,
}: {
  active: boolean;
  tone: ChipTone;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full border px-4 py-1.5 font-[family-name:var(--font-body)] text-sm transition-colors",
        active ? TONES[tone].on : TONES[tone].off,
      )}
    >
      {children}
    </button>
  );
}
```

- [ ] **Step 2: Write the kind filter**

Create `components/ui/KindFilter.tsx`:

```tsx
"use client";

import { FilterChip, type ChipTone } from "@/components/ui/FilterChip";
import type { KindFilter as Kind } from "@/lib/page-filters";

// Labels are passed in rather than switched on a locale flag: the admin says
// "Pages" and the student says "Les pages", and a component that knows both is
// a component that has to be edited to add a third.
export function KindFilter({
  value,
  onChange,
  tone,
  labels,
}: {
  value: Kind;
  onChange: (value: Kind) => void;
  tone: ChipTone;
  labels: { group: string; all: string; html: string; link: string };
}) {
  const options: { kind: Kind; label: string }[] = [
    { kind: "all", label: labels.all },
    { kind: "html", label: labels.html },
    { kind: "link", label: labels.link },
  ];

  return (
    <div
      role="group"
      aria-label={labels.group}
      className="mb-5 flex flex-wrap justify-center gap-2"
    >
      {options.map((option) => (
        <FilterChip
          key={option.kind}
          tone={tone}
          active={value === option.kind}
          onClick={() => onChange(option.kind)}
        >
          {option.label}
        </FilterChip>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck and commit**

```bash
npm run typecheck
```

```bash
git add components/ui/FilterChip.tsx components/ui/KindFilter.tsx
git commit -m "feat: extract FilterChip and add the kind filter

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 4: `PageList` — lifted chip, kind filter, link tiles, shelf-aware pin

**Files:**
- Modify: `components/admin/PageList.tsx`

- [ ] **Step 1: Replace the props and the state**

In `components/admin/PageList.tsx`, replace `PageSummary` and the local
`GroupChip` function with:

```tsx
export type PageSummary = {
  id: string;
  slug: string;
  title: string;
  createdAt: Date;
  pinnedAt: Date | null;
  kind: PageKind;
  url: string | null;
  addedByStudent: boolean;
  groupNames: string[];
  sharedWithEveryone: boolean;
};
```

Delete the whole `GroupChip` function — `FilterChip` replaces it — and update
the imports at the top of the file:

```tsx
import { FilterChip } from "@/components/ui/FilterChip";
import { KindFilter } from "@/components/ui/KindFilter";
import { LinkPreview } from "@/components/ui/LinkPreview";
import { filterPagesByKind, type KindFilter as Kind } from "@/lib/page-filters";
import type { PageKind } from "@/lib/page-kind";
```

- [ ] **Step 2: Take the group filter as a prop**

Replace the component's signature and the top of its body:

```tsx
export function PageList({
  pages,
  everyoneName,
  group,
  onGroup,
  canPin,
  onTogglePin,
  today,
}: {
  pages: PageSummary[];
  // Read from the flagged row rather than from a constant: the name is the
  // teacher's to change, and a stale literal here would silently stop a
  // student's chip widening to their inherited pages.
  everyoneName: string | null;
  // Lifted to PagesTabClient. The same selection drives three things now — the
  // filter, which shelf a pin lands on, and a new page's default audience — so
  // it cannot live in here any more.
  group: string | null;
  onGroup: (group: string | null) => void;
  // False when no student chip is active. "All" is not a shelf, so there is no
  // pin to toggle.
  canPin: boolean;
  onTogglePin: (slug: string, pinned: boolean) => Promise<void>;
  // Passed in rather than read as `new Date()` here. This is a client
  // component that also renders on the server, and a clock read on both sides
  // of hydration can straddle a week boundary and produce different sections
  // for the same list — a hydration mismatch that would appear once a week, at
  // midnight, and be unreproducible by daylight.
  today: Date;
}) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<Kind>("all");

  const groupNames = pageGroupNames(pages);
  const visible = filterPagesByKind(
    filterPagesByGroup(filterPages(pages, query), group, everyoneName ?? undefined),
    kind,
  );
```

The `const [group, setGroup] = useState<string | null>(null);` line goes away.

- [ ] **Step 3: Render both chip rows**

Replace the existing student-chip block with this, keeping it inside the
560px column:

```tsx
        <KindFilter
          value={kind}
          onChange={setKind}
          tone="admin"
          labels={{
            group: "Filter by kind",
            all: "All",
            html: "Pages",
            link: "Links",
          }}
        />

        {groupNames.length > 0 && (
          <div
            role="group"
            aria-label="Filter by student"
            className="mb-5 flex flex-wrap justify-center gap-2"
          >
            <FilterChip tone="admin" active={group === null} onClick={() => onGroup(null)}>
              All
            </FilterChip>
            {groupNames.map((name) => (
              <FilterChip
                key={name}
                tone="admin"
                active={group === name}
                // Clicking the active chip clears it, so the row never becomes
                // a trap she has to find "All" to escape.
                onClick={() => onGroup(group === name ? null : name)}
              >
                {name}
              </FilterChip>
            ))}
          </div>
        )}
```

- [ ] **Step 4: Make the tile kind-aware**

Replace the `<PageTile ... />` element and its `action` block with:

```tsx
                  <PageTile
                    href={page.kind === "link" ? (page.url ?? "#") : `/p/${page.slug}`}
                    external={page.kind === "link"}
                    title={page.title}
                    eyebrow={`${formatLongDate(page.createdAt)} · ${pageAudienceLabel(page)}${
                      page.addedByStudent ? " · added by student" : ""
                    }`}
                    preview={
                      page.kind === "link" && page.url ? (
                        <LinkPreview url={page.url} />
                      ) : (
                        <HtmlPreview slug={page.slug} />
                      )
                    }
                    action={
                      <div className="flex items-center gap-1">
                        {/* A link has no document to edit or download, so it
                            gets neither control rather than two that fail. */}
                        {page.kind === "html" && (
                          <>
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
                          </>
                        )}

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
                            disabled={!canPin}
                            aria-label={
                              canPin
                                ? page.pinnedAt
                                  ? `Unpin ${page.title}`
                                  : `Pin ${page.title}`
                                : "Pick a student to pin for"
                            }
                            title={
                              canPin
                                ? page.pinnedAt
                                  ? "Unpin"
                                  : "Pin"
                                : "Pick a student to pin for"
                            }
                            className={cn(pageActionClass, "disabled:opacity-40")}
                          >
                            <PinIcon filled={page.pinnedAt !== null} />
                          </button>
                        </form>
                      </div>
                    }
                  />
```

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck
```

Expected: errors only in `app/admin/page.tsx`, which Task 6 rewrites.

- [ ] **Step 6: Commit**

```bash
git add components/admin/PageList.tsx
git commit -m "feat: show links in the admin page list

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 5: `PageEditor` defaults its audience to the active filter

**Files:**
- Modify: `components/admin/PageEditor.tsx`

- [ ] **Step 1: Add the prop and the follow-until-touched rule**

In `components/admin/PageEditor.tsx`, add `useEffect` to the React import, add
`defaultGroupId` to the props type:

```tsx
  // The Pages tab's active student chip. A new page defaults to whoever is
  // being looked at; null when the filter is "All".
  defaultGroupId?: string | null;
```

and replace the `groupIds` state declaration with:

```tsx
  const [groupIds, setGroupIds] = useState<string[]>(
    initial?.groupIds ?? (defaultGroupId ? [defaultGroupId] : []),
  );
  // Mirrors titleFromFile directly above: a default should follow the filter
  // while she has expressed no opinion, and must never overwrite a choice she
  // made herself.
  const [groupsTouched, setGroupsTouched] = useState(false);

  useEffect(() => {
    // Never on the edit form — an existing page's audience is data, not a
    // default.
    if (initial || groupsTouched) return;
    setGroupIds(defaultGroupId ? [defaultGroupId] : []);
  }, [defaultGroupId, groupsTouched, initial]);
```

- [ ] **Step 2: Mark the checkboxes as touched**

Change `toggleGroup`:

```tsx
  function toggleGroup(id: string) {
    setGroupsTouched(true);
    setGroupIds((current) =>
      current.includes(id) ? current.filter((g) => g !== id) : [...current, id],
    );
  }
```

- [ ] **Step 3: Reset to the default, not to empty**

In `handleSubmit`'s success branch, replace `setGroupIds([]);` with:

```tsx
        // Back to the default rather than to nothing: the filter is still on
        // Marie, and the next page she adds is almost certainly Marie's too.
        setGroupIds(defaultGroupId ? [defaultGroupId] : []);
        setGroupsTouched(false);
```

- [ ] **Step 4: Typecheck and commit**

```bash
npm run typecheck
```

```bash
git add components/admin/PageEditor.tsx
git commit -m "feat: default a new page's audience to the active filter

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 6: The admin add-a-link row and the client wrapper

**Files:**
- Create: `components/admin/AddLinkForm.tsx`, `components/admin/PagesTabClient.tsx`
- Modify: `app/admin/page.tsx`

- [ ] **Step 1: Write the add-link form**

Create `components/admin/AddLinkForm.tsx`:

```tsx
"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import type { LinkInput } from "@/app/page-actions";

// Always visible, not inside the Collapsible the page uploader lives in.
// Adding a link is two fields; burying it under a disclosure beside a
// whole-screen upload form would make the easy thing look like the hard one.
export function AddLinkForm({
  groups,
  defaultGroupId,
  onSubmit,
}: {
  groups: { id: string; name: string }[];
  defaultGroupId: string | null;
  onSubmit: (input: LinkInput) => Promise<unknown>;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const target = groups.find((group) => group.id === defaultGroupId) ?? null;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        title,
        url,
        groupIds: defaultGroupId ? [defaultGroupId] : [],
      });
      setTitle("");
      setUrl("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add that link");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mb-8 flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row">
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://docs.google.com/…"
          aria-label="Link address"
          required
        />
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title (optional)"
          aria-label="Link title"
        />
        <Button type="submit" disabled={saving || url.trim() === ""}>
          {saving ? "Adding..." : "Add link"}
        </Button>
      </div>

      <p className="text-center text-sm text-[var(--color-ink-muted)]">
        {target
          ? `Will be shared with ${target.name}.`
          : "Pick a student above to share this with, or it will be added for nobody."}
      </p>

      {error && (
        <p role="alert" className="text-center text-sm text-[var(--color-accent)]">
          {error}
        </p>
      )}
    </form>
  );
}
```

- [ ] **Step 2: Write the wrapper**

Create `components/admin/PagesTabClient.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Collapsible } from "@/components/admin/Collapsible";
import { PageList, type PageSummary } from "@/components/admin/PageList";
import { PageEditor } from "@/components/admin/PageEditor";
import { AddLinkForm } from "@/components/admin/AddLinkForm";
import { defaultGroupId } from "@/lib/default-audience";
import type { LinkInput, PageInput } from "@/app/page-actions";

type AdminPage = Omit<PageSummary, "pinnedAt"> & {
  pins: { groupId: string; pinnedAt: Date }[];
};

// Owns the student chip, because three things now depend on it: which pages the
// list shows, which shelf a pin lands on, and which student a new page or link
// defaults to. It used to live inside PageList, which only needed the first.
export function PagesTabClient({
  pages,
  groups,
  everyoneName,
  today,
  onCreatePage,
  onCreateLink,
  onTogglePin,
}: {
  pages: AdminPage[];
  groups: { id: string; name: string }[];
  everyoneName: string | null;
  today: Date;
  onCreatePage: (input: PageInput) => Promise<unknown>;
  onCreateLink: (input: LinkInput) => Promise<unknown>;
  // Curried on groupId, so the client picks the shelf and the server still
  // re-authorises it.
  onTogglePin: (groupId: string, slug: string, pinned: boolean) => Promise<void>;
}) {
  const [group, setGroup] = useState<string | null>(null);
  const activeGroupId = defaultGroupId(group, groups);

  // Which pin applies depends on the chip. With "All" selected nothing is
  // pinned, because "All" is not a shelf — so the Pinned section does not
  // appear at all, which is correct rather than a missing feature.
  const withPins: PageSummary[] = pages.map(({ pins, ...page }) => ({
    ...page,
    pinnedAt: activeGroupId
      ? (pins.find((pin) => pin.groupId === activeGroupId)?.pinnedAt ?? null)
      : null,
  }));

  return (
    <div className="w-full">
      <PageList
        pages={withPins}
        everyoneName={everyoneName}
        group={group}
        onGroup={setGroup}
        canPin={activeGroupId !== null}
        onTogglePin={
          activeGroupId
            ? onTogglePin.bind(null, activeGroupId)
            : async () => {}
        }
        today={today}
      />

      <div className="mx-auto w-full max-w-[560px]">
        <AddLinkForm
          groups={groups}
          defaultGroupId={activeGroupId}
          onSubmit={onCreateLink}
        />

        {/* Closed on arrival: the list is what she comes to this tab for, and
            the publish form is a whole screen of controls below it. */}
        <Collapsible label="Add a page">
          <PageEditor
            groups={groups}
            defaultGroupId={activeGroupId}
            submitLabel="Publish page"
            onSubmit={onCreatePage}
          />
        </Collapsible>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Rewrite `PagesTab`**

In `app/admin/page.tsx`, replace the whole `PagesTab` function with:

```tsx
async function PagesTab() {
  // The group list is still needed here: the editor below assigns pages to
  // groups.
  const [pages, groups] = await Promise.all([
    listPagesForAdmin(),
    prisma.group.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, isEveryone: true },
    }),
  ]);

  // null when no row is flagged — a state the migration makes impossible, but
  // one the filter should degrade quietly on rather than crash.
  const everyoneName = groups.find((g) => g.isEveryone)?.name ?? null;

  // No 560px cap out here, unlike the other tabs: the page grid uses the
  // whole 1152px so four tiles are worth looking at. PagesTabClient caps its
  // own controls.
  return (
    <PagesTabClient
      pages={pages}
      groups={groups}
      everyoneName={everyoneName}
      today={new Date()}
      onCreatePage={createPage}
      onCreateLink={createLink}
      onTogglePin={setShelfPin}
    />
  );
}
```

and fix the imports at the top of that file — remove `PageList`, `PageEditor`,
`Collapsible` and `setPagePinned`; add:

```tsx
import { createPage, createLink, setShelfPin } from "@/app/page-actions";
import { PagesTabClient } from "@/components/admin/PagesTabClient";
```

Also remove the temporary `pages.map(... pinnedAt: null)` and the no-op
`onTogglePin` that the data plan's Task 13 added.

- [ ] **Step 4: Typecheck and build**

```bash
npm run typecheck && npm run build
```

Expected: exit 0 for both, except for errors in `FilesTab`, which Task 7 fixes.
The build is the real check here — it verifies the three server actions cross
the RSC boundary legally.

- [ ] **Step 5: Commit**

```bash
git add components/admin/AddLinkForm.tsx components/admin/PagesTabClient.tsx app/admin/page.tsx
git commit -m "feat: add links from the admin and drive defaults from the filter

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 7: The student shelf

**Files:**
- Create: `components/student/AddLinkRow.tsx`
- Modify: `components/student/FilesTab.tsx`

- [ ] **Step 1: Write the student's add control**

Create `components/student/AddLinkRow.tsx`:

```tsx
"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { fieldClassName } from "@/components/ui/field";

export function AddLinkRow({
  onAdd,
}: {
  onAdd: (input: { title: string; url: string }) => Promise<void>;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onAdd({ title, url });
      setTitle("");
      setUrl("");
      router.refresh();
    } catch {
      // The action's own messages are English and written for Jenn; the student
      // gets one French sentence instead of a leaked internal string.
      setError("Ce lien n'a pas pu être ajouté.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mx-auto mb-8 flex w-full max-w-[560px] flex-col gap-2"
    >
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://…"
          aria-label="Adresse du lien"
          required
          className={cn(fieldClassName, "mt-0")}
        />
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Titre (facultatif)"
          aria-label="Titre du lien"
          className={cn(fieldClassName, "mt-0")}
        />
        <button
          type="submit"
          disabled={saving || url.trim() === ""}
          className="whitespace-nowrap rounded-full bg-[var(--card-bleu)] px-5 py-2 font-[family-name:var(--card-font-serif)] text-sm text-white disabled:opacity-50"
        >
          {saving ? "Ajout…" : "Ajouter un lien"}
        </button>
      </div>

      {error && (
        <p role="alert" className="text-center text-sm text-[var(--card-rouge)]">
          {error}
        </p>
      )}
    </form>
  );
}
```

- [ ] **Step 2: Rewrite `FilesTab`**

Replace the whole of `components/student/FilesTab.tsx` with:

```tsx
"use client";

import { useState } from "react";
import { PageTile } from "@/components/ui/PageTile";
import { HtmlPreview } from "@/components/ui/HtmlPreview";
import { LinkPreview } from "@/components/ui/LinkPreview";
import { PinIcon } from "@/components/ui/PinIcon";
import { KindFilter } from "@/components/ui/KindFilter";
import { SearchField } from "@/components/admin/SearchField";
import { AddLinkRow } from "@/components/student/AddLinkRow";
import {
  pageGrid,
  pageSectionHeading,
  pageSectionList,
} from "@/components/card-styles";
import { sectionPages } from "@/lib/page-sections";
import { studentSectionLabel } from "@/lib/page-section-labels";
import { filterPages } from "@/lib/admin-search";
import { filterPagesByKind, type KindFilter as Kind } from "@/lib/page-filters";
import type { PageKind } from "@/lib/page-kind";
import { formatLongDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export type ShelfPage = {
  id: string;
  slug: string;
  title: string;
  createdAt: Date;
  pinnedAt: Date | null;
  kind: PageKind;
  url: string | null;
  addedByStudent: boolean;
};

export function FilesTab({
  pages,
  today,
  canWrite,
  onAddLink,
  onTogglePin,
  onDeleteLink,
}: {
  pages: ShelfPage[];
  // Passed in, never read as `new Date()` here. This component renders on both
  // sides of hydration, and a clock read that straddles a week boundary would
  // produce different sections for the same list — a mismatch appearing once a
  // week, at midnight, and unreproducible by daylight.
  today: Date;
  // False on the everyone group's public shelf and for an untokened visitor.
  canWrite: boolean;
  onAddLink?: (input: { title: string; url: string }) => Promise<void>;
  onTogglePin?: (slug: string, pinned: boolean) => Promise<void>;
  onDeleteLink?: (slug: string) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<Kind>("all");

  const visible = filterPagesByKind(filterPages(pages, query), kind);
  // Sections form over the filtered set — a heading above nothing would be a
  // bug the search field caused.
  const sections = sectionPages(visible, today);

  return (
    <div className={cn("mx-auto max-w-[1152px]")}>
      {canWrite && onAddLink && <AddLinkRow onAdd={onAddLink} />}

      {pages.length > 0 && (
        <div className="mx-auto w-full max-w-[560px]">
          <SearchField label="Chercher" value={query} onChange={setQuery} />
          <KindFilter
            value={kind}
            onChange={setKind}
            tone="card"
            labels={{
              group: "Filtrer par type",
              all: "Tout",
              html: "Les pages",
              link: "Les liens",
            }}
          />
        </div>
      )}

      {pages.length === 0 ? (
        <p className="text-center font-[family-name:var(--card-font-serif)] italic text-[var(--card-moss)]">
          Rien ici pour l&apos;instant.
        </p>
      ) : sections.length === 0 ? (
        <p className="text-center font-[family-name:var(--card-font-serif)] italic text-[var(--card-moss)]">
          Rien ne correspond.
        </p>
      ) : (
        <div className={pageSectionList}>
          {sections.map((section) => (
            <section key={`${section.key.kind}-${studentSectionLabel(section.key)}`}>
              <h2 className={pageSectionHeading}>
                {studentSectionLabel(section.key)}
              </h2>

              <ul className={pageGrid}>
                {section.pages.map((page) => (
                  <li key={page.id}>
                    <PageTile
                      href={page.kind === "link" ? (page.url ?? "#") : `/p/${page.slug}`}
                      external={page.kind === "link"}
                      title={page.title}
                      eyebrow={formatLongDate(page.createdAt)}
                      preview={
                        page.kind === "link" && page.url ? (
                          <LinkPreview url={page.url} />
                        ) : (
                          <HtmlPreview slug={page.slug} />
                        )
                      }
                      // Kept for a read-only visitor: without it a page sitting
                      // above a newer one looks like a sorting bug.
                      badge={
                        page.pinnedAt && !canWrite ? (
                          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--card-paper)] text-[var(--card-bleu)] shadow-[var(--card-shadow)]">
                            <PinIcon filled />
                          </span>
                        ) : undefined
                      }
                      action={
                        canWrite && onTogglePin ? (
                          <div className="flex items-center gap-1">
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
                                    ? `Désépingler ${page.title}`
                                    : `Épingler ${page.title}`
                                }
                                title={page.pinnedAt ? "Désépingler" : "Épingler"}
                                className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--card-bleu)] transition-colors hover:bg-[var(--card-bleu-soft)]"
                              >
                                <PinIcon filled={page.pinnedAt !== null} />
                              </button>
                            </form>

                            {/* Only their own links. The server re-checks with
                                canStudentDelete; this just avoids showing a
                                control that would fail. */}
                            {page.kind === "link" &&
                              page.addedByStudent &&
                              onDeleteLink && (
                                <form action={onDeleteLink.bind(null, page.slug)}>
                                  <button
                                    type="submit"
                                    aria-label={`Supprimer ${page.title}`}
                                    title="Supprimer"
                                    className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--card-moss)] transition-colors hover:bg-[var(--card-bleu-soft)]"
                                  >
                                    ×
                                  </button>
                                </form>
                              )}
                          </div>
                        ) : undefined
                      }
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Expected: errors only in `app/g/[slug]/page.tsx` and `app/f/[token]/page.tsx`,
which Task 8 fixes.

- [ ] **Step 4: Commit**

```bash
git add components/student/AddLinkRow.tsx components/student/FilesTab.tsx
git commit -m "feat: filter, add and pin on the student shelf

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 8: Wire the two student routes

**Files:**
- Modify: `app/g/[slug]/page.tsx`, `app/f/[token]/page.tsx`

- [ ] **Step 1: `/g/[slug]`**

Add the imports:

```tsx
import { addShelfLink, setShelfPin, deleteShelfLink } from "@/app/page-actions";
```

Change the `has.files` rule. Replace both occurrences of
`files: pages.length > 0` (lines 76 and 159) with `files: unlocked || pages.length > 0`,
and change the wrapper condition on line 154 from
`{(pages.length > 0 || unlocked) && (` — it already covers this, so leave it.

Add a comment above the `parseStudentTab` call:

```tsx
  // Both extra tabs are present for anyone unlocked, empty state and all. A
  // student with an empty shelf otherwise has no way to reach the control that
  // fills it, because the tab holding it is hidden for being empty. The second
  // clause exists only for the everyone group, whose shelf is public and has no
  // unlocked state to key off.
  const tab = parseStudentTab(tab_, {
    files: unlocked || pages.length > 0,
    board: unlocked,
  });
```

Replace `<FilesTab pages={pages} />` with:

```tsx
        <FilesTab
          pages={pages}
          today={today}
          canWrite={unlocked}
          onAddLink={addShelfLink.bind(null, group.id)}
          onTogglePin={setShelfPin.bind(null, group.id)}
          onDeleteLink={deleteShelfLink.bind(null, group.id)}
        />
```

`group.id` is bound on the server, so it never reaches the client, and each
action re-authorises for itself.

- [ ] **Step 2: `/f/[token]`**

This link is read-only — it addresses files and nothing else, and handing over a
files link must never hand over write access.

Replace `<FilesTab pages={pages} />` with:

```tsx
      {/* Read-only. filesToken addresses this shelf and nothing else; a link
          shared with a parent must not carry the power to add or pin. */}
      <FilesTab pages={pages} today={today} canWrite={false} />
```

and add above the return, alongside the existing `pages` fetch:

```tsx
  const today = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
```

Do the same in `/g/[slug]` if `today` is not already the UTC-midnight `Date` in
scope — it is, at line 80, so reuse it.

- [ ] **Step 3: Full CI**

```bash
npx prisma generate && npm run lint && npm run typecheck && npm test && npm run build
```

Expected: all five exit 0.

- [ ] **Step 4: Commit**

```bash
git add app/g app/f
git commit -m "feat: wire links and pinning into the student routes

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 9: CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: The route table**

Rewrite the `/g/[slug]` row. It currently claims the files tab and chat need the
token and that the everyone group's files are public. Keep both facts and add:
the Files and Whiteboard tabs are present for anyone unlocked, empty state and
all; either party can add a link and pin a page on that shelf.

- [ ] **Step 2: Retitle and extend "Uploaded pages"**

Rename the section to **Files: pages and links**. Add, in the house style —
a decision and the failure or reasoning behind it, never a restatement of code:

- A `Page` is now either an uploaded HTML document or a link to something we do
  not host, discriminated by `kind`. `readPageKind` resolves an unrecognised
  value by the `url` column rather than defaulting to `"html"`, because the row
  most likely to be broken is one with a url and no document.
- The earlier spec's "no kind column, there is one kind of page" is retired.
  Record that it was correct when written.
- `/p/[slug]`, `/p/[slug]/raw` and `POST /api/pages` 404 or 400 on a link row.
  404 rather than a redirect to the external URL: an open redirect on a public
  route is a phishing primitive.
- A link's preview is chosen from its URL by `linkBrand` and drawn from bundled
  SVG. **No request is made, by the server or the browser.** A server-side
  og:image fetch would be request forgery on a student-supplied URL, and would
  return a sign-in page for a Google Doc that is not public — the case the
  feature exists for.
- `parseLinkUrl` rejects every scheme but http and https. Students supply this
  string, and a `javascript:` URL in an href is stored XSS.

- [ ] **Step 3: Rewrite the pinning paragraph**

Replace the paragraph beginning "A page carries `pinnedAt`, null when unpinned":

- A pin is a `PagePin(pageId, groupId, pinnedAt)` row, not a column on the page.
  Still a timestamp, for the same reason as before: pinned pages order among
  themselves by when they were pinned.
- **Pins do not inherit.** A pin on the everyone shelf shows at `/g/all` and
  nowhere else, unlike the page itself. The cost is that pinning one reference
  for the class is one pin per student; the alternative was a second merge rule
  to keep in step with `effectivePages`.
- `PagePin` is not a mirror of `PageGroup`: a student can pin a page that
  reaches them through the everyone group, so a pin can exist for a pair with no
  `PageGroup` row.
- `applyPins` folds a shelf's pins on before `sectionPages` runs, which is why
  `sectionPages` is unchanged and still puts a pinned page only under Pinned.
- In the admin the pin acts on the shelf named by the active student chip, and
  is disabled under "All" — **so the Pinned section does not appear when no
  student is selected.** Record this; it looks like a bug otherwise.
- Writes are authorised by `shelfRole` (`lib/shelf-access.ts`), *not* `chatRole`.
  `chatRole` refuses the everyone group before it checks the teacher, which is
  right for a conversation and wrong for curation.

- [ ] **Step 4: Generalise the whiteboard tab rule**

In the Whiteboards section, replace "**The Whiteboard tab is present for anyone
unlocked**, empty state and all, because…" with a cross-reference to the shared
rule now stated in the files section, so it is written once rather than per
feature.

- [ ] **Step 5: The admin filter paragraph**

Extend the paragraph about filtering the Pages tab by a student: the chip is now
also the default audience for a new page or link, and the shelf a pin lands on.
Note the don't-clobber rule — the default follows the filter until she ticks a
box herself — and that it copies `titleFromFile`.

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: record links, per-shelf pins and the shelf access rule

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 10: STOP — human verification gate

- [ ] **Step 1: Run CI's exact sequence and paste the real output**

```bash
npx prisma generate && npm run lint && npm run typecheck && npm test && npm run build
```

- [ ] **Step 2: Report the deviation from the spec**

State plainly: the brand glyphs are product-coloured icons, **not** Google's
official logos. The request was "the Google Doc logo". Swapping in official SVGs
is a change to `components/ui/BrandGlyph.tsx` alone.

- [ ] **Step 3: Hand back this script**

> I cannot see any of this. The build and typecheck prove it compiles and that
> the server actions cross the RSC boundary legally; they prove nothing about
> how it looks or whether the access rules hold in practice. Please check:
>
> **Admin** (`/admin?tab=pages`)
> 1. Add a link with no student chip selected — it should warn it will be shared
>    with nobody, and still add.
> 2. Select **Marie**, open *Add a page* — Marie should be pre-ticked. Tick
>    someone else, then change the chip to **Luc**: the selection must **not**
>    move, because you touched it.
> 3. With **All** selected the pin buttons are disabled and there is no
>    **Pinned** section. Select Marie and pin something — it appears under
>    Pinned. Switch to Luc; it is not pinned there.
> 4. Filter **Links** — only links. Link tiles have no edit or download icon.
>
> **Student** (`/g/<slug>?k=<chatToken>`, tab **Les fichiers**)
> 5. On a student with an empty shelf the **Les fichiers** tab is still present,
>    with the add-link row visible.
> 6. Add a link. It appears with the right icon, opens in a new tab, and carries
>    a × you can delete it with. A page Jenn uploaded has no ×.
> 7. Pin something — it moves to **Épinglé** on this shelf and stays unpinned
>    on another student's.
>
> **Access — the ones that matter**
> 8. `/g/all?tab=files` (no token): tiles render, and there is **no** add-link
>    row, **no** pin control and **no** ×. This shelf is public.
> 9. `/g/<slug>` with **no** `?k=`: the card renders as always and there is no
>    files tab unless that student has pages.
> 10. `/f/<filesToken>`: tiles render, read-only, no controls.
> 11. Paste `javascript:alert(1)` into the add-link field — it must be refused.
> 12. Open `/p/<a link's slug>` directly — it must 404, not redirect.

- [ ] **Step 4: Wait for confirmation before pushing**

---

## Self-review notes

- **Spec coverage:** §2 tab presence → Task 8. §3 rendering and the external
  `href` → Tasks 1, 2. §4 filters, `FilesTab` client conversion, one-row add →
  Tasks 3, 6, 7. §5 pinning both sides → Tasks 4, 6, 7. §6 default audience →
  Tasks 5, 6. Documentation → Task 9.
- **Type consistency:** `PageSummary`, `ShelfPage`, `KindFilter` (component) vs
  `Kind` (the aliased type), `ChipTone`, `LinkBrand`, `defaultGroupId`,
  `setShelfPin`, `addShelfLink`, `deleteShelfLink`, `createLink` match the data
  plan's exports exactly. The `KindFilter` name is deliberately aliased on
  import in `PageList` and `FilesTab` because the component and the type share
  it.
- **Known deviation:** brand glyphs are not official logos. Surfaced in Task 2
  and again at the gate.
