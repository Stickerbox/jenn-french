# Teacher ergonomics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop Jenn losing a live whiteboard by clicking anything, make a student's page say whose page it is and get her back to the admin, give a PDF on a shelf a picture of its first page, and turn the invite link into a button she clicks once.

**Architecture:** Five independent slices over one spec — `docs/superpowers/specs/2026-08-04-teacher-ergonomics-design.md`. The navigation guard is a pure rule in `lib/` consulted by one capture-phase listener in `BoardEditor`, deliberately not a context that every future link has to opt into. The PDF thumbnail is rendered by Jenn's browser at upload time (the same decision `BoardEditor.renderThumbnail` already documents), stored as bytes, and served from `/p/[slug]/thumb` with a year-long `immutable` cache that is safe only because the tile appends `?v=<pdfThumbAt>`. Nothing in this plan changes an authorisation rule.

**Tech Stack:** Next 16 App Router, React 19, TypeScript, Prisma 6 + SQLite, Tailwind v4 (PostCSS, no config file), Vitest. One new dependency: `pdfjs-dist`, loaded only behind a dynamic `import()` in the admin.

---

## Read first

- The spec: `docs/superpowers/specs/2026-08-04-teacher-ergonomics-design.md`. Every "why" in this plan is argued there.
- `CLAUDE.md`, in full. It is unusually load-bearing in this repo: the comments record decisions and the failures that motivated them, and several tasks below turn on rules it states.
- `docs/superpowers/specs/2026-08-03-page-pdf-support-design.md` before Tasks 7–14.
- `docs/superpowers/specs/2026-08-03-student-login-design.md` before Task 16.

## Conventions this repo enforces

Getting these wrong costs a CI run each time.

1. **Logic goes in `lib/` as a pure function with a test in `tests/lib/`.** Components and Prisma access are not unit-tested. Do not add a component test; do not skip a `lib/` test.
2. **Comments explain the *why*, especially the counter-intuitive.** Never write a comment that restates the code. The comments in the code blocks below are part of the deliverable — keep them.
3. **JSX text must escape apostrophes.** `react/no-unescaped-entities` is on. Write `l&apos;instant`, not `l'instant`. French punctuation before `!` and `?` uses `&nbsp;`.
4. **`<img>` needs a justified disable.** `@next/next/no-img-element` is on; see `components/whiteboard/BoardTile.tsx:83` for the house form.
5. **Imports use the `@/` alias.**
6. **Repeated flashcard class strings live in `components/card-styles.ts`.**
7. **Student-facing copy is French, teacher-facing copy is English** — *except* inside `components/whiteboard/`, which is French throughout even though only the teacher sees it. Match the file you are in.
8. **Commit after every task.** Trailer: `Co-Authored-By: Claude Code <noreply@anthropic.com>`.

## Verification commands

```bash
npx prisma generate       # after any schema.prisma change
npm run lint
npm run typecheck
npm test
npm run build
```

CI runs them in that order. Run at least `lint`, `typecheck` and `test` before each commit; run `build` at Task 18.

## File structure

| File | Responsibility |
|---|---|
| `lib/leave-guard.ts` | **New.** Two pure rules: is this click about to unload the page, and where should it go afterwards. |
| `lib/whiteboard-ops.ts` | **Modify.** One export, `boardHasContent` — the save-worthiness test, extracted so the dialog and `save()` cannot disagree. |
| `components/whiteboard/LeaveBoardDialog.tsx` | **New.** The modal. Three exits, no logic. |
| `components/whiteboard/BoardEditor.tsx` | **Modify.** Splits `save()` into `persist()`, installs the click guard plus two window listeners, renders the dialog. |
| `lib/student-greeting.ts` | **Modify.** `teacherPageLabel` beside `greeting`. |
| `app/g/[slug]/page.tsx` | **Modify.** Teacher header line, back-to-admin link, `LiveBanner` suppressed for the teacher. |
| `lib/page-thumb.ts` | **New.** `MAX_THUMB_BYTES`, `validatePageThumb`. Mirror of `lib/page-pdf.ts`. |
| `prisma/schema.prisma` | **Modify.** `Page.pdfThumb`, `Page.pdfThumbAt`, plus a migration. |
| `lib/pages.ts` | **Modify.** `savePage`'s pdf member carries a thumbnail; `pdfThumbAt` joins both list selects; new `getPageThumb`. |
| `app/page-actions.ts` | **Modify.** The two pdf actions read and validate the thumbnail field. |
| `app/p/[slug]/thumb/route.ts` | **New.** The bytes, and the headers that make a year-long cache safe. |
| `components/admin/pdf-thumbnail.ts` | **New.** `renderPdfThumbnail`. Impure by design, and that is why it is not in `lib/`. |
| The admin's page form(s) | **Modify.** Staging never submits; the thumbnail renders while she picks the audience. |
| `components/ui/PdfPreview.tsx` | **Modify.** A picture when there is one, today's glyph when there is not. |
| `components/student/FilesTab.tsx`, `components/admin/PageList.tsx` | **Modify.** Pass the version through. |
| `components/card-styles.ts` | **Modify.** `tileActionClass`, hoisted out of `PageList`. |
| `components/admin/GroupList.tsx` | **Modify.** Three icon buttons; the printed invite link removed. |

---

## Task 0: Confirm the baseline before editing anything

This plan was written against a tree where student sign-in and PDF pages are built and the chat inbox is not. Confirm that. If a check disagrees, **stop and report which one** rather than adapting silently — several tasks below would land in the wrong place.

- [ ] **Step 1: Confirm student sign-in is built**

```bash
grep -n "passwordHash\|claimedAt" prisma/schema.prisma
ls lib/student-gate.ts
grep -n "claimedAt\|Reset sign-in\|New invite link" components/admin/GroupList.tsx
```

Expected: `email`, `passwordHash` and `claimedAt` on `Group`; `lib/student-gate.ts` exists; `GroupList` knows about the claimed state.

- [ ] **Step 2: Confirm PDF pages are built**

```bash
grep -n "pdf\b\|pdfSize" prisma/schema.prisma
ls app/p/\[slug\]/pdf/route.ts lib/page-pdf.ts components/ui/PdfPreview.tsx
grep -rn "createPdfPage\|updatePdfPage" app/page-actions.ts
grep -n "\"pdf\"" lib/page-kind.ts
```

Expected: all present. Note whether the drop zone is `components/ui/FileDropZone.tsx` or still `components/admin/HtmlDropZone.tsx`, and note the exact shape `validatePagePdf` returns — Task 7 mirrors it.

- [ ] **Step 3: Confirm the chat inbox is NOT built**

```bash
ls app/api/chat/stream 2>/dev/null || echo "absent, as expected"
grep -rn "listConversations\|TeacherInbox" --include="*.ts" --include="*.tsx" . | grep -v node_modules
```

Expected: no `/api/chat/stream`, no `listConversations`, no `TeacherInbox`. If they exist, the inbox landed first: Task 16 still applies to the tile's *action slot*, but re-read `GroupSummary` — the inbox reshapes the same type's `unread` field.

- [ ] **Step 4: Find the page-creating form**

```bash
ls components/admin/NewPageForm.tsx 2>/dev/null
grep -rn "onFile" --include="*.tsx" components/ | grep -v node_modules
grep -rn "onSubmitPdf\|createPdfPage" --include="*.tsx" components/
```

Write down which component stages a PDF and which one submits it. Task 13 needs both and cannot name them from here.

- [ ] **Step 5: Confirm the whiteboard files are as this plan expects**

```bash
grep -n "function save()\|dropTrailingEmptyPages(foldOps(ops))\|discard" components/whiteboard/BoardEditor.tsx
grep -n "isTeacher" components/whiteboard/BoardTab.tsx
grep -n "Jenn dessine en ce moment" components/whiteboard/LiveBanner.tsx
grep -n "LiveBanner" app/g/\[slug\]/page.tsx
```

Expected: `BoardEditor` has a `save()` containing `dropTrailingEmptyPages(foldOps(ops))` and an *Annuler* button that POSTs `/discard`; `BoardTab` already gates its live view on `!isTeacher`; `LiveBanner` holds that string; the page renders `<LiveBanner …>` behind an `unlocked` check.

- [ ] **Step 6: Confirm the tree is green before you change it**

```bash
npx prisma generate && npm run lint && npm run typecheck && npm test
```

Expected: all pass. A pre-existing failure is worth knowing about now rather than blaming on Task 4.

No commit for this task.

---

## Task 1: `boardHasContent`

The predicate the leave guard arms on. It must be the *same* question `save()` asks, or the dialog can offer a primary button that fails.

**Files:**
- Modify: `lib/whiteboard-ops.ts`
- Test: `tests/lib/whiteboard-ops.test.ts`

**Interfaces:**
- Produces: `boardHasContent(ops: Op[]): boolean`. Tasks 2 and 4 consume it.

- [ ] **Step 1: Write the failing tests**

Append to `tests/lib/whiteboard-ops.test.ts`. Add `boardHasContent` to the existing import from `@/lib/whiteboard-ops`.

```ts
describe("boardHasContent", () => {
  const stroke = (id: string, page = 0): Op => ({
    id,
    page,
    kind: "stroke",
    points: [0, 0, 10, 10],
    colour: PALETTE[0],
    width: 5,
  });

  it("is false for an untouched board", () => {
    expect(boardHasContent([])).toBe(false);
  });

  it("is true for one stroke", () => {
    expect(boardHasContent([stroke("a")])).toBe(true);
  });

  // The case that decides the shape of this function. `ops.length > 0` would
  // say true here, the dialog would offer to save, and the save would refuse
  // the board as empty.
  it("is false when everything drawn has been removed", () => {
    expect(
      boardHasContent([
        stroke("a"),
        { id: "r", page: 0, kind: "remove", targets: ["a"] },
      ]),
    ).toBe(false);
  });

  it("is true for a stroke on a later page with earlier pages empty", () => {
    expect(boardHasContent([stroke("a", 2)])).toBe(true);
  });

  it("is false for pages she added and never drew on", () => {
    expect(
      boardHasContent([
        stroke("a", 1),
        { id: "r", page: 1, kind: "remove", targets: ["a"] },
      ]),
    ).toBe(false);
  });
});
```

