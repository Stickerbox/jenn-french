# Students, Not Groups — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The admin's Students tab lists people, not groups. Clicking one opens the page that student sees. Per-student card overrides are gone entirely, and adding a student asks for a name and nothing else.

**Architecture:** The `Card` model and every path to it are deleted, so a card is only ever the global one for a date. `/admin/[slug]` goes with it — a student tile now links to `/g/[slug]?k=<chatToken>`, which is the student's own page, and Jenn chats from there because `chatRole` already prefers her teacher session over any token. The new-student form takes a name and derives the slug with the `slugify` that already exists for pages.

**Tech Stack:** Next.js 16 App Router, Prisma/SQLite, Tailwind v4, Vitest.

## Global Constraints

- **Branch:** `lesson-chat`, which is **not merged and not deployed**. Build on it.
- **Logic belongs in `lib/`** as pure functions with tests in `tests/lib/`. Components, Prisma access and route handlers are not unit-tested.
- **Comments explain the "why".** Never restate the code. Every comment in this plan is part of the deliverable.
- Imports use the `@/` alias. Admin copy is English; the student side is French.
- Every mutating server action starts with `requireTeacher()`.
- **Do not run `npx prisma migrate reset`** or delete `prisma/dev.db` — it holds the only local passkey. Verify migrations on throwaway copies under `/tmp`.
- **Never touch** `app/p/[slug]/raw/route.ts` or its CSP.
- **The load-bearing rule still holds:** an untokened `/g/[slug]` renders the card and nothing else — no tabs, no chat button. Every task must leave that true.
- **Local checks:** `npm run lint` (must report **0 problems**, warnings included), `npm run typecheck`, `npm test`, `npm run build`. Baseline entering this plan: **28 files, 290 tests**.

### Verified before planning

`SELECT COUNT(*) FROM Card` is **0** on both the local database and production. Dropping that table destroys no data. Production holds 6 global cards and one group row (the everyone group).

---

### Task 1: Derive a student's slug from their name

**Files:**
- Create: `lib/student-slug.ts`
- Test: `tests/lib/student-slug.test.ts`

**Interfaces:**
- Consumes: `slugify`, `uniqueSlug` from `@/lib/page-slug`.
- Produces: `studentSlug(name: string, taken: string[]): string`.

Jenn types a name; the slug is derived, never typed. A bare `toLowerCase()` is not enough — "Marie Dupont" would become `marie dupont`, and that string becomes both a URL path segment and a cookie name (`student-token-marie dupont`), producing a broken link and a malformed `Set-Cookie`. `slugify` already solves exactly this for page titles, including French accents and ligatures, so this reuses it rather than inventing a second rule.

- [ ] **Step 1: Write the failing test**

Create `tests/lib/student-slug.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { studentSlug } from "@/lib/student-slug";

describe("studentSlug", () => {
  it("lowercases a single name", () => {
    expect(studentSlug("Jordan", [])).toBe("jordan");
  });

  it("hyphenates a name with a space, so the URL and cookie name stay valid", () => {
    expect(studentSlug("Marie Dupont", [])).toBe("marie-dupont");
  });

  it("strips French accents rather than dropping the letter", () => {
    expect(studentSlug("Zoé", [])).toBe("zoe");
    expect(studentSlug("Chloé Bérubé", [])).toBe("chloe-berube");
  });

  it("drops punctuation that would break a path or a cookie", () => {
    expect(studentSlug("O'Brien", [])).toBe("o-brien");
    expect(studentSlug("A; B=C", [])).toBe("a-b-c");
  });

  it("suffixes a name that is already taken", () => {
    expect(studentSlug("Jordan", ["jordan"])).toBe("jordan-2");
  });

  it("keeps counting past the first collision", () => {
    expect(studentSlug("Jordan", ["jordan", "jordan-2"])).toBe("jordan-3");
  });

  it("falls back rather than returning an empty slug", () => {
    expect(studentSlug("!!!", [])).not.toBe("");
  });

  it("never returns a slug containing a space, semicolon or equals sign", () => {
    for (const name of ["Marie Dupont", "A; B=C", "Zoé Bérubé"]) {
      expect(studentSlug(name, [])).not.toMatch(/[\s;=]/);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/lib/student-slug.test.ts`
