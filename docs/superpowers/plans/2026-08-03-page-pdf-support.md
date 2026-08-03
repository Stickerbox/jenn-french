# PDFs: Printing a Page, and Uploading One — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A student on `/p/[slug]` can print a page to PDF in one click, with anything they typed into it still in it. Jenn can drop a `.pdf` into the same control she drops a `.html` into, and it becomes a tile on a shelf that opens in the browser's own PDF viewer.

**Architecture:** `Page` gains `pdf Bytes?` and `pdfSize Int?`, and `kind` gains a third value. Every new rule is a pure function in `lib/` with a test in `tests/lib/`, so the route and action layers stay thin. Printing needs no new storage at all: one sandbox token, and one small script appended to the served document behind a query gate.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Prisma + SQLite, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-03-page-pdf-support-design.md` — read it before Task 1. The reasoning behind every decision below is there, and several of these choices look arbitrary without it.

**Sequencing:** Self-contained. Ends green — lint, typecheck, tests and build all pass, and every existing page, link, card, chat and whiteboard behaves exactly as it does today.

---

## Critical context for whoever executes this

**You cannot verify the two headline behaviours from a terminal.** Printing
inside a sandboxed iframe and displaying a PDF on iOS Safari both need a real
browser. Task 17 lists what to check and hands the browser-only items to a
human. Do not claim either feature works because the code compiles.

**Task 5 deliberately breaks `npm run typecheck`, and Task 6 fixes it.**
`readPageKind` gains a **required** `pdfSize` argument so the compiler names
every query that has to select it. If you find yourself making it optional to
get back to green, re-read the spec section "readPageKind gains a required
argument" — the whole point is the errors. Typecheck is expected red between
Task 5 and Task 6, and at no other point.

**Task 4 touches production data.** Read the generated migration SQL before
applying it. Two nullable columns on SQLite must be `ALTER TABLE … ADD COLUMN`
and nothing else.

**Project conventions, which you must follow:**
- Logic lives in `lib/` as pure functions tested in `tests/lib/`. Components and
  Prisma access are **not** unit-tested — do not add component tests.
- Comments explain *why*, especially the counter-intuitive. Never restate code.
- Imports use the `@/` alias.
- Deletes use `deleteMany`, updates `updateMany`/`upsert`, so a double-click or
  a stale tab is a no-op rather than a Prisma `P2025`.
- "Student" is the UI word, "Group" is the code word. In `lib/` and `prisma/` it
  is `group`.
- Server actions call `revalidatePath` for the pages they affect.
- Repeated flashcard class strings go in `components/card-styles.ts`.

**Run before claiming any task complete:** `npx vitest run <the test file>` for a
task with a test; `npm run typecheck` for any task that does not. The full CI
sequence runs at Task 17.

---

## Task Order and Why

Pure functions first: three of them have no dependency on the schema, so they
can be written and tested before anything can break. The schema lands next,
then the one signature change that forces the query layer to keep up, then the
server, then the UI from the inside out. Documentation last, because the whole
shape has to be settled before it can be described.

The two features are independent — printing (Tasks 3, 9, 10) touches no column,
and uploading (everything else) touches no sandbox. If the work has to be split
across sessions, split it there.

---

## File Structure

| File | Responsibility |
|---|---|
| `lib/page-pdf.ts` | **Create.** `MAX_PDF_BYTES`, `validatePagePdf` — the cap and the magic-byte check. |
| `lib/pdf-filename.ts` | **Create.** `contentDispositionInline` — a teacher's title into a response header. Security control. |
| `lib/printable-bootstrap.ts` | **Create.** `PRINT_MESSAGE`, `withPrintableBootstrap` — the injected print listener. |
| `lib/page-target.ts` | **Create.** `pageTarget` — kind → where a tile links and whether it opens in a new tab. |
| `lib/page-kind.ts` | **Modify.** Third `PageKind`; `pdfSize` becomes a required argument. |
| `prisma/schema.prisma` | **Modify.** `Page.pdf`, `Page.pdfSize`. |
| `prisma/migrations/*/migration.sql` | **Generated, then read.** Two `ADD COLUMN`s, nothing else. |
| `lib/pages.ts` | **Modify.** `savePage`'s third member, `getPagePdf`, `updatePageMeta`, `pdfSize` in every select. |
| `app/page-actions.ts` | **Modify.** `createPdfPage`, `updatePdfPage`. |
| `app/p/[slug]/pdf/route.ts` | **Create.** The bytes, with their headers. |
| `app/p/[slug]/raw/route.ts` | **Modify.** The `?printable=1` gate. |
| `app/p/[slug]/page.tsx` | **Modify.** `allow-modals`, the pdf redirect, the print pill. |
| `components/PrintButton.tsx` | **Create.** The pill, and the only client JS on that route. |
| `components/ui/FileDropZone.tsx` | **Create**, replacing `components/admin/HtmlDropZone.tsx`. |
| `components/ui/PdfPreview.tsx` | **Create.** The third `preview` renderer. |
| `components/ui/PageTile.tsx` | **Modify.** `external` → `newTab`. |
| `components/ui/KindFilter.tsx` | **Modify.** A third chip. |
| `components/admin/PageEditor.tsx` | **Modify.** Kind-aware staging and submit. |
| `components/admin/PageList.tsx`, `components/student/FilesTab.tsx` | **Modify.** `pageTarget`, `PdfPreview`, the third chip's label, the control gate. |
| `components/admin/PagesTabClient.tsx`, `app/admin/page.tsx`, `app/admin/pages/[slug]/page.tsx` | **Modify.** Wiring. |
| `CLAUDE.md`, `docs/DEPLOYMENT.md`, `tools/README.md` | **Modify.** Documentation. |

---

### Task 0: Commit the design documents

- [ ] **Step 1:** Confirm both documents exist:
  - `docs/superpowers/specs/2026-08-03-page-pdf-support-design.md`
  - `docs/superpowers/plans/2026-08-03-page-pdf-support.md`

- [ ] **Step 2:** Read the spec in full. Several decisions below (a required
  argument that breaks the build, a redirect on a route documented as never
  redirecting, a deviation from the "never handles a file" rule) look wrong
  without their reasoning.

- [ ] **Step 3:** Commit.

```bash
git checkout -b pdf-support
git add docs/superpowers/specs/2026-08-03-page-pdf-support-design.md \
        docs/superpowers/plans/2026-08-03-page-pdf-support.md
git commit -m "$(cat <<'EOF'
Add the design and plan for PDF support

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
)"
```

---

### Task 1: `validatePagePdf` — the cap and the magic bytes

The counterpart of `validatePageHtml`, with the same limited ambition: catch the
obvious slip of choosing the wrong file. It is not a PDF parser and not a
sanitiser.

**Files:**
- Create: `lib/page-pdf.ts`
- Test: `tests/lib/page-pdf.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/page-pdf.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { MAX_PDF_BYTES, validatePagePdf } from "@/lib/page-pdf";

function bytesOf(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

// A minimal thing that starts the way every PDF starts, padded to a length.
function pdfOfSize(size: number): Uint8Array {
  const out = new Uint8Array(size);
  out.set(bytesOf("%PDF-1.7\n").slice(0, size));
  return out;
}

describe("validatePagePdf", () => {
  it("accepts something that starts like a PDF", () => {
    const bytes = bytesOf("%PDF-1.4\n1 0 obj\n");
    const result = validatePagePdf(bytes);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.bytes).toBe(bytes);
  });

  it("accepts every version prefix a PDF can carry", () => {
    for (const version of ["1.0", "1.3", "1.7", "2.0"]) {
      expect(validatePagePdf(bytesOf(`%PDF-${version}\n`)).ok).toBe(true);
    }
  });

  it("rejects an empty file", () => {
    expect(validatePagePdf(new Uint8Array(0)).ok).toBe(false);
  });

  it("rejects an HTML file chosen by mistake", () => {
    // The whole reason the check exists: the drop zone takes both kinds now, so
    // picking the wrong one is a real slip rather than a hypothetical.
    expect(validatePagePdf(bytesOf("<!doctype html><html></html>")).ok).toBe(false);
  });

  it("rejects a PNG renamed to .pdf", () => {
    expect(
      validatePagePdf(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a])).ok,
    ).toBe(false);
  });

  it("rejects a PDF whose header is not at the start", () => {
    // Readers tolerate leading junk; we do not. A file needing that tolerance
    // is a file worth telling her about before students meet it.
    expect(validatePagePdf(bytesOf("   %PDF-1.7\n")).ok).toBe(false);
  });

  it("accepts a file of exactly the cap", () => {
    expect(validatePagePdf(pdfOfSize(MAX_PDF_BYTES)).ok).toBe(true);
  });

  it("rejects one byte over the cap", () => {
    const result = validatePagePdf(pdfOfSize(MAX_PDF_BYTES + 1));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("3 MB");
  });

  it("caps at 3 MB, which is what fits under the nginx body limit", () => {
    expect(MAX_PDF_BYTES).toBe(3 * 1024 * 1024);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx vitest run tests/lib/page-pdf.test.ts
```

- [ ] **Step 3: Implement**

Create `lib/page-pdf.ts`:

```ts
// 3 MB, and the number is not arbitrary. nginx's client_max_body_size on the
// server is 4m (docs/DEPLOYMENT.md item 11) and next.config.ts caps a server
// action at 4mb; 3 MB is the largest round number that still leaves room for
// the title, the group ids and multipart overhead. Raising this means an SSH
// session and an nginx reload, and until someone does it the failure is a raw
// 413 that Next never sees and the app cannot explain.
export const MAX_PDF_BYTES = 3 * 1024 * 1024;

const HEADER = "%PDF-";

export type PagePdfResult =
  | { ok: true; bytes: Uint8Array }
  | { ok: false; error: string };

export function validatePagePdf(bytes: Uint8Array): PagePdfResult {
  if (bytes.byteLength === 0) {
    return { ok: false, error: "The PDF is missing." };
  }

  if (bytes.byteLength > MAX_PDF_BYTES) {
    return { ok: false, error: "That PDF is larger than 3 MB." };
  }

  // The same ambition as validatePageHtml's `includes("<")`: catch the wrong
  // file, do not attempt to parse the format. Anchored at byte 0 even though
  // readers tolerate a header further in — a file that needs that tolerance is
  // worth reporting to the teacher rather than serving to a student.
  const prefix = new TextDecoder("latin1").decode(bytes.subarray(0, HEADER.length));
  if (prefix !== HEADER) {
    return { ok: false, error: "That doesn't look like a PDF." };
  }

  return { ok: true, bytes };
}
```

- [ ] **Step 4: Verify**

```bash
npx vitest run tests/lib/page-pdf.test.ts
```

---

### Task 2: `contentDispositionInline` — a title into a response header

`Content-Disposition` carries a string the teacher typed into an HTTP header. A
bare `"` ends the quoted form early and a CR or LF is header injection. This is
a security control.

**Files:**
- Create: `lib/pdf-filename.ts`
- Test: `tests/lib/pdf-filename.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/pdf-filename.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { contentDispositionInline } from "@/lib/pdf-filename";

describe("contentDispositionInline", () => {
  it("is inline, so the browser's viewer opens it rather than saving it", () => {
    expect(contentDispositionInline("Verbs", "verbs")).toMatch(/^inline; /);
  });

  it("uses the title as the filename, with a .pdf suffix", () => {
    const value = contentDispositionInline("Irregular Verbs", "irregular-verbs");
    expect(value).toContain('filename="Irregular Verbs.pdf"');
  });

  it("keeps accents in the encoded form and strips them from the ASCII one", () => {
    // Both forms are sent: filename* is what every current browser uses, and
    // the quoted form is the fallback that cannot carry a non-ASCII byte.
    const value = contentDispositionInline("Verbes irréguliers", "verbes");
    expect(value).toContain('filename="Verbes irreguliers.pdf"');
    expect(value).toContain("filename*=UTF-8''Verbes%20irr%C3%A9guliers.pdf");
  });

  it("cannot be escaped with a quote, a backslash or a semicolon", () => {
    const BACKSLASH = String.fromCharCode(92);
    const value = contentDispositionInline(
      `a" ; attachment; x="b${BACKSLASH}`,
      "safe-slug",
    );
    // Exactly one quoted run, and exactly the two semicolons this header's own
    // structure needs - a third would mean the title had introduced a parameter
    // of its own.
    expect(value.match(/"/g)).toHaveLength(2);
    expect(value.match(/;/g)).toHaveLength(2);
    expect(value.includes(BACKSLASH)).toBe(false);
  });

  it("never emits a CR, an LF or a tab", () => {
    // The one that matters: a line break here is response-header injection.
    // fromCharCode rather than an escape, so the source names the byte it means.
    const CR = String.fromCharCode(13);
    const LF = String.fromCharCode(10);
    const TAB = String.fromCharCode(9);

    for (const hostile of [
      `a${CR}${LF}Set-Cookie: x=1`,
      `a${LF}X-Evil: 1`,
      `a${CR}b`,
      `a${TAB}b`,
    ]) {
      const value = contentDispositionInline(hostile, "safe-slug");
      // A space is fine - the header's own syntax has them, and so does a
      // two-word title. A line break is not.
      for (const forbidden of [CR, LF, TAB]) {
        expect(value.includes(forbidden)).toBe(false);
      }
    }
  });

  it("falls back to the slug when the title has nothing usable in it", () => {
    // slugify already guarantees the slug is a safe token, so it is the right
    // fallback rather than a literal like "page".
    for (const title of ["", "   ", "…", "——", "...", "???"]) {
      const value = contentDispositionInline(title, "le-slug");
      expect(value).toContain('filename="le-slug.pdf"');
      expect(value).toContain("filename*=UTF-8''le-slug.pdf");
    }
  });

  it("does not double the suffix on a title that already ends in .pdf", () => {
    const value = contentDispositionInline("Exercice.pdf", "exercice");
    expect(value).toContain('filename="Exercice.pdf"');
    expect(value).not.toContain(".pdf.pdf");
  });

  it("bounds the length, because a title has none", () => {
    const value = contentDispositionInline("a".repeat(500), "slug");
    expect(value.length).toBeLessThan(400);
  });

  it("collapses newlines and runs of space into single spaces", () => {
    expect(contentDispositionInline("Deux    mots", "slug")).toContain(
      'filename="Deux mots.pdf"',
    );
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

- [ ] **Step 3: Implement**

Create `lib/pdf-filename.ts`:

```ts
// The value of a Content-Disposition header, built from a string the teacher
// typed. That makes this a security control and not a formatting helper: a bare
// `"` ends the quoted form early, and a CR or LF is response-header injection.
//
// Both forms are emitted. `filename*` is what every current browser prefers and
// it can carry the accents a French title has; the quoted `filename` is the
// fallback, and it cannot carry a non-ASCII byte, so it gets a transliterated
// stem. Neither is trusted to be safe by being short — the ASCII form is an
// allowlist and the encoded form is percent-encoded, which leaves no byte that
// means anything to a header parser.

const MAX_STEM = 80;

function withoutPdfSuffix(value: string): string {
  return value.replace(/\.pdf$/i, "");
}

// NFKD first, then the allowlist. NFKD splits an accented letter into a letter
// plus a combining mark, and the allowlist keeps the letter while dropping the
// mark - so "e-acute" becomes "e" rather than vanishing, and an all-accented
// title still yields a readable stem instead of falling back to the slug. That
// is why there is no separate pass for the marks: the allowlist already is one.
function asciiStem(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9 ._-]/g, "")
    .replace(/\s+/g, " ")
    .slice(0, MAX_STEM)
    .replace(/^[.\s_-]+|[.\s_-]+$/g, "");
}

// No control-character pass here, deliberately: encodeRfc5987 percent-encodes
// everything it cannot represent, so a stray control byte becomes %01 and never
// reaches the header as itself. Collapsing whitespace is for legibility.
function utf8Stem(title: string): string {
  return title
    .replace(/\s+/g, " ")
    .slice(0, MAX_STEM)
    .trim();
}

// encodeURIComponent leaves ' ( ) * alone, and RFC 5987's attr-char does not
// admit them.
function encodeRfc5987(value: string): string {
  return encodeURIComponent(value).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

export function contentDispositionInline(title: string, slug: string): string {
  const stem = withoutPdfSuffix(title);
  const ascii = asciiStem(stem);

  // One decision for both forms. If the title has nothing a filename can be
  // built from, the slug is the filename in both — otherwise the quoted form
  // would say "le-slug" while the encoded form said "——", and the browser
  // would pick whichever it prefers.
  const usable = ascii !== "";
  const quoted = usable ? ascii : slug;
  const encoded = encodeRfc5987(usable ? utf8Stem(stem) : slug);

  return `inline; filename="${quoted}.pdf"; filename*=UTF-8''${encoded}.pdf`;
}
```

- [ ] **Step 4: Verify**

```bash
npx vitest run tests/lib/pdf-filename.test.ts
```

---

### Task 3: `withPrintableBootstrap` — the injected print listener

The document has to carry a listener it did not come with, because the shell
cannot reach into an opaque-origin frame and printing the shell does not
paginate. Read the spec's "Printing a page to PDF" before this task.

**Files:**
- Create: `lib/printable-bootstrap.ts`
- Test: `tests/lib/printable-bootstrap.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/printable-bootstrap.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  PRINT_MESSAGE,
  withPrintableBootstrap,
} from "@/lib/printable-bootstrap";

const DOC = "<!doctype html><html><body><p>Bonjour</p></body></html>";

describe("withPrintableBootstrap", () => {
  it("leaves the teacher's document byte-identical and appends after it", () => {
    // The document is never rewritten. The admin's download hits the same route
    // without the query parameter and has to be exactly what she uploaded, so
    // anything that edited the markup here would eventually edit her source.
    expect(withPrintableBootstrap(DOC).startsWith(DOC)).toBe(true);
  });

  it("adds a script", () => {
    expect(withPrintableBootstrap(DOC)).toContain("<script>");
  });

  it("calls print", () => {
    expect(withPrintableBootstrap(DOC)).toContain("window.print()");
  });

  it("authenticates the sender by window, not by origin", () => {
    // The frame has an opaque origin, so there is no origin string it could
    // compare against. The only window that can legitimately drive it is the
    // shell that framed it.
    expect(withPrintableBootstrap(DOC)).toContain("event.source !== window.parent");
  });

  it("listens for exactly the message the shell sends", () => {
    expect(withPrintableBootstrap(DOC)).toContain(JSON.stringify(PRINT_MESSAGE));
  });

  it("works on a document with no body tag to splice into", () => {
    // Not a hypothetical: a hand-edited or fragment-shaped upload may have no
    // </body> at all, or several. Appending needs neither.
    const result = withPrintableBootstrap("<p>fragment</p>");
    expect(result).toContain("<p>fragment</p>");
    expect(result).toContain("window.print()");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

- [ ] **Step 3: Implement**

Create `lib/printable-bootstrap.ts`:

```ts
export const PRINT_MESSAGE = "print-page";

// A listener appended to the served document — never to the stored one. The
// `?printable=1` gate on the raw route is what keeps it out of the admin's
// download, which has to be a byte-exact copy of what Jenn uploaded so the
// round trip through her own editor does not accumulate our code.
//
// `event.source` and not `event.origin`: the frame on /p/[slug] is sandboxed
// without allow-same-origin, so this document has an opaque origin and no
// reliable origin string to compare against. The precise question is which
// window is asking, and only the shell that framed it can be window.parent —
// the sandbox forbids popups, so no other window can obtain a handle to post
// through.
//
// The raw route's CSP admits 'unsafe-inline' for scripts, so this runs.
const BOOTSTRAP = `<script>
addEventListener("message", function (event) {
  if (event.source !== window.parent) return;
  if (event.data !== ${JSON.stringify(PRINT_MESSAGE)}) return;
  window.print();
});
</script>`;

// Appended rather than spliced before </body>. A document that has been through
// a text editor may have no </body>, or several, and every parser moves a
// trailing script into the body anyway. The original is a prefix of the result,
// which is the property the test pins.
export function withPrintableBootstrap(html: string): string {
  return `${html}\n${BOOTSTRAP}\n`;
}
```

- [ ] **Step 4: Verify**

```bash
npx vitest run tests/lib/printable-bootstrap.test.ts
```

---

### Task 4: The schema

**Files:**
- Modify: `prisma/schema.prisma`
- Generated: `prisma/migrations/*/migration.sql`

- [ ] **Step 1:** In the `Page` model, replace the two content columns and their
  comment with three:

```prisma
  // Exactly one of these is set. html holds a whole document and pdf holds a
  // whole file, so no shelf query selects either.
  html      String?
  url       String?
  pdf       Bytes?
  // The size of the pdf, in bytes. Not derived from `pdf` on read, because no
  // shelf query selects `pdf` — and readPageKind needs a pdf signal it can
  // actually load, for the same reason it reads `url` and not `html`. It is
  // also what the tile puts under the glyph, via formatFileSize.
  pdfSize   Int?
