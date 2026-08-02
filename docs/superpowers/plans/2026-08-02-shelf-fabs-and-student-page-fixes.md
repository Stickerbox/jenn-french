# Shelf FABs, Cached Previews and Student-Page Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix six collected complaints — uncached page previews, four scattered add-forms, an anonymous student page, a three-deep header, a two-field link form, and a card tab the teacher has no use for.

**Architecture:** Four new pure modules in `lib/` carry every new rule (a cache token, two title derivations, a greeting). One conditional `Cache-Control` on `/p/[slug]/raw` keyed to a `?v=` that must match the row's own `updatedAt` token. Every add-form collapses into one floating button per surface: an admin FAB that also becomes the owner of the student chip it needs, and a student FAB beside the chat button. No dependency, no migration.

**Tech Stack:** Next.js 16 (App Router), React 19, Prisma + SQLite, Tailwind v4 via PostCSS (no `tailwind.config`), Vitest, TypeScript.

**Design spec:** `docs/superpowers/specs/2026-08-02-shelf-fabs-and-student-page-fixes-design.md` — **read it before starting.** It records why each of these choices was made and which alternatives were rejected.

---

## Global Constraints

- **Imports use the `@/` alias** for repo-root-relative paths. Never a relative `../../`.
- **Logic belongs in `lib/`** as pure functions with a test in `tests/lib/`. Components and Prisma access are *not* unit-tested in this repo — **do not add component tests**, and do not add a testing-library dependency.
- **Comments explain the "why", especially the counter-intuitive.** Most comments in this codebase record a decision and the failure that motivated it. Match that. Do not add comments that restate the code.
- **Two palettes.** The admin app uses `--color-*`; the flashcard template uses `--card-*`. Student-facing surfaces (`/g/[slug]`, `/f/[token]`, both page grids, `Tile`, `PageTile`) use `--card-*`. Do not mix them.
- **Repeated flashcard class strings live in `components/card-styles.ts`** — extend that file rather than duplicating strings.
- **"Student" is the UI word, "Group" is the code word.** `group` in `lib/`, `prisma/` and route segments; `student` in copy and in new modules with no reason to touch the model.
- **Never add `allow-same-origin`** to the sandbox on `/p/[slug]`, and **never add `allow-scripts`** to a preview frame. Neither sandbox attribute changes anywhere in this plan.
- **Do not touch the CSP** in `app/p/[slug]/raw/route.ts`. This plan adds headers beside it; it changes no directive inside it.
- **Do not touch `prisma/schema.prisma`.** There is no migration in this plan — `updatedAt` and `addedByStudent` both already exist.
- **Server actions:** every mutating action in `app/actions.ts` and `app/page-actions.ts` starts with an authorisation check. Any new one must too.
- **Verification commands**, in CI order: `npm run lint`, `npx tsc --noEmit`, `npm test`, `npm run build`. Every task ends green on at least `npm test` and `npx tsc --noEmit`.
- **Steps headed "Manual check" need a human with a browser.** If you are executing this without one, **do not skip them silently and do not claim they passed.** Run the automated checks, then list the outstanding manual checks verbatim in your final report so the human can walk them. Task 17 Step 4 gives `curl` equivalents for the parts that can be verified headlessly; the rest are genuinely visual.

## Task Order and Why

Tasks 1–6 are pure modules with no callers yet, so they land in any order and cannot break the build. Tasks 7–8 change types that components depend on, so each one updates its callers **in the same commit** — otherwise `tsc` fails at the commit boundary. Tasks 9–18 build UI bottom-up: primitives, then the two surfaces, then docs.

## File Structure

**New — pure modules (one rule each, all tested):**

| File | Responsibility |
|---|---|
| `lib/page-version.ts` | `Page.updatedAt` → a short cache token |
| `lib/page-title.ts` | a pasted document → a title |
| `lib/link-title.ts` | a URL → a title |
| `lib/student-greeting.ts` | a student's name → "Bonjour Marie" |

**New — shared UI primitives (no domain knowledge):**

| File | Responsibility |
|---|---|
| `components/ui/Fab.tsx` | the round floating button, shared by both FABs and the chat |
| `components/ui/AddMenu.tsx` | the popover of 2–3 choices |
| `components/ui/AddSheet.tsx` | the modal a chosen form renders into |
| `components/ui/HtmlPasteBox.tsx` | paste a document, validate it, never show it |

**New — surface-specific:**

| File | Responsibility |
|---|---|
| `components/admin/AdminChrome.tsx` | owns the student chip, provides it as context, renders the admin FAB |
| `components/admin/NewPageForm.tsx` | the admin sheet's create-a-page form |
| `components/student/ShelfFab.tsx` | the student FAB and its two French forms |
| `components/student/CardHeading.tsx` | the ⚜ eyebrow and week range, relocated |

**Deleted:** `components/admin/HtmlDropZone.tsx`, `components/admin/Collapsible.tsx`, `components/student/AddLinkRow.tsx`.

---

### Task 0: Commit the design documents

The spec and this plan were written in a working copy that had no `.git`. Land them first so every later commit has the reasoning behind it already in history.

**Files:**
- Commit: `docs/superpowers/specs/2026-08-02-shelf-fabs-and-student-page-fixes-design.md`
- Commit: `docs/superpowers/plans/2026-08-02-shelf-fabs-and-student-page-fixes.md`

- [ ] **Step 1: Confirm you are not on the default branch**

Run: `git rev-parse --abbrev-ref HEAD`

If it prints `main`, create a branch first:

```bash
git checkout -b shelf-fabs-and-student-page-fixes
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-08-02-shelf-fabs-and-student-page-fixes-design.md docs/superpowers/plans/2026-08-02-shelf-fabs-and-student-page-fixes.md
git commit -m "$(cat <<'EOF'
docs: spec and plan for shelf FABs, cached previews and student-page fixes

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
)"
```

---

### Task 1: The preview cache token

`/p/[slug]/raw` will serve an immutable response only when the request's `?v=` matches the token computed from the row it just loaded. One function computes it for both sides, so the URL builder and the header decision can never disagree.

**Files:**
- Create: `lib/page-version.ts`
- Test: `tests/lib/page-version.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `pageVersion(updatedAt: Date): string`. Task 7 calls it from the route and from both preview call sites.

- [ ] **Step 1: Write the failing test**

Create `tests/lib/page-version.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { pageVersion } from "@/lib/page-version";