Expected: FAIL — cannot resolve `@/lib/student-slug`.

- [ ] **Step 3: Write the implementation**

Create `lib/student-slug.ts`:

```ts
import { slugify, uniqueSlug } from "@/lib/page-slug";

// Jenn types a name; she never types a slug. Lowercasing alone is not enough —
// "Marie Dupont" would become "marie dupont", and that string ends up in a URL
// path AND in a cookie name (`student-token-…`), where a space produces a
// broken link and a malformed Set-Cookie header. slugify already handles this
// for page titles, accents and ligatures included, so this reuses that rule
// rather than growing a second one that would drift from it.
export function studentSlug(name: string, taken: string[]): string {
  return uniqueSlug(slugify(name), taken);
}
```

If `slugify`'s empty-input fallback returns `"page"`, that is acceptable here — it only fires for a name with no alphanumeric characters at all, and the slug stays editable by deleting and re-adding the student.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/lib/student-slug.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/student-slug.ts tests/lib/student-slug.test.ts
git commit -m "feat: derive a student's slug from their name"
```

---

### Task 2: Remove the card override feature

**Files:**
- Delete: `app/admin/[slug]/page.tsx`
- Modify: `app/g/[slug]/page.tsx` — the one `getEffectiveCard` call site
- Modify: `lib/card-resolution.ts` — remove `pickEffectiveCard` and `mergeArchiveDates`
- Modify: `lib/cards.ts` — `getEffectiveCard` reads only the global card; delete `getArchiveDates`
- Modify: `app/actions.ts` — delete `upsertOverrideCard`, `deleteOverrideCard`
- Modify or delete: `tests/lib/card-resolution.test.ts` — remove both suites
- Modify: `prisma/schema.prisma` — delete `model Card` and `Group.cards`
- Create: `prisma/migrations/<generated>_drop_card_overrides/migration.sql`

**Interfaces:**
- Produces: `getEffectiveCard(date: Date)` — the `groupId` parameter is **removed**, not kept and ignored. There is exactly one call site (`app/g/[slug]/page.tsx:59`), so the churn is a single line, and a parameter the function does not read is a standing invitation to believe it still matters. Update that call site in this task.

Do this in one task rather than several: a half-removed model leaves the schema and the resolution logic disagreeing, and neither state is independently reviewable.

- [ ] **Step 1: Simplify the resolution**

In `lib/cards.ts`, replace `getEffectiveCard`:

```ts
// A card belongs to a date, and every student sees the same one. This used to
// take a groupId and prefer that student's override; the override feature was
// removed on 2026-07-31 with zero rows in either database.
export async function getEffectiveCard(
  date: Date,
): Promise<CardContent | null> {
  const row = await prisma.globalCard.findUnique({ where: { date } });
  if (!row) return null;

  return {
    date: row.date,
    subject: row.subject,
    usage: row.usage,
    englishPrompt: row.englishPrompt,
    hint: row.hint,
    frenchAnswer: row.frenchAnswer,
    sections: readSections(row.sections),
  };
}
```

Remove the now-unused `pickEffectiveCard` import, and update the single call site in `app/g/[slug]/page.tsx` from `getEffectiveCard(group.id, selectedDate)` to `getEffectiveCard(selectedDate)`.

- [ ] **Step 2: Remove the pure functions and their tests**

Delete **both** `pickEffectiveCard` and `mergeArchiveDates` from `lib/card-resolution.ts`. **Keep `CardContent`** — `getEffectiveCard` returns it.

`mergeArchiveDates` exists only to merge a student's override dates with the global ones, and its sole consumer is `getArchiveDates` in `lib/cards.ts`, which **has no callers anywhere in the codebase** — confirmed by grep across `app/`, `components/`, `lib/` and `tests/`. It queries `prisma.card`, so dropping the table would break it regardless. Delete `getArchiveDates` too.

This is dead code that predates the current archive UI. If a date-archive comes back it will be written against the one-tier model, not resurrected against a two-tier one that no longer exists.

In `tests/lib/card-resolution.test.ts`, delete the `describe("pickEffectiveCard")` and `describe("mergeArchiveDates")` blocks and their imports. If that empties the file, delete the file with `git rm`; if any suite remains, keep it.

- [ ] **Step 3: Delete the route and its actions**

```bash
git rm 'app/admin/[slug]/page.tsx'
```

In `app/actions.ts`, delete `upsertOverrideCard` and `deleteOverrideCard` entirely, plus any import that becomes unused.

- [ ] **Step 4: Drop the table**

In `prisma/schema.prisma`, delete `model Card` and the `cards Card[]` field on `Group`.

Run: `npx prisma migrate dev --name drop_card_overrides`

Read the generated SQL. It should drop the `Card` table. If Prisma generates a table-rebuild for `Group` instead of a plain `DROP TABLE`, that is normal for SQLite — read it and confirm it preserves every `Group` column, including `isEveryone`, `chatToken`, `filesToken` and `teacherLastReadAt`.

- [ ] **Step 5: Verify the migration on a throwaway copy**

Do **not** reset the dev database.

```bash
rm -f /tmp/drop-check.db
sqlite3 prisma/dev.db ".backup /tmp/drop-check.db"
DATABASE_URL="file:/tmp/drop-check.db" npx prisma migrate deploy
sqlite3 /tmp/drop-check.db ".tables"
sqlite3 /tmp/drop-check.db 'SELECT slug, isEveryone, length(chatToken), length(filesToken) FROM "Group";'
sqlite3 /tmp/drop-check.db 'SELECT COUNT(*) FROM GlobalCard;'
```

Expected: no `Card` table; both groups intact with their tokens; the global cards untouched. Then apply to your own database with `npx prisma migrate deploy`, and clean up with `rm -f /tmp/drop-check.db`.

- [ ] **Step 6: Verify**

Run: `npx prisma generate && npm run lint && npm run typecheck && npm test && npm run build`
Expected: PASS, lint 0 problems. Test count drops by however many `pickEffectiveCard` cases existed — report the real number.

A typecheck failure here means something still imports the deleted route or actions. Find and fix the importer; do not restore the deletion.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: remove per-student card overrides"
```