```

Also widen the `kind` comment to name three values:

```prisma
  // "html" | "link" | "pdf". A String and not an enum because Prisma has no
  // enum support on SQLite; lib/page-kind.ts narrows it.
```

- [ ] **Step 2:** Generate the migration.

```bash
npx prisma migrate dev --name add_page_pdfs
```

- [ ] **Step 3: Read the generated SQL before trusting it.**

```bash
cat prisma/migrations/*_add_page_pdfs/migration.sql
```

It must be two `ALTER TABLE "Page" ADD COLUMN` statements and nothing else. Two
nullable columns need no table rebuild. If Prisma has produced a
`new_Page`/`INSERT INTO`/`DROP TABLE` sequence, **stop** — something else in the
schema drifted, and that sequence can lose rows. Reconcile the drift first.

- [ ] **Step 4:**

```bash
npx prisma generate
npm run typecheck
```

Green: nothing reads the new columns yet.

---

### Task 5: `readPageKind` gains a third kind and a required argument

This task ends with `npm run typecheck` **red**, on purpose. Task 6 fixes it.

**Files:**
- Modify: `lib/page-kind.ts`
- Test: `tests/lib/page-kind.test.ts` (extend)

- [ ] **Step 1: Extend the test**

In `tests/lib/page-kind.test.ts`, every existing call gains `pdfSize: null`, and
add the new cases:

```ts
describe("readPageKind", () => {
  it("reads the recognised values", () => {
    expect(readPageKind({ kind: "html", url: null, pdfSize: null })).toBe("html");
    expect(
      readPageKind({ kind: "link", url: "https://example.com/", pdfSize: null }),
    ).toBe("link");
    expect(readPageKind({ kind: "pdf", url: null, pdfSize: 1024 })).toBe("pdf");
  });

  it("resolves an unrecognised kind by the url column", () => {
    // Falling back to "html" would be the wrong repair for the row most likely
    // to be broken: one with a url and no document, which would then render as
    // a page with nothing in it.
    expect(
      readPageKind({ kind: "", url: "https://example.com/", pdfSize: null }),
    ).toBe("link");
    expect(
      readPageKind({ kind: "wat", url: "https://example.com/", pdfSize: null }),
    ).toBe("link");
  });

  it("resolves an unrecognised kind by pdfSize", () => {
    expect(readPageKind({ kind: "", url: null, pdfSize: 2048 })).toBe("pdf");
    expect(readPageKind({ kind: "wat", url: null, pdfSize: 0 })).toBe("pdf");
  });

  it("prefers pdfSize over url on a row that has both", () => {
    // Only reachable through a hand-edited database or a migration that half
    // ran. A stored file beats a url the row should no longer have: serving the
    // document we hold is the repair that loses nothing.
    expect(
      readPageKind({ kind: "wat", url: "https://example.com/", pdfSize: 99 }),
    ).toBe("pdf");
  });

  it("falls back to html when there is no url and no pdf either", () => {
    expect(readPageKind({ kind: "wat", url: null, pdfSize: null })).toBe("html");
  });
});
```

Note `pdfSize: 0` resolving to `"pdf"`: the test pins `!== null` rather than a
truthiness check, so a zero-byte row is still recognised as the pdf row it is
instead of silently becoming an html page.

- [ ] **Step 2: Run it and watch it fail**

- [ ] **Step 3: Implement**

Rewrite `lib/page-kind.ts`:

```ts
export type PageKind = "html" | "link" | "pdf";

// Prisma has no enum support on SQLite, so `kind` is a String and the database
// type is wider than this one. Same defensive contract as readSections and
// readOps: a row a later migration or a hand-edited database produced must not
// crash a shelf.
//
// `pdfSize` is REQUIRED rather than optional, which costs every caller a line in
// its `select`. That is the point. This function exists to resolve an
// inconsistent row, and a caller that quietly omitted the pdf signal would have
// a broken pdf row resolved as "html" — an empty iframe, which is the precise
// failure this function was written to prevent. Optional would compile
// everywhere and be wrong in the one case that matters.
//
// It reads `url` and `pdfSize`, never `html` or `pdf`: the shelf queries select
// neither of those, because one holds a whole document and the other a whole
// file, and loading either to draw a grid of titles is what these omissions
// exist to stop.
export function readPageKind(row: {
  kind: string;
  url: string | null;
  pdfSize: number | null;
}): PageKind {
  if (row.kind === "link") return "link";
  if (row.kind === "pdf") return "pdf";
  if (row.kind === "html") return "html";

  // Resolve toward the row most likely to be real, stored file first.
  if (row.pdfSize !== null) return "pdf";
  return row.url !== null ? "link" : "html";
}
```

- [ ] **Step 4: Verify**

```bash
npx vitest run tests/lib/page-kind.test.ts   # green
npm run typecheck                            # RED, and expected
```

Record the call sites the compiler names. There should be six, across
`lib/pages.ts`, `app/p/[slug]/raw/route.ts`, `app/p/[slug]/page.tsx`,
`app/api/pages/route.ts` and `app/page-actions.ts`. Every one is a query that
now has to select `pdfSize`.

---

### Task 6: The query layer

**Files:**
- Modify: `lib/pages.ts`
- Modify: `app/p/[slug]/raw/route.ts`, `app/api/pages/route.ts`,
  `app/page-actions.ts` — `pdfSize` in each `select`

- [ ] **Step 1: `SavePageInput` gains a third member**

```ts
export type SavePageInput = SaveCommon &
  (
    | { kind: "html"; html: string }
    | { kind: "link"; url: string; addedByStudent?: boolean }
    | { kind: "pdf"; pdf: Uint8Array; pdfSize: number }
  );
```

- [ ] **Step 2: `savePage`'s column block names all four content columns in all
  three branches**

```ts
  // Every content column is written every time, three of them to null. The
  // shape is identical across the branches on purpose: that is the invariant
  // made visible. Setting only the populated one would leave stale html behind
  // if an html page were replaced by a pdf at the same slug, and readPageKind
  // would then have two populated columns to choose between.
  const columns =
    input.kind === "html"
      ? { kind: "html", html: input.html, url: null, pdf: null, pdfSize: null }
      : input.kind === "link"
        ? { kind: "link", html: null, url: input.url, pdf: null, pdfSize: null }
        : {
            kind: "pdf",
            html: null,
            url: null,
            // Buffer on the way in, matching how Passkey.publicKey is written.
            pdf: Buffer.from(input.pdf),
            pdfSize: input.pdfSize,
          };
```

- [ ] **Step 3: `SHELF_SELECT` gains `pdfSize` and keeps refusing `pdf`**

```ts
// `html` and `pdf` are deliberately absent. One holds a whole document and the
// other a whole file; selecting either to render a grid of thumbnails would ship
// every page's contents to draw a list of titles. `pdfSize` is here because it
// is small, because readPageKind needs it, and because the tile prints it.
const SHELF_SELECT = {
  id: true,
  slug: true,
  title: true,
  createdAt: true,
  kind: true,
  url: true,
  pdfSize: true,
  addedByStudent: true,
} as const;
```

- [ ] **Step 4: `getPageBySlug` and `getPageForAdmin` select `pdfSize`**

Add `pdfSize: true` to both. Neither selects `pdf` — `getPageBySlug` feeds the
html routes and `getPageForAdmin` feeds a form that describes the stored file
rather than showing it. Add `pdfSize` to `getPageForAdmin`'s returned object
alongside `kind`.

- [ ] **Step 5: `listPagesForAdmin` returns `pdfSize`**

Add `pdfSize: page.pdfSize` to the mapped object.

- [ ] **Step 6: `getPagePdf` — the only query that loads the blob**

```ts
// Its own query, and the only one that selects `pdf`. Same reasoning as
// SHELF_SELECT's omission: a caller reaching for a list must not be able to
// pull 3 MB per row by forgetting which helper it called.
export function getPagePdf(slug: string) {
  return prisma.page.findUnique({
    where: { slug },
    select: {
      slug: true,
      title: true,
      kind: true,
      url: true,
      pdf: true,
      pdfSize: true,
    },
  });
}
```

- [ ] **Step 7: `updatePageMeta` — a title and an audience, no content**

```ts
// Title and audience only, for a page whose content is already stored. Kept out
// of savePage deliberately: that function writes every content column on every
// call, one of them to null, and a "leave the bytes alone" case inside it would
// put a hole in the one place that invariant is enforced. It also saves reading
// and rewriting 3 MB to change a title.
export async function updatePageMeta(
  slug: string,
  input: { title: string; groupIds: string[] },
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const page = await tx.page.findUnique({
      where: { slug },
      select: { id: true },
    });
    // Already gone. A no-op, for the reason deletes use deleteMany.
    if (!page) return;

    await tx.page.update({
      where: { id: page.id },
      data: { title: input.title },
    });

    // Replace the whole set rather than diffing it, as savePage does: the
    // caller always sends the complete list.
    await tx.pageGroup.deleteMany({ where: { pageId: page.id } });
    for (const groupId of new Set(input.groupIds)) {
      await tx.pageGroup.create({ data: { pageId: page.id, groupId } });
    }
  });
}
```

- [ ] **Step 8: The three call sites outside `lib/`**

Add `pdfSize: true` to the `select` in each:
- `app/p/[slug]/raw/route.ts` — via `getPageBySlug`, already done in Step 4.
- `app/api/pages/route.ts` — the `prisma.page.findUnique` that checks whether a
  slug belongs to a link. Extend its guard while you are there: the comment says
  a publish must not silently convert a link into a page, and the same is true
  of a pdf. `readPageKind(existing) !== "html"` with the message *"That slug
  belongs to a link."* becoming *"That slug belongs to a link or a PDF."*
- `app/page-actions.ts` — `deleteShelfLink`'s `findUnique`.

- [ ] **Step 9: Verify**

```bash
npm run typecheck   # green again
npm test
```

---

### Task 7: The server actions

**Files:**
- Modify: `app/page-actions.ts`

- [ ] **Step 1: Imports**

```ts
import { savePage, updatePageMeta, type SavePageInput } from "@/lib/pages";
import { validatePagePdf } from "@/lib/page-pdf";
```

- [ ] **Step 2: The two form readers**

```ts
// Bytes arrive as a File in FormData, not as a base64 string, and this is a
// deliberate departure from the rule in 2026-07-30-uploaded-pages-design.md
// that a page action "takes a string and never handles a file". The reason is
// arithmetic: base64 costs a third more, and 3 MB of PDF would arrive as 4 MB
// of payload against a 4 MB nginx limit — a 413 before Next ever saw it.
async function readPdfForm(
  formData: FormData,
): Promise<{ title: string; bytes: Uint8Array | null }> {
  const title = requireTitle(String(formData.get("title") ?? ""));

  const file = formData.get("pdf");
  // Size and not presence: an untouched file input serialises as an empty File
  // rather than being absent, and "she changed the title without choosing a new
  // document" is the common case on the edit screen.
  if (!(file instanceof File) || file.size === 0) return { title, bytes: null };

  const validated = validatePagePdf(new Uint8Array(await file.arrayBuffer()));
  if (!validated.ok) throw new Error(validated.error);
  return { title, bytes: validated.bytes };
}

function readGroupIds(formData: FormData): string[] {
  return formData
    .getAll("groupIds")
    .map(String)
    .filter((id) => id !== "");
}
```

- [ ] **Step 3: The two actions**

```ts
// Teacher-only, like createPage. A student upload would put unvalidated binary
// in the database and served from our own origin, and would need
// canStudentDelete extended from rows-with-a-url to rows-with-a-blob — a
// separate decision, not one to smuggle in here.
export async function createPdfPage(formData: FormData): Promise<string> {
  await requireTeacher();
  const { title, bytes } = await readPdfForm(formData);
  if (!bytes) throw new Error("A PDF file is required.");

  const slug = await saveOrExplain({
    slug: null,
    kind: "pdf",
    title,
    pdf: bytes,
    pdfSize: bytes.byteLength,
    groupIds: readGroupIds(formData),
  });

  revalidatePages(slug);
  return slug;
}

export async function updatePdfPage(
  slug: string,
  formData: FormData,
): Promise<void> {
  await requireTeacher();
  const { title, bytes } = await readPdfForm(formData);
  const groupIds = readGroupIds(formData);

  if (bytes) {
    await saveOrExplain({
      slug,
      kind: "pdf",
      title,
      pdf: bytes,
      pdfSize: bytes.byteLength,
      groupIds,
    });
  } else {
    // No new document staged, so this is a rename or a change of audience.
    // Going through savePage would mean reading the blob back and writing it
    // again to change a string.
    await updatePageMeta(slug, { title, groupIds });
  }

  revalidatePages(slug);
}
```

- [ ] **Step 4: Verify**

```bash
npm run typecheck
```

---

### Task 8: `/p/[slug]/pdf` — serving the bytes

**Files:**
- Create: `app/p/[slug]/pdf/route.ts`

- [ ] **Step 1: Implement**

```ts
import { NextResponse } from "next/server";
import { getPagePdf } from "@/lib/pages";
import { readPageKind } from "@/lib/page-kind";
import { contentDispositionInline } from "@/lib/pdf-filename";

// The mirror of /p/[slug]/raw's contract: that route refuses every row that is
// not html, this one refuses every row that is not pdf. Two routes rather than
// one handler switching on kind, because the two want different headers and one
// handler serving two content types under two header regimes is what a later
// edit gets wrong.
//
// There is deliberately NO Content-Security-Policy here. A CSP on a PDF
// response constrains the browser's own viewer, and what `default-src 'none'`
// does to PDFium or pdf.js cannot be verified from a terminal — a directive
// that breaks the viewer renders a blank frame, indistinguishable from a broken
// upload. The threat it would answer is small and bounded: a PDF may carry
// JavaScript, but a PDF script engine has no DOM and no access to this origin's
// cookies or storage, and these files are the teacher's own uploads behind a
// teacher-only control. If PDFs are ever opened to student upload, revisit this
// line first.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const page = await getPagePdf(slug);
  if (!page || readPageKind(page) !== "pdf" || page.pdf === null) {
    return new NextResponse("Not found", { status: 404 });
  }

  return new NextResponse(new Uint8Array(page.pdf), {
    headers: {
      "Content-Type": "application/pdf",
      // inline, so the browser opens its built-in viewer — which brings the
      // download, print, search and page controls this feature would otherwise
      // have to build. The filename is what that viewer's own download button
      // saves as.
      "Content-Disposition": contentDispositionInline(page.title, page.slug),
      // A mislabelled upload must never be re-interpreted as something
      // executable.
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
    },
  });
}
```

- [ ] **Step 2: Verify**

```bash
npm run typecheck
```

---

### Task 9: The `?printable=1` gate on the raw route

**Files:**
- Modify: `app/p/[slug]/raw/route.ts`

- [ ] **Step 1:** Import the bootstrap and read the parameter. The signature
  already takes the request; it is currently named `_request`, so rename it.

```ts
import { withPrintableBootstrap } from "@/lib/printable-bootstrap";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const page = await getPageBySlug(slug);
  if (!page || readPageKind(page) !== "html" || page.html === null) {
    return new NextResponse("Not found", { status: 404 });
  }

  // Gated, and the gate is the point. The shell frames this route WITH the
  // parameter so a student can print; the admin's <a download> and every
  // HtmlPreview thumbnail hit it WITHOUT, and get Jenn's bytes exactly as she
  // uploaded them. Injecting unconditionally would put our script into the file
  // she downloads to edit, and the next upload would carry it back in.
  const printable = new URL(request.url).searchParams.get("printable") === "1";
  const body = printable ? withPrintableBootstrap(page.html) : page.html;

  return new NextResponse(body, { headers: { /* unchanged */ } });
}
```

Note the guard changed from `readPageKind(page) === "link"` to
`readPageKind(page) !== "html"`, which is what makes it refuse a pdf row too.

- [ ] **Step 2:** Leave the CSP block, its comment, and every other header
  exactly as they are. `script-src 'unsafe-inline'` already admits the
  bootstrap; nothing about the policy needs to change, and the comment
  explaining why no directive admits `https:` is still true and still load-bearing.

- [ ] **Step 3: Verify**

```bash
npm run typecheck
```

---

### Task 10: The page shell — redirect, sandbox, pill

**Files:**
- Create: `components/PrintButton.tsx`
- Modify: `app/p/[slug]/page.tsx`

- [ ] **Step 1: The pill**

Create `components/PrintButton.tsx`:

```tsx
"use client";