Check the top of the file for the existing import style and whether `PALETTE` and `Op` are already imported; add only what is missing.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/lib/whiteboard-ops.test.ts`
Expected: FAIL — `boardHasContent is not a function`.

- [ ] **Step 3: Write the implementation**

Append to `lib/whiteboard-ops.ts`, directly after `dropTrailingEmptyPages`:

```ts
// Whether this log would survive a save.
//
// /finish refuses a board whose folded pages are all empty, and
// BoardEditor.save() checks the same thing before posting — so the leave guard
// has to ask the identical question. A looser test (ops.length > 0) would raise
// the dialog for a board holding one stroke and a remove of it, and its primary
// button — save — would then fail as empty. A dialog whose main action cannot
// succeed is a trap, so the predicate is shared rather than re-expressed.
export function boardHasContent(ops: Op[]): boolean {
  return !dropTrailingEmptyPages(foldOps(ops)).every(
    (page) => page.length === 0,
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/lib/whiteboard-ops.test.ts`
Expected: PASS, including the pre-existing cases in that file.

- [ ] **Step 5: Commit**

```bash
git add lib/whiteboard-ops.ts tests/lib/whiteboard-ops.test.ts
git commit -m "$(cat <<'EOF'
feat: extract boardHasContent from the save path

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `lib/leave-guard.ts`

**Files:**
- Create: `lib/leave-guard.ts`
- Test: `tests/lib/leave-guard.test.ts`

**Interfaces:**
- Produces: `shouldGuardNavigation(click: NavigationClick): boolean` and `navigationTarget(href: string, origin: string): NavigationTarget`. Task 4 consumes both.

- [ ] **Step 1: Write the failing test**

Create `tests/lib/leave-guard.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { navigationTarget, shouldGuardNavigation } from "@/lib/leave-guard";

const ORIGIN = "https://francaisavecjenn.ca";
const HERE = `${ORIGIN}/g/marie?tab=board`;

// The defaults are an unmodified primary click on a plain in-app link.
function click(over: Partial<Parameters<typeof shouldGuardNavigation>[0]> = {}) {
  return shouldGuardNavigation({
    href: `${ORIGIN}/g/marie?tab=files`,
    target: null,
    download: false,
    modified: false,
    currentUrl: HERE,
    ...over,
  });
}

describe("shouldGuardNavigation", () => {
  // The case this whole module exists for: the tab strip is next/link, so
  // switching tabs is a soft navigation that unmounts the board editor.
  it("guards a same-path, different-query link", () => {
    expect(click()).toBe(true);
  });

  it("guards an off-site link, because leaving the site loses the board too", () => {
    expect(click({ href: "https://example.com/somewhere" })).toBe(true);
  });

  it("guards target=_self explicitly", () => {
    expect(click({ target: "_self" })).toBe(true);
  });

  it("ignores a click that was not on a link", () => {
    expect(click({ href: null })).toBe(false);
  });

  it("ignores a modified click, which opens elsewhere", () => {
    expect(click({ modified: true })).toBe(false);
  });

  it("ignores target=_blank", () => {
    expect(click({ target: "_blank" })).toBe(false);
  });

  it("ignores a named frame target", () => {
    expect(click({ target: "preview" })).toBe(false);
  });

  it("ignores a download, which saves rather than navigates", () => {
    expect(click({ href: `${ORIGIN}/p/x/raw`, download: true })).toBe(false);
  });

  it("ignores a fragment-only change, which re-renders nothing", () => {
    expect(click({ href: `${HERE}#bas` })).toBe(false);
  });

  it("ignores a link to exactly where we already are", () => {
    expect(click({ href: HERE })).toBe(false);
  });
});

