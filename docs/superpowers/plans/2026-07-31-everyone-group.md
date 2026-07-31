# Everyone Group and Page Inheritance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A page assigned to the everyone group appears on every student's shelf without being assigned to any of them, and that group can never be deleted.

**Architecture:** One boolean column, `Group.isEveryone`, seeded true on the existing `all` row. Two pure functions in `lib/` carry the rules — `effectivePages` merges a student's own pages with the everyone group's, and `canDeleteGroup` is the guard. `listPagesForGroup` folds inheritance in so callers never know it happened; the admin marks inherited tiles so Jenn can see why a page is on a shelf she did not put it on.

**Tech Stack:** Next.js App Router (server components + `"use client"` islands), Prisma/SQLite, Tailwind v4 with CSS custom properties, Vitest.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-07-31-student-chat-design.md`. Read it before starting. This plan is **Part 1 only** — the everyone group and page inheritance. Chat, tokens, the student tab strip, `/f/[token]` and `Message` are **Part 2 and out of scope**. Do not add them.
- **Logic belongs in `lib/`.** Anything with a rule in it is a pure function in `lib/` with a test in `tests/lib/`. Components and Prisma access are not unit-tested.
- **Comments explain the "why", especially the counter-intuitive.** Never add comments that restate the code. Every comment shown in this plan is part of the deliverable — reproduce it.
- **Imports** use the `@/` alias for repo-root-relative paths.
- **Admin copy is English.** French is the students' side of the site.
- **Server actions** call `revalidatePath` for the page they affect, and deletes use `deleteMany` so a double-click is a no-op rather than a P2025.
- **The everyone group on production is `slug = "all"`, `name = "Everyone"`**, and it is the only group row that exists there. Do not rename it; students bookmark `/g/all`.
- **Never touch** `app/p/[slug]/raw/route.ts` or its CSP.
- **After any `prisma/schema.prisma` change**, run `npx prisma generate`, and create the migration with `npx prisma migrate dev --name <name>` so the migration file is committed. A schema change without its migration passes CI and fails on the server.
- **Local checks:** `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`. CI runs `prisma generate` then those four in that order.

---

### Task 1: The everyone-group rules

**Files:**
- Create: `lib/everyone.ts`
- Test: `tests/lib/everyone.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `EVERYONE_SLUG: "all"`, `EVERYONE_NAME: "Everyone"`, and `canDeleteGroup(group: { isEveryone: boolean }): boolean`.

`canDeleteGroup` is a predicate rather than an inline `if` in the action because it is the one rule in this feature whose failure is silent and wide: deleting that row empties every student's shelf at once, and nothing would report an error.

- [ ] **Step 1: Write the failing test**

Create `tests/lib/everyone.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { EVERYONE_SLUG, EVERYONE_NAME, canDeleteGroup } from "@/lib/everyone";

describe("the everyone group's identity", () => {
  it("is the slug students already have bookmarked", () => {
    expect(EVERYONE_SLUG).toBe("all");
  });

  it("is named the way the production row is named", () => {
    expect(EVERYONE_NAME).toBe("Everyone");
  });
});

describe("canDeleteGroup", () => {
  it("allows deleting an ordinary student", () => {
    expect(canDeleteGroup({ isEveryone: false })).toBe(true);
  });

  it("refuses the everyone group", () => {
    expect(canDeleteGroup({ isEveryone: true })).toBe(false);
  });

  it("reads only the flag, so a group named 'all' is still deletable", () => {
    expect(canDeleteGroup({ isEveryone: false, slug: "all" })).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/lib/everyone.test.ts`
Expected: FAIL — cannot resolve `@/lib/everyone`.

- [ ] **Step 3: Write the implementation**

Create `lib/everyone.ts`:

```ts
// The row that already exists in production. Read by the migration's seed and
// by its create-if-absent fallback, and nowhere else — every rule keys off the
// flag below, not off this string.
export const EVERYONE_SLUG = "all";
export const EVERYONE_NAME = "Everyone";

// A predicate rather than an inline check in deleteGroup, because this is the
// one rule here whose failure is silent and wide: that row is what assembles
// every student's shelf, so removing it empties all of them at once and
// nothing reports an error.
export function canDeleteGroup(group: { isEveryone: boolean }): boolean {
  return !group.isEveryone;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/lib/everyone.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/everyone.ts tests/lib/everyone.test.ts
git commit -m "feat: name the everyone group and guard its deletion"
```

---

### Task 2: Merging a student's shelf

**Files:**
- Create: `lib/effective-pages.ts`
- Test: `tests/lib/effective-pages.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `effectivePages<T extends { id: string; createdAt: Date }>(own: T[], everyone: T[]): T[]`.

The generic matters: callers pass their own richer row types and must get the same type back.

- [ ] **Step 1: Write the failing test**

Create `tests/lib/effective-pages.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { effectivePages } from "@/lib/effective-pages";

const page = (id: string, iso: string) => ({
  id,
  createdAt: new Date(`${iso}T00:00:00Z`),
});