import { PRINT_MESSAGE } from "@/lib/printable-bootstrap";

// The frame is found by id rather than through a ref so the shell can stay a
// server component and this button is the only thing shipped to the browser on
// this route. There is exactly one frame here, fixed to the viewport, so there
// is nothing for an id to be ambiguous about.
export const PAGE_FRAME_ID = "page-document";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => {
        const frame = document.getElementById(PAGE_FRAME_ID);
        if (!(frame instanceof HTMLIFrameElement)) return;
        // "*" because the frame's origin is opaque — there is no origin string
        // that would match it. The listener authenticates us from the other
        // side instead, by checking that the sender is its own parent.
        frame.contentWindow?.postMessage(PRINT_MESSAGE, "*");
      }}
      // "Imprimer ou enregistrer en PDF" and not "Télécharger": this opens the
      // browser's print dialog, where Save as PDF is a destination the student
      // chooses. Promising a download would be a promise the dialog can break.
      title="Imprimer ou enregistrer en PDF"
      aria-label="Imprimer ou enregistrer en PDF"
      className="fixed bottom-5 right-5 z-10 rounded-full border border-[var(--card-line)] bg-[var(--card-paper)] px-5 py-2.5 font-[family-name:var(--card-font-mono)] text-[11px] uppercase tracking-[2px] text-[var(--card-ink)] shadow-[var(--card-shadow)] transition-opacity hover:opacity-80 print:hidden"
    >
      PDF
    </button>
  );
}
```

`print:hidden` is for the case where a student presses Cmd-P on the shell rather
than the pill. The pill is not in the frame, so it cannot appear in the frame's
own printout.

- [ ] **Step 2: The shell**

Rewrite the body of `app/p/[slug]/page.tsx`:

```tsx
import { notFound, redirect } from "next/navigation";
import { PrintButton, PAGE_FRAME_ID } from "@/components/PrintButton";

  const kind = readPageKind(page);
  // A link row has no document to frame. 404 and not a redirect to page.url:
  // /p/ means a page we host, and an open redirect on a public route is a
  // phishing primitive.
  if (!page || kind === "link") notFound();

  // A pdf row cannot be served from here — bytes need a route handler and this
  // path is a page — so it redirects, and the PDF opens as a top-level
  // navigation in the browser's own viewer.
  //
  // That is the right outcome and not merely the available one. A PDF must not
  // be framed: iOS Safari renders only the first page of a framed PDF, which
  // would silently truncate every multi-page worksheet on the device most of
  // these students use.
  //
  // This is not the redirect forbidden above. That rule is about page.url, an
  // off-site string; this is a constant path on our own origin chosen by the
  // row's kind, with no input in it.
  if (kind === "pdf") redirect(`/p/${slug}/pdf`);

  return (
    <>
      <iframe
        id={PAGE_FRAME_ID}
        // WITH ?printable=1, so the document carries the print listener. Every
        // other consumer of this route — the admin's download, every preview
        // thumbnail — omits the parameter and gets Jenn's exact bytes.
        src={`/p/${slug}/raw?printable=1`}
        title={page.title}
        // `allow-scripts` WITHOUT `allow-same-origin` is still the whole
        // security model: the framed document gets an opaque origin, so its
        // JavaScript runs but it cannot read our cookies, our storage, or the
        // teacher session. The two together would let the page remove its own
        // sandbox — never add it.
        //
        // `allow-modals` is a different kind of token and is safe to add here.
        // It grants alert, confirm, prompt and print — no origin, no cookies,
        // no storage. window.print() is gated behind it, and without it the
        // call is ignored outright. The worst a hostile document gains is
        // blocking this tab with an alert loop, which the allow-scripts it
        // already has can do with `while (true)`.
        sandbox="allow-scripts allow-modals"
        className="fixed inset-0 h-full w-full border-0 bg-white"
      />
      <PrintButton />
    </>
  );
