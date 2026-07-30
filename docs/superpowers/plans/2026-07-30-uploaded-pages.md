# Uploaded HTML Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Jenn publishes a self-contained HTML file to francaisavecjenn.ca and gets a shareable link that students open as a live, interactive page instead of a PDF.

**Architecture:** A `Page` row holds the HTML as a string in SQLite (so the existing nightly backup covers it) and joins to any number of groups through `PageGroup`. `/p/[slug]` renders nothing but a full-viewport `<iframe sandbox="allow-scripts">` whose source is `/p/[slug]/raw`, a route handler that returns the stored HTML under a strict CSP. Publishing happens either through the admin form or through `POST /api/pages`, authenticated by a bearer token, so a sandboxed browser agent that cannot do a passkey login can still publish.

**Tech Stack:** Next.js 16 (App Router, server actions, route handlers), Prisma 6 + SQLite, React 19, Tailwind v4 via PostCSS, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-30-uploaded-pages-design.md` — read it before starting.

## Global Constraints

- **Logic belongs in `lib/`.** Every rule (slug derivation, HTML validation, payload parsing) is a pure function in `lib/` with a test in `tests/lib/`. Components and Prisma access are not unit-tested.
- **Comments explain the "why", especially the counter-intuitive.** Do not add comments that restate the code.
- **Imports use the `@/` alias** for repo-root-relative paths.
- **Every mutating server action starts with a teacher check** (`await requireTeacher()`), and calls `revalidatePath` for the pages it affects.
- **Deletes use `deleteMany`,** so a double-click or a stale tab is a no-op rather than a P2025.
- `sandbox="allow-scripts"` must **never** appear alongside `allow-same-origin` — together they let the framed page remove its own sandbox.
- `MAX_PAGE_BYTES = 2 * 1024 * 1024`, measured as UTF-8 bytes.
- Styling uses the CSS custom properties in `app/globals.css` (`--color-*` for the app, `--card-*` for student-facing surfaces). No new hex values.
- CI order is `prisma generate` → `npm run lint` → `npm run typecheck` → `npm test` → `npm run build`. Run all five before claiming a task is done.

---

### Task 1: Schema, migration, and body-size limits

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_pages/migration.sql` (generated)
- Modify: `next.config.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: Prisma models `Page` (`id`, `slug`, `title`, `html`, `createdAt`, `updatedAt`, `groups`) and `PageGroup` (`pageId`, `groupId`, composite `@@id`), plus `Group.pages`.

- [ ] **Step 1: Add the models to `prisma/schema.prisma`**

Append to the end of the file:

```prisma
model Page {
  id        String      @id @default(cuid())
  slug      String      @unique
  title     String
  html      String
  createdAt DateTime    @default(now())
  updatedAt DateTime    @updatedAt
  groups    PageGroup[]
}

// An explicit join model rather than Prisma's implicit many-to-many, so the
// table has a name we chose and can be queried directly.
model PageGroup {
  pageId  String
  groupId String
  page    Page  @relation(fields: [pageId], references: [id], onDelete: Cascade)
  group   Group @relation(fields: [groupId], references: [id], onDelete: Cascade)

  @@id([pageId, groupId])
}
```

- [ ] **Step 2: Add the back-relation to `Group`**

In the existing `Group` model, add one line after `cards Card[]`:

```prisma
  pages     PageGroup[]
```

- [ ] **Step 3: Create and apply the migration**

Run: `npx prisma migrate dev --name add_pages`
Expected: a new directory under `prisma/migrations/`, and `Your database is now in sync with your schema.`

- [ ] **Step 4: Raise the server-action body limit**

A server action's request body is capped at 1 MB by default, which would reject a page well under our own 2 MB cap. Replace the contents of `next.config.ts`:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // A published page may be up to MAX_PAGE_BYTES (2 MB) and arrives as a
    // server-action argument. The default cap is 1 MB, which would reject a
    // page the app itself considers valid.
    serverActions: { bodySizeLimit: "4mb" },
  },
};

export default nextConfig;
```

- [ ] **Step 5: Verify the config key is recognised**

Run: `npm run build`
Expected: PASS, with **no** warning about an unrecognised or invalid `next.config.ts` key. If Next 16 reports `serverActions` is no longer experimental, move it to the top level of `nextConfig` and re-run.

- [ ] **Step 6: Verify types**

Run: `npx prisma generate && npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations next.config.ts
git commit -m "feat: add Page and PageGroup models"
```

---

### Task 2: `lib/page-slug.ts`

**Files:**
- Create: `lib/page-slug.ts`
- Test: `tests/lib/page-slug.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `slugify(title: string): string`, `uniqueSlug(base: string, taken: readonly string[]): string`.

- [ ] **Step 1: Write the failing tests**

Create `tests/lib/page-slug.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { slugify, uniqueSlug } from "@/lib/page-slug";

describe("slugify", () => {
  it("lowercases and hyphenates a plain title", () => {
    expect(slugify("Verb Drills")).toBe("verb-drills");
  });

  it("strips accents rather than dropping the letters", () => {
    expect(slugify("Passé Composé")).toBe("passe-compose");
  });

  it("collapses punctuation and runs of spaces into single hyphens", () => {
    expect(slugify("Numbers 1–10:  a  quiz!")).toBe("numbers-1-10-a-quiz");
  });

  it("trims leading and trailing hyphens", () => {
    expect(slugify("  ...être...  ")).toBe("etre");
  });

  it("falls back to 'page' when nothing usable survives", () => {
    expect(slugify("")).toBe("page");
    expect(slugify("   ")).toBe("page");
    expect(slugify("!!!")).toBe("page");
    expect(slugify("日本語")).toBe("page");
  });

  it("caps the length and never ends on a hyphen", () => {
    const slug = slugify("a ".repeat(80));
    expect(slug.length).toBeLessThanOrEqual(60);
    expect(slug.endsWith("-")).toBe(false);
  });
});

