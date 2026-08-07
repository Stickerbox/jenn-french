# Admin tidy-up and the whiteboard viewer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hide the Everyone group from the two admin lists that make it look like a student, let both parties open a saved whiteboard in a zooming viewer, put the shelf's chip rows behind a filter icon, and close the page-edit overlay on a clean save.

**Architecture:** Three new pure modules in `lib/` carry the only real rules — which groups to draw, whether a hidden filter is active, and how far the viewer may zoom and pan. Each has a unit test. The components stay thin and are not unit-tested, which is this codebase's standing convention. The whiteboard viewer redraws vector ops onto a canvas rather than magnifying a JPEG, so zooming in makes strokes sharper. There is no schema change and no migration.

**Tech Stack:** Next.js App Router (server + client components), TypeScript, Tailwind v4 via PostCSS, Prisma on SQLite, Vitest. Imports use the `@/` alias.

**Spec:** `docs/superpowers/specs/2026-08-07-admin-tidy-and-board-viewer-design.md`

---

## Before you start

Read these first. They are short and they contain rules this plan relies on:

- `CLAUDE.md` — the prohibitions section, the conventions section, and the note on `lib/strings.ts`.
- `.claude/rules/whiteboards.md` — loads when you touch `components/whiteboard/`.
- `.claude/rules/files-pages-pdfs.md` — loads when you touch the shelves and the admin page lists.

Three rules bite in this plan specifically:

1. **A client component takes `locale: Locale`, never a resolved `Strings` object.** That object holds functions, and React cannot serialize a function across the server/client boundary. The failure is a runtime 500 with lint, types, tests and the build all green. Call `getStrings(locale)` inside the client component.
2. **Keep anchors as anchors.** The whiteboard leave-guard is a capture-phase `click` listener on `document` that inspects real anchors. A `router.push` handler slips past it.
3. **`lib/strings.ts` holds one `Strings` type and two objects both annotated as it.** Add a key to the type and to *both* the French and the English object, or `tsc` fails naming the key. That is the mechanism working, not a problem.

Run the checks in CI order at the end of every task that changes code:

```bash
npx prisma generate && npm run lint && npm run typecheck && npm test
```

`npm run build` fetches Google Fonts, so it needs network access. Run it once at the end (Task 13), not per task.

---

## File Structure

**New files**

| File | Responsibility |
|---|---|
| `lib/audience.ts` | Which groups a list draws, and what the everyone row is called in an audience form |
| `tests/lib/audience.test.ts` | Its tests |
| `lib/shelf-filters.ts` | Whether a hidden filter is doing something |
| `tests/lib/shelf-filters.test.ts` | Its tests |
| `lib/board-zoom.ts` | Zoom bounds and pan clamping for the board viewer |
| `tests/lib/board-zoom.test.ts` | Its tests |
| `components/ui/FilterDisclosure.tsx` | The filter icon and the block it opens |
| `components/whiteboard/board-download.ts` | The stacked-JPEG download, extracted so two callers share it |
| `components/whiteboard/BoardViewer.tsx` | The full-screen zooming viewer |

**Modified files**

| File | Change |
|---|---|
| `lib/strings.ts` | `admin.pageForm.allStudents`, `student.files.filterBy`, `student.files.filterToggle`, `student.board.*` |
| `lib/whiteboard-names.ts` | `boardLabels` takes an optional locale |
| `app/admin/page.tsx` | Students tab filters the everyone row; `AdminChrome` gets `isEveryone` |
| `app/admin/pages/[slug]/page.tsx` | Its group query selects `isEveryone`; passes `audience` |
| `app/page-actions.ts` | `loadPageForEdit` selects `isEveryone` |
| `app/g/[slug]/page.tsx` | Passes `locale` to `BoardTab` and `LiveBanner` |
| `components/admin/AdminChrome.tsx` | Builds the audience options once for both forms |
| `components/admin/PageList.tsx` | Drops the everyone chip |
| `components/admin/NewPageForm.tsx` | Takes `audience` instead of `groups` |
| `components/admin/AddLinkForm.tsx` | Takes `audience` instead of `groups` |
| `components/admin/PageEditor.tsx` | Takes `audience`; gains `onSaved` |
| `components/admin/PageEditOverlay.tsx` | Builds `audience`; passes `onClose` as `onSaved` |
| `components/student/FilesTab.tsx` | Wraps both chip rows in the disclosure |
| `components/whiteboard/BoardTab.tsx` | Takes `locale`; passes it down |
| `components/whiteboard/BoardTile.tsx` | Takes `locale`; opens the viewer; calls the extracted download |
| `components/whiteboard/LiveBanner.tsx` | Takes `locale` |

**Deliberately not touched:** `BoardEditor.tsx`, `BoardToolbar.tsx`, `LeaveBoardDialog.tsx`, `TextStylePopover.tsx`. Those are the drawing surface. They are reachable only by pressing *New board*, they are teacher-only, and editing `BoardEditor` means editing the leave-guard and the text-draft commit logic. Localising them is a separate pass with its own risk. Say so in the commit message rather than leaving it to be discovered.

---

## Task 1: `lib/audience.ts`

**Files:**
- Create: `lib/audience.ts`
- Test: `tests/lib/audience.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/audience.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  visibleStudents,
  audienceOptions,
  visibleGroupChips,
} from "@/lib/audience";

const groups = [
  { id: "g1", name: "Everyone", isEveryone: true },
  { id: "g2", name: "Luc", isEveryone: false },
  { id: "g3", name: "Marie", isEveryone: false },
];

describe("visibleStudents", () => {
  it("removes the everyone row", () => {
    expect(visibleStudents(groups).map((g) => g.id)).toEqual(["g2", "g3"]);
  });

  it("keeps the order of the rows it keeps", () => {
    const reversed = [groups[2], groups[1], groups[0]];
    expect(visibleStudents(reversed).map((g) => g.id)).toEqual(["g3", "g2"]);
  });

  it("returns everything when no row is flagged", () => {
    expect(visibleStudents([groups[1], groups[2]])).toHaveLength(2);
  });

  it("returns an empty list rather than throwing on an empty one", () => {
    expect(visibleStudents([])).toEqual([]);
  });
});

describe("audienceOptions", () => {
  it("relabels the everyone row and leaves the students alone", () => {
    expect(audienceOptions(groups, "All students")).toEqual([
      { id: "g1", label: "All students" },
      { id: "g2", label: "Luc" },
      { id: "g3", label: "Marie" },
    ]);
  });

  it("keeps the everyone row in place rather than moving it to the front", () => {
    const middle = [groups[1], groups[0], groups[2]];
    expect(audienceOptions(middle, "All students").map((o) => o.label)).toEqual([
      "Luc",
      "All students",
      "Marie",
    ]);
  });

  it("keeps every id, because the id is what the form submits", () => {
    expect(audienceOptions(groups, "All students").map((o) => o.id)).toEqual([
      "g1",
      "g2",
      "g3",
    ]);
  });

  it("does not read Group.name for the flagged row", () => {
    const renamed = [{ id: "g1", name: "Tout le monde", isEveryone: true }];
    expect(audienceOptions(renamed, "All students")[0].label).toBe(
      "All students",
    );
  });
});

describe("visibleGroupChips", () => {
  it("removes the everyone name", () => {
    expect(visibleGroupChips(["Everyone", "Luc", "Marie"], "Everyone")).toEqual([
      "Luc",
      "Marie",
    ]);
  });

  it("returns every name when there is no everyone row to name", () => {
    expect(visibleGroupChips(["Luc", "Marie"], null)).toEqual(["Luc", "Marie"]);
  });

  it("matches exactly, so a near-miss is kept", () => {
    expect(visibleGroupChips(["everyone", "Luc"], "Everyone")).toEqual([
      "everyone",
      "Luc",
    ]);
  });

  it("removes every copy of the name", () => {
    // pageGroupNames dedupes, so this cannot happen today. The function must
    // not depend on that: a filter is cheaper to make total than to make
    // conditional on a caller's behaviour.
    expect(visibleGroupChips(["Everyone", "Luc", "Everyone"], "Everyone")).toEqual(
      ["Luc"],
    );
  });
});
```

- [ ] **Step 2: Run the test and check that it fails**

```bash
npx vitest run tests/lib/audience.test.ts
```

Expected: FAIL. The message names the missing module, `Failed to load url @/lib/audience`.

- [ ] **Step 3: Write the module**

Create `lib/audience.ts`:

```ts
// Who the admin DRAWS, which is not the same question as who exists. Exactly
// one group row carries `isEveryone`, and it is not a student: it has no chat,
// no whiteboard, no password and no email, and `studentGate` refuses it in its
// first clause. Listing it beside Marie and Luc invited Jenn to treat it as
// one.
//
// This module withholds controls. It grants nothing and it authorises nothing —
// every guard that reads `isEveryone` (chatRole, shelfRole, studentGate,
// worksheetOpenable) is untouched and keeps its present answers.

// The Students tab. A generic so a caller can pass its own row shape and get
// the same shape back, rather than the three fields this file cares about.
export function visibleStudents<T extends { isEveryone: boolean }>(
  groups: T[],
): T[] {
  return groups.filter((group) => !group.isEveryone);
}

export type AudienceOption = { id: string; label: string };

// The three audience forms — NewPageForm, AddLinkForm, PageEditor.
//
// The everyone row STAYS here, under a different name. Its job in this form is
// to name an audience, and it is a real one: a page assigned to it appears on
// every student's shelf through effectivePages. Removing it would end the
// ability to share one page with everyone, which is a feature and not a
// leftover.
//
// The label comes from the dictionary rather than from Group.name, so renaming
// the row in the database cannot change what the form says — and so the word is
// translated like every other word on the screen.
//
// It keeps its position rather than moving to the front. The list arrives
// sorted by name, and a second ordering rule here would be one more thing to
// keep in step with that one.
export function audienceOptions(
  groups: { id: string; name: string; isEveryone: boolean }[],
  allStudentsLabel: string,
): AudienceOption[] {
  return groups.map((group) => ({
    id: group.id,
    label: group.isEveryone ? allStudentsLabel : group.name,
  }));
}

// The Pages tab's student chips.
//
// Names, not rows, because that is the shape this list already has:
// `pageGroupNames` reads the names off the pages themselves and
// `filterPagesByGroup` matches on the name. Converting to rows here would mean
// converting back at the call site.
//
// The consequence of matching on a name is that an ordinary student named
// "Everyone" would lose their chip. That collision already exists inside
// filterPagesByGroup, which compares the same two strings, so this adds no new
// failure — it inherits one. Group.name is not unique; if that ever needs
// fixing, fix it in both places at once.
export function visibleGroupChips(
  names: string[],
  everyoneName: string | null,
): string[] {
  if (everyoneName === null) return names;
  return names.filter((name) => name !== everyoneName);
}
```

- [ ] **Step 4: Run the test and check that it passes**

```bash
npx vitest run tests/lib/audience.test.ts
```

Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/audience.ts tests/lib/audience.test.ts
git commit -m "$(cat <<'EOF'
Add the rule for which groups the admin draws

The everyone row is not a student and answers to none of a student's
rules, but two admin lists draw it as one. This is the predicate that
stops them, plus the one that renames it in the audience forms — where
it stays, because sharing one page with every student is a feature and
that row is the mechanism behind it.

Nothing here authorises anything. Every guard that reads isEveryone is
untouched.

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: The `All students` string

**Files:**
- Modify: `lib/strings.ts` (the `Strings` type, the French object, the English object)

`lib/strings.ts` holds one type and two objects **both annotated as that type**. All three edits are required. Leaving one out is a compile error naming the key, which is the mechanism working.

`admin.pageForm` is the right home: it is already the shared namespace for the audience block, and all three forms read `studentsLegend` and `noStudentsYet` from it.

- [ ] **Step 1: Add the key to the type**

Find `pageForm: {` inside the `Strings` type (near line 338 — it is the one whose values are `string` rather than string literals) and replace the block:

```ts
    pageForm: {
      studentsLegend: string;
      noStudentsYet: string;
    };
```

with:

```ts
    pageForm: {
      studentsLegend: string;
      noStudentsYet: string;
      // The everyone group's pill in an audience form. From the dictionary and
      // NOT from Group.name, for two reasons: renaming that row in the
      // database must not change what this form says, and the word has to be
      // translated like every other word on the screen. See lib/audience.ts.
      allStudents: string;
    };
```