```

Keep `generateMetadata` as it is.

- [ ] **Step 3: Verify**

```bash
npm run typecheck
npm run lint
```

---

### Task 11: `pageTarget` — where a tile links

Three-way branching over `kind` is about to be duplicated in two components.
That is a rule, so it belongs in `lib/` with a test.

**Files:**
- Create: `lib/page-target.ts`
- Test: `tests/lib/page-target.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { pageTarget } from "@/lib/page-target";

describe("pageTarget", () => {
  it("sends an html page to its shell, in this tab", () => {
    expect(pageTarget({ kind: "html", slug: "verbes", url: null })).toEqual({
      href: "/p/verbes",
      newTab: false,
    });
  });

  it("sends a pdf straight to the bytes, in a new tab", () => {
    // The bytes and not /p/[slug]: that route only exists to redirect here, and
    // a tile that knows the destination should not make the browser ask twice.
    expect(pageTarget({ kind: "pdf", slug: "tableau", url: null })).toEqual({
      href: "/p/tableau/pdf",
      newTab: true,
    });
  });

  it("sends a link off-site, in a new tab", () => {
    expect(
      pageTarget({ kind: "link", slug: "doc", url: "https://example.com/a" }),
    ).toEqual({ href: "https://example.com/a", newTab: true });
  });

  it("gives a link with no url a dead href rather than throwing", () => {
    // readPageKind can call a row a link on the strength of the kind column
    // alone, so a url-less link row is reachable. A shelf must still render.
    expect(pageTarget({ kind: "link", slug: "doc", url: null })).toEqual({
      href: "#",
      newTab: true,
    });
  });
});
```

- [ ] **Step 2: Implement**

```ts
import type { PageKind } from "@/lib/page-kind";

