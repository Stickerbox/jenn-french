# Files: Links and Per-Shelf Pins — Data Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Teach the `Page` model to hold external links as well as uploaded HTML, and move pinning from one global column to a per-shelf join table — with no user-visible change yet.

**Architecture:** One `Page` table gains `kind`, `url` and `addedByStudent`; `Page.pinnedAt` moves to a `PagePin(pageId, groupId)` table. Every new rule is a pure function in `lib/` with a test in `tests/lib/`, so the query and action layers stay thin. The UI lands in the follow-on plan.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript, Prisma + SQLite, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-31-files-links-and-fixes-design.md`

**Sequencing:** This plan is self-contained and ends green — lint, typecheck, tests and build all pass, and the site behaves exactly as it does today. `docs/superpowers/plans/2026-07-31-files-links-ui.md` builds the interface on top of it. The whiteboard fix (`2026-07-31-whiteboard-text-fix.md`) is independent of both.

---

## Critical context for whoever executes this

**Task 8 can destroy production data.** Prisma writes schema-only migrations and
will not generate the pin backfill. Read that task in full before running any
Prisma command.

**Project conventions, which you must follow:**
- Logic lives in `lib/` as pure functions tested in `tests/lib/`. Components and
  Prisma access are **not** unit-tested — do not add component tests.
- Comments explain *why*, especially the counter-intuitive. Never restate code.
- Imports use the `@/` alias.
- Deletes use `deleteMany`, updates `updateMany`/`upsert`, so a double-click or
  a stale tab is a no-op rather than a Prisma `P2025`.
- "Student" is the UI word, "Group" is the code word. In `lib/` and `prisma/`
  it is `group`.

**Run before claiming any task complete:** `npx vitest run <the test file>`.
Run the full CI sequence at Task 14.

---

## File Structure

| File | Responsibility |
|---|---|
| `lib/link-url.ts` | **Create.** `parseLinkUrl` — the scheme allowlist. Security control. |
| `lib/link-brand.ts` | **Create.** `linkBrand`, `linkHostLabel` — URL → which icon. |
| `lib/page-kind.ts` | **Create.** `readPageKind` — the `String`-column guard. |
| `lib/page-filters.ts` | **Create.** `filterPagesByKind`. |
| `lib/page-pins.ts` | **Create.** `applyPins` — fold a shelf's pins onto its pages. |
| `lib/shelf-access.ts` | **Create.** `shelfRole`, `canStudentDelete` — who may write. |
| `lib/default-audience.ts` | **Create.** `defaultGroupId` — active chip → group id. |
| `prisma/schema.prisma` | **Modify.** `kind`/`url`/`addedByStudent`; `PagePin`; drop `pinnedAt`. |
| `prisma/migrations/*/migration.sql` | **Create, hand-edited.** Backfill before drop. |
| `lib/pages.ts` | **Modify.** `savePage` union; `kind` and pins in both list queries. |
| `app/page-actions.ts` | **Modify.** `createLink`, `addShelfLink`, `setShelfPin`, `deleteShelfLink`. |
| `app/p/[slug]/page.tsx`, `app/p/[slug]/raw/route.ts`, `app/api/pages/route.ts` | **Modify.** Reject link rows. |

---

### Task 1: `parseLinkUrl` — the scheme allowlist

Students supply this string. A `javascript:` or `data:` URL rendered into an
`href` is stored XSS, so this is a security control, not a formatting helper.

**Files:**
- Create: `lib/link-url.ts`
- Test: `tests/lib/link-url.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/link-url.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseLinkUrl } from "@/lib/link-url";

describe("parseLinkUrl", () => {
  it("accepts an https URL", () => {
    expect(parseLinkUrl("https://example.com/a")).toEqual({
      ok: true,
      url: "https://example.com/a",
    });
  });

  it("accepts http", () => {
    const result = parseLinkUrl("http://example.com/");
    expect(result.ok).toBe(true);
  });

  it("prefixes a bare host, which is what a paste from the address bar looks like", () => {
    expect(parseLinkUrl("docs.google.com/document/d/abc")).toEqual({
      ok: true,
      url: "https://docs.google.com/document/d/abc",
    });
  });

  it("trims surrounding whitespace", () => {
    expect(parseLinkUrl("  https://example.com/  ")).toEqual({
      ok: true,
      url: "https://example.com/",
    });
  });

  for (const hostile of [
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    "  javascript:alert(1)  ",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
  ]) {
    it(`rejects ${hostile.trim().slice(0, 20)}`, () => {
      // The prefixing branch must never turn one of these into
      // "https://javascript:alert(1)" and quietly accept it.
      expect(parseLinkUrl(hostile).ok).toBe(false);
    });
  }

  it("rejects an empty or blank string", () => {
    expect(parseLinkUrl("").ok).toBe(false);
    expect(parseLinkUrl("   ").ok).toBe(false);
  });

  it("rejects a non-string", () => {
    expect(parseLinkUrl(null).ok).toBe(false);
    expect(parseLinkUrl(42).ok).toBe(false);
  });

  it("rejects something too long to be a link anyone pasted", () => {
    expect(parseLinkUrl(`https://example.com/${"a".repeat(2100)}`).ok).toBe(false);
  });

  it("rejects a host:port with no scheme, which reads as a scheme", () => {
    // Documented, accepted false negative: "localhost:3000/x" parses as scheme
    // "localhost:". Rejecting is the safe direction and Jenn pastes public URLs.
    expect(parseLinkUrl("localhost:3000/x").ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx vitest run tests/lib/link-url.test.ts
```

Expected: FAIL — `Failed to resolve import "@/lib/link-url"`.

- [ ] **Step 3: Implement**

Create `lib/link-url.ts`:

```ts
const MAX_URL_LENGTH = 2048;

export type LinkUrlResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

// The one guard between a student's typing and an href. Everything else about
// a link is cosmetic; this is not.
export function parseLinkUrl(input: unknown): LinkUrlResult {
  if (typeof input !== "string") {
    return { ok: false, error: "A link is required." };
  }

  const trimmed = input.trim();
  if (!trimmed) return { ok: false, error: "A link is required." };
  if (trimmed.length > MAX_URL_LENGTH) {
    return { ok: false, error: "That link is too long." };
  }

  // Prefix ONLY when there is no scheme at all. Testing for a scheme first is
  // what stops "javascript:alert(1)" being rewritten to
  // "https://javascript:alert(1)" — a valid URL, and an accepted one.
  const candidate = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return { ok: false, error: "That doesn't look like a link." };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, error: "A link must start with http:// or https://." };
  }

  if (!parsed.hostname) {
    return { ok: false, error: "That doesn't look like a link." };
  }

  return { ok: true, url: parsed.toString() };
}
```

- [ ] **Step 4: Run it and watch it pass**

```bash
npx vitest run tests/lib/link-url.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/link-url.ts tests/lib/link-url.test.ts
git commit -m "feat: add parseLinkUrl with an http(s) scheme allowlist

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 2: `linkBrand` — which icon a URL gets

**Files:**
- Create: `lib/link-brand.ts`
- Test: `tests/lib/link-brand.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/link-brand.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { linkBrand, linkHostLabel } from "@/lib/link-brand";

describe("linkBrand", () => {
  it("tells the three docs.google.com products apart by path", () => {
    // They share a host, so a host-only rule would give a spreadsheet the
    // Docs icon.
    expect(linkBrand("https://docs.google.com/document/d/abc/edit")).toBe("google-docs");
    expect(linkBrand("https://docs.google.com/spreadsheets/d/abc")).toBe("google-sheets");
    expect(linkBrand("https://docs.google.com/presentation/d/abc")).toBe("google-slides");
    expect(linkBrand("https://docs.google.com/forms/d/abc")).toBe("google-forms");
  });

  it("falls back to Drive for an unrecognised docs.google.com path", () => {
    expect(linkBrand("https://docs.google.com/something/else")).toBe("google-drive");
  });

  it("recognises the other Google hosts", () => {
    expect(linkBrand("https://drive.google.com/file/d/abc")).toBe("google-drive");
    expect(linkBrand("https://forms.gle/abc")).toBe("google-forms");
  });

  it("recognises YouTube in its several hostnames", () => {
    expect(linkBrand("https://www.youtube.com/watch?v=abc")).toBe("youtube");
    expect(linkBrand("https://youtu.be/abc")).toBe("youtube");
    expect(linkBrand("https://m.youtube.com/watch?v=abc")).toBe("youtube");
  });

  it("recognises a PDF by extension", () => {
    expect(linkBrand("https://example.com/files/verbes.PDF")).toBe("pdf");
  });

  it("does not mistake a query string for a PDF", () => {
    expect(linkBrand("https://example.com/page?file=x.pdf")).toBe("generic");
  });

  it("falls back to generic", () => {
    expect(linkBrand("https://example.com/anything")).toBe("generic");
  });

  it("never throws on malformed input", () => {
    expect(linkBrand("not a url")).toBe("generic");
    expect(linkBrand("")).toBe("generic");
  });
});

describe("linkHostLabel", () => {
  it("strips www", () => {
    expect(linkHostLabel("https://www.example.com/a")).toBe("example.com");
  });

  it("returns an empty string rather than a locale-specific word", () => {
    // lib/ has no business knowing whether the caller renders French.
    expect(linkHostLabel("not a url")).toBe("");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx vitest run tests/lib/link-brand.test.ts
```

Expected: FAIL — unresolved import.

- [ ] **Step 3: Implement**

Create `lib/link-brand.ts`:

```ts
export type LinkBrand =
  | "google-docs"
  | "google-sheets"
  | "google-slides"
  | "google-forms"
  | "google-drive"
  | "youtube"
  | "pdf"
  | "generic";

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

// Chosen from the URL alone — no request is made, by the server or the browser.
// A server-side og:image fetch would be request forgery on a student-supplied
// URL, and would return a sign-in page for the case this exists to serve: a
// Google Doc that is not public.
export function linkBrand(url: string): LinkBrand {
  const host = hostOf(url);
  if (host === null) return "generic";

  // Safe: hostOf already proved this parses.
  const path = new URL(url).pathname.toLowerCase();

  if (host === "docs.google.com") {
    if (path.startsWith("/document")) return "google-docs";
    if (path.startsWith("/spreadsheets")) return "google-sheets";
    if (path.startsWith("/presentation")) return "google-slides";
    if (path.startsWith("/forms")) return "google-forms";
    return "google-drive";
  }

  if (host === "drive.google.com") return "google-drive";
  if (host === "sheets.google.com") return "google-sheets";
  if (host === "slides.google.com") return "google-slides";
  if (host === "forms.gle" || host === "forms.google.com") return "google-forms";
  if (host === "youtube.com" || host === "youtu.be" || host === "m.youtube.com") {
    return "youtube";
  }

  // pathname, not the whole URL: "?file=x.pdf" is a query on an HTML page.
  if (path.endsWith(".pdf")) return "pdf";

  return "generic";
}

export function linkHostLabel(url: string): string {
  return hostOf(url) ?? "";
}
```

- [ ] **Step 4: Run it and watch it pass**

```bash
npx vitest run tests/lib/link-brand.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/link-brand.ts tests/lib/link-brand.test.ts
git commit -m "feat: add linkBrand, choosing a tile icon from a URL

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 3: `readPageKind` and `filterPagesByKind`

**Files:**
- Create: `lib/page-kind.ts`, `lib/page-filters.ts`
- Test: `tests/lib/page-kind.test.ts`, `tests/lib/page-filters.test.ts`

- [ ] **Step 1: Write both failing tests**

Create `tests/lib/page-kind.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readPageKind } from "@/lib/page-kind";

describe("readPageKind", () => {
  it("reads the recognised values", () => {
    expect(readPageKind({ kind: "html", url: null })).toBe("html");
    expect(readPageKind({ kind: "link", url: "https://example.com/" })).toBe("link");
  });

  it("resolves an unrecognised kind by the url column", () => {
    // Falling back to "html" would be the wrong repair for the row most likely
    // to be broken: one with a url and no document, which would then render as
    // a page with nothing in it.
    expect(readPageKind({ kind: "", url: "https://example.com/" })).toBe("link");
    expect(readPageKind({ kind: "wat", url: "https://example.com/" })).toBe("link");
  });

  it("falls back to html when there is no url either", () => {
    expect(readPageKind({ kind: "wat", url: null })).toBe("html");
  });
});
```

Create `tests/lib/page-filters.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { filterPagesByKind } from "@/lib/page-filters";

const pages = [
  { id: "a", kind: "html" as const },
  { id: "b", kind: "link" as const },
  { id: "c", kind: "html" as const },
];

describe("filterPagesByKind", () => {
  it("returns everything for all", () => {
    expect(filterPagesByKind(pages, "all")).toHaveLength(3);
  });

  it("narrows to pages", () => {
    expect(filterPagesByKind(pages, "html").map((p) => p.id)).toEqual(["a", "c"]);
  });

  it("narrows to links", () => {
    expect(filterPagesByKind(pages, "link").map((p) => p.id)).toEqual(["b"]);
  });

  it("preserves order", () => {
    expect(filterPagesByKind(pages, "all").map((p) => p.id)).toEqual(["a", "b", "c"]);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

```bash
npx vitest run tests/lib/page-kind.test.ts tests/lib/page-filters.test.ts
```

Expected: FAIL — unresolved imports.

- [ ] **Step 3: Implement both**

Create `lib/page-kind.ts`:

```ts
export type PageKind = "html" | "link";

// Prisma has no enum support on SQLite, so `kind` is a String and the database
// type is wider than this one. Same defensive contract as readSections and
// readOps: a row a later migration or a hand-edited database produced must not
// crash a shelf.
//
// It reads `url` and not `html` on purpose — the shelf queries never select
// `html`, because that column holds a whole document and selecting it to render
// a grid of thumbnails would pull every page's markup to draw a list of titles.
export function readPageKind(row: { kind: string; url: string | null }): PageKind {
  if (row.kind === "link") return "link";
  if (row.kind === "html") return "html";
  return row.url !== null ? "link" : "html";
}
```

Create `lib/page-filters.ts`:

```ts
import type { PageKind } from "@/lib/page-kind";

export type KindFilter = "all" | PageKind;

// Takes an already-resolved `kind` rather than the raw row: the query layer
// runs readPageKind once, so a component never sees the widened column.
export function filterPagesByKind<T extends { kind: PageKind }>(
  pages: T[],
  filter: KindFilter,
): T[] {
  if (filter === "all") return pages;
  return pages.filter((page) => page.kind === filter);
}
```

- [ ] **Step 4: Run them and watch them pass**

```bash
npx vitest run tests/lib/page-kind.test.ts tests/lib/page-filters.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/page-kind.ts lib/page-filters.ts tests/lib/page-kind.test.ts tests/lib/page-filters.test.ts
git commit -m "feat: add readPageKind and filterPagesByKind

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 4: `applyPins`

This is the piece that keeps `sectionPages` completely unchanged: it still reads
`pinnedAt` off each row, and resolving *whose* pin that is happens here.

**Files:**
- Create: `lib/page-pins.ts`
- Test: `tests/lib/page-pins.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/page-pins.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { applyPins } from "@/lib/page-pins";

const pinnedAt = new Date("2026-07-30T00:00:00Z");

describe("applyPins", () => {
  it("attaches a pin to its page", () => {
    const result = applyPins([{ id: "a" }], [{ pageId: "a", pinnedAt }]);
    expect(result[0].pinnedAt).toEqual(pinnedAt);
  });

  it("gives an unpinned page null, not undefined", () => {
    // sectionPages branches on truthiness, but the type is Date | null and a
    // stray undefined would widen it everywhere downstream.
    const result = applyPins([{ id: "a" }], []);
    expect(result[0].pinnedAt).toBeNull();
  });

  it("ignores a pin for a page not on this shelf", () => {
    // A pin can outlive a page's assignment; it is not a dangling reference.
    const result = applyPins([{ id: "a" }], [{ pageId: "zz", pinnedAt }]);
    expect(result).toHaveLength(1);
    expect(result[0].pinnedAt).toBeNull();
  });

  it("preserves order and the rest of each row", () => {
    const result = applyPins(
      [{ id: "a", title: "A" }, { id: "b", title: "B" }],
      [{ pageId: "b", pinnedAt }],
    );
    expect(result.map((p) => p.id)).toEqual(["a", "b"]);
    expect(result[1].title).toBe("B");
  });

  it("does not mutate its input", () => {
    const pages = [{ id: "a" }];
    applyPins(pages, [{ pageId: "a", pinnedAt }]);
    expect(pages[0]).not.toHaveProperty("pinnedAt");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx vitest run tests/lib/page-pins.test.ts
```

Expected: FAIL — unresolved import.

- [ ] **Step 3: Implement**

Create `lib/page-pins.ts`:

```ts
export type ShelfPin = { pageId: string; pinnedAt: Date };

// Folds one shelf's pins onto its pages. Pins are per-(page, group), so the
// same page carries a different pinnedAt on two students' shelves — and
// sectionPages, which only ever reads `pinnedAt`, needs no knowledge of that.
export function applyPins<T extends { id: string }>(
  pages: T[],
  pins: ShelfPin[],
): (T & { pinnedAt: Date | null })[] {
  const byPage = new Map(pins.map((pin) => [pin.pageId, pin.pinnedAt]));
  return pages.map((page) => ({
    ...page,
    pinnedAt: byPage.get(page.id) ?? null,
  }));
}
```

- [ ] **Step 4: Run it and watch it pass**

```bash
npx vitest run tests/lib/page-pins.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/page-pins.ts tests/lib/page-pins.test.ts
git commit -m "feat: add applyPins for per-shelf pinning

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 5: `shelfRole` and `canStudentDelete`

**Files:**
- Create: `lib/shelf-access.ts`
- Test: `tests/lib/shelf-access.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/shelf-access.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { canStudentDelete, shelfRole } from "@/lib/shelf-access";

const base = {
  isTeacher: false,
  isEveryone: false,
  chatToken: "tok",
  presented: null as string | null,
};

describe("shelfRole", () => {
  it("lets the teacher write to any shelf, the everyone shelf included", () => {
    // The whole reason this is not chatRole, which refuses the everyone group
    // before it checks the teacher. Right for a conversation, wrong for
    // curation: the shared shelf is Jenn's to fill.
    expect(shelfRole({ ...base, isTeacher: true, isEveryone: true, chatToken: null }))
      .toBe("teacher");
  });

  it("accepts a student presenting the matching token", () => {
    expect(shelfRole({ ...base, presented: "tok" })).toBe("student");
  });

  it("refuses a student on the everyone shelf", () => {
    // That shelf is public with no token, so a control there would be an
    // unauthenticated write endpoint open to the internet.
    expect(shelfRole({ ...base, isEveryone: true, presented: "tok" })).toBeNull();
  });

  it("refuses a wrong token", () => {
    expect(shelfRole({ ...base, presented: "nope" })).toBeNull();
  });

  it("refuses when the group has no token and none is presented", () => {
    expect(shelfRole({ ...base, chatToken: null, presented: null })).toBeNull();
  });

  it("cannot be entered by presenting a nullish string", () => {
    expect(shelfRole({ ...base, chatToken: null, presented: "null" })).toBeNull();
  });
});

describe("canStudentDelete", () => {
  const link = { kind: "link" as const, addedByStudent: true, groupIds: ["g1"] };

  it("allows a student to retract their own link", () => {
    expect(canStudentDelete(link, "g1")).toBe(true);
  });

  it("refuses a page the teacher uploaded", () => {
    expect(canStudentDelete({ ...link, addedByStudent: false }, "g1")).toBe(false);
  });

  it("refuses an html page", () => {
    expect(canStudentDelete({ ...link, kind: "html" }, "g1")).toBe(false);
  });

  it("refuses a row shared with anyone else", () => {
    // A Page row is shared. Deleting one assigned to several groups would take
    // it off every shelf it is on.
    expect(canStudentDelete({ ...link, groupIds: ["g1", "g2"] }, "g1")).toBe(false);
  });

  it("refuses a row belonging to a different shelf", () => {
    expect(canStudentDelete(link, "g2")).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx vitest run tests/lib/shelf-access.test.ts
```

Expected: FAIL — unresolved import.

- [ ] **Step 3: Implement**

Create `lib/shelf-access.ts`:

```ts
import type { PageKind } from "@/lib/page-kind";

export type ShelfRole = "teacher" | "student" | null;

// A sibling of chatRole, deliberately ordered differently. chatRole refuses the
// everyone group BEFORE it checks the teacher, so that not even Jenn can open a
// conversation there by accident. That is right for a conversation and wrong
// for curation — the shared shelf is hers to fill and to pin, and reusing
// chatRole here would lock her out of a workflow she already has for pages.
export function shelfRole(input: {
  isTeacher: boolean;
  isEveryone: boolean;
  chatToken: string | null;
  presented: string | null;
}): ShelfRole {
  if (input.isTeacher) return "teacher";

  // A student can never write to the everyone shelf. Its chatToken is null so
  // no token could match anyway; the flag is checked as well so the guarantee
  // does not rest on a data invariant a later migration could quietly break.
  if (input.isEveryone) return null;

  // Both halves must be present, for the reason chatRole gives: a group with no
  // token must not be enterable by presenting the string "null".
  if (input.chatToken && input.presented === input.chatToken) return "student";

  return null;
}

// Which rows a student may remove from their own shelf. All three conditions
// matter: the third is what makes the first two safe, because a Page row is
// shared and deleting one assigned to several groups removes it from all of
// them at once.
export function canStudentDelete(
  page: { kind: PageKind; addedByStudent: boolean; groupIds: string[] },
  groupId: string,
): boolean {
  if (page.kind !== "link") return false;
  if (!page.addedByStudent) return false;
  return page.groupIds.length === 1 && page.groupIds[0] === groupId;
}
```

- [ ] **Step 4: Run it and watch it pass**

```bash
npx vitest run tests/lib/shelf-access.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/shelf-access.ts tests/lib/shelf-access.test.ts
git commit -m "feat: add shelfRole and canStudentDelete

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 6: `defaultGroupId` — the active chip becomes the default audience

**Files:**
- Create: `lib/default-audience.ts`
- Test: `tests/lib/default-audience.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/default-audience.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { defaultGroupId } from "@/lib/default-audience";

const groups = [
  { id: "g1", name: "Marie" },
  { id: "g2", name: "Everyone" },
];

describe("defaultGroupId", () => {
  it("maps the active chip to its group id", () => {
    expect(defaultGroupId("Marie", groups)).toBe("g1");
  });

  it("returns null when no chip is active", () => {
    expect(defaultGroupId(null, groups)).toBeNull();
  });

  it("returns null for a name no group has", () => {
    // Exact match, like filterPagesByGroup: the name came from a chip built out
    // of the data, so a near-miss means the chip list is wrong, not the input.
    expect(defaultGroupId("marie", groups)).toBeNull();
    expect(defaultGroupId("Gone", groups)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx vitest run tests/lib/default-audience.test.ts
```

Expected: FAIL — unresolved import.

- [ ] **Step 3: Implement**

Create `lib/default-audience.ts`:

```ts
// The Pages tab's active student chip, as a group id the editor can pre-tick.
// Returns one id rather than a list because the chip row is single-select.
export function defaultGroupId(
  activeChip: string | null,
  groups: { id: string; name: string }[],
): string | null {
  if (activeChip === null) return null;
  return groups.find((group) => group.name === activeChip)?.id ?? null;
}
```

- [ ] **Step 4: Run it and watch it pass**

```bash
npx vitest run tests/lib/default-audience.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/default-audience.ts tests/lib/default-audience.test.ts
git commit -m "feat: add defaultGroupId for the admin's active filter

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 7: Widen `SearchablePage` so a student row satisfies it

The student shelf gains the search field, and its rows have no group names.

**Files:**
- Modify: `lib/admin-search.ts:12`, `lib/admin-search.ts:26-29`, `lib/admin-search.ts:33-37`
- Test: `tests/lib/admin-search.test.ts`

- [ ] **Step 1: Add the failing test**

Append to `tests/lib/admin-search.test.ts`:

```ts
describe("filterPages without group names", () => {
  it("matches on title alone when groupNames is absent", () => {
    // The student shelf reuses this and has no group names to search.
    const pages = [{ title: "Les verbes" }, { title: "Le passé composé" }];
    expect(filterPages(pages, "verbes")).toHaveLength(1);
  });

  it("still ignores accents without group names", () => {
    expect(filterPages([{ title: "Le passé composé" }], "passe")).toHaveLength(1);
  });
});
```

Make sure `filterPages` and `describe`/`it`/`expect` are already imported at the
top of that file; add `filterPages` to the existing import if it is not there.

- [ ] **Step 2: Run it and watch it fail**

```bash
npx vitest run tests/lib/admin-search.test.ts
```

Expected: FAIL — a TypeScript error that `groupNames` is missing, or a runtime
`TypeError` spreading `undefined`.

- [ ] **Step 3: Make `groupNames` optional**

In `lib/admin-search.ts`, change line 12 from

```ts
export type SearchablePage = { title: string; groupNames: string[] };
```

to

```ts
// groupNames is optional because the student's shelf reuses this and has none —
// a student never sees who else a page was shared with.
export type SearchablePage = { title: string; groupNames?: string[] };
```

and in `filterPages`, change the `matches` call to tolerate the absence:

```ts
  return pages.filter((page) =>
    matches(query, [page.title, ...(page.groupNames ?? [])]),
  );
```

and in `pageGroupNames`:

```ts
  return [...new Set(pages.flatMap((page) => page.groupNames ?? []))].sort((a, b) =>
    a.localeCompare(b, "fr-CA"),
  );
```

`filterPagesByGroup` already reads `page.groupNames.includes(...)`; change it to

```ts
      (page.groupNames ?? []).includes(groupName) ||
```

- [ ] **Step 4: Run the whole search suite and typecheck**

```bash
npx vitest run tests/lib/admin-search.test.ts && npm run typecheck
```

Expected: PASS and exit 0. Every pre-existing test in that file must still pass.

- [ ] **Step 5: Commit**

```bash
git add lib/admin-search.ts tests/lib/admin-search.test.ts
git commit -m "refactor: make SearchablePage.groupNames optional

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 8: Schema and the hand-edited migration

> **STOP AND READ.** Prisma generates schema-only migrations. It will not write
> the pin backfill, and its SQLite strategy for dropping a column is a table
> rebuild that discards the column's contents with no error and no warning.
> Applying the generated SQL unedited erases every pin on a live database.

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_links_and_shelf_pins/migration.sql`

- [ ] **Step 1: Edit the schema**

In `prisma/schema.prisma`, replace the `Page` model with:

```prisma
model Page {
  id        String      @id @default(cuid())
  slug      String      @unique
  title     String
  // "html" | "link". A String and not an enum because Prisma has no enum
  // support on SQLite; lib/page-kind.ts narrows it.
  kind      String      @default("html")
  // Exactly one of these is set. html holds a whole document, so no shelf query
  // selects it.
  html      String?
  url       String?
  // True when a student added it rather than Jenn. A boolean rather than an
  // author id for the reason Message.fromTeacher is one: there are exactly two
  // participants and one of them has no row to point at.
  addedByStudent Boolean @default(false)
  createdAt DateTime    @default(now())
  updatedAt DateTime    @updatedAt
  groups    PageGroup[]
  pins      PagePin[]
}
```

Note `pinnedAt` is gone. Add the new model below `PageGroup`:

```prisma
// A pin belongs to one shelf, not to the page. The same page can sit at the top
// of Marie's shelf and in date order on Luc's.
//
// Deliberately NOT a mirror of PageGroup: a student may pin a page that reaches
// them through the everyone group, so a pin can exist for a (page, group) pair
// with no PageGroup row. That is intended, not a dangling reference — the shelf
// is assembled by listPagesForGroup, not by PageGroup alone.
model PagePin {
  pageId   String
  groupId  String
  pinnedAt DateTime @default(now())
  page     Page     @relation(fields: [pageId], references: [id], onDelete: Cascade)
  group    Group    @relation(fields: [groupId], references: [id], onDelete: Cascade)

  @@id([pageId, groupId])
}
```

And add the back-relation to `Group`, beside `pages`:

```prisma
  pins      PagePin[]
```

- [ ] **Step 2: Generate the migration WITHOUT applying it**

```bash
npx prisma migrate dev --name add_links_and_shelf_pins --create-only
```

Expected: writes `prisma/migrations/<timestamp>_add_links_and_shelf_pins/migration.sql`
and does **not** touch the database. Confirm the file exists and read it in full.

- [ ] **Step 3: Insert the backfill by hand**

The generated file will contain a `CREATE TABLE "PagePin"` block and a
`RedefineTables` block that rebuilds `Page` without `pinnedAt`. Insert this
between them — **after** `PagePin` exists, **before** `pinnedAt` is destroyed:

```sql
-- Backfill: an existing pin was global, so it becomes one pin per shelf the
-- page is actually on. Prisma does not generate this; without it the rebuild
-- below silently discards every pin. A page pinned but assigned to no group
-- loses its pin, which is correct — it was on no shelf.
INSERT INTO "PagePin" ("pageId", "groupId", "pinnedAt")
SELECT p."id", pg."groupId", p."pinnedAt"
FROM "Page" p
JOIN "PageGroup" pg ON pg."pageId" = p."id"
WHERE p."pinnedAt" IS NOT NULL;
```

Also confirm the generated `INSERT INTO "new_Page" (...) SELECT ... FROM "Page"`
carries `id`, `slug`, `title`, `html`, `createdAt` and `updatedAt`. It will not
mention `kind`, `url` or `addedByStudent` — those take their schema defaults,
which is right: every existing row is an html page nobody's student added.

- [ ] **Step 4: Apply it and check the backfill actually ran**

```bash
npx prisma migrate dev
npx prisma generate
```

Then prove the data survived:

```bash
npx prisma studio
```

or, without a browser:

```bash
node -e "const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.pagePin.count().then(n=>{console.log('PagePin rows:',n);return p.\$disconnect()})"
```

Expected: the count matches the number of `(pinned page, group)` pairs that
existed before. On a fresh dev database with no pinned pages, `0` is the correct
answer and proves nothing — say so in your report rather than implying it passed.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: add page kind, url and per-shelf pins

Migration is hand-edited: Prisma will not generate the pin backfill, and its
SQLite column drop is a table rebuild that would discard every pin silently.

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 9: `savePage` takes a discriminated union

**Files:**
- Modify: `lib/pages.ts:5-51`

- [ ] **Step 1: Replace the input type and the upsert**

In `lib/pages.ts`, add to the imports:

```ts
import { readPageKind, type PageKind } from "@/lib/page-kind";
import { applyPins } from "@/lib/page-pins";
```

Replace `SavePageInput` and `savePage` (lines 5-43) with:

```ts
type SaveCommon = {
  // null means "derive one from the title"; a value means "create or replace
  // the page at exactly this slug", which is how a corrected page is
  // republished to a link students already have.
  slug: string | null;
  title: string;
  // null leaves existing group assignments untouched.
  groupIds: string[] | null;
};

export type SavePageInput = SaveCommon &
  (
    | { kind: "html"; html: string }
    | { kind: "link"; url: string; addedByStudent?: boolean }
  );

export async function savePage(input: SavePageInput): Promise<string> {
  const slug = input.slug ?? (await deriveSlug(input.title));

  // Both columns are written every time, one of them to null. Setting only the
  // populated one would leave stale html behind if an html page were ever
  // replaced by a link at the same slug, and readPageKind would then have two
  // populated columns to choose between.
  const columns =
    input.kind === "html"
      ? { kind: "html", html: input.html, url: null }
      : { kind: "link", html: null, url: input.url };

  // One interactive transaction, not an upsert followed by a separate group
  // write: a failing group assignment used to leave the page row committed
  // with no groups, which is invisible in every list and cannot be repaired
  // by retrying, because the retry derives a fresh slug.
  await prisma.$transaction(async (tx) => {
    const page = await tx.page.upsert({
      where: { slug },
      create: {
        slug,
        title: input.title,
        ...columns,
        addedByStudent: input.kind === "link" && input.addedByStudent === true,
      },
      // addedByStudent is deliberately absent here: who added a row is a fact
      // about its creation, and an edit must not rewrite it.
      update: { title: input.title, ...columns },
      select: { id: true },
    });

    if (!input.groupIds) return;

    // Replace the whole set rather than diffing it: the caller always sends
    // the complete list, and a duplicate id would otherwise collide with the
    // composite primary key.
    await tx.pageGroup.deleteMany({ where: { pageId: page.id } });
    for (const groupId of new Set(input.groupIds)) {
      await tx.pageGroup.create({ data: { pageId: page.id, groupId } });
    }
  });

  return slug;
}
```

- [ ] **Step 2: Verify types**

```bash
npm run typecheck
```

Expected: FAIL, with errors at the `savePage` call sites in
`app/page-actions.ts` and `app/api/pages/route.ts` — they do not yet pass
`kind`. That is the point of this step: the union makes every caller declare
itself. Leave them broken; Tasks 11 and 12 fix them.

- [ ] **Step 3: Commit**

```bash
git add lib/pages.ts
git commit -m "refactor: make savePage a discriminated union on kind

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 10: Both list queries return `kind` and per-shelf pins

**Files:**
- Modify: `lib/pages.ts:53-130`

- [ ] **Step 1: Rewrite the three read functions**

Replace `getPageBySlug`, `listPagesForGroup`, `listPagesForAdmin` and
`getPageForAdmin` with:

```ts
// `html` is deliberately absent. It holds a whole document, and selecting it to
// render a grid of thumbnails would ship every page's markup to draw a list of
// titles.
const SHELF_SELECT = {
  id: true,
  slug: true,
  title: true,
  createdAt: true,
  kind: true,
  url: true,
  addedByStudent: true,
} as const;

export function getPageBySlug(slug: string) {
  return prisma.page.findUnique({
    where: { slug },
    select: { id: true, slug: true, title: true, html: true, kind: true, url: true },
  });
}

export async function listPagesForGroup(groupId: string) {
  // Three queries rather than one: the everyone group's pages are the same set
  // for every student, and keeping them separate is what lets effectivePages
  // own the merge rule and be tested without a database. The pins are this
  // shelf's only — a pin on another student's shelf is none of this one's
  // business.
  const [own, everyone, pins] = await Promise.all([
    prisma.page.findMany({
      where: { groups: { some: { groupId } } },
      orderBy: { createdAt: "desc" },
      select: SHELF_SELECT,
    }),
    prisma.page.findMany({
      where: { groups: { some: { group: { isEveryone: true } } } },
      orderBy: { createdAt: "desc" },
      select: SHELF_SELECT,
    }),
    prisma.pagePin.findMany({
      where: { groupId },
      select: { pageId: true, pinnedAt: true },
    }),
  ]);

  const merged = effectivePages(own, everyone).map((page) => ({
    ...page,
    kind: readPageKind(page),
  }));

  return applyPins(merged, pins);
}

export async function listPagesForAdmin() {
  const pages = await prisma.page.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      ...SHELF_SELECT,
      groups: {
        select: {
          group: { select: { id: true, name: true, isEveryone: true } },
        },
      },
      // Every shelf's pins, not one shelf's: the admin shows all pages, and
      // which pin applies depends on the student chip the client has active.
      pins: { select: { groupId: true, pinnedAt: true } },
    },
  });

  return pages.map((page) => ({
    id: page.id,
    slug: page.slug,
    title: page.title,
    createdAt: page.createdAt,
    kind: readPageKind(page),
    url: page.url,
    addedByStudent: page.addedByStudent,
    groupIds: page.groups.map((g) => g.group.id),
    groupNames: page.groups.map((g) => g.group.name),
    // Drives both the tile's marker and the filter: a page shared with
    // everyone is on every student's shelf, so it must survive a filter for
    // any one of them.
    sharedWithEveryone: page.groups.some((g) => g.group.isEveryone),
    pins: page.pins,
  }));
}

export async function getPageForAdmin(slug: string) {
  const page = await prisma.page.findUnique({
    where: { slug },
    select: {
      slug: true,
      title: true,
      html: true,
      kind: true,
      url: true,
      groups: { select: { groupId: true } },
    },
  });
  if (!page) return null;

  return {
    slug: page.slug,
    title: page.title,
    html: page.html,
    kind: readPageKind(page),
    url: page.url,
    groupIds: page.groups.map((g) => g.groupId),
  };
}

// Re-exported so callers that only need the shelf row's shape do not import
// three modules to describe one thing.
export type ShelfPage = Awaited<ReturnType<typeof listPagesForGroup>>[number];
export type AdminPage = Awaited<ReturnType<typeof listPagesForAdmin>>[number];
export type { PageKind };
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: the same call-site errors as Task 9, plus new ones in
`app/admin/pages/[slug]/page.tsx` and the components that read `pinnedAt` off an
admin row. Note them; Tasks 11-13 and the UI plan resolve them. Nothing new
should appear inside `lib/`.

- [ ] **Step 3: Commit**

```bash
git add lib/pages.ts
git commit -m "feat: return kind and per-shelf pins from the page queries

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 11: Server actions

**Files:**
- Modify: `app/page-actions.ts`

- [ ] **Step 1: Rewrite the file**

Replace the whole of `app/page-actions.ts` with:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentTeacher } from "@/lib/session";
import { savePage, type SavePageInput } from "@/lib/pages";
import { validatePageHtml } from "@/lib/page-html";
import { parseLinkUrl } from "@/lib/link-url";
import { readPageKind } from "@/lib/page-kind";
import { canStudentDelete, shelfRole, type ShelfRole } from "@/lib/shelf-access";
import { readToken, cookieNameFor } from "@/lib/student-tokens";

async function requireTeacher() {
  const teacher = await getCurrentTeacher();
  if (!teacher) throw new Error("Unauthorized");
  return teacher;
}

// The write-side counterpart of the page's `unlocked` flag. Callers pass a
// group id because that is what the client already holds; the token is read
// from the cookie here, never from an argument, so a client cannot assert one.
async function requireShelfRole(groupId: string): Promise<ShelfRole> {
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: { slug: true, isEveryone: true, chatToken: true },
  });
  if (!group) throw new Error("Unauthorized");

  const teacher = await getCurrentTeacher();
  const cookieStore = await cookies();
  const role = shelfRole({
    isTeacher: Boolean(teacher),
    isEveryone: group.isEveryone,
    chatToken: group.chatToken,
    presented: readToken(
      undefined,
      cookieStore.get(cookieNameFor(group.slug))?.value,
    ),
  });
  if (!role) throw new Error("Unauthorized");
  return role;
}

export type PageInput = {
  title: string;
  html: string;
  groupIds: string[];
};

export type LinkInput = {
  title: string;
  url: string;
  groupIds: string[];
};

function requireTitle(value: string): string {
  const title = value.trim();
  if (!title) throw new Error("A title is required.");
  return title;
}

function validatePage(input: PageInput) {
  const title = requireTitle(input.title);
  const html = validatePageHtml(input.html);
  if (!html.ok) throw new Error(html.error);
  return { title, html: html.html };
}

function validateLink(input: { title: string; url: string }) {
  const url = parseLinkUrl(input.url);
  if (!url.ok) throw new Error(url.error);
  // A link with no title falls back to its host, so adding one is two fields
  // and not three when she is in a hurry.
  const title = input.title.trim() || new URL(url.url).hostname.replace(/^www\./, "");
  return { title, url: url.url };
}

// A page can belong to several groups, so every group's list is stale after a
// write. The route pattern with type "page" revalidates every instance of the
// dynamic route rather than one slug at a time.
function revalidatePages(slug: string) {
  revalidatePath("/admin");
  revalidatePath(`/admin/pages/${slug}`);
  revalidatePath(`/p/${slug}`);
  revalidatePath("/f/[token]", "page");
  // The files tab lives here as well, and a pin reorders it.
  revalidatePath("/g/[slug]", "page");
}

// The admin form is rendered with the group list as it was when the page
// loaded, but the teacher edits in her own time — a group can be deleted from
// another tab before she submits. savePage then hits the foreign-key
// constraint on PageGroup, and a raw Prisma message tells her nothing she can
// act on, so translate that one case into a retry instruction.
async function saveOrExplain(input: SavePageInput): Promise<string> {
  try {
    return await savePage(input);
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2003"
    ) {
      throw new Error(
        "One of those groups was just deleted — reload the page and try again.",
      );
    }
    throw err;
  }
}

export async function createPage(input: PageInput): Promise<string> {
  await requireTeacher();
  const { title, html } = validatePage(input);

  const slug = await saveOrExplain({
    slug: null,
    kind: "html",
    title,
    html,
    groupIds: input.groupIds,
  });

  revalidatePages(slug);
  return slug;
}

export async function updatePage(slug: string, input: PageInput): Promise<void> {
  await requireTeacher();
  const { title, html } = validatePage(input);

  await saveOrExplain({ slug, kind: "html", title, html, groupIds: input.groupIds });

  revalidatePages(slug);
}

// The admin's own add-a-link. Teacher-only and free to target any group,
// including everyone — that is the shared shelf and filling it is her job.
export async function createLink(input: LinkInput): Promise<string> {
  await requireTeacher();
  const { title, url } = validateLink(input);

  const slug = await saveOrExplain({
    slug: null,
    kind: "link",
    title,
    url,
    groupIds: input.groupIds,
  });

  revalidatePages(slug);
  return slug;
}

// The student page's add-a-link, for either party. groupId is bound on the
// server so the client never carries it.
export async function addShelfLink(
  groupId: string,
  input: { title: string; url: string },
): Promise<void> {
  const role = await requireShelfRole(groupId);
  const { title, url } = validateLink(input);

  const slug = await saveOrExplain({
    slug: null,
    kind: "link",
    title,
    url,
    groupIds: [groupId],
    addedByStudent: role === "student",
  });

  revalidatePages(slug);
}

// deleteMany rather than delete: delete throws P2025 when the row is already
// gone, which turns a double-click or a stale tab into an error the teacher
// cannot act on.
export async function deletePage(slug: string): Promise<void> {
  await requireTeacher();

  await prisma.page.deleteMany({ where: { slug } });

  revalidatePages(slug);
}

// From the student page. The teacher may remove anything; a student may remove
// only their own link, and only when nobody else can see it.
export async function deleteShelfLink(
  groupId: string,
  slug: string,
): Promise<void> {
  const role = await requireShelfRole(groupId);

  const page = await prisma.page.findUnique({
    where: { slug },
    select: {
      id: true,
      kind: true,
      url: true,
      addedByStudent: true,
      groups: { select: { groupId: true } },
    },
  });
  // Already gone. A no-op, for the reason deleteMany is used above.
  if (!page) return;

  if (role !== "teacher") {
    const allowed = canStudentDelete(
      {
        kind: readPageKind(page),
        addedByStudent: page.addedByStudent,
        groupIds: page.groups.map((g) => g.groupId),
      },
      groupId,
    );
    if (!allowed) throw new Error("Unauthorized");
  }

  await prisma.page.deleteMany({ where: { id: page.id } });

  revalidatePages(slug);
}

// One shelf's pin. groupId is first so the caller can bind it.
export async function setShelfPin(
  groupId: string,
  slug: string,
  pinned: boolean,
): Promise<void> {
  await requireShelfRole(groupId);

  const page = await prisma.page.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (!page) return;

  if (pinned) {
    // upsert rather than create: pinning something already pinned from a stale
    // tab should refresh the timestamp, not throw a unique-constraint error.
    await prisma.pagePin.upsert({
      where: { pageId_groupId: { pageId: page.id, groupId } },
      create: { pageId: page.id, groupId },
      update: { pinnedAt: new Date() },
    });
  } else {
    await prisma.pagePin.deleteMany({ where: { pageId: page.id, groupId } });
  }

  revalidatePages(slug);
}
```

Note `setPagePinned` is gone, replaced by `setShelfPin`. Its old caller in
`app/admin/page.tsx` is fixed in the UI plan.

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: errors remaining only in `app/api/pages/route.ts` (Task 12) and in
`app/admin/page.tsx` / `components/admin/PageList.tsx` / `components/student/FilesTab.tsx`
(the UI plan). No errors inside `app/page-actions.ts` itself.

- [ ] **Step 3: Commit**

```bash
git add app/page-actions.ts
git commit -m "feat: add link and per-shelf pin server actions

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 12: Reject link rows on the three HTML routes

`/p/` means "a page we host". A link row has no document, so these must 404
rather than redirect — an open redirect on a public route is a phishing
primitive.

**Files:**
- Modify: `app/p/[slug]/page.tsx`, `app/p/[slug]/raw/route.ts`, `app/api/pages/route.ts`

- [ ] **Step 1: Guard `/p/[slug]` and its raw route**

Both already fetch the page and handle "not found". In **each** file, find the
existing not-found branch and widen its condition. In `app/p/[slug]/page.tsx`,
after the page is fetched:

```tsx
  // A link row has no document to frame. 404 and not a redirect to page.url:
  // /p/ means a page we host, and an open redirect on a public route is a
  // phishing primitive.
  if (!page || readPageKind(page) === "link") notFound();
```

In `app/p/[slug]/raw/route.ts`, the same shape, returning whatever 404 that file
already returns:

```ts
  if (!page || readPageKind(page) === "link") {
    return new NextResponse("Not found", { status: 404 });
  }
```

Add `import { readPageKind } from "@/lib/page-kind";` to both. Read each file
first and match its existing not-found style exactly rather than inventing one.

Because `html` is now `string | null`, the render and the response body will
also need `page.html` narrowed — the guard above does that for TypeScript only
if `readPageKind` is not enough for the compiler, in which case add
`if (page.html === null) notFound();` immediately after. Let `npm run typecheck`
tell you which.

- [ ] **Step 2: Guard `POST /api/pages`**

In `app/api/pages/route.ts`, add `kind: "html"` to the `savePage` call on
line 106:

```ts
  const saved = await savePage({ slug, kind: "html", title, html, groupIds });
```

and, before it, refuse a slug that already belongs to a link — otherwise the
publish extension would silently convert a link into a page:

```ts
  if (slug) {
    const existing = await prisma.page.findUnique({
      where: { slug },
      select: { kind: true, url: true },
    });
    if (existing && readPageKind(existing) === "link") {
      return NextResponse.json(
        { error: "That slug belongs to a link." },
        { status: 400 },
      );
    }
  }
```

Add `import { readPageKind } from "@/lib/page-kind";` to that file.

- [ ] **Step 3: Typecheck and build**

```bash
npm run typecheck && npm run build
```

Expected: the only remaining errors are in `app/admin/page.tsx`,
`components/admin/PageList.tsx` and `components/student/FilesTab.tsx`, all of
which the UI plan replaces. If anything else fails, fix it here.

- [ ] **Step 4: Commit**

```bash
git add app/p app/api/pages/route.ts
git commit -m "feat: 404 link rows on the HTML-page routes

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 13: Keep the tree compiling until the UI lands

Tasks 9-12 intentionally left three UI files broken. Rather than leave the
branch red, apply the smallest changes that restore the build without building
any new interface. The UI plan replaces all of this.

**Files:**
- Modify: `app/admin/page.tsx:153`, `components/admin/PageList.tsx:25-33`, `app/admin/pages/[slug]/page.tsx:19-52`

**`components/student/FilesTab.tsx` needs no change here.** TypeScript's excess
property check applies only to object literals, and `/g/[slug]` passes a
variable — so the extra `kind`, `url` and `addedByStudent` fields on the shelf
rows are accepted against its narrower prop type. Verify with `npm run typecheck`
rather than editing it speculatively; the UI plan replaces the file anyway.

- [ ] **Step 1: Give `PageList` the fields it now receives**

In `components/admin/PageList.tsx`, add to `PageSummary`:

```ts
  kind: "html" | "link";
  url: string | null;
  addedByStudent: boolean;
  pins: { groupId: string; pinnedAt: Date }[];
```

`pinnedAt: Date | null` is already there and stays, because Task 10's admin rows
no longer carry one. Supply a temporary null where `PagesTab` maps its rows, in
`app/admin/page.tsx`:

```tsx
        pages={pages.map((page) => ({ ...page, pinnedAt: null }))}
```

- [ ] **Step 1b: Fix the page editor route, which `html: string | null` breaks**

`app/admin/pages/[slug]/page.tsx:50` passes `page.html` into `PageEditor`, whose
`initial.html` is a `string`. Change the guard on line 19 and the prop:

```tsx
  const page = await getPageForAdmin(slug);
  // A link has no document, so there is nothing here to edit. 404 rather than
  // rendering an upload form over a row that can never accept one.
  if (!page || page.kind === "link") notFound();
```

```tsx
          initial={{
            title: page.title,
            // Narrowed by the guard above: an html row always has html. The ??
            // satisfies the compiler, which cannot see that from here.
            html: page.html ?? "",
            groupIds: page.groupIds,
          }}
```

- [ ] **Step 2: Point the admin at `setShelfPin`**

In `app/admin/page.tsx`, the `onTogglePin={setPagePinned}` prop no longer type
checks. Replace it with a no-op bound action until the UI plan wires the active
chip:

```tsx
        onTogglePin={async () => {
          "use server";
          // Pinning needs a shelf, and the admin does not know which one until
          // the student chip is lifted into a client wrapper. Wired in
          // 2026-07-31-files-links-ui.md, Task 5.
        }}
```

Remove the now-unused `setPagePinned` import and add nothing in its place.

- [ ] **Step 3: Full CI sequence**

```bash
npx prisma generate && npm run lint && npm run typecheck && npm test && npm run build
```

Expected: all five exit 0. Paste the real output.

- [ ] **Step 4: Commit**

```bash
git add app/admin/page.tsx components/admin/PageList.tsx "app/admin/pages/[slug]/page.tsx"
git commit -m "chore: keep the tree green between the data and UI plans

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 14: Verify and report

- [ ] **Step 1: Run CI's exact sequence**

```bash
npx prisma generate && npm run lint && npm run typecheck && npm test && npm run build
```

All five must exit 0. Paste the actual output; do not summarise it.

- [ ] **Step 2: Confirm the new tests exist and run**

```bash
npx vitest run tests/lib/link-url.test.ts tests/lib/link-brand.test.ts \
  tests/lib/page-kind.test.ts tests/lib/page-filters.test.ts \
  tests/lib/page-pins.test.ts tests/lib/shelf-access.test.ts \
  tests/lib/default-audience.test.ts
```

Expected: 7 files, all passing.

- [ ] **Step 3: State plainly what is not verified**

Report: this plan changes no user-visible behaviour, so there is nothing to
check in a browser yet. The migration backfill was verified by row count on the
dev database only — if that database had no pinned pages, say so, because then
the backfill is untested and production is the first place it runs.

---

## Self-review notes

- **Spec coverage:** §1 data model → Tasks 8-10. §2 access → Tasks 5, 11.
  §3 links → Tasks 1, 2, 9, 11, 12. §4's `filterPagesByKind` → Task 3; the rest
  of §4 is UI. §5 pinning → Tasks 4, 8, 11. §6 default audience → Task 6.
  §7 whiteboard → separate plan. Search widening → Task 7.
- **Type consistency:** `PageKind`, `KindFilter`, `ShelfPin`, `ShelfRole`,
  `SavePageInput`, `readPageKind`, `applyPins`, `shelfRole`, `canStudentDelete`,
  `defaultGroupId`, `setShelfPin`, `addShelfLink`, `deleteShelfLink`,
  `createLink` are spelled identically at every use.
- **Deliberate red window:** Tasks 9-12 leave the build broken and Task 13
  closes it. Each is committed separately so a bisect lands somewhere
  meaningful, but do not push mid-sequence.