- [ ] **Step 2: Add the French value**

Find the French `pageForm` block (near line 801) and replace:

```ts
    pageForm: {
      studentsLegend: "Élèves",
      noStudentsYet: "Pas encore d'élèves.",
    },
```

with:

```ts
    pageForm: {
      studentsLegend: "Élèves",
      noStudentsYet: "Pas encore d'élèves.",
      allStudents: "Tous les élèves",
    },
```

- [ ] **Step 3: Add the English value**

Find the English `pageForm` block (near line 1236) and replace:

```ts
    pageForm: {
      studentsLegend: "Students",
      noStudentsYet: "No students yet.",
    },
```

with:

```ts
    pageForm: {
      studentsLegend: "Students",
      noStudentsYet: "No students yet.",
      allStudents: "All students",
    },
```

- [ ] **Step 4: Check that it compiles**

```bash
npm run typecheck
```

Expected: no output, exit 0. If it names `allStudents`, one of the three edits is missing.

- [ ] **Step 5: Commit**

```bash
git add lib/strings.ts
git commit -m "$(cat <<'EOF'
Name the everyone group's audience pill in both languages

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: The three audience forms take options, not groups

All three forms hold the same audience block, character for character. They stop mapping over group rows and start mapping over `AudienceOption`s, so the decision about what the everyone row is called is made once, in `lib/audience.ts`, rather than three times in JSX.

**Files:**
- Modify: `components/admin/NewPageForm.tsx`
- Modify: `components/admin/AddLinkForm.tsx`
- Modify: `components/admin/PageEditor.tsx`

- [ ] **Step 1: Change `NewPageForm`'s prop**

In `components/admin/NewPageForm.tsx`, add the import beside the others:

```ts
import type { AudienceOption } from "@/lib/audience";
```

In the function signature, replace the destructured `groups,` with `audience,` and replace the prop type line:

```ts
  groups: { id: string; name: string }[];
```

with:

```ts
  // Already relabelled by audienceOptions, so this form never learns that one
  // of these rows is the everyone group. See lib/audience.ts.
  audience: AudienceOption[];