export type PageTarget = { href: string; newTab: boolean };

// Both page lists render the same tile and were both about to grow the same
// three-way ternary. The rule is that only an html page opens in this tab: a
// link is off-site, and a PDF opens in a new one so the shelf a student is
// browsing stays where they left it.
export function pageTarget(page: {
  kind: PageKind;
  slug: string;
  url: string | null;
}): PageTarget {
  if (page.kind === "link") return { href: page.url ?? "#", newTab: true };
  if (page.kind === "pdf") return { href: `/p/${page.slug}/pdf`, newTab: true };
  return { href: `/p/${page.slug}`, newTab: false };
}
```

- [ ] **Step 3: Verify**

```bash
npx vitest run tests/lib/page-target.test.ts
```

- [ ] **Step 4: Extend `tests/lib/page-filters.test.ts`** with a `"pdf"` filter
  case. `filterPagesByKind` itself needs no change — it is generic over
  `{ kind: PageKind }` — and the test is there to say so.

---

### Task 12: `FileDropZone` — one control, two kinds

**Files:**
- Create: `components/ui/FileDropZone.tsx`
- Delete: `components/admin/HtmlDropZone.tsx`

- [ ] **Step 1:** Copy `HtmlDropZone` to `components/ui/FileDropZone.tsx` and
  change four things. Keep every existing comment — the double-click
  `stopPropagation`, the deliberate absence of `role="button"`, and the
  `hasExisting` explanation are all still exactly right.

1. Rename the component to `FileDropZone`.
2. `onFile` becomes `(file: File) => void` — it no longer reads the file. The
   caller decides whether to read text or keep bytes.
3. Drop the size check and the `onError` prop. The zone cannot enforce a cap it
   does not know: the caps differ by kind and the zone does not decide kind.
   Add a comment saying so.
4. Take the copy as props — `emptyHint`, `existingHint`, `accept`, `inputLabel`
   — so the strings live with the caller that knows what it accepts.

```tsx
export function FileDropZone({
  fileName,
  fileSize,
  hasExisting,
  accept,
  inputLabel,
  emptyHint,
  existingHint,
  onFile,
}: {
  fileName: string | null;
  fileSize: number | null;
  hasExisting: boolean;
  accept: string;
  inputLabel: string;
  emptyHint: string;
  existingHint: string;
  // The file, unread. Enforcing a size cap here would mean knowing which cap
  // applies, and that is a question about the file's kind, which the caller
  // resolves.
  onFile: (file: File) => void;
}) {
```

- [ ] **Step 2:** Verify no import of `HtmlDropZone` survives.

```bash
grep -rn "HtmlDropZone" --include="*.tsx" --include="*.ts" .
```

---

### Task 13: `PageEditor` becomes kind-aware

**Files:**
- Modify: `components/admin/PageEditor.tsx`

- [ ] **Step 1: Props**

```tsx
export function PageEditor({
  groups,
  initial,
  defaultGroupId,
  submitLabel,
  onSubmit,
  onSubmitPdf,
  onDelete,
}: {
  groups: PageEditorGroup[];
  initial?: {
    title: string;
    html: string;
    groupIds: string[];
    kind: PageKind;
    pdfSize: number | null;
  };
  defaultGroupId?: string | null;
  submitLabel: string;
  onSubmit: (input: PageInput) => Promise<unknown>;
  // Separate from onSubmit because the payloads differ in kind, not just in
  // shape: a document is a string and a PDF is bytes in FormData.
  onSubmitPdf: (formData: FormData) => Promise<unknown>;
  onDelete?: () => Promise<void>;
})
```

- [ ] **Step 2: State**

```tsx
  // Which kind the staged file is. Starts from the existing row on the edit
  // screen, and follows whatever she drops after that — replacing an html page
  // with a PDF at the same slug is coherent and savePage writes every content
  // column, so nothing is left behind.
  const [kind, setKind] = useState<PageKind>(initial?.kind ?? "html");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
```

- [ ] **Step 3: `handleFile` branches on the file**

```tsx
  // The file never reaches the server from here for an html page — it is read
  // in the browser and the text goes into state, so the source stays editable
  // by re-uploading. A PDF is held unread: there is nothing to edit, and
  // reading 3 MB into a string to hand it back as bytes would be waste.
  async function handleFile(file: File) {
    setError(null);

    const isPdf =
      file.type === "application/pdf" || /\.pdf$/i.test(file.name);

    if (isPdf) {
      // The cap is checked again on the server, which is the authority. This is
      // the same client-side courtesy HtmlDropZone always did: telling her
      // before a 3 MB upload rather than after.
      if (file.size > MAX_PDF_BYTES) {
        setError("That PDF is larger than 3 MB.");
        return;
      }
      setKind("pdf");
      setPdfFile(file);
      setHtml("");
    } else {
      if (file.size > MAX_PAGE_BYTES) {
        setError("That page is larger than 2 MB.");
        return;
      }
      setKind("html");
      setPdfFile(null);
      setHtml(await file.text());
    }

    setFileName(file.name);
    setFileSize(file.size);
    if (!title || titleFromFile) {
      setTitle(file.name.replace(/\.(html?|pdf)$/i, ""));
      setTitleFromFile(true);
    }
  }
```

- [ ] **Step 4: Submit dispatches on kind**

```tsx
      if (kind === "pdf") {
        const formData = new FormData();
        formData.set("title", title);
        for (const id of groupIds) formData.append("groupIds", id);
        // Absent when she is editing a stored PDF's title or audience without
        // choosing a new file. The action reads that as "leave the bytes".
        if (pdfFile) formData.set("pdf", pdfFile);
        await onSubmitPdf(formData);
      } else {
        await onSubmit({ title, html, groupIds });
      }
```

On a successful create, reset `pdfFile` to `null` and `kind` to `"html"`
alongside the existing resets.

- [ ] **Step 5: The submit button's disabled rule**

Currently `html.trim() === ""`. It becomes:

```tsx
  // Something to save: a staged file of either kind, or an existing row whose
  // title or audience is being changed.
  const hasContent =
    kind === "pdf"
      ? pdfFile !== null || Boolean(initial)
      : html.trim() !== "";
```

- [ ] **Step 6: The drop zone**

```tsx
      <div className="text-sm font-medium text-[var(--color-ink)]">
        Page file
        <FileDropZone
          fileName={fileName}
          fileSize={fileSize ?? initial?.pdfSize ?? null}
          hasExisting={Boolean(initial)}
          accept=".html,.htm,.pdf,text/html,application/pdf"
          inputLabel="HTML or PDF file to publish"
          emptyHint="Drop an HTML page or a PDF here, or click to choose one"
          existingHint="A file is published. Drop a new one to replace it."
          onFile={handleFile}
        />
      </div>
```

- [ ] **Step 7: Verify**

```bash
npm run typecheck
npm run lint
```

---

### Task 14: The tiles, the previews and the filter

**Files:**
- Create: `components/ui/PdfPreview.tsx`
- Modify: `components/ui/PageTile.tsx`, `components/ui/KindFilter.tsx`,
  `components/admin/PageList.tsx`, `components/student/FilesTab.tsx`

- [ ] **Step 1: `PdfPreview`**

```tsx
import { BrandGlyph } from "@/components/ui/BrandGlyph";
import { formatFileSize } from "@/lib/file-size";
import { cn } from "@/lib/utils";

// The third renderer for PageTile's `preview` slot, and the second one to cash
// in the decision to make that slot a ReactNode. It is LinkPreview's shape: the
// PDF glyph that has existed since links could be PDFs, over a caption where
// the link's is its host.
//
// A rendered first page would be a better thumbnail. It would also need pdf.js
// running a dozen times on one shelf, which is the trade the preview frames
// already refuse.
export function PdfPreview({
  size,
  className,
}: {
  size: number | null;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex aspect-[4/3] flex-col items-center justify-center gap-2 bg-[var(--card-paper-back)]",
        className,
      )}
    >
      <BrandGlyph brand="pdf" />
      {size !== null && (
        <span className="font-[family-name:var(--card-font-mono)] text-[10px] uppercase tracking-[1px] text-[var(--card-moss)]">
          {formatFileSize(size)}
        </span>
      )}
    </div>
  );
}
```

- [ ] **Step 2: `PageTile`'s `external` becomes `newTab`**

Rename the prop and rewrite its comment. The behaviour does not change; the name
does, because passing something called `external` for a route on our own origin
would make the comment false, and the comments here are load-bearing.

```tsx
  // Opens in a new tab. Two cases: an off-site link, and a PDF of ours — a
  // student browsing a shelf should not lose it to a document. Either way the
  // title has to become a plain <a> rather than a next/link <Link>, and it must
  // carry rel="noopener": without it an off-site page gets a window.opener
  // handle back to this tab and can navigate it somewhere else while the
  // student is reading (reverse tabnabbing). It costs nothing on our own
  // origin, so the same branch serves both.
  newTab?: boolean;