describe("effectivePages", () => {
  it("returns the student's own pages when nothing is shared with everyone", () => {
    expect(effectivePages([page("a", "2026-07-30")], []).map((p) => p.id)).toEqual([
      "a",
    ]);
  });

  it("returns the everyone pages when the student has none of their own", () => {
    expect(effectivePages([], [page("e", "2026-07-30")]).map((p) => p.id)).toEqual([
      "e",
    ]);
  });

  it("merges both, newest first", () => {
    const own = [page("a", "2026-07-28")];
    const everyone = [page("e", "2026-07-30")];
    expect(effectivePages(own, everyone).map((p) => p.id)).toEqual(["e", "a"]);
  });

  it("lists a page assigned both directly and to everyone only once", () => {
    const shared = page("a", "2026-07-30");
    expect(effectivePages([shared], [shared])).toHaveLength(1);
  });

  it("keeps the caller's own fields on the rows it returns", () => {
    const own = [{ ...page("a", "2026-07-30"), title: "Les nombres" }];
    expect(effectivePages(own, [])[0].title).toBe("Les nombres");
  });

  it("returns an empty list when both sides are empty", () => {
    expect(effectivePages([], [])).toEqual([]);
  });

  it("does not mutate either input", () => {
    const own = [page("a", "2026-07-28")];
    const everyone = [page("e", "2026-07-30")];
    effectivePages(own, everyone);
    expect(own.map((p) => p.id)).toEqual(["a"]);
    expect(everyone.map((p) => p.id)).toEqual(["e"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/lib/effective-pages.test.ts`
Expected: FAIL — cannot resolve `@/lib/effective-pages`.

- [ ] **Step 3: Write the implementation**

Create `lib/effective-pages.ts`:

```ts
// A student's shelf is their own pages plus the everyone group's, sorted into
// one list rather than two stacked ones — from the student's side there is no
// such thing as "inherited", there is only what they have.
export function effectivePages<T extends { id: string; createdAt: Date }>(
  own: T[],
  everyone: T[],
): T[] {
  const byId = new Map<string, T>();
  // Own first, so a page assigned both directly and to everyone keeps the row
  // the student's own query returned.
  for (const page of [...own, ...everyone]) {
    if (!byId.has(page.id)) byId.set(page.id, page);
  }

  return [...byId.values()].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/lib/effective-pages.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/effective-pages.ts tests/lib/effective-pages.test.ts
git commit -m "feat: merge a student's own pages with the everyone group's"
```

---

### Task 3: The `isEveryone` column and its migration

**Files:**
- Modify: `prisma/schema.prisma` (the `Group` model)
- Create: `prisma/migrations/<generated>_add_everyone_group/migration.sql`

**Interfaces:**
- Consumes: `EVERYONE_SLUG`, `EVERYONE_NAME` (Task 1) — as literals in the SQL, which cannot import them.
- Produces: `Group.isEveryone: boolean`, default false.

This task ends with a hand-edited migration. Prisma generates the `ALTER TABLE`; the seed statements are added by hand, because Prisma never writes data migrations.

- [ ] **Step 1: Add the column to the schema**

In `prisma/schema.prisma`, add to `model Group`, after `slug`:

```prisma
  // True on exactly one row — the group every student inherits pages from.
  // A flag rather than a slug comparison because several rules key off it, and
  // a string compare scattered across files is a chance to forget one.
  isEveryone Boolean  @default(false)
```

- [ ] **Step 2: Generate the migration**

Run: `npx prisma migrate dev --name add_everyone_group`

This creates `prisma/migrations/<timestamp>_add_everyone_group/migration.sql` containing the `ALTER TABLE`, and applies it to your local `dev.db`.

- [ ] **Step 3: Add the seed by hand**

Open the generated `migration.sql` and append:

```sql
-- The everyone group already exists in production as the only group row.
-- Flag it rather than creating a second one.
UPDATE "Group" SET "isEveryone" = true WHERE "slug" = 'all';

-- A rebuilt box has no rows at all, and a missing everyone group is a silent
-- failure: every student's shelf would simply be short. Create it if the
-- UPDATE above matched nothing.
INSERT INTO "Group" ("id", "name", "slug", "isEveryone", "createdAt")
SELECT 'everyone-seeded', 'Everyone', 'all', true, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "Group" WHERE "isEveryone" = true);
```

- [ ] **Step 4: Verify both seed branches on a throwaway database**

Step 2 applied the migration before the seed existed, so `dev.db` has the column but no flagged row, and Prisma will not re-run a migration it has recorded.

**Do not run `prisma migrate reset`.** The local `dev.db` holds the only passkey for local `/admin`, and resetting it means re-registering one by hand. Verify on a copy instead.

Exercise the create-if-absent branch against an empty database:

```bash
rm -f /tmp/seed-check.db
DATABASE_URL="file:/tmp/seed-check.db" npx prisma migrate deploy
sqlite3 /tmp/seed-check.db 'SELECT slug, name, isEveryone FROM "Group";'
```

Expected: exactly one row — `all|Everyone|1`. That proves the `INSERT` fires on a rebuilt box.

Then exercise the update branch, which is what production will take, on a copy of your real database taken *before* this migration:

```bash
rm -f /tmp/update-check.db
sqlite3 prisma/dev.db ".backup /tmp/update-check.db"
sqlite3 /tmp/update-check.db 'UPDATE "Group" SET "isEveryone" = 0;'
sqlite3 /tmp/update-check.db 'UPDATE "Group" SET "isEveryone" = 1 WHERE "slug" = '"'"'all'"'"';'
sqlite3 /tmp/update-check.db 'SELECT slug, isEveryone FROM "Group";'
```

Expected: the `all` row at 1 and every other group at 0 — one flagged row, no duplicate created.

Finally bring your own `dev.db` to the same state the migration would have left it in, by running the seed statements against it directly. They are idempotent:

```bash
sqlite3 prisma/dev.db 'UPDATE "Group" SET "isEveryone" = 1 WHERE "slug" = '"'"'all'"'"';'
sqlite3 prisma/dev.db 'SELECT slug, name, isEveryone FROM "Group";'
```

Expected: your existing groups intact, with `all` flagged. Clean up: `rm -f /tmp/seed-check.db /tmp/update-check.db`.

- [ ] **Step 5: Verify**

Run: `npx prisma generate && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: flag the everyone group in the schema"
```

---

### Task 4: Inheritance in the queries

**Files:**
- Modify: `lib/pages.ts` — `listPagesForGroup`, `listPagesForAdmin`

**Interfaces:**
- Consumes: `effectivePages` (Task 2), `Group.isEveryone` (Task 3).
- Produces:
  - `listPagesForGroup(groupId)` returns the merged shelf: `{ slug, title, createdAt }[]`, unchanged in shape.
  - `listPagesForAdmin()` gains `sharedWithEveryone: boolean` on each row.

`listPagesForGroup` keeps its exact signature and return shape. Its one caller — the student pages route — must not learn that inheritance exists.

- [ ] **Step 1: Rewrite `listPagesForGroup`**

Replace it in `lib/pages.ts`:

```ts
export async function listPagesForGroup(groupId: string) {
  // Two queries rather than one OR: the everyone group's pages are the same
  // set for every student, and keeping them separate is what lets
  // effectivePages own the merge rule and be tested without a database.
  const [own, everyone] = await Promise.all([
    prisma.page.findMany({
      where: { groups: { some: { groupId } } },
      orderBy: { createdAt: "desc" },
      select: { id: true, slug: true, title: true, createdAt: true },
    }),
    prisma.page.findMany({
      where: { groups: { some: { group: { isEveryone: true } } } },
      orderBy: { createdAt: "desc" },
      select: { id: true, slug: true, title: true, createdAt: true },
    }),
  ]);

  return effectivePages(own, everyone);
}
```

Note `id` is now selected — `effectivePages` de-duplicates on it. The route that renders this list keys on `slug`, so the extra field is harmless.

Add to the imports at the top of `lib/pages.ts`:

```ts
import { effectivePages } from "@/lib/effective-pages";
```

- [ ] **Step 2: Add `sharedWithEveryone` to the admin list**

In `listPagesForAdmin`, add `isEveryone` to the selected group fields and derive the flag. Replace the function body:

```ts
export async function listPagesForAdmin() {
  const pages = await prisma.page.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      slug: true,
      title: true,
      createdAt: true,
      groups: {
        select: {
          group: { select: { id: true, name: true, isEveryone: true } },
        },
      },
    },
  });

  return pages.map((page) => ({
    id: page.id,
    slug: page.slug,
    title: page.title,
    createdAt: page.createdAt,
    groupIds: page.groups.map((g) => g.group.id),
    groupNames: page.groups.map((g) => g.group.name),
    // Drives both the tile's marker and the filter: a page shared with
    // everyone is on every student's shelf, so it must survive a filter for
    // any one of them.
    sharedWithEveryone: page.groups.some((g) => g.group.isEveryone),
  }));
}
```

- [ ] **Step 3: Verify**

Run: `npm run lint && npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add lib/pages.ts
git commit -m "feat: fold the everyone group's pages into every student's shelf"
```

---

### Task 5: The admin filter respects inheritance

**Files:**
- Modify: `lib/admin-search.ts` — `filterPagesByGroup`, `pageGroupNames`
- Modify: `tests/lib/admin-search.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `filterPagesByGroup<T extends SearchablePage & { sharedWithEveryone?: boolean }>(pages, groupName, everyoneName?)`.

Filtering the Pages tab by Marie must show Marie's effective shelf, because the chip answers "what does Marie have?" — the question Jenn is asking when she clicks it. A page shared with everyone is on Marie's shelf, so it survives Marie's filter.

Selecting the everyone chip itself shows only the everyone pages, not all pages — otherwise that chip would be indistinguishable from "All".

- [ ] **Step 1: Write the failing tests**

Append to `tests/lib/admin-search.test.ts`:

```ts
describe("filterPagesByGroup with an everyone group", () => {
  const shelf = [
    { title: "Marie only", groupNames: ["Marie"], sharedWithEveryone: false },
    { title: "For all", groupNames: ["Everyone"], sharedWithEveryone: true },
    { title: "Luc only", groupNames: ["Luc"], sharedWithEveryone: false },
  ];

  it("includes the everyone pages when filtering by a student", () => {
    expect(
      filterPagesByGroup(shelf, "Marie", "Everyone").map((p) => p.title),
    ).toEqual(["Marie only", "For all"]);
  });

  it("shows only the everyone pages when filtering by the everyone group", () => {
    expect(
      filterPagesByGroup(shelf, "Everyone", "Everyone").map((p) => p.title),
    ).toEqual(["For all"]);
  });

  it("still returns everything when no group is chosen", () => {
    expect(filterPagesByGroup(shelf, null, "Everyone")).toHaveLength(3);
  });

  it("does not double-list a page that is both direct and shared", () => {
    const both = [
      { title: "Both", groupNames: ["Marie", "Everyone"], sharedWithEveryone: true },
    ];
    expect(filterPagesByGroup(both, "Marie", "Everyone")).toHaveLength(1);
  });

  it("behaves as before when no everyone group name is given", () => {
    expect(filterPagesByGroup(shelf, "Marie").map((p) => p.title)).toEqual([
      "Marie only",
    ]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/lib/admin-search.test.ts`
Expected: FAIL — the first two cases return the wrong rows.

- [ ] **Step 3: Widen `filterPagesByGroup`**

Replace it in `lib/admin-search.ts`:

```ts
// Exact match, deliberately not the accent-insensitive compare the search box
// uses: this name arrived from a chip built out of the data, not from someone
// typing it, so a near-miss here would mean the chip list is wrong.
//
// `everyoneName` widens a student's filter to their effective shelf. Filtering
// by Marie answers "what does Marie have?", and a page shared with everyone is
// something Marie has. Selecting the everyone chip itself stays narrow, or it
// would be indistinguishable from All.
export function filterPagesByGroup<
  T extends SearchablePage & { sharedWithEveryone?: boolean },
>(pages: T[], groupName: string | null, everyoneName?: string): T[] {
  if (groupName === null) return pages;

  const inheriting = everyoneName !== undefined && groupName !== everyoneName;

  return pages.filter(
    (page) =>
      page.groupNames.includes(groupName) ||
      (inheriting && page.sharedWithEveryone === true),
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/lib/admin-search.test.ts`
Expected: PASS, 28 tests (23 existing plus 5 new).

- [ ] **Step 5: Commit**

```bash
git add lib/admin-search.ts tests/lib/admin-search.test.ts
git commit -m "feat: filter the admin pages list by a student's effective shelf"
```

---

### Task 6: The admin surfaces it

**Files:**
- Modify: `components/admin/PageList.tsx` — `PageSummary`, the eyebrow, the filter call
- Modify: `components/admin/GroupList.tsx` — `GroupSummary`, hide delete on the everyone group
- Modify: `app/admin/page.tsx` — pass `isEveryone` through `GroupsTab`, pass the everyone group's real name to `PageList`

**Interfaces:**
- Consumes: `filterPagesByGroup` with its third argument (Task 5), `sharedWithEveryone` (Task 4), `canDeleteGroup` (Task 1).
- Produces: `PageSummary` gains `sharedWithEveryone: boolean`; `GroupSummary` gains `isEveryone: boolean`; `PageList` gains a required `everyoneName: string | null` prop.

**Do not import `EVERYONE_NAME` for the filter.** The everyone group's *name* is Jenn's to change — production's row is called "Everyone" but the local one is called "all", and she can rename it from the admin at any time. A hardcoded constant compared against `groupNames` would silently stop widening the moment those diverge, and nothing would report it. The name must come from the data.

- [ ] **Step 1: Mark inherited pages and widen the filter**

In `components/admin/PageList.tsx`:

Add `sharedWithEveryone: boolean;` to the `PageSummary` type.

Add an `everyoneName` prop, and pass it to the filter:

```tsx
export function PageList({
  pages,
  everyoneName,
}: {
  pages: PageSummary[];
  // Read from the flagged row rather than from a constant: the name is the
  // teacher's to change, and a stale literal here would silently stop a
  // student's chip widening to their inherited pages.
  everyoneName: string | null;
}) {
```

Change the filter call so a student's chip shows their effective shelf:

```ts
  const visible = filterPagesByGroup(
    filterPages(pages, query),
    group,
    everyoneName ?? undefined,
  );
```

And change the `Tile`'s `eyebrow` so an inherited page says why it is there:

```tsx
                eyebrow={`${formatLongDate(page.createdAt)} · ${
                  page.sharedWithEveryone
                    ? "shared with everyone"
                    : page.groupNames.length === 0
                      ? "no groups"
                      : page.groupNames.join(", ")
                }`}
```

- [ ] **Step 2: Refuse to offer delete on the everyone group**

In `components/admin/GroupList.tsx`:

Add `isEveryone: boolean;` to the `GroupSummary` type.

Add the import:

```ts
import { canDeleteGroup } from "@/lib/everyone";
```

Then make the `action` slot conditional — the everyone group gets a label instead of a button, because a delete control that always refuses is worse than none:

```tsx
                action={
                  canDeleteGroup(group) ? (
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
                  ) : (
                    <span className="text-sm text-[var(--color-ink-muted)]">
                      everyone
                    </span>
                  )
                }
```

- [ ] **Step 3: Pass the new fields from the page**

In `app/admin/page.tsx`, in `GroupsTab`, add `isEveryone` to the mapped groups:

```tsx
        groups={groups.map((g) => ({
          id: g.id,
          name: g.name,
          slug: g.slug,
          cardCount: g._count.cards,
          isEveryone: g.isEveryone,
        }))}
```

`prisma.group.findMany` with `include: { _count: … }` already returns every scalar column, so `isEveryone` is present with no query change.

Then in `PagesTab`, feed `PageList` the everyone group's real name. The tab already queries groups for the editor's assignment pills, so add `isEveryone` to that `select` and find the flagged row:

```tsx
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
```

and pass it: `<PageList pages={pages} everyoneName={everyoneName} />`.

`PageEditor` takes `{ id, name }[]`; the extra `isEveryone` field on those objects is structurally compatible and needs no change there.

- [ ] **Step 4: Verify**

Run: `npm run lint && npm run typecheck && npm test && npm run build`
Expected: PASS. `npm test` should report 28 tests in `admin-search`, plus the new `everyone` (5) and `effective-pages` (7) files.

- [ ] **Step 5: Look at it**

Run `npm run dev`, open `/admin?tab=groups` and confirm the `Everyone` tile shows the word `everyone` where the others show `Delete`. Then open `/admin?tab=pages`, share a page with `Everyone`, and confirm its tile reads `shared with everyone` and that it survives filtering by any student chip.

- [ ] **Step 6: Commit**

```bash
git add components/admin/PageList.tsx components/admin/GroupList.tsx app/admin/page.tsx
git commit -m "feat: mark inherited pages and protect the everyone group in admin"
```

---

### Task 7: The server-side guard

**Files:**
- Modify: `app/actions.ts` — `deleteGroup` (line 88)

**Interfaces:**
- Consumes: `canDeleteGroup` (Task 1).
- Produces: nothing new.

Task 6 hid the button. This is the rule. A hidden control is not a guard — the action is reachable from a stale tab, and it is the only thing standing between a mis-click and every student's shelf.

- [ ] **Step 1: Guard the action**

In `app/actions.ts`, replace `deleteGroup`:

```ts
export async function deleteGroup(groupId: string) {
  await requireTeacher();

  // Checked here rather than only in the UI: hiding a button is not a guard.
  // This action is still reachable from a stale tab, and deleting this row
  // would empty every student's shelf at once with nothing reporting an error.
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: { isEveryone: true },
  });
  if (group && !canDeleteGroup(group)) {
    throw new Error("The everyone group can't be deleted.");
  }

  await prisma.$transaction([
    prisma.card.deleteMany({ where: { groupId } }),
    prisma.group.deleteMany({ where: { id: groupId } }),
  ]);

  revalidatePath("/admin");
}
```

The `group &&` matters: a group already gone is not an error here, matching the `deleteMany` convention that makes a double-click a no-op.

Add to the imports at the top of `app/actions.ts`:

```ts
import { canDeleteGroup } from "@/lib/everyone";
```

- [ ] **Step 2: Verify**

Run: `npm run lint && npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/actions.ts
git commit -m "fix: refuse to delete the everyone group server-side"
```

---

### Task 8: Documentation and the full check

**Files:**
- Modify: `CLAUDE.md` — the Uploaded pages section, and the routes table's `/g/[slug]/pages` row

**Interfaces:**
- Consumes: everything above.
- Produces: nothing.

- [ ] **Step 1: Record the everyone group**

In `CLAUDE.md`, at the end of the **Uploaded pages** section, add:

```markdown
One group is flagged `isEveryone` — on production it is `all` / "Everyone", the
row students already bookmark as `/g/all`. Every page assigned to it appears on
every student's shelf: `listPagesForGroup` fetches both sets and hands them to
`effectivePages` (`lib/effective-pages.ts`), so callers never learn inheritance
happened. That row cannot be deleted — `canDeleteGroup` is checked in
`deleteGroup` as well as in the UI, because deleting it would empty every
student's shelf at once and nothing would report an error.

In the admin, filtering the Pages tab by a student shows that student's
effective shelf rather than their assignments: the chip answers "what does
Marie have?", and a page shared with everyone is something Marie has.
```

- [ ] **Step 2: Note the inheritance on the routes table**

In the routes table, change the `/g/[slug]/pages` row's Notes cell from

```
that group's uploaded pages (unlinked; shared by URL)
```

to

```
that group's uploaded pages, including everything shared with everyone
```

- [ ] **Step 3: Run the full CI sequence**

In this order, confirming each passes before the next:

```bash
npx prisma generate
npm run lint
npm run typecheck
npm test
npm run build
```

Report the actual test totals. Expect **23 files and 252 tests**: 21 files and 235 tests before this plan, plus two new files carrying 5 (`everyone`) and 7 (`effective-pages`) tests, plus 5 new cases appended to `admin-search`.

If the totals differ, report the real numbers rather than adjusting them to match.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: record the everyone group and page inheritance"
```

---

## Self-review notes

Checked against the spec's Part 1 scope:

- **The everyone group** (`isEveryone`, flag not slug, undeletable, seeded on the existing row, created if absent) → Tasks 1, 3, 6, 7.
- **Page inheritance** (`effectivePages`, `listPagesForGroup` folds it in, callers unaware) → Tasks 2, 4.
- **Admin marking and filtering** (inherited tiles marked, chip shows the effective shelf) → Tasks 5, 6.
- **Documentation** → Task 8.

Deliberately **not** here, per the spec's build order: tokens, `Message`, SSE, `/f/[token]`, the student tab strip, the chat button, unread counts, `teacherLastReadAt`, and the removal of `app/g/[slug]/pages/page.tsx`. All are Part 2.

Name consistency verified across tasks: `EVERYONE_SLUG`, `EVERYONE_NAME`, `canDeleteGroup`, `effectivePages`, `sharedWithEveryone`, `isEveryone`, `filterPagesByGroup`'s third parameter `everyoneName`.

Amended during execution: Task 6 originally passed the hardcoded `EVERYONE_NAME` as that third argument. The everyone group's name is the teacher's to change — production's row is "Everyone", the local one is "all" — so a constant compared against `groupNames` would silently stop widening a student's chip the moment the two diverged. Task 6 now reads the name from the flagged row instead. `EVERYONE_NAME` survives only as the value the migration seeds a rebuilt box with.

One risk worth naming for the implementer: Task 3 hand-edits a generated migration, which is the only step here whose failure is invisible locally and only shows up on the server. Step 4 verifies both of the seed's branches — the `INSERT` on an empty database and the `UPDATE` on a populated one — on throwaway copies. It deliberately does **not** run `prisma migrate reset`: the local `dev.db` holds the only passkey for local `/admin`, and resetting it costs a manual passkey re-registration for no verification benefit.