```

- [ ] **Step 2: Change `NewPageForm`'s audience block**

Replace:

```tsx
        {groups.length === 0 ? (
          <p className="text-sm font-normal text-[var(--color-ink-muted)]">
            {strings.admin.pageForm.noStudentsYet}
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {groups.map((group) => {
              const checked = groupIds.includes(group.id);
              return (
                <label
                  key={group.id}
                  className={cn(
                    audiencePill,
                    checked ? audiencePillChecked : audiencePillUnchecked,
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
```

with:

```tsx
        {audience.length === 0 ? (
          <p className="text-sm font-normal text-[var(--color-ink-muted)]">
            {strings.admin.pageForm.noStudentsYet}
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {audience.map((option) => {
              const checked = groupIds.includes(option.id);
              return (
                <label
                  key={option.id}
                  className={cn(
                    audiencePill,
                    checked ? audiencePillChecked : audiencePillUnchecked,
                  )}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={checked}
                    onChange={() => toggleGroup(option.id)}
                  />
                  {option.label}
                </label>
              );
            })}
          </div>
        )}
```

- [ ] **Step 3: Do the same to `AddLinkForm`**

`components/admin/AddLinkForm.tsx` holds the identical block. Add the same import, rename the prop the same way, and apply the same replacement. Its version has no comment above the `<label>`; the surrounding code is otherwise the same.

- [ ] **Step 4: Do the same to `PageEditor`**

`components/admin/PageEditor.tsx` holds the identical block near line 186, with one extra comment above the `<label>` that must be kept:

```tsx
                // A real checkbox, visually hidden inside its own label: the
                // pill is appearance only, so keyboard and screen readers get
                // the control they already understood.
```

Add the same import, rename the prop the same way, and apply the same replacement while keeping that comment where it is.

- [ ] **Step 5: Build the options in `AdminChrome`**

In `components/admin/AdminChrome.tsx`, add the import:

```ts
import { audienceOptions } from "@/lib/audience";
```

Replace the prop type line:

```ts
  groups: { id: string; name: string }[];
```

with:

```ts
  // isEveryone rides along so the audience pill can be relabelled. It is not
  // used for anything else here — defaultGroupId below still matches on name,
  // against the real Group.name, and the chip it matches can never be the
  // everyone group now that PageList does not draw one.
  groups: { id: string; name: string; isEveryone: boolean }[];
```

Below `const activeGroupId = defaultGroupId(chip, groups);` add:

```ts
  // Built once for both sheets rather than inside each: they must not disagree
  // about what the everyone row is called.
  const audience = audienceOptions(groups, strings.admin.pageForm.allStudents);
```

Then change `<AddLinkForm groups={groups}` to `<AddLinkForm audience={audience}` and `<NewPageForm groups={groups}` to `<NewPageForm audience={audience}`.

- [ ] **Step 6: Pass the flag from the admin page**

In `app/admin/page.tsx`, replace:

```tsx
        <AdminChrome
          groups={groups.map((g) => ({ id: g.id, name: g.name }))}
```

with:

```tsx
        <AdminChrome
          groups={groups.map((g) => ({
            id: g.id,
            name: g.name,
            isEveryone: g.isEveryone,
          }))}
```

The `groups` query above already selects `isEveryone`, so no query changes.

- [ ] **Step 7: Build the options in `PageEditOverlay`**

In `components/admin/PageEditOverlay.tsx`, add the import:

```ts
import { audienceOptions } from "@/lib/audience";
```

Replace `groups={loaded.groups}` with:

```tsx
          audience={audienceOptions(
            loaded.groups,
            strings.admin.pageForm.allStudents,
          )}
```

- [ ] **Step 8: Select the flag in `loadPageForEdit`**

In `app/page-actions.ts`, in `loadPageForEdit`, replace the return type's groups line:

```ts
  groups: { id: string; name: string }[];
```

with:

```ts
  groups: { id: string; name: string; isEveryone: boolean }[];
```

and replace the query:

```ts
  const groups = await prisma.group.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
```

with:

```ts
  const groups = await prisma.group.findMany({
    orderBy: { name: "asc" },
    // isEveryone so the editor's audience pill can be relabelled — see
    // lib/audience.ts. It is not an authority signal and nothing here branches
    // on it.
    select: { id: true, name: true, isEveryone: true },
  });
```

- [ ] **Step 9: Do the same for the standalone editor route**

In `app/admin/pages/[slug]/page.tsx`, replace the query:

```ts
  const groups = await prisma.group.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
```

with:

```ts
  const groups = await prisma.group.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, isEveryone: true },
  });
```

Add the import:

```ts
import { audienceOptions } from "@/lib/audience";
```

and replace `groups={groups}` with:

```tsx
          audience={audienceOptions(
            groups,
            strings.admin.pageForm.allStudents,
          )}
```

- [ ] **Step 10: Check that it compiles and the suite still passes**

```bash
npx prisma generate && npm run lint && npm run typecheck && npm test
```

Expected: lint reports only the one pre-existing warning in `lib/snapshot-dom.ts:77`. Typecheck is silent. All tests pass.

- [ ] **Step 11: Commit**

```bash
git add components/admin/NewPageForm.tsx components/admin/AddLinkForm.tsx components/admin/PageEditor.tsx components/admin/AdminChrome.tsx components/admin/PageEditOverlay.tsx app/admin/page.tsx "app/admin/pages/[slug]/page.tsx" app/page-actions.ts
git commit -m "$(cat <<'EOF'
Call the everyone group "All students" in the audience forms

The three forms held the same audience block three times and each read
Group.name straight out of the row, so the pill said "Everyone" and read
as a fourth student. They map over AudienceOption now, which means the
decision about what that row is called is made once, in lib/audience.ts,
and is translated.

The row itself is untouched, and so is every guard that reads its flag.

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Hide the everyone row from the two lists

**Files:**
- Modify: `app/admin/page.tsx` (the `GroupsTab` function)
- Modify: `components/admin/PageList.tsx`

- [ ] **Step 1: Filter the Students tab**

In `app/admin/page.tsx`, add the import:

```ts
import { visibleStudents } from "@/lib/audience";
```

In `GroupsTab`, replace:

```tsx
      <GroupList
        groups={groups.map((g) => ({
```

with:

```tsx
      <GroupList
        groups={visibleStudents(groups).map((g) => ({
```

Then replace the comment above the query, which is now wrong. Replace:

```ts
  // The group query stays as it is — including its email/claimedAt selection —
  // because this list includes the everyone row, which has no conversation and
  // so is absent from listConversations.
```

with:

```ts
  // The query still fetches every row and the everyone one is dropped on the
  // way into the list, rather than filtered in the `where`. Two reasons: the
  // unread map below is built from listConversations, which already excludes
  // it, so a narrower query would buy nothing; and a UI rule belongs in a
  // predicate with a test on it, not in a Prisma clause. See lib/audience.ts.
```

- [ ] **Step 2: Drop the everyone chip from the Pages tab**

In `components/admin/PageList.tsx`, add the import:

```ts
import { visibleGroupChips } from "@/lib/audience";
```

Replace:

```ts
  const groupNames = pageGroupNames(pages);
```

with:

```ts
  // The everyone chip is dropped, and the everyone NAME is still passed to
  // filterPagesByGroup below. That is not an inconsistency: the name's job
  // there is to widen a student's chip to include pages shared with everyone,
  // which is how Jenn finds a shared page now that it has no chip of its own.
  const groupNames = visibleGroupChips(pageGroupNames(pages), everyoneName);
```

- [ ] **Step 3: Check that it compiles and the suite still passes**

```bash
npx prisma generate && npm run lint && npm run typecheck && npm test
```

Expected: clean, apart from the pre-existing `snapshot-dom.ts:77` warning.

- [ ] **Step 4: Check the behaviour by hand**

Start the dev server with `npm run dev`, sign in at `/login`, and confirm:

- `/admin?tab=groups` lists the real students and no "Everyone" row.
- `/admin?tab=pages` shows chips for the real students and no "Everyone" chip. The leftmost chip is still "Tout" / "All", which is the no-filter chip and is not the everyone group.
- Selecting a student's chip still shows pages shared with everyone as well as that student's own.
- The `+` FAB's *Add a page* sheet shows a pill reading *Tous les élèves* / *All students*.

- [ ] **Step 5: Commit**

```bash
git add app/admin/page.tsx components/admin/PageList.tsx
git commit -m "$(cat <<'EOF'
Stop drawing the everyone group as a student

It has no chat, no whiteboard, no password and no email, and studentGate
refuses it in its first clause — but the Students tab listed it beside
Marie and Luc, and the Pages tab drew it as a filter chip beside them.

The accepted cost is that the admin now has no link to /g/all. Shared
pages stay findable: filterPagesByGroup already widens a student's chip
to include them, which is what that rule is for.

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
)"
```

---

## Task 4b: Drop pins on the shared shelf

**Added after Task 4's quality review, by the owner's decision.** Not in the original spec.

### Why this exists

Task 4 removed the everyone chip from the Pages tab. That chip was the only way to select the shared shelf, and selecting it was the only way to pin a page onto `/g/all`. So Task 4 silently removed a real, working capability.

It was real because of a clause order that is deliberate and documented. `shelfRole` (`lib/shelf-access.ts`) returns `"teacher"` **before** it tests `isEveryone`, and its own comment says why: *"the shared shelf is hers to fill and to pin"*. That ordering is a sibling-of-`chatRole` decision and must not be changed — `addShelfLink`, `addShelfPage` and `addShelfPdf` all depend on it.

The owner chose to retire the capability rather than restore it: **a pin becomes a per-student thing only.** That is a simpler mental model than "pins exist on the shared shelf too, but nothing in the admin can make one."

### The cost, stated plainly

This deletes rows. `/g/all` is public and students may have it bookmarked, so any page currently pinned there will drop back into date order for them. There is no undo and no version history for a pin. The owner authorised this knowingly. It cannot be inspected against production from here.

### Files

- Modify: `lib/page-pins.ts`
- Modify: `tests/lib/page-pins.test.ts`
- Modify: `app/page-actions.ts` (`setShelfPin`)
- Create: `prisma/migrations/20260807160000_drop_everyone_pins/migration.sql`
- Modify: `.claude/rules/files-pages-pdfs.md`
- Modify: `components/admin/PagesTabClient.tsx` (a stale comment, unrelated to pins but the same dead-branch class Task 4 already corrected in `GroupList`)

- [ ] **Step 1: Write the failing test**

Add to `tests/lib/page-pins.test.ts`. Extend the import to include `canPinToShelf`, then add:

```ts
describe("canPinToShelf", () => {
  it("allows a student's own shelf", () => {
    expect(canPinToShelf({ isEveryone: false })).toBe(true);
  });

  it("refuses the shared shelf", () => {
    // A pin orders ONE shelf, and the shared shelf is nobody's. Retired
    // 2026-08-07 with the everyone chip that was the only way to reach it.
    expect(canPinToShelf({ isEveryone: true })).toBe(false);
  });

  it("reads only the flag, so a group named 'all' is still pinnable", () => {
    // Bound to a variable, not passed as a literal: TypeScript's
    // excess-property check fires only on fresh literals at a call site, and
    // the point is that the extra field is ignored rather than rejected. The
    // same shape tests/lib/everyone.test.ts uses for canDeleteGroup.
    const namedAll = { isEveryone: false, slug: "all" };
    expect(canPinToShelf(namedAll)).toBe(true);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

```bash
npx vitest run tests/lib/page-pins.test.ts
```

Expected: FAIL, `canPinToShelf is not a function`.

- [ ] **Step 3: Add the predicate**

In `lib/page-pins.ts`, add above `applyPins`:

```ts
// Which shelves may carry a pin at all.
//
// A pin orders ONE shelf — `PagePin` is keyed (page, group) and pins
// deliberately do not inherit, so a pin on the shared shelf showed at `/g/all`
// and nowhere else. Reaching it meant selecting the everyone chip in the admin
// Pages tab, and that chip was removed on 2026-08-07 because it drew the
// shared group as if it were a student.
//
// Rather than leave a capability the UI could no longer reach, pinning there is
// retired: a pin is a per-student ordering. The rows that existed were deleted
// by prisma/migrations/20260807160000_drop_everyone_pins.
//
// A separate predicate rather than a clause inside shelfRole, and that
// distinction is load-bearing. shelfRole answers "may this caller WRITE to this
// shelf", and it answers "teacher" before it looks at isEveryone ON PURPOSE —
// its own comment says the shared shelf is hers to fill. Jenn must keep being
// able to put pages and links there. Only the ORDERING is withdrawn.
export function canPinToShelf(group: { isEveryone: boolean }): boolean {
  return !group.isEveryone;
}
```

- [ ] **Step 4: Run it and see it pass**

```bash
npx vitest run tests/lib/page-pins.test.ts
```

Expected: PASS.

- [ ] **Step 5: Enforce it on the server**

In `app/page-actions.ts`, in `setShelfPin`, immediately after `await requireShelfRole(groupId);` insert:

```ts
  // Checked here rather than only in the UI: hiding a control is not a guard,
  // and this action is still reachable from a stale tab. A THROW rather than a
  // silent return, matching deleteGroup's refusal of the same row: silence in
  // this file means the resource is already gone (see the `if (!page) return`
  // below, and deleteMany), and a pin refused on a shelf that exists is a
  // policy answer, not an absence.
  const shelf = await prisma.group.findUnique({
    where: { id: groupId },
    select: { isEveryone: true },
  });
  if (shelf && !canPinToShelf(shelf)) {
    const strings = await currentStrings();
    throw new Error(strings.admin.actions.everyoneCannotBePinned);
  }
```

The condition is `shelf && !canPinToShelf(shelf)`, mirroring `deleteGroup`'s `group && !canDeleteGroup(group)`: a missing group is left to the code below rather than turned into a pin-specific error.

Add `everyoneCannotBePinned` to `lib/strings.ts` in all three places, directly below the existing `everyoneCannotBeDeleted` in each — type, French `"On ne peut rien épingler pour tout le monde."`, English `"Nothing can be pinned for everyone."`.

**An earlier draft of this plan said to return silently here, by analogy to the `deleteMany` convention. That analogy was wrong** and a code review caught it. Silence in `app/page-actions.ts` means the resource is already gone. `deleteGroup` (`app/actions.ts`) is the precedent for a policy refusal of this very row, and it throws — its comment says "hiding a button is not a guard."

Add the import beside the other `@/lib` imports:

```ts
import { canPinToShelf } from "@/lib/page-pins";
```

- [ ] **Step 6: Write the migration by hand**

**Do NOT run `npx prisma migrate dev`.** This migration changes no schema, so Prisma would generate nothing from it — a data-only migration has to be hand-authored. Running `migrate dev` against the local `prisma/dev.db`, which has no tables, could also try to reset it.

Create `prisma/migrations/20260807160000_drop_everyone_pins/migration.sql`:

```sql
-- Retire pins on the shared shelf.
--
-- A pin orders one shelf and does not inherit, so these rows only ever affected
-- /g/all. The admin control that created them was the everyone chip on the
-- Pages tab, removed the same day because it drew the shared group as a
-- student. Rather than leave rows no UI can create, edit or remove, pinning
-- there is retired outright and lib/page-pins.ts refuses it from now on.
--
-- DESTRUCTIVE AND NOT REVERSIBLE. /g/all is public, so any page pinned there
-- drops back into date order for anyone who has it bookmarked. There is no
-- version history behind a pin; the row is simply gone.
--
-- Keyed on the flag rather than on the slug 'all', because every rule in this
-- codebase keys off isEveryone and a slug comparison is the thing lib/everyone.ts
-- exists to avoid. `= 1` because SQLite stores a Prisma Boolean as an integer.
DELETE FROM "PagePin"
WHERE "groupId" IN (SELECT "id" FROM "Group" WHERE "isEveryone" = 1);
```

- [ ] **Step 7: Rewrite the pins rule**

In `.claude/rules/files-pages-pdfs.md`, replace this paragraph:

```markdown
**Pins do not inherit.** A pin on the everyone shelf shows at `/g/all` and
nowhere else, unlike the page itself. The cost is that pinning one reference for
the whole class is one pin per student; the alternative was a second merge rule
to keep in step with `effectivePages`, and two merge rules drift.
```

with:

```markdown
**Pins do not inherit, and the shared shelf takes none at all.** A pin is a
per-(page, student) ordering. Pinning one reference for the whole class is
therefore one pin per student; the alternative was a second merge rule to keep
in step with `effectivePages`, and two merge rules drift.

The shared shelf used to be pinnable — a pin there showed at `/g/all` and
nowhere else — and that was reachable only through the everyone chip on the
admin Pages tab. That chip was removed on 2026-08-07 (see above), which left a
capability no UI could reach, so `canPinToShelf` (`lib/page-pins.ts`) now
refuses it and `20260807160000_drop_everyone_pins` deleted the rows. The visible
cost was accepted: a page pinned at `/g/all` dropped back into date order for
anyone with that page bookmarked.

**`canPinToShelf` is not a clause inside `shelfRole`, and must not become one.**
`shelfRole` answers *may this caller write to this shelf*, and it answers
`"teacher"` **before** it tests `isEveryone` on purpose — its own comment says
the shared shelf is Jenn's to fill. She must keep being able to put pages and
links there. Only the ordering was withdrawn.
```

- [ ] **Step 8: Correct the stale comment in `PagesTabClient`**

`components/admin/PagesTabClient.tsx` computes `activeGroupSlug` and its comment describes the everyone chip being selectable. It no longer is. This is the same dead-branch class Task 4 corrected in `GroupList`, and leaving one corrected and the other stale is worse than correcting neither.

Replace:

```ts
  // The same rule pageTarget's caller applies on /g/[slug]: the everyone
  // group's shelf is public and has no student for a version to belong to, so
  // a worksheet tile filtered under its chip must fall back to the public
  // page rather than link a tile at a route chatRole refuses.
```

with:

```ts
  // Defensive since 2026-08-07: `chip` is set only by PageList's chip row, and
  // visibleGroupChips no longer offers the everyone name, so this cannot be the
  // everyone group in practice. The clause stays because the rule behind it is
  // still true — that shelf is public and has no student for a version to
  // belong to, so a worksheet tile under it must fall back to the public page
  // rather than link at a route chatRole refuses. The same reasoning keeps
  // GroupList's canDeleteGroup fallback.
```

- [ ] **Step 9: Verify**

```bash
npx prisma generate && npm run lint && npm run typecheck && npm test
```

Expected: one pre-existing warning (`lib/snapshot-dom.ts:77`), silent tsc, all tests passing plus the three new ones.

Confirm the migration is valid SQL without applying it:

```bash
sqlite3 :memory: "CREATE TABLE \"Group\" (id TEXT, isEveryone INTEGER); CREATE TABLE \"PagePin\" (pageId TEXT, groupId TEXT); $(sed 's/^--.*//' prisma/migrations/20260807160000_drop_everyone_pins/migration.sql | tr '\n' ' ')"
```

Expected: no output, exit 0. A syntax error would print one.

- [ ] **Step 10: Commit**

```bash
git add lib/page-pins.ts tests/lib/page-pins.test.ts app/page-actions.ts prisma/migrations/20260807160000_drop_everyone_pins/migration.sql .claude/rules/files-pages-pdfs.md components/admin/PagesTabClient.tsx
git commit -m "$(cat <<'EOF'
Retire pins on the shared shelf

Removing the everyone chip took away the only way to reach them. That
left a capability no UI could create, edit or remove, so rather than
restore the chip the ordering is retired: a pin is a per-student thing.

The rows are deleted by migration. This is destructive and visible —
/g/all is public, so a page pinned there drops back into date order for
anyone with it bookmarked. Accepted deliberately.

canPinToShelf is a separate predicate and NOT a clause in shelfRole,
which answers "teacher" before it tests isEveryone on purpose: Jenn must
keep being able to put pages and links on that shelf. Only the ordering
went.

Also corrects PagesTabClient's comment about a chip that can no longer
be selected, the same correction Task 4 made in GroupList.

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Close the edit overlay on a clean save

`PageEditor.handleSubmit` sets a *Saved* flag and refreshes. It never closes anything, so the sheet sits over a list that has already changed behind it. The same form is the body of `/admin/pages/[slug]`, which is a page and has nothing to close — so the close arrives as an optional callback the overlay passes and the route does not.

**Files:**
- Modify: `components/admin/PageEditor.tsx`
- Modify: `components/admin/PageEditOverlay.tsx`

- [ ] **Step 1: Add the prop**

In `components/admin/PageEditor.tsx`, add to the props type, beside `onDelete`:

```ts
  // Called after a save that left NOTHING on this form to read. The overlay
  // passes its own close; the standalone route passes nothing, because a page
  // has nothing to close and its "Saved" flag is the whole feedback there.
  onSaved?: () => void;
```

Add `onSaved,` to the destructured parameter list beside `onDelete,`.

- [ ] **Step 2: Track whether the save left anything to say**

Replace the body of `handleSubmit`'s `try` block. Find:

```ts
    try {
      if (initial.kind === "pdf") {
```

and replace it with:

```ts
    try {
      // Whether this save has anything left for the form to show. A pdf never
      // does: updatePdfPage returns void and reports no skipped assets, so
      // there is nothing its branch could withhold the close for.
      let clean = true;

      if (initial.kind === "pdf") {
```

Then find:

```ts
        const result = await onSubmit({ title, html, groupIds, worksheet });
        setSkipped(result.skipped);
```

and replace it with:

```ts
        const result = await onSubmit({ title, html, groupIds, worksheet });
        setSkipped(result.skipped);
        clean = result.skipped.length === 0;
```

Then find:

```ts
      setSaved(true);
      router.refresh();
    } catch (err) {
```

and replace it with:

```ts
      setSaved(true);
      router.refresh();

      // Last, and only when the form has nothing left to show. A save that
      // skipped assets keeps the sheet open, because that list is stored
      // NOWHERE ELSE — it exists only in the reply to this one request, and
      // closing over it is the "warning nobody sees" the report was added to
      // prevent. NewPageForm already behaves this way; this makes the two
      // forms agree rather than adding a second rule.
      if (clean) onSaved?.();
    } catch (err) {
```

- [ ] **Step 3: Pass the close from the overlay**

In `components/admin/PageEditOverlay.tsx`, add `onSaved={onClose}` to the `<PageEditor …>` props, directly above the existing `onDelete={…}`:

```tsx
          onSaved={onClose}
```

`onClose` is already a `useCallback` that pushes to `closeTo`, so this needs no new state and no new router read.

Leave `app/admin/pages/[slug]/page.tsx` alone. It passes no `onSaved`, which is what keeps its *Saved* flag as the feedback on a surface with nothing to dismiss.

- [ ] **Step 4: Check that it compiles and the suite still passes**

```bash
npx prisma generate && npm run lint && npm run typecheck && npm test
```

Expected: clean, apart from the pre-existing `snapshot-dom.ts:77` warning.

- [ ] **Step 5: Check the behaviour by hand**

With `npm run dev` running and signed in:

- `/admin?tab=pages`, press a tile's pencil, change the title, Save. The overlay closes and the list shows the new title.
- Do the same from a student's shelf at `/g/<slug>?tab=files`. The overlay closes and you stay on the shelf.
- Open `/admin/pages/<slug>` directly and Save. The page stays and shows *Saved*.

- [ ] **Step 6: Commit**

```bash
git add components/admin/PageEditor.tsx components/admin/PageEditOverlay.tsx
git commit -m "$(cat <<'EOF'
Close the edit overlay when a save has nothing left to report

PageEditor set a Saved flag and refreshed, and the sheet stayed open
over a list that had already changed behind it. It closes now — except
on a save that skipped assets, where the list of what could not be
inlined exists only in that one reply and closing would swallow it.

An optional callback rather than a router call inside the form, because
/admin/pages/[slug] renders the same form and has nothing to close.

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: `lib/shelf-filters.ts`

**Files:**
- Create: `lib/shelf-filters.ts`
- Test: `tests/lib/shelf-filters.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/shelf-filters.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  DEFAULT_KIND,
  DEFAULT_SORT,
  filtersAreActive,
} from "@/lib/shelf-filters";

describe("the defaults", () => {
  it("are the values FilesTab opens with", () => {
    // If either of these moves, the dot lights up on a shelf nobody has
    // touched — so they are pinned here rather than left as a convention.
    expect(DEFAULT_KIND).toBe("all");
    expect(DEFAULT_SORT).toBe("created");
  });
});

describe("filtersAreActive", () => {
  it("is false when nothing has been touched", () => {
    expect(filtersAreActive({ kind: "all", sort: "created" })).toBe(false);
  });

  it("is true when the kind is narrowed", () => {
    expect(filtersAreActive({ kind: "pdf", sort: "created" })).toBe(true);
  });

  it("is true when the sort is changed", () => {
    expect(filtersAreActive({ kind: "all", sort: "modified" })).toBe(true);
  });

  it("is true when both are changed", () => {
    expect(filtersAreActive({ kind: "link", sort: "modified" })).toBe(true);
  });

  it("is true for every narrowing kind", () => {
    for (const kind of ["html", "link", "pdf"] as const) {
      expect(filtersAreActive({ kind, sort: "created" })).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run the test and check that it fails**

```bash
npx vitest run tests/lib/shelf-filters.test.ts
```

Expected: FAIL, `Failed to load url @/lib/shelf-filters`.

- [ ] **Step 3: Write the module**

Create `lib/shelf-filters.ts`:

```ts
import type { KindFilter } from "@/lib/page-filters";
import type { PageSort } from "@/lib/page-sort";

// What the shelf opens with. Named rather than written as two literals inside
// FilesTab's useState calls, because the disclosure's dot compares against
// exactly these values and a default that moved in one place and not the other
// would light the dot on a shelf nobody had touched.
export const DEFAULT_KIND: KindFilter = "all";
export const DEFAULT_SORT: PageSort = "created";

// Whether a HIDDEN control is doing something.
//
// This exists because the chip rows are closed by default. A filtered list is
// a short list, and with the controls out of sight there is nothing on screen
// to explain why — which reads as a fault rather than as a filter. The
// disclosure draws a dot on its icon when this answers true.
//
// A function rather than two comparisons written inline, so a third filter
// added later has one place to be added to instead of being silently missed.
export function filtersAreActive(state: {
  kind: KindFilter;
  sort: PageSort;
}): boolean {
  return state.kind !== DEFAULT_KIND || state.sort !== DEFAULT_SORT;
}
```

- [ ] **Step 4: Run the test and check that it passes**

```bash
npx vitest run tests/lib/shelf-filters.test.ts
```

Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/shelf-filters.ts tests/lib/shelf-filters.test.ts
git commit -m "$(cat <<'EOF'
Add the rule for whether a hidden shelf filter is doing something

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: The filter disclosure

**Files:**
- Create: `components/ui/FilterDisclosure.tsx`
- Modify: `lib/strings.ts` (type, French, English)
- Modify: `components/student/FilesTab.tsx`

- [ ] **Step 1: Add the two strings to the type**

In `lib/strings.ts`, find the `files:` block inside the `Strings` type (near line 116) and add two keys directly below `searchLabel`:

```ts
    files: {
      searchLabel: string;
      // The disclosure that holds the two chip rows below.
      filterBy: string;
      filterToggle: string;
      kindFilter: {
```

- [ ] **Step 2: Add the French values**

Find the French `files:` block (near line 596) and add below its `searchLabel`:

```ts
      filterBy: "Filtrer par :",
      filterToggle: "Afficher les filtres",
```

- [ ] **Step 3: Add the English values**

Find the English `files:` block (near line 1036) and add below its `searchLabel`:

```ts
      filterBy: "Filter by:",
      filterToggle: "Show filters",
```

- [ ] **Step 4: Write the component**

Create `components/ui/FilterDisclosure.tsx`:

```tsx
"use client";

import { useId, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { cardFocusRing } from "@/components/card-styles";

// The shelf's chip rows, closed by default. Three stacked control rows above
// the tiles was most of a phone's first screen, sitting above the files the
// student opened the tab to reach.
//
// THE DOT IS THE PART THAT MATTERS. A filtered list is a short list, and with
// the controls hidden there is nothing on screen to say why, which reads as a
// fault rather than as a filter. `active` is lib/shelf-filters.ts's answer and
// this component does not compute it: the rule has a test, and a component
// does not.
//
// The open state is local and resets on every load. The filters it holds are
// `useState` in FilesTab and already behave that way, so the disclosure
// follows the controls inside it rather than inventing persistence they do not
// have.
export function FilterDisclosure({
  toggleLabel,
  label,
  active,
  children,
}: {
  toggleLabel: string;
  label: string;
  active: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <div className="mb-5">
      <div className="flex items-center justify-center gap-2">
        {open && (
          <span className="font-[family-name:var(--card-font-serif)] text-sm text-[var(--card-moss)]">
            {label}
          </span>
        )}
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls={panelId}
          // ONE label in both states. aria-expanded already carries open or
          // closed, and a label that changed with it would say the same thing
          // twice — announced as "Hide filters, expanded".
          aria-label={toggleLabel}
          className={cn(
            "relative flex h-11 w-11 items-center justify-center rounded-full border border-[var(--card-line)] bg-[var(--card-paper)] text-[var(--card-moss)] transition-colors duration-150 hover:text-[var(--card-ink)] motion-reduce:transition-none",
            open && "border-[var(--card-bleu)] text-[var(--card-bleu)]",
            cardFocusRing,
          )}
        >
          <FilterIcon />
          {!open && active && (
            // aria-hidden: this repeats what the chips inside already say, and
            // a screen reader reaches those by opening the panel. A second
            // announcement of "filtered" on the button would be noise.
            <span
              aria-hidden="true"
              className="absolute right-2 top-2 h-2 w-2 rounded-full bg-[var(--card-bleu)]"
            />
          )}
        </button>
      </div>

      {/* `hidden` rather than unmounting, so aria-controls always names an
          element that exists. An id pointing at nothing is worse than a hidden
          panel: it is a promise the button cannot keep. */}
      <div id={panelId} hidden={!open} className="mt-3">
        {children}
      </div>
    </div>
  );
}

// Local to the file that draws it, the same way ShellBar keeps its own back
// arrow and PrintButton its own save glyph, rather than an icon module for a
// handful of one-off shapes.
function FilterIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M4 6h16M7 12h10M10 18h4" />
    </svg>
  );
}
```

- [ ] **Step 5: Wrap the two chip rows**

In `components/student/FilesTab.tsx`, add the imports:

```ts
import { FilterDisclosure } from "@/components/ui/FilterDisclosure";
import { filtersAreActive } from "@/lib/shelf-filters";
```

Replace:

```tsx
          <KindFilter
            value={kind}
            onChange={setKind}
            tone="card"
            labels={strings.student.files.kindFilter}
          />
          <SortFilter
            value={sort}
            onChange={setSort}
            tone="card"
            labels={strings.student.files.sortFilter}
          />
```

with:

```tsx
          <FilterDisclosure
            toggleLabel={strings.student.files.filterToggle}
            label={strings.student.files.filterBy}
            active={filtersAreActive({ kind, sort })}
          >
            <KindFilter
              value={kind}
              onChange={setKind}
              tone="card"
              labels={strings.student.files.kindFilter}
            />
            <SortFilter
              value={sort}
              onChange={setSort}
              tone="card"
              labels={strings.student.files.sortFilter}
            />
          </FilterDisclosure>
```

Nothing else in this file changes. `kind` and `sort` keep their `useState` and their defaults, and `visible`/`groups` are computed from them exactly as before.

- [ ] **Step 6: Check that it compiles and the suite still passes**

```bash
npx prisma generate && npm run lint && npm run typecheck && npm test
```

Expected: clean, apart from the pre-existing `snapshot-dom.ts:77` warning.

- [ ] **Step 7: Check the behaviour by hand**

With `npm run dev` running, open a student's shelf at `/g/<slug>?tab=files`:

- Only the search field and the filter icon show.
- Pressing the icon reveals *Filtrer par :* and both chip rows.
- Choose *Les PDF*, then press the icon to close. The icon carries a dot.
- Choose *Tout* and *Ajout* again, then close. The dot is gone.
- Check the same at `/f/<filesToken>`, which renders the same component.
- Tab to the icon and press Enter. The focus ring shows and the panel opens.

- [ ] **Step 8: Commit**

```bash
git add components/ui/FilterDisclosure.tsx components/student/FilesTab.tsx lib/strings.ts
git commit -m "$(cat <<'EOF'
Put the shelf's chip rows behind a filter icon

A search field and two chip rows above the tiles was most of a phone's
first screen, above the files the student came to open. Both rows are
closed by default now.

The icon carries a dot while a hidden filter is narrowing the list. That
is the whole reason this is not just a hide: a short list with no visible
cause reads as a fault.

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: `lib/board-zoom.ts`

The spec sketched `clampPan(offset, scale, viewport, content)`. This plan uses `clampPan(offset, viewport, drawn)` instead: the caller already knows the drawn size, and passing it directly removes a multiplication the function would otherwise repeat and a test would have to replicate. Same rule, one fewer argument.

**Files:**
- Create: `lib/board-zoom.ts`
- Test: `tests/lib/board-zoom.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/board-zoom.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  MIN_SCALE,
  MAX_SCALE,
  fitScale,
  clampScale,
  clampPan,
} from "@/lib/board-zoom";

// The logical space every board is drawn in. Named here so the numbers below
// read as a board rather than as arbitrary sizes.
const BOARD = { width: 1600, height: 1000 };

describe("fitScale", () => {
  it("is limited by the narrower axis", () => {
    expect(fitScale({ width: 800, height: 1000 }, BOARD)).toBe(0.5);
  });

  it("is limited by the shorter axis when that one binds", () => {
    expect(fitScale({ width: 1600, height: 250 }, BOARD)).toBe(0.25);
  });

  it("is 1 when the board exactly fills the viewport", () => {
    expect(fitScale(BOARD, BOARD)).toBe(1);
  });

  it("falls back to 1 rather than 0 on a viewport with no size yet", () => {
    // The first render happens before layout, so this is the real first call
    // on every open. A 0 here would draw a canvas of no pixels.
    expect(fitScale({ width: 0, height: 0 }, BOARD)).toBe(1);
  });

  it("falls back to 1 on content with no size", () => {
    expect(fitScale(BOARD, { width: 0, height: 0 })).toBe(1);
  });
});

describe("clampScale", () => {
  it("refuses to zoom out below the fit", () => {
    // There is nothing to find in the empty space around a page smaller than
    // its viewport, so the fit is the floor.
    expect(clampScale(0.5)).toBe(MIN_SCALE);
  });

  it("keeps a value inside the range", () => {
    expect(clampScale(4)).toBe(4);
  });

  it("stops at the ceiling", () => {
    expect(clampScale(20)).toBe(MAX_SCALE);
  });

  it("answers the floor for a value that is not a number", () => {
    // A pinch gesture can produce NaN when two pointers land on one point.
    expect(clampScale(Number.NaN)).toBe(MIN_SCALE);
  });

  it("has a floor of 1 and a ceiling of 8", () => {
    expect(MIN_SCALE).toBe(1);
    expect(MAX_SCALE).toBe(8);
  });
});

describe("clampPan", () => {
  const viewport = { width: 800, height: 600 };

  it("centres content smaller than the viewport and ignores the drag", () => {
    expect(
      clampPan({ x: 500, y: -300 }, viewport, { width: 400, height: 200 }),
    ).toEqual({ x: 200, y: 200 });
  });

  it("will not let a drag pull the left edge inside the viewport", () => {
    expect(clampPan({ x: 120, y: 0 }, viewport, { width: 1600, height: 600 }).x).toBe(0);
  });

  it("will not let a drag pull the right edge inside the viewport", () => {
    expect(
      clampPan({ x: -99999, y: 0 }, viewport, { width: 1600, height: 600 }).x,
    ).toBe(-800);
  });

  it("keeps an offset that is already inside the bounds", () => {
    expect(
      clampPan({ x: -300, y: 0 }, viewport, { width: 1600, height: 600 }).x,
    ).toBe(-300);
  });

  it("clamps one axis and centres the other", () => {
    // A board zoomed in horizontally but still short enough to fit vertically.
    expect(
      clampPan({ x: -99999, y: 99999 }, viewport, { width: 1600, height: 300 }),
    ).toEqual({ x: -800, y: 150 });
  });
});
```

- [ ] **Step 2: Run the test and check that it fails**

```bash
npx vitest run tests/lib/board-zoom.test.ts
```

Expected: FAIL, `Failed to load url @/lib/board-zoom`.

- [ ] **Step 3: Write the module**

Create `lib/board-zoom.ts`:

```ts
// How far the board viewer may zoom, and where the drawing is allowed to sit.
//
// Pure and injected with sizes rather than reading the DOM, for the reason
// lib/whiteboard-hit.ts takes an injected text measurer: it makes the rules
// testable with numbers instead of a layout engine, which the test environment
// does not have.

export type Size = { width: number; height: number };
export type Offset = { x: number; y: number };

// `scale` is a MULTIPLIER OF THE FIT, not of the logical space. That is what
// makes 1 mean "the whole page is visible" at every window size, on a phone
// and on a laptop alike, rather than meaning "1600 logical units to 1600 CSS
// pixels" — which is off-screen on a phone and small on a desktop.
export const MIN_SCALE = 1;
export const MAX_SCALE = 8;

function usable(size: Size): boolean {
  return (
    Number.isFinite(size.width) &&
    Number.isFinite(size.height) &&
    size.width > 0 &&
    size.height > 0
  );
}

// The scale at which the whole page is visible. Both axes, whichever binds.
//
// The fallback is 1 and never 0. The first render happens before layout, so a
// zero-sized viewport is the real first call on every open, and a 0 here would
// size a canvas at no pixels — which is indistinguishable from a board that
// failed to load.
export function fitScale(viewport: Size, content: Size): number {
  if (!usable(viewport) || !usable(content)) return 1;
  return Math.min(
    viewport.width / content.width,
    viewport.height / content.height,
  );
}

// There is deliberately no zoom-out below the fit. A page smaller than its
// viewport has empty space around it, and there is nothing in that space to
// look for.
export function clampScale(scale: number): number {
  // A pinch with both pointers on one point produces NaN, and NaN survives
  // Math.min/Math.max unchanged — so it has to be caught before them or it
  // reaches the canvas and blanks it.
  if (!Number.isFinite(scale)) return MIN_SCALE;
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

// `offset` is the drawn content's top-left corner, relative to the viewport's
// top-left. `drawn` is its size in CSS pixels, with the scale already applied.
//
// Two cases, and the first is the one worth stating: when the content is
// SMALLER than the viewport the requested offset is discarded and the content
// is centred. A drag has nowhere useful to go on that axis, and letting it
// wander leaves the drawing against an edge for no reason.
function clampAxis(value: number, viewport: number, drawn: number): number {
  if (drawn <= viewport) return (viewport - drawn) / 2;
  // Otherwise: the leading edge may not come inside the viewport (max 0) and
  // the trailing edge may not either (min viewport - drawn). Without this a
  // drag can push the whole board off screen and leave an empty rectangle with
  // nothing on it to explain how to get back.
  return Math.min(0, Math.max(viewport - drawn, value));
}

export function clampPan(
  offset: Offset,
  viewport: Size,
  drawn: Size,
): Offset {
  return {
    x: clampAxis(offset.x, viewport.width, drawn.width),
    y: clampAxis(offset.y, viewport.height, drawn.height),
  };
}
```

- [ ] **Step 4: Run the test and check that it passes**

```bash
npx vitest run tests/lib/board-zoom.test.ts
```

Expected: PASS, 15 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/board-zoom.ts tests/lib/board-zoom.test.ts
git commit -m "$(cat <<'EOF'
Add the board viewer's zoom and pan rules

Scale is a multiplier of the fit, so 1 means "the whole page is visible"
at every window size. There is no zoom-out below it, and a pan can never
push the drawing off screen and leave an empty rectangle.

Pure and fed sizes rather than reading the DOM, the same arrangement
lib/whiteboard-hit.ts uses for its text measurer and for the same
reason: the test environment has no layout engine.

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Localise the board archive

Every whiteboard component is hardcoded French. Adding a viewer that reads the dictionary would put *Close* and *Page 2 of 4* beside *Télécharger*, and one tab in two languages is worse than either alone. This task moves the archive's six strings into the dictionary and adds the viewer's, before the viewer exists to use them.

`BoardEditor`, `BoardToolbar`, `LeaveBoardDialog` and `TextStylePopover` stay French. They are the drawing surface, reachable only by pressing *New board*, teacher-only, and editing `BoardEditor` means editing the leave-guard and the text-draft commit logic. That is real risk for no benefit to the reader-facing change.

**Files:**
- Modify: `lib/strings.ts` (type, French, English)
- Modify: `lib/whiteboard-names.ts`
- Modify: `tests/lib/whiteboard-names.test.ts`

- [ ] **Step 1: Add the board block to the type**

In `lib/strings.ts`, inside the `Strings` type's `student:` area, add a `board` block directly after the `files: { … };` block:

```ts
    // The whiteboard ARCHIVE and the viewer over it. The drawing surface
    // (BoardEditor and its toolbar) is deliberately absent and stays French —
    // it is teacher-only, reachable only by pressing "New board", and editing
    // it means editing the leave-guard.
    board: {
      newBoard: string;
      empty: string;
      drawingPage: (page: number) => string;
      liveNow: string;
      openLive: string;
      download: string;
      downloadFailed: string;
      delete: string;
      pageCount: (count: number) => string;
      viewer: {
        open: (label: string) => string;
        close: string;
        position: (page: number, total: number) => string;
        previous: string;
        next: string;
        zoomIn: string;
        zoomOut: string;
        resetZoom: string;
        loadFailed: string;
      };
    };
```

- [ ] **Step 2: Add the French values**

In the French object's `student:` area, after its `files: { … },` block:

```ts
    board: {
      newBoard: "Nouveau tableau",
      empty: "Aucun tableau pour l'instant !",
      drawingPage: (page) => `Page ${page} — Jenn dessine…`,
      liveNow: "Jenn dessine en ce moment",
      openLive: "Ouvrir le tableau",
      download: "Télécharger",
      downloadFailed: "Échec",
      delete: "Supprimer",
      pageCount: (count) => (count === 1 ? "1 page" : `${count} pages`),
      viewer: {
        open: (label) => `Ouvrir le tableau du ${label}`,
        close: "Fermer",
        position: (page, total) => `Page ${page} sur ${total}`,
        previous: "Page précédente",
        next: "Page suivante",
        zoomIn: "Agrandir",
        zoomOut: "Réduire",
        resetZoom: "Taille normale",
        loadFailed: "Impossible d'ouvrir ce tableau.",
      },
    },
```

- [ ] **Step 3: Add the English values**

In the English object's `student:` area, in the same position:

```ts
    board: {
      newBoard: "New board",
      empty: "No boards yet!",
      drawingPage: (page) => `Page ${page} — Jenn is drawing…`,
      liveNow: "Jenn is drawing right now",
      openLive: "Open the board",
      download: "Download",
      downloadFailed: "Failed",
      delete: "Delete",
      pageCount: (count) => (count === 1 ? "1 page" : `${count} pages`),
      viewer: {
        open: (label) => `Open the board from ${label}`,
        close: "Close",
        position: (page, total) => `Page ${page} of ${total}`,
        previous: "Previous page",
        next: "Next page",
        zoomIn: "Zoom in",
        zoomOut: "Zoom out",
        resetZoom: "Actual size",
        loadFailed: "This board could not be opened.",
      },
    },
```

`pageCount` is a function and not a template for the reason every interpolating value here is one: the plural rule is part of the sentence, and French and English do not have to agree about it.

- [ ] **Step 4: Write the failing test for the board label's locale**

`boardLabels` formats with a hardcoded `fr-CA`, so an English browser would read *3 juin 2026* in the viewer's title. Add these two cases to `tests/lib/whiteboard-names.test.ts`, inside the existing `describe("boardLabels", …)`:

```ts
  it("formats the day in English when asked", () => {
    const labels = boardLabels(
      [board("a", "2026-06-03", "2026-06-03T18:00:00Z")],
      "en",
    );
    expect(labels.get("a")).toBe("June 3, 2026");
  });

  it("defaults to French, so every existing caller is unchanged", () => {
    const labels = boardLabels([board("a", "2026-06-03", "2026-06-03T18:00:00Z")]);
    expect(labels.get("a")).toBe("3 juin 2026");
  });
```

- [ ] **Step 5: Run the test and check that it fails**

```bash
npx vitest run tests/lib/whiteboard-names.test.ts
```

Expected: the English case FAILS with `expected '3 juin 2026' to be 'June 3, 2026'`. The French case passes already.

- [ ] **Step 6: Give `boardLabels` an optional locale**

In `lib/whiteboard-names.ts`, add the imports:

```ts
import { toBCP47, type Locale } from "@/lib/i18n";
```

Replace:

```ts
const dayFormat = new Intl.DateTimeFormat("fr-CA", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
```

with:

```ts
// Built per call rather than once at module scope, because the locale is per
// request. Two formatters cached in a Map would be the optimisation, and it is
// not worth it: this runs once per render of one tab.
//
// timeZone: "UTC" like every other date in this codebase. Without it a board
// stamped at UTC midnight renders as the previous day for anyone west of
// Greenwich, which is everyone using this site.
function dayFormatFor(locale: Locale) {
  return new Intl.DateTimeFormat(toBCP47(locale), {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
```

Change the signature:

```ts
export function boardLabels(boards: NamedBoard[]): Map<string, string> {
```

to:

```ts
// The locale is OPTIONAL and defaults to French, which is this site's fallback
// everywhere else too — see lib/i18n.ts. That default is also what keeps every
// existing test calling this with one argument.
export function boardLabels(
  boards: NamedBoard[],
  locale: Locale = "fr",
): Map<string, string> {
```

Inside the function, above the `for (const day of byDay.values())` loop, add:

```ts
  const dayFormat = dayFormatFor(locale);
```

The `const name = dayFormat.format(board.date);` line inside the loop is unchanged.

- [ ] **Step 7: Run the tests and check that they pass**

```bash
npx vitest run tests/lib/whiteboard-names.test.ts
```

Expected: PASS, 8 tests.

- [ ] **Step 8: Check that everything compiles**

```bash
npx prisma generate && npm run lint && npm run typecheck && npm test
```

Expected: clean, apart from the pre-existing `snapshot-dom.ts:77` warning. Nothing renders the new strings yet — that is Task 11.

- [ ] **Step 9: Commit**

```bash
git add lib/strings.ts lib/whiteboard-names.ts tests/lib/whiteboard-names.test.ts
git commit -m "$(cat <<'EOF'
Put the whiteboard archive's words in the dictionary

Every board component was hardcoded French, and boardLabels formatted
its dates as fr-CA regardless of who was reading. Adding a viewer that
reads the dictionary beside them would have shipped one tab in two
languages, so the archive's six strings move first, with the viewer's
alongside them.

The drawing surface stays French on purpose. It is teacher-only, it is
reached only by pressing New board, and editing BoardEditor means
editing the leave-guard for no reader-facing gain.

boardLabels' locale is optional and defaults to French, which is the
site's fallback everywhere else and keeps every existing caller working.

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: `rasterScale`, the viewer's half of the iOS cap

The viewer's whole point is that zooming redraws rather than magnifies, so its canvas backing store grows with the zoom. That runs into the same ceiling `exportLayout` already answers to: **iOS Safari returns a blank canvas, not an error, past roughly 16.7M pixels.** A blank board is indistinguishable from a board that failed to load, so the raster is capped and downscaled instead.

This is a rule, so it goes in the module with the other two rather than inline in the component.

**Files:**
- Modify: `lib/board-zoom.ts`
- Modify: `tests/lib/board-zoom.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/lib/board-zoom.test.ts`. Extend the import list with `rasterScale`, then add this block at the end of the file:

```ts
describe("rasterScale", () => {
  it("uses the device's own ratio when there is room", () => {
    expect(rasterScale({ width: 800, height: 600 }, 2)).toBe(2);
  });

  it("uses 1 on a display that reports no ratio", () => {
    expect(rasterScale({ width: 800, height: 600 }, 1)).toBe(1);
  });

  it("falls back to 1 rather than 0 on a nonsense ratio", () => {
    expect(rasterScale({ width: 800, height: 600 }, 0)).toBe(1);
    expect(rasterScale({ width: 800, height: 600 }, Number.NaN)).toBe(1);
  });

  it("cuts the ratio down when the backing store would exceed the cap", () => {
    // 4000 x 3000 at dpr 3 is 108M pixels — over six times the ceiling. iOS
    // Safari answers that with a BLANK canvas rather than an error, which is
    // indistinguishable from a board that failed to load.
    const scale = rasterScale({ width: 4000, height: 3000 }, 3);
    expect(scale).toBeLessThan(3);
    expect(4000 * scale * (3000 * scale)).toBeLessThanOrEqual(16_000_000);
  });

  it("keeps the result under the cap once the caller floors it", () => {
    // exportLayout floors its scaled dimensions for exactly this reason:
    // rounding both up puts their product back over the cap that was just
    // enforced. The viewer floors too, so the check has to survive it.
    const drawn = { width: 4000, height: 3000 };
    const scale = rasterScale(drawn, 3);
    const width = Math.floor(drawn.width * scale);
    const height = Math.floor(drawn.height * scale);
    expect(width * height).toBeLessThanOrEqual(16_000_000);
  });

  it("falls back to the ratio on a size with no area", () => {
    expect(rasterScale({ width: 0, height: 0 }, 2)).toBe(2);
  });
});
```

- [ ] **Step 2: Run the test and check that it fails**

```bash
npx vitest run tests/lib/board-zoom.test.ts
```

Expected: FAIL, `rasterScale is not a function`.

- [ ] **Step 3: Add the function**

In `lib/board-zoom.ts`, add the import at the top:

```ts
import { MAX_CANVAS_AREA } from "@/lib/whiteboard-export";
```

and add at the end of the file:

```ts
// How many backing-store pixels to allocate per CSS pixel.
//
// The viewer redraws at every zoom level rather than magnifying a picture, so
// its canvas grows with the zoom — and runs into the same ceiling exportLayout
// answers to. MAX_CANVAS_AREA is imported rather than repeated: two copies of
// that number would drift, and the failure is silent on the device that
// matters. iOS Safari returns a BLANK canvas past roughly 16.7M pixels, which
// looks exactly like a board that failed to load.
//
// Downscaling rather than refusing: a slightly soft board at 8x is a board,
// and a blank one is a bug report.
export function rasterScale(drawn: Size, devicePixelRatio: number): number {
  const dpr =
    Number.isFinite(devicePixelRatio) && devicePixelRatio > 0
      ? devicePixelRatio
      : 1;
  if (!usable(drawn)) return dpr;

  const area = drawn.width * dpr * (drawn.height * dpr);
  if (area <= MAX_CANVAS_AREA) return dpr;
  return dpr * Math.sqrt(MAX_CANVAS_AREA / area);
}
```

- [ ] **Step 4: Run the test and check that it passes**

```bash
npx vitest run tests/lib/board-zoom.test.ts
```

Expected: PASS, 21 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/board-zoom.ts tests/lib/board-zoom.test.ts
git commit -m "$(cat <<'EOF'
Cap the board viewer's backing store at the same ceiling the export uses

Redrawing at every zoom level means the canvas grows with the zoom, and
iOS Safari answers an oversized canvas with a blank image rather than an
error. MAX_CANVAS_AREA is imported from the export rather than repeated:
two copies of that number would drift, and the failure it prevents is
silent on the device most of these students use.

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Extract the stacked-JPEG download

The tile and the viewer both need this. Two copies would drift, and the viewer's download must produce the same file the tile's does.

**Files:**
- Create: `components/whiteboard/board-download.ts`
- Modify: `components/whiteboard/BoardTile.tsx`

It lives in `components/` and **not** in `lib/`, because it fetches, touches the DOM and clicks an anchor. That is the same split `components/pdf-thumbnail.ts` and `components/html-thumbnail.ts` already make.

- [ ] **Step 1: Create the module**

Create `components/whiteboard/board-download.ts` with the code currently inside `BoardTile.download`, unchanged apart from its wrapper:

```ts
import { BOARD_HEIGHT, BOARD_WIDTH, type DrawOp } from "@/lib/whiteboard-ops";
import { exportLayout } from "@/lib/whiteboard-export";
import { BOARD_PAPER, drawOps } from "@/components/whiteboard/BoardCanvas";

// ONE tall JPEG with every page stacked, not one file per page: multiple
// programmatic downloads make Chrome and Safari prompt, and a zip would be the
// first utility dependency in this project.
//
// Lifted out of BoardTile so the viewer's own download is the SAME file rather
// than a second implementation of it. Impure — it fetches, it builds a canvas
// and it clicks an anchor — so it sits in components/ rather than lib/, the
// same split components/pdf-thumbnail.ts already makes.
//
// It THROWS on failure rather than returning a flag. Both callers already hold
// their own error state and their own wording, and a boolean would make them
// invent the same branch twice.
export async function downloadBoardJpeg(input: {
  slug: string;
  id: string;
  label: string;
}): Promise<void> {
  const response = await fetch(`/api/whiteboard/${input.slug}/${input.id}`);
  if (!response.ok) throw new Error("fetch failed");
  const { pages } = (await response.json()) as { pages: DrawOp[][] };

  const layout = exportLayout(pages.length);
  const canvas = document.createElement("canvas");
  canvas.width = layout.width;
  canvas.height = layout.height;

  const context = canvas.getContext("2d");
  if (!context) throw new Error("no 2d context");

  context.fillStyle = BOARD_PAPER;
  context.fillRect(0, 0, canvas.width, canvas.height);

  pages.forEach((ops, index) => {
    context.save();
    context.translate(0, index * (layout.pageHeight + layout.gap));
    context.scale(layout.scale, layout.scale);
    context.beginPath();
    context.rect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);
    context.clip();
    drawOps(context, ops);
    context.restore();

    if (index > 0) {
      context.fillStyle = "#d8cbb4"; // --card-line
      context.fillRect(
        0,
        index * (layout.pageHeight + layout.gap) - layout.gap / 2,
        canvas.width,
        1,
      );
    }
  });

  const url = canvas.toDataURL("image/jpeg", 0.9);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `tableau-${input.label.replace(/[^\w]+/g, "-").toLowerCase()}.jpg`;
  anchor.click();
}
```

- [ ] **Step 2: Call it from `BoardTile`**

In `components/whiteboard/BoardTile.tsx`, delete these three imports:

```ts
import { BOARD_HEIGHT, BOARD_WIDTH, type DrawOp } from "@/lib/whiteboard-ops";
import { exportLayout } from "@/lib/whiteboard-export";
import { BOARD_PAPER, drawOps } from "@/components/whiteboard/BoardCanvas";
```

and add these two in their place — `BOARD_WIDTH` and `BOARD_HEIGHT` are still needed by the `<img>` below:

```ts
import { BOARD_HEIGHT, BOARD_WIDTH } from "@/lib/whiteboard-ops";
import { downloadBoardJpeg } from "@/components/whiteboard/board-download";
```

Then replace the whole `download` function — from its comment down to its closing brace — with:

```ts
  async function download() {
    setBusy(true);
    setError(false);
    try {
      await downloadBoardJpeg({ slug, id, label });
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
```

- [ ] **Step 3: Check that it compiles and the suite still passes**

```bash
npx prisma generate && npm run lint && npm run typecheck && npm test
```

Expected: clean, apart from the pre-existing `snapshot-dom.ts:77` warning. If lint reports an unused import in `BoardTile`, one of the three deleted imports is still referenced — check the `<img>`'s `width`/`height`.

- [ ] **Step 4: Check the behaviour by hand**

With `npm run dev`, open a student page with at least one saved board at `/g/<slug>?tab=board` and press *Télécharger*. A `.jpg` downloads with every page stacked, exactly as before.

- [ ] **Step 5: Commit**

```bash
git add components/whiteboard/board-download.ts components/whiteboard/BoardTile.tsx
git commit -m "$(cat <<'EOF'
Lift the board download out of the tile

The viewer needs the same file the tile produces, and two copies of a
canvas-stacking routine would drift. In components/ and not lib/,
because it fetches, builds a canvas and clicks an anchor.

No behaviour change: the tile calls it and keeps its own error state.

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: The board viewer

**Files:**
- Create: `components/whiteboard/BoardViewer.tsx`
- Modify: `components/whiteboard/BoardTile.tsx`
- Modify: `components/whiteboard/BoardTab.tsx`
- Modify: `components/whiteboard/LiveBanner.tsx`
- Modify: `app/g/[slug]/page.tsx`

- [ ] **Step 1: Write the viewer**

Create `components/whiteboard/BoardViewer.tsx`:

```tsx
"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  // Imported by name, not reached through a `React.` namespace: the new JSX
  // transform does not put `React` in scope, so `React.PointerEvent` in the
  // handler signatures below would not compile.
  type PointerEvent as ReactPointerEvent,
} from "react";
import { BOARD_HEIGHT, BOARD_WIDTH, type DrawOp } from "@/lib/whiteboard-ops";
import { BOARD_PAPER, drawOps } from "@/components/whiteboard/BoardCanvas";
import { downloadBoardJpeg } from "@/components/whiteboard/board-download";
import { useOverlayLock } from "@/components/ui/OverlayProvider";
import {
  MAX_SCALE,
  MIN_SCALE,
  clampPan,
  clampScale,
  fitScale,
  rasterScale,
  type Offset,
  type Size,
} from "@/lib/board-zoom";
import { getStrings } from "@/lib/strings";
import type { Locale } from "@/lib/i18n";
import { cardFocusRing } from "@/components/card-styles";
import { cn } from "@/lib/utils";

// One press of a zoom button, and one wheel notch.
const ZOOM_STEP = 1.5;

const BOARD: Size = { width: BOARD_WIDTH, height: BOARD_HEIGHT };

const controlClass = cn(
  "flex h-11 min-w-11 items-center justify-center rounded-full border border-[var(--card-line)] bg-[var(--card-paper)] px-3 font-[family-name:var(--card-font-serif)] text-sm text-[var(--card-moss)] shadow-[var(--card-shadow)] transition-colors duration-150 hover:bg-[var(--card-section)] disabled:opacity-40 motion-reduce:transition-none",
  cardFocusRing,
);

// A saved board, readable in place.
//
// IT REDRAWS THE OPS. It does not magnify a picture, and that is the whole
// reason it exists rather than an <img> around the download's output: a board
// is vector ops in a 1600x1000 logical space, and exportLayout already
// downscales a long one to clear iOS Safari's canvas limit. Zooming into that
// image would show the downscale. Zooming here re-rasterises, so the strokes
// get sharper.
//
// It reads GET /api/whiteboard/[slug]/[id], which is unchanged: that route
// already authorises both parties through chatRole, and it already answers
// `private, max-age=3600`, which is safe because a saved board is immutable.
export function BoardViewer({
  slug,
  id,
  label,
  locale,
  onClose,
}: {
  slug: string;
  id: string;
  label: string;
  // A client component takes the LOCALE, never a resolved Strings object: that
  // object holds functions and React cannot serialize a function across the
  // server/client boundary. See lib/strings.ts.
  locale: Locale;
  onClose: () => void;
}) {
  const strings = getStrings(locale).student.board;
  const labels = strings.viewer;

  // Hides the two fixed corner buttons below `md` for the life of this mount,
  // the same rule AddSheet and ChatPanel follow. Without it the shelf's + and
  // the chat bubble paint over the zoom controls on a phone.
  useOverlayLock();

  const [pages, setPages] = useState<DrawOp[][] | null>(null);
  const [failed, setFailed] = useState(false);
  const [page, setPage] = useState(0);
  const [scale, setScale] = useState(MIN_SCALE);
  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 });
  const [viewport, setViewport] = useState<Size>({ width: 0, height: 0 });
  const [busy, setBusy] = useState(false);
  const [downloadFailed, setDownloadFailed] = useState(false);

  const frameRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // Every pointer currently down on the frame, so one finger pans and two
  // pinch. A Map rather than two nullable refs: the second pointer can lift
  // first, and a pair of refs gets that wrong.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; scale: number } | null>(null);
  const drag = useRef<{ id: number; x: number; y: number; from: Offset } | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/whiteboard/${slug}/${id}`)
      .then((response) => {
        if (!response.ok) throw new Error("fetch failed");
        return response.json() as Promise<{ pages: DrawOp[][] }>;
      })
      .then((body) => {
        if (!cancelled) setPages(body.pages);
      })
      .catch(() => {
        // Every fetch rejection is handled. An unhandled one here would leave
        // the viewer on its loading state for ever with nothing to press.
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [slug, id]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Measured rather than assumed: the fit depends on the window, and the
  // window rotates.
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (box) setViewport({ width: box.width, height: box.height });
    });
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  const fit = fitScale(viewport, BOARD);
  const drawnWidth = BOARD_WIDTH * fit * scale;
  const drawnHeight = BOARD_HEIGHT * fit * scale;

  // Clamped on EVERY render, not only inside the drag handler. The viewport
  // changes on rotate and on resize, and an offset that was legal before the
  // rotation can be off screen after it.
  const placed = clampPan(
    offset,
    viewport,
    { width: drawnWidth, height: drawnHeight },
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !pages) return;

    const raster = rasterScale(
      { width: drawnWidth, height: drawnHeight },
      window.devicePixelRatio,
    );
    // Floored for the reason exportLayout floors its own: rounding both up
    // puts their product back over the cap that was just enforced. Never
    // below 1, because a canvas of zero pixels throws.
    const width = Math.max(1, Math.floor(drawnWidth * raster));
    const height = Math.max(1, Math.floor(drawnHeight * raster));
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) return;

    // The ops are in the logical space, so the transform is what turns this
    // into a redraw at the current zoom rather than a scaled bitmap.
    context.setTransform(width / BOARD_WIDTH, 0, 0, height / BOARD_HEIGHT, 0, 0);
    context.fillStyle = BOARD_PAPER;
    context.fillRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);
    drawOps(context, pages[page] ?? []);
  }, [pages, page, drawnWidth, drawnHeight]);

  // Zooms about the middle of the viewport, so the thing being looked at stays
  // roughly where it was. Reading `scale` from the render scope rather than
  // from a setState updater: calling setOffset inside a setScale updater is a
  // side effect in an updater, which React may run twice.
  const zoomBy = useCallback(
    (factor: number) => {
      const next = clampScale(scale * factor);
      if (next === scale) return;
      const ratio = next / scale;
      setOffset((current) => ({
        x: viewport.width / 2 - (viewport.width / 2 - current.x) * ratio,
        y: viewport.height / 2 - (viewport.height / 2 - current.y) * ratio,
      }));
      setScale(next);
    },
    [scale, viewport.width, viewport.height],
  );

  // A native listener with `{ passive: false }`, NOT an onWheel prop. React
  // attaches wheel at the root as passive, so preventDefault from a JSX
  // handler is ignored and logs an error — and without it the page behind
  // scrolls while the board zooms.
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      zoomBy(event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP);
    };
    frame.addEventListener("wheel", onWheel, { passive: false });
    return () => frame.removeEventListener("wheel", onWheel);
  }, [zoomBy]);

  function pointerGap(): number {
    const [a, b] = [...pointers.current.values()];
    if (!a || !b) return 0;
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointers.current.size === 2) {
      pinch.current = { distance: pointerGap(), scale };
      // A pinch is not a pan. Dropping the drag stops the board lurching
      // sideways as the second finger lands.
      drag.current = null;
      return;
    }

    if (pointers.current.size === 1) {
      drag.current = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        // From where it is DRAWN, not from the unclamped request, or a drag
        // that started after a clamp jumps by the difference.
        from: placed,
      };
    }
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    const pinching = pinch.current;
    if (pinching && pointers.current.size === 2) {
      const distance = pointerGap();
      // Guard the divide: two fingers can land on one point, and the NaN that
      // produces survives Math.min and Math.max all the way to the canvas.
      if (pinching.distance > 0) {
        setScale(clampScale(pinching.scale * (distance / pinching.distance)));
      }
      return;
    }

    const active = drag.current;
    if (!active || active.id !== event.pointerId) return;
    setOffset({
      x: active.from.x + (event.clientX - active.x),
      y: active.from.y + (event.clientY - active.y),
    });
  }

  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (drag.current?.id === event.pointerId) drag.current = null;
  }

  async function download() {
    setBusy(true);
    setDownloadFailed(false);
    try {
      await downloadBoardJpeg({ slug, id, label });
    } catch {
      setDownloadFailed(true);
    } finally {
      setBusy(false);
    }
  }

  const total = pages?.length ?? 0;

  return (
    // z-[60], above the z-50 corner buttons, the same layer AddSheet and
    // ChatPanel use.
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      className="fixed inset-0 z-[60] flex flex-col bg-[var(--card-page-bg)]"
    >
      <div className="flex items-center justify-between gap-2 border-b border-[var(--card-line)] px-4 py-3">
        <button type="button" onClick={onClose} className={controlClass}>
          {labels.close}
        </button>

        <h2 className="truncate font-[family-name:var(--card-font-serif)] text-base font-semibold text-[var(--card-ink)]">
          {label}
        </h2>

        <div className="flex items-center gap-2">
          {downloadFailed && (
            <span className="text-xs text-[var(--card-rouge)]">
              {strings.downloadFailed}
            </span>
          )}
          <button
            type="button"
            onClick={() => void download()}
            disabled={busy}
            className={controlClass}
          >
            {busy ? "…" : strings.download}
          </button>
        </div>
      </div>

      <div
        ref={frameRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        // touch-action: none, so the browser does not claim the gesture for
        // its own scroll before the handlers above see it.
        className="relative flex-1 touch-none overflow-hidden"
      >
        {failed ? (
          <p className="absolute inset-0 flex items-center justify-center px-6 text-center font-[family-name:var(--card-font-serif)] italic text-[var(--card-moss)]">
            {labels.loadFailed}
          </p>
        ) : (
          <canvas
            ref={canvasRef}
            aria-label={labels.position(page + 1, Math.max(total, 1))}
            role="img"
            style={{
              width: `${drawnWidth}px`,
              height: `${drawnHeight}px`,
              transform: `translate(${placed.x}px, ${placed.y}px)`,
            }}
            className="absolute left-0 top-0 origin-top-left"
          />
        )}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-[var(--card-line)] px-4 py-3">
        <div className="flex items-center gap-2">
          {total > 1 && (
            <>
              <button
                type="button"
                onClick={() => setPage((current) => Math.max(0, current - 1))}
                disabled={page === 0}
                aria-label={labels.previous}
                className={controlClass}
              >
                ‹
              </button>
              <span className="font-[family-name:var(--card-font-serif)] text-sm text-[var(--card-moss)]">
                {labels.position(page + 1, total)}
              </span>
              <button
                type="button"
                onClick={() =>
                  setPage((current) => Math.min(total - 1, current + 1))
                }
                disabled={page >= total - 1}
                aria-label={labels.next}
                className={controlClass}
              >
                ›
              </button>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => zoomBy(1 / ZOOM_STEP)}
            disabled={scale <= MIN_SCALE}
            aria-label={labels.zoomOut}
            className={controlClass}
          >
            −
          </button>
          <button
            type="button"
            onClick={() => {
              setScale(MIN_SCALE);
              setOffset({ x: 0, y: 0 });
            }}
            aria-label={labels.resetZoom}
            className={controlClass}
          >
            {Math.round(scale * 100)}%
          </button>
          <button
            type="button"
            onClick={() => zoomBy(ZOOM_STEP)}
            disabled={scale >= MAX_SCALE}
            aria-label={labels.zoomIn}
            className={controlClass}
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Open it from the tile**

Rewrite `components/whiteboard/BoardTile.tsx`'s body. Add these imports:

```ts
import { BoardViewer } from "@/components/whiteboard/BoardViewer";
import { getStrings } from "@/lib/strings";
import type { Locale } from "@/lib/i18n";
import { cardFocusRing } from "@/components/card-styles";
import { cn } from "@/lib/utils";
```

Add `locale` to the props type and the destructured list:

```ts
  locale: Locale;
```

Add beside the existing state:

```ts
  const [open, setOpen] = useState(false);
  const strings = getStrings(locale).student.board;
```

Replace the `<img …/>` with a button wrapping it:

```tsx
      {/* The picture is the control. A tile whose thumbnail does nothing while
          a small button beside it does everything is a tile that has to be
          read before it can be used. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={strings.viewer.open(label)}
        className={cn("block w-full", cardFocusRing)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- a data URL has
            nothing for next/image to optimise, and it is already tiny. */}
        <img
          src={thumbnail}
          alt=""
          width={BOARD_WIDTH}
          height={BOARD_HEIGHT}
          className="block w-full bg-[var(--card-paper-back)]"
        />
      </button>
```

`alt=""` because the button beside it now carries the accessible name, and announcing the label twice is noise.

Replace the three hardcoded strings in the footer: `"Échec"` becomes `{strings.downloadFailed}`, `busy ? "…" : "Télécharger"` becomes `busy ? "…" : strings.download`, `Supprimer` becomes `{strings.delete}`, and the page count line becomes:

```tsx
          <div className="text-[var(--card-moss)]">
            {strings.pageCount(pageCount)}
          </div>
```

Finally, render the viewer at the end of the component, just inside the outermost `</div>`:

```tsx
      {open && (
        <BoardViewer
          slug={slug}
          id={id}
          label={label}
          locale={locale}
          onClose={() => setOpen(false)}
        />
      )}
```

- [ ] **Step 3: Thread the locale through `BoardTab`**

In `components/whiteboard/BoardTab.tsx`, add:

```ts
import { getStrings } from "@/lib/strings";
import type { Locale } from "@/lib/i18n";
```

Add `locale` to the props type and destructured list, then add below the hooks:

```ts
  const strings = getStrings(locale).student.board;
```

Replace the four hardcoded strings: `Nouveau tableau` becomes `{strings.newBoard}`, `Aucun tableau pour l&apos;instant&nbsp;!` becomes `{strings.empty}`, and the live line becomes:

```tsx
        <p className="mt-3 text-center font-[family-name:var(--card-font-serif)] text-sm italic text-[var(--card-moss)]">
          {strings.drawingPage(board.currentPage + 1)}
        </p>
```

Pass `locale={locale}` to `<BoardTile …>`.

`BoardEditor` is rendered from here and takes no locale. Leave it. It is the drawing surface and is out of scope — see the File Structure note.

- [ ] **Step 4: Thread the locale through `LiveBanner`**

In `components/whiteboard/LiveBanner.tsx`, add the same two imports, add `locale: Locale` to the props, and replace the two strings with `{strings.liveNow}` and `{strings.openLive}`, where `strings` is `getStrings(locale).student.board`.

- [ ] **Step 5: Pass the locale from the page**

In `app/g/[slug]/page.tsx`:

- Replace `const labels = boardLabels(boards);` with `const labels = boardLabels(boards, locale);`
- Replace `<LiveBanner slug={slug} />` with `<LiveBanner slug={slug} locale={locale} />`
- Add `locale={locale}` to `<BoardTab …>`, beside its existing `slug` prop.

`locale` is already read at the top of this file and threaded to several other components, so nothing new is fetched.

- [ ] **Step 6: Check that it compiles and the suite still passes**

```bash
npx prisma generate && npm run lint && npm run typecheck && npm test
```

Expected: clean, apart from the pre-existing `snapshot-dom.ts:77` warning.

- [ ] **Step 7: Check the behaviour by hand**

With `npm run dev`, sign in as the teacher, open a student with at least one saved multi-page board, and go to `?tab=board`:

- Press a tile's picture. The viewer opens full screen.
- The strokes are crisp. Press `+` twice and they stay crisp rather than blurring.
- Drag the board. It pans, and it will not go off screen — release at the edge and the board stays visible.
- Press the percentage button. It returns to 100% and re-centres.
- The page arrows move between pages, and the counter agrees.
- Press *Télécharger* inside the viewer. The same stacked JPEG downloads.
- Press Escape. The viewer closes.
- On a narrow window, confirm the shelf `+` and the chat bubble are hidden while the viewer is open.
- Set the browser to English and reload. The tab, the tile and the viewer read English, and the board's date label reads *June 3, 2026* rather than *3 juin 2026*.

- [ ] **Step 8: Commit**

```bash
git add components/whiteboard/BoardViewer.tsx components/whiteboard/BoardTile.tsx components/whiteboard/BoardTab.tsx components/whiteboard/LiveBanner.tsx "app/g/[slug]/page.tsx"
git commit -m "$(cat <<'EOF'
Open a saved whiteboard in place instead of only downloading it

The tile showed a thumbnail of page 1 and a download button, so reading
a board meant leaving the page and opening a file. It opens in a viewer
now, with drag to pan, wheel and pinch to zoom, and page arrows.

It REDRAWS THE OPS rather than magnifying a picture. A board is vectors,
and exportLayout already downscales a long one to clear iOS Safari's
canvas limit — so zooming into that image would show the downscale.
Redrawing means zooming in gets sharper, and the same cap is enforced on
the backing store through rasterScale.

No new route and no new access rule: the ops come from the endpoint the
download already used, which chatRole already guards.

The archive's own words now come from the dictionary. The drawing
surface stays French and is a separate pass.

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: Record the reasoning, and verify the whole thing

This codebase keeps its rationale in `CLAUDE.md` and `.claude/rules/`. A decision that is not written down there is one the next edit undoes. Three of the four changes here removed or hid something, which is exactly the kind of change that gets "fixed" back later by someone who reads it as an omission.

**Files:**
- Modify: `CLAUDE.md`
- Modify: `.claude/rules/whiteboards.md`
- Modify: `.claude/rules/files-pages-pdfs.md`

- [ ] **Step 1: Record the everyone-group rule in `CLAUDE.md`**

In the routes table, in the `/admin` row, replace the note `three tabs via ?tab= — the global card for ?date= (default), groups, pages` with:

```
three tabs via `?tab=` — the global card for `?date=` (default), groups, pages. **The everyone group is not drawn as a student on any of them** as of 2026-08-07: no row in Students, no chip on Pages. It keeps one pill in the three audience forms, labelled *All students* from the dictionary rather than from `Group.name` — see `lib/audience.ts`. The consequence is that the admin has no link to `/g/all`; shared pages are found under any student's chip, which `filterPagesByGroup` already widens for exactly that reason
```

- [ ] **Step 2: Record the shelf disclosure in `CLAUDE.md`**

In the `/g/[slug]` row of the routes table, after the sentence about the card tab's day dots, add:

```
The shelf's kind and sort chips sit behind a filter icon, closed by default, with a dot on the icon while a hidden filter is narrowing the list (`lib/shelf-filters.ts`) — the admin Pages tab deliberately keeps its rows visible, because its student chip also decides pin target and default audience
```

- [ ] **Step 3: Record the board viewer in `.claude/rules/whiteboards.md`**

Find the paragraph beginning `Downloading gives **one** JPEG with every page stacked` and insert this before it:

```markdown
**A saved board is readable in place** (2026-08-07). `BoardViewer` opens over
the archive at `z-[60]`, calls `useOverlayLock` like every other overlay, and
reads the ops from the endpoint the download already used — no new route, no
new access check, since `chatRole` guards it for both parties and a saved board
is immutable enough to keep its `private, max-age=3600`.

**It redraws the ops; it does not magnify a picture.** That is the point.
`exportLayout` downscales a long board to clear `MAX_CANVAS_AREA`, so an `<img>`
of the download's output would zoom into the downscale rather than into the
drawing. `lib/board-zoom.ts` holds the three rules — `fitScale`, `clampScale`,
`clampPan` — plus `rasterScale`, which enforces **the same** `MAX_CANVAS_AREA`
on the viewer's backing store by importing it rather than repeating it. Scale is
a multiplier of the fit, so `1` means "the whole page is visible" at every window
size, and there is no zoom-out below it. `clampPan` centres content smaller than
the viewport and otherwise refuses to let either edge come inside it: a drag that
pushed the board off screen would leave an empty rectangle with nothing on it to
explain how to get back.

Two implementation details are load-bearing. The wheel listener is attached
natively with `{ passive: false }` and **not** as an `onWheel` prop, because
React attaches wheel at the root as passive — a JSX handler's `preventDefault`
is ignored and logs an error, and the page behind scrolls while the board zooms.
And pointers are tracked in a **Map** rather than two nullable refs, because the
second finger of a pinch can lift first.

**The archive is localised and the drawing surface is not.** `BoardTab`,
`BoardTile`, `LiveBanner`, `BoardViewer` and `boardLabels` all read the
dictionary; `BoardEditor`, `BoardToolbar`, `LeaveBoardDialog` and
`TextStylePopover` are still hardcoded French. That is a deliberate line, not a
half-finished job: the editor is teacher-only, reachable only by pressing
*Nouveau tableau*, and touching it means touching the leave-guard and the
text-draft commit. `boardLabels`' locale argument is **optional and defaults to
French**, which is the site's fallback everywhere else and is what keeps its
existing tests calling it with one argument.
```

- [ ] **Step 4: Record the two shelf and admin rules in `.claude/rules/files-pages-pdfs.md`**

Find the paragraph beginning `One group is flagged `isEveryone`` and insert after it:

```markdown
**That row is no longer drawn as a student** (2026-08-07). `lib/audience.ts`
withholds it from the Students tab (`visibleStudents`) and from the Pages tab's
chip row (`visibleGroupChips`), and relabels it in the three audience forms
(`audienceOptions`) as *All students*, from the dictionary rather than from
`Group.name`. It stays in those forms because sharing one page with every
student is a real feature and that row is the mechanism behind it — removing the
pill would end it.

**No access rule moved.** `chatRole`, `shelfRole`, `studentGate`,
`worksheetOpenable` and `canDeleteGroup` all still read the flag and all keep
their present answers. This withholds controls and grants nothing.

The accepted cost is that the admin has no link to `/g/all` any more. Shared
pages stay findable because `filterPagesByGroup` widens a student's chip to
include them — a rule that already existed and now carries more weight, not
less. `visibleGroupChips` matches on a NAME, so an ordinary student named
"Everyone" would lose their chip; that collision already exists inside
`filterPagesByGroup`, which compares the same two strings, and `Group.name` is
not unique. If it ever needs fixing, fix both.
```

Then find the paragraph beginning `Both page lists — the student's shelf and the admin Pages tab — render` and insert before it:

```markdown
**The student shelf's chips are behind a filter icon** and the admin Pages tab's
are not. `FilterDisclosure` (`components/ui/FilterDisclosure.tsx`) closes the
kind and sort rows by default, because a search field and two chip rows above
the tiles was most of a phone's first screen. The icon carries a dot while
`filtersAreActive` (`lib/shelf-filters.ts`) answers true — without it a filtered
list is a short list with no visible cause, which reads as a fault. The panel is
`hidden` rather than unmounted so `aria-controls` always names an element that
exists.

The admin is the stated exception. Its chip row is not only a filter: the same
selection decides which shelf a pin lands on and the default audience for a new
page, so folding it away would hide a control that does more than narrow a list.
The two lists are meant to look alike, and this is the place that rule bends.
```

Finally, find the paragraph beginning `**Editing happens in an overlay, on both screens.**` and add at its end:

```markdown
As of 2026-08-07 a **clean save closes it**: `PageEditor` takes an optional
`onSaved`, the overlay passes its own close, and `/admin/pages/[slug]` passes
nothing because a page has nothing to dismiss and its *Saved* flag is the whole
feedback there. A save that skipped assets keeps the sheet open, matching
`NewPageForm` — that list exists only in the reply to that one request, so
closing over it is the warning nobody sees.
```

- [ ] **Step 5: Correct one stale comment in `lib/pages.ts`**

The spec calls for this and it is easy to miss. `sharedWithEveryone` claims to drive two things and drives one — `PageList` renders no everyone marker and never has. A comment promising a feature that does not exist is worse now that the chip is gone, because the next reader will go looking for the marker.

Replace:

```ts
    // Drives both the tile's marker and the filter: a page shared with
    // everyone is on every student's shelf, so it must survive a filter for
    // any one of them.
```

with:

```ts
    // Drives the FILTER, and only the filter: a page shared with everyone is
    // on every student's shelf, so it must survive a filter for any one of
    // them. That matters more since 2026-08-07, when the everyone chip was
    // removed — widening a student's chip is now the only way Jenn finds a
    // shared page.
    //
    // It used to say it also drove "the tile's marker". PageList renders no
    // such marker and never did.
```

- [ ] **Step 6: Run the full CI order, including the build**

```bash
npx prisma generate && npm run lint && npm run typecheck && npm test && npm run build
```

Expected:
- `prisma generate` succeeds.
- `eslint .` reports exactly one warning: `lib/snapshot-dom.ts:77 'e' is defined but never used`. That one is pre-existing. **Any other warning or any error is yours.**
- `tsc --noEmit` prints nothing.
- Vitest passes every file. The count is 1061 plus the new tests — 12 for `audience`, 6 for `shelf-filters`, 21 for `board-zoom`, 2 added to `whiteboard-names`.
- `next build` completes. **It fetches Fraunces and Inter from `fonts.googleapis.com`**, so it needs network access; a sandbox that blocks that host fails the build with `Failed to fetch 'Fraunces' from Google Fonts`, which is not a code fault.

- [ ] **Step 7: Commit**

```bash
git add CLAUDE.md .claude/rules/whiteboards.md .claude/rules/files-pages-pdfs.md lib/pages.ts
git commit -m "$(cat <<'EOF'
Record why the everyone group, the shelf chips and the board changed

Three of these four changes hid or removed something, which is the kind
of change a later reader restores as an oversight. Each now says what it
withholds, what it deliberately does not touch, and what it cost.

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 8: Final check of the whole branch**

```bash
git log --oneline main..HEAD
git diff --stat main..HEAD
```

Expected: eleven commits, one per task that changed code. No file outside the File Structure table above should appear in the diff.

---

## Done means

- `npm run lint`, `npm run typecheck`, `npm test` and `npm run build` all pass, with only the one pre-existing lint warning.
- The Students tab and the Pages tab chips show no everyone row, and the three audience forms show one pill reading *All students* / *Tous les élèves*.
- A student shelf opens with a search field and a filter icon, and the icon carries a dot while a hidden filter is narrowing the list.
- Pressing a board's picture opens a viewer that pans, zooms sharply, pages, downloads and closes on Escape.
- Editing a page from either list closes the overlay on a clean save and stays open when assets were skipped.

Flashcards and Action items are **not** part of this plan. Each gets its own spec and its own plan.