---

### Task 3: Students, not groups

**Files:**
- Modify: `components/admin/GroupList.tsx`
- Modify: `components/admin/NewGroupForm.tsx`
- Modify: `app/admin/page.tsx`
- Modify: `app/actions.ts` — `createGroup` takes a name only
- Modify: `components/admin/AdminTabs.tsx` — the tab label

**Interfaces:**
- Consumes: `studentSlug` (Task 1).
- Produces: `createGroup(name: string)` — the `slug` parameter is gone. `GroupSummary` drops `cardCount`.

- [ ] **Step 1: Derive the slug in the action**

In `app/actions.ts`, replace `createGroup`:

```ts
export async function createGroup(name: string) {
  await requireTeacher();

  const trimmed = name.trim();
  if (trimmed === "") throw new Error("A student needs a name.");

  // Derived, never typed. The slug is a URL path segment and a cookie name,
  // and a hand-typed one could be neither — see lib/student-slug.ts.
  const taken = await prisma.group.findMany({ select: { slug: true } });
  const slug = studentSlug(
    trimmed,
    taken.map((g) => g.slug),
  );

  await prisma.group.create({
    data: {
      name: trimmed,
      slug,
      chatToken: newToken(),
      filesToken: newToken(),
    },
  });

  revalidatePath("/admin");
}
```

with `import { studentSlug } from "@/lib/student-slug";`.

`uniqueSlug` already guarantees the slug is free, so the P2002 catch that used to translate a duplicate-slug error is no longer reachable — remove it and its `Prisma` import if that import becomes unused.

- [ ] **Step 2: The form asks for a name**

In `components/admin/NewGroupForm.tsx`: delete the slug field and its state, change the `onSubmit` prop to `(name: string) => Promise<void>`, and relabel:

- the name field's label to `Student name`
- the button to `Add student` / `Adding...`

Add a line under the field so the derived link is not a surprise:

```tsx
      <p className="text-sm font-normal text-[var(--color-ink-muted)]">
        Their link is made from this name — “Marie Dupont” becomes /g/marie-dupont.
      </p>
```

- [ ] **Step 3: The tile goes to the student's page**

In `components/admin/GroupList.tsx`:

- Drop `cardCount` from `GroupSummary`; `Card` no longer exists.
- Point the tile at the student's own page, carrying the token:

```tsx
                href={`/g/${group.slug}?k=${group.chatToken ?? ""}`}
```

- The eyebrow becomes the unread count and the path:

```tsx
                eyebrow={`/g/${group.slug}${
                  group.unread > 0 ? ` · ${group.unread} unread` : ""
                }`}
```

- **Delete the files-link line entirely.** Keep the chat link, as one plain line rather than two:

```tsx
              {group.chatToken && (
                <p className="mt-1 px-5 text-xs text-[var(--color-ink-muted)]">
                  <code className="break-all">
                    /g/{group.slug}?k={group.chatToken}
                  </code>
                </p>
              )}
```

- Keep the "Make new links" button and its confirm exactly as they are.
- Change the empty state to `No students yet.` and the search label to `Search students`.

- [ ] **Step 4: Rename in the page and the tabs**

In `components/admin/AdminTabs.tsx`, change the `groups` tab's label from `Groups` to `Students`. **Leave its `tab` value as `"groups"`** — that is the `?tab=` URL value, and `parseAdminTab` and its tests depend on it. This is a label change only.

In `app/admin/page.tsx`, in `GroupsTab`:

- drop `include: { _count: { select: { cards: true } } }` from the query — that relation no longer exists — and drop `cardCount` from the mapped object
- change the heading `Add a group` to `Add a student`

In `components/admin/PageEditor.tsx`, the group-assignment fieldset's legend reads `Groups`; change it to `Students`. Its empty state `No groups yet.` becomes `No students yet.`

Grep for any other admin-facing `group`/`Group` copy and change it. Do **not** rename anything in the schema, the routes, the `?tab=` value, or variable names — this is a copy change, matching the decision already recorded in `CLAUDE.md`.

- [ ] **Step 5: Verify**

Run: `npm run lint && npm run typecheck && npm test && npm run build`
Expected: PASS, lint 0 problems.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: call them students, and derive their link from their name"
```

---

### Task 4: Jenn chats from the student's page

**Files:**
- Modify: `app/g/[slug]/page.tsx`

**Interfaces:**
- Consumes: `getCurrentTeacher` from `@/lib/session`; `markChatRead`, `deleteMessage` from `@/app/actions`; `ChatFab`.

`/admin/[slug]` is gone, and it was where Jenn's chat lived — along with the `onOpen` that cleared a student's unread count and the `onDeleteMessage` that let her remove a message. Both have to move to the student's page, for her only.

Both actions were narrowed during Task 3's fix round — they are now `markChatRead(groupId)` and `deleteMessage(messageId)`, having shed slug parameters that only fed a `revalidatePath` at the deleted route. `deleteMessage` is passed directly rather than bound, since `ChatFab`'s `onDeleteMessage` already supplies the id.

`chatRole` already returns `"teacher"` for a logged-in teacher before it looks at any token, so she can post there and her messages are correctly stored as `fromTeacher: true`. What the page has to do is pass the teacher-only props, and render her side of the conversation on the correct side of the bubbles.

- [ ] **Step 1: Detect the teacher and pass her props**

In `app/g/[slug]/page.tsx`, add:

```ts
import { getCurrentTeacher } from "@/lib/session";
import { markChatRead, deleteMessage } from "@/app/actions";
```

After the existing `unlocked` computation, add:

```ts
  // Jenn opens a student's page from the admin. chatRole already treats her
  // session as the teacher regardless of the token, so the only thing left is
  // giving her the two controls that used to live on /admin/[slug].
  const teacher = await getCurrentTeacher();
  const viewerIsTeacher = Boolean(teacher);
```

Then change the `ChatFab` call:

```tsx
        <ChatFab
          slug={slug}
          token={null}
          self={viewerIsTeacher ? "teacher" : "student"}
          onOpen={
            viewerIsTeacher ? markChatRead.bind(null, group.id) : undefined
          }
          onDeleteMessage={viewerIsTeacher ? deleteMessage : undefined}
          labels={{ …unchanged French labels…, deleteMessage: "Supprimer" }}
        />