```

Also update the `preview` prop's comment: it predicted links, links happened,
and PDFs are now the third renderer — so the sentence about support "being
planned" is stale.

- [ ] **Step 3: `KindFilter` gains a chip**

`labels` gains `pdf: string`, and `options` a third entry. Two lines, because
the labels were passed in rather than switched on a locale flag — which is what
that component's comment predicted.

- [ ] **Step 4: Both lists**

In `PageList.tsx` and `FilesTab.tsx`:

```tsx
const target = pageTarget(page);
```

```tsx
  href={target.href}
  newTab={target.newTab}
  preview={
    page.kind === "link" && page.url ? (
      <LinkPreview url={page.url} />
    ) : page.kind === "pdf" ? (
      <PdfPreview size={page.pdfSize} />
    ) : (
      <HtmlPreview slug={page.slug} />
    )
  }
```

Both `PageSummary` (admin) and `ShelfPage` (student) gain `pdfSize: number | null`.

Chip labels: `pdf: "PDFs"` in the admin, `pdf: "Les PDF"` on the shelf.

- [ ] **Step 5: The admin's per-tile controls**

In `PageList.tsx`, the edit and download icons are gated on
`page.kind === "html"`. A pdf row supports both, so the gate becomes
`page.kind !== "link"`, and the download's target follows the kind:

```tsx
  {/* A link has no document to edit or download, so it gets neither control
      rather than two that fail. A PDF has both: editing replaces the file or
      changes the audience, and the download is the same <a download> pointed
      at the bytes. */}
  {page.kind !== "link" && (
    <>
      <Link href={`/admin/pages/${page.slug}`} …>
      <a
        href={page.kind === "pdf" ? `/p/${page.slug}/pdf` : `/p/${page.slug}/raw`}
        download={`${page.slug}.${page.kind === "pdf" ? "pdf" : "html"}`}
        …
      >
    </>
  )}
