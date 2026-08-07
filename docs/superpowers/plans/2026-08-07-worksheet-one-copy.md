# Worksheet One-Copy Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give a student one auto-saved copy of an HTML worksheet instead of two version tabs and a manual Save pill, and turn that pill into a "Send" notice that each party presses when they are finished.

**Architecture:** Nothing about storage moves. `PageVersion` keeps `@@unique([pageId, groupId, fromTeacher])`, and `POST /api/worksheets/[slug]/[pageSlug]` keeps writing the caller's own slot from whatever view called it. Three new pure modules in `lib/` decide which tabs are drawn, which tab may be written from, and whether the Send button is live. The shell gains a ten-second debounce that calls the existing save route by itself. Two new small routes carry the notification and the delete. One nullable column, `PageVersion.sentAt`, records whether the caller's row has been announced.

**Tech Stack:** Next.js App Router (server components + `"use client"` shells), Prisma + SQLite, Vitest (`node` environment), Tailwind v4 via PostCSS.

**Spec:** `docs/superpowers/specs/2026-08-07-worksheet-one-copy-design.md`. Read it before Task 1. Every "why" in this plan is short-form; the spec carries the full reasoning.

## Global Constraints

- **Imports use the `@/` alias.** Never a relative path across directories.
- **Logic with a rule in it is a pure function in `lib/` with a test in `tests/lib/`.** Components and Prisma access are not unit-tested; the pure modules under them are.
- **Comments explain the "why", especially the counter-intuitive.** Do not add comments that restate the code. Match the density of the file you are editing — this codebase comments decisions, not mechanics.
- **PDF worksheets are out of scope.** `components/pdf/*`, `components/worksheet/UploadVersion.tsx`, `canSaveFromSlot`, `tests/lib/worksheet-save-slots.test.ts`'s existing three tests, and the `context.page.kind === "pdf"` branch of `app/g/[slug]/w/[pageSlug]/page.tsx` keep today's behaviour exactly. A PDF upload still posts a chat message on every upload.
- **Copy splits by audience on this route, not by browser locale.** French for the student, English for Jenn, chosen with `audience === "teacher" ? "…" : "…"`, matching `versionLabel` and `WorksheetShell`'s existing back label. This route predates the `Accept-Language` convention in CLAUDE.md and migrating it is a separate decision.
- **Anything that transitions carries `motion-reduce:transition-none`.** Anything that animates carries `motion-reduce:animate-none`.
- **Deletes use `deleteMany` and updates that may miss use `updateMany`,** so a double-click or a stale tab is a no-op rather than a P2025.
- **Run `npx prisma generate` after any `schema.prisma` change,** before `tsc` or the tests.
- **Debounce is exactly 10 seconds** (`DEBOUNCE_MS = 10_000`).
- **Never add `allow-same-origin` to the worksheet iframe sandbox.** It stays `sandbox="allow-scripts allow-modals"`.
- **Full check before claiming done:** `npx prisma generate && npm run lint && npm run typecheck && npm test && npm run build`.

## File Structure

**Created**

| File | Responsibility |
|---|---|
| `lib/worksheet-slots.ts` | `visibleSlots` — which tabs each party sees. The only place that table exists. |
| `lib/worksheet-send.ts` | `sendState` — the Send button's three states. Takes facts, returns a state; never fetches. |
| `tests/lib/worksheet-slots.test.ts` | Tests for the above. |
| `tests/lib/worksheet-send.test.ts` | Tests for the above. |
| `components/worksheet/frame.ts` | `WORKSHEET_FRAME_ID` and `requestSnapshot` — the postMessage plumbing, lifted out of `SaveVersionButton` so the auto-saver and the Send button share one copy. |
| `components/worksheet/useWorksheetAutosave.ts` | The debounce, the dirty flag, the editable probe, and the POST. One hook owns every fact about "is there work here worth keeping". |
| `components/worksheet/SendVersionButton.tsx` | *Envoyer à Jenn* / *Send to Marie*. |
| `components/worksheet/DeleteVersionButton.tsx` | *Recommencer* / *Delete correction*. |
| `app/api/worksheets/[slug]/[pageSlug]/send/route.ts` | Posts the chat notice, then marks the row sent. |
| `app/api/worksheets/[slug]/[pageSlug]/restart/route.ts` | Deletes the caller's own row. |

**Modified**

| File | Change |
|---|---|
| `prisma/schema.prisma` | `sentAt DateTime?` on `PageVersion`, plus a migration. |
| `lib/version-store.ts` | `sentAt` on `StoredVersion`; `sentAt: null` on every save; `findVersionMeta`, `markVersionSent`, `deleteVersion`. |
| `lib/worksheet-save-slots.ts` | `isWritableSlot` added beside `canSaveFromSlot`. Both stay. |
| `app/api/worksheets/[slug]/[pageSlug]/route.ts` | Its `createMessage` block moves out to the send route. |
| `app/g/[slug]/w/[pageSlug]/raw/route.ts` | One narrow seed fallback for a student's own slot. |
| `app/g/[slug]/w/[pageSlug]/page.tsx` | HTML branch only: `visibleSlots`, audience-aware default slot, new props. |
| `components/worksheet/WorksheetShell.tsx` | Auto-save, read-only marker, two new controls. |
| `.claude/rules/worksheets.md` | Records the new rules, in Task 9. |

**Deleted**

| File | Why |
|---|---|
| `components/worksheet/SaveVersionButton.tsx` | Its only consumer was `WorksheetShell`, and the manual pill is gone. Its snapshot plumbing moves to `components/worksheet/frame.ts`. |

---

### Task 1: `visibleSlots`

The tab table, as a pure function.

**Files:**
- Create: `lib/worksheet-slots.ts`
- Test: `tests/lib/worksheet-slots.test.ts`

**Interfaces:**
- Consumes: `VersionSlot` and `VersionAudience` from `@/lib/version-labels` (existing: `type VersionSlot = "blank" | "student" | "teacher"`, `type VersionAudience = "student" | "teacher"`).
- Produces: `visibleSlots(input: { audience: VersionAudience; hasStudent: boolean; hasTeacher: boolean }): VersionSlot[]`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/worksheet-slots.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { visibleSlots } from "@/lib/worksheet-slots";

