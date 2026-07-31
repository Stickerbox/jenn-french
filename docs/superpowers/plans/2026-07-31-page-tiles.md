# Page Tiles With Previews Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn both page lists — the student's files shelf and the admin Pages tab — into a grid of tiles, each showing a scaled-down live rendering of the page it links to.

**Architecture:** A new `PageTile` (thumbnail slot + footer) and `HtmlPreview` (an oversized, script-free iframe of the existing `/p/[slug]/raw`, scaled down with pure CSS). No new route, no CSP change, no schema change, no new dependency. The one rule-bearing fragment — the admin's "who is this page for" label — moves into `lib/` with a test.

**Tech Stack:** Next.js 16 (App Router), React 19, Tailwind v4 via PostCSS (no `tailwind.config`), Vitest, TypeScript.

**Design spec:** `docs/superpowers/specs/2026-07-31-page-tiles-design.md` — read it before starting.

## Global Constraints

- **Imports use the `@/` alias** for repo-root-relative paths.
- **Logic belongs in `lib/`** as pure functions with a test in `tests/lib/`. Components and Prisma access are *not* unit-tested in this repo — do not add component tests.
- **Comments explain the "why", especially the counter-intuitive.** Do not add comments that restate the code.
- **Repeated flashcard class strings live in `components/card-styles.ts`** — extend that file rather than duplicating strings across components.
- **The flashcard palette is `--card-*`**, defined in `app/globals.css`. Both page lists use it, the admin one included. Do not introduce `--color-*` tokens into these tiles.
- **Never add `allow-scripts` to a preview iframe.** `sandbox=""` on the thumbnail is deliberate and is stricter than the frame on `/p/[slug]`.
- **Do not touch** `app/p/[slug]/page.tsx`, `app/p/[slug]/raw/route.ts`, `prisma/schema.prisma`, or `components/ui/Tile.tsx`. `Tile` is still used by `components/admin/GroupList.tsx` and stays exactly as it is.
- **Verification commands**, in CI order: `npm run lint`, `npx tsc --noEmit`, `npm test`, `npm run build`.

---

### Task 1: The audience label

The admin tile's eyebrow says who a page is for. Today that is a nested ternary inline in `PageList`'s JSX. It is the only rule in this change, so it moves to `lib/` and gets a test.

**Files:**
- Create: `lib/page-tile.ts`
- Create: `tests/lib/page-tile.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `pageAudienceLabel(page: PageAudience): string` and `type PageAudience = { groupNames: string[]; sharedWithEveryone: boolean }`. Task 4 calls it.

- [ ] **Step 1: Write the failing test**

Create `tests/lib/page-tile.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { pageAudienceLabel } from "@/lib/page-tile";