```

- [ ] **Step 6: Verify**

```bash
npm run typecheck
npm run lint
```

---

### Task 15: Admin wiring

**Files:**
- Modify: `components/admin/PagesTabClient.tsx`, `app/admin/page.tsx`,
  `app/admin/pages/[slug]/page.tsx`

- [ ] **Step 1: `PagesTabClient`** takes `onCreatePdfPage: (formData: FormData)
  => Promise<unknown>` and passes it to `PageEditor` as `onSubmitPdf`. Its
  `AdminPage` type gains `pdfSize`.

- [ ] **Step 2: `app/admin/page.tsx`** passes `createPdfPage` alongside
  `createPage`.

- [ ] **Step 3: `app/admin/pages/[slug]/page.tsx`**

The guard narrows from "html only" to "not a link":

```tsx
  // A link has no document, so there is nothing here to edit. 404 rather than
  // rendering an upload form over a row that can never accept one. A pdf row
  // can: replacing the file, the title or the audience all belong here.
  if (!page || page.kind === "link") notFound();
```

And the editor gets the kind:

```tsx
        <PageEditor
          groups={groups}
          initial={{
            title: page.title,
            // Empty for a pdf row, which has no document to hold. The kind
            // below is what decides which of the two the form submits.
            html: page.html ?? "",
            groupIds: page.groupIds,
            kind: page.kind,
            pdfSize: page.pdfSize,
          }}
          submitLabel="Save page"
          onSubmit={updatePage.bind(null, page.slug)}
          onSubmitPdf={updatePdfPage.bind(null, page.slug)}
          onDelete={deletePage.bind(null, page.slug)}
        />