describe("visibleSlots", () => {
  it("gives a student one tab until Jenn has corrected", () => {
    // Their first view IS the blank's content, under their own label — the
    // seed, not a tab. So "nobody has typed" and "I have typed" look the same.
    expect(
      visibleSlots({ audience: "student", hasStudent: false, hasTeacher: false }),
    ).toEqual(["student"]);
    expect(
      visibleSlots({ audience: "student", hasStudent: true, hasTeacher: false }),
    ).toEqual(["student"]);
  });

  it("never shows a student the blank", () => {
    expect(
      visibleSlots({ audience: "student", hasStudent: true, hasTeacher: true }),
    ).toEqual(["student", "teacher"]);
    // Jenn can correct before the student has typed anything, by writing from
    // the blank. The student still gets no blank tab.
    expect(
      visibleSlots({ audience: "student", hasStudent: false, hasTeacher: true }),
    ).toEqual(["student", "teacher"]);
  });

  it("gives Jenn the blank alone until somebody has saved", () => {
    expect(
      visibleSlots({ audience: "teacher", hasStudent: false, hasTeacher: false }),
    ).toEqual(["blank"]);
  });

  it("gives Jenn the blank plus every slot that exists", () => {
    expect(
      visibleSlots({ audience: "teacher", hasStudent: true, hasTeacher: false }),
    ).toEqual(["blank", "student"]);
    expect(
      visibleSlots({ audience: "teacher", hasStudent: false, hasTeacher: true }),
    ).toEqual(["blank", "teacher"]);
    expect(
      visibleSlots({ audience: "teacher", hasStudent: true, hasTeacher: true }),
    ).toEqual(["blank", "student", "teacher"]);
  });

  it("caps the student at two tabs and Jenn at three", () => {
    // The asymmetry is the whole design in one line, so it is pinned.
    expect(
      visibleSlots({ audience: "student", hasStudent: true, hasTeacher: true }),
    ).toHaveLength(2);
    expect(
      visibleSlots({ audience: "teacher", hasStudent: true, hasTeacher: true }),
    ).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx vitest run tests/lib/worksheet-slots.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/worksheet-slots"`.

- [ ] **Step 3: Write the implementation**

Create `lib/worksheet-slots.ts`:

```ts
import type { VersionSlot, VersionAudience } from "@/lib/version-labels";

// Which version tabs each party is shown. The student's maximum is two and
// Jenn's is three, and that asymmetry is the point: comparing two copies of
// one worksheet is HER job, not theirs. To a student the document is their
// homework, not a version of anything.
//
// A student is never shown the blank. Their first view is the blank's content
// served under their own slot — the seed, which app/g/[slug]/w/[pageSlug]/raw
// supplies when they have no row yet. Giving it a tab of its own asked them to
// choose between their homework and an older copy of their homework.
//
// The blank is not a row, which is why it is added here rather than derived
// from what exists: it is Page.html, and it is always there.
export function visibleSlots({
  audience,
  hasStudent,
  hasTeacher,
}: {
  audience: VersionAudience;
  hasStudent: boolean;
  hasTeacher: boolean;
}): VersionSlot[] {
  if (audience === "student") {
    return hasTeacher ? ["student", "teacher"] : ["student"];
  }

  const slots: VersionSlot[] = ["blank"];
  if (hasStudent) slots.push("student");
  if (hasTeacher) slots.push("teacher");
  return slots;
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx vitest run tests/lib/worksheet-slots.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/worksheet-slots.ts tests/lib/worksheet-slots.test.ts
git commit -m "Decide the worksheet tabs in one place"
```

---

### Task 2: `isWritableSlot`

Which tab the caller may write from. This is what stops auto-save writing over Jenn's own correction.

**Files:**
- Modify: `lib/worksheet-save-slots.ts`
- Test: `tests/lib/worksheet-save-slots.test.ts` (append; leave the three existing tests untouched)

**Interfaces:**
- Consumes: `VersionSlot`, `VersionAudience` from `@/lib/version-labels`.
- Produces: `isWritableSlot(input: { slot: VersionSlot; audience: VersionAudience; hasTeacher: boolean }): boolean`

- [ ] **Step 1: Write the failing test**

Append to `tests/lib/worksheet-save-slots.test.ts` (keep the existing `import { canSaveFromSlot }` line and add `isWritableSlot` to it):

```ts
describe("isWritableSlot", () => {
  it("lets a student write their own copy and nothing else", () => {
    expect(
      isWritableSlot({ slot: "student", audience: "student", hasTeacher: false }),
    ).toBe(true);
    expect(
      isWritableSlot({ slot: "student", audience: "student", hasTeacher: true }),
    ).toBe(true);
    // Auto-save writes the CALLER'S slot, so this would file Jenn's marks as
    // the student's own attempt ten seconds after they touched a key.
    expect(
      isWritableSlot({ slot: "teacher", audience: "student", hasTeacher: true }),
    ).toBe(false);
    // Not a tab they can reach, but the predicate must not depend on that.
    expect(
      isWritableSlot({ slot: "blank", audience: "student", hasTeacher: false }),
    ).toBe(false);
  });

  it("lets Jenn seed her correction from any tab while she has none", () => {
    // From the blank this makes an answer key; from the attempt it makes an
    // annotated attempt. Both are real, and both write her own slot.
    expect(
      isWritableSlot({ slot: "blank", audience: "teacher", hasTeacher: false }),
    ).toBe(true);
    expect(
      isWritableSlot({ slot: "student", audience: "teacher", hasTeacher: false }),
    ).toBe(true);
  });

  it("confines Jenn to her correction once she has one", () => {
    // The clause that stops a second visit from overwriting her first
    // correction ten seconds later, with no press to reconsider.
    expect(
      isWritableSlot({ slot: "teacher", audience: "teacher", hasTeacher: true }),
    ).toBe(true);
    expect(
      isWritableSlot({ slot: "student", audience: "teacher", hasTeacher: true }),
    ).toBe(false);
    expect(
      isWritableSlot({ slot: "blank", audience: "teacher", hasTeacher: true }),
    ).toBe(false);
  });

  it("keeps exactly one writable slot for each party at any moment", () => {
    // The invariant the whole read-only rule buys: the attempt and the
    // correction can never overwrite each other.
    const slots = ["blank", "student", "teacher"] as const;
    for (const hasTeacher of [false, true]) {
      const writable = slots.filter((slot) =>
        isWritableSlot({ slot, audience: "student", hasTeacher }),
      );
      expect(writable).toEqual(["student"]);
    }
    expect(
      slots.filter((slot) =>
        isWritableSlot({ slot, audience: "teacher", hasTeacher: true }),
      ),
    ).toEqual(["teacher"]);
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx vitest run tests/lib/worksheet-save-slots.test.ts`
Expected: FAIL — `isWritableSlot is not exported`. The three `canSaveFromSlot` tests must still pass.

- [ ] **Step 3: Write the implementation**

Append to `lib/worksheet-save-slots.ts`, below `canSaveFromSlot`:

```ts
// THE HTML RULE. canSaveFromSlot above is THE PDF RULE, and they are both here
// on purpose: they agree about a student and disagree about Jenn, because the
// two page kinds now differ. A PDF version is an upload — a deliberate act she
// performs from wherever she is standing — so she may upload from all three of
// her tabs. An html version is auto-saved ten seconds after a keystroke, with
// no press in which to reconsider, so she is confined to one.
//
// Do not delete either as a duplicate of the other.
//
// A student: their own copy, always, and Jenn's correction, never — the same
// reason canSaveFromSlot gives, and it bites harder here. Under a pill they had
// to press something to destroy their attempt; under auto-save a stray
// keystroke on the correction would do it by itself.
//
// Jenn with no correction yet: any tab. Her typing seeds it — from the blank,
// which makes an answer key, or from the student's attempt, which makes an
// annotated attempt.
//
// Jenn with a correction: only her own tab. Without this she opens the
// student's attempt a second time, types, and ten seconds later her first
// correction is gone. There is no version history to recover it from. She gets
// back to a writable blank by DELETING her correction, which is a confirmed
// act — see the restart route.
export function isWritableSlot({
  slot,
  audience,
  hasTeacher,
}: {
  slot: VersionSlot;
  audience: VersionAudience;
  hasTeacher: boolean;
}): boolean {
  if (audience === "student") return slot === "student";
  return hasTeacher ? slot === "teacher" : true;
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx vitest run tests/lib/worksheet-save-slots.test.ts`
Expected: PASS, 7 tests (3 existing + 4 new).

- [ ] **Step 5: Commit**

```bash
git add lib/worksheet-save-slots.ts tests/lib/worksheet-save-slots.test.ts
git commit -m "Give html worksheets one writable tab per party"
```

---

### Task 3: `sendState`

**Files:**
- Create: `lib/worksheet-send.ts`
- Test: `tests/lib/worksheet-send.test.ts`

**Interfaces:**
- Produces:
  - `type SendState = "empty" | "ready" | "sent"`
  - `sendState(input: { hasOwnVersion: boolean; sent: boolean; dirty: boolean }): SendState`

Note the boundary: this takes `sent: boolean`, not a `Date`. The caller reduces `PageVersion.sentAt` to `sentAt !== null` before it crosses into the client component. Nothing here needs to know when.

- [ ] **Step 1: Write the failing test**

Create `tests/lib/worksheet-send.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { sendState } from "@/lib/worksheet-send";

describe("sendState", () => {
  it("has nothing to send before anything is saved", () => {
    expect(sendState({ hasOwnVersion: false, sent: false, dirty: false })).toBe(
      "empty",
    );
  });

  it("is ready once saved work has never been announced", () => {
    expect(sendState({ hasOwnVersion: true, sent: false, dirty: false })).toBe(
      "ready",
    );
  });

  it("is spent once announced, until something changes", () => {
    expect(sendState({ hasOwnVersion: true, sent: true, dirty: false })).toBe(
      "sent",
    );
  });

  it("comes back to ready on the next keystroke", () => {
    // The save that follows a keystroke sets sentAt back to null, so this is
    // what the button looks like in the ten seconds before that write lands.
    expect(sendState({ hasOwnVersion: true, sent: true, dirty: true })).toBe(
      "ready",
    );
  });

  it("is ready on unsaved typing that has no row behind it yet", () => {
    // The very first ten seconds of the very first visit. Pressing Send here
    // must work: the button flushes the pending write, THEN announces it.
    expect(sendState({ hasOwnVersion: false, sent: false, dirty: true })).toBe(
      "ready",
    );
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx vitest run tests/lib/worksheet-send.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/worksheet-send"`.

- [ ] **Step 3: Write the implementation**

Create `lib/worksheet-send.ts`:

```ts
// Send is a notice and nothing else. Every save has already happened by the
// time it is pressed; all this decides is whether there is anything worth
// telling the other party about.
//
// "empty"  — nothing saved and nothing typed. Drawn, disabled, so the control
//            is where it will be rather than appearing from nowhere.
// "ready"  — unannounced work exists.
// "sent"   — announced, and unchanged since. Drawn, disabled, and it SAYS so:
//            a control that vanishes after a press tells the student nothing
//            about whether the press worked.
export type SendState = "empty" | "ready" | "sent";

// `dirty` FIRST, and this order is the rule. Unsaved typing outranks both
// other facts: `sentAt` describes the row on the server, which the last ten
// seconds of typing have not reached yet. Press it and the button flushes that
// write before it announces anything — a notice about work that was never
// stored is worse than a late notice.
export function sendState({
  hasOwnVersion,
  sent,
  dirty,
}: {
  hasOwnVersion: boolean;
  // The caller's own row has been announced. Reduced from PageVersion.sentAt
  // by whoever loads it, because nothing here needs to know when.
  sent: boolean;
  dirty: boolean;
}): SendState {
  if (dirty) return "ready";
  if (!hasOwnVersion) return "empty";
  return sent ? "sent" : "ready";
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx vitest run tests/lib/worksheet-send.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/worksheet-send.ts tests/lib/worksheet-send.test.ts
git commit -m "Decide when Send has something to say"
```

---

### Task 4: `sentAt`, and the three store helpers

**Files:**
- Modify: `prisma/schema.prisma` (the `PageVersion` model)
- Modify: `lib/version-store.ts`
- Create: a migration under `prisma/migrations/` (generated, not hand-written)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `StoredVersion` gains `sentAt: Date | null`.
  - `findVersionMeta(pageId: string, groupId: string, fromTeacher: boolean): Promise<{ sentAt: Date | null } | null>`
  - `markVersionSent(pageId: string, groupId: string, fromTeacher: boolean): Promise<boolean>`
  - `deleteVersion(pageId: string, groupId: string, fromTeacher: boolean): Promise<void>`

- [ ] **Step 1: Add the column**

In `prisma/schema.prisma`, inside `model PageVersion`, directly below the `updatedAt` line:

```prisma
  // Null means "the other party has not been told about this row". EVERY save
  // sets it back to null and the send route sets it to now, so the Send
  // button's state is one field with one writer per transition.
  //
  // Deliberately NOT a comparison against updatedAt. Prisma writes @updatedAt
  // itself, so a send would be two clocks set inside one statement, and the
  // button's state on that write would depend on which landed first by a
  // microsecond.
  sentAt DateTime?
```

- [ ] **Step 2: Create and apply the migration**

```bash
npx prisma migrate dev --name page_version_sent_at
npx prisma generate
```

Expected: a new directory under `prisma/migrations/`, and `ALTER TABLE "PageVersion" ADD COLUMN "sentAt" DATETIME;` inside its `migration.sql`. Every existing row gets `NULL`, which reads as "never announced" — correct, and it means the first Send after deploy works for work saved before it.

- [ ] **Step 3: Write the store changes**

In `lib/version-store.ts`:

Add `sentAt` to the `StoredVersion` type:

```ts
export type StoredVersion = {
  fromTeacher: boolean;
  kind: VersionKind;
  updatedAt: Date;
  // Null when this row has not been announced to the other party. The shell
  // reduces it to a boolean before it crosses into the client component.
  sentAt: Date | null;
};
```

Add `sentAt: true` to `SUMMARY`, and `sentAt: row.sentAt` to the map inside `listVersions`.

Add `sentAt: null` to the `columns` object in **both** `saveHtmlVersion` and `savePdfVersion`. It belongs in `columns` rather than only in `update`, so it is set on create and on update by one object — the same flat-invariant reasoning the comment above `saveHtmlVersion` already gives about the content columns:

```ts
const columns = { kind: "html", snapshot, pdf: null, pdfSize: null, sentAt: null };
```

```ts
const columns = {
  kind: "pdf",
  snapshot: null,
  pdf: Buffer.from(input.pdf),
  pdfSize: input.pdf.byteLength,
  sentAt: null,
};
```

Append the three new helpers at the end of the file:

```ts
// Whether the caller's row exists, and whether it has been announced. Selects
// neither blob, for the reason SUMMARY does not: this answers a question about
// a button, and loading a whole document to do it ships the thing the summary
// was avoiding.
export async function findVersionMeta(
  pageId: string,
  groupId: string,
  fromTeacher: boolean,
): Promise<{ sentAt: Date | null } | null> {
  return prisma.pageVersion.findUnique({
    where: { pageId_groupId_fromTeacher: { pageId, groupId, fromTeacher } },
    select: { sentAt: true },
  });
}

// updateMany rather than update, the same reason every delete here is a
// deleteMany: a double-press or a stale tab is a no-op rather than a P2025.
// The boolean says whether a row was actually marked.
export async function markVersionSent(
  pageId: string,
  groupId: string,
  fromTeacher: boolean,
): Promise<boolean> {
  const result = await prisma.pageVersion.updateMany({
    where: { pageId, groupId, fromTeacher },
    data: { sentAt: new Date() },
  });
  return result.count > 0;
}

// The caller's OWN row, always — the same rule every save follows, so there is
// nothing in a request that could point this at the other party's work.
export async function deleteVersion(
  pageId: string,
  groupId: string,
  fromTeacher: boolean,
): Promise<void> {
  await prisma.pageVersion.deleteMany({ where: { pageId, groupId, fromTeacher } });
}
```

- [ ] **Step 4: Verify it compiles and nothing regressed**

Run: `npx prisma generate && npm run typecheck && npm test`
Expected: typecheck clean, all tests pass. `lib/version-store.ts` has no unit test of its own — it is Prisma access — so this is a regression check, not a new-behaviour check.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations lib/version-store.ts
git commit -m "Record whether a saved version has been announced"
```

---

### Task 5: The send and restart routes

**Files:**
- Create: `app/api/worksheets/[slug]/[pageSlug]/send/route.ts`
- Create: `app/api/worksheets/[slug]/[pageSlug]/restart/route.ts`
- Modify: `app/api/worksheets/[slug]/[pageSlug]/route.ts` (remove its `createMessage` block)

**Interfaces:**
- Consumes: `findVersionMeta`, `markVersionSent`, `deleteVersion` from Task 4. `resolveWorksheet` from `@/lib/worksheet-context` (existing: returns `{ group: { id, name, slug }, page: { id, slug, title, kind }, role: "teacher" | "student" } | null`). `createMessage` from `@/lib/messages`, `versionNotice` from `@/lib/version-notice` — both moved, neither changed.
- Produces: two endpoints answering `204` on success. The send route answers `400 "Nothing to send."` when the caller has no row.

- [ ] **Step 1: Write the send route**

Create `app/api/worksheets/[slug]/[pageSlug]/send/route.ts`:

```ts
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { resolveWorksheet } from "@/lib/worksheet-context";
import { findVersionMeta, markVersionSent } from "@/lib/version-store";
import { createMessage } from "@/lib/messages";
import { versionNotice } from "@/lib/version-notice";

// The notice a save used to post by itself. Moving it here is the point of the
// whole change: a student revising three times told Jenn three times that the
// homework was finished, and auto-save would have made that forty times.
//
// It carries no body. Everything it needs is the caller's identity and which
// page they are on, and both come from the URL and the cookie — so there is
// nothing to bound and nothing to parse.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ slug: string; pageSlug: string }> },
) {
  const { slug, pageSlug } = await params;
  // The same gate the save route uses, reused whole: chatRole inside it
  // already refuses the everyone group before it checks the teacher, so
  // neither party can announce a version on /g/all, where there is no student
  // for one to belong to.
  const context = await resolveWorksheet(slug, pageSlug);
  if (!context) return new NextResponse("Not found", { status: 404 });

  // The caller's own row, exactly as a save writes the caller's own slot.
  // There is nothing in the request that says which row, so there is nothing
  // to forge.
  const fromTeacher = context.role === "teacher";

  const existing = await findVersionMeta(
    context.page.id,
    context.group.id,
    fromTeacher,
  );
  if (!existing) return new NextResponse("Nothing to send.", { status: 400 });

  // ORIGIN first, the request's own origin as the fallback — the choice
  // app/api/pages/route.ts makes for the same reason: this process sits behind
  // nginx, so request.url can carry an internal hostname the student's browser
  // cannot reach, where ORIGIN is the public domain set once in deployment.
  // The fallback exists for local dev, where ORIGIN is unset.
  //
  // Deliberately NOT run through addChatLinks: that would file this URL as a
  // second link tile on the shelf pointing at a worksheet the shelf already
  // shows as a tile.
  const origin = process.env.ORIGIN ?? new URL(_request.url).origin;
  const worksheetUrl = `${origin}/g/${context.group.slug}/w/${context.page.slug}`;

  // THE MESSAGE FIRST, THE MARK SECOND, and the failure is NOT swallowed.
  // This inverts what the save route did on purpose. There, the notice was a
  // courtesy beside the homework, so a failed notice must not cost the write.
  // Here the notice IS the request, and sentAt is only the record that it went
  // — so marking first would grey the button out over a message nobody
  // received, with no way to press it again.
  await createMessage({
    groupId: context.group.id,
    fromTeacher,
    body: versionNotice(context.page.title, fromTeacher, context.group.name),
    automated: true,
    href: worksheetUrl,
  });

  await markVersionSent(context.page.id, context.group.id, fromTeacher);

  revalidatePath("/g/[slug]", "page");
  return new NextResponse(null, { status: 204 });
}
```

- [ ] **Step 2: Write the restart route**

Create `app/api/worksheets/[slug]/[pageSlug]/restart/route.ts`:

```ts
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { resolveWorksheet } from "@/lib/worksheet-context";
import { deleteVersion } from "@/lib/version-store";

// Deletes the caller's OWN row. One rule, two names in the interface:
// "Recommencer" to a student, "Delete correction" to Jenn.
//
// A student needs it because auto-save took away their way out of an inert
// worksheet. A Dia worksheet answered by clicking comes back with every script
// stripped and nothing left to click; under two tabs they went back to the
// blank and started again, and under one tab this is the only way back.
//
// Jenn needs it because her read-only tabs must be reversible. One stray
// keystroke on the blank creates a correction and locks the other two, and
// there is no other control that unlocks them.
//
// It is not a version history. The row is gone, which is why the button
// confirms first. Deleting one party's row never touches the other's: they are
// two rows, and this names exactly one.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ slug: string; pageSlug: string }> },
) {
  const { slug, pageSlug } = await params;
  const context = await resolveWorksheet(slug, pageSlug);
  if (!context) return new NextResponse("Not found", { status: 404 });

  await deleteVersion(
    context.page.id,
    context.group.id,
    context.role === "teacher",
  );

  // The shelf's version badge counts rows, so it has to be told.
  revalidatePath("/g/[slug]", "page");
  return new NextResponse(null, { status: 204 });
}
```

- [ ] **Step 3: Take the notice out of the save route**

In `app/api/worksheets/[slug]/[pageSlug]/route.ts`, delete the whole block from the `// After the write, never before` comment down to and including the `try { … } catch { … }` around `createMessage`, and delete the now-unused imports of `createMessage` and `versionNotice`. Keep `revalidatePath("/g/[slug]", "page")` and the `204`.

Put this comment where the block was, immediately above the surviving `revalidatePath`:

```ts
  // No notice here any more. A save is now something that happens by itself
  // every ten seconds, and announcing each one would have filled the chat with
  // reports about work in progress. Telling the other party is a separate,
  // deliberate press — see ./send/route.ts.
```

- [ ] **Step 4: Verify**

Run: `npm run lint && npm run typecheck && npm test`
Expected: all clean. Lint must not report an unused import in the save route — if it does, one of the two imports was left behind.

- [ ] **Step 5: Commit**

```bash
git add app/api/worksheets
git commit -m "Make telling the other party a press, not a side effect of saving"
```

---

### Task 6: Seed a student's own slot from the blank

**Files:**
- Modify: `app/g/[slug]/w/[pageSlug]/raw/route.ts`

**Interfaces:**
- Consumes: `resolveWorksheet` (its `role` field), `getVersionHtml`, `getPageBySlug` — all already imported in this file.
- Produces: no new export. Behaviour only.

Without this the whole feature is broken on first use: a student who has typed nothing asks for `?v=student` and gets a 404 where their worksheet should be.

- [ ] **Step 1: Make the change**

In `app/g/[slug]/w/[pageSlug]/raw/route.ts`, replace the `if (asked === "student" || asked === "teacher") { … }` branch with:

```ts
  if (asked === "student" || asked === "teacher") {
    html = await getVersionHtml(
      context.page.id,
      context.group.id,
      asked === "teacher",
    );
    // THE SEED, and the condition is on the CALLER, not on the emptiness.
    //
    // A student who has typed nothing asks for their own slot and must receive
    // the blank: to them "?v=student" means "my homework", not "a saved
    // version", because they have no blank tab to ask for instead.
    //
    // The 404 below stands in every other case, on the grounds the comment
    // there gives: answering a request for "Marie's answers" with an empty
    // worksheet would be a working feature showing the wrong thing. Widening
    // this to "fall back whenever the row is missing" would serve Jenn an
    // empty document in place of a student's answers and let her correct it.
    if (html === null && asked === "student" && context.role === "student") {
      const page = await getPageBySlug(pageSlug);
      html = page?.html ?? null;
    }
  } else {
```

Leave the `else` branch and everything below it untouched.

- [ ] **Step 2: Verify**

Run: `npm run lint && npm run typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add "app/g/[slug]/w/[pageSlug]/raw/route.ts"
git commit -m "Seed a student's own copy from the blank"
```

---

### Task 7: The page — tabs, default slot, new props

**Files:**
- Modify: `app/g/[slug]/w/[pageSlug]/page.tsx`

**Interfaces:**
- Consumes: `visibleSlots` (Task 1), `isWritableSlot` (Task 2), `listVersions` with `sentAt` (Task 4).
- Produces: the props `WorksheetShell` takes in Task 8:
  `{ groupSlug: string; pageSlug: string; title: string; audience: "student" | "teacher"; studentName: string; slot: VersionSlot; slots: VersionSlot[]; writable: boolean; hasOwnVersion: boolean; sent: boolean }`

**The PDF branch does not change.** It keeps its own `slots` and its `canSaveFromSlot` call.

- [ ] **Step 1: Rewrite `readSlot`**

Replace the existing `readSlot` helper at the top of the file with:

```ts
// A student has no blank tab, so "blank" — and anything unrecognised — means
// "my homework" for them. Jenn keeps the blank as her default, which is the
// worksheet as she uploaded it.
function readSlot(value: string | undefined, audience: VersionAudience): VersionSlot {
  if (audience === "student") return value === "teacher" ? "teacher" : "student";
  if (value === "student" || value === "teacher") return value;
  return "blank";
}
```

Add `VersionAudience` to the existing `import { slotForVersion, type VersionSlot } from "@/lib/version-labels"` line, and add:

```ts
import { visibleSlots } from "@/lib/worksheet-slots";
import { isWritableSlot } from "@/lib/worksheet-save-slots";
```

(`canSaveFromSlot` stays imported — the PDF branch still uses it.)

- [ ] **Step 2: Split what the two branches compute**

Replace the block that currently reads

```ts
  const versions = await listVersions(context.page.id, context.group.id);
  const slots: VersionSlot[] = [
    "blank",
    ...versions.map((version) => slotForVersion(version.fromTeacher)),
  ];
  const audience = context.role === "teacher" ? "teacher" : "student";
  const slot = readSlot(v);
```

with

```ts
  const versions = await listVersions(context.page.id, context.group.id);
  const audience = context.role === "teacher" ? "teacher" : "student";
  const hasStudent = versions.some((version) => !version.fromTeacher);
  const hasTeacher = versions.some((version) => version.fromTeacher);

  // The pdf branch below is UNCHANGED and keeps the old list: blank plus every
  // row, for both parties. A pdf worksheet is filled in on paper, so a student
  // must be able to reach the blank and print it — the one thing the html rule
  // takes away.
  const pdfSlots: VersionSlot[] = [
    "blank",
    ...versions.map((version) => slotForVersion(version.fromTeacher)),
  ];
```

Then inside the `if (context.page.kind === "pdf")` block, change `const slot = readSlot(v)`'s two uses: add `const slot = readSlot(v, "teacher");` as the first line of that block — `"teacher"` and not `audience`, because the pdf branch wants the old three-slot reading for both parties — and pass `slots={pdfSlots}`. Replace the two `slots={slots}` / `slots` references in the `WorksheetHeading` inside `PdfShell` with `pdfSlots`.

- [ ] **Step 3: Compute the html branch's props**

Immediately above the final `return <WorksheetShell … />`, add:

```ts
  const slots = visibleSlots({ audience, hasStudent, hasTeacher });
  const asked = readSlot(v, audience);
  // A tab that is not drawn cannot be the current one. This catches a student
  // asking for "?v=teacher" before Jenn has corrected, and a bookmark to a tab
  // whose row has since been deleted — both of which would otherwise render a
  // strip with nothing selected over a 404 in the frame.
  const slot = slots.includes(asked) ? asked : slots[0];

  // The caller's OWN row, which is what Send and Delete both act on — never
  // the row whose tab happens to be open. Jenn reading Marie's attempt on a
  // read-only tab still gets a live Send if her correction is unannounced.
  const own = versions.find(
    (version) => version.fromTeacher === (audience === "teacher"),
  );
```

and pass to `WorksheetShell`:

```tsx
    <WorksheetShell
      groupSlug={slug}
      pageSlug={pageSlug}
      title={context.page.title}
      audience={audience}
      studentName={context.group.name}
      slot={slot}
      slots={slots}
      writable={isWritableSlot({ slot, audience, hasTeacher })}
      hasOwnVersion={Boolean(own)}
      // Reduced to a boolean HERE, on the server. A Date would serialise
      // across the boundary, but nothing in the client needs to know when —
      // and lib/worksheet-send.ts is written to take facts, not rows.
      sent={own?.sentAt != null}
    />
```

- [ ] **Step 4: Do not commit yet — continue straight into Task 8**

**Tasks 7 and 8 are one unit of work and one commit.** They are written as two
tasks because they are two files with two different jobs, but the props added
here are the props Task 8 consumes, and a commit holding only half of that does
not typecheck. Finish Task 8, then run the full check and commit once.

Do not stub `WorksheetShell` to make an intermediate state compile. The
throwaway edit would be removed an hour later and reviewed by nobody.

---

### Task 8: Auto-save

**Files:**
- Create: `components/worksheet/frame.ts`
- Create: `components/worksheet/useWorksheetAutosave.ts`
- Modify: `components/worksheet/WorksheetShell.tsx`
- Delete: `components/worksheet/SaveVersionButton.tsx`

**Interfaces:**
- Consumes: `writable`, `hasOwnVersion`, `sent` props from Task 7. `SNAPSHOT_MESSAGE`, `EDITABLE_MESSAGE`, `DIRTY_MESSAGE` from `@/lib/printable-bootstrap` (all existing exports).
- Produces:
  - `components/worksheet/frame.ts`: `WORKSHEET_FRAME_ID: string`, `worksheetFrame(): HTMLIFrameElement | null`, `requestSnapshot(): Promise<string | null>`
  - `components/worksheet/useWorksheetAutosave.ts`: `DEBOUNCE_MS`, `type SaveStatus = "idle" | "saving" | "saved" | "error"`, and
    `useWorksheetAutosave(input: { groupSlug: string; pageSlug: string; audience: "student" | "teacher"; writable: boolean; onSaved: () => void }): { status: SaveStatus; dirty: boolean; editable: boolean | null; error: string | null; flush: () => Promise<boolean> }`

- [ ] **Step 1: Lift the frame plumbing out**

Create `components/worksheet/frame.ts`:

```ts
import { SNAPSHOT_MESSAGE } from "@/lib/printable-bootstrap";

export const WORKSHEET_FRAME_ID = "worksheet-document";

// A silent failure here loses a student's homework, which is why this resolves
// null rather than throwing, and why every caller reports it. It INVERTS
// captureHtmlThumbnail's contract deliberately: a missing preview leaves a
// working iframe in place, and a missing snapshot leaves nothing.
const TIMEOUT_MS = 10_000;

export function worksheetFrame(): HTMLIFrameElement | null {
  const frame = document.getElementById(WORKSHEET_FRAME_ID);
  return frame instanceof HTMLIFrameElement ? frame : null;
}

// Asks the framed document for its serialised DOM. Lifted verbatim out of the
// old SaveVersionButton so the auto-saver and the Send button's flush share one
// copy rather than two that drift.
export function requestSnapshot(): Promise<string | null> {
  const frame = worksheetFrame();
  if (!frame?.contentWindow) return Promise.resolve(null);
  // Captured non-nullable: TS narrows at this line but does not carry the
  // narrowing into the closures below, which run later.
  const contentWindow = frame.contentWindow;

  return new Promise<string | null>((resolve) => {
    const timer = window.setTimeout(() => finish(null), TIMEOUT_MS);

    function finish(value: string | null) {
      window.clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      resolve(value);
    }

    function onMessage(event: MessageEvent) {
      // The frame is the only window that may answer, and it has an opaque
      // origin — so this checks the SOURCE, as the listener inside it does.
      if (event.source !== contentWindow) return;
      const data = event.data as
        | { type?: string; ok?: boolean; html?: string }
        | null;
      if (!data || data.type !== SNAPSHOT_MESSAGE) return;
      finish(data.ok && typeof data.html === "string" ? data.html : null);
    }

    window.addEventListener("message", onMessage);
    // "*" because the frame's origin is opaque — there is no origin string
    // that would match it. The listener authenticates us from the other side.
    contentWindow.postMessage(SNAPSHOT_MESSAGE, "*");
  });
}
```

- [ ] **Step 2: Write the hook**

Create `components/worksheet/useWorksheetAutosave.ts`:

```ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DIRTY_MESSAGE, EDITABLE_MESSAGE } from "@/lib/printable-bootstrap";
import { requestSnapshot, worksheetFrame } from "@/components/worksheet/frame";

// Ten seconds is a compromise, not a measurement: short enough that a closed
// laptop loses one sentence, long enough that a paragraph costs one write
// rather than forty. A write is the WHOLE DOM — 40-70 KB after brotli — so it
// is not free.
export const DEBOUNCE_MS = 10_000;

export type SaveStatus = "idle" | "saving" | "saved" | "error";

// Every fact about "is there work here worth keeping", in one place, because
// they are one question asked three ways: the pill's state, the leave prompt,
// and whether the timer should be running.
export function useWorksheetAutosave({
  groupSlug,
  pageSlug,
  audience,
  writable,
  onSaved,
}: {
  groupSlug: string;
  pageSlug: string;
  audience: "student" | "teacher";
  // isWritableSlot's answer for the tab being shown. A read-only tab still
  // types — text fields are browser behaviour, and stopping them would mean
  // rewriting the served document — so this gates the WRITE, not the typing.
  writable: boolean;
  // Told after a write lands, never before. The shell adds the new tab and
  // moves the address on the first one.
  onSaved: () => void;
}) {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [dirty, setDirty] = useState(false);
  // null until the document has answered, and null on the server too, so there
  // is nothing for hydration to disagree about.
  const [editable, setEditable] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  const timer = useRef<number | null>(null);
  // Read inside the debounce callback, which is created once. A state value
  // read there would be the value from the render that created it.
  const writableRef = useRef(writable);
  writableRef.current = writable;
  const savingRef = useRef(false);

  const save = useCallback(async (): Promise<boolean> => {
    if (savingRef.current) return false;
    savingRef.current = true;
    setStatus("saving");
    setError(null);

    const html = await requestSnapshot();
    const failed =
      audience === "teacher"
        ? "That didn't save. Try again."
        : "L'enregistrement a échoué. Essaie encore.";

    if (html === null) {
      savingRef.current = false;
      setStatus("error");
      setError(failed);
      return false;
    }

    const response = await fetch(`/api/worksheets/${groupSlug}/${pageSlug}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ html }),
    });

    savingRef.current = false;

    if (!response.ok) {
      // The route's own text is English and written for whoever is debugging
      // it. Jenn reads English, so her side keeps the specific reason; a
      // student gets one sentence instead of a leaked server string.
      const reason = await response.text();
      setStatus("error");
      setError(audience === "teacher" ? reason : failed);
      // Deliberately NOT rescheduled. Only a change schedules a write, so a
      // document too large to store fails once and then waits, instead of
      // failing every ten seconds for as long as the tab is open.
      return false;
    }

    setStatus("saved");
    setDirty(false);
    onSaved();
    return true;
  }, [audience, groupSlug, pageSlug, onSaved]);

  // Every change the document reports, and the probe's answer. The frame is
  // the only window that may speak, and it has an opaque origin, so this
  // checks the SOURCE.
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const frame = worksheetFrame();
      if (!frame || event.source !== frame.contentWindow) return;
      const data = event.data as { type?: string; editable?: boolean } | null;
      if (!data) return;

      if (data.type === EDITABLE_MESSAGE) setEditable(Boolean(data.editable));

      if (data.type === DIRTY_MESSAGE) {
        setDirty(true);
        if (!writableRef.current) return;
        if (timer.current !== null) window.clearTimeout(timer.current);
        // Restarted on every change, so a run of typing costs one write and
        // the ten seconds are counted from the LAST key, not the first.
        timer.current = window.setTimeout(() => {
          timer.current = null;
          void save();
        }, DEBOUNCE_MS);
      }
    }

    window.addEventListener("message", onMessage);

    // ASKED HERE AS WELL AS ON THE IFRAME'S onLoad, and both are needed. The
    // version tabs and the back control are plain anchors, so moving between
    // versions is a full document load — and on a full load the frame can
    // finish loading BEFORE React hydrates and attaches onLoad, which React
    // does not replay. Arriving from the shelf chooser hides it: that is a
    // next/link navigation, so the handler is attached first. Same URL, same
    // document, opposite outcome.
    worksheetFrame()?.contentWindow?.postMessage(EDITABLE_MESSAGE, "*");

    return () => {
      window.removeEventListener("message", onMessage);
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, [save]);

  // Write now, if there is anything outstanding. Send calls this before it
  // announces anything: a notice about work that was never stored is worse
  // than a late notice.
  const flush = useCallback(async (): Promise<boolean> => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    if (!dirty || !writable) return true;
    return save();
  }, [dirty, writable, save]);

  return { status, dirty, editable, error, flush };
}
```

- [ ] **Step 3: Rewrite the shell's body**

In `components/worksheet/WorksheetShell.tsx`: delete the two `useState` declarations, both `useEffect`s that handled messages, the `canSave` const, and the `SaveVersionButton` import and JSX. Keep the `ShellBar`, the `WorksheetHeading`, the `iframe` (including its `onLoad` probe and its sandbox exactly as they are), and the `PrintButton`.

New signature and body above the JSX:

```tsx
export function WorksheetShell({
  groupSlug,
  pageSlug,
  title,
  audience,
  studentName,
  slot,
  slots,
  writable,
  hasOwnVersion,
  sent,
}: {
  groupSlug: string;
  pageSlug: string;
  title: string;
  audience: "student" | "teacher";
  studentName: string;
  slot: VersionSlot;
  slots: VersionSlot[];
  writable: boolean;
  hasOwnVersion: boolean;
  sent: boolean;
}) {
  // The server's answers, held locally because the first auto-save changes
  // both of them without a reload.
  const [ownExists, setOwnExists] = useState(hasOwnVersion);
  const [announced, setAnnounced] = useState(sent);
  const [tabs, setTabs] = useState(slots);
  const [current, setCurrent] = useState(slot);

  const onSaved = useCallback(() => {
    // Every save clears sentAt on the server, so the button comes back to
    // life here to match.
    setAnnounced(false);
    if (ownExists) return;
    setOwnExists(true);

    // THE FIRST SAVE MOVES THE SHELL IN PLACE, and does not reload. The frame's
    // DOM already IS the new version — a reload would fetch the same bytes back
    // and throw away any key pressed during it.
    //
    // This is what Jenn sees: she starts on Marie's answers with no correction,
    // types, and ten seconds later she is on "My correction" holding the
    // document she has been typing in. The address now agrees with where her
    // work went.
    const mine: VersionSlot = audience === "teacher" ? "teacher" : "student";
    setTabs((existing) =>
      existing.includes(mine)
        ? existing
        : // Blank, then the student, then Jenn — the order visibleSlots and
          // listVersions both keep, so the strip does not reshuffle on reload.
          (["blank", "student", "teacher"] as VersionSlot[]).filter(
            (candidate) => existing.includes(candidate) || candidate === mine,
          ),
    );
    setCurrent(mine);
    window.history.replaceState(null, "", `?v=${mine}`);
  }, [audience, ownExists]);

  const { dirty, editable, error, flush } = useWorksheetAutosave({
    groupSlug,
    pageSlug,
    audience,
    writable,
    onSaved,
  });

  // The browser's own leave prompt, armed only while a write is outstanding.
  // Auto-save shrinks the window it guards from "since you last pressed the
  // pill" to "the last ten seconds", which is the point — but ten seconds of a
  // student's answers is still worth a dialog.
  //
  // It covers the version tabs, the back control and closing the tab, because
  // each is a real document navigation: those are plain anchors, not
  // next/link. It does NOT cover browser Back — the same accepted gap the
  // whiteboard's leave-guard records, since beforeunload does not fire for an
  // App Router popstate.
  useEffect(() => {
    if (!dirty || !writable) return;

    function onBeforeUnload(event: BeforeUnloadEvent) {
      // Both, because browsers disagree about which one arms the dialog, and
      // no browser lets the wording be chosen.
      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty, writable]);
```

Add the imports it now needs:

```ts
import { useCallback, useEffect, useState } from "react";
import { WORKSHEET_FRAME_ID } from "@/components/worksheet/frame";
import { useWorksheetAutosave } from "@/components/worksheet/useWorksheetAutosave";
```

and delete the `canSaveFromSlot`, `DIRTY_MESSAGE`, `EDITABLE_MESSAGE` and `SaveVersionButton` imports.

In the JSX, pass `slots={tabs}` and `slot={current}` to `WorksheetHeading`. Replace the `{canSave && <SaveVersionButton … />}` block with the error line only for now — the two buttons arrive in Task 9:

```tsx
        {error && (
          <p className="max-w-xs rounded-lg bg-white px-3 py-2 text-sm text-[var(--card-rouge)] shadow-[var(--card-shadow)]">
            {error}
          </p>
        )}
```

Leave `{/* eslint-disable-next-line */}`-style suppressions out; if `editable` is reported unused at this step, prefix it in the destructure as `editable` and consume it in Task 9 — do not delete it.

- [ ] **Step 4: Delete the old button**

```bash
git rm components/worksheet/SaveVersionButton.tsx
```

- [ ] **Step 5: Verify**

Run: `npm run lint && npm run typecheck && npm test && npm run build`
Expected: all clean. This closes the typecheck failure Task 7 opened. If lint reports `editable` as unused, leave it and note it — Task 9 consumes it. If lint is configured to fail on it, temporarily destructure without it and add it back in Task 9.

- [ ] **Step 6: Commit Tasks 7 and 8 together**

```bash
git add components/worksheet "app/g/[slug]/w/[pageSlug]/page.tsx"
git commit -m "Save the worksheet by itself, ten seconds after the last key"
```

---

### Task 9: Send, Delete, and the read-only marker

**Files:**
- Create: `components/worksheet/SendVersionButton.tsx`
- Create: `components/worksheet/DeleteVersionButton.tsx`
- Modify: `components/worksheet/WorksheetShell.tsx`
- Modify: `.claude/rules/worksheets.md`

**Interfaces:**
- Consumes: `sendState` and `SendState` (Task 3); `flush`, `dirty`, `editable` from the hook (Task 8); `ownExists`, `announced`, `setAnnounced` from the shell.
- Produces:
  - `SendVersionButton(props: { groupSlug: string; pageSlug: string; audience: "student" | "teacher"; studentName: string; state: SendState; flush: () => Promise<boolean>; onSent: () => void })`
  - `DeleteVersionButton(props: { groupSlug: string; pageSlug: string; audience: "student" | "teacher" })`

- [ ] **Step 1: Write the Send button**

Create `components/worksheet/SendVersionButton.tsx`:

```tsx
"use client";

import { useState } from "react";
import type { SendState } from "@/lib/worksheet-send";
import { firstNameOf } from "@/lib/student-greeting";

// A notice and nothing else. Every save has already happened by the time this
// is pressed — which is exactly what makes it pressable without fear, and what
// the old Save pill could never be.
export function SendVersionButton({
  groupSlug,
  pageSlug,
  audience,
  studentName,
  state,
  flush,
  onSent,
}: {
  groupSlug: string;
  pageSlug: string;
  audience: "student" | "teacher";
  studentName: string;
  state: SendState;
  // Writes anything the debounce still holds. Awaited before the notice goes,
  // so the message can never announce work that was never stored.
  flush: () => Promise<boolean>;
  onSent: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setBusy(true);
    setError(null);

    const written = await flush();
    if (!written) {
      setBusy(false);
      // The hook is already showing its own reason for the failed write. This
      // says only that the notice did not go, which is the part the pill owns.
      setError(
        audience === "teacher"
          ? "Save that first — it didn't go."
          : "Enregistrement impossible. Rien n'a été envoyé.",
      );
      return;
    }

    const response = await fetch(
      `/api/worksheets/${groupSlug}/${pageSlug}/send`,
      { method: "POST" },
    );
    setBusy(false);

    if (!response.ok) {
      setError(
        audience === "teacher"
          ? await response.text()
          : "L'envoi a échoué. Essaie encore.",
      );
      return;
    }

    // After the write landed, never before — the ordering createMessage and
    // addChatLinks both keep.
    onSent();
  }

  // The whole name for Jenn, the rule versionLabel already keeps: two students
  // can share a first name. The student's own button names Jenn, of whom there
  // is exactly one.
  const label =
    audience === "teacher"
      ? `Send to ${firstNameOf(studentName) ?? studentName}`
      : "Envoyer à Jenn";
  const doneLabel = audience === "teacher" ? "Sent" : "Envoyé";
  const busyLabel = audience === "teacher" ? "Sending…" : "Envoi…";

  const disabled = state !== "ready" || busy;
  const why =
    state === "empty"
      ? audience === "teacher"
        ? "Nothing saved to send yet"
        : "Il n'y a rien à envoyer pour le moment"
      : state === "sent"
        ? audience === "teacher"
          ? "Already sent — change something to send again"
          : "Déjà envoyé — modifie quelque chose pour renvoyer"
        : undefined;

  return (
    <>
      {error && (
        <p className="max-w-xs rounded-lg bg-white px-3 py-2 text-sm text-[var(--card-rouge)] shadow-[var(--card-shadow)]">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={send}
        disabled={disabled}
        // The title carries what a greyed-out control cannot say by itself.
        // There is no hover on a phone, which is why the state is also in the
        // label: "Envoyé" says the press worked, where a vanished button
        // would say nothing at all.
        title={why}
        className="flex items-center gap-2 rounded-full bg-[var(--card-rouge)] px-5 py-3 font-[family-name:var(--card-font-serif)] text-sm text-white shadow-[var(--card-shadow)] transition-opacity hover:opacity-90 motion-reduce:transition-none disabled:opacity-60"
      >
        {busy ? busyLabel : state === "sent" ? doneLabel : label}
      </button>
    </>
  );
}
```

- [ ] **Step 2: Write the Delete button**

Create `components/worksheet/DeleteVersionButton.tsx`:

```tsx
"use client";

import { useState } from "react";

// One control, two names, one rule: it deletes the caller's OWN row.
//
// To a student it is the way out of an inert worksheet — a Dia document
// answered by clicking comes back with its scripts stripped and nothing left
// to click, and under one tab there is no blank to go back to.
//
// To Jenn it is the only thing that makes her read-only tabs writable again.
// One stray keystroke on the blank creates a correction and locks the other
// two, so this is drawn on ALL THREE of her tabs — a control that unlocks them
// is useless if it is only on the tab she must first know to open.
export function DeleteVersionButton({
  groupSlug,
  pageSlug,
  audience,
}: {
  groupSlug: string;
  pageSlug: string;
  audience: "student" | "teacher";
}) {
  const [busy, setBusy] = useState(false);

  async function remove() {
    // There is no version history behind this. The row is gone, so it asks.
    const question =
      audience === "teacher"
        ? "Delete your correction? This cannot be undone."
        : "Recommencer ce devoir ? Tes réponses seront effacées.";
    if (!window.confirm(question)) return;

    setBusy(true);
    const response = await fetch(
      `/api/worksheets/${groupSlug}/${pageSlug}/restart`,
      { method: "POST" },
    );
    if (!response.ok) {
      setBusy(false);
      return;
    }

    // A full navigation with no ?v=, rather than a reload: the tab that was
    // open no longer exists, and the page picks each party's correct default
    // for itself. A reload would land on a deleted slot.
    window.location.href = `/g/${groupSlug}/w/${pageSlug}`;
  }

  return (
    <button
      type="button"
      onClick={remove}
      disabled={busy}
      className="rounded-full border border-[var(--card-line)] bg-[var(--card-paper)] px-4 py-2 font-[family-name:var(--card-font-serif)] text-sm text-[var(--card-moss)] shadow-[var(--card-shadow)] transition-opacity hover:opacity-90 motion-reduce:transition-none disabled:opacity-60"
    >
      {audience === "teacher" ? "Delete correction" : "Recommencer"}
    </button>
  );
}
```

- [ ] **Step 3: Wire both into the shell, with the read-only marker**

In `components/worksheet/WorksheetShell.tsx`, add:

```ts
import { sendState } from "@/lib/worksheet-send";
import { SendVersionButton } from "@/components/worksheet/SendVersionButton";
import { DeleteVersionButton } from "@/components/worksheet/DeleteVersionButton";
```

Compute above the JSX:

```ts
  const send = sendState({ hasOwnVersion: ownExists, sent: announced, dirty });

  // The student's own copy has come back inert. This is the case Recommencer
  // exists for, and a disabled document with no explanation beside it reads as
  // a broken page rather than a worksheet that cannot be re-typed.
  const stuck = writable && ownExists && editable === false;
```

Replace the fixed bottom-right container's contents with:

```tsx
      <div className="fixed bottom-5 right-5 z-10 flex flex-col items-end gap-2 print:hidden">
        {error && (
          <p className="max-w-xs rounded-lg bg-white px-3 py-2 text-sm text-[var(--card-rouge)] shadow-[var(--card-shadow)]">
            {error}
          </p>
        )}
        {stuck && (
          <p className="max-w-xs rounded-lg bg-white px-3 py-2 text-sm text-[var(--card-moss)] shadow-[var(--card-shadow)]">
            {audience === "teacher"
              ? "This document can't be typed in any more. Delete it to start again."
              : "On ne peut plus écrire dans cette copie. Recommence pour la refaire."}
          </p>
        )}
        <PrintButton className="static" frameId={WORKSHEET_FRAME_ID} />
        {/* Both follow the caller's OWN row, never the tab that is open. Jenn
            reading Marie's attempt on a read-only tab still gets a live Send
            if her correction is unannounced, and still gets the delete that
            unlocks the tab she is standing on. */}
        {ownExists && (
          <DeleteVersionButton
            groupSlug={groupSlug}
            pageSlug={pageSlug}
            audience={audience}
          />
        )}
        <SendVersionButton
          groupSlug={groupSlug}
          pageSlug={pageSlug}
          audience={audience}
          studentName={studentName}
          state={send}
          flush={flush}
          onSent={() => setAnnounced(true)}
        />
      </div>
```

Add the read-only marker to the bar. In the `ShellBar`'s `center`, wrap the heading:

```tsx
        center={
          <div className="flex min-w-0 items-center gap-2">
            <WorksheetHeading
              slots={tabs}
              slot={current}
              audience={audience}
              studentName={studentName}
              title={title}
            />
            {!writable && (
              // Says what the tab cannot: it still TYPES, because text fields
              // are browser behaviour and stopping them would mean rewriting
              // the served document. Nothing typed here is kept.
              <span className="shrink-0 whitespace-nowrap rounded-full border border-[var(--card-line)] px-3 py-1 text-xs text-[var(--card-moss)]">
                {audience === "teacher" ? "Read-only" : "Lecture seule"}
              </span>
            )}
          </div>
        }
```

- [ ] **Step 4: Record the new rules**

In `.claude/rules/worksheets.md`, replace the paragraph beginning "**Which tabs may draw it is decided first**" and the paragraph beginning "**The pill is disabled until the document reports a change**" with a section describing: the two-tab/three-tab table, `isWritableSlot` beside `canSaveFromSlot` and why both exist, the ten-second debounce, `sentAt` and why it is nulled rather than compared, the first-save `replaceState`, and the delete route. Keep every existing prohibition in the file. Add to CLAUDE.md's prohibition list, in the "Files/worksheets" area:

```
- **`canSaveFromSlot` and `isWritableSlot` are two rules, not one.** The first
  governs PDF uploads, the second html auto-save. They disagree about Jenn on
  purpose, because a press and a ten-second timer are not the same act.
```

- [ ] **Step 5: Verify everything**

```bash
npx prisma generate && npm run lint && npm run typecheck && npm test && npm run build
```

Expected: every step clean. This is CI's exact order.

- [ ] **Step 6: Commit**

```bash
git add components/worksheet .claude/rules/worksheets.md CLAUDE.md
git commit -m "Turn Save into Send, and give each party a way to start again"
```

---

### Task 10: Manual verification

No code. The pure rules are tested; the shell is not, and the shell is where the flow lives.

**Files:** none.

- [ ] **Step 1: Run the app**

```bash
npm run dev
```

- [ ] **Step 2: Walk the student path**

Sign in as a student on `/g/<slug>`, open an HTML worksheet from the Files tab, and confirm each of these:

1. One tab is not drawn at all — the bar shows the document's title.
2. Typing, then waiting ten seconds, then reloading: the answers are still there. Still one tab.
3. *Envoyer à Jenn* is disabled and titled before anything is typed, live after typing, and reads *Envoyé* and is disabled after a press with nothing changed since.
4. Jenn's inbox holds exactly ONE automated message for the whole session, posted by the press and not by any save.
5. Typing again re-enables the button. A second press posts a second message.
6. *Recommencer* asks first, and lands on the blank worksheet again.

- [ ] **Step 3: Walk Jenn's path**

As the teacher on the same worksheet:

1. Before the student typed: one tab, the title, and typing seeds a correction.
2. After the student typed: two tabs — *The worksheet* and *Marie's answers*. Type on Marie's answers, wait ten seconds, and watch the strip gain *My correction* and select it **without the page reloading**. The address must read `?v=teacher`.
3. Reload: three tabs. *The worksheet* and *Marie's answers* both carry *Read-only*, and typing in them survives nothing.
4. *Send to Marie* is live, and posts one message. It is live from a read-only tab too.
5. *Delete correction* is on all three tabs. Pressing it drops to two tabs, and *Marie's answers* is writable again.

- [ ] **Step 4: Confirm PDFs did not move**

Open a PDF worksheet as each party. Three tabs for both, the upload control where it was, and an upload still posts a message on its own. Nothing on this path may have changed.

- [ ] **Step 5: Commit anything the walk fixed**

If steps 2–4 turned up a fault, fix it, re-run the full check from Task 9 Step 5, and commit. If nothing did, there is nothing to commit.
</content>