describe("uniqueSlug", () => {
  it("returns the base when it is free", () => {
    expect(uniqueSlug("verb-drills", [])).toBe("verb-drills");
    expect(uniqueSlug("verb-drills", ["other"])).toBe("verb-drills");
  });

  it("appends a numeric suffix when the base is taken", () => {
    expect(uniqueSlug("verb-drills", ["verb-drills"])).toBe("verb-drills-2");
  });

  it("keeps counting past a taken suffix", () => {
    expect(
      uniqueSlug("verb-drills", ["verb-drills", "verb-drills-2", "verb-drills-3"]),
    ).toBe("verb-drills-4");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/lib/page-slug.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/page-slug"`.

- [ ] **Step 3: Write the implementation**

Create `lib/page-slug.ts`:

```ts
const MAX_SLUG_LENGTH = 60;

// A page's slug is derived from its title once, when the page is created.
// Renaming a page deliberately does not move it: students bookmark these
// links, and fixing a typo in a title must not break a link already handed out.
export function slugify(title: string): string {
  const slug = title
    .normalize("NFD")
    // Decomposed accents are their own code points after NFD, so dropping the
    // combining-marks block turns "é" into "e" instead of losing the letter.
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/^-+|-+$/g, "");

  return slug || "page";
}

export function uniqueSlug(base: string, taken: readonly string[]): string {
  const used = new Set(taken);
  if (!used.has(base)) return base;

  for (let n = 2; ; n += 1) {
    const candidate = `${base}-${n}`;
    if (!used.has(candidate)) return candidate;
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/lib/page-slug.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/page-slug.ts tests/lib/page-slug.test.ts
git commit -m "feat: derive page slugs from titles"
```

---

### Task 3: `lib/page-html.ts`

**Files:**
- Create: `lib/page-html.ts`
- Test: `tests/lib/page-html.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `MAX_PAGE_BYTES: number`, `byteLength(value: string): number`, `validatePageHtml(input: unknown): PageHtmlResult` where `PageHtmlResult = { ok: true; html: string } | { ok: false; error: string }`.

- [ ] **Step 1: Write the failing tests**

Create `tests/lib/page-html.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { validatePageHtml, byteLength, MAX_PAGE_BYTES } from "@/lib/page-html";

describe("byteLength", () => {
  it("counts UTF-8 bytes, not characters", () => {
    expect(byteLength("abc")).toBe(3);
    expect(byteLength("é")).toBe(2);
  });
});

describe("validatePageHtml", () => {
  it("accepts a document and trims it", () => {
    const result = validatePageHtml("  <!doctype html><p>Bonjour</p>  ");
    expect(result).toEqual({ ok: true, html: "<!doctype html><p>Bonjour</p>" });
  });

  it("rejects a value that is not a string", () => {
    expect(validatePageHtml(undefined).ok).toBe(false);
    expect(validatePageHtml(42).ok).toBe(false);
  });

  it("rejects empty and whitespace-only input", () => {
    expect(validatePageHtml("").ok).toBe(false);
    expect(validatePageHtml("   \n  ").ok).toBe(false);
  });

  it("rejects text with no tag in it", () => {
    const result = validatePageHtml("https://example.com/worksheet.html");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/HTML/i);
  });

  it("rejects a document over the byte cap", () => {
    const result = validatePageHtml(`<p>${"a".repeat(MAX_PAGE_BYTES)}</p>`);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/2 MB/);
  });

  it("measures the cap in bytes, so multi-byte text can exceed it early", () => {
    // Half the cap in characters, every one of them two bytes: under the cap
    // by String.length and over it on disk.
    const body = "é".repeat(MAX_PAGE_BYTES / 2);
    expect(body.length).toBeLessThan(MAX_PAGE_BYTES);
    expect(validatePageHtml(`<p>${body}</p>`).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/lib/page-html.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/page-html"`.

- [ ] **Step 3: Write the implementation**

Create `lib/page-html.ts`:

```ts
export const MAX_PAGE_BYTES = 2 * 1024 * 1024;

export type PageHtmlResult =
  | { ok: true; html: string }
  | { ok: false; error: string };

// Bytes, not characters. A page of accented French or inlined data-URI images
// takes more room on disk than String.length suggests, and the cap exists to
// protect the database, which stores bytes.
export function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

export function validatePageHtml(input: unknown): PageHtmlResult {
  if (typeof input !== "string") {
    return { ok: false, error: "The page HTML is missing." };
  }

  const html = input.trim();
  if (!html) return { ok: false, error: "The page HTML is missing." };

  if (byteLength(html) > MAX_PAGE_BYTES) {
    return { ok: false, error: "That page is larger than 2 MB." };
  }

  // Catches the obvious slip of pasting a URL or a filename instead of the
  // document. It is not an attempt to parse HTML — nothing here validates
  // the markup, because the page is rendered as-is by design.
  if (!html.includes("<")) {
    return { ok: false, error: "That doesn't look like an HTML page." };
  }

  return { ok: true, html };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/lib/page-html.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/page-html.ts tests/lib/page-html.test.ts
git commit -m "feat: validate uploaded page HTML"
```

---

### Task 4: `lib/page-payload.ts`

**Files:**
- Create: `lib/page-payload.ts`
- Test: `tests/lib/page-payload.test.ts`

**Interfaces:**
- Consumes: `validatePageHtml` from `@/lib/page-html`, `slugify` from `@/lib/page-slug`.
- Produces: `parsePagePayload(body: unknown): PagePayloadResult`, where
  `PagePayload = { title: string; html: string; groups: string[] | null; slug: string | null }`
  and `PagePayloadResult = { ok: true; payload: PagePayload } | { ok: false; error: string }`.

`groups: null` means "the caller said nothing about groups" — on a replace that leaves the existing assignments alone. `groups: []` means "assign this page to no group".

- [ ] **Step 1: Write the failing tests**

Create `tests/lib/page-payload.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parsePagePayload } from "@/lib/page-payload";

const valid = {
  title: "Verb drills",
  html: "<!doctype html><p>Bonjour</p>",
};

describe("parsePagePayload", () => {
  it("accepts the minimum payload", () => {
    const result = parsePagePayload(valid);
    expect(result).toEqual({
      ok: true,
      payload: {
        title: "Verb drills",
        html: "<!doctype html><p>Bonjour</p>",
        groups: null,
        slug: null,
      },
    });
  });

  it("accepts groups and a slug", () => {
    const result = parsePagePayload({
      ...valid,
      groups: ["a1", "tuesday-adults"],
      slug: "verb-drills",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.groups).toEqual(["a1", "tuesday-adults"]);
      expect(result.payload.slug).toBe("verb-drills");
    }
  });

  it("keeps an empty groups array distinct from an absent one", () => {
    const absent = parsePagePayload(valid);
    const empty = parsePagePayload({ ...valid, groups: [] });
    expect(absent.ok && absent.payload.groups).toBe(null);
    expect(empty.ok && empty.payload.groups).toEqual([]);
  });

  it("normalises a supplied slug", () => {
    const result = parsePagePayload({ ...valid, slug: "Passé Composé!" });
    expect(result.ok && result.payload.slug).toBe("passe-compose");
  });

  it("trims the title", () => {
    const result = parsePagePayload({ ...valid, title: "  Verb drills  " });
    expect(result.ok && result.payload.title).toBe("Verb drills");
  });

  it("rejects a body that is not an object", () => {
    expect(parsePagePayload(null).ok).toBe(false);
    expect(parsePagePayload("title=x").ok).toBe(false);
    expect(parsePagePayload([valid]).ok).toBe(false);
  });

  it("rejects a missing or empty title", () => {
    expect(parsePagePayload({ html: valid.html }).ok).toBe(false);
    expect(parsePagePayload({ ...valid, title: "   " }).ok).toBe(false);
    expect(parsePagePayload({ ...valid, title: 7 }).ok).toBe(false);
  });

  it("rejects html that fails validation, passing the message through", () => {
    const result = parsePagePayload({ ...valid, html: "not a page" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/HTML/i);
  });

  it("rejects groups that are not an array of non-empty strings", () => {
    expect(parsePagePayload({ ...valid, groups: "a1" }).ok).toBe(false);
    expect(parsePagePayload({ ...valid, groups: [1] }).ok).toBe(false);
    expect(parsePagePayload({ ...valid, groups: [""] }).ok).toBe(false);
  });

  it("rejects a slug that is not a string", () => {
    expect(parsePagePayload({ ...valid, slug: 12 }).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/lib/page-payload.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/page-payload"`.

- [ ] **Step 3: Write the implementation**

Create `lib/page-payload.ts`:

```ts
import { validatePageHtml } from "@/lib/page-html";
import { slugify } from "@/lib/page-slug";

export type PagePayload = {
  title: string;
  html: string;
  // null means the caller said nothing about groups, which on a replace leaves
  // the existing assignments alone. An empty array means "no groups".
  groups: string[] | null;
  slug: string | null;
};

export type PagePayloadResult =
  | { ok: true; payload: PagePayload }
  | { ok: false; error: string };

export function parsePagePayload(body: unknown): PagePayloadResult {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "Expected a JSON object." };
  }

  const raw = body as Record<string, unknown>;

  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  if (!title) return { ok: false, error: "A title is required." };

  const html = validatePageHtml(raw.html);
  if (!html.ok) return { ok: false, error: html.error };

  let groups: string[] | null = null;
  if (raw.groups !== undefined) {
    if (
      !Array.isArray(raw.groups) ||
      raw.groups.some((g) => typeof g !== "string" || g.trim() === "")
    ) {
      return { ok: false, error: "groups must be an array of group slugs." };
    }
    groups = (raw.groups as string[]).map((g) => g.trim());
  }

  let slug: string | null = null;
  if (raw.slug !== undefined) {
    if (typeof raw.slug !== "string") {
      return { ok: false, error: "slug must be a string." };
    }
    slug = slugify(raw.slug);
  }

  return { ok: true, payload: { title, html: html.html, groups, slug } };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/lib/page-payload.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/page-payload.ts tests/lib/page-payload.test.ts
git commit -m "feat: parse the page publish payload"
```

---

### Task 5: `lib/pages.ts` and `app/page-actions.ts`

**Files:**
- Create: `lib/pages.ts`
- Create: `app/page-actions.ts`

**Interfaces:**
- Consumes: `slugify`, `uniqueSlug`, `validatePageHtml`, `prisma`, `getCurrentTeacher`.
- Produces:
  - `savePage(input: { slug: string | null; title: string; html: string; groupIds: string[] | null }): Promise<string>` (returns the final slug)
  - `getPageBySlug(slug: string)` → `{ id, slug, title, html } | null`
  - `listPagesForGroup(groupId: string)` → `{ slug, title, createdAt }[]`, newest first
  - `listPagesForAdmin()` → `{ id, slug, title, groupIds: string[], groupNames: string[] }[]`, newest first
  - `getPageForAdmin(slug: string)` → `{ slug, title, html, groupIds: string[] } | null`
  - server actions `createPage(input: PageInput): Promise<string>`, `updatePage(slug: string, input: PageInput): Promise<void>`, `deletePage(slug: string): Promise<void>`, where `PageInput = { title: string; html: string; groupIds: string[] }`

No unit tests: this is Prisma access, which the codebase does not unit-test. The rules it applies were tested in Tasks 2–4.

- [ ] **Step 1: Write `lib/pages.ts`**

```ts
import { prisma } from "@/lib/prisma";
import { slugify, uniqueSlug } from "@/lib/page-slug";

export type SavePageInput = {
  // null means "derive one from the title"; a value means "create or replace
  // the page at exactly this slug", which is how a corrected page is
  // republished to a link students already have.
  slug: string | null;
  title: string;
  html: string;
  // null leaves existing group assignments untouched.
  groupIds: string[] | null;
};

export async function savePage(input: SavePageInput): Promise<string> {
  const slug = input.slug ?? (await deriveSlug(input.title));

  const page = await prisma.page.upsert({
    where: { slug },
    create: { slug, title: input.title, html: input.html },
    update: { title: input.title, html: input.html },
    select: { id: true },
  });

  if (input.groupIds) {
    // Replace the whole set rather than diffing it: the caller always sends
    // the complete list, and one transaction is easier to reason about than
    // an add/remove pair that could half-apply.
    await prisma.$transaction([
      prisma.pageGroup.deleteMany({ where: { pageId: page.id } }),
      ...input.groupIds.map((groupId) =>
        prisma.pageGroup.create({ data: { pageId: page.id, groupId } }),
      ),
    ]);
  }

  return slug;
}

async function deriveSlug(title: string): Promise<string> {
  const taken = await prisma.page.findMany({ select: { slug: true } });
  return uniqueSlug(
    slugify(title),
    taken.map((p) => p.slug),
  );
}

export function getPageBySlug(slug: string) {
  return prisma.page.findUnique({
    where: { slug },
    select: { id: true, slug: true, title: true, html: true },
  });
}

export function listPagesForGroup(groupId: string) {
  return prisma.page.findMany({
    where: { groups: { some: { groupId } } },
    orderBy: { createdAt: "desc" },
    select: { slug: true, title: true, createdAt: true },
  });
}

export async function listPagesForAdmin() {
  const pages = await prisma.page.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      slug: true,
      title: true,
      groups: { select: { group: { select: { id: true, name: true } } } },
    },
  });

  return pages.map((page) => ({
    id: page.id,
    slug: page.slug,
    title: page.title,
    groupIds: page.groups.map((g) => g.group.id),
    groupNames: page.groups.map((g) => g.group.name),
  }));
}

export async function getPageForAdmin(slug: string) {
  const page = await prisma.page.findUnique({
    where: { slug },
    select: {
      slug: true,
      title: true,
      html: true,
      groups: { select: { groupId: true } },
    },
  });
  if (!page) return null;

  return {
    slug: page.slug,
    title: page.title,
    html: page.html,
    groupIds: page.groups.map((g) => g.groupId),
  };
}
```

- [ ] **Step 2: Write `app/page-actions.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentTeacher } from "@/lib/session";
import { savePage } from "@/lib/pages";
import { validatePageHtml } from "@/lib/page-html";

async function requireTeacher() {
  const teacher = await getCurrentTeacher();
  if (!teacher) throw new Error("Unauthorized");
  return teacher;
}

export type PageInput = {
  title: string;
  html: string;
  groupIds: string[];
};

function validate(input: PageInput) {
  const title = input.title.trim();
  if (!title) throw new Error("A title is required.");

  const html = validatePageHtml(input.html);
  if (!html.ok) throw new Error(html.error);

  return { title, html: html.html };
}

// A page can belong to several groups, so every group's list is stale after a
// write. The route pattern with type "page" revalidates every instance of the
// dynamic route rather than one slug at a time.
function revalidatePages(slug: string) {
  revalidatePath("/admin");
  revalidatePath(`/admin/pages/${slug}`);
  revalidatePath(`/p/${slug}`);
  revalidatePath("/g/[slug]/pages", "page");
}

export async function createPage(input: PageInput): Promise<string> {
  await requireTeacher();
  const { title, html } = validate(input);

  const slug = await savePage({
    slug: null,
    title,
    html,
    groupIds: input.groupIds,
  });

  revalidatePages(slug);
  return slug;
}

export async function updatePage(slug: string, input: PageInput): Promise<void> {
  await requireTeacher();
  const { title, html } = validate(input);

  await savePage({ slug, title, html, groupIds: input.groupIds });

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
```

- [ ] **Step 3: Verify it compiles and nothing regressed**

Run: `npm run typecheck && npm run lint && npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add lib/pages.ts app/page-actions.ts
git commit -m "feat: add page storage and server actions"
```

---

### Task 6: `/p/[slug]` and `/p/[slug]/raw`

**Files:**
- Create: `app/p/[slug]/page.tsx`
- Create: `app/p/[slug]/raw/route.ts`

**Interfaces:**
- Consumes: `getPageBySlug` from `@/lib/pages`.
- Produces: the public URL shape `/p/<slug>`.

This task carries the security model. Read the Isolation section of the spec before writing it.

- [ ] **Step 1: Write the raw route**

Create `app/p/[slug]/raw/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getPageBySlug } from "@/lib/pages";

// Defence in depth behind the iframe sandbox. `connect-src 'none'` is the line
// that earns its place: a published page cannot make a network request, so
// nothing it collects can leave the browser. `script-src` deliberately has no
// https: — a page that pulls a library from a CDN will not run, which is the
// accepted cost of self-contained pages being the only supported kind.
const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "script-src 'unsafe-inline' 'unsafe-eval' blob:",
  "style-src 'unsafe-inline' https:",
  "img-src data: blob: https:",
  "font-src data: https:",
  "media-src data: blob: https:",
  "connect-src 'none'",
  "frame-ancestors 'self'",
  "form-action 'none'",
  "base-uri 'none'",
].join("; ");

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const page = await getPageBySlug(slug);
  if (!page) return new NextResponse("Not found", { status: 404 });

  return new NextResponse(page.html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": CONTENT_SECURITY_POLICY,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
    },
  });
}
```

- [ ] **Step 2: Write the shell page**

Create `app/p/[slug]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPageBySlug } from "@/lib/pages";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = await getPageBySlug(slug);
  return { title: page?.title ?? "Not found" };
}

export default async function PublishedPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const page = await getPageBySlug(slug);
  if (!page) notFound();

  // `allow-scripts` WITHOUT `allow-same-origin` is the whole security model:
  // the framed document gets an opaque origin, so its JavaScript runs but it
  // cannot read our cookies, our storage, or the teacher session. The two
  // tokens together would let the page remove its own sandbox — never add it.
  return (
    <iframe
      src={`/p/${slug}/raw`}
      title={page.title}
      sandbox="allow-scripts"
      className="fixed inset-0 h-full w-full border-0 bg-white"
    />
  );
}
```

- [ ] **Step 3: Seed a page by hand to test against**

Run:

```bash
npx prisma db execute --schema prisma/schema.prisma --stdin <<'SQL'
INSERT INTO Page (id, slug, title, html, createdAt, updatedAt)
VALUES ('seed-probe', 'probe', 'Probe',
'<!doctype html><meta charset="utf-8"><body style="font-family:sans-serif">
<h1 id="h">Probe</h1>
<button onclick="document.getElementById(''h'').textContent=''scripts run''">run</button>
<p id="cookie"></p><p id="net"></p>
<script>
document.getElementById(''cookie'').textContent = "cookie: [" + document.cookie + "]";
fetch("/api/auth/status").then(function(){
  document.getElementById(''net'').textContent = "network: ALLOWED";
}).catch(function(){
  document.getElementById(''net'').textContent = "network: blocked";
});
</script></body>',
datetime('now'), datetime('now'));
SQL
```

- [ ] **Step 4: Check the three security properties by hand**

Run `npm run dev`, open `http://localhost:3000/p/probe`, and confirm all three:

1. Clicking **run** changes the heading to "scripts run" — interactivity works.
2. The page shows `cookie: []` — even after logging in at `/login`. If it shows a `teacherId`, `allow-same-origin` has crept into the sandbox attribute; remove it.
3. The page shows `network: blocked`, and the browser console reports a Content Security Policy violation for `connect-src`.

- [ ] **Step 5: Delete the probe page**

Run:

```bash
npx prisma db execute --schema prisma/schema.prisma --stdin <<'SQL'
DELETE FROM Page WHERE slug = 'probe';
SQL
```

- [ ] **Step 6: Verify the build**

Run: `npm run lint && npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/p
git commit -m "feat: render published pages in a sandboxed iframe"
```

---

### Task 7: `/g/[slug]/pages`

**Files:**
- Create: `app/g/[slug]/pages/page.tsx`

**Interfaces:**
- Consumes: `listPagesForGroup` from `@/lib/pages`, `prisma`.
- Produces: nothing later tasks depend on.

Nothing on `/g/[slug]` links here — the flashcard is the point of that page, and Jenn shares this URL separately. Do not add a link to it.

- [ ] **Step 1: Write the page**

Create `app/g/[slug]/pages/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { listPagesForGroup } from "@/lib/pages";

export default async function GroupPagesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const group = await prisma.group.findUnique({ where: { slug } });
  if (!group) notFound();

  const pages = await listPagesForGroup(group.id);

  return (
    <main
      className="min-h-screen px-4 py-12"
      style={{ background: "var(--card-page-bg)" }}
    >
      <header className="mx-auto mb-8 max-w-[560px] text-center">
        <div className="mb-2.5 font-[family-name:var(--card-font-serif)] text-[13px] uppercase tracking-[6px] text-[var(--card-bleu)] opacity-80">
          ⚜ Les ressources ⚜
        </div>
        <h1
          className="font-[family-name:var(--card-font-serif)] text-[var(--card-plum)]"
          style={{ fontSize: "clamp(28px, 5vw, 38px)", lineHeight: 1.15 }}
        >
          <Link href={`/g/${slug}`} className="transition-opacity hover:opacity-75">
            {group.name}
          </Link>
        </h1>
      </header>

      <div className="mx-auto max-w-[560px]">
        {pages.length === 0 ? (
          <p className="text-center font-[family-name:var(--card-font-serif)] italic text-[var(--card-moss)]">
            Nothing here yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {pages.map((page) => (
              <li key={page.slug}>
                <Link
                  href={`/p/${page.slug}`}
                  className="block rounded-lg border border-[var(--card-line)] bg-[var(--card-paper)] px-5 py-4 font-[family-name:var(--card-font-serif)] text-[var(--card-ink)] transition-opacity hover:opacity-80"
                >
                  <span className="text-lg">{page.title}</span>
                  <span className="mt-1 block font-[family-name:var(--card-font-mono)] text-[11px] uppercase tracking-[2px] text-[#8a7f6c]">
                    {page.createdAt.toLocaleDateString("en-CA", {
                      timeZone: "UTC",
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        <p className="mt-8 text-center">
          <Link
            href={`/g/${slug}`}
            className="font-[family-name:var(--card-font-serif)] text-sm italic text-[var(--card-bleu)] underline"
          >
            ← La carte du jour
          </Link>
        </p>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Verify by hand**

Run `npm run dev` and open `/g/<an existing group slug>/pages`.
Expected: the empty state, since no page is assigned yet. An unknown group slug gives a 404.

- [ ] **Step 3: Verify the build**

Run: `npm run lint && npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add "app/g/[slug]/pages"
git commit -m "feat: list a group's pages for students"
```

---

### Task 8: Admin UI

**Files:**
- Create: `components/admin/PageEditor.tsx`
- Create: `components/admin/PageList.tsx`
- Create: `app/admin/pages/[slug]/page.tsx`
- Modify: `app/admin/page.tsx`

**Interfaces:**
- Consumes: `createPage`, `updatePage`, `deletePage`, `type PageInput` from `@/app/page-actions`; `listPagesForAdmin`, `getPageForAdmin` from `@/lib/pages`.
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Write `components/admin/PageEditor.tsx`**

```tsx
"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
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
  const [html, setHtml] = useState(initial?.html ?? "");
  const [groupIds, setGroupIds] = useState<string[]>(initial?.groupIds ?? []);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The file never reaches the server: it is read here and the text goes into
  // the same textarea a paste would fill, so upload and paste are one control
  // and the source stays editable afterwards.
  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setHtml(await file.text());
    if (!title) setTitle(file.name.replace(/\.html?$/i, ""));
    event.target.value = "";
  }

  function toggleGroup(id: string) {
    setGroupIds((current) =>
      current.includes(id)
        ? current.filter((g) => g !== id)
        : [...current, id],
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
        setGroupIds([]);
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
    setSaving(true);
    setError(null);
    try {
      await onDelete();
      router.push("/admin");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the page");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <label className="text-sm font-medium text-[var(--color-ink)]">
        Title
        <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
      </label>

      <fieldset className="text-sm font-medium text-[var(--color-ink)]">
        <legend className="mb-1">Groups</legend>
        {groups.length === 0 ? (
          <p className="text-sm font-normal text-[var(--color-ink-muted)]">
            No groups yet.
          </p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {groups.map((group) => (
              <label
                key={group.id}
                className="flex items-center gap-2 text-sm font-normal"
              >
                <input
                  type="checkbox"
                  checked={groupIds.includes(group.id)}
                  onChange={() => toggleGroup(group.id)}
                />
                {group.name}
              </label>
            ))}
          </div>
        )}
      </fieldset>

      <label className="text-sm font-medium text-[var(--color-ink)]">
        HTML file
        <input
          type="file"
          accept=".html,.htm,text/html"
          onChange={handleFile}
          className="mt-1 block w-full text-sm font-normal text-[var(--color-ink-muted)]"
        />
      </label>

      <label className="text-sm font-medium text-[var(--color-ink)]">
        HTML source
        <Textarea
          value={html}
          onChange={(e) => setHtml(e.target.value)}
          required
          rows={10}
          spellCheck={false}
          className="font-mono text-xs"
        />
      </label>

      <div className="flex items-center gap-4">
        <Button type="submit" disabled={saving}>
          {saving ? "Saving..." : submitLabel}
        </Button>
        {onDelete && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={saving}
            className="text-sm text-[var(--color-ink-muted)] underline"
          >
            Delete page
          </button>
        )}
        {saved && (
          <span className="text-sm text-[var(--color-ink-muted)]">Saved</span>
        )}
      </div>

      {error && (
        <p role="alert" className="text-sm text-[var(--color-accent)]">
          {error}
        </p>
      )}
    </form>
  );
}
```

The HTML field uses the shared `Textarea` rather than a raw `<textarea>` so it carries the same border and focus treatment as every other admin field; only the monospace override is local to this form.

- [ ] **Step 2: Write `components/admin/PageList.tsx`**

```tsx
import Link from "next/link";

export type PageSummary = {
  id: string;
  slug: string;
  title: string;
  groupNames: string[];
};

export function PageList({ pages }: { pages: PageSummary[] }) {
  if (pages.length === 0) {
    return (
      <p className="mb-6 text-sm text-[var(--color-ink-muted)]">No pages yet.</p>
    );
  }

  return (
    <ul className="mb-6 flex flex-col gap-2">
      {pages.map((page) => (
        <li key={page.id} className="flex items-baseline justify-between gap-4">
          <Link
            href={`/admin/pages/${page.slug}`}
            className="text-[var(--color-accent)] underline"
          >
            {page.title} (/p/{page.slug})
          </Link>
          <span className="shrink-0 text-sm text-[var(--color-ink-muted)]">
            {page.groupNames.length === 0
              ? "no groups"
              : page.groupNames.join(", ")}
          </span>
        </li>
      ))}
    </ul>
  );
}
```

Deletion lives on the edit page, not here — a delete button beside a link that opens the page is the wrong place for it.

- [ ] **Step 3: Write `app/admin/pages/[slug]/page.tsx`**

```tsx
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getCurrentTeacher } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getPageForAdmin } from "@/lib/pages";
import { updatePage, deletePage } from "@/app/page-actions";
import { PageEditor } from "@/components/admin/PageEditor";

export default async function AdminPageEditor({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const teacher = await getCurrentTeacher();
  if (!teacher) redirect("/login");

  const { slug } = await params;
  const page = await getPageForAdmin(slug);
  if (!page) notFound();

  const groups = await prisma.group.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return (
    <main className="min-h-screen bg-[var(--color-bg)] px-4 py-12">
      <div className="mx-auto w-full max-w-[560px]">
        <Link
          href="/admin"
          className="mb-6 inline-block text-sm text-[var(--color-ink-muted)] underline"
        >
          ← Admin
        </Link>

        <h1 className="mb-2 font-[family-name:var(--font-display)] text-3xl italic text-[var(--color-ink)]">
          {page.title}
        </h1>
        <p className="mb-6 text-sm text-[var(--color-ink-muted)]">
          <a href={`/p/${page.slug}`} className="underline">
            /p/{page.slug}
          </a>{" "}
          — the link stays the same when you rename the page.
        </p>

        <PageEditor
          groups={groups}
          initial={{
            title: page.title,
            html: page.html,
            groupIds: page.groupIds,
          }}
          submitLabel="Save page"
          onSubmit={updatePage.bind(null, page.slug)}
          onDelete={deletePage.bind(null, page.slug)}
        />
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Add the Pages section to `app/admin/page.tsx`**

Add these imports alongside the existing ones:

```tsx
import { createPage } from "@/app/page-actions";
import { listPagesForAdmin } from "@/lib/pages";
import { PageList } from "@/components/admin/PageList";
import { PageEditor } from "@/components/admin/PageEditor";
```

After the existing `existingCard` query, add:

```tsx
  const pages = await listPagesForAdmin();
```

Then, immediately after the closing `</div>` of the Groups block and before the end of the outer container, add:

```tsx
        <div className="mx-auto w-full max-w-[560px] lg:mx-0">
          <h2 className="mb-4 mt-12 font-[family-name:var(--font-display)] text-2xl italic text-[var(--color-ink)]">
            Pages
          </h2>
          <PageList pages={pages} />
          <PageEditor
            groups={groups.map((g) => ({ id: g.id, name: g.name }))}
            submitLabel="Publish page"
            onSubmit={createPage}
          />
        </div>
```

- [ ] **Step 5: Verify the whole loop by hand**

Run `npm run dev`, log in at `/login`, then on `/admin`:

1. Save any small HTML file with a title and one group ticked. It appears in the list.
2. Open its `/p/<slug>` link — the page renders and its scripts run.
3. Open `/g/<that group>/pages` — the page is listed.
4. Open `/admin/pages/<slug>`, change the title, save. The list shows the new title and **the slug is unchanged**.
5. Untick the group, save, reload `/g/<that group>/pages` — the page is gone from the list but `/p/<slug>` still works.
6. Delete the page from its edit screen. `/p/<slug>` now 404s.

- [ ] **Step 6: Verify the build**

Run: `npm run lint && npm run typecheck && npm test && npm run build`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add components/admin/PageEditor.tsx components/admin/PageList.tsx app/admin
git commit -m "feat: publish and edit pages from the admin area"
```

---

### Task 9: `POST /api/pages`

**Files:**
- Create: `app/api/pages/route.ts`

**Interfaces:**
- Consumes: `parsePagePayload`, `MAX_PAGE_BYTES`, `savePage`, `prisma`.
- Produces: `POST /api/pages` accepting `{title, html, groups?, slug?}` and returning `{url}`.

- [ ] **Step 1: Write the route**

```ts
import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { savePage } from "@/lib/pages";
import { parsePagePayload } from "@/lib/page-payload";
import { MAX_PAGE_BYTES } from "@/lib/page-html";

// Hash both sides first so the comparison is over two equal-length buffers:
// timingSafeEqual throws on a length mismatch, and that throw would itself
// leak how long the real token is.
function tokenMatches(supplied: string, expected: string): boolean {
  return timingSafeEqual(
    createHash("sha256").update(supplied).digest(),
    createHash("sha256").update(expected).digest(),
  );
}

export async function POST(request: Request) {
  // Unset token means the endpoint does not exist — a 404 rather than a 401,
  // so a deployment that has not opted in gives nothing away.
  const expected = process.env.PAGES_UPLOAD_TOKEN;
  if (!expected) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const header = request.headers.get("authorization") ?? "";
  const supplied = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!tokenMatches(supplied, expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_PAGE_BYTES) {
    return NextResponse.json({ error: "That page is larger than 2 MB." }, {
      status: 413,
    });
  }

  const body = await request.json().catch(() => null);
  const parsed = parsePagePayload(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { title, html, groups, slug } = parsed.payload;

  let groupIds: string[] | null = null;
  if (groups) {
    const found = await prisma.group.findMany({
      where: { slug: { in: groups } },
      select: { id: true, slug: true },
    });
    const missing = groups.filter((g) => !found.some((f) => f.slug === g));
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Unknown group: ${missing.join(", ")}` },
        { status: 404 },
      );
    }
    groupIds = found.map((f) => f.id);
  }

  const saved = await savePage({ slug, title, html, groupIds });

  const origin = process.env.ORIGIN ?? new URL(request.url).origin;
  return NextResponse.json({ url: `${origin}/p/${saved}` }, { status: 201 });
}
```

- [ ] **Step 2: Set a development token**

Add to `.env.local` (gitignored):

```
PAGES_UPLOAD_TOKEN=dev-token-not-a-secret
```

- [ ] **Step 3: Exercise every response by hand**

With `npm run dev` running, and `a1` replaced by a real group slug:

```bash
# 201 — publishes
curl -sS -X POST http://localhost:3000/api/pages \
  -H 'Authorization: Bearer dev-token-not-a-secret' \
  -H 'Content-Type: application/json' \
  -d '{"title":"Curl test","html":"<!doctype html><h1>Bonjour</h1>","groups":["a1"]}'

# 201 again, same slug — replaces the page rather than making a second one
curl -sS -X POST http://localhost:3000/api/pages \
  -H 'Authorization: Bearer dev-token-not-a-secret' \
  -H 'Content-Type: application/json' \
  -d '{"title":"Curl test","slug":"curl-test","html":"<!doctype html><h1>Salut</h1>"}'

# 401
curl -sS -o /dev/null -w '%{http_code}\n' -X POST http://localhost:3000/api/pages \
  -H 'Authorization: Bearer wrong' -H 'Content-Type: application/json' -d '{}'

# 400
curl -sS -X POST http://localhost:3000/api/pages \
  -H 'Authorization: Bearer dev-token-not-a-secret' \
  -H 'Content-Type: application/json' -d '{"title":"No html"}'

# 404 on an unknown group
curl -sS -X POST http://localhost:3000/api/pages \
  -H 'Authorization: Bearer dev-token-not-a-secret' \
  -H 'Content-Type: application/json' \
  -d '{"title":"x","html":"<p>x</p>","groups":["nope"]}'
```

Expected: `{"url":"http://localhost:3000/p/curl-test"}`, then the same URL with the page's content now reading "Salut", then `401`, then a 400 with an error message, then a 404 naming the group. Confirm `/admin` lists exactly one "Curl test" page, then delete it from its edit screen.

- [ ] **Step 4: Verify the build**

Run: `npm run lint && npm run typecheck && npm test && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/pages/route.ts
git commit -m "feat: add the token-authenticated publish endpoint"
```

---

### Task 10: Documentation and production settings

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/DEPLOYMENT.md`
- Modify: `docs/DEPLOY.md`

- [ ] **Step 1: Update the routes table in `CLAUDE.md`**

Add these rows to the Routes table:

```markdown
| `/p/[slug]` | public | an uploaded HTML page, in a sandboxed iframe |
| `/g/[slug]/pages` | students | that group's uploaded pages (unlinked; shared by URL) |
| `/admin/pages/[slug]` | teacher | edits one uploaded page |
| `POST /api/pages` | token | publishes a page from outside the browser |
```

And amend the `/api/auth/*` row, which currently claims those are the only route handlers:

```markdown
| `/api/auth/*` | — | WebAuthn ceremonies (server actions everywhere except here, `/api/pages`, and `/p/[slug]/raw`) |
```

- [ ] **Step 2: Add an Architecture section to `CLAUDE.md`**

Insert after the "Rendering" section:

```markdown
### Uploaded pages

A `Page` is an HTML document Jenn wrote elsewhere, stored whole in the `html`
column and joined to any number of groups through `PageGroup`. It has no date
and no relationship to a card. The HTML lives in the database rather than on
disk so the nightly `VACUUM INTO` backup covers it for free.

`/p/[slug]` renders nothing but `<iframe sandbox="allow-scripts">` around
`/p/[slug]/raw`. `allow-scripts` without `allow-same-origin` gives the framed
document an opaque origin: its JavaScript runs, but it cannot read cookies,
storage, or the teacher session. **Never add `allow-same-origin`** — with
`allow-scripts` beside it, the page can remove its own sandbox. The CSP on the
raw route is the second layer, and `connect-src 'none'` is the part that
matters: a page cannot make a network request, so nothing it collects leaves
the browser. `script-src` has no `https:`, so CDN-loaded libraries do not run;
self-contained files are the only supported kind.

There is no HTML sanitiser, deliberately. Sanitising would strip exactly the
interactivity the feature exists to preserve, and the sandbox already contains
what a sanitiser would defend against.

A page's slug is derived from its title once, at creation, and never moves
again — students bookmark these links. `POST /api/pages` exists because the
browser Jenn writes pages in is sandboxed and cannot complete a passkey login;
it is authenticated by `PAGES_UPLOAD_TOKEN` and returns 404 when that variable
is unset.
```

- [ ] **Step 3: Record the env var in `docs/DEPLOYMENT.md`**

In the env-var section that lists `RP_ID`, `ORIGIN`, and `ANTHROPIC_API_KEY`, add `PAGES_UPLOAD_TOKEN` with this note:

```markdown
`PAGES_UPLOAD_TOKEN` — bearer token for `POST /api/pages`. Generate with
`openssl rand -hex 32`. Leaving it unset disables the endpoint entirely (it
returns 404), which is the right setting anywhere Jenn is not publishing from.
Rotating it is just editing `.env.local` and restarting pm2.
```

- [ ] **Step 4: Raise the nginx body limit**

nginx defaults `client_max_body_size` to 1 MB, which would reject a page under our own 2 MB cap with a 413 before Next ever sees it. Add to the runbook, in the nginx section:

```markdown
The server block needs `client_max_body_size 4m;` so a published page up to
2 MB gets through. Without it nginx returns 413 for large uploads, from both
the admin form and `/api/pages`, before the app is involved.
```

Then apply it on the server:

```bash
sudo nano /etc/nginx/sites-available/francaisavecjenn
# add `client_max_body_size 4m;` inside the server block
sudo nginx -t && sudo systemctl reload nginx
```

- [ ] **Step 5: Note the migration in `docs/DEPLOY.md`**

The deploy script already runs `migrate deploy` when `prisma/` changed, so no new step is needed. Add one line to the deploy notes recording that this release adds the `Page` and `PageGroup` tables and requires `PAGES_UPLOAD_TOKEN` in `.env.local` if the endpoint is wanted.

- [ ] **Step 6: Run the full CI sequence**

Run: `npx prisma generate && npm run lint && npm run typecheck && npm test && npm run build`
Expected: all five PASS.

- [ ] **Step 7: Commit**

```bash
git add CLAUDE.md docs/DEPLOYMENT.md docs/DEPLOY.md
git commit -m "docs: record the uploaded pages feature"
```

---

## Verification checklist

Before calling the feature done:

- [ ] `npx prisma generate && npm run lint && npm run typecheck && npm test && npm run build` all pass
- [ ] A logged-out visitor can open `/p/<slug>` and `/g/<slug>/pages`
- [ ] A logged-out visitor gets redirected from `/admin/pages/<slug>` to `/login`
- [ ] `curl -X POST /api/pages` with no `Authorization` header returns 401
- [ ] Unsetting `PAGES_UPLOAD_TOKEN` and restarting makes `/api/pages` return 404
- [ ] Inside a published page, `document.cookie` is empty and `fetch` is blocked
- [ ] Renaming a page in admin leaves its `/p/<slug>` link working
- [ ] Deleting a group that has a page assigned succeeds, and the page survives it — unlisted, but still reachable at `/p/<slug>`. `deleteGroup` in `app/actions.ts` deletes cards explicitly because `Card.groupId` has no cascade; `PageGroup` does cascade, so it needs no change there. If the delete fails on a foreign-key constraint, that assumption is wrong and `deleteGroup` needs a `pageGroup.deleteMany` in its transaction.