```

The comment above `html: page.html ?? ""` currently claims the guard narrows it
to a non-null document. That stops being true here — replace it, do not leave it.

- [ ] **Step 4: Verify**

```bash
npm run typecheck
npm run lint
npm test
```

---

### Task 16: Documentation

**Files:**
- Modify: `CLAUDE.md`, `docs/DEPLOYMENT.md`, `tools/README.md`

- [ ] **Step 1: `CLAUDE.md` routes table** — add:

```
| `POST /api/pages` | token | publishes a page from outside the browser |
| `/p/[slug]/pdf` | public | an uploaded PDF, in the browser's own viewer |
```

- [ ] **Step 2: `CLAUDE.md`, *Files: pages and links*.** The section opens *"A
  `Page` is one of two things"*. It is now three. Cover, in the section's own
  voice:

- The third kind, the `pdf`/`pdfSize` columns, and that exactly one content
  column is populated.
- Why the bytes are in SQLite: the nightly `VACUUM INTO` covers a column and
  not a directory.
- Why `pdfSize` is a column and not `pdf.length` — `readPageKind` needs a signal
  the shelf queries can afford to select, the same reason it reads `url` and not
  `html`. And that `pdfSize` is a **required** argument so the compiler names
  every query that must select it.
- **A PDF is never framed.** iOS Safari shows only its first page in an iframe.
  `/p/[slug]` redirects a pdf row to `/p/[slug]/pdf` so it opens top-level in
  the browser's own viewer, and that redirect is not the open redirect a link
  row is refused: it is a constant path on our origin with no input in it.
- The PDF response carries no CSP, and why that is deliberate.
- Uploading a PDF is teacher-only; students keep `addShelfLink` and nothing more.
- `MAX_PDF_BYTES` is 3 MB **because** nginx's `client_max_body_size` is 4m, and
  raising one means raising the other on the server by hand.
- Bytes travel as a `File` in `FormData`, which is a deliberate exception to the
  rule that a page action takes a string — base64 would not fit the budget.
- `updatePageMeta` exists so a rename does not rewrite a 3 MB blob, and so
  `savePage`'s every-column invariant keeps no exceptions.

- [ ] **Step 3: `CLAUDE.md`, the `/p/[slug]` sandbox paragraph.** It currently
  says the sandbox is `allow-scripts` and that adding `allow-same-origin` is
  forbidden. Both stay. Add:

- The sandbox is `allow-scripts allow-modals`, and `window.print()` is gated
  behind the second token.
- Why the two tokens are not comparable: `allow-same-origin` beside
  `allow-scripts` lets the page delete its own sandbox; `allow-modals` grants
  dialogs and printing and no origin access, and its worst case is a nuisance
  `allow-scripts` could already cause.
- The `?printable=1` gate: the shell frames the route with it, the admin's
  download and every preview thumbnail hit it without, and that is what keeps
  the download byte-identical to what Jenn uploaded.
- The print trigger is a `postMessage`, **not** a reload of the frame — a reload
  would destroy a student's typed-in answers at the moment they were trying to
  keep them.
- The listener checks `event.source === window.parent` rather than
  `event.origin`, because an opaque origin has no origin string to compare.
- Print fidelity is the browser's, and the fix for a page that prints badly is
  `@media print` rules in that page, not code here.

- [ ] **Step 4: `docs/DEPLOYMENT.md` item 11** — one sentence tying
  `client_max_body_size 4m` to both `MAX_PAGE_BYTES` and `MAX_PDF_BYTES`, so the
  next person to raise the PDF cap finds the server-side step from the constant
  rather than from a 413.

- [ ] **Step 5: `tools/README.md`** — a short note that a page which has to
  print exactly should carry `@media print` rules, and that
  `tools/html-to-pdf.swift` renders a paginated PDF locally when a guaranteed
  layout matters more than a live page.

---

### Task 17: Full verification

- [ ] **Step 1: The CI sequence, in CI's order**

```bash
npx prisma generate
npm run lint
npm run typecheck
npm test
npm run build
```

All five must pass. This is the sequence `.github/workflows/ci.yml` runs.

- [ ] **Step 2: Nothing regressed in what the routes refuse**

Start the dev server, then, with an existing **html** page's slug in `SLUG`:

```bash
# 1. The raw route is unchanged without the parameter — Jenn's exact bytes,
#    no script. This is the admin's download path.
curl -s "http://localhost:3000/p/$SLUG/raw" | grep -c "print-page"      # 0

# 2. With the parameter, the listener is there and the document still starts
#    the way it did.
curl -s "http://localhost:3000/p/$SLUG/raw?printable=1" | grep -c "print-page"  # 1

# 3. An html row has no PDF to serve.
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/p/$SLUG/pdf"    # 404

# 4. The CSP is untouched.
curl -s -D- -o /dev/null "http://localhost:3000/p/$SLUG/raw" | grep -i "content-security-policy"
```

- [ ] **Step 3: The PDF path**

Upload a PDF from `/admin?tab=pages` — drop a real `.pdf` into the same zone
that takes HTML. Then, with the new slug in `PDF_SLUG`:

```bash
# Content type, disposition and nosniff.
curl -s -D- -o /dev/null "http://localhost:3000/p/$PDF_SLUG/pdf" | \
  grep -iE "content-type|content-disposition|x-content-type-options"
# Expect: application/pdf; inline; filename="<title>.pdf"; filename*=UTF-8''<title>.pdf; nosniff

# The shell redirects rather than framing.
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" \
  "http://localhost:3000/p/$PDF_SLUG"
# Expect: 307 (or 308) .../p/<slug>/pdf

# The bytes really are a PDF.
curl -s "http://localhost:3000/p/$PDF_SLUG/pdf" | head -c 5    # %PDF-

# A pdf row is not served as a document.
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/p/$PDF_SLUG/raw"  # 404
```

Then check, in the admin: an over-cap PDF is refused with *"That PDF is larger
than 3 MB."*; an `.html` file renamed `.pdf` is refused with *"That doesn't look
like a PDF."*; saving the PDF page with a new title and no new file keeps the
document; and the tile shows the red PDF glyph with a size under it.

- [ ] **Step 4: What only a browser can tell you.** Hand these to a human — they
  cannot be checked from a terminal, and the code compiling says nothing about
  any of them.

1. **Printing works.** Open an html page at `/p/<slug>`, press the PDF pill.
   The print dialog opens, and the preview shows the **whole** document
   paginated — not one clipped page. Chrome and Safari both.
2. **Printing preserves state.** Open a page with an input in it, type into it,
   then press the pill. The typed text must be in the print preview. This is the
   property the whole `postMessage` design exists for; if it fails, something
   reloaded the frame.
3. **The download is still clean.** Download the page from the admin, open the
   file in a text editor, and confirm it contains no `print-page` listener.
4. **A PDF on a real iPhone.** Open a multi-page PDF from a shelf in iOS Safari.
   Every page must be reachable — this is the reason it is a redirect and not an
   iframe. Confirm the viewer's own download button saves it with a sensible
   filename, accents included.
5. **Print fidelity on a real worksheet.** Expected to be imperfect. If it is
   bad enough to be unusable, the `@media print` note from Task 16 needs to
   become a stronger instruction to the Claude that writes these pages, not code
   here.

- [ ] **Step 5: Commit.**

---

## Coverage Check

| Spec section | Tasks |
|---|---|
| 1 · Printing a page to PDF | 3, 9, 10 |
| 2 · A PDF is a third kind of page | 4, 5, 6 |
| 3 · Serving and opening a PDF | 2, 8, 10 |
| 4 · Uploading a PDF | 1, 7, 12, 13 |
| 5 · The shelf and the admin | 11, 14, 15 |
| Testing | 1, 2, 3, 5, 11 |
| Documentation | 16 |

Every file in the spec's Scope appears in the File Structure table above, plus
`lib/page-target.ts` and its test, which the spec's Scope lists as well.

## What this plan does not do

Stated so the next person does not read absence as oversight — each is argued in
the spec's Non-goals:

- No server-side or client-side HTML-to-PDF renderer.
- `POST /api/pages` stays HTML-only.
- No companion PDF stored beside an HTML page. It becomes a small follow-on once
  the storage and serving here exist, and it needs a drift rule first.
- Students cannot upload PDFs.
- No rendered first-page thumbnail for a PDF tile.