describe("navigationTarget", () => {
  it("keeps a same-origin href as a router path, query and hash included", () => {
    expect(navigationTarget(`${ORIGIN}/g/marie?tab=files#x`, ORIGIN)).toEqual({
      kind: "internal",
      path: "/g/marie?tab=files#x",
    });
  });

  it("sends a cross-origin href to a full load", () => {
    expect(navigationTarget("https://example.com/a", ORIGIN)).toEqual({
      kind: "external",
      href: "https://example.com/a",
    });
  });

  // A mailto: or tel: href is not something router.push can take. It parses —
  // its origin comes out as the string "null", which never equals a real one —
  // so it reaches `external` through the comparison rather than through the
  // catch.
  it("treats a non-http scheme as external", () => {
    expect(navigationTarget("mailto:jenn@example.com", ORIGIN)).toEqual({
      kind: "external",
      href: "mailto:jenn@example.com",
    });
  });

  // A protocol-relative href leaves the origin, so it is a full load.
  it("treats a protocol-relative href to another host as external", () => {
    expect(navigationTarget("//example.com/a", ORIGIN)).toEqual({
      kind: "external",
      href: "//example.com/a",
    });
  });

  // The catch branch. Note what it takes to reach: with a valid base, `new URL`
  // resolves essentially anything — even "::::" comes back as the path
  // "/::::" — so it is a bad BASE that throws, not a bad href. In production the
  // base is window.location.origin and this is unreachable; it is here so the
  // function has no way to throw at a call site that cannot handle it.
  it("hands the href back whole rather than throwing on a bad origin", () => {
    expect(navigationTarget("/g/marie", "not-an-origin")).toEqual({
      kind: "external",
      href: "/g/marie",
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/lib/leave-guard.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/leave-guard"`.

- [ ] **Step 3: Write the implementation**

Create `lib/leave-guard.ts`:

```ts
// Deciding whether a click is about to destroy something.
//
// BoardEditor holds a live whiteboard's op log in component state, and /finish
// treats that log as authoritative — so ANY navigation away from /g/[slug]
// loses the board, including a soft one. The tab strip is next/link, so
// "Les fichiers" mid-lesson is exactly that: the page re-renders with a new
// tab, BoardTab unmounts, and the log goes with it without a warning.
//
// The editor watches clicks at the document's capture phase and asks this
// function whether the one it just saw is going to replace or unload the page.
// The false cases below are all the same fact: the current document is not going
// anywhere, so there is nothing to lose and a dialog would be a lie.

export type NavigationClick = {
  // The resolved ABSOLUTE href of the nearest ancestor <a>, or null when the
  // click was not on a link. Absolute because the comparison below needs to
  // hold against window.location.href; getAttribute("href") would hand this a
  // relative string and every comparison would be false.
  href: string | null;
  // Anything that names another frame or a new tab leaves this document loaded.
  target: string | null;
  download: boolean;
  // A modifier key or a non-primary button. The browser opens these somewhere
  // else and this page survives.
  modified: boolean;
  currentUrl: string;
};

export function shouldGuardNavigation(click: NavigationClick): boolean {
  if (!click.href) return false;
  if (click.download) return false;
  if (click.modified) return false;

  // "" and "_self" both mean this frame. Every other value — "_blank",
  // "_parent", a window name — leaves the current document in place.
  const target = click.target ?? "";
  if (target !== "" && target !== "_self") return false;

  // A fragment-only difference is a same-document jump: nothing re-renders, the
  // editor is still mounted afterwards, and so is the board. An href identical
  // to the current URL falls out here too, which is right — prompting on the
  // tab she is already looking at would be noise.
  return stripFragment(click.href) !== stripFragment(click.currentUrl);
}

function stripFragment(url: string): string {
  const hash = url.indexOf("#");
  return hash === -1 ? url : url.slice(0, hash);
}

export type NavigationTarget =
  | { kind: "internal"; path: string }
  | { kind: "external"; href: string };

// Where to send her after she has answered the dialog. A same-origin href goes
// through the router, because a full page load for a tab switch would work and
// would feel wrong; anything else — another origin, mailto:, tel: — is handed to
// the browser whole.
export function navigationTarget(
  href: string,
  origin: string,
): NavigationTarget {
  let url: URL;
  try {
    url = new URL(href, origin);
  } catch {
    // Only reachable with a base we cannot parse — a valid base resolves almost
    // any href, "::::" included. Kept so this function has no way to throw at a
    // call site that could not do anything about it, and a full load is the safe
    // reading of an href we do not understand: the browser knows what to do with
    // it and the router does not.
    return { kind: "external", href };
  }

  if (url.origin !== origin) return { kind: "external", href };
  return { kind: "internal", path: `${url.pathname}${url.search}${url.hash}` };
}
```

Note the `mailto:` case: `new URL("mailto:…")` parses, and its `origin` is the string `"null"`, which never equals a real origin — so it falls to `external` through the comparison rather than through the `catch`. Return `href` rather than `url.href` in both external branches so nothing is silently normalised.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/lib/leave-guard.test.ts`
Expected: PASS, 14 tests.

- [ ] **Step 5: Typecheck and lint**

```bash
npm run typecheck && npm run lint
```

- [ ] **Step 6: Commit**

```bash
git add lib/leave-guard.ts tests/lib/leave-guard.test.ts
git commit -m "$(cat <<'EOF'
feat: add the navigation leave guard rules

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `LeaveBoardDialog`

**Files:**
- Create: `components/whiteboard/LeaveBoardDialog.tsx`

**Interfaces:**
- Produces: `LeaveBoardDialog`, props `{ saving: boolean; error: string | null; onSave: () => void; onDiscard: () => void; onCancel: () => void }`. Task 4 renders it.
- No test: it is a component, and this repo does not unit-test components.

**Copy is French**, matching every other string in `components/whiteboard/` — *Annuler*, *Terminé*, *Le tableau est vide.* — even though only the teacher ever sees it. A dialog in English inside a French toolbar reads as a different product.

- [ ] **Step 1: Write the component**

Create `components/whiteboard/LeaveBoardDialog.tsx`:

```tsx
"use client";

import { useEffect } from "react";

// Asked when a click is about to take her off a board she has not saved.
//
// This one IS aria-modal, unlike ChatWindow, and the contrast is the reason it
// is written down: the point of the chat panel is that the page stays readable
// behind it, and the point of this one is that the page must not be touched
// until she answers — every control behind it is another way to lose the board
// she is being asked about.
export function LeaveBoardDialog({
  saving,
  error,
  onSave,
  onDiscard,
  onCancel,
}: {
  saving: boolean;
  // Rendered in here rather than only behind the backdrop: a failed save must
  // leave her somewhere she can act on it, and the buttons are in here.
  error: string | null;
  onSave: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      // Not while a save is in flight: Escape would strand a request whose
      // result she can no longer see.
      if (event.key === "Escape" && !saving) onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, saving]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={() => {
        if (!saving) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="leave-board-title"
        // The backdrop closes; a click on the card must not bubble up to it.
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-[420px] rounded-[14px] border border-[var(--card-line)] bg-[var(--card-paper)] p-6 shadow-[var(--card-shadow)]"
      >
        <h2
          id="leave-board-title"
          className="mb-2 font-[family-name:var(--card-font-serif)] text-lg text-[var(--card-ink)]"
        >
          Terminer ce tableau&nbsp;?
        </h2>
        <p className="mb-5 font-[family-name:var(--card-font-serif)] text-sm text-[var(--card-moss)]">
          Vous quittez cette page. Ce tableau n&apos;est pas encore
          enregistré.
        </p>

        {error && (
          <p role="alert" className="mb-4 text-sm text-[var(--card-rouge)]">
            {error}
          </p>
        )}

        {/* Stacked rather than in a row: three labels of this length wrap badly
            side by side on a phone, and the destructive one should not sit
            where a thumb reaching for the primary one lands. */}
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="rounded-full bg-[var(--card-bleu)] px-5 py-2.5 font-[family-name:var(--card-font-serif)] text-sm text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Enregistrement…" : "Fermer et enregistrer"}
          </button>
          <button
            type="button"
            onClick={onDiscard}
            disabled={saving}
            className="rounded-full border border-[var(--card-line)] px-5 py-2.5 font-[family-name:var(--card-font-serif)] text-sm text-[var(--card-rouge)] disabled:opacity-50"
          >
            Fermer sans enregistrer
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="px-5 py-1.5 font-[family-name:var(--card-font-serif)] text-sm text-[var(--card-moss)] underline disabled:opacity-50"
          >
            Rester sur le tableau
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles and lints**

```bash
npm run typecheck && npm run lint
```

Expected: both pass. If lint complains about an unescaped entity, you have a literal `'` in JSX text — see convention 3.

- [ ] **Step 3: Commit**

```bash
git add components/whiteboard/LeaveBoardDialog.tsx
git commit -m "$(cat <<'EOF'
feat: add the leave-board confirmation dialog

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Wire the guard into `BoardEditor`

The biggest task in the plan. Five changes to one file: split `save()`, add the click guard, add two window listeners, add a `navigate` helper, render the dialog.

**Files:**
- Modify: `components/whiteboard/BoardEditor.tsx`

**Interfaces:**
- Consumes: `boardHasContent` (Task 1), `shouldGuardNavigation` and `navigationTarget` (Task 2), `LeaveBoardDialog` (Task 3).
- Produces nothing new. `onSaved` and `onCancel` keep their existing meanings and `BoardTab` needs no change.

- [ ] **Step 1: Extend the imports**

Add `useRouter`, the two guard rules, `boardHasContent`, and the dialog. `useEffect`, `useRef` and `useState` are already imported; `dropTrailingEmptyPages` and `foldOps` already come from `@/lib/whiteboard-ops` — add `boardHasContent` to that same import list.

```tsx
import { useRouter } from "next/navigation";
import {
  navigationTarget,
  shouldGuardNavigation,
} from "@/lib/leave-guard";
import { LeaveBoardDialog } from "@/components/whiteboard/LeaveBoardDialog";
```

- [ ] **Step 2: Add the state, the router, and the dirty flag**

Directly after the existing `const [liveError, setLiveError] = useState(false);`:

```tsx
  const router = useRouter();

  // The href she clicked, held while the dialog asks what to do about it. Null
  // means no dialog.
  const [leavingTo, setLeavingTo] = useState<string | null>(null);
  // Set once she has answered, so neither listener below fires again for a
  // decision she has already made. A ref rather than state: the listeners read
  // it during an event, not during a render.
  const leaving = useRef(false);
```

Then, next to the existing `const scene = foldOps(ops);`:

```tsx
  // The same question save() asks. Shared rather than re-expressed, so the
  // dialog can never appear for a board whose save would refuse it as empty.
  const dirty = boardHasContent(ops);
```

- [ ] **Step 3: Split `save()` into `persist()` and its two callers**

Replace the existing `async function save()` in full with the following. `discard()` is factored out because three places now post it — *Annuler*, the dialog, and the beacon builds its own URL for the same route.

```tsx
  function discard() {
    void fetch(`/api/whiteboard/${slug}/discard`, { method: "POST" });
  }

  // Returns whether the board is now stored, rather than calling onSaved itself.
  // The leave dialog needs to save and then NAVIGATE, and onSaved returns her to
  // the archive on this page — which is not where she was going.
  //
  // `saving` is deliberately not reset on success: either onSaved or a
  // navigation unmounts this component, and clearing it first would flash the
  // button back to "Terminé" on the way out.
  async function persist(): Promise<boolean> {
    setSaving(true);
    setError(null);
    try {
      if (!boardHasContent(ops)) {
        setError("Le tableau est vide.");
        setSaving(false);
        return false;
      }

      const kept = dropTrailingEmptyPages(foldOps(ops));
      const response = await fetch(`/api/whiteboard/${slug}/finish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ops, thumbnail: renderThumbnail(kept[0]) }),
      });
      if (!response.ok) throw new Error("save failed");
      return true;
    } catch {
      // The log is still in state, so she can press Terminé again rather than
      // losing the board.
      setError("Échec de l'enregistrement. Réessayez.");
      setSaving(false);
      return false;
    }
  }

  async function save() {
    if (await persist()) onSaved();
  }

  // Both listeners are off from here. Without this an external location.assign
  // would immediately hit beforeunload and ask her the same question twice.
  function navigate(href: string) {
    leaving.current = true;
    const target = navigationTarget(href, window.location.origin);
    if (target.kind === "internal") router.push(target.path);
    else window.location.assign(target.href);
  }

  async function saveAndLeave(href: string) {
    if (await persist()) navigate(href);
  }
```

**Careful with the apostrophe.** `&apos;` is an HTML entity and belongs **only in JSX text**, where convention 3 requires it. Inside a TypeScript string literal it is not decoded — `setError("l&apos;enregistrement")` puts those six characters on her screen. Both strings above are string literals and take a real `'`; the strings in Task 3's dialog are JSX text and take `&apos;`. The existing line in this file already has it right, so the safest move is to leave that string exactly as you found it.

- [ ] **Step 4: Point *Annuler* at `discard()`**

The existing button inlines the fetch. Replace its handler so there is one caller of that URL shape in the component:

```tsx
          <button
            type="button"
            onClick={() => {
              discard();
              onCancel();
            }}
            className="rounded-full border border-[var(--card-line)] px-4 py-2 text-sm"
          >
            Annuler
          </button>
```

- [ ] **Step 5: Add the click guard**

Add after the existing keyboard `useEffect` (the Backspace/Delete one):

```tsx
  // A capture-phase listener on the document, rather than a guard that the tab
  // strip and the back-to-admin link opt into.
  //
  // Those two are not the only anchors on this page and they will not be the
  // last. A guard you have to remember to wire is one a future link will not
  // have, and the failure is a lost lesson with no error — the same shape of
  // risk chatRole's comment describes about a rule duplicated across two files.
  // Catching an anchor that did not need guarding costs one dialog; missing one
  // costs a board.
  //
  // Capture phase specifically, so this runs before next/link's own handler and
  // can preventDefault the navigation it was about to perform.
  useEffect(() => {
    if (!dirty) return;

    function onClick(event: MouseEvent) {
      if (leaving.current) return;

      const node = event.target;
      if (!(node instanceof Element)) return;
      const anchor = node.closest("a");
      // An SVG <a> is also matched by that selector and is not what we mean.
      if (!(anchor instanceof HTMLAnchorElement)) return;

      if (
        !shouldGuardNavigation({
          // The resolved absolute form. getAttribute("href") would give a
          // relative string and every comparison in the rule would be false.
          href: anchor.href || null,
          target: anchor.target || null,
          download: anchor.hasAttribute("download"),
          modified:
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey ||
            event.button !== 0,
          currentUrl: window.location.href,
        })
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      // Any stale save error belongs to the last attempt, not to this question.
      setError(null);
      setLeavingTo(anchor.href);
    }

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [dirty]);
```

- [ ] **Step 6: Add the two window listeners**

Immediately after the effect from Step 5:

```tsx
  // The browser's own prompt for closing or reloading the tab. Its wording is
  // the browser's and cannot be replaced, which is exactly why the in-app
  // dialog above exists rather than relying on this alone.
  //
  // Installed only while there is something to lose: a prompt on an empty board
  // teaches her to dismiss prompts.
  useEffect(() => {
    if (!dirty) return;

    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (leaving.current) return;
      event.preventDefault();
      // Deprecated, and still what some browsers require before they will show
      // the prompt at all.
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  // Frees the server's live-board slot when the page really does go away.
  //
  // NOT gated on `dirty`, and the difference from the two effects above is the
  // whole point of this one. They ask about CONTENT, which an empty board has
  // none of. This frees a SLOT, which an empty board occupies just as fully:
  // liveBoards.open() returns false when one is already open for the group and
  // /api/whiteboard/[slug]/open turns that into a 409, so a board abandoned
  // without a discard makes her NEXT board for this student open with the live
  // view already broken — "Diffusion en direct indisponible" — for the life of
  // the process.
  //
  // pagehide rather than beforeunload: beforeunload fires BEFORE she has
  // answered the prompt, and discarding a board she then chose to keep is the
  // exact failure this guard exists to prevent.
  //
  // A discard after a successful /finish is harmless — liveBoards.discard is
  // documented tolerant of a group with no board, and the student's client
  // treats "saved" and "closed" the same way.
  useEffect(() => {
    function onPageHide(event: PageTransitionEvent) {
      // Going into the back/forward cache, not away. The page may come back to
      // a board that is still hers.
      if (event.persisted) return;

      const url = `/api/whiteboard/${slug}/discard`;
      // sendBeacon is specified to outlive the document; fetch is not. The
      // route reads nothing from the request body, so a bodyless POST is a
      // valid call to it.
      if (navigator.sendBeacon) navigator.sendBeacon(url);
      else void fetch(url, { method: "POST", keepalive: true });
    }

    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, [slug]);
```

- [ ] **Step 7: Render the dialog**

As the last child of the component's outermost `<div className="mx-auto w-full max-w-[1100px]">`, after the page-controls row:

```tsx
      {leavingTo && (
        <LeaveBoardDialog
          saving={saving}
          error={error}
          onSave={() => void saveAndLeave(leavingTo)}
          onDiscard={() => {
            discard();
            navigate(leavingTo);
          }}
          onCancel={() => setLeavingTo(null)}
        />
      )}
```

- [ ] **Step 8: Verify**

```bash
npm run typecheck && npm run lint && npm test
```

Expected: all pass. Two likely complaints:
- `react-hooks/exhaustive-deps` on the Step 5 and 6 effects. They read `dirty` and `slug`, both listed; `leaving` is a ref and `setError`/`setLeavingTo` are stable setters, so nothing is missing. If the rule still objects, name the real missing dependency rather than adding a disable comment.
- `react-hooks/refs` if you moved anything into a ref read during render. `leaving.current` is read only inside event handlers, which is allowed.

- [ ] **Step 9: Manual check — this is the task that needs a browser**

```bash
npm run dev
```

1. Sign in at `/login`, open a student from `/admin?tab=groups` (the tile link carries `?k=`), go to *Le tableau*, press *Nouveau tableau*, draw one stroke.
2. Click *Les fichiers*. **Expected:** the dialog appears and the tab does not change.
3. *Rester sur le tableau* → the board is exactly as it was, stroke included.
4. Click *Les fichiers* again → *Fermer sans enregistrer* → the files tab loads and the board is gone.
5. Draw again, click *Les fichiers* → *Fermer et enregistrer* → the files tab loads; go back to *Le tableau* and the board is in the archive.
6. Draw again, then reload the tab. **Expected:** the browser's own "Leave site?" prompt. Confirm it. Then open the student again and press *Nouveau tableau*: **no** *Diffusion en direct indisponible*. That is the 409 regression, and this step is the only thing that proves it fixed.
7. Press *Nouveau tableau* and immediately click *Les fichiers* without drawing. **Expected:** no dialog — nothing to lose.

- [ ] **Step 10: Commit**

```bash
git add components/whiteboard/BoardEditor.tsx
git commit -m "$(cat <<'EOF'
feat: confirm before leaving an unsaved whiteboard

Also discards the live board on pagehide, which frees the liveBoards slot
that /open otherwise refuses with a 409 for the rest of the process's life.

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `teacherPageLabel`

**Files:**
- Modify: `lib/student-greeting.ts`
- Test: `tests/lib/student-greeting.test.ts`

**Interfaces:**
- Produces: `teacherPageLabel(name: string): string | null`. Task 6 consumes it.
- `greeting` is untouched. One of this task's tests asserts that.

- [ ] **Step 1: Write the failing tests**

Append to `tests/lib/student-greeting.test.ts`, and add `teacherPageLabel` to the existing import from `@/lib/student-greeting`:

```ts
describe("teacherPageLabel", () => {
  // The FULL name, unlike greeting(), which takes the first word. Jenn's problem
  // is telling two students apart, and two students can share a first name.
  it("uses the whole name", () => {
    expect(teacherPageLabel("Marie Dupont")).toBe("Marie Dupont's page");
  });

  it("works on a one-word name", () => {
    expect(teacherPageLabel("Luc")).toBe("Luc's page");
  });

  // One rule, no special case. Chicago's position, and it is asserted here so
  // nobody adds the apostrophe-only form later and thinks they fixed something.
  it("adds 's to a name ending in s", () => {
    expect(teacherPageLabel("Jonas")).toBe("Jonas's page");
  });

  it("collapses surrounding and inner whitespace", () => {
    expect(teacherPageLabel("  Luc   Tremblay ")).toBe("Luc Tremblay's page");
  });

  it("has nothing to say about an empty name", () => {
    expect(teacherPageLabel("")).toBeNull();
    expect(teacherPageLabel("   ")).toBeNull();
  });

  it("leaves greeting alone", () => {
    expect(greeting("Marie Dupont")).toBe("Bonjour Marie");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/lib/student-greeting.test.ts`
Expected: FAIL — `teacherPageLabel is not a function`.

- [ ] **Step 3: Write the implementation**

Append to `lib/student-greeting.ts`:

```ts
// The header line when the TEACHER is looking at a student's page. English,
// because teacher copy is English here, and the whole name rather than the first
// word — the opposite of greeting(), deliberately. A greeting wants the first
// name because "Bonjour Marie Dupont" is a summons; this line wants the full one
// because her question is WHICH student, and two students can share a first
// name.
//
// The possessive is always 's, including a name that ends in s — "Jonas's page".
// One rule with no special case, which is Chicago's position and is written down
// so the special case does not get added back as a fix.
//
// The caller suppresses this on the everyone group, for the same reason it
// suppresses greeting() there: that row is named "Everyone" and this module has
// no business knowing about the flag.
export function teacherPageLabel(name: string): string | null {
  const full = name.trim().split(/\s+/).join(" ");
  if (!full) return null;
  return `${full}'s page`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/lib/student-greeting.test.ts`
Expected: PASS, including the pre-existing `greeting` cases.

- [ ] **Step 5: Commit**

```bash
git add lib/student-greeting.ts tests/lib/student-greeting.test.ts
git commit -m "$(cat <<'EOF'
feat: add the teacher's page label

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: The student page's teacher affordances

Three edits to one file, all gated on the teacher boolean the page already derives from `getCurrentTeacher()`.

**Files:**
- Modify: `app/g/[slug]/page.tsx`

**Interfaces:**
- Consumes: `teacherPageLabel` (Task 5).
- Produces nothing. No component signature changes, so `LiveBanner`, `StudentTabs`, `FilesTab` and `BoardTab` are all untouched.

**Before you start**, establish the three anchors — this file has been rewritten twice recently and the plan cannot quote it:

```bash
grep -n "greeting\|getCurrentTeacher\|viewerIsTeacher\|isTeacher" app/g/\[slug\]/page.tsx
grep -n "LiveBanner" app/g/\[slug\]/page.tsx
grep -n "<main" app/g/\[slug\]/page.tsx
```

Use whatever name the file already gives the teacher boolean — it was `viewerIsTeacher`; the snippets below assume that and you should substitute if it differs.

- [ ] **Step 1: Branch the header line by audience**

Add `teacherPageLabel` to the existing `@/lib/student-greeting` import, then replace the single `greeting(...)` call site with:

```tsx
  // Her line, not theirs. English for Jenn and French for the student, following
  // the split this codebase keeps everywhere else — and still nothing at all on
  // the everyone group, which is named "Everyone" and is nobody's page.
  const headerLine = group.isEveryone
    ? null
    : viewerIsTeacher
      ? teacherPageLabel(group.name)
      : greeting(group.name);
```

Then render `headerLine` wherever the greeting was rendered. If the existing variable is already called something else, rename the assignment rather than introducing a second variable — two names for one line is how they drift apart.

- [ ] **Step 2: Suppress `LiveBanner` for the teacher**

```tsx
      {unlocked && !viewerIsTeacher && tab !== "board" && <LiveBanner slug={slug} />}
```

And extend the comment that already sits above that line with the reason:

```tsx
      {/* Also !viewerIsTeacher: she is the only person who can be drawing —
          exactly one teacher, exactly one passkey — so a banner announcing
          "Jenn dessine en ce moment" on her own other tab is telling her about
          herself, with a button offering to take her to the board she is already
          on. The clause lives here rather than inside LiveBanner because this
          page already owns the composition and the banner has no business
          learning who the teacher is. BoardTab's live view is already
          !isTeacher; only the banner was missed. */}
```

- [ ] **Step 3: Add the back-to-admin link**

Add `relative` to the `<main>` className — it is currently `min-h-screen px-4 py-12` — and insert this as its first child, above the `<header>`:

```tsx
      {/* Absolutely positioned inside main's existing py-12, so the centred
          header does not shift by a pixel at any width. ?tab=groups and not the
          default: the Students tab is where she came from, and returning her
          somewhere else is a small lie the button would tell every time. */}
      {viewerIsTeacher && (
        <Link
          href="/admin?tab=groups"
          className="absolute left-4 top-4 z-10 rounded-full border border-[var(--card-line)] bg-[var(--card-paper)] px-4 py-1.5 font-[family-name:var(--card-font-serif)] text-sm text-[var(--card-moss)] transition-opacity hover:opacity-80"
        >
          ← Back to admin
        </Link>
      )}
```

`Link` is already imported in this file. **This link needs no guard wiring** — Task 4's capture-phase listener sees it because it is an anchor, which is the property that decision was made for.

- [ ] **Step 4: Verify**

```bash
npm run typecheck && npm run lint && npm test
```

- [ ] **Step 5: Manual check**

```bash
npm run dev
```

1. Signed out, open `/g/<a student>`: **Bonjour Marie**, no back link.
2. Signed in, open the same student from `/admin?tab=groups`: **Marie Dupont's page**, and a *← Back to admin* chip at the top left that returns to the Students tab.
3. `/g/all`: no header line either way — it is nobody's page.
4. Signed in with the token, start a board, then open the same student in a second tab and switch that tab to *Les fichiers*: **no** *Jenn dessine en ce moment*. Open the student's own link in a private window with `?k=` and the banner **is** there — that is the audience it was written for.
5. With a stroke on the board, click *← Back to admin*: Task 4's dialog appears.

- [ ] **Step 6: Commit**

```bash
git add app/g/\[slug\]/page.tsx
git commit -m "$(cat <<'EOF'
feat: name the student's page for the teacher and get her back to admin

Also stops the live-board banner announcing Jenn to herself.

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: `lib/page-thumb.ts`

**Files:**
- Create: `lib/page-thumb.ts`
- Test: `tests/lib/page-thumb.test.ts`

**Interfaces:**
- Produces: `MAX_THUMB_BYTES`, `ThumbCheck`, `validatePageThumb(bytes: Uint8Array): ThumbCheck`. Task 10 consumes them.

**Read `lib/page-pdf.ts` first.** This module is its mirror and should return the same *shape* — if `validatePagePdf` returns `{ ok: false; error: string }` rather than a reason code, use that shape here instead of the one below and adjust the test. One convention per neighbourhood matters more than which convention.

- [ ] **Step 1: Write the failing test**

Create `tests/lib/page-thumb.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { MAX_THUMB_BYTES, validatePageThumb } from "@/lib/page-thumb";

function jpeg(size = 64): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes.set([0xff, 0xd8, 0xff]);
  return bytes;
}

describe("validatePageThumb", () => {
  it("accepts something that starts like a JPEG", () => {
    expect(validatePageThumb(jpeg())).toEqual({ ok: true });
  });

  it("rejects a PNG", () => {
    expect(
      validatePageThumb(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d])),
    ).toEqual({ ok: false, reason: "not-jpeg" });
  });

  // The obvious slip this guard exists for: the PDF ending up in the thumbnail
  // field.
  it("rejects PDF bytes", () => {
    expect(
      validatePageThumb(new TextEncoder().encode("%PDF-1.7\n")),
    ).toEqual({ ok: false, reason: "not-jpeg" });
  });

  it("rejects nothing at all", () => {
    expect(validatePageThumb(new Uint8Array(0))).toEqual({
      ok: false,
      reason: "empty",
    });
  });

  it("rejects something too short to have a magic number", () => {
    expect(validatePageThumb(new Uint8Array([0xff, 0xd8]))).toEqual({
      ok: false,
      reason: "not-jpeg",
    });
  });

  it("rejects one byte over the cap", () => {
    expect(validatePageThumb(jpeg(MAX_THUMB_BYTES + 1))).toEqual({
      ok: false,
      reason: "too-large",
    });
  });

  it("accepts exactly the cap", () => {
    expect(validatePageThumb(jpeg(MAX_THUMB_BYTES))).toEqual({ ok: true });
  });

  // Pinned deliberately: raising it is as much an nginx question as raising
  // MAX_PDF_BYTES, and this test is where someone finds that out.
  it("caps at 128 KB", () => {
    expect(MAX_THUMB_BYTES).toBe(128 * 1024);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/lib/page-thumb.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/page-thumb"`.

- [ ] **Step 3: Write the implementation**

Create `lib/page-thumb.ts`:

```ts
// The thumbnail half of a pdf page, beside lib/page-pdf.ts. Same shape, and the
// same limited ambition: a magic-byte check that catches the obvious slip, not
// an attempt to parse an image. There is no image sanitiser here for the reason
// there is no HTML one and no PDF one — the thing that contains a hostile file
// is the decoder it is opened in.
//
// Jenn's browser renders this file, so in the normal case it is ours. It still
// arrives in a FormData field over the network and ends up in an <img src> on a
// student's shelf, which makes it client-supplied data — the same reasoning
// lib/whiteboard-thumbnail.ts sets out for a value only the teacher can send.

// A bound, not a target: a 320px JPEG of a page of text is 15-40 KB.
//
// The number is chosen against the ceiling rather than against the image.
// MAX_PDF_BYTES is 3 MB because that is the largest round number fitting inside
// the 4 MB client_max_body_size nginx was raised to BY HAND (docs/DEPLOYMENT.md
// item 11), with room for the title and the group ids. 3 MB + 128 KB + multipart
// overhead still clears it, which is what keeps this feature free of a server
// change — and raising this constant is as much an nginx question as raising
// that one.
export const MAX_THUMB_BYTES = 128 * 1024;

export type ThumbCheck =
  | { ok: true }
  | { ok: false; reason: "empty" | "too-large" | "not-jpeg" };

// Every JPEG opens with SOI (FF D8) followed by the next marker's leading FF.
const JPEG_MAGIC = [0xff, 0xd8, 0xff];

export function validatePageThumb(bytes: Uint8Array): ThumbCheck {
  if (bytes.length === 0) return { ok: false, reason: "empty" };
  if (bytes.length > MAX_THUMB_BYTES) return { ok: false, reason: "too-large" };
  if (bytes.length < JPEG_MAGIC.length) return { ok: false, reason: "not-jpeg" };

  for (let i = 0; i < JPEG_MAGIC.length; i += 1) {
    if (bytes[i] !== JPEG_MAGIC[i]) return { ok: false, reason: "not-jpeg" };
  }
  return { ok: true };
}
```

Reason codes rather than sentences, following `lib/student-credentials.ts`: the rule lives here and the copy lives where the language is known. Nothing user-facing comes out of this one anyway — see Task 10, where a rejected thumbnail is dropped silently.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/lib/page-thumb.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/page-thumb.ts tests/lib/page-thumb.test.ts
git commit -m "$(cat <<'EOF'
feat: validate a page thumbnail on the way in

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: The migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_pdf_thumbnails/migration.sql` (generated)

- [ ] **Step 1: Add the two columns**

In `model Page`, directly after the existing `pdf` and `pdfSize`:

```prisma
  // A JPEG of page 1, rendered by Jenn's browser at upload time. Bytes rather
  // than a base64 data URL in a String — unlike Whiteboard.thumbnail, which is
  // inlined into an <img src> and has no route to be served from. This one has
  // /p/[slug]/thumb, so base64 would cost a third more room in a database the
  // nightly VACUUM INTO copies whole, for nothing.
  pdfThumb   Bytes?
  // Existence signal and cache version in one column.
  //
  // Existence, because no shelf query may select `pdfThumb` — the same lesson
  // `pdfSize` records one column earlier: a tile grid that loads a blob to
  // decide whether to draw a picture has already paid for the picture it might
  // not draw.
  //
  // Version, because /p/[slug]/thumb answers `immutable` for a year and the tile
  // appends ?v= this. A replacement moves it, which is the only thing making
  // that cache safe on a row that can change.
  pdfThumbAt DateTime?
```

- [ ] **Step 2: Generate and apply**

```bash
npx prisma migrate dev --name add_pdf_thumbnails
```

Expected: a new migration directory containing an `ALTER TABLE "Page" ADD COLUMN` for each. **No backfill and no table rebuild** — both columns are nullable with no default, so Prisma should emit two plain `ADD COLUMN` statements. If it emits a `RedefineTables` block, read it before accepting: a rebuild of `Page` must carry `pdf` and `pdfSize` across, and the 2026-08-01 migration is the cautionary example of a rebuild that needed a hand-written backfill above it.

- [ ] **Step 3: Regenerate the client and check the tree**

```bash
npx prisma generate && npm run typecheck && npm test
```

Expected: pass. Existing pdf rows now read `null` on both columns, which is exactly the state the glyph fallback renders.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "$(cat <<'EOF'
feat: add pdfThumb and pdfThumbAt to Page

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: `lib/pages.ts` — write the thumbnail, select the signal

**Files:**
- Modify: `lib/pages.ts`

**Interfaces:**
- Produces: `SavePageInput`'s pdf member gains `thumb: Uint8Array | null`; `SHELF_SELECT` gains `pdfThumbAt`; `listPagesForAdmin` returns `pdfThumbAt`; new `getPageThumb(slug)`. Tasks 10, 11 and 14 consume these.
- **Breaking:** every caller constructing a pdf `SavePageInput` must now pass `thumb`. `tsc` will name them; Task 10 fixes them.

- [ ] **Step 1: Extend `SavePageInput`**

The pdf member gains one field:

```ts
    | {
        kind: "pdf";
        pdf: Uint8Array;
        // Null when this upload had no renderable preview. Required rather than
        // optional so the compiler names every caller: a caller that quietly
        // omitted it would leave the PREVIOUS document's picture on the new
        // document, which is the one failure mode worse than having none.
        thumb: Uint8Array | null;
      }
```

- [ ] **Step 2: Extend the `columns` branch**

Add both new columns to **all three** branches — the pdf one populated, the html and link ones nulled:

```ts
            kind: "pdf",
            html: null,
            url: null,
            pdf: Buffer.from(input.pdf),
            pdfSize: input.pdf.byteLength,
            // In the flat every-column-every-write set for a reason stronger
            // than the one the comment above gives about readPageKind having
            // two answers. A MISSING preview is a glyph. A STALE preview is a
            // picture of the previous document sitting under the new document's
            // title, which reads as a working feature showing the wrong thing.
            pdfThumb: input.thumb ? Buffer.from(input.thumb) : null,
            pdfThumbAt: input.thumb ? new Date() : null,
```

Extend the comment above `columns` — it currently says "Both columns are written every time" — to say all of them, and keep the existing reasoning.

- [ ] **Step 3: `SHELF_SELECT` gains the signal and NOT the blob**

```ts
const SHELF_SELECT = {
  // ...existing...
  // The signal, not the picture. `pdfThumb` is deliberately absent for the same
  // reason `html` is: selecting a blob to draw a grid of titles ships the thing
  // the grid was avoiding. The tile turns this timestamp into a ?v= on
  // /p/[slug]/thumb and the browser fetches the bytes only for tiles it renders.
  pdfThumbAt: true,
} as const;
```

- [ ] **Step 4: `listPagesForAdmin` passes it through**

Add to the returned object, beside `kind` and `url`:

```ts
    pdfThumbAt: page.pdfThumbAt,
```

`listPagesForGroup` needs no change — it spreads `SHELF_SELECT`'s result.

- [ ] **Step 5: Add `getPageThumb`**

Beside the existing `getPagePdf`:

```ts
// Selects the blob, unlike every shelf query. Its one caller is the route that
// serves it, which needs exactly this row and nothing else on the page.
export function getPageThumb(slug: string) {
  return prisma.page.findUnique({
    where: { slug },
    select: {
      kind: true,
      url: true,
      pdfSize: true,
      pdfThumb: true,
      pdfThumbAt: true,
    },
  });
}
```

`kind`, `url` and `pdfSize` are there because `readPageKind` requires all three — see its comment about `pdfSize` being a required argument precisely so a caller cannot silently omit the pdf signal.

- [ ] **Step 6: Verify**

```bash
npm run typecheck
```

Expected: **FAIL**, naming the callers in `app/page-actions.ts` that build a pdf `SavePageInput` without `thumb`. That is the breaking change doing its job; Task 10 fixes it. Do not add `thumb: null` here to make it pass.

- [ ] **Step 7: Commit**

```bash
git add lib/pages.ts
git commit -m "$(cat <<'EOF'
feat: carry a pdf thumbnail through savePage

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: The actions read the thumbnail

**Files:**
- Modify: `app/page-actions.ts`

**Interfaces:**
- Consumes: `validatePageThumb` (Task 7), the widened `SavePageInput` (Task 9).
- No signature change: both actions already take a `FormData`.

- [ ] **Step 1: Add a shared reader**

Add near the other helpers in the file:

```ts
// The thumbnail field of a pdf submission, or null.
//
// A bad thumbnail is NOT a failed upload. The document is the thing being saved
// and the glyph is a working fallback, so a rejected or absent preview is
// dropped silently rather than turned into an error about a nicety she did not
// ask for. Every other validation failure in these actions is reported; this one
// deliberately is not.
async function readThumb(formData: FormData): Promise<Uint8Array | null> {
  const field = formData.get("thumb");
  if (!(field instanceof File) || field.size === 0) return null;

  const bytes = new Uint8Array(await field.arrayBuffer());
  return validatePageThumb(bytes).ok ? bytes : null;
}
```

Import it: `import { validatePageThumb } from "@/lib/page-thumb";`

- [ ] **Step 2: Use it in `createPdfPage`**

Where the action currently builds its `savePage` call, pass the thumbnail:

```ts
  const thumb = await readThumb(formData);
  await savePage({ slug: null, title, groupIds, kind: "pdf", pdf, thumb });
```

Keep the existing `requireTeacher()`, the existing `validatePagePdf` handling, and the existing `revalidatePath` calls exactly as they are.

- [ ] **Step 3: Use it in `updatePdfPage`**

`updatePdfPage` has two paths and they must stay different:

```ts
  // No new file: this is a title or audience change, and it goes to
  // updatePageMeta, which touches no content column. That is why the bytes
  // survive it — and now the thumbnail does too, for free. Do NOT read the
  // thumbnail field here: a form submitted without a file has no new preview to
  // offer, and writing null would erase a good one.
  if (!pdf) {
    await updatePageMeta({ slug, title, groupIds });
    ...
    return;
  }

  const thumb = await readThumb(formData);
  await savePage({ slug, title, groupIds, kind: "pdf", pdf, thumb });
```

Match the existing control flow in the file rather than the exact shape above; the load-bearing part is that the no-file path never reaches `readThumb` and never reaches `savePage`.

- [ ] **Step 4: Verify**

```bash
npm run typecheck && npm run lint && npm test
```

Expected: pass — Task 9's deliberate failure is now resolved.

- [ ] **Step 5: Commit**

```bash
git add app/page-actions.ts
git commit -m "$(cat <<'EOF'
feat: accept a pdf thumbnail in the page actions

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: `/p/[slug]/thumb`

**Files:**
- Create: `app/p/[slug]/thumb/route.ts`

**Interfaces:**
- Consumes: `getPageThumb` (Task 9), `readPageKind`.
- Produces: `GET /p/[slug]/thumb`, public, `image/jpeg`. Task 14 links to it.

**Read `app/p/[slug]/pdf/route.ts` first** and mirror its structure, its param signature and its 404 style.

- [ ] **Step 1: Write the route**

Create `app/p/[slug]/thumb/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getPageThumb } from "@/lib/pages";
import { readPageKind } from "@/lib/page-kind";

// The third mirror of one contract: /raw serves only an html row, /pdf only a
// pdf row's document, and this one only a pdf row's preview. Each 404s the
// others. One handler branching on kind under three header regimes is the thing
// a later edit gets wrong, which is why there are three files.
//
// Public, exactly like /p/[slug] and /p/[slug]/pdf. It leaks strictly less than
// the document it summarises, and the note that a PDF put here is a PDF on the
// public web is unchanged and still the thing to read before uploading one.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  const page = await getPageThumb(slug);
  if (!page) return new NextResponse("Not found", { status: 404 });
  if (readPageKind(page) !== "pdf") {
    return new NextResponse("Not found", { status: 404 });
  }
  // A pdf row with no preview 404s rather than falling back to anything. The
  // tile only builds this URL when pdfThumbAt is non-null, so reaching here
  // means a hand-typed URL or a row edited underneath a cached page.
  if (!page.pdfThumb || page.pdfThumbAt === null) {
    return new NextResponse("Not found", { status: 404 });
  }

  return new NextResponse(new Uint8Array(page.pdfThumb), {
    headers: {
      "Content-Type": "image/jpeg",
      // Never let a mislabelled blob be re-interpreted as something executable.
      "X-Content-Type-Options": "nosniff",
      // Matches what the raw route grew on 2026-08-02.
      "X-Robots-Tag": "noindex",
      // A YEAR, and safe ONLY because the tile appends ?v=<pdfThumbAt>. On a
      // stable URL this would pin a replaced document's picture in every browser
      // that had ever seen it, with no way to evict it. This route and
      // PdfPreview are two halves of one decision; neither can change alone.
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
  // No Content-Disposition: this is never downloaded, only rendered in a tile.
  // No Content-Security-Policy, matching /p/[slug]/pdf: there is nothing in an
  // image response for a directive to constrain, and the argument against adding
  // one whose effect on a browser's own decoder cannot be verified from here
  // applies unchanged.
}
```

The `new Uint8Array(page.pdfThumb)` wrapper is the `Bytes`-on-the-way-out idiom the PDF spec established; Prisma hands back a `Buffer` and `BodyInit` wants a view.

- [ ] **Step 2: Verify**

```bash
npm run typecheck && npm run lint
```

- [ ] **Step 3: Check the 404 paths by hand**

```bash
npm run dev
```

```bash
curl -si http://localhost:3000/p/does-not-exist/thumb | head -1
curl -si http://localhost:3000/p/<an-html-page-slug>/thumb | head -1
curl -si http://localhost:3000/p/<an-existing-pdf-slug>/thumb | head -1
```

Expected: `404` for the first two, and `404` for the third as well — every PDF predates this feature, and nothing has written a thumbnail yet. Task 13 is what makes this route return `200`.

- [ ] **Step 4: Commit**

```bash
git add app/p/\[slug\]/thumb/route.ts
git commit -m "$(cat <<'EOF'
feat: serve a pdf page's cached first-page preview

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: `pdfjs-dist` and `renderPdfThumbnail`

The one new dependency in this plan, and the one part of it that cannot be settled without running a browser.

**Files:**
- Modify: `package.json`, `package-lock.json`
- Create: `components/admin/pdf-thumbnail.ts`

**Interfaces:**
- Produces: `THUMB_WIDTH`, `renderPdfThumbnail(file: File): Promise<Blob | null>`. Task 13 consumes it.
- No test. It needs a DOM canvas and a web worker, so it is not a `lib/` module — see the comment in Step 2.

- [ ] **Step 1: Install**

```bash
npm install pdfjs-dist
```

Then check whether it ships its own types:

```bash
ls node_modules/pdfjs-dist/types/src/pdf.d.ts 2>/dev/null && echo "bundled types"
node -e "console.log(require('./node_modules/pdfjs-dist/package.json').version)"
```

Recent majors bundle types; do not add `@types/pdfjs-dist` unless the above finds none.

- [ ] **Step 2: Write the renderer**

Create `components/admin/pdf-thumbnail.ts`:

```ts
"use client";

// Impure, and therefore NOT in lib/. In this codebase lib/ means "a rule with a
// test"; this needs a DOM canvas and a web worker and has neither. The whiteboard
// already made exactly this split — lib/whiteboard-thumbnail.ts is the validator
// and renderThumbnail lives at the bottom of BoardEditor.tsx — and this sits in
// its own module only because two forms call it.
//
// The "use client" directive is not strictly required for a plain module, and is
// here to make the boundary explicit: importing this from a server component
// should fail loudly rather than drag a PDF renderer into the server bundle.

// The same width BoardEditor renders a board thumbnail at, and about the rendered
// width of a tile in the 1152px four-column grid — so nothing upscales. The
// natural aspect ratio is kept: the 4:3 crop is CSS, so changing the crop later
// does not mean re-rendering every stored thumbnail.
export const THUMB_WIDTH = 320;

// A big scan can take a while, and past this she is waiting on a preview she did
// not ask for. The glyph is a working answer.
const RENDER_TIMEOUT_MS = 10_000;

// Never throws and never rejects. An encrypted PDF, a corrupt PDF, a zero-page
// PDF, a worker that failed to load and a render that ran long all come back
// null, and null means "draw the glyph".
//
// AN UPLOAD MUST NOT FAIL BECAUSE A PREVIEW DID NOT RENDER. The document is the
// thing being saved; this is decoration on top of it.
export async function renderPdfThumbnail(file: File): Promise<Blob | null> {
  try {
    return await Promise.race([
      render(file),
      new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), RENDER_TIMEOUT_MS),
      ),
    ]);
  } catch {
    return null;
  }
}

async function render(file: File): Promise<Blob | null> {
  // Dynamic, and this is the load-bearing line of the whole feature. A static
  // import would put a PDF renderer into a chunk the router could ship anywhere;
  // like this it is fetched by Jenn, on the admin screen, the first time she
  // stages a PDF, and no student request ever touches it.
  //
  // It is also what makes this change consistent with the 2026-08-03 spec's
  // refusal of pdf.js — that refusal was about a shelf mounting a dozen
  // renderers at once, which is not what happens here.
  const pdfjs = await import("pdfjs-dist");

  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();

  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;

  try {
    if (doc.numPages < 1) return null;
    const page = await doc.getPage(1);

    const unscaled = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({
      scale: THUMB_WIDTH / unscaled.width,
    });

    const canvas = document.createElement("canvas");
    canvas.width = THUMB_WIDTH;
    canvas.height = Math.round(viewport.height);

    const context = canvas.getContext("2d");
    if (!context) return null;

    // White first. A PDF page carries no background of its own and an unpainted
    // canvas is transparent, which a JPEG encodes as black — so skipping this
    // produces a page of white text on black.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvasContext: context, viewport }).promise;

    return await new Promise<Blob | null>((resolve) =>
      // 0.6 rather than lossless: this is a 320px preview stored in SQLite for
      // every PDF, and validatePageThumb caps it at 128 KB.
      canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.6),
    );
  } finally {
    // Frees the worker's copy of the document. Without it a session of uploads
    // accumulates parsed PDFs in the worker for the life of the tab.
    void doc.destroy();
  }
}
```

Three version-dependent details to resolve against the copy you installed, rather than guessing:

1. **`page.render` parameters.** pdf.js 5 expects `{ canvas, canvasContext, viewport }` and warns or throws without `canvas`; pdf.js 4 takes `{ canvasContext, viewport }`. Add `canvas` if the installed types ask for it.
2. **The worker path.** `pdfjs-dist/build/pdf.worker.min.mjs` is correct for 4.x and 5.x. If the file is not there, `ls node_modules/pdfjs-dist/build/` and use what is.
3. **The entry point.** If `await import("pdfjs-dist")` fails to resolve or the build complains about Node built-ins, use `pdfjs-dist/legacy/build/pdf.mjs`.

- [ ] **Step 3: Verify the build survives the new dependency**

```bash
npm run typecheck && npm run lint && npm run build
```

`npm run build` here and not only at Task 18: adding a bundled worker is the kind of thing that typechecks and then fails to build.

Known failure mode: a complaint about the optional `canvas` package, which pdf.js references for its Node path. It is unreachable from a `"use client"` module, and the fix is to tell the bundler so in `next.config.ts` — check the pdf.js release notes for the current incantation rather than copying an old one from a blog. **Do not** install `canvas`; it is the native dependency this whole design refuses.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json components/admin/pdf-thumbnail.ts next.config.ts
git commit -m "$(cat <<'EOF'
feat: render a pdf's first page to a thumbnail in the browser

pdfjs-dist behind a dynamic import in the admin only, so no student
request ever fetches a PDF renderer.

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: Stage the file, render while she chooses, submit once

Two changes to the admin's page form(s): a PDF selection must never submit, and the thumbnail must ride along when she does submit.

**Files:**
- Modify: whichever component stages and submits a PDF — you established this in Task 0 Step 4. It is `components/admin/PageEditor.tsx` and/or `components/admin/NewPageForm.tsx`.

**Interfaces:**
- Consumes: `renderPdfThumbnail` (Task 12).
- Produces: a `thumb` field in the `FormData` posted to `onSubmitPdf`. Task 10 already reads it.

- [ ] **Step 1: Audit the current submit path**

```bash
grep -n "onFile\|requestSubmit\|onChange\|<form\|onSubmit\|onSubmitPdf" components/admin/PageEditor.tsx components/admin/NewPageForm.tsx
grep -rn "onFile=" components/
```

You are looking for anything that calls a server action, closes the sheet, or calls `requestSubmit()` from a file-selection handler. Write down what you find before changing it — the fix is different depending on whether the auto-submit is in the drop zone, in the form, or in the sheet that wraps it.

- [ ] **Step 2: Add the staging state**

Alongside the existing `pdfFile` state:

```tsx
  const [thumb, setThumb] = useState<Blob | null>(null);
  const [preparing, setPreparing] = useState(false);
  // The in-flight render. Held as a ref so submit can AWAIT it rather than race
  // a boolean: if she stages a file and presses Save immediately, the preview is
  // still rendering and reading `thumb` would silently drop it.
  const thumbJob = useRef<Promise<Blob | null> | null>(null);
```

- [ ] **Step 3: Kick the render off when the file is staged**

Inside `handleFile`'s pdf branch, after the existing `setPdfFile(file)`:

```tsx
      setThumb(null);
      setPreparing(true);

      // Started here rather than at submit so it runs WHILE she picks the
      // audience. The work is free: she was going to spend that time choosing a
      // student anyway.
      const job = renderPdfThumbnail(file);
      thumbJob.current = job;
      void job.then((blob) => {
        // A newer file may have been staged while this one was rendering.
        if (thumbJob.current !== job) return;
        setThumb(blob);
        setPreparing(false);
      });
```

Import it: `import { renderPdfThumbnail } from "@/components/admin/pdf-thumbnail";`

- [ ] **Step 4: Send it, in the submit handler's pdf branch**

```tsx
      if (kind === "pdf") {
        // Awaited, not read: see the note on thumbJob. A failed render resolves
        // null and the page saves without a preview, which is the fallback the
        // glyph exists to be.
        const rendered = thumbJob.current ? await thumbJob.current : thumb;

        const formData = new FormData();
        formData.set("title", title);
        for (const id of groupIds) formData.append("groupIds", id);
        // Absent when she is editing a stored PDF's title or audience without
        // choosing a new file. The action reads that as "leave the bytes".
        if (pdfFile) formData.set("pdf", pdfFile);
        // Only ever sent beside a new file, for the same reason: without one
        // there is no new preview to offer, and updatePageMeta must not be
        // handed a thumbnail it would have to decide what to do with.
        if (pdfFile && rendered) formData.set("thumb", rendered, "thumb.jpg");

        await onSubmitPdf(formData);
      }
```

Where the existing code resets state after a successful create, add:

```tsx
      setThumb(null);
      setPreparing(false);
      thumbJob.current = null;
```

- [ ] **Step 5: Show that it is working**

Next to the drop zone, under the staged filename:

```tsx
      {preparing && (
        <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
          Preparing preview…
        </p>
      )}
```

English — this is admin copy. **It must not gate the Save button.** The existing `hasContent` rule stays exactly as it is: a render still in flight is not a reason she cannot save, because submit awaits the job anyway.

- [ ] **Step 6: Make selection stop submitting**

Whatever Step 1 found, the target behaviour is:

1. Choosing or dropping a file **never** submits and **never** closes the sheet.
2. After choosing, the form shows the filename and size, the title prefilled from the filename with the existing don't-clobber rule intact (`titleFromFile`), the audience checkboxes still editable, and a way to replace the file by dropping another.
3. Exactly one submit path: the Save button. No `onChange` on the file input calls a server action; nothing calls `requestSubmit()`.
4. Save stays disabled while a submit is in flight and until `hasContent` is true.

If the drop zone's `onFile` prop is wired to an action, unwire it: the zone's job is to hand a `File` upward, which is what its own comment says — *"Enforcing a size cap here would mean knowing which cap applies, and that is a question about the file's kind, which the caller resolves."* The same argument applies to submitting.

- [ ] **Step 7: Verify**

```bash
npm run typecheck && npm run lint && npm test
```

- [ ] **Step 8: Manual check — the acceptance test for the whole PDF half**

```bash
npm run dev
```

1. `/admin?tab=pages`, open the add-a-page control, drop a real multi-page PDF.
2. **Nothing is uploaded.** The sheet is still open, the filename and size are shown, *Preparing preview…* appears and then goes away.
3. Tick a student **after** choosing the file. The checkbox responds; nothing has been saved.
4. Press Save. The page appears in the list **with a picture of its first page**, cropped to the top.
5. `curl -si http://localhost:3000/p/<the-new-slug>/thumb | head -5` → `200`, `image/jpeg`, and the `immutable` `Cache-Control`.
6. Open the student's shelf and confirm the same tile.
7. Open the page in the admin editor, change only the title, save. **The picture survives** — that is `updatePageMeta` not touching a content column.
8. Open it again and drop a *different* PDF. The picture changes and the tile's `?v=` moves. If the old picture persists, the version is not being rebuilt from `pdfThumbAt` — fix that before moving on, because an `immutable` year is unforgiving.
9. Drop a `.txt` renamed to `.pdf`. Expected: the existing `validatePagePdf` error, and no page created.
10. Drop a password-protected PDF. Expected: it saves, with the glyph. The render failed and the upload did not.

- [ ] **Step 9: Commit**

```bash
git add components/admin/
git commit -m "$(cat <<'EOF'
feat: stage a pdf without uploading it, and render its preview while she chooses

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: `PdfPreview` draws the picture

**Files:**
- Modify: `components/ui/PdfPreview.tsx`
- Modify: `components/student/FilesTab.tsx`
- Modify: `components/admin/PageList.tsx`

**Interfaces:**
- Produces: `PdfPreview` gains `thumbVersion: number | null`.
- **Breaking:** both call sites must pass it. Required rather than optional, for the reason `readPageKind`'s `pdfSize` argument is required: an omitted signal compiles fine and silently renders the wrong thing forever.

- [ ] **Step 1: Add the branch**

`components/ui/PdfPreview.tsx` — keep the existing glyph branch exactly as it is and add the image branch above it:

```tsx
export function PdfPreview({
  slug,
  pdfSize,
  thumbVersion,
  className,
}: {
  slug: string;
  pdfSize: number | null;
  // pdfThumbAt as epoch milliseconds, or null when there is no stored preview.
  // A cache-busting version and an existence signal at once, which is why that
  // column is a timestamp rather than a boolean.
  thumbVersion: number | null;
  className?: string;
}) {
  if (thumbVersion !== null) {
    return (
      <div
        className={cn(
          "relative aspect-[4/3] overflow-hidden bg-white",
          className,
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- a route
            serving a stored blob is not something next/image can optimise, and
            the tile has already decided its own box. */}
        <img
          // ?v= is not decoration. The route answers `immutable` for a year, so
          // this parameter is the ONLY thing that lets a replaced document's
          // picture be replaced. See app/p/[slug]/thumb/route.ts.
          src={`/p/${slug}/thumb?v=${thumbVersion}`}
          // object-cover object-top, not contain: a Letter page is portrait and
          // this box is 4:3, so contain would letterbox it into a stripe between
          // two grey bars. The top of a worksheet is its title and first lines —
          // the part that identifies it, which is the only thing a preview is
          // for — and HtmlPreview fills and clips for the same reason.
          className="h-full w-full object-cover object-top"
          // Decorative, exactly as HtmlPreview argues: the tile's title link is
          // its accessible name, so a screen reader walking a shelf hears eight
          // titles rather than eight documents.
          alt=""
          aria-hidden
          // What makes a dozen tiles cost only the visible ones.
          loading="lazy"
        />
      </div>
    );
  }

  // ...the existing BrandGlyph + formatFileSize branch, unchanged...
}
```

The file-size caption belongs only to the glyph branch. There is no room for both, the picture is the better cue, and the size is still shown in the admin editor's drop zone where it is a fact about an upload rather than decoration.

- [ ] **Step 2: Pass the version from both lists**

In `components/student/FilesTab.tsx` and `components/admin/PageList.tsx`, wherever `<PdfPreview …>` is rendered:

```tsx
                    thumbVersion={
                      page.pdfThumbAt
                        ? new Date(page.pdfThumbAt).getTime()
                        : null
                    }
```

`new Date(...)` around it rather than `.getTime()` directly: `pdfThumbAt` crosses the RSC boundary as a `Date` today, and this survives it arriving as a string if a caller ever serialises it.

- [ ] **Step 3: Verify**

```bash
npm run typecheck && npm run lint && npm test
```

Expected: `typecheck` names any `PdfPreview` call site you missed — including `app/f/[token]/page.tsx` if it renders one of these lists. That file needs no other change: it renders the same components and picks the picture up for free.

- [ ] **Step 4: Commit**

```bash
git add components/ui/PdfPreview.tsx components/student/FilesTab.tsx components/admin/PageList.tsx
git commit -m "$(cat <<'EOF'
feat: show a pdf's first page on its tile

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
)"
```

---

## Task 15: Hoist the tile-action button class

`CLAUDE.md`: *"Repeated flashcard class strings live in `components/card-styles.ts` — extend that rather than duplicating the strings."* Task 16 is about to be the second user of `PageList`'s local `pageActionClass`, so it moves first.

**Files:**
- Modify: `components/card-styles.ts`
- Modify: `components/admin/PageList.tsx`

**Interfaces:**
- Produces: `tileActionClass`. Task 16 consumes it.

- [ ] **Step 1: Add it to `card-styles.ts`**

Append:

```ts
// The round icon button in a tile's action slot — the pencil and download on a
// page, the invite/reset/delete on a student. Here rather than local to one list
// because two lists render it and a second copy is a second thing to keep in
// step.
export const tileActionClass =
  "flex h-8 w-8 items-center justify-center rounded-full text-[var(--card-bleu)] transition-colors hover:bg-[var(--card-bleu-soft)]";
```

Copy the value from `PageList`'s existing `pageActionClass` rather than from here, in case it has drifted since this plan was written.

- [ ] **Step 2: Use it in `PageList`**

Delete the local `const pageActionClass = …` declaration, add `tileActionClass` to the existing `@/components/card-styles` import, and rename its three or four uses. Do not touch the hand-written `PencilIcon` and `DownloadIcon` in that file — they work, and churning them is not what this task is for.

- [ ] **Step 3: Verify**

```bash
npm run typecheck && npm run lint && npm test
grep -rn "pageActionClass" components/
```

Expected: the tree passes and the grep finds nothing.

- [ ] **Step 4: Commit**

```bash
git add components/card-styles.ts components/admin/PageList.tsx
git commit -m "$(cat <<'EOF'
refactor: hoist the tile action button class into card-styles

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
)"
```

---

## Task 16: Three icons on a student tile

**Files:**
- Modify: `components/admin/GroupList.tsx`

**Interfaces:**
- Consumes: `tileActionClass` (Task 15), the existing `onDelete` and reset actions, `canDeleteGroup`.
- Produces nothing new. **No prop or action signature changes** — the same two server actions fire, from icons instead of from text.

**Read `docs/superpowers/specs/2026-08-03-student-login-design.md` § *Admin — Students tab* first.** It sets out why a claimed student is shown no link and why the reset copy has to carry its reassurance.

**Icons come from `lucide-react`**, which is already a dependency and is already used by `components/whiteboard/BoardToolbar.tsx` and `components/admin/FormatPopover.tsx`. `PageList`'s hand-written SVGs are left alone: they exist and re-drawing icons that are already in the bundle is duplication, not consistency.

- [ ] **Step 1: Add the imports and the copy state**

```tsx
import { Check, KeyRound, Link2, Trash2 } from "lucide-react";
import { tileActionClass } from "@/components/card-styles";
```

Beside the existing confirm state:

```tsx
  // Which row just had its invite copied, so its icon can say so for a moment.
  const [copied, setCopied] = useState<string | null>(null);
  // Only set when the clipboard API refused. The manual path has to still exist
  // rather than the button silently doing nothing.
  const [copyFallback, setCopyFallback] = useState<{
    id: string;
    url: string;
  } | null>(null);
```

- [ ] **Step 2: Add the copy handler**

```tsx
  async function handleCopyInvite(group: GroupSummary) {
    if (!group.chatToken) return;

    // Absolute, and built HERE rather than during render. The old printed link
    // was a relative path, which is not something she could paste into a
    // message — and window.location is not readable on the server, so a value
    // computed in render would differ between the two and break hydration.
    //
    // window.location.origin rather than the ORIGIN env var: what she wants to
    // send is a link to the site she is looking at, and where those two disagree
    // the browser is the one that is right.
    const url = `${window.location.origin}/g/${group.slug}?k=${group.chatToken}`;

    setError(null);
    setCopyFallback(null);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(group.id);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // clipboard.writeText needs a secure context — https and localhost both
      // are, so this should not fire. If it does, show the URL selected and let
      // her copy it the way she used to.
      setCopyFallback({ id: group.id, url });
    }
  }
```

- [ ] **Step 3: Replace the tile's `action` slot**

Inside the `visible.map`, before the `<Tile>`:

```tsx
            const claimed = group.claimedAt !== null;
```

Then the slot itself. `claimed` decides which of the first two icons appears; `canDeleteGroup` decides the third, exactly as it does today.

```tsx
                action={
                  canDeleteGroup(group) ? (
                    <div className="flex items-center gap-1">
                      {/* Only while the invite is still live. A claimed
                          student's invite is spent, and offering to copy a dead
                          URL is a support call waiting to happen. */}
                      {!claimed && group.chatToken && (
                        <button
                          type="button"
                          onClick={() => void handleCopyInvite(group)}
                          aria-label={
                            copied === group.id
                              ? `Invite link for ${group.name} copied`
                              : `Copy invite link for ${group.name}`
                          }
                          title={
                            copied === group.id ? "Copied" : "Copy invite link"
                          }
                          className={tileActionClass}
                        >
                          {copied === group.id ? (
                            <Check size={18} aria-hidden />
                          ) : (
                            <Link2 size={18} aria-hidden />
                          )}
                        </button>
                      )}

                      {/* Present in BOTH claim states, with the label switching.
                          Unclaimed it is the only way to revoke an invite that
                          leaked before it was used; claimed it is the sign-in
                          reset. Same action either way — see the student sign-in
                          spec, which absorbed "Make new links" into this one
                          control. */}
                      {group.chatToken && (
                        <button
                          type="button"
                          onClick={() => {
                            setError(null);
                            setConfirmingRegen(group.id);
                          }}
                          aria-label={
                            claimed
                              ? `Reset sign-in for ${group.name}`
                              : `New invite link for ${group.name}`
                          }
                          title={claimed ? "Reset sign-in" : "New invite link"}
                          className={tileActionClass}
                        >
                          <KeyRound size={18} aria-hidden />
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          setError(null);
                          setConfirming(group.id);
                        }}
                        aria-label={`Delete ${group.name}`}
                        title="Delete"
                        className={tileActionClass}
                      >
                        <Trash2 size={18} aria-hidden />
                      </button>
                    </div>
                  ) : (
                    // The everyone row: canDeleteGroup refuses it, it has no
                    // chatToken, and it can never be claimed — so it has nothing
                    // any of the three icons act on.
                    <span className="text-sm text-[var(--color-ink-muted)]">
                      everyone
                    </span>
                  )
                }
```

Substitute the state setters' real names — `setConfirmingRegen` was the pre-sign-in name and the reset control may have renamed it.

- [ ] **Step 4: Delete the printed invite URL**

Find and remove the `<code>` block that renders `/g/{group.slug}?k={group.chatToken}`, together with the text button beneath it that opened the reset confirm. The icons replace both.

**Keep** the claim-state information line — `marie@example.com · signed up 2 août 2026` for a claimed student, and whatever labels the unclaimed state carries. That is a fact she reads; only the hand-copied URL and the text buttons go.

**Keep both inline confirm blocks** exactly as they are, including the reset confirm's copy:

> Reset sign-in for Marie? Their email and password are cleared and their old
> links stop working. Their pages, chat and boards stay.

The spec that wrote that sentence also asks the confirm to hand her the fresh link afterwards. It now does, without a second surface: the reset already calls `router.refresh()`, the tile flips to unclaimed, and the copy icon appears in place.

- [ ] **Step 5: Add the clipboard fallback**

Below the confirm blocks for the same row:

```tsx
              {copyFallback?.id === group.id && (
                <div className="mt-2 px-5">
                  <label className="block text-xs text-[var(--color-ink-muted)]">
                    Copy this link
                    <input
                      readOnly
                      value={copyFallback.url}
                      autoFocus
                      onFocus={(event) => event.currentTarget.select()}
                      className="mt-1 w-full rounded border border-[var(--card-line)] px-2 py-1 font-mono text-xs"
                    />
                  </label>
                </div>
              )}
```

- [ ] **Step 6: Verify**

```bash
npm run typecheck && npm run lint && npm test
```

- [ ] **Step 7: Manual check**

```bash
npm run dev
```

1. `/admin?tab=groups`. An unclaimed student shows **three** icons: link, key, trash. A claimed one shows **two**: key, trash. The everyone row shows the word *everyone* and no icons.
2. No `?k=` URL is printed anywhere in the list.
3. Press the link icon. It becomes a check for about two seconds. Paste into a text editor: an **absolute** `https://…/g/marie?k=…`, not a path.
4. Paste it into a private window. The sign-up form appears — the invite still works, which is the only thing the copy has to get right.
5. Press the key icon on a claimed student, read the confirm, and confirm it. The row flips to unclaimed and the link icon appears; copy it and check that the *new* token is in it, not the old one.
6. Press the trash icon. The delete confirm is unchanged.
7. Hover each icon and confirm a tooltip. Tab to each and confirm a screen reader would hear the student's name, not just "Delete".
8. Click a tile's title. It still opens `/g/<slug>?k=…` — the icons sit in `Tile`'s `action` slot, which is `relative z-10` precisely so it does not eat the stretched link.

- [ ] **Step 8: Commit**

```bash
git add components/admin/GroupList.tsx
git commit -m "$(cat <<'EOF'
feat: copy a student's invite link from a button

Replaces the hand-selected /g/slug?k= URL, and moves reset and delete
into icons beside it.

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
)"
```

---

## Task 17: Documentation

`CLAUDE.md` is how the next person — or the next Claude — inherits the reasoning. Every bullet below is a decision that looks wrong or arbitrary without it.

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/DEPLOYMENT.md`

- [ ] **Step 1: The routes table**

Add a row, in the block with the other `/p/` routes:

```
| `GET /p/[slug]/thumb` | public | a pdf page's cached first-page preview |
```

Update the `/g/[slug]` row's notes: a teacher session now also adds the *Back to admin* link and the header line naming the student, and the live-board banner is suppressed for her.

- [ ] **Step 2: *Files: pages and links* — the thumbnail paragraph**

Add after the existing PDF material:

- `pdfThumb` and `pdfThumbAt`: what they hold and why there are two.
- Why the bytes are **not** base64 here when `Whiteboard.thumbnail` is: that one is inlined into an `<img src>` and has no route to be served from; this one has `/p/[slug]/thumb`, so base64 would cost a third more room for nothing.
- Why `pdfThumbAt` is a timestamp and not a boolean: it is the existence signal *and* the cache version, and `Cache-Control: immutable` for a year is safe **only** because the tile appends `?v=` it. The route and `PdfPreview` are two halves of one decision.
- That `pdfThumb` must never enter `SHELF_SELECT` — the same lesson `pdfSize` already records.
- That pdf.js is loaded **only** in the admin, behind a dynamic `import()`, at upload time — and that this is what makes it consistent with the 2026-08-03 spec's refusal of pdf.js rather than a reversal of it. That refusal was about a shelf mounting a dozen renderers at once.
- That a failed render stores nothing and the glyph is the fallback, so an upload never fails for want of a preview.
- That `savePage` writes both columns on every call, and why a *stale* preview is worse than a missing one.
- That PDFs uploaded before this change have no preview and get one by being re-uploaded. There is deliberately no backfill.

- [ ] **Step 3: *Whiteboards* — the leave guard**

Add:

- The log lives in `BoardEditor`'s component state and `/finish` treats it as authoritative, so **any** navigation destroys it — including a soft one, which is what the tab strip does.
- The guard is a **capture-phase `click` listener on `document`**, not a context the links opt into, precisely so a link added later is protected without anyone remembering to protect it. Over-catching costs a dialog; under-catching costs a lesson.
- `boardHasContent` is shared with `save()` so the dialog can never offer a primary button that fails.
- `pagehide` sends a `sendBeacon` discard, gated on `!event.persisted`, **not** gated on the board being dirty — because `liveBoards.open()` returns false when one is already open and `/open` turns that into a 409, so an abandoned board breaks the *next* board's live view for the life of the process. And `pagehide` rather than `beforeunload` because `beforeunload` fires before she has answered the prompt.
- Browser Back is an **accepted, unclosable gap**, in the same register as the existing note that a sandboxed frame may navigate itself.

- [ ] **Step 4: The Students tab and the greeting**

- The Students tab: three icons — copy invite (unclaimed only), reset sign-in / new invite link (both states, label switching), delete. The invite URL is copied absolute from `window.location.origin` rather than printed.
- `lib/student-greeting.ts` has two exports: `greeting` takes the first name for the student in French, `teacherPageLabel` takes the full name for Jenn in English, and the caller suppresses both on the everyone group.

- [ ] **Step 5: Conventions**

Add `tileActionClass` to the sentence about `components/card-styles.ts`.

- [ ] **Step 6: `docs/DEPLOYMENT.md`**

Item 11 currently ties `client_max_body_size 4m` to `MAX_PDF_BYTES`. Add `MAX_THUMB_BYTES` beside it: a PDF submission now carries up to 3 MB of document **plus** up to 128 KB of preview, and raising either constant is as much an nginx question as raising the other. That sentence is what stops the next person discovering it through a raw 413 that Next never sees.

- [ ] **Step 7: Commit**

```bash
git add CLAUDE.md docs/DEPLOYMENT.md
git commit -m "$(cat <<'EOF'
docs: record the leave guard, pdf previews and the student tile icons

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
)"
```

---

## Task 18: Full verification

- [ ] **Step 1: Run CI's sequence, in CI's order**

```bash
npx prisma generate && npm run lint && npm run typecheck && npm test && npm run build
```

Expected: all five pass. `npm run build` last because it is the one that catches a bundled worker that typechecks and will not build.

- [ ] **Step 2: Confirm nothing leaked into a student's bundle**

```bash
grep -rn "pdfjs" --include="*.ts" --include="*.tsx" components/ app/ lib/ | grep -v node_modules
```

Expected: exactly one hit, the dynamic `import()` inside `components/admin/pdf-thumbnail.ts`. A static `import … from "pdfjs-dist"` anywhere, or any import of that module from outside `components/admin/`, means a PDF renderer is being shipped somewhere it should not be.

- [ ] **Step 3: Confirm no authorisation rule moved**

```bash
git diff --stat main -- lib/chat-access.ts lib/shelf-access.ts lib/student-gate.ts lib/student-tokens.ts middleware.ts lib/session.ts
```

Expected: empty. This change adds no access rule and modifies none; a diff here means something went wrong.

- [ ] **Step 4: Confirm `readPageKind` was not "improved"**

```bash
git diff main -- lib/page-kind.ts
```

Expected: empty. `pdfThumbAt` is deliberately **not** a discriminator: a row with a thumbnail and no document is a broken row, and resolving it as `"pdf"` would render an `<img>` with nothing behind it.

- [ ] **Step 5: The manual pass**

The per-task manual checks are the detailed ones. This is the sweep across them, on one `npm run dev`:

| # | Check | Expected |
|---|---|---|
| 1 | Signed out, `/g/marie` | *Bonjour Marie*, no back link, no icons anywhere |
| 2 | `/g/all` | no header line; files tab public as before |
| 3 | Signed in, open Marie from `/admin?tab=groups` | *Marie Dupont's page* and *← Back to admin* |
| 4 | Draw a stroke, click *Les fichiers* | dialog; tab does not change |
| 5 | *Rester sur le tableau* | board intact, stroke included |
| 6 | *Fermer sans enregistrer* | files tab; board gone |
| 7 | Draw, *← Back to admin*, *Fermer et enregistrer* | admin Students tab; board in Marie's archive |
| 8 | Draw, reload the tab, confirm the browser prompt, reopen, *Nouveau tableau* | **no** *Diffusion en direct indisponible* |
| 9 | *Nouveau tableau*, then click a tab without drawing | no dialog |
| 10 | Teacher on the files tab while a board is live | **no** *Jenn dessine en ce moment* |
| 11 | Student's own `?k=` link, files tab, board live | banner **is** there, and *Ouvrir le tableau* works |
| 12 | Admin, add a PDF, tick a student **after** choosing the file, Save | nothing uploads on select; the page saves with a first-page picture |
| 13 | Student's shelf | same picture, cropped to the top of the page |
| 14 | Edit that page's title only, save | picture survives |
| 15 | Replace its file | picture changes; the tile's `?v=` moves |
| 16 | An old PDF, uploaded before this change | glyph and file size, exactly as before |
| 17 | Unclaimed student: link icon | absolute URL on the clipboard; pasting it into a private window reaches the sign-up form |
| 18 | Claimed student | no link icon, no printed URL |
| 19 | Key icon on a claimed student, confirm | flips to unclaimed; the link icon appears and carries the **new** token |
| 20 | Trash icon | delete confirm unchanged; the everyone row still cannot be deleted |

- [ ] **Step 6: Update the plan file**

Tick every checkbox in this document that you completed, so the file records what was actually done.

- [ ] **Step 7: Final commit**

```bash
git add docs/superpowers/plans/2026-08-04-teacher-ergonomics.md
git commit -m "$(cat <<'EOF'
docs: mark the teacher ergonomics plan complete

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
)"
```

---

## Spec coverage

Every requirement in `docs/superpowers/specs/2026-08-04-teacher-ergonomics-design.md`, and the task that implements it.

| Spec section | Tasks |
|---|---|
| § 1 — the three exits, `shouldGuardNavigation`, `navigationTarget` | 2 |
| § 1 — `boardHasContent` and why it is shared | 1 |
| § 1 — the dialog, its three exits, `aria-modal`, French copy | 3 |
| § 1 — capture-phase listener, `persist()` split, `beforeunload`, `pagehide` beacon, the `leaving` ref | 4 |
| § 1 — browser Back as a documented gap | 17 |
| § 2 — `teacherPageLabel`, full name, `'s`, English | 5 |
| § 2 — the audience branch at the call site | 6 |
| § 3 — `LiveBanner` suppressed for the teacher, in the page | 6 |
| § 4 — the back link, `?tab=groups`, guarded for free | 6 |
| § 5 — `pdfThumb` / `pdfThumbAt` and the migration | 8 |
| § 5 — `renderPdfThumbnail`, dynamic import, 320px, never throws | 12 |
| § 5 — `validatePageThumb`, `MAX_THUMB_BYTES`, the 4 MB arithmetic | 7 |
| § 5 — `savePage`'s flat invariant, `SHELF_SELECT`, `getPageThumb` | 9 |
| § 5 — the actions read the thumbnail; `updatePageMeta` untouched | 10 |
| § 5 — `/p/[slug]/thumb` and its headers | 11 |
| § 5 — `PdfPreview`, `object-cover object-top`, `alt=""`, lazy | 14 |
| § 5 — staging never submits; render during audience choice | 13 |
| § 6 — three icons, absolute copied URL, fallback, labels | 16 |
| § 6 — `tileActionClass` hoisted | 15 |
| Testing table | 1, 2, 5, 7 |
| What cannot be verified without a browser | 4 step 9, 6 step 5, 11 step 3, 13 step 8, 16 step 7, 18 step 5 |
| Documentation | 17 |

## Notes for whoever executes this

- **Tasks 1–6 and 7–14 and 15–16 are three independent slices.** They share no file. If you want to parallelise, that is where the seams are. Within a slice the order matters: 1 → 2 → 3 → 4, 7 → 8 → 9 → 10 → 11 → 12 → 13 → 14, 15 → 16.
- **Task 9 Step 6 fails on purpose.** Do not paper over it with `thumb: null`.
- **Tasks 4, 6, 13 and 16 touch files this plan could not read.** The code blocks are correct in substance; the surrounding lines may differ. Grep first, as each task's preamble says, and if an anchor is missing, say which one rather than guessing where it went.
- **The pdf.js version details in Task 12 Step 2 are the likeliest thing to need adjusting.** Three of them are named; resolve them against the copy you installed rather than against this document.
