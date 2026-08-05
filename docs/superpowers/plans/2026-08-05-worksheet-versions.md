# Worksheet Versions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A page Jenn ticks as a worksheet gains up to two saved versions per student — the student's attempt and Jenn's correction — beside the blank, all three reachable from the shelf tile the worksheet already occupies.

**Architecture:** An html version is a serialised snapshot of the rendered DOM with the document's own `<script>` tags stripped, taken inside the sandboxed frame by a third bootstrap and posted out to a POST route. A pdf version is a re-upload. Both are rows in one `PageVersion` table whose `@@unique([pageId, groupId, fromTeacher])` *is* the three-slot rule. Serving happens only from gated routes under `/g/[slug]/`; `/p/[slug]` is untouched.

**Tech Stack:** Next.js 16 App Router, Prisma 6 + SQLite, React 19, Tailwind v4, Vitest 2, happy-dom (new devDependency), Node `zlib` brotli.

**Spec:** `docs/superpowers/specs/2026-08-05-worksheet-versions-design.md`. Read it before starting — it records why each of these decisions was made.

## Global Constraints

- **Logic belongs in `lib/`.** Anything with a rule in it is a pure function in `lib/` with a test in `tests/lib/`. Components and Prisma access are not unit-tested.
- **Comments explain the "why", especially the counter-intuitive.** Match the surrounding density. Do not add comments that restate the code.
- **`@/` alias** for all repo-root-relative imports.
- **"Student" is the UI word, "Group" is the code word.** `group` in `lib/`, `prisma/` and route segments; `student` in copy.
- **Student-facing copy is French. Teacher-facing copy is English.**
- **No CSP directive may be widened.** `/p/[slug]/raw`'s policy is copied verbatim; nothing in this feature is a reason to change it.
- **Never add `allow-same-origin`** to any sandbox attribute in this feature.
- **Brotli through the async API only** — never `brotliCompressSync`. One pm2 fork process serves every SSE stream.
- **`MAX_SNAPSHOT_BYTES` is 3 MB** (`3 * 1024 * 1024`), set by nginx's `client_max_body_size 4m`.
- **Deletes use `deleteMany`**, writes-that-may-race use `updateMany`, so a stale tab is a no-op rather than a P2025.
- **Server actions call `revalidatePath`** for the pages they affect.
- CI order, all of which must pass before a task is done: `npx prisma generate` → `npm run lint` → `npm run typecheck` → `npm test` → `npm run build`.

---

## File Structure

**New pure modules (all unit-tested):**

| File | Responsibility |
|---|---|
| `lib/page-version-kind.ts` | narrow a version row's `kind` to `"html" \| "pdf"` |
| `lib/version-labels.ts` | the three slot labels, per audience |
| `lib/page-versions.ts` | `applyVersions` — fold one shelf's versions onto its pages |
| `lib/worksheet-access.ts` | the guards over `chatRole` |
| `lib/page-snapshot.ts` | `MAX_SNAPSHOT_BYTES` and `validateSnapshot` |
| `lib/snapshot-codec.ts` | brotli pack/unpack, async only |
| `lib/snapshot-dom.ts` | the DOM walk, self-contained for `toString()` inlining |
| `lib/version-notice.ts` | the chat sentence each save posts |

**Modified pure modules:** `lib/page-target.ts`, `lib/printable-bootstrap.ts`.

**New server modules (not unit-tested):** `lib/version-store.ts` (Prisma + codec), `lib/worksheet-context.ts` (the shared resolve-and-authorise step the three routes share).

**New routes:** `app/g/[slug]/w/[pageSlug]/page.tsx`, `.../raw/route.ts`, `.../pdf/route.ts`, `app/api/worksheets/[slug]/[pageSlug]/route.ts`.

**New components:** `components/worksheet/WorksheetShell.tsx`, `components/worksheet/SaveVersionButton.tsx`, `components/worksheet/VersionChooser.tsx`, `components/worksheet/UploadVersion.tsx`.

**Modified:** `prisma/schema.prisma`, `lib/pages.ts`, `app/page-actions.ts`, `components/admin/PageEditor.tsx`, `components/admin/PageList.tsx`, `components/student/FilesTab.tsx`, `app/g/[slug]/page.tsx`, `CLAUDE.md`.

---

### Task 1: `readVersionKind`

**Files:**
- Create: `lib/page-version-kind.ts`
- Test: `tests/lib/page-version-kind.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `type VersionKind = "html" | "pdf"`, `readVersionKind(row: { kind: string; pdfSize: number | null }): VersionKind`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { readVersionKind } from "@/lib/page-version-kind";

describe("readVersionKind", () => {
  it("reads the two kinds it knows", () => {
    expect(readVersionKind({ kind: "html", pdfSize: null })).toBe("html");
    expect(readVersionKind({ kind: "pdf", pdfSize: 1024 })).toBe("pdf");
  });

  it("resolves an unrecognised kind toward the row most likely to be real", () => {
    // Same defensive contract readPageKind, readSections and readOps have: the
    // row most likely to be broken is one with content and a wrong kind, and
    // calling that html would serve a PDF's bytes into an iframe.
    expect(readVersionKind({ kind: "", pdfSize: 4096 })).toBe("pdf");
    expect(readVersionKind({ kind: "wat", pdfSize: null })).toBe("html");
  });

  it("never returns link, which readPageKind can", () => {
    // The reason this is not readPageKind: a version can never be a link, and
    // reusing that function would push a dead case into every caller.
    expect(readVersionKind({ kind: "link", pdfSize: null })).toBe("html");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/lib/page-version-kind.test.ts`
Expected: FAIL — cannot find module `@/lib/page-version-kind`.

- [ ] **Step 3: Write the implementation**

```ts
// lib/page-version-kind.ts
export type VersionKind = "html" | "pdf";

// The version-row sibling of readPageKind, and deliberately NOT that function.
// It can return "link", which is impossible here — a link row cannot be a
// worksheet — and reusing it would push a dead case into every caller.
//
// Same defensive contract as readPageKind, readSections and readOps: resolve on
// the content signal rather than trusting the string, because the row most
// likely to be broken is one with content and a wrong kind.
export function readVersionKind(row: {
  kind: string;
  pdfSize: number | null;
}): VersionKind {
  if (row.kind === "pdf") return "pdf";
  if (row.kind === "html") return "html";
  return row.pdfSize !== null ? "pdf" : "html";
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run tests/lib/page-version-kind.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/page-version-kind.ts tests/lib/page-version-kind.test.ts
git commit -m "Narrow a version row's kind to the two it can be"
```

---

### Task 2: Version labels

**Files:**
- Create: `lib/version-labels.ts`
- Test: `tests/lib/version-labels.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `type VersionSlot = "blank" | "student" | "teacher"`, `type VersionAudience = "student" | "teacher"`, `versionLabel(slot: VersionSlot, audience: VersionAudience, studentName: string): string`, `slotForVersion(fromTeacher: boolean): VersionSlot`.

**Note on the name.** The spec's table illustrates the teacher's label as *Marie's answers*. Use the **whole** group name — *Marie Dupont's answers* — because that is the rule `teacherPageLabel` already records: her problem is telling two students apart, and two students can share a first name. The possessive is always `'s`, including a name ending in s, matching that function.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { slotForVersion, versionLabel } from "@/lib/version-labels";

describe("versionLabel", () => {
  it("speaks French to the student", () => {
    expect(versionLabel("blank", "student", "Marie Dupont")).toBe("Le devoir");
    expect(versionLabel("student", "student", "Marie Dupont")).toBe("Mes réponses");
    expect(versionLabel("teacher", "student", "Marie Dupont")).toBe(
      "La correction de Jenn",
    );
  });

  it("speaks English to Jenn, and names the student in full", () => {
    // The whole name, for teacherPageLabel's reason: her problem is telling two
    // students apart, and two students can share a first name.
    expect(versionLabel("blank", "teacher", "Marie Dupont")).toBe("The worksheet");
    expect(versionLabel("student", "teacher", "Marie Dupont")).toBe(
      "Marie Dupont's answers",
    );
    expect(versionLabel("teacher", "teacher", "Marie Dupont")).toBe("My correction");
  });

  it("uses 's on a name ending in s, as teacherPageLabel does", () => {
    expect(versionLabel("student", "teacher", "Jonas")).toBe("Jonas's answers");
  });

  it("never shows a student an English label", () => {
    const slots = ["blank", "student", "teacher"] as const;
    for (const slot of slots) {
      const fr = versionLabel(slot, "student", "Marie");
      const en = versionLabel(slot, "teacher", "Marie");
      expect(fr).not.toBe(en);
    }
  });
});