describe("pageVersion", () => {
  it("is stable for the same instant", () => {
    const a = pageVersion(new Date("2026-08-02T10:00:00Z"));
    const b = pageVersion(new Date("2026-08-02T10:00:00Z"));
    expect(a).toBe(b);
  });

  it("changes when the page is edited", () => {
    const before = pageVersion(new Date("2026-08-02T10:00:00Z"));
    const after = pageVersion(new Date("2026-08-02T10:00:01Z"));
    expect(after).not.toBe(before);
  });

  it("is short and URL-safe", () => {
    const token = pageVersion(new Date("2026-08-02T10:00:00Z"));
    expect(token).toMatch(/^[a-z0-9]+$/);
    expect(token.length).toBeLessThan(12);
  });

  // A malformed Date must not produce the string "NaN" and then MATCH another
  // malformed one, which would hand a caller an immutable header keyed to
  // nothing at all.
  it("refuses an invalid date rather than tokenising it", () => {
    expect(pageVersion(new Date("nonsense"))).toBe("");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/page-version.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/page-version"`.

- [ ] **Step 3: Write the implementation**

Create `lib/page-version.ts`:

```ts
// The cache key for a page's preview. Base 36 rather than the raw millisecond
// count only to keep it short: this string is appended to every tile's iframe
// src, and a shelf renders a dozen of them.
//
// An invalid Date returns "" rather than "NaN". The route compares the request's
// ?v= against this, and two invalid dates producing the same non-empty token
// would make a mismatch look like a match — the one comparison that must never
// give a false positive, because a false positive is a year-long immutable
// header on the wrong document.
export function pageVersion(updatedAt: Date): string {
  const ms = updatedAt.getTime();
  if (!Number.isFinite(ms)) return "";
  return ms.toString(36);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/page-version.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/page-version.ts tests/lib/page-version.test.ts
git commit -m "$(cat <<'EOF'
feat: add pageVersion, the preview cache token

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: A title from a pasted document

Pasting a page saves it immediately, so the title has to come from the document itself. `<title>` first, then the first `<h1>`.

**Files:**
- Create: `lib/page-title.ts`
- Test: `tests/lib/page-title.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `titleFromHtml(html: string): string | null`. Task 8 calls it from `createPage` and `addShelfPage`.

- [ ] **Step 1: Write the failing test**

Create `tests/lib/page-title.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { titleFromHtml } from "@/lib/page-title";

describe("titleFromHtml", () => {
  it("prefers the document title", () => {
    expect(
      titleFromHtml("<html><head><title>Verb Drills</title></head><body><h1>Nope</h1></body></html>"),
    ).toBe("Verb Drills");
  });

  it("falls back to the first h1", () => {
    expect(titleFromHtml("<body><h1>Les verbes</h1><h1>Second</h1></body>")).toBe(
      "Les verbes",
    );
  });

  it("strips markup from inside the heading", () => {
    expect(titleFromHtml("<h1><span>Les</span> <em>verbes</em></h1>")).toBe(
      "Les verbes",
    );
  });

  // Tags are stripped BEFORE entities are decoded. The other order would turn
  // "&lt;b&gt;" into "<b>" and then strip it, losing text the author escaped
  // on purpose.
  it("decodes entities after stripping, not before", () => {
    expect(titleFromHtml("<title>a &lt;b&gt; c</title>")).toBe("a <b> c");
  });

  it("decodes the entities that actually turn up in a title", () => {
    expect(titleFromHtml("<title>Maths &amp; French &quot;notes&quot;</title>")).toBe(
      'Maths & French "notes"',
    );
  });

  it("collapses whitespace, including across newlines", () => {
    expect(titleFromHtml("<title>\n  Les    verbes\n</title>")).toBe("Les verbes");
  });

  it("is case-insensitive about the tag", () => {
    expect(titleFromHtml("<TITLE>Shouty</TITLE>")).toBe("Shouty");
  });

  it("skips an empty title and keeps looking", () => {
    expect(titleFromHtml("<title>   </title><h1>Real one</h1>")).toBe("Real one");
  });

  it("returns null when the document names itself nowhere", () => {
    expect(titleFromHtml("<div>just a div</div>")).toBeNull();
  });

  // The title becomes a slug, and a slug is a URL students bookmark.
  it("caps the length", () => {
    const long = "x".repeat(300);
    expect(titleFromHtml(`<title>${long}</title>`)?.length).toBe(120);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/page-title.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/page-title"`.

- [ ] **Step 3: Write the implementation**

Create `lib/page-title.ts`:

```ts
const MAX_TITLE_LENGTH = 120;

// The five that matter in a title, plus nbsp. Not a general entity table:
// anything else stays literal, which is a cosmetic wrong rather than a broken
// one, and React escapes the result on the way out either way.
const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&nbsp;": " ",
};

function clean(inner: string): string | null {
  // Strip first, decode second. Decoding first would turn an author's escaped
  // "&lt;b&gt;" into a real tag and then delete it.
  const text = inner
    .replace(/<[^>]*>/g, "")
    .replace(/&(?:amp|lt|gt|quot|#39|nbsp);/g, (m) => ENTITIES[m] ?? m)
    .replace(/\s+/g, " ")
    .trim();

  if (!text) return null;
  return text.slice(0, MAX_TITLE_LENGTH);
}

// A regex, not a parser. The same posture lib/inline-markup.ts takes: this runs
// on a document nobody validated, a wrong answer here is cosmetic, and the
// caller already has a fallback. Pulling in a DOM parser to name a file would
// be the project's first utility dependency.
export function titleFromHtml(html: string): string | null {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (title) {
    const text = clean(title[1]);
    if (text) return text;
  }

  const heading = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  if (heading) {
    const text = clean(heading[1]);
    if (text) return text;
  }

  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/page-title.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/page-title.ts tests/lib/page-title.test.ts
git commit -m "$(cat <<'EOF'
feat: derive a page title from a pasted document

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: A title from a URL

The link form drops to one field, so the title is derived from the URL string. **No request is made** — see the spec's item 5 for why fetching the real `<title>` was rejected.

**Files:**
- Create: `lib/link-title.ts`
- Test: `tests/lib/link-title.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `titleFromUrl(url: string): string`. Task 8 calls it from `validateLink`.

- [ ] **Step 1: Write the failing test**

Create `tests/lib/link-title.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { titleFromUrl } from "@/lib/link-title";

describe("titleFromUrl", () => {
  it("names a page after its last path segment", () => {
    expect(titleFromUrl("https://example.com/docs/verb-conjugation.pdf")).toBe(
      "Verb Conjugation",
    );
  });

  it("treats underscores as separators too", () => {
    expect(titleFromUrl("https://example.com/Lesson_3_Notes")).toBe(
      "Lesson 3 Notes",
    );
  });

  it("skips routing words and keeps looking leftwards", () => {
    expect(titleFromUrl("https://example.com/passe-compose/edit")).toBe(
      "Passe Compose",
    );
  });

  // A segment with digits and no separator is an id, not a name. This is the
  // case the whole rule exists for: a Google Doc URL is a key and a verb.
  it("falls back to the host for a Google Doc", () => {
    expect(
      titleFromUrl("https://docs.google.com/document/d/1AbCdEfGh2IjKl/edit"),
    ).toBe("docs.google.com");
  });

  it("falls back to the host for a short opaque id", () => {
    expect(titleFromUrl("https://youtu.be/xY12ab")).toBe("youtu.be");
  });

  it("falls back to the host when there is no path at all", () => {
    expect(titleFromUrl("https://www.lemonde.fr/")).toBe("lemonde.fr");
  });

  it("ignores a trailing slash", () => {
    expect(titleFromUrl("https://example.com/les-articles/")).toBe(
      "Les Articles",
    );
  });

  it("ignores a query string and a fragment", () => {
    expect(titleFromUrl("https://example.com/les-articles?p=2#top")).toBe(
      "Les Articles",
    );
  });

  it("skips a purely numeric segment", () => {
    expect(titleFromUrl("https://example.com/les-verbes/2026")).toBe(
      "Les Verbes",
    );
  });

  it("decodes a percent-encoded segment", () => {
    expect(titleFromUrl("https://example.com/le%20passe%20compose")).toBe(
      "Le Passe Compose",
    );
  });

  // parseLinkUrl runs before this and guarantees a parseable URL, but a pure
  // function handed junk must return something rather than throw.
  it("returns the input when it cannot be parsed", () => {
    expect(titleFromUrl("not a url")).toBe("not a url");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/link-title.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/link-title"`.

- [ ] **Step 3: Write the implementation**

Create `lib/link-title.ts`:

```ts
const MAX_TITLE_LENGTH = 80;

// Words that route rather than name. A URL ending in one of these is telling
// you what to do with the page, not what the page is.
const NOISE = new Set([
  "edit", "view", "preview", "index", "home", "default",
  // Single letters are Google's path furniture: /document/d/<id>/edit.
  "d", "e", "u", "p",
]);

// A segment names something when it either has a separator in it — which an
// opaque key almost never does — or is made only of letters. A run of letters
// AND digits with nothing between them is an id: "1AbCdEfGh2IjKl", "xY12ab".
//
// Known imperfection, accepted: a short all-letter id like "xyz" passes this
// and becomes the title "Xyz". Tightening it far enough to catch that also
// catches real one-word names like "verbes", which is the worse trade.
function names(segment: string): boolean {
  if (!segment) return false;
  if (NOISE.has(segment.toLowerCase())) return false;
  if (!/[a-zA-ZÀ-ɏ]/.test(segment)) return false;
  if (/[-_]/.test(segment)) return true;
  return !/\d/.test(segment);
}

// Capitalises each word and leaves the rest of it alone: "Lesson_3_Notes"
// should stay "Lesson 3 Notes", not become "Lesson 3 notes".
function titleCase(value: string): string {
  return value.replace(/\S+/g, (word) => word[0].toUpperCase() + word.slice(1));
}

// Derived from the URL string alone. NO REQUEST IS MADE — not by the server,
// not by the browser. Fetching the page to read its real <title> would be
// request forgery on a student-supplied URL, and for the case links exist to
// serve (a Google Doc that is not public) it would return "Sign in".
export function titleFromUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }

  const segments = parsed.pathname.split("/").filter(Boolean);

  // Rightmost first: the last meaningful segment is the page, the ones left of
  // it are the folders it sits in.
  for (let i = segments.length - 1; i >= 0; i -= 1) {
    let segment: string;
    try {
      segment = decodeURIComponent(segments[i]);
    } catch {
      // A stray % is not a reason to give up on the segment.
      segment = segments[i];
    }

    // The extension is how the file was saved, not what it is called.
    const withoutExtension = segment.replace(/\.[a-z0-9]{1,5}$/i, "");
    if (!names(withoutExtension)) continue;

    const words = withoutExtension.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
    return titleCase(words).slice(0, MAX_TITLE_LENGTH);
  }

  // The same fallback validateLink already applied when the title field was
  // left blank, so nothing about an untitled link changes.
  return parsed.hostname.replace(/^www\./, "");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/link-title.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/link-title.ts tests/lib/link-title.test.ts
git commit -m "$(cat <<'EOF'
feat: derive a link title from its URL, without fetching it

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: The greeting

**Files:**
- Create: `lib/student-greeting.ts`
- Test: `tests/lib/student-greeting.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `greeting(name: string): string | null`. Task 13 calls it from `app/g/[slug]/page.tsx`.

- [ ] **Step 1: Write the failing test**

Create `tests/lib/student-greeting.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { greeting } from "@/lib/student-greeting";

describe("greeting", () => {
  it("uses the first name only", () => {
    expect(greeting("Marie Dupont")).toBe("Bonjour Marie");
  });

  it("handles a single-word name", () => {
    expect(greeting("Marie")).toBe("Bonjour Marie");
  });

  it("ignores surrounding and repeated whitespace", () => {
    expect(greeting("  Luc   Tremblay ")).toBe("Bonjour Luc");
  });

  it("has nothing to say about an empty name", () => {
    expect(greeting("")).toBeNull();
    expect(greeting("   ")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/student-greeting.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/student-greeting"`.

- [ ] **Step 3: Write the implementation**

Create `lib/student-greeting.ts`:

```ts
// The first word of Group.name, which holds the student's full name. A greeting
// is the one place the full name reads wrong — "Bonjour Marie Dupont" is a
// summons, not a hello.
//
// The caller suppresses this on the everyone group: that row is named
// "Everyone", and "Bonjour Everyone" is wrong in both languages. The rule lives
// there rather than here because this module has no business knowing the flag.
export function greeting(name: string): string | null {
  const first = name.trim().split(/\s+/)[0];
  if (!first) return null;
  return `Bonjour ${first}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/student-greeting.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/student-greeting.ts tests/lib/student-greeting.test.ts
git commit -m "$(cat <<'EOF'
feat: add the student greeting

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: A card tab that can be absent

`parseStudentTab` currently falls back to `"card"` unconditionally. The teacher, opening a student from the admin, no longer has one.

**Files:**
- Modify: `lib/student-tab.ts`
- Test: `tests/lib/student-tab.test.ts`

**Interfaces:**
- Produces: `parseStudentTab(value: string | undefined, available: { card: boolean; files: boolean; board: boolean }): StudentTab`. Task 13 calls it.
- **Breaking:** the `available` record gains a third key. `app/g/[slug]/page.tsx` is its only caller and is updated in Task 13; `tsc` will fail in between, which is why this task's verification is `npx vitest run` and **not** `npx tsc --noEmit`. Task 13 restores it.

- [ ] **Step 1: Update the existing test file**

Replace the two fixture lines at the top of `tests/lib/student-tab.test.ts`:

```ts
const all = { files: true, board: true };
const none = { files: false, board: false };
```

with:

```ts
const all = { card: true, files: true, board: true };
const none = { card: true, files: false, board: false };
```

Then in the same file, change the one call that passes a literal record:

```ts
  it("treats the two tabs independently", () => {
    expect(parseStudentTab("board", { files: false, board: true })).toBe("board");
    expect(parseStudentTab("files", { files: false, board: true })).toBe("card");
  });
```

to:

```ts
  it("treats the two tabs independently", () => {
    const boardOnly = { card: true, files: false, board: true };
    expect(parseStudentTab("board", boardOnly)).toBe("board");
    expect(parseStudentTab("files", boardOnly)).toBe("card");
  });
```

- [ ] **Step 2: Add the new cases**

Append inside the same `describe` block in `tests/lib/student-tab.test.ts`:

```ts
  // The teacher, who opens a student to see their shelf and their board. The
  // global card is the one she just edited in /admin.
  it("lands on files when the card is unavailable", () => {
    expect(
      parseStudentTab(undefined, { card: false, files: true, board: true }),
    ).toBe("files");
  });

  it("takes the board when the card and files are both unavailable", () => {
    expect(
      parseStudentTab(undefined, { card: false, files: false, board: true }),
    ).toBe("board");
  });

  it("refuses an explicit ?tab=card when the card is unavailable", () => {
    expect(
      parseStudentTab("card", { card: false, files: true, board: true }),
    ).toBe("files");
  });

  // Unreachable in the app — the card is only withheld from a teacher, who is
  // unlocked and therefore has both other tabs — but a total function needs a
  // last resort, and the card branch degrades to "nothing posted yet".
  it("returns the card as a last resort when nothing is available", () => {
    expect(
      parseStudentTab(undefined, { card: false, files: false, board: false }),
    ).toBe("card");
  });
```

- [ ] **Step 3: Run tests to verify the new ones fail**

Run: `npx vitest run tests/lib/student-tab.test.ts`
Expected: FAIL — `expected 'card' to be 'files'` on the two new default cases. The pre-existing cases still pass, because the extra `card: true` key is ignored by the current signature.

- [ ] **Step 4: Write the implementation**

Replace the whole of `lib/student-tab.ts`:

```ts
export type StudentTab = "card" | "files" | "board";

// A record rather than positional booleans: two flags called with the wrong
// order is a silent bug, and a third would make it likely.
//
// Availability is the whole point of the second argument. An untokened visitor
// has neither of the extra tabs, and a forwarded ?tab= link must land them on
// the card rather than on a tab that should not exist for them.
//
// `card` joins them because the teacher does not get one: she opens a student
// from the admin to see their shelf and their board, and the daily card there
// is the same global card she just finished editing.
export function parseStudentTab(
  value: string | undefined,
  available: { card: boolean; files: boolean; board: boolean },
): StudentTab {
  if (value === "card" && available.card) return "card";
  if (value === "files" && available.files) return "files";
  if (value === "board" && available.board) return "board";

  if (available.card) return "card";
  if (available.files) return "files";
  if (available.board) return "board";

  // Unreachable: the card is only ever withheld from a teacher, who is unlocked
  // and therefore has both other tabs. A total function still needs an answer,
  // and the card branch degrades to "nothing posted yet" rather than to a crash.
  return "card";
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/lib/student-tab.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 6: Commit**

`tsc` is knowingly red at this commit — `app/g/[slug]/page.tsx` still passes a two-key record. Task 13 fixes it. Do not "fix" it here by adding `card: true` at the call site; that would make Task 13's diff lie about what changed.

```bash
git add lib/student-tab.ts tests/lib/student-tab.test.ts
git commit -m "$(cat <<'EOF'
feat: let parseStudentTab withhold the card tab

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: A student may delete their own page

`canStudentDelete` refuses anything that is not a link. Students can now publish pages, so the first clause becomes "they added it" rather than "it is a link". The third clause — that the row is on nobody else's shelf — is what keeps this safe and does not move.

**Files:**
- Modify: `lib/shelf-access.ts:34-41`
- Test: `tests/lib/shelf-access.test.ts`

- [ ] **Step 1: Change the test that asserts the old rule**

In `tests/lib/shelf-access.test.ts`, replace:

```ts
  it("refuses an html page", () => {
    expect(canStudentDelete({ ...link, kind: "html" }, "g1")).toBe(false);
  });
```

with:

```ts
  it("allows a student to retract a page they published", () => {
    expect(canStudentDelete({ ...link, kind: "html" }, "g1")).toBe(true);
  });

  it("still refuses a page Jenn published", () => {
    expect(
      canStudentDelete({ ...link, kind: "html", addedByStudent: false }, "g1"),
    ).toBe(false);
  });

  // The clause that makes widening the first one safe: a Page row is shared, so
  // deleting one on two shelves takes it off both.
  it("still refuses a page of theirs that reached a second shelf", () => {
    expect(
      canStudentDelete({ ...link, kind: "html", groupIds: ["g1", "g2"] }, "g1"),
    ).toBe(false);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/shelf-access.test.ts`
Expected: FAIL — `expected false to be true` on "allows a student to retract a page they published".

- [ ] **Step 3: Write the implementation**

In `lib/shelf-access.ts`, replace the `canStudentDelete` function:

```ts
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

with:

```ts
// Which rows a student may remove from their own shelf. Both remaining
// conditions matter: the second is what makes the first safe, because a Page
// row is shared and deleting one assigned to several groups removes it from all
// of them at once.
//
// The kind is deliberately no longer checked. It used to stand in for "a
// student could only have added a link", which stopped being true when they
// gained the ability to publish a page. `addedByStudent` says the same thing
// directly and keeps saying it if a third kind ever appears.
export function canStudentDelete(
  page: { kind: PageKind; addedByStudent: boolean; groupIds: string[] },
  groupId: string,
): boolean {
  if (!page.addedByStudent) return false;
  return page.groupIds.length === 1 && page.groupIds[0] === groupId;
}
```

`PageKind` stays in the parameter type: callers pass whole rows, and narrowing the type now would only make them build a smaller object.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/lib/shelf-access.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/shelf-access.ts tests/lib/shelf-access.test.ts
git commit -m "$(cat <<'EOF'
feat: let a student retract a page they published

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Cache the preview, and stop indexing published pages

Everything in this task lands in one commit: `updatedAt` has to reach both preview call sites in the same change that makes `HtmlPreview` require it, or `tsc` fails.

**Files:**
- Modify: `lib/pages.ts:79-94` (`SHELF_SELECT`, `getPageBySlug`) and `:143-158` (the admin projection)
- Modify: `components/ui/HtmlPreview.tsx`
- Modify: `components/admin/PageList.tsx` (`PageSummary`, the `HtmlPreview` call)
- Modify: `components/student/FilesTab.tsx` (`ShelfPage`, the `HtmlPreview` call)
- Modify: `app/p/[slug]/raw/route.ts`
- Modify: `app/p/[slug]/page.tsx`

- [ ] **Step 1: Carry `updatedAt` out of the database**

In `lib/pages.ts`, add one line to `SHELF_SELECT`:

```ts
const SHELF_SELECT = {
  id: true,
  slug: true,
  title: true,
  createdAt: true,
  // The preview's cache key. Cheap to select and needed by every tile; see
  // lib/page-version.ts.
  updatedAt: true,
  kind: true,
  url: true,
  addedByStudent: true,
} as const;
```

In the same file, add `updatedAt: true` to `getPageBySlug`'s select:

```ts
export function getPageBySlug(slug: string) {
  return prisma.page.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      title: true,
      html: true,
      kind: true,
      url: true,
      updatedAt: true,
    },
  });
}
```

And add `updatedAt` to `listPagesForAdmin`'s projection, immediately after `createdAt`:

```ts
    createdAt: page.createdAt,
    updatedAt: page.updatedAt,
```

`effectivePages`, `applyPins` and `sectionPages` are all generic over the row type, so nothing else in the pipeline changes.

- [ ] **Step 2: Make `HtmlPreview` take a version**

Replace `components/ui/HtmlPreview.tsx`'s signature and `src`, leaving the long comment block above it and every attribute below it exactly as they are:

```ts
export function HtmlPreview({
  slug,
  // The row's own cache token. Required rather than optional: a caller that
  // forgot it would silently fall back to the uncached URL, and the symptom —
  // a shelf that is merely slow — is invisible in review.
  version,
  className,
}: {
  slug: string;
  version: string;
  className?: string;
}) {
```

and the iframe's src:

```tsx
        src={`/p/${slug}/raw?v=${version}`}
```

- [ ] **Step 3: Update both call sites**

In `components/admin/PageList.tsx`, add to the `PageSummary` type after `createdAt: Date;`:

```ts
  updatedAt: Date;
```

and change the preview at `components/admin/PageList.tsx:227`:

```tsx
                        <HtmlPreview slug={page.slug} version={pageVersion(page.updatedAt)} />
```

adding the import at the top:

```ts
import { pageVersion } from "@/lib/page-version";
```

In `components/student/FilesTab.tsx`, add to the `ShelfPage` type after `createdAt: Date;`:

```ts
  updatedAt: Date;
```

and change the preview at `components/student/FilesTab.tsx:116`:

```tsx
                          <HtmlPreview slug={page.slug} version={pageVersion(page.updatedAt)} />
```

adding the same import.

- [ ] **Step 4: Serve the cacheable response**

In `app/p/[slug]/raw/route.ts`, add the import:

```ts
import { pageVersion } from "@/lib/page-version";
```

and replace the `GET` handler. **Leave the `CONTENT_SECURITY_POLICY` constant and its comment block untouched.**

```ts
// A preview frame asks for ?v=<the row's own token>, and only an exact match is
// answered with a cacheable response. Accepting any ?v= would let a stale
// bookmarked token pin a browser to a document that no longer exists, for a
// year — the one failure mode of this scheme, and the reason the token is
// recomputed here rather than trusted.
//
// `private` keeps it out of shared caches. The cost, accepted knowingly: a
// versioned response is written to the browser's disk cache, which the blanket
// no-store used to prevent.
const IMMUTABLE = "private, max-age=31536000, immutable";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const page = await getPageBySlug(slug);
  // A link row has no document to serve, and /p/ means a page we host.
  if (!page || readPageKind(page) === "link" || page.html === null) {
    return new NextResponse("Not found", { status: 404 });
  }

  const asked = new URL(request.url).searchParams.get("v");
  const current = pageVersion(page.updatedAt);
  const cacheable = current !== "" && asked === current;

  return new NextResponse(page.html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": CONTENT_SECURITY_POLICY,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": cacheable ? IMMUTABLE : "no-store",
      // Students may publish here now. Nothing on this route should ever reach
      // an index, and the framing page carries the same instruction in its
      // metadata.
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
```

Note the first parameter is now `request` rather than `_request`; the underscore prefix is what eslint's unused-args rule keys off, so leaving it would fail lint the moment it is used.

- [ ] **Step 5: Stop indexing the framing page**

In `app/p/[slug]/page.tsx`, add `robots` to the returned metadata:

```ts
  return {
    title: page?.title ?? "Not found",
    // A student can publish a page now, and a slug is derived from a title and
    // therefore guessable. Nothing here should be crawlable.
    robots: { index: false, follow: false },
  };
```

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit`
Expected: one error, in `app/g/[slug]/page.tsx`, about the `available` argument missing `card` — left over from Task 5 and fixed in Task 13. **No errors mentioning `updatedAt`, `version`, or `HtmlPreview`.** If you see one of those, a call site was missed.

Run: `npm test`
Expected: PASS, all suites.

- [ ] **Step 7: Commit**

```bash
git add lib/pages.ts components/ui/HtmlPreview.tsx components/admin/PageList.tsx components/student/FilesTab.tsx "app/p/[slug]/raw/route.ts" "app/p/[slug]/page.tsx"
git commit -m "$(cat <<'EOF'
perf: cache page previews behind a content-versioned URL

The tile frames /p/<slug>/raw?v=<updatedAt token>, and the route answers a
matching token with an immutable response. A stale or absent token still gets
no-store, so a bookmarked URL can never pin an old document.

Also noindex on both /p/[slug] and its raw route: students can publish pages
now, and a slug is derived from a title.

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: The server side of links and student pages

Three changes to `app/page-actions.ts` and one to `lib/pages.ts`, landing together because they share the `LinkInput` type. Both link forms are updated in the same commit so `tsc` stays green.

**Files:**
- Modify: `lib/pages.ts:17-52` (`SavePageInput`, the `addedByStudent` guard)
- Modify: `app/page-actions.ts`
- Modify: `components/admin/AddLinkForm.tsx`
- Modify: `components/student/AddLinkRow.tsx`
- Modify: `components/student/FilesTab.tsx` (the `onAddLink` prop type)
- Modify: `app/g/[slug]/page.tsx` is **not** touched here — `addShelfLink.bind(null, group.id)` keeps its shape.

- [ ] **Step 1: Let an html page be student-authored**

In `lib/pages.ts`, change the `SavePageInput` union:

```ts
export type SavePageInput = SaveCommon &
  (
    | { kind: "html"; html: string; addedByStudent?: boolean }
    | { kind: "link"; url: string; addedByStudent?: boolean }
  );
```

and in `savePage`'s `create` branch, drop the kind guard:

```ts
        addedByStudent: input.addedByStudent === true,
```

The `update` branch is unchanged and still omits the flag — who added a row is a fact about its creation, and an edit must not rewrite it.

- [ ] **Step 2: Derive link titles server-side**

In `app/page-actions.ts`, add the import:

```ts
import { titleFromUrl } from "@/lib/link-title";
import { titleFromHtml } from "@/lib/page-title";
```

Replace the `PageInput` / `LinkInput` types:

```ts
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
```

with:

```ts
// The edit form still names a page: a published title stays editable even
// though its slug is frozen at creation.
export type PageInput = {
  title: string;
  html: string;
  groupIds: string[];
};

// Creating one does not. The title comes from the document, so the form is a
// paste and nothing else.
export type NewPageInput = {
  html: string;
  groupIds: string[];
};

export type LinkInput = {
  url: string;
  groupIds: string[];
};
```

Replace `validateLink`:

```ts
function validateLink(input: { title: string; url: string }) {
  const url = parseLinkUrl(input.url);
  if (!url.ok) throw new Error(url.error);
  // A link with no title falls back to its host, so adding one is two fields
  // and not three when she is in a hurry.
  const title = input.title.trim() || new URL(url.url).hostname.replace(/^www\./, "");
  return { title, url: url.url };
}
```

with:

```ts
// The title is derived here rather than in either form, so the two callers
// cannot disagree about it and neither can skip it. titleFromUrl makes no
// request — see lib/link-title.ts.
function validateLink(input: { url: string }) {
  const url = parseLinkUrl(input.url);
  if (!url.ok) throw new Error(url.error);
  return { title: titleFromUrl(url.url), url: url.url };
}
```

- [ ] **Step 3: Rewrite `createPage` and add `addShelfPage`**

Replace `validatePage` and `createPage`:

```ts
function validatePage(input: PageInput) {
  const title = requireTitle(input.title);
  const html = validatePageHtml(input.html);
  if (!html.ok) throw new Error(html.error);
  return { title, html: html.html };
}
```

with:

```ts
function validatePage(input: PageInput) {
  const title = requireTitle(input.title);
  const html = validatePageHtml(input.html);
  if (!html.ok) throw new Error(html.error);
  return { title, html: html.html };
}

// The create path, where nobody typed a title. "Page" is a deliberate last
// resort: uniqueSlug turns a run of them into page, page-2, page-3, which is
// ugly but reachable, and the title stays editable at /admin/pages/<slug>
// afterwards. The slug does not — students bookmark it.
function validateNewPage(input: NewPageInput) {
  const html = validatePageHtml(input.html);
  if (!html.ok) throw new Error(html.error);
  return { title: titleFromHtml(html.html) ?? "Page", html: html.html };
}
```

Replace `createPage`:

```ts
export async function createPage(input: PageInput): Promise<string> {
  await requireTeacher();
  const { title, html } = validatePage(input);
```

with:

```ts
export async function createPage(input: NewPageInput): Promise<string> {
  await requireTeacher();
  const { title, html } = validateNewPage(input);
```

The body below those two lines is unchanged. `updatePage` keeps `PageInput` and `validatePage` exactly as they are.

Then add, directly beneath `addShelfLink`:

```ts
// The student page's add-a-page, for either party. The sibling of
// addShelfLink, authorised by the same requireShelfRole — so the everyone
// group and an untokened visitor are refused by a rule that already exists and
// is already tested, rather than by a second one written here.
export async function addShelfPage(
  groupId: string,
  input: { html: string },
): Promise<void> {
  const role = await requireShelfRole(groupId);
  const { title, html } = validateNewPage(input);

  const slug = await saveOrExplain({
    slug: null,
    kind: "html",
    title,
    html,
    groupIds: [groupId],
    addedByStudent: role === "student",
  });

  revalidatePages(slug);
}
```

And change `addShelfLink`'s input type:

```ts
export async function addShelfLink(
  groupId: string,
  input: { url: string },
): Promise<void> {
```

- [ ] **Step 4: Drop the title field from both link forms**

In `components/admin/AddLinkForm.tsx`, delete the `title` state and its `<Input>`, and drop `title` from the submitted object:

```tsx
  const [url, setUrl] = useState("");
```

```tsx
      await onSubmit({
        url,
        groupIds: defaultGroupId ? [defaultGroupId] : [],
      });
      setUrl("");
```

and delete this whole element:

```tsx
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title (optional)"
          aria-label="Link title"
        />
```

Also delete the now-unused `setTitle("")` line in the success branch.

In `components/student/AddLinkRow.tsx`, make the same three deletions. This component is removed entirely in Task 14; it is patched here only so this commit compiles.

In `components/student/FilesTab.tsx`, narrow the prop type:

```ts
  onAddLink?: (input: { url: string }) => Promise<void>;
```

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit`
Expected: the same single leftover error in `app/g/[slug]/page.tsx` about the missing `card` key, and nothing else.

Run: `npm test`
Expected: PASS, all suites.

- [ ] **Step 6: Commit**

```bash
git add lib/pages.ts app/page-actions.ts components/admin/AddLinkForm.tsx components/student/AddLinkRow.tsx components/student/FilesTab.tsx
git commit -m "$(cat <<'EOF'
feat: derive link titles, and let a student publish a page

A link is one field now; validateLink derives the title from the URL string,
so neither form can skip it or disagree with the other. addShelfPage is
addShelfLink's sibling and shares its requireShelfRole guard.

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: The floating-control primitives

Three small components with no domain knowledge between them. `Fab` is extracted from the markup already inside `ChatFab`, and `ChatFab` is moved onto it in the same commit — leaving two definitions of the same circle is how they start to drift.

**Files:**
- Create: `components/ui/Fab.tsx`
- Create: `components/ui/AddMenu.tsx`
- Create: `components/ui/AddSheet.tsx`
- Modify: `components/chat/ChatFab.tsx:102-144`

**Interfaces:**
- Produces: `Fab`, `AddMenu`, `AddChoice`, `AddSheet`. Tasks 12 and 15 use all three.
- No tests: these are components, and this repo does not unit-test components.

- [ ] **Step 1: Write `Fab`**

Create `components/ui/Fab.tsx`:

```tsx
"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// The round button in the bottom-right corner. Extracted from ChatFab so the
// chat bubble and the add button are one object rendered twice: they sit side
// by side, and two copies of the same class string would drift the first time
// one of them was adjusted.
//
// Position comes in through `className` rather than a prop, because there are
// exactly two positions and both are one Tailwind pair. The accent colour is
// the admin palette's on both surfaces, deliberately — the chat button has
// always been --color-accent on the student page, and the add button standing
// beside it in --card-bleu would read as a different kind of control.
export function Fab({
  label,
  expanded,
  onClick,
  className,
  badge,
  children,
}: {
  label: string;
  expanded?: boolean;
  onClick: () => void;
  className?: string;
  // A dot over the corner. Decorative; it never takes a click.
  badge?: ReactNode;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={expanded}
      aria-label={label}
      className={cn(
        "fixed z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-accent)] text-white shadow-lg transition-opacity hover:opacity-90",
        className,
      )}
    >
      {children}
      {badge}
    </button>
  );
}
```

- [ ] **Step 2: Move `ChatFab` onto it**

In `components/chat/ChatFab.tsx`, add the import:

```ts
import { Fab } from "@/components/ui/Fab";
```

and replace the whole `<button>…</button>` element (currently `components/chat/ChatFab.tsx:115-141`) with:

```tsx
      <Fab
        label={labels.title}
        expanded={open}
        onClick={handleToggle}
        className="bottom-6 right-4"
        badge={
          unseen && !open ? (
            <span
              aria-hidden="true"
              className="absolute right-1 top-1 h-3.5 w-3.5 rounded-full border-2 border-[var(--color-bg)] bg-[var(--card-rouge)]"
            />
          ) : undefined
        }
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M21 11.5a8.38 8.38 0 0 1-9 8.4 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 8.4-9 8.38 8.38 0 0 1 8.6 8.5Z" />
        </svg>
      </Fab>
```

Nothing else in `ChatFab` changes. The chat still opens only on click.

- [ ] **Step 3: Write `AddMenu`**

Create `components/ui/AddMenu.tsx`:

```tsx
"use client";

import { cn } from "@/lib/utils";

export type AddChoice = { key: string; label: string };

// The two-or-three-item popover a FAB opens. It knows nothing about students,
// links or pages — the caller names the choices and handles the answer.
//
// Dismissal is a full-screen transparent backdrop rather than a document-level
// pointerdown listener: it is one element, it needs no ref, and it gives the
// press somewhere to land instead of falling through onto whatever is beneath.
export function AddMenu({
  choices,
  onChoose,
  onDismiss,
  className,
}: {
  choices: AddChoice[];
  onChoose: (key: string) => void;
  onDismiss: () => void;
  className?: string;
}) {
  return (
    <>
      <button
        type="button"
        aria-label="Fermer"
        onClick={onDismiss}
        className="fixed inset-0 z-40 cursor-default"
      />

      <div
        role="menu"
        className={cn(
          "fixed z-50 flex min-w-[180px] flex-col overflow-hidden rounded-2xl border border-[var(--color-field-border)] bg-[var(--color-bg)] shadow-2xl",
          className,
        )}
      >
        {choices.map((choice) => (
          <button
            key={choice.key}
            type="button"
            role="menuitem"
            onClick={() => onChoose(choice.key)}
            className="px-5 py-3 text-left font-[family-name:var(--font-body)] text-sm text-[var(--color-ink)] transition-colors hover:bg-[var(--color-field)]"
          >
            {choice.label}
          </button>
        ))}
      </div>
    </>
  );
}
```

- [ ] **Step 4: Write `AddSheet`**

Create `components/ui/AddSheet.tsx`:

```tsx
"use client";

import { useEffect, type ReactNode } from "react";

// The modal a chosen form renders into. aria-modal here, unlike ChatWindow,
// which deliberately is not one: a chat panel exists so the card stays readable
// behind it, and this exists to be filled in and dismissed.
export function AddSheet({
  title,
  closeLabel,
  onClose,
  children,
}: {
  title: string;
  closeLabel: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
      {/* Its own element rather than an onClick on the wrapper: a click that
          started inside the panel and ended on the wrapper would close a form
          mid-selection. */}
      <button
        type="button"
        aria-label={closeLabel}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/30"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative z-10 max-h-[85vh] w-full max-w-[480px] overflow-y-auto rounded-2xl border border-[var(--color-field-border)] bg-[var(--color-bg)] p-6 shadow-2xl"
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-[family-name:var(--font-display)] text-xl italic text-[var(--color-ink)]">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            className="text-lg leading-none text-[var(--color-ink-muted)]"
          >
            ×
          </button>
        </div>

        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit`
Expected: the single leftover `card` error in `app/g/[slug]/page.tsx` and nothing else.

Run: `npm run lint`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add components/ui/Fab.tsx components/ui/AddMenu.tsx components/ui/AddSheet.tsx components/chat/ChatFab.tsx
git commit -m "$(cat <<'EOF'
feat: extract Fab, AddMenu and AddSheet; move ChatFab onto Fab

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: The paste box

A textarea that never holds anything. `onPaste` reads the clipboard and cancels the event, so the document never enters the field — there is nothing to hide and no flash-then-clear.

**Files:**
- Create: `components/ui/HtmlPasteBox.tsx`
- Delete: `components/admin/HtmlDropZone.tsx`

Deleting the drop zone here would break `PageEditor`, which still imports it. Delete it in **Task 13** instead, where `PageEditor` is rewritten. This task only creates the new component.

**Interfaces:**
- Consumes: `validatePageHtml`, `byteLength` from `lib/page-html.ts`; `formatFileSize` from `lib/file-size.ts`.
- Produces: `HtmlPasteBox`, `PasteTone`, `PasteLabels`. Tasks 12, 13 and 14 use it.

- [ ] **Step 1: Write the component**

Create `components/ui/HtmlPasteBox.tsx`:

```tsx
"use client";

import { useState, type ChangeEvent, type ClipboardEvent } from "react";
import { cn } from "@/lib/utils";
import { validatePageHtml, byteLength } from "@/lib/page-html";
import { formatFileSize } from "@/lib/file-size";

export type PasteTone = "admin" | "card";

// Two skins for the two palettes, the same reason FilterChip has them.
const TONES: Record<PasteTone, { box: string; text: string; error: string }> = {
  admin: {
    box: "border-[var(--color-field-border)] bg-[var(--color-field)]",
    text: "text-[var(--color-ink-muted)]",
    error: "text-[var(--color-accent)]",
  },
  card: {
    box: "border-[var(--card-line)] bg-[var(--card-paper)]",
    text: "text-[var(--card-moss)]",
    error: "text-[var(--card-rouge)]",
  },
};

export type PasteLabels = {
  prompt: string;
  // Takes the formatted size so the sentence around it can be either language.
  accepted: (size: string) => string;
  ariaLabel: string;
};

// Paste a whole document in; never see it again.
//
// onPaste reads the clipboard directly and calls preventDefault(), so the text
// never lands in the textarea at all. The obvious alternative — accept it and
// clear the field — shows the markup for one frame and then blanks it, which
// looks like the paste failed.
//
// Validation is validatePageHtml, unchanged and reused: it already enforces the
// 2 MB byte cap and already rejects a string with no "<" in it, which is the
// whole of "check if it is HTML". A second rule beside it would be a second
// thing to keep in step.
//
// The caller decides what a valid document means. The create forms save it
// immediately; the edit form holds it in state until Save. That is why this
// hands the html out rather than submitting anything itself.
export function HtmlPasteBox({
  labels,
  tone,
  onHtml,
  errorFor = (message) => message,
}: {
  labels: PasteLabels;
  tone: PasteTone;
  onHtml: (html: string) => void;
  // The student surface collapses every message to one French sentence: the
  // action's own messages are written for Jenn and are in English.
  errorFor?: (message: string) => string;
}) {
  const [size, setSize] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  function accept(text: string) {
    setError(null);
    const result = validatePageHtml(text);
    if (!result.ok) {
      setSize(null);
      setError(errorFor(result.error));
      return;
    }
    setSize(byteLength(result.html));
    onHtml(result.html);
  }

  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    // Cancelled so the markup never enters the field. text/plain rather than
    // text/html: the clipboard's html flavour is the browser's re-serialisation
    // of a rendered selection, not the file she copied.
    event.preventDefault();
    accept(event.clipboardData.getData("text/plain"));
  }

  // Text can still arrive without a paste event — dragged in, or typed by a
  // mobile keyboard's suggestion bar. Same treatment, and the field is blanked
  // straight afterwards so it never displays what it received.
  function handleChange(event: ChangeEvent<HTMLTextAreaElement>) {
    const text = event.target.value;
    event.target.value = "";
    if (text.trim()) accept(text);
  }

  return (
    <div>
      <textarea
        onPaste={handlePaste}
        onChange={handleChange}
        aria-label={labels.ariaLabel}
        rows={3}
        // resize-none: it never holds text, so a drag handle offers nothing.
        className={cn(
          "mt-1 block w-full resize-none rounded-xl border-2 border-dashed px-4 py-6 text-center font-[family-name:var(--font-body)] text-sm focus:border-[var(--color-accent)] focus:outline-none",
          TONES[tone].box,
          TONES[tone].text,
        )}
        placeholder={labels.prompt}
        defaultValue=""
      />

      {size !== null && (
        <p className={cn("mt-2 text-center text-sm", TONES[tone].text)}>
          {labels.accepted(formatFileSize(size))}
        </p>
      )}

      {error && (
        <p role="alert" className={cn("mt-2 text-center text-sm", TONES[tone].error)}>
          {error}
        </p>
      )}
    </div>
  );
}
```

`MAX_PAGE_BYTES` is not imported: the 2 MB check lives inside `validatePageHtml`, which this calls. The drop zone had to check it separately because it measured a `File` before reading it.

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: the single leftover `card` error, nothing else.

Run: `npm run lint`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add components/ui/HtmlPasteBox.tsx
git commit -m "$(cat <<'EOF'
feat: add HtmlPasteBox, which takes a document and never shows it

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: The student page's header, greeting and tabs

Items 3, 4 and 6 together, because all three edit the same file and doing them separately means rewriting the same JSX three times. This task also clears the `tsc` error Task 5 left behind.

**Files:**
- Create: `components/student/CardHeading.tsx`
- Modify: `components/student/StudentTabs.tsx`
- Modify: `app/g/[slug]/page.tsx`

- [ ] **Step 1: Write `CardHeading`**

Create `components/student/CardHeading.tsx`:

```tsx
import { formatWeekRange } from "@/lib/week";

// The ⚜ eyebrow and the week range, which used to sit in the page header above
// everything. They moved here because the header said "the card of the day"
// over the files and board tabs too, which was simply wrong.
//
// This renders inside the CARD TAB'S BRANCH of the page body, not inside
// StudentTabs, and that placement is the whole decision:
//
//   - The tab strip only renders when a visitor has more than the card. An
//     untokened visitor has no strip at all and still needs this heading;
//     hanging it off the strip would delete it for exactly the person who has
//     nothing else on the page.
//   - The teacher has no card tab. Living in the card branch means she loses
//     this without a second rule anywhere saying so.
export function CardHeading({
  weekStart,
  weekEnd,
}: {
  weekStart: Date;
  weekEnd: Date;
}) {
  return (
    <div className="mx-auto mb-6 max-w-[560px] text-center">
      <div className="mb-2 font-[family-name:var(--card-font-serif)] text-[13px] uppercase tracking-[6px] text-[var(--card-bleu)] opacity-80">
        ⚜ La carte du jour ⚜
      </div>
      <div className="font-[family-name:var(--card-font-mono)] text-[12px] uppercase tracking-[2px] text-[#8a7f6c]">
        {formatWeekRange(weekStart, weekEnd)}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Let `StudentTabs` omit the card**

In `components/student/StudentTabs.tsx`, change the `has` prop type and the first entry of the `tabs` array:

```tsx
  has: { card: boolean; files: boolean; board: boolean };
}) {
  const tabs: { tab: StudentTab; label: string; href: string }[] = [
    ...(has.card
      ? [{ tab: "card" as const, label: "La carte", href: `/g/${slug}?date=${date}` }]
      : []),
    ...(has.files
      ? [{ tab: "files" as const, label: "Les fichiers", href: `/g/${slug}?tab=files` }]
      : []),
    ...(has.board
      ? [{ tab: "board" as const, label: "Le tableau", href: `/g/${slug}?tab=board` }]
      : []),
  ];
```

Labels are unchanged. The strip is now what says which section you are in, which is the job the removed header line was doing badly.

- [ ] **Step 3: Rewrite the page's header and tab wiring**

In `app/g/[slug]/page.tsx`, add two imports:

```ts
import { greeting } from "@/lib/student-greeting";
import { CardHeading } from "@/components/student/CardHeading";
```

and **narrow the week import**. `CardHeading` calls `formatWeekRange` itself now, so the page's own use of it disappears with the header and the import becomes unused — which is a lint error, not a warning. Change:

```ts
import { weekRange, formatWeekRange, latestViewableDate } from "@/lib/week";
```

to:

```ts
import { weekRange, latestViewableDate } from "@/lib/week";
```

`weekRange` stays: the page still computes `weekStart`/`weekEnd` and hands them down.

Immediately after the `boards`/`labels` lines and before the `parseStudentTab` call, add:

```ts
  // Jenn opening a student from the Students tab arrives with ?k=, so she is
  // unlocked; the card she would see here is the same global card she just
  // finished editing in /admin. Withheld only when she IS unlocked: a teacher
  // who types /g/marie with no token is, to this page, a visitor with the
  // public card, and hiding it there would serve her a page with nothing on it.
  const showCard = !(viewerIsTeacher && unlocked);
```

Change the `parseStudentTab` call to pass the third flag:

```ts
  const tab = parseStudentTab(tab_, {
    card: showCard,
    files: unlocked || pages.length > 0,
    board: unlocked,
  });
```

Replace the whole `<header>` element:

```tsx
      <header className="mx-auto mb-7 max-w-[560px] text-center">
        <div className="mb-2.5 font-[family-name:var(--card-font-serif)] text-[13px] uppercase tracking-[6px] text-[var(--card-bleu)] opacity-80">
          ⚜ La carte du jour ⚜
        </div>
        <h1
          className="mb-2.5 font-[family-name:var(--card-font-serif)] text-[var(--card-plum)]"
          style={{ fontSize: "clamp(30px, 5.5vw, 42px)", lineHeight: 1.15 }}
        >
          <Link href="/" className="transition-opacity hover:opacity-75">
            Français Avec Jenn
          </Link>
        </h1>
        <div className="font-[family-name:var(--card-font-serif)] text-[15px] italic text-[var(--card-moss)]">
          Un jour, une carte — Québec-flavoured
        </div>
        <div className="mt-2.5 font-[family-name:var(--card-font-mono)] text-[12px] uppercase tracking-[2px] text-[#8a7f6c]">
          {formatWeekRange(weekStart, weekEnd)}
        </div>
      </header>
```

with:

```tsx
      <header className="mx-auto mb-7 max-w-[560px] text-center">
        <h1
          className="mb-2.5 font-[family-name:var(--card-font-serif)] text-[var(--card-plum)]"
          style={{ fontSize: "clamp(30px, 5.5vw, 42px)", lineHeight: 1.15 }}
        >
          <Link href="/" className="transition-opacity hover:opacity-75">
            Français Avec Jenn
          </Link>
        </h1>
        <div className="font-[family-name:var(--card-font-serif)] text-[15px] italic text-[var(--card-moss)]">
          Un jour, une carte — Québec-flavoured
        </div>
        {/* Suppressed on the everyone group, whose name is literally "Everyone".
            The greeting is shown to untokened visitors too: /g/marie already
            spells the name in the URL, so there is nothing here a token was
            protecting. */}
        {!group.isEveryone && greeting(group.name) && (
          <div className="mt-3 font-[family-name:var(--card-font-serif)] text-[19px] text-[var(--card-moss)]">
            {greeting(group.name)}
          </div>
        )}
      </header>
```

- [ ] **Step 4: Move the heading into the card branch and pass `has.card`**

In the same file, change the card branch of `body`:

```tsx
      {tab === "card" ? (
        <>
          <WeekDayPicker slug={slug} today={today} selected={selected} />
```

to:

```tsx
      {tab === "card" ? (
        <>
          <CardHeading weekStart={weekStart} weekEnd={weekEnd} />
          <WeekDayPicker slug={slug} today={today} selected={selected} />
```

and add the flag to the `StudentTabs` call:

```tsx
        <StudentTabs
          slug={slug}
          active={tab}
          date={selected}
          has={{
            card: showCard,
            files: unlocked || pages.length > 0,
            board: unlocked,
          }}
        />
```

The strip's own render condition — `(pages.length > 0 || unlocked)` — is unchanged. A teacher is always unlocked, so she always has a strip to land on.

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit`
Expected: **clean.** This is the task that clears Task 5's deliberate breakage.

Run: `npm run lint`
Expected: clean. An unused-import error on `formatWeekRange` means Step 3's import narrowing was skipped — the page no longer calls it, `CardHeading` does.

Run: `npm test`
Expected: PASS, all suites.

- [ ] **Step 6: Manual check of the four viewers**

`npm run dev`, then confirm:

| URL | Expect |
|---|---|
| `/g/<slug>` with no `?k=`, logged out | Header with the greeting, no strip or a Files-only strip, ⚜ eyebrow and week range above the day picker |
| `/g/<slug>?k=<chatToken>`, logged out | Three tabs, card selected, eyebrow under the strip; Files and Board show no eyebrow |
| `/g/<slug>?k=<chatToken>`, logged in as teacher | **Two** tabs, Files selected, no eyebrow anywhere |
| `/g/all` | No greeting at all |

- [ ] **Step 7: Commit**

```bash
git add components/student/CardHeading.tsx components/student/StudentTabs.tsx "app/g/[slug]/page.tsx"
git commit -m "$(cat <<'EOF'
feat: greet the student, move the card heading under the tabs, drop the
teacher's card tab

The eyebrow and week range live in the card tab's own branch rather than in
the header or the tab strip: an untokened visitor has no strip but still needs
the heading, and the teacher loses it for free along with the tab.

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: The student page's FAB

**Files:**
- Create: `components/student/ShelfFab.tsx`
- Modify: `app/g/[slug]/page.tsx`
- Modify: `components/student/FilesTab.tsx` (drop `onAddLink` and the `AddLinkRow` render)
- Delete: `components/student/AddLinkRow.tsx`

- [ ] **Step 1: Write `ShelfFab`**

Create `components/student/ShelfFab.tsx`:

```tsx
"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Fab } from "@/components/ui/Fab";
import { AddMenu } from "@/components/ui/AddMenu";
import { AddSheet } from "@/components/ui/AddSheet";
import { HtmlPasteBox } from "@/components/ui/HtmlPasteBox";
import { cn } from "@/lib/utils";
import { fieldClassName } from "@/components/ui/field";

type Open = null | "menu" | "link" | "page";

// The shelf's one add control, replacing the row of fields that used to sit
// above the files list. It renders on EVERY tab, not just Files: it matches the
// chat button, which is already page-level, and a control that appears and
// disappears as you move between tabs reads as a bug next to one that never
// does.
//
// It sits to the LEFT of the chat button rather than above it. Above is where
// the chat panel lives (ChatWindow's bottom-24 right-4), so a stacked button
// would sit behind an open conversation. Side by side, neither ever covers the
// other and neither has to move.
//
// It renders inside StreamProvider because that is the branch `unlocked`
// already selects — not because it needs the stream. It must never call
// useStream.
export function ShelfFab({
  onAddLink,
  onAddPage,
}: {
  onAddLink: (input: { url: string }) => Promise<void>;
  onAddPage: (input: { html: string }) => Promise<void>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<Open>(null);
  const [url, setUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function done() {
    setOpen(null);
    setUrl("");
    setError(null);
    // The shelf is server-rendered, so a refresh is what makes the new row
    // appear rather than a local insert that could disagree with it.
    router.push("?tab=files");
    router.refresh();
  }

  async function submitLink(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onAddLink({ url });
      done();
    } catch {
      // The action's own messages are English and written for Jenn; a student
      // gets one French sentence instead of a leaked internal string.
      setError("Ce lien n'a pas pu être ajouté.");
    } finally {
      setSaving(false);
    }
  }

  // The paste IS the submit: there is no Save button, because there is nothing
  // else on this form to fill in.
  async function submitPage(html: string) {
    setSaving(true);
    setError(null);
    try {
      await onAddPage({ html });
      done();
    } catch {
      setError("Cette page n'a pas pu être ajoutée.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {open === "menu" && (
        <AddMenu
          className="bottom-24 right-4"
          choices={[
            { key: "link", label: "Ajouter un lien" },
            { key: "page", label: "Ajouter une page" },
          ]}
          onChoose={(key) => setOpen(key === "link" ? "link" : "page")}
          onDismiss={() => setOpen(null)}
        />
      )}

      {open === "link" && (
        <AddSheet
          title="Ajouter un lien"
          closeLabel="Fermer"
          onClose={() => setOpen(null)}
        >
          <form onSubmit={submitLink} className="flex flex-col gap-3">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…"
              aria-label="Adresse du lien"
              required
              autoFocus
              className={cn(fieldClassName, "mt-0")}
            />
            {/* One field: the name is taken from the address itself. */}
            <button
              type="submit"
              disabled={saving || url.trim() === ""}
              className="rounded-full bg-[var(--card-bleu)] px-5 py-2.5 font-[family-name:var(--card-font-serif)] text-sm text-white disabled:opacity-50"
            >
              {saving ? "Ajout…" : "Enregistrer"}
            </button>
            {error && (
              <p role="alert" className="text-center text-sm text-[var(--card-rouge)]">
                {error}
              </p>
            )}
          </form>
        </AddSheet>
      )}

      {open === "page" && (
        <AddSheet
          title="Ajouter une page"
          closeLabel="Fermer"
          onClose={() => setOpen(null)}
        >
          <HtmlPasteBox
            tone="card"
            labels={{
              prompt: "Collez le code HTML ici (⌘V)",
              accepted: (size) => `Page reçue — ${size}`,
              ariaLabel: "Code HTML de la page",
            }}
            onHtml={submitPage}
            errorFor={() => "Ce n'est pas une page HTML."}
          />
          {error && (
            <p role="alert" className="mt-2 text-center text-sm text-[var(--card-rouge)]">
              {error}
            </p>
          )}
        </AddSheet>
      )}

      <Fab
        label="Ajouter"
        expanded={open === "menu"}
        onClick={() => setOpen(open === null ? "menu" : null)}
        className="bottom-6 right-24"
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
      </Fab>
    </>
  );
}
```

- [ ] **Step 2: Take the add-row out of `FilesTab`**

In `components/student/FilesTab.tsx`, delete the import:

```ts
import { AddLinkRow } from "@/components/student/AddLinkRow";
```

delete the prop from the type:

```ts
  onAddLink?: (input: { url: string }) => Promise<void>;
```

and delete the render at `components/student/FilesTab.tsx:69`:

```tsx
      {canWrite && onAddLink && <AddLinkRow onAdd={onAddLink} />}
```

`canWrite` stays — it still governs the pin and delete controls in the tile footer.

- [ ] **Step 3: Delete `AddLinkRow`**

```bash
git rm components/student/AddLinkRow.tsx
```

- [ ] **Step 4: Wire the FAB into the page**

In `app/g/[slug]/page.tsx`, add to the imports:

```ts
import { ShelfFab } from "@/components/student/ShelfFab";
```

and change the `addShelfLink`/`addShelfPage` import line:

```ts
import {
  addShelfLink,
  addShelfPage,
  setShelfPin,
  deleteShelfLink,
} from "@/app/page-actions";
```

Remove `onAddLink` from the `FilesTab` call:

```tsx
        <FilesTab
          pages={pages}
          today={today}
          canWrite={unlocked}
          onTogglePin={setShelfPin.bind(null, group.id)}
          onDeleteLink={deleteShelfLink.bind(null, group.id)}
        />
```

and add `ShelfFab` as a sibling of `ChatFab`, immediately after the `<ChatFab … />` element and still inside `<StreamProvider>`:

```tsx
          <ShelfFab
            onAddLink={addShelfLink.bind(null, group.id)}
            onAddPage={addShelfPage.bind(null, group.id)}
          />
```

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit`
Expected: clean.

Run: `npm run lint`
Expected: clean. If it reports `onAddLink` as unused in `FilesTab`, Step 2's prop deletion was missed.

Run: `npm test`
Expected: PASS, all suites.

- [ ] **Step 6: Manual check**

With `npm run dev` and a `?k=` URL: the `+` sits left of the chat bubble on every tab. Adding a link with only a URL lands on the Files tab with a title derived from the address. Pasting a page into the page sheet saves it and the markup is never visible in the box. Pasting a plain sentence shows *"Ce n'est pas une page HTML."* Opening `/g/all` shows no `+` at all.

- [ ] **Step 7: Commit**

```bash
git add components/student/ShelfFab.tsx components/student/FilesTab.tsx "app/g/[slug]/page.tsx"
git commit -m "$(cat <<'EOF'
feat: one add-FAB on the student page, replacing the link row

Left of the chat button rather than above it: above is where the chat panel
already sits. Students can add a page now as well as a link.

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
)"
```

---

### Task 13: `PageEditor` becomes edit-only

Creating a page moves into the FAB sheet, so `PageEditor` stops branching on `initial` in four places and becomes what it now is: the form behind `/admin/pages/[slug]`. It keeps its title field — a published page's title stays editable even though its slug is frozen — and swaps the drop zone for the paste box.

**Files:**
- Modify: `components/admin/PageEditor.tsx` (rewritten)
- Delete: `components/admin/HtmlDropZone.tsx`
- Modify: `app/admin/pages/[slug]/page.tsx` is **not** touched — its `<PageEditor>` call already passes `initial`, `groups`, `submitLabel`, `onSubmit` and `onDelete`, which is exactly the new prop set.

- [ ] **Step 1: Rewrite `PageEditor`**

Replace the whole of `components/admin/PageEditor.tsx`:

```tsx
"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { HtmlPasteBox } from "@/components/ui/HtmlPasteBox";
import { cn } from "@/lib/utils";
import type { PageInput } from "@/app/page-actions";

export type PageEditorGroup = { id: string; name: string };

// The edit form behind /admin/pages/[slug], and nothing else. Creating a page
// lives in NewPageForm now, which is why `initial` is required here and why
// every "is this the create form?" branch is gone.
//
// The title field stays. A page's slug is derived from its title once and never
// moves — students bookmark it — but the title itself is display text and
// fixing a typo in one must remain possible.
export function PageEditor({
  groups,
  initial,
  submitLabel,
  onSubmit,
  onDelete,
}: {
  groups: PageEditorGroup[];
  initial: { title: string; html: string; groupIds: string[] };
  submitLabel: string;
  onSubmit: (input: PageInput) => Promise<unknown>;
  onDelete?: () => Promise<void>;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initial.title);
  // The html lives here, exactly as it did behind the drop zone — the paste box
  // simply never shows it. Saving without pasting anything re-submits the
  // identical document, so page-actions needs no change.
  const [html, setHtml] = useState(initial.html);
  const [groupIds, setGroupIds] = useState<string[]>(initial.groupIds);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
      </label>

      <fieldset className="text-sm font-medium text-[var(--color-ink)]">
        <legend className="mb-2">Students</legend>
        {groups.length === 0 ? (
          <p className="text-sm font-normal text-[var(--color-ink-muted)]">
            No students yet.
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
        Replace the page
        {/* Unlike the create form, pasting here does NOT save: there is a title
            and an audience on this screen that a paste must not commit behind
            her. It stages the new document and Save commits everything. */}
        <HtmlPasteBox
          tone="admin"
          labels={{
            prompt: "Paste the page's HTML here (⌘V) to replace it",
            accepted: (size) => `New version staged — ${size}. Save to publish it.`,
            ariaLabel: "HTML to replace this page with",
          }}
          onHtml={setHtml}
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

Gone with the create path: `defaultGroupId`, `groupsTouched`, `titleFromFile`, `fileName`, `fileSize`, `handleFile`, the `lastDefault` render-phase comparison, and the post-submit reset. `NewPageForm` in Task 14 carries the default-audience rule forward; everything else was create-only bookkeeping.

- [ ] **Step 2: Delete the drop zone**

```bash
git rm components/admin/HtmlDropZone.tsx
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit`
Expected: **one** error, in `components/admin/PagesTabClient.tsx`, because its `<PageEditor>` call passes `defaultGroupId` and no `initial`. Task 15 deletes that call. Do not patch it here.

Run: `npm run lint`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add components/admin/PageEditor.tsx components/admin/HtmlDropZone.tsx
git commit -m "$(cat <<'EOF'
refactor: PageEditor becomes the edit form, with a paste box

Creating a page moves to the FAB sheet, so every branch on `initial` goes and
the drop zone is deleted. Pasting here stages a replacement rather than saving,
because this screen has a title and an audience that a paste must not commit.

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
)"
```

---

### Task 14: The admin's create-a-page form

**Files:**
- Create: `components/admin/NewPageForm.tsx`

**Interfaces:**
- Consumes: `HtmlPasteBox`, `NewPageInput` from `app/page-actions.ts`.
- Produces: `NewPageForm`. Task 15 renders it inside the FAB's sheet.

- [ ] **Step 1: Write the form**

Create `components/admin/NewPageForm.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { HtmlPasteBox } from "@/components/ui/HtmlPasteBox";
import { cn } from "@/lib/utils";
import type { NewPageInput } from "@/app/page-actions";

// Audience first, paste second — DOM order matters here, because the paste is
// the submit. There is no Save button: the title comes from the document, so
// once the audience is chosen there is nothing left to fill in.
export function NewPageForm({
  groups,
  defaultGroupId,
  onSubmit,
  onDone,
}: {
  groups: { id: string; name: string }[];
  // The Pages tab's active student chip. A new page defaults to whoever is
  // being looked at; null when the filter is "All".
  defaultGroupId: string | null;
  onSubmit: (input: NewPageInput) => Promise<unknown>;
  onDone: () => void;
}) {
  const router = useRouter();
  const [groupIds, setGroupIds] = useState<string[]>(
    defaultGroupId ? [defaultGroupId] : [],
  );
  // A default should follow the filter while she has expressed no opinion, and
  // must never overwrite a choice she made herself.
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Adjusted during render rather than in an effect: this is state derived from
  // a prop, and react-hooks/set-state-in-effect rejects the effect form for
  // exactly this shape — an effect would render once with the stale selection
  // and then render again. React's documented pattern is to compare against the
  // previous prop here and correct before anything paints.
  const [lastDefault, setLastDefault] = useState(defaultGroupId);
  if (lastDefault !== defaultGroupId) {
    setLastDefault(defaultGroupId);
    if (!touched) setGroupIds(defaultGroupId ? [defaultGroupId] : []);
  }

  function toggleGroup(id: string) {
    setTouched(true);
    setGroupIds((current) =>
      current.includes(id) ? current.filter((g) => g !== id) : [...current, id],
    );
  }

  async function handleHtml(html: string) {
    setSaving(true);
    setError(null);
    try {
      await onSubmit({ html, groupIds });
      router.refresh();
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <fieldset className="text-sm font-medium text-[var(--color-ink)]">
        <legend className="mb-2">Students</legend>
        {groups.length === 0 ? (
          <p className="text-sm font-normal text-[var(--color-ink-muted)]">
            No students yet.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {groups.map((group) => {
              const checked = groupIds.includes(group.id);
              return (
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
        Page
        <HtmlPasteBox
          tone="admin"
          labels={{
            prompt: saving
              ? "Publishing…"
              : "Paste the page's HTML here (⌘V) — it publishes straight away",
            accepted: (size) => `Published — ${size}`,
            ariaLabel: "HTML of the page to publish",
          }}
          onHtml={handleHtml}
        />
        <p className="mt-2 text-sm font-normal text-[var(--color-ink-muted)]">
          The title comes from the document. You can rename it afterwards; the
          link it gets is permanent.
        </p>
      </div>

      {error && (
        <p role="alert" className="text-center text-sm text-[var(--color-accent)]">
          {error}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: the same single `PagesTabClient` error from Task 13, and nothing new.

Run: `npm run lint`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add components/admin/NewPageForm.tsx
git commit -m "$(cat <<'EOF'
feat: add NewPageForm, where the paste is the submit

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
)"
```

---

### Task 15: The admin FAB and the chip that moved

The largest task. The FAB has to be one control across all three tabs, which puts it outside the tab bodies — but the audience default for a new link or page is the student chip, which lives in `PagesTabClient`'s local state. `AdminChrome` resolves that by owning the chip and publishing it as context.

**Files:**
- Create: `components/admin/AdminChrome.tsx`
- Modify: `app/admin/page.tsx`
- Modify: `components/admin/PagesTabClient.tsx`
- Delete: `components/admin/Collapsible.tsx`

- [ ] **Step 1: Write `AdminChrome`**

Create `components/admin/AdminChrome.tsx`:

```tsx
"use client";

import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { Fab } from "@/components/ui/Fab";
import { AddMenu } from "@/components/ui/AddMenu";
import { AddSheet } from "@/components/ui/AddSheet";
import { NewGroupForm } from "@/components/admin/NewGroupForm";
import { AddLinkForm } from "@/components/admin/AddLinkForm";
import { NewPageForm } from "@/components/admin/NewPageForm";
import { defaultGroupId } from "@/lib/default-audience";
import type { LinkInput, NewPageInput } from "@/app/page-actions";

type Chip = { chip: string | null; setChip: (value: string | null) => void };

const ChipContext = createContext<Chip | null>(null);

// The Pages tab's student filter, read from wherever it is needed. It used to
// be PagesTabClient's own useState; it moved up here because the FAB is outside
// the tab bodies and needs the same value to default a new page's audience.
export function useAdminChip(): Chip {
  const value = useContext(ChipContext);
  if (!value) throw new Error("useAdminChip must be used inside AdminChrome");
  return value;
}

type Open = null | "menu" | "student" | "link" | "page";

// The admin's client shell: it owns the chip, publishes it, and renders the one
// add control for all three tabs.
//
// It wraps server-rendered children. That works — a client provider may wrap a
// server subtree, and a client component nested inside that subtree still reads
// the context — and it is what lets PagesTabClient stay where it is.
export function AdminChrome({
  groups,
  onCreateStudent,
  onCreateLink,
  onCreatePage,
  children,
}: {
  groups: { id: string; name: string }[];
  onCreateStudent: (name: string) => Promise<void>;
  onCreateLink: (input: LinkInput) => Promise<unknown>;
  onCreatePage: (input: NewPageInput) => Promise<unknown>;
  children: ReactNode;
}) {
  const router = useRouter();
  const [chip, setChip] = useState<string | null>(null);
  const [open, setOpen] = useState<Open>(null);

  const activeGroupId = defaultGroupId(chip, groups);

  // Land on the tab that shows what was just added, then refresh: these lists
  // are server-rendered, so the row appears because the server re-ran, not
  // because anything was inserted locally.
  function done(tab: "groups" | "pages") {
    setOpen(null);
    router.push(`/admin?tab=${tab}`);
    router.refresh();
  }

  return (
    <ChipContext.Provider value={{ chip, setChip }}>
      {children}

      {open === "menu" && (
        <AddMenu
          className="bottom-24 right-4"
          choices={[
            { key: "student", label: "Add a student" },
            { key: "link", label: "Add a link" },
            { key: "page", label: "Add a page" },
          ]}
          onChoose={(key) => setOpen(key as Open)}
          onDismiss={() => setOpen(null)}
        />
      )}

      {open === "student" && (
        <AddSheet title="Add a student" closeLabel="Close" onClose={() => setOpen(null)}>
          <NewGroupForm
            onSubmit={async (name) => {
              await onCreateStudent(name);
              done("groups");
            }}
          />
        </AddSheet>
      )}

      {open === "link" && (
        <AddSheet title="Add a link" closeLabel="Close" onClose={() => setOpen(null)}>
          <AddLinkForm
            groups={groups}
            defaultGroupId={activeGroupId}
            onSubmit={async (input) => {
              await onCreateLink(input);
              done("pages");
            }}
          />
        </AddSheet>
      )}

      {open === "page" && (
        <AddSheet title="Add a page" closeLabel="Close" onClose={() => setOpen(null)}>
          <NewPageForm
            groups={groups}
            defaultGroupId={activeGroupId}
            onSubmit={onCreatePage}
            onDone={() => done("pages")}
          />
        </AddSheet>
      )}

      <Fab
        label="Add"
        expanded={open === "menu"}
        onClick={() => setOpen(open === null ? "menu" : null)}
        className="bottom-6 right-4"
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
      </Fab>
    </ChipContext.Provider>
  );
}
```

`NewGroupForm` and `AddLinkForm` both call `router.refresh()` themselves after a successful submit and both clear their own fields; the extra `done()` here adds the navigation. That double refresh is harmless and is cheaper than rewriting two working forms to stop doing it.

- [ ] **Step 2: Take the chip out of `PagesTabClient`**

Replace the whole of `components/admin/PagesTabClient.tsx`:

```tsx
"use client";

import { PageList, type PageSummary } from "@/components/admin/PageList";
import { useAdminChip } from "@/components/admin/AdminChrome";
import { defaultGroupId } from "@/lib/default-audience";

type AdminPage = Omit<PageSummary, "pinnedAt"> & {
  pins: { groupId: string; pinnedAt: Date }[];
};

// The student chip lives in AdminChrome now: the FAB outside these tab bodies
// needs the same value to default a new page's audience, and two copies of it
// would disagree the moment one was changed. This still owns what the chip
// MEANS for the list — which pages show and which shelf a pin lands on.
export function PagesTabClient({
  pages,
  groups,
  everyoneName,
  today,
  onTogglePin,
}: {
  pages: AdminPage[];
  groups: { id: string; name: string }[];
  everyoneName: string | null;
  today: Date;
  // Curried on groupId, so the client picks the shelf and the server still
  // re-authorises it.
  onTogglePin: (groupId: string, slug: string, pinned: boolean) => Promise<void>;
}) {
  const { chip, setChip } = useAdminChip();
  const activeGroupId = defaultGroupId(chip, groups);

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
        group={chip}
        onGroup={setChip}
        canPin={activeGroupId !== null}
        onTogglePin={
          activeGroupId ? onTogglePin.bind(null, activeGroupId) : async () => {}
        }
        today={today}
      />
    </div>
  );
}
```

`onCreatePage` and `onCreateLink` are gone from its props — the FAB owns both now.

- [ ] **Step 3: Delete `Collapsible`**

```bash
git rm components/admin/Collapsible.tsx
```

Confirm nothing else imported it:

Run: `grep -rn "Collapsible" app components lib`
Expected: no output.

- [ ] **Step 4: Rewire `app/admin/page.tsx`**

Replace the imports block's two lines:

```ts
import { NewGroupForm } from "@/components/admin/NewGroupForm";
```

with:

```ts
import { AdminChrome } from "@/components/admin/AdminChrome";
```

Then replace the default export's body from `const { date, tab } = await searchParams;` down to the closing `</main>`:

```tsx
  const { date, tab } = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const selected = parseAdminDate(date, today);
  const active = parseAdminTab(tab);

  // Fetched here rather than inside PagesTab, which is where it used to live:
  // the FAB is outside the tab bodies and needs the audience list on every one
  // of them. This knowingly weakens "each tab runs only its own queries" below
  // — one indexed read of a table with a handful of rows is what the control
  // costs to be in a single place.
  const groups = await prisma.group.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, isEveryone: true },
  });

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

        <AdminChrome
          groups={groups.map((g) => ({ id: g.id, name: g.name }))}
          onCreateStudent={createGroup}
          onCreateLink={createLink}
          onCreatePage={createPage}
        >
          {active === "daily" && <DailyWordTab selected={selected} today={today} />}
          {active === "groups" && <GroupsTab />}
          {active === "pages" && <PagesTab groups={groups} />}
        </AdminChrome>
      </div>
    </main>
  );
}
```

Then replace `GroupsTab` and `PagesTab`:

```tsx
// Each tab runs its own queries, apart from the group list the FAB above needs
// on all three.
async function GroupsTab() {
  const [groups, unread] = await Promise.all([
    prisma.group.findMany({ orderBy: { name: "asc" } }),
    unreadCounts(),
  ]);

  return (
    <div className="mx-auto w-full max-w-[560px]">
      <GroupList
        groups={groups.map((g) => ({
          id: g.id,
          name: g.name,
          slug: g.slug,
          isEveryone: g.isEveryone,
          unread: unread.get(g.id) ?? 0,
          chatToken: g.chatToken,
        }))}
        onDelete={deleteGroup}
        onRegenerate={regenerateStudentLinks}
      />
    </div>
  );
}

// The group list arrives as a prop now: the page above already read it for the
// FAB, and a second identical query on this tab would be pure duplication.
async function PagesTab({
  groups,
}: {
  groups: { id: string; name: string; isEveryone: boolean }[];
}) {
  const pages = await listPagesForAdmin();

  // null when no row is flagged — a state the migration makes impossible, but
  // one the filter should degrade quietly on rather than crash.
  const everyoneName = groups.find((g) => g.isEveryone)?.name ?? null;

  // No 560px cap out here, unlike the other tabs: the page grid uses the
  // whole 1152px so four tiles are worth looking at. PagesTabClient caps its
  // own controls.
  return (
    <PagesTabClient
      pages={pages}
      groups={groups.map((g) => ({ id: g.id, name: g.name }))}
      everyoneName={everyoneName}
      today={new Date()}
      onTogglePin={setShelfPin}
    />
  );
}
```

The `GroupsTab` heading *"Add a student"* and its `<NewGroupForm>` are deleted — the form lives in the sheet now.

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit`
Expected: **clean.** This clears Task 13's deliberate breakage.

Run: `npm run lint`
Expected: clean. An unused `createPage`/`createLink` import in `app/admin/page.tsx` means Step 4's `<AdminChrome>` props were missed.

Run: `npm test`
Expected: PASS, all suites.

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 6: Manual check**

With `npm run dev`, logged in at `/admin`:

- The `+` is in the bottom-right on all three tabs.
- **Add a student** creates one and lands on the Students tab.
- On the Pages tab with the chip on a student, **Add a link** pre-fills that student and says *"Will be shared with Marie."*; **Add a page** pre-ticks the same pill. Switching the chip and reopening the sheet follows it; ticking a pill by hand and then switching the chip does **not** overwrite the choice.
- Pasting into **Add a page** publishes immediately with a title taken from the document, and the markup is never shown.
- With the chip on **All**, the Pinned section does not appear and the pin control is disabled. Unchanged behaviour — confirm the chip's move did not break it.
- `/admin/pages/<slug>` still edits a title and audience, and pasting there stages a replacement that only Save commits.

- [ ] **Step 7: Commit**

```bash
git add components/admin/AdminChrome.tsx components/admin/PagesTabClient.tsx components/admin/Collapsible.tsx app/admin/page.tsx
git commit -m "$(cat <<'EOF'
feat: one add-FAB across the admin, and the student chip moves up to meet it

The FAB has to sit outside the tab bodies to be one control, and it needs the
Pages tab's student chip to default a new page's audience. AdminChrome owns the
chip and publishes it; PagesTabClient consumes it. The group list moves to the
top of the page for the same reason, which is a knowing cost on the Daily tab.

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
)"
```

---

### Task 16: Update `CLAUDE.md`

Five statements in `CLAUDE.md` are now false. Each edit below quotes the exact text to find. Do not rewrite surrounding paragraphs.

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: The route table row (`CLAUDE.md:38`)**

Replace the `/g/[slug]` row's description — the cell beginning `the card for \`?date=\` (public);` and ending `either party may add a link and pin a page` — with:

```
the card for `?date=` (public); `?tab=files`, `?tab=board` and the chat need the token, teacher included — a teacher session adds only the delete and read-marker controls once unlocked, plus *Nouveau tableau* and a delete per board — except the everyone group, whose files are public and which has neither chat nor whiteboard. Both extra tabs are present for anyone unlocked, empty state and all. **An unlocked teacher has no card tab** and lands on Files; an untokened teacher is just a visitor and still gets the public card. Adding a link or a page is a `+` FAB left of the chat button, present on every tab, and either party may pin
```

- [ ] **Step 2: The drop zone (`CLAUDE.md:272`)**

Replace:

```
The admin editor shows no HTML at all: `PageEditor` holds the document in
state and `HtmlDropZone` takes a file, so the round trip for a correction is
download → edit in the tool she wrote it in → re-upload. The download is a
plain `<a download>` pointing at `/p/[slug]/raw`, which is why that route and
its CSP needed no change to support it.
```

with:

```
Neither editor shows HTML: both hold the document in state and
`HtmlPasteBox` takes a paste, so the round trip for a correction is download →
edit in the tool she wrote it in → copy → paste. The download is a plain
`<a download>` pointing at `/p/[slug]/raw`, which is why that route needed no
change to support it. The box's `onPaste` calls `preventDefault()` and reads
the clipboard itself, so the markup never enters the field — accepting it and
clearing it afterwards shows the document for a frame and reads as a failure.

`PageEditor` is the edit form only. Creating a page is `NewPageForm`, in the
FAB's sheet, where **the paste is the submit**: the title comes from the
document (`titleFromHtml`) and there is nothing else on that form. Pasting into
`PageEditor` does *not* save, because that screen has a title and an audience a
paste must not commit behind her. A derived title becomes a permanent slug —
the title stays editable afterwards and the slug never does — which is the
accepted cost of the one-gesture flow.
```

- [ ] **Step 3: The tab-presence rule (`CLAUDE.md:214`)**

Replace:

```
**A tab that hosts a control is present for anyone unlocked, empty state and
all** — Files and Whiteboard both. A student whose shelf is empty otherwise has
no way to reach the control that fills it, because the tab holding it is hidden
for being empty.
```

with:

```
**A tab is present for anyone unlocked, empty state and all** — Files and
Whiteboard both. The original reason was that a student with an empty shelf
could not otherwise reach the control that fills it; the add controls are a
page-level FAB now, so that argument no longer holds and the rule stands on the
weaker one that remains: a tab that vanishes when empty makes the shelf look
broken rather than empty, and *Nouveau tableau* still lives inside the board
tab.
```

- [ ] **Step 4: Preview caching**

Immediately after the paragraph ending `...which is the only thing the preview is for.` (in the *Both grids are 1152px wide* passage), insert a new paragraph:

```
A preview frames `/p/[slug]/raw?v=<token>`, where the token is
`pageVersion(page.updatedAt)`. The route recomputes it and answers **only an
exact match** with `private, max-age=31536000, immutable`; an absent or stale
`?v=` still gets `no-store`. Accepting any `?v=` would let a bookmarked stale
token pin a browser to a deleted document for a year, which is the one way this
scheme can fail. Nothing needs purging — an edit bumps `updatedAt`, which
changes the URL. The accepted cost is that a versioned response now reaches the
browser's disk cache, which the blanket `no-store` prevented. This removes the
fetch, not the re-layout of a dozen documents at 500%; `loading="lazy"` is
still what handles that.
```

- [ ] **Step 5: Student-authored pages (`CLAUDE.md:169`)**

Replace:

```
A student may delete only their own link, and only while nobody else can see it
(`canStudentDelete`); the server re-checks that regardless of which controls the
tile rendered.
```

with:

```
A student may add a page as well as a link — `addShelfPage` is `addShelfLink`'s
sibling and shares its `requireShelfRole` guard. They may delete only what they
added themselves, and only while nobody else can see it (`canStudentDelete`,
which keys off `addedByStudent` rather than the kind, because the kind used to
stand in for it and stopped being able to); the server re-checks that regardless
of which controls the tile rendered. Because a student can now publish a
document served from our origin, and a slug is derived from a title and so is
guessable, `/p/[slug]` carries `robots: { index: false, follow: false }` and its
raw route an `X-Robots-Tag`. The sandbox and the CSP are unchanged and are still
what contain anything scripted inside it.
```

- [ ] **Step 6: Verify the file still reads**

Run: `grep -n "HtmlDropZone\|Collapsible\|AddLinkRow" CLAUDE.md`
Expected: no output. Any hit is a reference to a component this plan deleted.

- [ ] **Step 7: Commit**

```bash
git add CLAUDE.md
git commit -m "$(cat <<'EOF'
docs: bring CLAUDE.md in line with the FABs, the paste box and preview caching

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
)"
```

---

### Task 17: Full verification

Nothing here is optional. **Do not report this work complete without pasting the output of every command below.**

**Files:** none.

- [ ] **Step 1: Run the full CI sequence in order**

```bash
npx prisma generate && npm run lint && npx tsc --noEmit && npm test && npm run build
```

Expected: all five succeed. This is the exact order `.github/workflows/ci.yml` uses; running them separately can hide a `prisma generate` that never ran.

- [ ] **Step 2: Confirm the deleted components are really gone**

```bash
grep -rn "HtmlDropZone\|Collapsible\|AddLinkRow" app components lib tests docs/superpowers/specs CLAUDE.md
```

Expected: no output. A hit in `docs/superpowers/specs/` from an **older, dated** spec is acceptable and must be left alone — those are historical records. A hit anywhere else is a miss.

- [ ] **Step 3: Confirm no preview call site was left uncached**

```bash
grep -rn "HtmlPreview" app components
```

Expected: exactly three hits — the definition in `components/ui/HtmlPreview.tsx` and one call each in `components/admin/PageList.tsx` and `components/student/FilesTab.tsx`, both passing `version={pageVersion(...)}`. (Two comment mentions in `PageTile.tsx` and `LinkPreview.tsx` are prose, not calls.)

- [ ] **Step 4: Confirm the caching actually works — headless**

No browser needed for any of this. It relies on the everyone shelf being public, so the rendered tile markup — including the `?v=` the server chose — can be read with `curl`.

Start the dev server in one shell (`npm run dev`), then in another:

```bash
# Prerequisite: at least one HTML page assigned to the everyone group. If the
# grep below prints nothing, add one from /admin first, or run:
#   npx prisma studio
# and check a Page row with kind="html" has a PageGroup row for the isEveryone group.
SRC=$(curl -s "http://localhost:3000/g/all?tab=files" \
  | grep -o '/p/[a-z0-9-]*/raw?v=[a-z0-9]*' | head -1)
echo "tile frames: $SRC"
```

Expected: a path like `/p/verb-drills/raw?v=m8k2p1q`. **Empty output means the tile is still framing the unversioned URL** — Step 2 or 3 of Task 7 was missed.

```bash
# 1. The matching token is cacheable
curl -sI "http://localhost:3000$SRC" | grep -i '^cache-control\|^x-robots-tag'
```
Expected: `cache-control: private, max-age=31536000, immutable` and `x-robots-tag: noindex, nofollow`.

```bash
# 2. No token is not
SLUG=$(echo "$SRC" | sed 's|/p/||; s|/raw.*||')
curl -sI "http://localhost:3000/p/$SLUG/raw" | grep -i '^cache-control'
```
Expected: `cache-control: no-store`.

```bash
# 3. A STALE token is not either. This is the one that matters — accepting any
#    ?v= would pin a browser to a deleted document for a year.
curl -sI "http://localhost:3000/p/$SLUG/raw?v=deadbeef" | grep -i '^cache-control'
```
Expected: `cache-control: no-store`.

```bash
# 4. Invalidation: touch the row, confirm the token the tile frames has changed
npx prisma db execute --stdin <<SQL
UPDATE Page SET updatedAt = datetime('now') WHERE slug = '$SLUG';
SQL
curl -s "http://localhost:3000/g/all?tab=files" \
  | grep -o "/p/$SLUG/raw?v=[a-z0-9]*" | head -1
```
Expected: a **different** `?v=` from the one printed at the top. A cache that never misses is a cache that will one day serve a deleted document, so this check is not optional.

If `/g/all` is not the everyone slug in this database, substitute the real one — `EVERYONE_SLUG` in `lib/everyone.ts` is the seeded default.

- [ ] **Step 4b: The visual checks a browser is needed for**

These cannot be done headlessly. If you have no browser, **report them as outstanding rather than claiming them**:

1. The preview thumbnails still render page content at roughly laptop width (the 500%/0.2 scaling survived the `?v=` change).
2. The `+` FAB sits left of the chat bubble and neither covers the other, on a phone width and a desktop width.
3. The `AddMenu` popover and `AddSheet` modal open above everything and dismiss on Escape and on an outside click.
4. Pasting into a paste box never shows the markup, not even for a frame.

- [ ] **Step 5: Walk the six fixes**

| # | Check |
|---|---|
| 1 | Previews served from cache, per Step 4 |
| 2 | One `+` on `/admin` and one on an unlocked `/g/<slug>`; no inline add-form remains on either |
| 3 | `/g/marie` greets "Bonjour Marie"; `/g/all` greets nobody |
| 4 | No ⚜ line or week range in the header; both appear under the tab strip on the card tab only |
| 5 | Adding a link is one field and the title is derived |
| 6 | Logged in with `?k=`, `/g/<slug>` shows two tabs and opens on Files |

- [ ] **Step 6: Final commit if anything moved**

```bash
git status
```

Expected: clean. If Step 1 changed a generated file, commit it:

```bash
git add -A
git commit -m "$(cat <<'EOF'
chore: post-verification fixes

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
)"
```

---

## Coverage Check

Every requirement in the spec, and the task that implements it:

| Spec section | Tasks |
|---|---|
| 1 · Cached HTML previews | 1, 7 |
| 1 · `noindex` on published pages | 7 |
| 2 · Shared FAB primitives | 9 |
| 2 · Admin FAB and the chip lift | 15 |
| 2 · Student FAB | 12 |
| 2b · Paste box and `titleFromHtml` | 2, 10, 13, 14 |
| 2c · Student-authored HTML | 6, 8 |
| 3 · Greeting | 4, 11 |
| 4 · Card heading moves | 11 |
| 5 · One-field links and `titleFromUrl` | 3, 8 |
| 6 · No card tab for the teacher | 5, 11 |
| Testing | 1–6 (five test files, two extended) |
| Documentation | 16 |

Item 7 of the original request — opening the chat by default on desktop — was **dropped** and appears in no task. `ChatFab` still opens only on click; Task 9 moves its button onto the shared `Fab` and changes nothing else about it.