describe("pageAudienceLabel", () => {
  it("names the students a page is assigned to", () => {
    expect(
      pageAudienceLabel({
        groupNames: ["Marie", "Luc"],
        sharedWithEveryone: false,
      }),
    ).toBe("Marie, Luc");
  });

  it("says so when a page is assigned to nobody", () => {
    expect(
      pageAudienceLabel({ groupNames: [], sharedWithEveryone: false }),
    ).toBe("no students");
  });

  it("reports the everyone group rather than its name", () => {
    expect(
      pageAudienceLabel({ groupNames: ["Everyone"], sharedWithEveryone: true }),
    ).toBe("shared with everyone");
  });

  // A page can be assigned to the everyone group AND to two students. Naming
  // those two would understate its reach: every student has it.
  it("prefers everyone over the student names beside it", () => {
    expect(
      pageAudienceLabel({
        groupNames: ["Everyone", "Marie"],
        sharedWithEveryone: true,
      }),
    ).toBe("shared with everyone");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/lib/page-tile.test.ts`
Expected: FAIL — cannot resolve `@/lib/page-tile`.

- [ ] **Step 3: Write the implementation**

Create `lib/page-tile.ts`:

```ts
export type PageAudience = {
  groupNames: string[];
  sharedWithEveryone: boolean;
};

// Everyone wins over the names beside it: a page on the everyone group is on
// every student's shelf, so listing the two students it is also assigned to
// would describe a smaller reach than it has.
export function pageAudienceLabel(page: PageAudience): string {
  if (page.sharedWithEveryone) return "shared with everyone";
  if (page.groupNames.length === 0) return "no students";
  return page.groupNames.join(", ");
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/lib/page-tile.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/page-tile.ts tests/lib/page-tile.test.ts
git commit -m "feat: extract the page audience label into lib"
```

---

### Task 2: The preview frame and the tile

Both new components, plus the shared class strings they and the two lists need. Nothing renders them yet, so this task's deliverable is verified by typecheck, lint and build rather than by a test.

**Files:**
- Create: `components/ui/HtmlPreview.tsx`
- Create: `components/ui/PageTile.tsx`
- Modify: `components/card-styles.ts` (append)

**Interfaces:**
- Consumes: `cn` from `@/lib/utils`, `cardEyebrow` from `@/components/card-styles`.
- Produces:
  - `HtmlPreview({ slug, className }: { slug: string; className?: string })`
  - `PageTile({ href, title, eyebrow, preview, action, className })` where `preview: ReactNode`, `action?: ReactNode`, the rest `string` / `string | undefined`
  - `pageGrid: string` and `pageTileFrame: string` exported from `components/card-styles.ts`
  - Tasks 3 and 4 use all of these.

- [ ] **Step 1: Add the shared class strings**

Append to `components/card-styles.ts`:

```ts
// Both page lists — the student's shelf and the admin's Pages tab — share this
// grid so the two stay the same shape. Two columns on a phone rather than one:
// the shelf is opened on phones, and a single column of thumbnails is a longer
// scroll than the row list it replaced, which would make the redesign cost
// something to the people it is for.
export const pageGrid = "grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4";

// `overflow-hidden` is not decoration: it is what clips the oversized preview
// frame inside HtmlPreview to the tile.
export const pageTileFrame =
  "relative flex h-full flex-col overflow-hidden rounded-[14px] border border-[var(--card-line)] bg-[var(--card-paper)] shadow-[var(--card-shadow)] transition-opacity hover:opacity-85";
```

- [ ] **Step 2: Write `HtmlPreview`**

Create `components/ui/HtmlPreview.tsx`:

```tsx
import { cn } from "@/lib/utils";

// A live thumbnail: the real page, framed oversized and scaled down.
//
// The frame is sized as a PERCENTAGE of the tile and scaled by a fixed factor,
// rather than sized in pixels and scaled by a computed one. The obvious
// formulation — a 900px frame at `scale(calc(100cqw / 900))` — is invalid CSS:
// a length divided by a number is a length, and scale() takes a unitless
// number, so the browser drops the rule. 500% at 0.2 needs no arithmetic and
// works at every column width with no measurement and no ResizeObserver.
//
// So the frame lays out at five times the tile's width — roughly 700-1200px in
// practice — and that range is the point. An iframe sized TO the tile (160px on
// a phone) would make the page lay itself out in its OWN mobile breakpoint, and
// the thumbnail would show a layout that opening the page never produces.
//
// The 4:3 box and the 5x/0.2 pair agree: the frame's height is 500% of a box
// three-quarters as tall as it is wide, so the scaled frame fills the box
// exactly — no letterbox, no overflow.
export function HtmlPreview({
  slug,
  className,
}: {
  slug: string;
  className?: string;
}) {
  return (
    <div
      className={cn("relative aspect-[4/3] overflow-hidden bg-white", className)}
    >
      <iframe
        src={`/p/${slug}/raw`}
        // sandbox="" — NOT `allow-scripts`, unlike the frame on /p/[slug].
        // A shelf mounts a dozen documents at once; their scripts would all
        // run, and an animation or an autoplaying <audio> inside a 160px
        // thumbnail has no control surface to stop it. This is strictly
        // stronger than /p/[slug]'s sandbox, so it adds no exposure — and the
        // raw route's `frame-ancestors 'self'` already permits framing here.
        // The cost is that a page drawn entirely by JavaScript previews blank.
        // That is not detectable from out here: the frame has an opaque origin,
        // so there is nothing to read back and no fallback to trigger.
        sandbox=""
        loading="lazy"
        // Decorative. The tile's title link is its accessible name, so a screen
        // reader walking a shelf hears eight titles, not eight documents.
        aria-hidden
        inert
        tabIndex={-1}
        // The tap belongs to the tile's stretched link, not to the page inside.
        className="pointer-events-none absolute left-0 top-0 h-[500%] w-[500%] origin-top-left scale-[0.2] border-0"
      />
    </div>
  );
}
```

- [ ] **Step 3: Write `PageTile`**

Create `components/ui/PageTile.tsx`:

```tsx
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { cardEyebrow, pageTileFrame } from "@/components/card-styles";

export function PageTile({
  href,
  title,
  eyebrow,
  preview,
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
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn(pageTileFrame, className)}>
      {preview}

      <div className="flex items-start justify-between gap-2 border-t border-[var(--card-line)] px-4 py-3">
        <div className="min-w-0">
          {/* Stretched over the whole tile rather than wrapping it: `action`
              is itself made of anchors, and an anchor inside an anchor is
              invalid HTML that browsers repair by splitting the element. */}
          <Link
            href={href}
            className="block truncate font-[family-name:var(--card-font-serif)] text-[15px] text-[var(--card-ink)] after:absolute after:inset-0"
          >
            {title}
          </Link>
          <span className={cn("mt-0.5 block truncate", cardEyebrow)}>
            {eyebrow}
          </span>
        </div>

        {action && <div className="relative z-10 shrink-0">{action}</div>}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verify it compiles and lints**

Run: `npx tsc --noEmit && npm run lint`
Expected: both clean.

If ESLint reports `jsx-a11y/iframe-has-title`, do **not** invent a visible title — the frame is `aria-hidden`. Add `title=""` to the iframe and leave everything else as written.

If TypeScript rejects the `inert` prop, the installed `@types/react` predates React 19's boolean `inert`; drop the `inert` attribute and keep `aria-hidden` and `tabIndex={-1}`, which carry the same intent.

- [ ] **Step 5: Commit**

```bash
git add components/ui/HtmlPreview.tsx components/ui/PageTile.tsx components/card-styles.ts
git commit -m "feat: add the page tile and its live scaled-iframe preview"
```

---

### Task 3: The student shelf

`FilesTab` renders on `/g/[slug]?tab=files` and on `/f/[token]`. Both call it with the same props; neither call site changes.

**Files:**
- Modify: `components/student/FilesTab.tsx` (whole file)

**Interfaces:**
- Consumes: `PageTile`, `HtmlPreview` (Task 2), `pageGrid` (Task 2).
- Produces: nothing new. `FilesTab({ pages })` keeps its exact signature — `{ slug: string; title: string; createdAt: Date }[]`.

- [ ] **Step 1: Replace the file's body**

Rewrite `components/student/FilesTab.tsx` as:

```tsx
import { PageTile } from "@/components/ui/PageTile";
import { HtmlPreview } from "@/components/ui/HtmlPreview";
import { pageGrid } from "@/components/card-styles";
import { formatLongDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export function FilesTab({
  pages,
}: {
  pages: { slug: string; title: string; createdAt: Date }[];
}) {
  if (pages.length === 0) {
    return (
      <p className="text-center font-[family-name:var(--card-font-serif)] italic text-[var(--card-moss)]">
        Rien ici pour l&apos;instant.
      </p>
    );
  }

  // The old 560px cap was sized for one column of rows and would pin the grid
  // at two columns forever.
  return (
    <ul className={cn("mx-auto max-w-[880px]", pageGrid)}>
      {pages.map((page) => (
        <li key={page.slug}>
          <PageTile
            href={`/p/${page.slug}`}
            title={page.title}
            eyebrow={formatLongDate(page.createdAt)}
            preview={<HtmlPreview slug={page.slug} />}
          />
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 2: Verify it compiles, lints and builds**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: all clean.

- [ ] **Step 3: Look at it**

Run `npm run dev`, then open a student's files tab — `/g/<slug>?tab=files&k=<chatToken>` for a student with pages, or `/g/all?tab=files`, which needs no token. Read the chat-token value out of the database if you need one: `npx prisma studio`, `Group` table, `chatToken` column.

Confirm, at a phone width (DevTools, 390px) and at desktop width:

- Two columns on the phone, three then four as the window widens.
- Each thumbnail shows the page's real content, laid out wide rather than in its mobile layout.
- Nothing inside a thumbnail moves, and nothing plays.
- Tapping anywhere on a tile opens `/p/<slug>`.
- A student with no pages still gets "Rien ici pour l'instant."

- [ ] **Step 4: Commit**

```bash
git add components/student/FilesTab.tsx
git commit -m "feat: render the student shelf as a grid of previewed tiles"
```

---

### Task 4: The admin Pages tab

Same grid, plus the two icon actions in the tile footer and the audience label from Task 1. The search field and the student filter chips are untouched.

**Files:**
- Modify: `components/admin/PageList.tsx` — imports, `pageActionClass`, and the `<ul>` block (currently lines 156-204)

**Interfaces:**
- Consumes: `pageAudienceLabel` (Task 1), `PageTile`, `HtmlPreview`, `pageGrid` (Task 2).
- Produces: nothing new. `PageSummary` keeps its exact shape.

- [ ] **Step 1: Swap the imports**

In `components/admin/PageList.tsx`, replace the `Tile` import with the three new ones and add the label:

```tsx
import { PageTile } from "@/components/ui/PageTile";
import { HtmlPreview } from "@/components/ui/HtmlPreview";
import { pageGrid } from "@/components/card-styles";
import { pageAudienceLabel } from "@/lib/page-tile";
```

Delete `import { Tile } from "@/components/ui/Tile";`. Leave the `SearchField`, `filterPages`, `filterPagesByGroup`, `pageGroupNames`, `formatLongDate` and `cn` imports alone.

- [ ] **Step 2: Shrink the action buttons**

The 36px hit targets were sized for a full-width row. In a tile footer they crowd the title. Change `pageActionClass` from `h-9 w-9` to `h-8 w-8`:

```tsx
const pageActionClass =
  "flex h-8 w-8 items-center justify-center rounded-full text-[var(--card-bleu)] transition-colors hover:bg-[var(--card-bleu-soft)]";
```

- [ ] **Step 3: Replace the list with the grid**

Replace the whole `<ul className="flex flex-col gap-3"> … </ul>` block with:

```tsx
        <ul className={pageGrid}>
          {visible.map((page) => (
            <li key={page.id}>
              <PageTile
                href={`/admin/pages/${page.slug}`}
                title={page.title}
                eyebrow={`${formatLongDate(page.createdAt)} · ${pageAudienceLabel(page)}`}
                preview={<HtmlPreview slug={page.slug} />}
                action={
                  <div className="flex items-center gap-1">
                    {/* /p/[slug] is the page itself, sandboxed exactly as a
                        student gets it — a page has no group-scoped URL, so
                        this is the link whatever groups it belongs to. */}
                    <a
                      href={`/p/${page.slug}`}
                      target="_blank"
                      rel="noopener"
                      aria-label={`View ${page.title}`}
                      title="View"
                      className={pageActionClass}
                    >
                      <EyeIcon />
                    </a>

                    {/* No server support needed: `download` on a same-origin
                        response forces a save-as, so the raw route keeps its
                        exact behaviour and its CSP, and no new authenticated
                        surface appears. That route is already public. */}
                    <a
                      href={`/p/${page.slug}/raw`}
                      download={`${page.slug}.html`}
                      aria-label={`Download ${page.title}`}
                      title="Download"
                      className={pageActionClass}
                    >
                      <DownloadIcon />
                    </a>
                  </div>
                }
              />
            </li>
          ))}
        </ul>
```

Note what left: the nested ternary that built the audience half of the eyebrow is now `pageAudienceLabel(page)`. `EyeIcon`, `DownloadIcon` and `GroupChip` stay exactly as they are.

- [ ] **Step 4: Verify the whole CI sequence**

Run: `npm run lint && npx tsc --noEmit && npm test && npm run build`
Expected: all four clean. `Tile` must no longer be imported here — an unused import would fail lint.

- [ ] **Step 5: Look at it**

With `npm run dev`, log in and open `/admin?tab=pages`. Confirm:

- The grid matches the student shelf's shape.
- Each eyebrow reads e.g. `30 juillet 2026 · shared with everyone`, `· Marie, Luc`, or `· no students`.
- The eye opens `/p/<slug>` in a new tab and the arrow downloads `<slug>.html` — neither one navigates to the editor underneath.
- Clicking the tile itself opens `/admin/pages/<slug>`.
- Typing in the search field and clicking a student chip still filter, and "Nothing matches that." still appears when nothing does.

- [ ] **Step 6: Commit**

```bash
git add components/admin/PageList.tsx
git commit -m "feat: render the admin pages list as previewed tiles"
```

---

### Task 5: Record the decisions in CLAUDE.md

The `sandbox=""` rule is a "never weaken this" constraint of the same kind as the `allow-same-origin` one already documented, and it belongs beside it.

**Files:**
- Modify: `CLAUDE.md` — the "Uploaded pages" section under "Architecture"

**Interfaces:**
- Consumes: nothing.
- Produces: nothing.

- [ ] **Step 1: Add the paragraph**

In `CLAUDE.md`, in the "Uploaded pages" section, insert after the paragraph that begins "There is no HTML sanitiser, deliberately.":

```markdown
Both page lists — the student's shelf and the admin Pages tab — render
`PageTile` in a grid, each tile previewing its page live: `HtmlPreview` frames
`/p/[slug]/raw` at 500% and scales it by 0.2, so the page lays out at roughly
laptop width and is clipped to the tile. A frame sized to the tile would render
the page's own mobile breakpoint instead, which is a layout opening it never
produces. That frame is `sandbox=""` — **never add `allow-scripts` to a preview
frame.** A shelf mounts a dozen documents at once, and an animation or an
autoplaying `<audio>` inside a 160px thumbnail has no control surface to stop
it; the reasoning that justifies `allow-scripts` on `/p/[slug]`, where the
student chose to open the page, does not transfer. The cost is accepted: a page
drawn entirely by JavaScript previews blank, and that is undetectable from
outside an opaque origin. `PageTile` takes its preview as a `ReactNode` slot
rather than a slug, so planned support for links to pages we do not host adds a
renderer instead of changing the tile — a cross-origin URL usually cannot be
framed at all, so it will not be `HtmlPreview` with a different `src`.
```

- [ ] **Step 2: Check the surrounding claims still hold**

Read the "Styling" bullet under "Conventions". It lists where the `--card-*` palette travels and names `components/ui/Tile.tsx`. Add `components/ui/PageTile.tsx` to that list in the same breath — the reasoning given there (Jenn sees her pages the way her students do) now applies to both.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: record the preview frame's sandbox and the ReactNode seam"
```

---

## Done when

`npm run lint`, `npx tsc --noEmit`, `npm test` and `npm run build` are all clean, and both lists render as grids of previewed tiles with every control in Tasks 3 and 4 behaving as described.