describe("slotForVersion", () => {
  it("maps the stored boolean onto a slot", () => {
    expect(slotForVersion(true)).toBe("teacher");
    expect(slotForVersion(false)).toBe("student");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/lib/version-labels.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write the implementation**

```ts
// lib/version-labels.ts

// The blank is not a row: it is Page.html or Page.pdf. The other two are the
// two PageVersion slots, which is why this type has three members and
// PageVersion has one boolean.
export type VersionSlot = "blank" | "student" | "teacher";
export type VersionAudience = "student" | "teacher";

export function slotForVersion(fromTeacher: boolean): VersionSlot {
  return fromTeacher ? "teacher" : "student";
}

// Chosen by audience, the way greeting and teacherPageLabel already split:
// French for the student, English for Jenn, from one table rather than two
// copies that would drift.
export function versionLabel(
  slot: VersionSlot,
  audience: VersionAudience,
  studentName: string,
): string {
  if (audience === "student") {
    if (slot === "blank") return "Le devoir";
    if (slot === "student") return "Mes réponses";
    return "La correction de Jenn";
  }

  if (slot === "blank") return "The worksheet";
  // The WHOLE name, and always 's — the rule teacherPageLabel records. Two
  // students can share a first name, and "Jonas' answers" would be a second
  // possessive rule for one apostrophe's worth of grammar.
  if (slot === "student") return `${studentName}'s answers`;
  return "My correction";
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run tests/lib/version-labels.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/version-labels.ts tests/lib/version-labels.test.ts
git commit -m "Name the three versions, in each reader's language"
```

---

### Task 3: `applyVersions`

**Files:**
- Create: `lib/page-versions.ts`
- Test: `tests/lib/page-versions.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `type ShelfVersion = { pageId: string; fromTeacher: boolean; updatedAt: Date }`, `type WithVersions<T> = T & { versions: { fromTeacher: boolean; updatedAt: Date }[] }`, `applyVersions<T extends { id: string }>(pages: T[], versions: ShelfVersion[]): WithVersions<T>[]`, `versionCount(versions: { fromTeacher: boolean }[]): number`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { applyVersions, versionCount } from "@/lib/page-versions";

const A = new Date("2026-08-01T10:00:00Z");
const B = new Date("2026-08-02T10:00:00Z");

describe("applyVersions", () => {
  it("gives a page with no versions an empty list, not undefined", () => {
    // The tile reads .length to decide on a badge. An absent array would make
    // every consumer write the same ?? [] and one of them would forget.
    const [page] = applyVersions([{ id: "p1" }], []);
    expect(page.versions).toEqual([]);
  });

  it("folds this shelf's versions onto their pages", () => {
    const pages = applyVersions(
      [{ id: "p1" }, { id: "p2" }],
      [
        { pageId: "p1", fromTeacher: false, updatedAt: A },
        { pageId: "p1", fromTeacher: true, updatedAt: B },
      ],
    );
    expect(pages[0].versions).toHaveLength(2);
    expect(pages[1].versions).toHaveLength(0);
  });

  it("orders the student's version before the teacher's, whatever the query gave", () => {
    // A stable order, so the chooser does not reshuffle between renders. It is
    // the order the work happens in: the attempt, then the correction.
    const [page] = applyVersions(
      [{ id: "p1" }],
      [
        { pageId: "p1", fromTeacher: true, updatedAt: A },
        { pageId: "p1", fromTeacher: false, updatedAt: B },
      ],
    );
    expect(page.versions.map((v) => v.fromTeacher)).toEqual([false, true]);
  });

  it("drops a version whose page is not on this shelf", () => {
    const [page] = applyVersions(
      [{ id: "p1" }],
      [{ pageId: "other", fromTeacher: false, updatedAt: A }],
    );
    expect(page.versions).toEqual([]);
  });

  it("keeps the fields the page already had", () => {
    const [page] = applyVersions([{ id: "p1", title: "Devoir 3" }], []);
    expect(page.title).toBe("Devoir 3");
  });
});

describe("versionCount", () => {
  it("counts the blank, which is not a row", () => {
    // Page.html IS the first version. A count of 1 means nobody has saved
    // anything, which is why the badge only shows from 2.
    expect(versionCount([])).toBe(1);
    expect(versionCount([{ fromTeacher: false }])).toBe(2);
    expect(versionCount([{ fromTeacher: false }, { fromTeacher: true }])).toBe(3);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/lib/page-versions.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write the implementation**

```ts
// lib/page-versions.ts

export type ShelfVersion = {
  pageId: string;
  fromTeacher: boolean;
  updatedAt: Date;
};

export type WithVersions<T> = T & {
  versions: { fromTeacher: boolean; updatedAt: Date }[];
};

// Folds one shelf's versions onto its pages, the way applyPins folds one
// shelf's pins. Versions are per-(page, group), so the same worksheet carries
// different versions on two students' shelves.
//
// The snapshots themselves are never in here. A shelf query that loaded a blob
// to draw a badge would have paid for the thing the badge was avoiding — the
// lesson pdfSize and thumbAt each record one column apart.
export function applyVersions<T extends { id: string }>(
  pages: T[],
  versions: ShelfVersion[],
): WithVersions<T>[] {
  const byPage = new Map<string, { fromTeacher: boolean; updatedAt: Date }[]>();
  for (const version of versions) {
    const list = byPage.get(version.pageId) ?? [];
    list.push({ fromTeacher: version.fromTeacher, updatedAt: version.updatedAt });
    byPage.set(version.pageId, list);
  }

  return pages.map((page) => ({
    ...page,
    // Student first, then teacher: a stable order so the chooser does not
    // reshuffle between renders, and it is the order the work happens in.
    versions: (byPage.get(page.id) ?? []).sort(
      (a, b) => Number(a.fromTeacher) - Number(b.fromTeacher),
    ),
  }));
}

// The blank is not a row — it is Page.html or Page.pdf — so a page with no
// saved versions still has one version. That is why the tile's badge starts at
// two.
export function versionCount(versions: { fromTeacher: boolean }[]): number {
  return versions.length + 1;
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run tests/lib/page-versions.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/page-versions.ts tests/lib/page-versions.test.ts
git commit -m "Fold a shelf's versions onto its pages"
```

---

### Task 4: The guards over `chatRole`

**Files:**
- Create: `lib/worksheet-access.ts`
- Test: `tests/lib/worksheet-access.test.ts`

**Interfaces:**
- Consumes: `PageKind` from `@/lib/page-kind`.
- Produces: `worksheetOpenable(input: { role: "teacher" | "student" | null; worksheet: boolean; kind: PageKind; onShelf: boolean }): boolean`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { worksheetOpenable } from "@/lib/worksheet-access";

const ok = {
  role: "student" as const,
  worksheet: true,
  kind: "html" as const,
  onShelf: true,
};

describe("worksheetOpenable", () => {
  it("admits both parties for a worksheet on their shelf", () => {
    expect(worksheetOpenable(ok)).toBe(true);
    expect(worksheetOpenable({ ...ok, role: "teacher" })).toBe(true);
    expect(worksheetOpenable({ ...ok, kind: "pdf" })).toBe(true);
  });

  it("refuses a visitor chatRole already refused", () => {
    // chatRole answers null for the everyone group before it checks anything
    // else, which is how /g/all is kept out without a clause here.
    expect(worksheetOpenable({ ...ok, role: null })).toBe(false);
  });

  it("refuses a page Jenn has not ticked", () => {
    expect(worksheetOpenable({ ...ok, worksheet: false })).toBe(false);
  });

  it("refuses a link, which has nothing to fill in", () => {
    expect(worksheetOpenable({ ...ok, kind: "link" })).toBe(false);
  });

  it("refuses a page that is not on this shelf", () => {
    // Without this a guessable page slug would let anyone attach versions to
    // any document in the database.
    expect(worksheetOpenable({ ...ok, onShelf: false })).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/lib/worksheet-access.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write the implementation**

```ts
// lib/worksheet-access.ts
import type { PageKind } from "@/lib/page-kind";

// The guards that sit ON TOP of chatRole, never instead of it. chatRole decides
// who may be here at all — and because it refuses the everyone group before it
// checks the teacher, /g/all needs no clause below. These four are about the
// page rather than the person.
//
// `onShelf` is computed by a query and passed in, so the rule stays pure and
// the query stays in the route that owns it.
export function worksheetOpenable(input: {
  role: "teacher" | "student" | null;
  worksheet: boolean;
  kind: PageKind;
  onShelf: boolean;
}): boolean {
  if (!input.role) return false;
  if (!input.worksheet) return false;
  // A link is not hosted here and has nothing to fill in.
  if (input.kind === "link") return false;
  // Without this a guessable page slug would let anyone attach versions to any
  // document in the database.
  return input.onShelf;
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run tests/lib/worksheet-access.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/worksheet-access.ts tests/lib/worksheet-access.test.ts
git commit -m "Guard a worksheet on the page, where chatRole guards the person"
```

---

### Task 5: The snapshot payload — cap, validator, codec

**Files:**
- Create: `lib/page-snapshot.ts`, `lib/snapshot-codec.ts`
- Test: `tests/lib/page-snapshot.test.ts`, `tests/lib/snapshot-codec.test.ts`

**Interfaces:**
- Consumes: `byteLength` from `@/lib/page-html`.
- Produces: `MAX_SNAPSHOT_BYTES: number`, `type SnapshotResult = { ok: true; html: string } | { ok: false; error: string }`, `validateSnapshot(input: unknown): SnapshotResult`, `packSnapshot(html: string): Promise<Uint8Array>`, `unpackSnapshot(bytes: Uint8Array): Promise<string>`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/lib/page-snapshot.test.ts
import { describe, expect, it } from "vitest";
import { MAX_SNAPSHOT_BYTES, validateSnapshot } from "@/lib/page-snapshot";
import { MAX_PAGE_BYTES } from "@/lib/page-html";

describe("MAX_SNAPSHOT_BYTES", () => {
  it("exceeds the cap on the document it is a snapshot of", () => {
    // A snapshot is the worksheet PLUS what the student typed PLUS any canvas
    // rasterised to a PNG data URL. Capping it at MAX_PAGE_BYTES would make a
    // 2 MB worksheet unanswerable.
    expect(MAX_SNAPSHOT_BYTES).toBeGreaterThan(MAX_PAGE_BYTES);
  });

  it("stays under nginx's 4 MB client_max_body_size", () => {
    // Raising it means an SSH session and an nginx reload first; until then the
    // failure is a raw 413 that Next never sees and the app cannot explain.
    expect(MAX_SNAPSHOT_BYTES).toBeLessThan(4 * 1024 * 1024);
  });
});

describe("validateSnapshot", () => {
  it("accepts a document", () => {
    const result = validateSnapshot("<!doctype html><html><body>x</body></html>");
    expect(result).toEqual({
      ok: true,
      html: "<!doctype html><html><body>x</body></html>",
    });
  });

  it("refuses anything that is not a string", () => {
    expect(validateSnapshot(null).ok).toBe(false);
    expect(validateSnapshot(42).ok).toBe(false);
  });

  it("refuses an empty snapshot", () => {
    expect(validateSnapshot("   ").ok).toBe(false);
  });

  it("refuses one over the cap, and says so in bytes", () => {
    // Bytes, not characters: a page of accented French takes more room on disk
    // than String.length suggests, and the cap protects the database.
    const result = validateSnapshot("<p>" + "é".repeat(MAX_SNAPSHOT_BYTES));
    expect(result.ok).toBe(false);
  });

  it("catches the obvious wrong thing without parsing HTML", () => {
    // Same limited ambition as validatePageHtml's includes("<").
    expect(validateSnapshot("just some text").ok).toBe(false);
  });
});
```

```ts
// tests/lib/snapshot-codec.test.ts
import { describe, expect, it } from "vitest";
import { packSnapshot, unpackSnapshot } from "@/lib/snapshot-codec";

describe("the snapshot codec", () => {
  it("round-trips a document unchanged", async () => {
    const html = "<!doctype html><html><body><p>Bonjour</p></body></html>";
    expect(await unpackSnapshot(await packSnapshot(html))).toBe(html);
  });

  it("round-trips accents and emoji, which is why it is utf8 both ways", async () => {
    const html = "<p>Élève — prêt ? ✅</p>";
    expect(await unpackSnapshot(await packSnapshot(html))).toBe(html);
  });

  it("actually shrinks a document", async () => {
    // The whole reason the column is Bytes and not String. Without this the
    // table becomes the largest thing in a file the nightly VACUUM INTO copies
    // whole.
    const html = "<div class='question'>Réponse</div>".repeat(2000);
    const packed = await packSnapshot(html);
    expect(packed.byteLength).toBeLessThan(html.length / 4);
  });

  it("round-trips an empty string", async () => {
    expect(await unpackSnapshot(await packSnapshot(""))).toBe("");
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run tests/lib/page-snapshot.test.ts tests/lib/snapshot-codec.test.ts`
Expected: FAIL — cannot find either module.

- [ ] **Step 3: Write the implementations**

```ts
// lib/page-snapshot.ts
import { byteLength } from "@/lib/page-html";

// 3 MB, chosen the way MAX_PDF_BYTES and MAX_UPLOAD_BYTES were: the largest
// round number under the 4 MB client_max_body_size nginx was raised to BY HAND
// (docs/DEPLOYMENT.md item 11).
//
// It MUST exceed MAX_PAGE_BYTES. A snapshot is the worksheet plus what the
// student typed plus any canvas rasterised to a PNG data URL, so capping the
// two at one number would make a large worksheet unanswerable.
export const MAX_SNAPSHOT_BYTES = 3 * 1024 * 1024;

export type SnapshotResult =
  | { ok: true; html: string }
  | { ok: false; error: string };

// validatePageHtml's sibling, with the same limited ambition: catch the wrong
// thing, do not attempt to parse the format. The messages are English because
// the only place they surface is a POST response the shell renders through its
// own French copy.
export function validateSnapshot(input: unknown): SnapshotResult {
  if (typeof input !== "string") {
    return { ok: false, error: "The snapshot is missing." };
  }

  const html = input.trim();
  if (!html) return { ok: false, error: "The snapshot is missing." };

  if (byteLength(html) > MAX_SNAPSHOT_BYTES) {
    return { ok: false, error: "That page is larger than 3 MB." };
  }

  if (!html.includes("<")) {
    return { ok: false, error: "That doesn't look like a document." };
  }

  return { ok: true, html };
}
```

```ts
// lib/snapshot-codec.ts
import { brotliCompress, brotliDecompress, constants } from "node:zlib";

// THE ASYNC API ONLY. One pm2 fork process serves every SSE stream, and a
// synchronous brotli over a megabyte would stall the `: ping` heartbeats that
// keep those streams alive behind nginx — the same rule lib/password-hash.ts
// records for bcrypt.
//
// Hand-rolled promises rather than util.promisify: promisify picks a callback
// overload and loses the options argument's type, and the options are the point.
const OPTIONS = {
  // 5 rather than the default 11. Measured against these documents, 11 costs
  // roughly a second of CPU per save for a few percent of size, and this runs
  // on the request path of the one process that also fans out the chat.
  params: { [constants.BROTLI_PARAM_QUALITY]: 5 },
};

export function packSnapshot(html: string): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    brotliCompress(Buffer.from(html, "utf8"), OPTIONS, (error, result) => {
      if (error) reject(error);
      else resolve(new Uint8Array(result));
    });
  });
}

export function unpackSnapshot(bytes: Uint8Array): Promise<string> {
  return new Promise((resolve, reject) => {
    brotliDecompress(Buffer.from(bytes), (error, result) => {
      if (error) reject(error);
      else resolve(result.toString("utf8"));
    });
  });
}
```

- [ ] **Step 4: Run them and watch them pass**

Run: `npx vitest run tests/lib/page-snapshot.test.ts tests/lib/snapshot-codec.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/page-snapshot.ts lib/snapshot-codec.ts tests/lib/page-snapshot.test.ts tests/lib/snapshot-codec.test.ts
git commit -m "Bound and compress a snapshot on its way to the database"
```

---

### Task 6: The DOM walk

**Files:**
- Create: `lib/snapshot-dom.ts`
- Test: `tests/lib/snapshot-dom.test.ts`
- Modify: `package.json` (add `happy-dom` to `devDependencies`)

**Interfaces:**
- Consumes: nothing — **it may not consume anything**, see below.
- Produces: `snapshotDocument(root: Element): string`.

**The self-containment requirement.** Task 7 inlines this function into a `<script>` with `Function.prototype.toString()`. That means it may not import anything, may not close over module scope, and may not use syntax the compiler turns into a helper call. Write it in the same ES5 idiom as the two bootstraps beside it — `var`, `function`, no arrow functions, no spread, no optional chaining — so the emitted source is predictable. Inner `function` declarations are fine; anything outside the function body is not.

- [ ] **Step 1: Add happy-dom**

Run: `npm install --save-dev happy-dom`

The global vitest environment stays `node`. This one test file opts in with a docblock, which is why `vitest.config.ts` needs no change.

- [ ] **Step 2: Write the failing test**

```ts
// tests/lib/snapshot-dom.test.ts
/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it } from "vitest";
import { snapshotDocument } from "@/lib/snapshot-dom";

function load(body: string): Element {
  document.documentElement.innerHTML = `<head></head><body>${body}</body>`;
  return document.documentElement;
}

// Re-parses a snapshot so assertions are about what a browser would render from
// it, not about the string. That is the actual contract: a stored version has
// to come back as the state it was saved in.
function reparse(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

describe("snapshotDocument", () => {
  beforeEach(() => {
    document.documentElement.innerHTML = "<head></head><body></body>";
  });

  it("writes a typed value into the markup", () => {
    const root = load(`<input id="a" type="text">`);
    (document.getElementById("a") as HTMLInputElement).value = "bonjour";

    const out = reparse(snapshotDocument(root));
    expect(out.getElementById("a")?.getAttribute("value")).toBe("bonjour");
  });

  it("writes a ticked box into the markup, and an unticked one out of it", () => {
    const root = load(`<input id="a" type="checkbox"><input id="b" type="checkbox" checked>`);
    (document.getElementById("a") as HTMLInputElement).checked = true;
    (document.getElementById("b") as HTMLInputElement).checked = false;

    const out = reparse(snapshotDocument(root));
    expect(out.getElementById("a")?.hasAttribute("checked")).toBe(true);
    // Unticking has to REMOVE the attribute, or a box the student cleared comes
    // back ticked.
    expect(out.getElementById("b")?.hasAttribute("checked")).toBe(false);
  });

  it("writes a chosen radio and clears its siblings", () => {
    const root = load(
      `<input id="a" type="radio" name="q" checked><input id="b" type="radio" name="q">`,
    );
    (document.getElementById("b") as HTMLInputElement).checked = true;

    const out = reparse(snapshotDocument(root));
    expect(out.getElementById("a")?.hasAttribute("checked")).toBe(false);
    expect(out.getElementById("b")?.hasAttribute("checked")).toBe(true);
  });

  it("writes a textarea's value as its text content", () => {
    // A textarea has no value attribute. Its content IS its default value, so
    // that is where the typed text has to go.
    const root = load(`<textarea id="a"></textarea>`);
    (document.getElementById("a") as HTMLTextAreaElement).value = "ma réponse";

    const out = reparse(snapshotDocument(root));
    expect((out.getElementById("a") as HTMLTextAreaElement).value).toBe("ma réponse");
  });

  it("writes the chosen option of a select", () => {
    const root = load(
      `<select id="a"><option value="1">un</option><option value="2">deux</option></select>`,
    );
    (document.getElementById("a") as HTMLSelectElement).value = "2";

    const out = reparse(snapshotDocument(root));
    expect((out.getElementById("a") as HTMLSelectElement).value).toBe("2");
  });

  it("writes every chosen option of a multiple select", () => {
    const root = load(
      `<select id="a" multiple><option value="1">un</option><option value="2">deux</option><option value="3">trois</option></select>`,
    );
    const select = document.getElementById("a") as HTMLSelectElement;
    select.options[0].selected = true;
    select.options[2].selected = true;

    const out = reparse(snapshotDocument(root));
    const options = (out.getElementById("a") as HTMLSelectElement).options;
    expect(options[0].hasAttribute("selected")).toBe(true);
    expect(options[1].hasAttribute("selected")).toBe(false);
    expect(options[2].hasAttribute("selected")).toBe(true);
  });

  it("keeps whatever the page's own JavaScript put in the DOM", () => {
    // This is the whole reason a version is a snapshot and not an answer set.
    // Drag-and-drop results, generated question lists and div-based pickers are
    // all DOM by the time Save is pressed.
    const root = load(`<div id="drop" class="filled"><span>chat</span></div>`);

    const out = reparse(snapshotDocument(root));
    expect(out.getElementById("drop")?.className).toBe("filled");
    expect(out.getElementById("drop")?.textContent).toBe("chat");
  });

  it("keeps contenteditable content, which costs it nothing", () => {
    const root = load(`<div id="a" contenteditable="true"><b>gras</b></div>`);

    const out = reparse(snapshotDocument(root));
    expect(out.getElementById("a")?.innerHTML).toBe("<b>gras</b>");
  });

  it("strips every script, including the bootstrap that called it", () => {
    // A stored version contains no code of ours — the same discipline that
    // keeps the print listener out of the admin's <a download>. And it is what
    // makes a version DETERMINISTIC: a snapshot that re-runs its own init code
    // silently wipes everything on a document that rebuilds the DOM on load.
    const root = load(`<p>gardé</p><script>window.x = 1</script>`);

    const out = reparse(snapshotDocument(root));
    expect(out.querySelectorAll("script")).toHaveLength(0);
    expect(out.querySelector("p")?.textContent).toBe("gardé");
  });

  it("leaves the live document untouched", () => {
    // It also renders what the student is looking at. Writing attributes onto
    // the live tree would be visible mid-save.
    const root = load(`<input id="a" type="text">`);
    (document.getElementById("a") as HTMLInputElement).value = "bonjour";

    snapshotDocument(root);
    expect(document.getElementById("a")?.hasAttribute("value")).toBe(false);
  });

  it("emits a doctype, so the result parses in standards mode", () => {
    expect(snapshotDocument(load("<p>x</p>")).startsWith("<!doctype html>")).toBe(true);
  });

  it("survives a document with no form controls at all", () => {
    const out = reparse(snapshotDocument(load("<p>Bonjour</p>")));
    expect(out.querySelector("p")?.textContent).toBe("Bonjour");
  });

  it("round-trips through toString(), which is how it reaches the browser", () => {
    // lib/printable-bootstrap.ts inlines this function's SOURCE. If the
    // compiler ever emits something that closes over module scope, this fails
    // here rather than silently in a student's browser.
    const root = load(`<input id="a" type="text">`);
    (document.getElementById("a") as HTMLInputElement).value = "bonjour";

    const inlined = new Function(
      "root",
      `return (${snapshotDocument.toString()})(root);`,
    ) as (root: Element) => string;

    expect(inlined(root)).toBe(snapshotDocument(root));
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `npx vitest run tests/lib/snapshot-dom.test.ts`
Expected: FAIL — cannot find module `@/lib/snapshot-dom`.

- [ ] **Step 4: Write the implementation**

```ts
// lib/snapshot-dom.ts

// SELF-CONTAINED BY REQUIREMENT, NOT BY STYLE.
//
// lib/printable-bootstrap.ts inlines this function's source into a <script>
// with Function.prototype.toString(), the technique Playwright uses for
// page.evaluate. So it may not import anything, may not close over module
// scope, and may not use syntax the compiler turns into a helper call. It is
// written in the same ES5 idiom as the two bootstraps beside it so that the
// emitted source is predictable — and tests/lib/snapshot-dom.test.ts runs the
// toString() output, so a compiler change that broke this fails in CI rather
// than in a student's browser.
//
// It returns a document that is INERT but still TYPEABLE. Every <script> is
// removed, including the bootstrap that called this — a stored version carries
// no code of ours, the same discipline that keeps the print listener out of the
// admin's <a download>. Text fields, checkboxes and :checked CSS keep working
// because they are browser behaviour rather than JavaScript, which is what lets
// Jenn open a student's version and type her corrections into it.
//
// Keeping the scripts was considered and refused: it restores perfectly on a
// document whose JavaScript only wires event handlers, and SILENTLY WIPES
// EVERYTHING on one that rebuilds the DOM on load. Deterministic and degraded
// beats sometimes-perfect.
export function snapshotDocument(root: Element): string {
  var live = root.querySelectorAll("*");
  var clone = root.cloneNode(true) as Element;
  // A static NodeList, so replacing a canvas below cannot shift these indices.
  var copy = clone.querySelectorAll("*");
  // Lockstep, and it holds because the copy is a deep clone taken a moment ago
  // and nothing has mutated either since — the same argument settle() makes.
  var n = Math.min(live.length, copy.length);

  for (var i = 0; i < n; i++) {
    // `any` because this function is compiled for two worlds: the type checker
    // here and a browser that has never heard of TypeScript.
    var from = live[i] as any;
    var to = copy[i] as any;
    var tag = from.tagName;

    if (tag === "INPUT") {
      var type = String(from.type || "").toLowerCase();
      if (type === "checkbox" || type === "radio") {
        // Removing matters as much as setting: a box the student CLEARED would
        // otherwise come back ticked from the markup's own attribute.
        if (from.checked) to.setAttribute("checked", "");
        else to.removeAttribute("checked");
      } else if (type !== "file" && type !== "password") {
        // A file input's value cannot be restored and a password has no place
        // in a stored worksheet. Everything else reflects into the attribute,
        // which is the default value a fresh parse reads.
        to.setAttribute("value", from.value == null ? "" : String(from.value));
      }
    } else if (tag === "TEXTAREA") {
      // A textarea has no value attribute; its content is its default value.
      to.textContent = from.value == null ? "" : String(from.value);
    } else if (tag === "OPTION") {
      // Options rather than selects, so `multiple` needs no separate branch.
      if (from.selected) to.setAttribute("selected", "");
      else to.removeAttribute("selected");
    } else if (tag === "CANVAS") {
      // Pixels do not serialise. A canvas becomes a picture of itself, which is
      // what makes a drawing widget worth saving at all.
      var data = "";
      try {
        data = from.toDataURL("image/png");
      } catch (e) {
        // A tainted canvas throws. That element is left as an empty canvas and
        // the rest of the snapshot is saved: one blank box beats losing the
        // page.
        data = "";
      }
      if (data && to.parentNode) {
        var img = (to.ownerDocument as Document).createElement("img");
        img.setAttribute("src", data);
        img.setAttribute("width", String(from.width));
        img.setAttribute("height", String(from.height));
        var cls = to.getAttribute("class");
        if (cls) img.setAttribute("class", cls);
        var style = to.getAttribute("style");
        if (style) img.setAttribute("style", style);
        to.parentNode.replaceChild(img, to);
      }
    }
  }

  var scripts = clone.querySelectorAll("script");
  for (var j = 0; j < scripts.length; j++) {
    var script = scripts[j];
    if (script.parentNode) script.parentNode.removeChild(script);
  }

  return "<!doctype html>" + clone.outerHTML;
}
```

- [ ] **Step 5: Run it and watch it pass**

Run: `npx vitest run tests/lib/snapshot-dom.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 6: Run the whole suite and the type checker**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all pass. If ESLint objects to `var` or to `as any`, add a file-scoped disable with a comment naming the toString() requirement — do **not** rewrite the function into modern syntax.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json lib/snapshot-dom.ts tests/lib/snapshot-dom.test.ts
git commit -m "Photograph a filled-in worksheet as inert, typeable HTML"
```

---

### Task 7: The third bootstrap

**Files:**
- Modify: `lib/printable-bootstrap.ts`
- Test: `tests/lib/printable-bootstrap.test.ts`

**Interfaces:**
- Consumes: `snapshotDocument` from `@/lib/snapshot-dom`, `MAX_SNAPSHOT_BYTES` from `@/lib/page-snapshot`.
- Produces: `SNAPSHOT_MESSAGE: "snapshot-page"`, `withSnapshotBootstrap(html: string): string`. The frame replies with `{ type: SNAPSHOT_MESSAGE, ok: true, html: string }` or `{ type: SNAPSHOT_MESSAGE, ok: false, reason: "too-large" | "failed" }`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/lib/printable-bootstrap.test.ts`, and extend the existing `"the two bootstraps are independent"` block to three:

```ts
import {
  SNAPSHOT_MESSAGE,
  withSnapshotBootstrap,
} from "@/lib/printable-bootstrap";

describe("withSnapshotBootstrap", () => {
  it("leaves the teacher's document byte-identical and appends after it", () => {
    expect(withSnapshotBootstrap(DOC).startsWith(DOC)).toBe(true);
  });

  it("authenticates the sender by window, not by origin", () => {
    expect(withSnapshotBootstrap(DOC)).toContain("event.source !== window.parent");
  });

  it("listens for exactly the message the shell sends", () => {
    expect(withSnapshotBootstrap(DOC)).toContain(JSON.stringify(SNAPSHOT_MESSAGE));
  });

  it("carries the walk itself, not a call to a module it cannot reach", () => {
    // The frame has no module system and no import map. If this ever stops
    // being the function's own source, the save fails in the browser only.
    expect(withSnapshotBootstrap(DOC)).toContain("querySelectorAll(\"script\")");
  });

  it("refuses an over-large snapshot before posting it", () => {
    // So the failure is a sentence rather than a raw 413 that Next never sees.
    expect(withSnapshotBootstrap(DOC)).toContain(String(MAX_SNAPSHOT_BYTES));
    expect(withSnapshotBootstrap(DOC)).toContain("too-large");
  });

  it("always replies, so a failure is never silence", () => {
    // This INVERTS captureHtmlThumbnail's contract beside it, and the inversion
    // is the point: a missing preview leaves a working iframe, a silent save
    // loses a student's homework.
    expect(withSnapshotBootstrap(DOC)).toContain("ok: false");
  });

  it("works on a document with no body tag to splice into", () => {
    const result = withSnapshotBootstrap("<p>fragment</p>");
    expect(result).toContain("<p>fragment</p>");
    expect(result).toContain(JSON.stringify(SNAPSHOT_MESSAGE));
  });
});

describe("the three bootstraps are mutually exclusive", () => {
  // No gate implies another. The admin's <a download> hits the raw route with
  // no parameter at all and has to get Jenn's bytes back; a print must not
  // carry a capture or snapshot listener, and a snapshot must not carry a print
  // one — they are separate listeners on one message channel, and a document
  // holding two would answer a message it was never sent.
  it("keeps the snapshot listener out of the other two", () => {
    expect(withPrintableBootstrap(DOC)).not.toContain(JSON.stringify(SNAPSHOT_MESSAGE));
    expect(withCaptureBootstrap(DOC)).not.toContain(JSON.stringify(SNAPSHOT_MESSAGE));
  });

  it("keeps the other two out of the snapshot bootstrap", () => {
    expect(withSnapshotBootstrap(DOC)).not.toContain(JSON.stringify(PRINT_MESSAGE));
    expect(withSnapshotBootstrap(DOC)).not.toContain(JSON.stringify(CAPTURE_MESSAGE));
    expect(withSnapshotBootstrap(DOC)).not.toContain("window.print()");
    expect(withSnapshotBootstrap(DOC)).not.toContain("foreignObject");
  });

  it("uses three different messages", () => {
    expect(new Set([PRINT_MESSAGE, CAPTURE_MESSAGE, SNAPSHOT_MESSAGE]).size).toBe(3);
  });
});
```

Add `MAX_SNAPSHOT_BYTES` to that file's imports from `@/lib/page-snapshot`.

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run tests/lib/printable-bootstrap.test.ts`
Expected: FAIL — `withSnapshotBootstrap` is not exported.

- [ ] **Step 3: Write the implementation**

Append to `lib/printable-bootstrap.ts`:

```ts
import { MAX_SNAPSHOT_BYTES } from "@/lib/page-snapshot";
import { snapshotDocument } from "@/lib/snapshot-dom";

export const SNAPSHOT_MESSAGE = "snapshot-page";

// The third injection, and the same gate rule as the other two: only the
// worksheet shell asks for ?snapshot=1, and none of the three implies another.
//
// The walk lives in lib/snapshot-dom.ts and is inlined here by its own source —
// the technique Playwright uses for page.evaluate. That is not cleverness for
// its own sake: it is ~80 lines of DOM traversal whose failure mode is a
// student's homework saved silently wrong, and a string in this file can only
// be tested for what it CONTAINS. As a module it is tested for what it DOES,
// against real DOM fixtures, including a test that runs this very toString()
// output. The alternative — a hand-maintained second copy in here — is two
// implementations of one rule, which is the drift this codebase keeps
// designing against.
//
// It replies ALWAYS, which inverts the contract of the capture bootstrap above
// it. That one answers null on every failure because a missing preview leaves a
// working iframe in place; a silent save loses a student's homework.
const SNAPSHOT_BOOTSTRAP = `<script>
(function () {
  var MESSAGE = ${JSON.stringify(SNAPSHOT_MESSAGE)};
  var MAX_BYTES = ${MAX_SNAPSHOT_BYTES};
  var snapshotDocument = ${snapshotDocument.toString()};

  function reply(payload) {
    try {
      window.parent.postMessage(payload, "*");
    } catch (e) {}
  }

  addEventListener("message", function (event) {
    // event.source, not event.origin — this document has an opaque origin and
    // no origin string to compare against. Which window is asking is the
    // precise question, and the sandbox forbids popups, so no other window can
    // obtain a handle to post through.
    if (event.source !== window.parent) return;
    if (event.data !== MESSAGE) return;

    try {
      var html = snapshotDocument(document.documentElement);
      // Measured here rather than server-side alone, so an over-large save is a
      // sentence in the shell instead of a raw 413 nginx returns and Next never
      // sees.
      if (new TextEncoder().encode(html).length > MAX_BYTES) {
        reply({ type: MESSAGE, ok: false, reason: "too-large" });
        return;
      }
      reply({ type: MESSAGE, ok: true, html: html });
    } catch (e) {
      // Nothing may throw out of here. A thrown error inside the frame is
      // invisible to the parent, and here that would cost a student their work
      // with no explanation.
      reply({ type: MESSAGE, ok: false, reason: "failed" });
    }
  });
})();
</script>`;

// Appended, for the reason withPrintableBootstrap is.
export function withSnapshotBootstrap(html: string): string {
  return `${html}\n${SNAPSHOT_BOOTSTRAP}\n`;
}
```

- [ ] **Step 4: Run them and watch them pass**

Run: `npx vitest run tests/lib/printable-bootstrap.test.ts`
Expected: PASS — the existing tests plus 10 new ones.

- [ ] **Step 5: Verify the inlined source is not broken by the bundler**

Run: `npm run build`
Expected: PASS. Then confirm the emitted route source still carries the function body rather than a reference:

```bash
grep -rl "querySelectorAll(\"script\")" .next/server | head -3
```
Expected: at least one match. If there is none, the bundler has transformed the function — stop and report it rather than working around it; the fallback in the spec is a hand-written string, and that is a decision, not a fix.

- [ ] **Step 6: Commit**

```bash
git add lib/printable-bootstrap.ts tests/lib/printable-bootstrap.test.ts
git commit -m "Serve a worksheet that can photograph itself"
```

---

### Task 8: Schema and migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_worksheet_versions/migration.sql` (generated)

**Interfaces:**
- Consumes: nothing.
- Produces: `Page.worksheet: boolean`, `Page.versions`, and the `PageVersion` model with fields `id, pageId, groupId, fromTeacher, kind, snapshot, pdf, pdfSize, createdAt, updatedAt`.

- [ ] **Step 1: Add `worksheet` to `Page`**

Inside `model Page`, beside `addedByStudent`:

```prisma
  // Jenn's tick: students may save their answers to this page. Only an html or
  // pdf row can carry it — a link has nothing to fill in, and worksheetOpenable
  // refuses one regardless of this column.
  //
  // Written by updatePageMeta and NOT by savePage, for the reason
  // addedByStudent is absent from savePage's update branch: it is metadata
  // rather than content, so re-flagging must not read and rewrite 3 MB, and a
  // republish at the same slug has to keep it.
  worksheet Boolean @default(false)
  versions  PageVersion[]
```

- [ ] **Step 2: Add `PageVersion` and the back-relation on `Group`**

Add to `model Group`, beside `pins`:

```prisma
  versions  PageVersion[]
```

And the model, after `PagePin`:

```prisma
// A student's attempt at a worksheet, or Jenn's correction of one. The blank is
// not in here: it is Page.html or Page.pdf, which makes three versions out of
// two rows.
//
// NOT a Page row with a parent pointer, which is the obvious model and is
// wrong: /p/[slug] is public and a slug is derived from a title, so that would
// publish a named student's homework to anyone who tried "devoir-3-marie". A
// version is reachable only from a gated route under /g/[slug]/.
model PageVersion {
  id      String @id @default(cuid())
  pageId  String
  groupId String
  page    Page   @relation(fields: [pageId], references: [id], onDelete: Cascade)
  group   Group  @relation(fields: [groupId], references: [id], onDelete: Cascade)

  // Who saved it. A boolean for the reason Message.fromTeacher is one: there
  // are exactly two participants and one of them has no row to point at.
  fromTeacher Boolean

  // "html" | "pdf", copied from the page at save time and deliberately NOT read
  // back through the relation. savePage lets an html page be replaced by a pdf
  // at the same slug, which would silently retype every version already saved.
  // lib/page-version-kind.ts narrows it.
  kind String

  // Exactly one branch is populated, mirroring Page's own three content
  // columns. The html one is brotli-compressed and the pdf one is not: a 500 KB
  // artifact stores at 40-70 KB, and without that this table becomes the
  // largest thing in a file the nightly VACUUM INTO copies whole — while a PDF
  // is already compressed, so brotli would spend CPU to grow it.
  snapshot Bytes?
  pdf      Bytes?
  pdfSize  Int?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  // THIS IS THE THREE-SLOT RULE, enforced by the database rather than by a
  // convention inside an action. A save is an upsert against it; there is no
  // counting, no pruning, and no way for a fourth row to exist.
  @@unique([pageId, groupId, fromTeacher])
}
```

- [ ] **Step 3: Generate and apply the migration**

Run:
```bash
npx prisma migrate dev --name worksheet_versions
npx prisma generate
```

- [ ] **Step 4: Read the generated SQL before trusting it**

Run: `cat prisma/migrations/*worksheet_versions/migration.sql`

Expected: a `CREATE TABLE "PageVersion"`, a `CREATE UNIQUE INDEX` on the three columns, and an `ALTER TABLE "Page" ADD COLUMN "worksheet" BOOLEAN NOT NULL DEFAULT false`.

**There must be no `INSERT ... SELECT` and no table rebuild of `Page`.** This codebase has been bitten once: Prisma read a column rename as a drop plus an add and generated an `INSERT ... SELECT` carrying neither column, which would have discarded every stored preview with a green migration. If a rebuild appears here, edit the SQL by hand to preserve every column.

- [ ] **Step 5: Verify the client types**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "Give a page up to two saved versions per student"
```

---

### Task 9: The version store

**Files:**
- Create: `lib/version-store.ts`

**Interfaces:**
- Consumes: `prisma`, `packSnapshot`/`unpackSnapshot`, `readVersionKind`.
- Produces:
  - `type StoredVersion = { fromTeacher: boolean; kind: VersionKind; updatedAt: Date }`
  - `listVersions(pageId: string, groupId: string): Promise<StoredVersion[]>`
  - `listShelfVersions(groupId: string): Promise<ShelfVersion[]>`
  - `getVersionHtml(pageId: string, groupId: string, fromTeacher: boolean): Promise<string | null>`
  - `getVersionPdf(pageId: string, groupId: string, fromTeacher: boolean): Promise<Uint8Array | null>`
  - `saveHtmlVersion(input: { pageId: string; groupId: string; fromTeacher: boolean; html: string }): Promise<void>`
  - `savePdfVersion(input: { pageId: string; groupId: string; fromTeacher: boolean; pdf: Uint8Array }): Promise<void>`

Prisma access, so no unit test — the modules underneath it (Task 3, Task 5, Task 1) carry the rules.

- [ ] **Step 1: Write the module**

```ts
// lib/version-store.ts
import { prisma } from "@/lib/prisma";
import { packSnapshot, unpackSnapshot } from "@/lib/snapshot-codec";
import { readVersionKind, type VersionKind } from "@/lib/page-version-kind";
import type { ShelfVersion } from "@/lib/page-versions";

export type StoredVersion = {
  fromTeacher: boolean;
  kind: VersionKind;
  updatedAt: Date;
};

// Neither blob is ever selected here, for the reason SHELF_SELECT omits `html`
// and `pdf`: one holds a whole document and the other a whole file, and loading
// either to list what exists ships the thing the list was avoiding.
const SUMMARY = {
  fromTeacher: true,
  kind: true,
  pdfSize: true,
  updatedAt: true,
} as const;

export async function listVersions(
  pageId: string,
  groupId: string,
): Promise<StoredVersion[]> {
  const rows = await prisma.pageVersion.findMany({
    where: { pageId, groupId },
    select: SUMMARY,
  });

  return rows.map((row) => ({
    fromTeacher: row.fromTeacher,
    kind: readVersionKind(row),
    updatedAt: row.updatedAt,
  }));
}

// One shelf's versions across every page on it, for applyVersions. One query
// beside the pins query, not one per tile.
export async function listShelfVersions(groupId: string): Promise<ShelfVersion[]> {
  return prisma.pageVersion.findMany({
    where: { groupId },
    select: { pageId: true, fromTeacher: true, updatedAt: true },
  });
}

export async function getVersionHtml(
  pageId: string,
  groupId: string,
  fromTeacher: boolean,
): Promise<string | null> {
  const row = await prisma.pageVersion.findUnique({
    where: { pageId_groupId_fromTeacher: { pageId, groupId, fromTeacher } },
    select: { snapshot: true },
  });
  if (!row?.snapshot) return null;
  return unpackSnapshot(new Uint8Array(row.snapshot));
}

// Its own query, and the only one that selects `pdf` — same reasoning as
// getPagePdf's: a caller reaching for a list must not be able to pull 3 MB per
// row by forgetting which helper it called.
export async function getVersionPdf(
  pageId: string,
  groupId: string,
  fromTeacher: boolean,
): Promise<Uint8Array | null> {
  const row = await prisma.pageVersion.findUnique({
    where: { pageId_groupId_fromTeacher: { pageId, groupId, fromTeacher } },
    select: { pdf: true },
  });
  if (!row?.pdf) return null;
  return new Uint8Array(row.pdf);
}

// Every content column on every write, all but one to null — savePage's flat
// invariant, and it matters here for the same reason: a kind changed at the
// same slug must never leave the other kind's bytes behind for readVersionKind
// to choose between.
export async function saveHtmlVersion(input: {
  pageId: string;
  groupId: string;
  fromTeacher: boolean;
  html: string;
}): Promise<void> {
  const snapshot = Buffer.from(await packSnapshot(input.html));
  const columns = { kind: "html", snapshot, pdf: null, pdfSize: null };

  await prisma.pageVersion.upsert({
    where: {
      pageId_groupId_fromTeacher: {
        pageId: input.pageId,
        groupId: input.groupId,
        fromTeacher: input.fromTeacher,
      },
    },
    create: {
      pageId: input.pageId,
      groupId: input.groupId,
      fromTeacher: input.fromTeacher,
      ...columns,
    },
    update: columns,
  });
}

export async function savePdfVersion(input: {
  pageId: string;
  groupId: string;
  fromTeacher: boolean;
  pdf: Uint8Array;
}): Promise<void> {
  const columns = {
    kind: "pdf",
    snapshot: null,
    // Buffer on the way in, matching how savePage and Passkey.publicKey write
    // bytes.
    pdf: Buffer.from(input.pdf),
    pdfSize: input.pdf.byteLength,
  };

  await prisma.pageVersion.upsert({
    where: {
      pageId_groupId_fromTeacher: {
        pageId: input.pageId,
        groupId: input.groupId,
        fromTeacher: input.fromTeacher,
      },
    },
    create: {
      pageId: input.pageId,
      groupId: input.groupId,
      fromTeacher: input.fromTeacher,
      ...columns,
    },
    update: columns,
  });
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add lib/version-store.ts
git commit -m "Read and write a version's bytes, and nothing else"
```

---

### Task 10: `pageTarget` learns the worksheet route

**Files:**
- Modify: `lib/page-target.ts`
- Test: `tests/lib/page-target.test.ts`

**Interfaces:**
- Produces: `pageTarget(page: { kind: PageKind; slug: string; url: string | null; worksheet?: boolean }, groupSlug?: string | null): PageTarget` — signature change, second parameter optional so every existing call site keeps compiling.

- [ ] **Step 1: Write the failing tests**

Append to `tests/lib/page-target.test.ts`:

```ts
describe("a worksheet", () => {
  const sheet = { kind: "html" as const, slug: "devoir-3", url: null, worksheet: true };

  it("goes to the student's own worksheet route when there is a shelf", () => {
    expect(pageTarget(sheet, "marie")).toEqual({
      href: "/g/marie/w/devoir-3",
      newTab: false,
    });
  });

  it("sends a pdf worksheet there too, so the chooser is reachable", () => {
    // A PDF has nowhere to put a save control — it opens in the browser's own
    // viewer — so the chooser is the only surface it has.
    expect(pageTarget({ ...sheet, kind: "pdf" }, "marie").href).toBe(
      "/g/marie/w/devoir-3",
    );
  });

  it("falls back to the public page with no shelf to open it on", () => {
    // "All" on the admin Pages tab is not a shelf, and /f/[token] is read-only.
    // Neither has a student whose versions could be listed.
    expect(pageTarget(sheet)).toEqual({ href: "/p/devoir-3", newTab: false });
    expect(pageTarget(sheet, null)).toEqual({ href: "/p/devoir-3", newTab: false });
  });

  it("leaves a page Jenn has not ticked exactly where it was", () => {
    expect(pageTarget({ ...sheet, worksheet: false }, "marie")).toEqual({
      href: "/p/devoir-3",
      newTab: false,
    });
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run tests/lib/page-target.test.ts`
Expected: FAIL — `pageTarget` takes one argument.

- [ ] **Step 3: Write the implementation**

```ts
// lib/page-target.ts
import type { PageKind } from "@/lib/page-kind";

export type PageTarget = { href: string; newTab: boolean };

// Both page lists render the same tile and were both about to grow the same
// three-way ternary. The rule is that only an html page opens in this tab: a
// link is off-site, and a PDF opens in a new one so the shelf a student is
// browsing stays where they left it.
//
// A worksheet overrides all of that, and it needs a group to do it — a version
// belongs to (page, student), and there is no student in a page row. So the
// worksheet destination is returned ONLY when a shelf supplied one: the admin
// Pages tab under "All" and /f/[token] pass none and keep the targets they had.
// That is the same rule the pin control already follows, and for the same
// reason — "All" is not a shelf.
export function pageTarget(
  page: {
    kind: PageKind;
    slug: string;
    url: string | null;
    worksheet?: boolean;
  },
  groupSlug?: string | null,
): PageTarget {
  if (page.worksheet && groupSlug) {
    return { href: `/g/${groupSlug}/w/${page.slug}`, newTab: false };
  }
  if (page.kind === "link") return { href: page.url ?? "#", newTab: true };
  if (page.kind === "pdf") return { href: `/p/${page.slug}/pdf`, newTab: true };
  return { href: `/p/${page.slug}`, newTab: false };
}
```

- [ ] **Step 4: Run them and watch them pass**

Run: `npx vitest run tests/lib/page-target.test.ts && npm run typecheck`
Expected: PASS, existing tests included.

- [ ] **Step 5: Commit**

```bash
git add lib/page-target.ts tests/lib/page-target.test.ts
git commit -m "Point a worksheet tile at the shelf it belongs to"
```

---

### Task 11: Shelves carry their versions

**Files:**
- Modify: `lib/pages.ts`

**Interfaces:**
- Consumes: `applyVersions` (Task 3), `listShelfVersions` (Task 9).
- Produces: `ShelfPage` and `AdminPage` gain `worksheet: boolean`; `ShelfPage` gains `versions: { fromTeacher: boolean; updatedAt: Date }[]`.

- [ ] **Step 1: Add `worksheet` to `SHELF_SELECT`**

In `lib/pages.ts`, inside `SHELF_SELECT`, after `addedByStudent`:

```ts
  // Cheap, and every tile needs it: it decides the tile's destination and
  // whether a badge can appear at all.
  worksheet: true,
```

- [ ] **Step 2: Fold versions onto the student's shelf**

In `listPagesForGroup`, add a fourth promise and a second fold:

```ts
  const [own, everyone, pins, versions] = await Promise.all([
    // …the three existing queries, unchanged…
    listShelfVersions(groupId),
  ]);

  const merged = effectivePages(own, everyone).map((page) => ({
    ...page,
    kind: readPageKind(page),
  }));

  // Pins first, then versions: applyPins is what sectionPages reads, and
  // applyVersions only adds a field neither of them looks at.
  return applyVersions(applyPins(merged, pins), versions);
```

Add the imports:

```ts
import { applyVersions } from "@/lib/page-versions";
import { listShelfVersions } from "@/lib/version-store";
```

- [ ] **Step 3: Carry `worksheet` through the admin list**

In `listPagesForAdmin`'s `return pages.map(...)`, add after `addedByStudent`:

```ts
    worksheet: page.worksheet,
```

And in `getPageForAdmin`, add `worksheet: true` to the `select` and `worksheet: page.worksheet` to the returned object.

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm test`
Expected: PASS. Consumers of `ShelfPage`/`AdminPage` compile because both gained fields rather than losing any.

- [ ] **Step 5: Commit**

```bash
git add lib/pages.ts
git commit -m "Let a shelf know which of its pages have been answered"
```

---

### Task 12: Jenn's tick

**Files:**
- Modify: `lib/pages.ts` (`updatePageMeta`), `app/page-actions.ts`, `components/admin/PageEditor.tsx`, `components/admin/PageEditOverlay.tsx` (pass-through only if it constructs `initial`)

**Interfaces:**
- Consumes: `PageEditorGroup`, `PageInput` from `app/page-actions.ts`.
- Produces: `updatePageMeta(slug, { title, groupIds, worksheet })`; `PageInput` gains `worksheet: boolean`; `PageEditor`'s `initial` gains `worksheet: boolean`.

- [ ] **Step 1: Widen `updatePageMeta`**

In `lib/pages.ts`:

```ts
export async function updatePageMeta(
  slug: string,
  input: { title: string; groupIds: string[]; worksheet: boolean },
): Promise<void> {
```

and in the `tx.page.update` call:

```ts
    await tx.page.update({
      where: { id: page.id },
      // `worksheet` is here and not in savePage, which is the same split
      // `title` already makes: it is metadata, so re-flagging must not read and
      // rewrite 3 MB of PDF, and savePage's every-content-column invariant
      // keeps no "leave this alone" hole in it. The consequence worth knowing:
      // a republish at the same slug KEEPS the flag, the way addedByStudent
      // survives an edit.
      data: { title: input.title, worksheet: input.worksheet },
    });
```

- [ ] **Step 2: Carry it through the actions**

In `app/page-actions.ts`:

- Add `worksheet: boolean` to the `PageInput` type.
- In `updatePage`, after the `saveOrExplain` call that writes the html, add a second write so the tick lands on both paths:

```ts
  // savePage does not write `worksheet` — see updatePageMeta. An html edit
  // therefore needs both calls: the document through savePage, the metadata
  // through the function that owns it.
  await updatePageMeta(slug, {
    title: input.title,
    groupIds: input.groupIds,
    worksheet: input.worksheet,
  });
```

- In `updatePdfPage`, read the checkbox out of the FormData and pass it to `updatePageMeta` in the no-new-file branch; in the new-file branch, call `updatePageMeta` after `saveOrExplain` as above:

```ts
function readWorksheet(formData: FormData): boolean {
  return formData.get("worksheet") === "on";
}
```

- In `createPage` and `createPdfPage`, pass nothing: a new page is never a worksheet until Jenn ticks it, which is the column's `@default(false)`.

- [ ] **Step 3: Add the checkbox to `PageEditor`**

In `components/admin/PageEditor.tsx`:

- Add `worksheet: boolean` to `initial`.
- Add state: `const [worksheet, setWorksheet] = useState(initial.worksheet);`
- Include `worksheet` in the `onSubmit` payload, and append `formData.append("worksheet", worksheet ? "on" : "")` on the pdf path.
- Render the control below the audience checkboxes and **only for html and pdf rows**:

```tsx
{initial.kind !== "link" && (
  <label className="flex items-start gap-2 text-sm text-[var(--card-ink)]">
    <input
      type="checkbox"
      checked={worksheet}
      onChange={(event) => setWorksheet(event.target.checked)}
      className="mt-1"
    />
    <span>
      Students can save their answers
      {/* The one sentence of explanation the control needs: the flag changes
          where the tile goes, which is not guessable from the label. */}
      <span className="block text-[var(--color-ink-muted)]">
        Opens on the student&rsquo;s own page, with a Save button and up to
        three versions.
      </span>
    </span>
  </label>
)}
```

**Not in `NewPageForm`.** There the paste — or the file choice — *is* the submit and the form has no fields at all; adding one would contradict that flow. Jenn ticks it in the edit overlay, which `tools/publish-dia-artifact.sh` already opens after a publish.

- [ ] **Step 4: Feed `initial.worksheet` from both editor hosts**

`getPageForAdmin` now returns `worksheet` (Task 11), so pass it through wherever `initial` is built — `app/admin/pages/[slug]/page.tsx` and `components/admin/PageEditOverlay.tsx`.

- [ ] **Step 5: Verify**

Run: `npm run typecheck && npm run lint && npm test && npm run build`
Expected: PASS.

- [ ] **Step 6: Verify by hand**

Run `npm run dev`, open `/admin?tab=pages`, open the pencil on an html page, tick the box, save, reopen — the box is still ticked. Rename the page and save — still ticked.

- [ ] **Step 7: Commit**

```bash
git add lib/pages.ts app/page-actions.ts components/admin/PageEditor.tsx components/admin/PageEditOverlay.tsx app/admin/pages
git commit -m "Let Jenn say which pages students may answer"
```

---

### Task 13: The shared resolve-and-authorise step

**Files:**
- Create: `lib/worksheet-context.ts`

**Interfaces:**
- Consumes: `chatRole`, `worksheetOpenable`, `readToken`, `cookieNameFor`, `getCurrentTeacher`, `readPageKind`, `prisma`.
- Produces:

```ts
export type WorksheetContext = {
  group: { id: string; name: string; slug: string };
  page: { id: string; slug: string; title: string; kind: "html" | "pdf" };
  role: "teacher" | "student";
};
export function resolveWorksheet(
  groupSlug: string,
  pageSlug: string,
): Promise<WorksheetContext | null>;
```

Prisma and cookies, so no unit test — `chatRole` and `worksheetOpenable` carry the rules and are tested in Tasks 4 and (already) `chat-access.test.ts`.

- [ ] **Step 1: Write the module**

```ts
// lib/worksheet-context.ts
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getCurrentTeacher } from "@/lib/session";
import { chatRole } from "@/lib/chat-access";
import { readToken, cookieNameFor } from "@/lib/student-tokens";
import { readPageKind } from "@/lib/page-kind";
import { worksheetOpenable } from "@/lib/worksheet-access";

export type WorksheetContext = {
  group: { id: string; name: string; slug: string };
  page: { id: string; slug: string; title: string; kind: "html" | "pdf" };
  role: "teacher" | "student";
};

// One answer for the three routes that need it, written here rather than inline
// in each for the reason chatRole gives about itself: a rule duplicated across
// three files is a rule that will eventually differ in one of them, and the
// difference would be a hole rather than a bug report.
//
// chatRole is reused VERBATIM. Its clause order is already what this needs — it
// refuses the everyone group before it checks the teacher, so neither party can
// save a version on /g/all, where there is no student for one to belong to.
export async function resolveWorksheet(
  groupSlug: string,
  pageSlug: string,
): Promise<WorksheetContext | null> {
  const group = await prisma.group.findUnique({
    where: { slug: groupSlug },
    select: { id: true, name: true, slug: true, isEveryone: true, chatToken: true },
  });
  if (!group) return null;

  const teacher = await getCurrentTeacher();
  const cookieStore = await cookies();
  const role = chatRole({
    isTeacher: Boolean(teacher),
    isEveryone: group.isEveryone,
    chatToken: group.chatToken,
    presented: readToken(
      undefined,
      cookieStore.get(cookieNameFor(group.slug))?.value,
    ),
  });

  const page = await prisma.page.findUnique({
    where: { slug: pageSlug },
    select: {
      id: true,
      slug: true,
      title: true,
      kind: true,
      url: true,
      pdfSize: true,
      worksheet: true,
      groups: {
        select: { group: { select: { id: true, isEveryone: true } } },
      },
    },
  });
  if (!page) return null;

  // The effective shelf, not the assignment list: a page shared with everyone
  // is a page this student has, and effectivePages is what makes that true on
  // the shelf itself.
  const onShelf = page.groups.some(
    (row) => row.group.id === group.id || row.group.isEveryone,
  );

  const kind = readPageKind(page);
  if (!worksheetOpenable({ role, worksheet: page.worksheet, kind, onShelf })) {
    return null;
  }
  // Narrowed by worksheetOpenable, which refuses "link" — restated here because
  // the compiler cannot follow it through a boolean.
  if (kind === "link" || !role) return null;

  return {
    group: { id: group.id, name: group.name, slug: group.slug },
    page: { id: page.id, slug: page.slug, title: page.title, kind },
    role,
  };
}
```

- [ ] **Step 2: Verify**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add lib/worksheet-context.ts
git commit -m "Answer once who may open which worksheet"
```

---

### Task 14: The raw route

**Files:**
- Create: `app/g/[slug]/w/[pageSlug]/raw/route.ts`

**Interfaces:**
- Consumes: `resolveWorksheet` (Task 13), `getVersionHtml` (Task 9), `withSnapshotBootstrap` + `withPrintableBootstrap` (Task 7), `getPageBySlug`.
- Produces: `GET` answering `?v=blank|student|teacher` with `text/html`.

- [ ] **Step 1: Write the route**

```ts
// app/g/[slug]/w/[pageSlug]/raw/route.ts
import { NextResponse } from "next/server";
import { resolveWorksheet } from "@/lib/worksheet-context";
import { getPageBySlug } from "@/lib/pages";
import { getVersionHtml } from "@/lib/version-store";
import {
  withPrintableBootstrap,
  withSnapshotBootstrap,
} from "@/lib/printable-bootstrap";

// Copied verbatim from /p/[slug]/raw, and it must stay that way. Every
// directive is restricted to what the document carries inside itself — NO https:
// ANYWHERE — because a subresource load is a real network request, and
// `img-src https:` alone would let a page exfiltrate whatever a student typed
// via <img src="https://…?d=answer">. connect-src 'none' closes fetch, XHR and
// beacon but not subresource loads, which is why the passive directives have to
// be closed too.
//
// A version contains text a student typed, and a contenteditable region
// captures as real student-authored HTML — so a student CAN get markup into a
// document Jenn later opens, and stripping <script> at capture does not close
// that, since <img onerror> survives. It is contained by the argument already
// accepted for Jenn's uploads and for student-published pages, not by a new
// one: the frame has an opaque origin, so it can read no cookie, no storage and
// no teacher session, and no directive here admits a destination to exfiltrate
// to.
const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "script-src 'unsafe-inline' 'unsafe-eval' blob:",
  "style-src 'unsafe-inline'",
  "img-src data: blob:",
  "font-src data:",
  "media-src data: blob:",
  "connect-src 'none'",
  "frame-ancestors 'self'",
  "form-action 'none'",
  "base-uri 'none'",
].join("; ");

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string; pageSlug: string }> },
) {
  const { slug, pageSlug } = await params;
  const context = await resolveWorksheet(slug, pageSlug);
  // 404 rather than 403, matching the chat route: a caller probing slugs learns
  // the same thing either way.
  if (!context || context.page.kind !== "html") {
    return new NextResponse("Not found", { status: 404 });
  }

  const asked = new URL(request.url).searchParams.get("v");

  let html: string | null;
  if (asked === "student" || asked === "teacher") {
    html = await getVersionHtml(
      context.page.id,
      context.group.id,
      asked === "teacher",
    );
  } else {
    // Anything else is the blank, including an absent parameter. A version that
    // does not exist falls back to nothing rather than to the blank: answering
    // a request for "Marie's answers" with an empty worksheet would be a
    // working feature showing the wrong thing.
    const page = await getPageBySlug(pageSlug);
    html = page?.html ?? null;
  }

  if (html === null) return new NextResponse("Not found", { status: 404 });

  // Both bootstraps, which is the one place in this codebase two are appended
  // together — and they stay independent listeners on one channel. The shell
  // needs the Save pill AND the print pill on every version, and the gate rule
  // is unchanged: only this route asks, and /p/[slug]/raw is untouched.
  const body = withSnapshotBootstrap(withPrintableBootstrap(html));

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": CONTENT_SECURITY_POLICY,
      "X-Content-Type-Options": "nosniff",
      // No ?v= cache token like /p/[slug]/raw has. That route can answer
      // `immutable` because it serves one public document; this serves one
      // named student's homework, and `private` on a shared device is not a
      // guarantee worth making.
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
```

- [ ] **Step 2: Verify the two bootstraps coexist**

This route takes **no** `printable`/`capture`/`snapshot` parameter. It injects both bootstraps unconditionally, because it is gated and only the shell reaches it — the gate that matters here is `resolveWorksheet`, not a query string. `/p/[slug]/raw` is untouched and keeps its parameters.

Run `npm run build && npm run dev`, then fetch `/g/<student slug>/w/<worksheet slug>/raw` (with the student's cookie set, or signed in as the teacher). Confirm the response ends with two `<script>` blocks, one carrying `window.print()` and the other `snapshot-page`, and that neither responds to the other's message name.

- [ ] **Step 3: Commit**

```bash
git add "app/g/[slug]/w/[pageSlug]/raw/route.ts"
git commit -m "Serve any of a worksheet's three versions, gated"
```

---

### Task 15: The pdf route

**Files:**
- Create: `app/g/[slug]/w/[pageSlug]/pdf/route.ts`

**Interfaces:**
- Consumes: `resolveWorksheet`, `getVersionPdf`, `getPagePdf`, `contentDispositionInline`, `versionLabel`.
- Produces: `GET` answering `?v=blank|student|teacher` with `application/pdf`.

- [ ] **Step 1: Write the route**

```ts
// app/g/[slug]/w/[pageSlug]/pdf/route.ts
import { NextResponse } from "next/server";
import { resolveWorksheet } from "@/lib/worksheet-context";
import { getPagePdf } from "@/lib/pages";
import { getVersionPdf } from "@/lib/version-store";
import { contentDispositionInline } from "@/lib/pdf-filename";
import { versionLabel, type VersionSlot } from "@/lib/version-labels";

function readSlot(value: string | null): VersionSlot {
  if (value === "student" || value === "teacher") return value;
  return "blank";
}

// The gated mirror of /p/[slug]/pdf, with its headers copied rather than
// reinvented. There is deliberately NO Content-Security-Policy, for the reason
// that route records: a CSP on a PDF response constrains the browser's own
// viewer, and a directive that breaks PDFium renders a blank frame
// indistinguishable from a broken upload.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string; pageSlug: string }> },
) {
  const { slug, pageSlug } = await params;
  const context = await resolveWorksheet(slug, pageSlug);
  if (!context || context.page.kind !== "pdf") {
    return new NextResponse("Not found", { status: 404 });
  }

  const slot = readSlot(new URL(request.url).searchParams.get("v"));

  let bytes: Uint8Array | null;
  if (slot === "blank") {
    const page = await getPagePdf(pageSlug);
    bytes = page?.pdf ? new Uint8Array(page.pdf) : null;
  } else {
    bytes = await getVersionPdf(
      context.page.id,
      context.group.id,
      slot === "teacher",
    );
  }
  if (!bytes) return new NextResponse("Not found", { status: 404 });

  // The label goes into the FILENAME, so three downloads are three files rather
  // than three copies of one name. contentDispositionInline is what makes that
  // safe: a title reaching a response header is where a `"` ends the quoted form
  // early and a CR or LF is header injection.
  const filename = `${context.page.title} — ${versionLabel(
    slot,
    context.role === "teacher" ? "teacher" : "student",
    context.group.name,
  )}`;

  return new NextResponse(bytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": contentDispositionInline(filename, context.page.slug),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
```

- [ ] **Step 2: Verify**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add "app/g/[slug]/w/[pageSlug]/pdf/route.ts"
git commit -m "Open a pdf version in the browser's own viewer"
```

---

### Task 16: The chat sentence

**Files:**
- Create: `lib/version-notice.ts`
- Test: `tests/lib/version-notice.test.ts`

**Interfaces:**
- Produces: `versionNotice(title: string, fromTeacher: boolean): string`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { versionNotice } from "@/lib/version-notice";

describe("versionNotice", () => {
  it("says what the student did, in the student's own voice", () => {
    // It is posted AS the student — fromTeacher false — so it has to read like
    // something they would have typed, not like a system banner.
    expect(versionNotice("Devoir 3", false)).toBe(
      "« Devoir 3 » : mes réponses sont enregistrées.",
    );
  });

  it("says what Jenn did", () => {
    expect(versionNotice("Devoir 3", true)).toBe("J'ai corrigé « Devoir 3 ».");
  });

  it("is French on both sides, because both land in the student's chat", () => {
    // The one place the English/French split does NOT apply by audience: the
    // teacher inbox renders the same message the student reads.
    expect(versionNotice("Devoir 3", true)).not.toMatch(/[Ii] corrected/);
  });

  it("carries a title with quotes in it without breaking", () => {
    expect(versionNotice('Le "grand" test', false)).toContain('Le "grand" test');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/lib/version-notice.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write the implementation**

```ts
// lib/version-notice.ts

// The line a save posts into that student's conversation. It rides the existing
// unread dot and SSE stream, so it arrives wherever each party already looks and
// costs no new notification model.
//
// French on BOTH sides, which is the one place this codebase's English-for-Jenn
// split does not apply: the teacher inbox renders the same message the student
// reads, so there is one text and it belongs to the student's language.
//
// Posted as the party who saved — fromTeacher mirrors the slot — so the line
// reads as something they said rather than as a system banner.
export function versionNotice(title: string, fromTeacher: boolean): string {
  return fromTeacher
    ? `J'ai corrigé « ${title} ».`
    : `« ${title} » : mes réponses sont enregistrées.`;
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run tests/lib/version-notice.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/version-notice.ts tests/lib/version-notice.test.ts
git commit -m "Say in the chat that a version was saved"
```

---

### Task 17: The save route

**Files:**
- Create: `app/api/worksheets/[slug]/[pageSlug]/route.ts`

**Interfaces:**
- Consumes: `resolveWorksheet`, `validateSnapshot`, `MAX_SNAPSHOT_BYTES`, `saveHtmlVersion`, `savePdfVersion`, `validatePagePdf`, `readBoundedBody`, `createMessage`, `versionNotice`.
- Produces: `POST` returning `204` on success, `400` with a plain-text reason on a rejected payload, `404` on a refused caller.

- [ ] **Step 1: Write the route**

```ts
// app/api/worksheets/[slug]/[pageSlug]/route.ts
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { resolveWorksheet } from "@/lib/worksheet-context";
import { readBoundedBody } from "@/lib/bounded-body";
import { MAX_SNAPSHOT_BYTES, validateSnapshot } from "@/lib/page-snapshot";
import { validatePagePdf } from "@/lib/page-pdf";
import { saveHtmlVersion, savePdfVersion } from "@/lib/version-store";
import { createMessage } from "@/lib/messages";
import { versionNotice } from "@/lib/version-notice";

// Room for JSON syntax and multi-byte UTF-8 around a snapshot already capped at
// MAX_SNAPSHOT_BYTES, the way MAX_CHAT_BYTES is sized around a message.
const MAX_BODY_BYTES = MAX_SNAPSHOT_BYTES + 64 * 1024;

// A POST route and NOT a server action. Server actions cap request bodies at
// 1 MB by default, and raising that limit globally to serve one feature is
// worse than a scoped route that counts bytes as they arrive.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string; pageSlug: string }> },
) {
  const { slug, pageSlug } = await params;
  const context = await resolveWorksheet(slug, pageSlug);
  if (!context) return new NextResponse("Not found", { status: 404 });

  // Save always writes to the CALLER'S OWN slot, from whatever version they
  // were looking at. One rule, no modes: a student who opens Jenn's correction,
  // fixes their mistakes and saves writes their own version. There is nothing
  // in the request that says which slot, so there is nothing to forge.
  const fromTeacher = context.role === "teacher";

  if (context.page.kind === "pdf") {
    const form = await request.formData();
    const file = form.get("pdf");
    if (!(file instanceof File)) {
      return new NextResponse("A PDF file is required.", { status: 400 });
    }
    // Bytes as a File in FormData, exactly as addShelfPdf takes them: base64
    // costs a third more, and 3 MB of PDF would arrive as 4 MB against nginx's
    // 4 MB limit.
    const checked = validatePagePdf(new Uint8Array(await file.arrayBuffer()));
    if (!checked.ok) return new NextResponse(checked.error, { status: 400 });

    await savePdfVersion({
      pageId: context.page.id,
      groupId: context.group.id,
      fromTeacher,
      pdf: checked.bytes,
    });
  } else {
    const text = await readBoundedBody(request, MAX_BODY_BYTES);
    if (text === null) return new NextResponse("That page is too large.", { status: 400 });

    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      return new NextResponse("Bad request", { status: 400 });
    }

    const checked = validateSnapshot(
      (payload as { html?: unknown } | null)?.html ?? null,
    );
    if (!checked.ok) return new NextResponse(checked.error, { status: 400 });

    await saveHtmlVersion({
      pageId: context.page.id,
      groupId: context.group.id,
      fromTeacher,
      html: checked.html,
    });
  }

  // After the write, never before — the ordering rule createMessage states
  // about chatBus.publish, and the contract addChatLinks has: a notification
  // that fails must not cost the homework it was announcing.
  //
  // The everyone group needs no clause: chatRole refused it inside
  // resolveWorksheet, before it checked anything else.
  try {
    await createMessage(
      context.group.id,
      fromTeacher,
      versionNotice(context.page.title, fromTeacher),
    );
  } catch {
    // Deliberately swallowed, for the reason above.
  }

  // The shelf's badge and the chooser both read the version list.
  revalidatePath("/g/[slug]", "page");

  return new NextResponse(null, { status: 204 });
}
```

- [ ] **Step 2: Verify**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add "app/api/worksheets/[slug]/[pageSlug]/route.ts"
git commit -m "Save a version into the caller's own slot"
```

---

### Task 18: The worksheet shell

**Files:**
- Create: `app/g/[slug]/w/[pageSlug]/page.tsx`, `components/worksheet/WorksheetShell.tsx`, `components/worksheet/SaveVersionButton.tsx`

**Interfaces:**
- Consumes: `resolveWorksheet`, `listVersions`, `versionLabel`, `slotForVersion`, `SNAPSHOT_MESSAGE`, `studentGate`.
- Produces: `WorksheetShell` (client) taking `{ groupSlug, pageSlug, title, audience, studentName, slot, slots }`.

- [ ] **Step 1: Write the server component**

```tsx
// app/g/[slug]/w/[pageSlug]/page.tsx
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getCurrentTeacher } from "@/lib/session";
import { studentGate } from "@/lib/student-gate";
import { readToken, cookieNameFor } from "@/lib/student-tokens";
import { resolveWorksheet } from "@/lib/worksheet-context";
import { listVersions } from "@/lib/version-store";
import { slotForVersion, type VersionSlot } from "@/lib/version-labels";
import { WorksheetShell } from "@/components/worksheet/WorksheetShell";

export const metadata: Metadata = {
  // Nothing behind a token should ever reach an index.
  robots: { index: false, follow: false },
};

function readSlot(value: string | undefined): VersionSlot {
  if (value === "student" || value === "teacher") return value;
  return "blank";
}

export default async function WorksheetPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; pageSlug: string }>;
  searchParams: Promise<{ v?: string }>;
}) {
  const { slug, pageSlug } = await params;
  const { v } = await searchParams;

  const context = await resolveWorksheet(slug, pageSlug);
  if (!context) notFound();

  // The shell asks for MORE than chatRole: a student must be `unlocked`, so an
  // invite-holder who has not signed up yet cannot file work. The routes below
  // it keep chatRole alone, matching the chat exactly.
  if (context.role === "student") {
    const group = await prisma.group.findUnique({
      where: { id: context.group.id },
      select: { isEveryone: true, chatToken: true, passwordHash: true },
    });
    const presented = readToken(
      undefined,
      (await cookies()).get(cookieNameFor(slug))?.value,
    );
    const gate = studentGate({
      isTeacher: Boolean(await getCurrentTeacher()),
      isEveryone: group?.isEveryone ?? false,
      chatToken: group?.chatToken ?? null,
      presented,
      claimed: group?.passwordHash != null,
    });
    if (gate !== "signed-in") redirect(`/g/${slug}?tab=files`);
  }

  // A pdf worksheet has no shell: it opens in the browser's own viewer, where
  // there is nowhere to put a control. The chooser on the shelf is its only
  // surface, so a direct hit here goes straight to the document.
  //
  // Before listVersions, not after: the redirect needs none of them.
  if (context.page.kind === "pdf") {
    redirect(`/g/${slug}/w/${pageSlug}/pdf?v=${readSlot(v)}`);
  }

  const versions = await listVersions(context.page.id, context.group.id);
  const slots: VersionSlot[] = [
    "blank",
    ...versions.map((version) => slotForVersion(version.fromTeacher)),
  ];

  return (
    <WorksheetShell
      groupSlug={slug}
      pageSlug={pageSlug}
      title={context.page.title}
      audience={context.role === "teacher" ? "teacher" : "student"}
      studentName={context.group.name}
      slot={readSlot(v)}
      slots={slots}
    />
  );
}
```

- [ ] **Step 2: Write the Save button**

```tsx
// components/worksheet/SaveVersionButton.tsx
"use client";

import { useState } from "react";
import { SNAPSHOT_MESSAGE } from "@/lib/printable-bootstrap";

export const WORKSHEET_FRAME_ID = "worksheet-document";

type State = "idle" | "saving" | "saved" | "error";

// A silent failure here loses a student's homework, which is why this reports
// every state and why nothing navigates on save: a student whose network
// dropped still has every answer in the DOM and can press it again.
//
// This INVERTS captureHtmlThumbnail's contract deliberately. That one answers
// null on failure because a missing preview leaves a working iframe in place.
const TIMEOUT_MS = 10_000;

export function SaveVersionButton({
  groupSlug,
  pageSlug,
  audience,
}: {
  groupSlug: string;
  pageSlug: string;
  audience: "student" | "teacher";
}) {
  const [state, setState] = useState<State>("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function save() {
    const frame = document.getElementById(WORKSHEET_FRAME_ID);
    if (!(frame instanceof HTMLIFrameElement) || !frame.contentWindow) return;

    setState("saving");
    setMessage(null);

    const html = await new Promise<string | null>((resolve) => {
      const timer = window.setTimeout(() => finish(null), TIMEOUT_MS);

      function finish(value: string | null) {
        window.clearTimeout(timer);
        window.removeEventListener("message", onMessage);
        resolve(value);
      }

      function onMessage(event: MessageEvent) {
        // The frame is the only window that may answer, and it has an opaque
        // origin — so this checks the SOURCE, as the listener inside it does.
        if (event.source !== frame.contentWindow) return;
        const data = event.data as
          | { type?: string; ok?: boolean; html?: string }
          | null;
        if (!data || data.type !== SNAPSHOT_MESSAGE) return;
        finish(data.ok && typeof data.html === "string" ? data.html : null);
      }

      window.addEventListener("message", onMessage);
      // "*" because the frame's origin is opaque — there is no origin string
      // that would match it. The listener authenticates us from the other side.
      frame.contentWindow?.postMessage(SNAPSHOT_MESSAGE, "*");
    });

    if (html === null) {
      setState("error");
      setMessage(
        audience === "teacher"
          ? "That didn't save. Try again."
          : "L'enregistrement a échoué. Essaie encore.",
      );
      return;
    }

    const response = await fetch(`/api/worksheets/${groupSlug}/${pageSlug}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ html }),
    });

    if (!response.ok) {
      setState("error");
      setMessage(await response.text());
      return;
    }

    setState("saved");
  }

  const label =
    audience === "teacher"
      ? { idle: "Save correction", saving: "Saving…", saved: "Saved" }
      : {
          idle: "Enregistrer mes réponses",
          saving: "Enregistrement…",
          saved: "Enregistré",
        };

  return (
    <div className="fixed bottom-5 right-5 z-10 flex flex-col items-end gap-2 print:hidden">
      {message && (
        <p className="max-w-xs rounded-lg bg-white px-3 py-2 text-sm text-[var(--card-rouge)] shadow-[var(--card-shadow)]">
          {message}
        </p>
      )}
      <button
        type="button"
        onClick={save}
        disabled={state === "saving"}
        className="flex items-center gap-2 rounded-full bg-[var(--card-rouge)] px-5 py-3 font-[family-name:var(--card-font-serif)] text-sm text-white shadow-[var(--card-shadow)] transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {state === "saving" ? label.saving : state === "saved" ? label.saved : label.idle}
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Write the shell**

`components/worksheet/WorksheetShell.tsx` — a client component rendering:

- an `<iframe id={WORKSHEET_FRAME_ID} src={`/g/${groupSlug}/w/${pageSlug}/raw?v=${slot}`} sandbox="allow-scripts allow-modals" className="fixed inset-0 h-full w-full border-0 bg-white" />`. **Never `allow-same-origin`** — beside `allow-scripts` it lets the page remove its own sandbox.
- a switcher across the top: one `<a href={`?v=${s}`}>` per entry in `slots`, labelled by `versionLabel(s, audience, studentName)`, the active one marked. Anchors, not buttons — the whiteboard's capture-phase leave-guard inspects anchors, so they are protected by it without knowing it exists.
- `<PrintButton />` shifted to `right-44` so it sits left of the Save pill, and `<SaveVersionButton />` at `right-5`. Two fixed controls at the same `z-50`/`z-10` band; a third would silently paint over one.

- [ ] **Step 4: Verify by hand**

Run `npm run dev`. Publish an html page with a text input and a checkbox, tick *Students can save their answers*, assign it to a student, open that student's page with `?k=`, open the tile. Type into the input, tick the box, press Save. Confirm: the pill reads *Enregistré*, the chat FAB shows a new message, and reloading with `?v=student` shows the typed value and the ticked box.

- [ ] **Step 5: Commit**

```bash
git add "app/g/[slug]/w/[pageSlug]/page.tsx" components/worksheet
git commit -m "Fill in a worksheet and keep what you wrote"
```

---

### Task 19: The tile badge and the chooser

**Files:**
- Create: `components/worksheet/VersionChooser.tsx`, `components/worksheet/UploadVersion.tsx`
- Modify: `components/student/FilesTab.tsx`, `components/admin/PageList.tsx`

**Interfaces:**
- Consumes: `versionCount`, `versionLabel`, `slotForVersion`, `pageTarget`, `FileDropZone`, `validatePagePdf`, `MAX_PDF_BYTES`.
- Produces: `VersionChooser` taking `{ groupSlug, page, versions, audience, studentName, onClose }`.

- [ ] **Step 1: Carry the new fields into the tile types**

In `components/student/FilesTab.tsx`, add to `ShelfPage`:

```ts
  worksheet: boolean;
  versions: { fromTeacher: boolean; updatedAt: Date }[];
```

and add a `groupSlug: string | null` prop to `FilesTab` — null on `/f/[token]`, which is read-only and gets no badge, no chooser and no save.

In `components/admin/PageList.tsx`, add `worksheet: boolean` to `PageSummary`. The admin list gets **no** versions field: "All" is not a shelf, and the student chip already scopes the list without owning a shelf's rows.

- [ ] **Step 2: Draw the badge**

In `FilesTab`, pass a `badge` to `PageTile` when `versionCount(page.versions) > 1`:

```tsx
badge={
  versionCount(page.versions) > 1 ? (
    <span className="rounded-full bg-[var(--card-bleu)] px-2 py-0.5 text-xs font-semibold text-white">
      {versionCount(page.versions)}
    </span>
  ) : page.pinnedAt ? (
    /* …the existing pin marker… */
  ) : undefined
}
```

The badge slot is `pointer-events-none` in `PageTile`, which is correct: it never takes a click. The chooser opens from the tile's own link.

- [ ] **Step 3: Intercept the tile's click when a chooser is due**

A worksheet tile opens the chooser instead of navigating when there is more than one version, **or** whenever it is a pdf worksheet — because a PDF opens in the browser's own viewer, where there is nowhere to put a save control, so the chooser is its only surface.

Keep the tile's `href` as `pageTarget(page, groupSlug)` so the destination is real, and add an `onClick` on the tile wrapper that calls `preventDefault()` and opens the chooser in those two cases. A middle-click or a copied link therefore still goes somewhere sensible.

- [ ] **Step 4: Write the chooser**

```tsx
// components/worksheet/VersionChooser.tsx
"use client";

import Link from "next/link";
import { versionLabel, slotForVersion } from "@/lib/version-labels";
import { formatLongDate } from "@/lib/format";
import { UploadVersion } from "@/components/worksheet/UploadVersion";

// A dialog, and its rows are ANCHORS rather than buttons. The whiteboard's
// leave-guard is a capture-phase click listener on document that inspects
// anchors, so an anchor is protected by it without knowing it exists — the same
// reason the admin's pencil had to stay one. A button calling router.push would
// slip past it.
export function VersionChooser({
  groupSlug,
  page,
  versions,
  audience,
  studentName,
  onClose,
}: {
  groupSlug: string;
  page: { slug: string; title: string; kind: "html" | "pdf" };
  versions: { fromTeacher: boolean; updatedAt: Date }[];
  audience: "student" | "teacher";
  studentName: string;
  onClose: () => void;
}) {
  const base =
    page.kind === "pdf"
      ? `/g/${groupSlug}/w/${page.slug}/pdf`
      : `/g/${groupSlug}/w/${page.slug}`;

  const rows = [
    { slot: "blank" as const, at: null },
    ...versions.map((version) => ({
      slot: slotForVersion(version.fromTeacher),
      at: version.updatedAt,
    })),
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-[var(--card-shadow)]"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="mb-3 font-[family-name:var(--card-font-serif)] text-lg text-[var(--card-ink)]">
          {page.title}
        </h2>

        <ul className="flex flex-col gap-1">
          {rows.map((row) => (
            <li key={row.slot}>
              <Link
                href={`${base}?v=${row.slot}`}
                className="flex items-center justify-between rounded-lg px-3 py-2 text-[15px] text-[var(--card-ink)] hover:bg-[var(--card-creme)]"
              >
                <span>{versionLabel(row.slot, audience, studentName)}</span>
                {row.at && (
                  <span className="text-xs text-[var(--color-ink-muted)]">
                    {formatLongDate(row.at)}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>

        {/* A PDF has nowhere else this control could live. An html worksheet's
            Save pill is on the document itself, so it gets none here. */}
        {page.kind === "pdf" && (
          <UploadVersion
            groupSlug={groupSlug}
            pageSlug={page.slug}
            audience={audience}
          />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Write the uploader**

`components/worksheet/UploadVersion.tsx` — a client component wrapping `FileDropZone`, which hands the `File` up unread. Check `validatePagePdf` on the bytes before posting so the failure is a sentence rather than a round trip, then `POST` to `/api/worksheets/${groupSlug}/${pageSlug}` with a `FormData` carrying `pdf`. Label: *Téléverser mes réponses* / *Upload my correction*. Report the same four states the Save pill does, then `router.refresh()` on success.

- [ ] **Step 6: Wire `groupSlug` through the two hosts**

In `app/g/[slug]/page.tsx`, pass `groupSlug={slug}` to `FilesTab`. In `app/f/[token]/page.tsx`, pass `groupSlug={null}` — `filesToken` addresses a shelf, and a student's answers are not the shelf.

In `components/admin/PageList.tsx`, pass the active student chip's slug into `pageTarget` so Jenn's view of a shelf reaches the same route; under "All" pass `null`.

- [ ] **Step 7: Verify**

Run: `npm run typecheck && npm run lint && npm test && npm run build`, then by hand:

- a worksheet with no versions: the tile opens the shell (html) or the chooser (pdf), with no badge;
- after the student saves: the badge reads `2` and the chooser lists two rows;
- after Jenn corrects: `3`, three rows, and the student sees all three;
- on `/f/[token]`: no badge, no chooser, the tile opens the public page;
- on `/admin?tab=pages` under "All": no badge, tile opens `/p/[slug]`.

- [ ] **Step 8: Commit**

```bash
git add components/worksheet components/student/FilesTab.tsx components/admin/PageList.tsx "app/g/[slug]/page.tsx" "app/f/[token]/page.tsx"
git commit -m "Show how many versions a worksheet has, and let either party pick one"
```

---

### Task 20: Documentation

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add the routes to the route table**

Four rows: `/g/[slug]/w/[pageSlug]`, `GET /g/[slug]/w/[pageSlug]/raw`, `GET /g/[slug]/w/[pageSlug]/pdf`, `POST /api/worksheets/[slug]/[pageSlug]`. Note in the `/api/auth/*` row's parenthetical that `/api/worksheets/*` joins the list of things that are not server actions.

- [ ] **Step 2: Add a *Worksheet versions* section under *Files: pages, links and PDFs***

Record, in this file's register — the decision and the failure that motivated it:

- three versions, two rows, and that `@@unique([pageId, groupId, fromTeacher])` **is** the rule;
- why a version is not a `Page` row (`/p/[slug]` is public and slugs are guessable);
- why an html version is a snapshot rather than an answer set, and why **every `<script>` is stripped** (a snapshot that re-runs its own init code silently wipes a document that rebuilds the DOM on load);
- that a stripped snapshot is **still typeable**, which is what makes the correction the same operation as the attempt;
- that `snapshotDocument` is inlined by `toString()` and **must stay self-contained**;
- that brotli is **async only**, joining the list of things that depend on pm2 fork mode;
- that `chatRole` is reused verbatim and is what keeps `/g/all` out;
- that `MAX_SNAPSHOT_BYTES` is 3 MB **because** nginx is `4m`;
- that the chooser's rows are anchors **because** of the leave-guard;
- that the badge does not appear on the admin Pages tab under "All", and that this is correct rather than missing.

- [ ] **Step 3: Note the new devDependency**

In *Commands*, note that `happy-dom` exists for `tests/lib/snapshot-dom.test.ts` alone, opted into with a per-file `@vitest-environment` docblock, and that the global environment stays `node`.

- [ ] **Step 4: Run the full CI sequence**

```bash
npx prisma generate && npm run lint && npm run typecheck && npm test && npm run build
```
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "Record how worksheet versions work and why"
```

---

## Self-review notes

**Spec coverage.** Every section maps to a task: schema → 8; compression → 5, 9; `readVersionKind` → 1; routes and authorisation → 13, 14, 15, 17; containment → 14, 15, 18; snapshot mechanics → 6, 7; failure handling → 5, 6, 7, 18; marking → 12; tile and chooser → 11, 19; labels → 2; notification → 16, 17; tests → distributed; out-of-scope items are enforced by `worksheetOpenable` (link rows), `chatRole` (the everyone group), `groupSlug` being optional (`/f/[token]`, "All"), and the `@@unique` (no history).

**One resolved ambiguity.** The spec's illustrative *Marie's answers* is implemented as *Marie Dupont's answers* — Task 2 records why: `teacherPageLabel` already uses the whole name because two students can share a first name.

**One deliberate deviation from the shape of the existing code.** `/g/[slug]/w/[pageSlug]/raw` appends **two** bootstraps to one document, which no existing route does. They remain independent listeners on one channel and the mutual-exclusion tests in Task 7 pin that; the shell genuinely needs both pills on every version.