```

Keep every existing French label. `deleteMessage` currently reads `""` on this page — give it a real French string now that the control can actually render.

- [ ] **Step 2: Confirm the public rule is untouched**

`getCurrentTeacher()` reads a cookie, so calling it does not change what an untokened visitor sees — `ChatFab` is still rendered only when `unlocked`. Do not move that gate.

- [ ] **Step 3: Verify**

Run: `npm run lint && npm run typecheck && npm test && npm run build`
Expected: PASS, lint 0 problems.

- [ ] **Step 4: Prove it by hand**

Start `npm run dev`. Get a student's slug and token:

```bash
sqlite3 prisma/dev.db 'SELECT slug, chatToken FROM "Group" WHERE isEveryone = 0;'
```

Then:

```bash
curl -s "http://localhost:3000/g/<slug>" | grep -c Clavardage
```

Expected: **0** — the untokened page still shows no chat button. This is the branch's load-bearing rule and it must not have moved.

Also confirm `/admin/<slug>` is gone:

```bash
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/admin/<slug>"
```

Expected: `404`.

- [ ] **Step 5: Commit**

```bash
git add 'app/g/[slug]/page.tsx'
git commit -m "feat: give the teacher her chat controls on the student's page"
```

---

### Task 5: Documentation and the full check

**Files:**
- Modify: `CLAUDE.md` — the routes table, the two-tier cards section, the chat section

- [ ] **Step 1: Correct the routes table**

Delete the `/admin/[slug]` row. Change the `/g/[slug]` row's Notes cell to mention that a teacher session unlocks the chat controls there.

- [ ] **Step 2: Rewrite the two-tier cards claim**

The **Two-tier cards** section under Architecture describes `GlobalCard` versus a per-group `Card` override, `pickEffectiveCard`, and a resolution rule. All of it is now false. Replace it with a short section saying a card belongs to a date and every student sees the same one; `getEffectiveCard` still takes a student id because the question it answers is "what does this student see today", but the answer no longer depends on who is asking. Record that per-student overrides existed and were removed on 2026-07-31 with zero rows in either database — a future reader finding `mergeArchiveDates` or the archive UI should know why the other half is missing.

- [ ] **Step 3: Note where the teacher chats**

In the chat section, add that `/admin/[slug]` no longer exists: Jenn opens a student from the Students tab, which takes her to `/g/[slug]?k=…`, and `chatRole` treats her session as the teacher there, so her messages store as `fromTeacher: true` and she gets the delete control and the read-marker that used to live on the admin route.

**Verify every claim against the code before writing it.** If any is false, correct it and say so in your report.

- [ ] **Step 4: Run the full CI sequence**

```bash
npx prisma generate
npm run lint
npm run typecheck
npm test
npm run build
```

`npm run lint` must report **0 problems**. Report the real test totals.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: record students, the removed overrides, and where the teacher chats"
```

---

## Self-review notes

Covers every change requested:

- No more daily word overrides → Task 2 (route, actions, model, table, resolution).
- Clicking a student goes to their page → Task 3 Step 3.
- The files link removed, the chat link kept → Task 3 Step 3.
- "Groups" → "Students", "Add a group" → "Add a student" → Task 3 Step 4.
- The form exposes a name only, slug derived → Tasks 1 and 3 Step 1.

Consequences the request did not mention but which follow from it, and are handled:

- Jenn's chat, her delete control and the unread-clearing all lived on the deleted route → Task 4.
- `cardCount` on the tile counted override cards → dropped in Task 3.
- The `?tab=groups` URL value stays, so `parseAdminTab` and its tests are untouched → Task 3 Step 4 says so explicitly.
- Deriving the slug closes the unvalidated-slug hole logged during the chat branch, which is why a slug containing `(` could crash a route.

Name consistency: `studentSlug`, `createGroup(name)`, `GroupSummary` without `cardCount`, `getEffectiveCard(date)`.

Risks worth naming:

0. **Task 2 deletes dead code as well as the feature.** `getArchiveDates` and `mergeArchiveDates` have no callers and query the dropped table. Removing them is part of the task, not scope creep — leaving them would break the build.
1. **Task 2 drops a table.** Verified zero rows in both databases before planning, so nothing is lost — but the migration is irreversible once deployed, and its Step 5 checks the `Group` columns survive SQLite's table-rebuild.
2. **Task 4 touches the page carrying the branch's load-bearing rule.** Its Step 4 re-checks the untokened HTML with `curl` rather than by eye.
