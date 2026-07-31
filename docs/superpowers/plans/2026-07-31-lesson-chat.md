# Lesson Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A student opens one link and gets their card, their files, and a live two-way conversation with Jenn; she sees the same conversation from the admin and can tell at a glance who has written to her.

**Architecture:** Two random tokens per student gate the private half of a page whose card stays public. Messages are rows the instant they are sent, streamed to open viewers over SSE with an in-process `EventEmitter` — correct because pm2 runs a single process in fork mode. Four pure modules in `lib/` carry every rule; the routes and components around them stay thin.

**Tech Stack:** Next.js 16 App Router (server components, `"use client"` islands, middleware, route handlers), Prisma/SQLite, Tailwind v4 with CSS custom properties, Vitest.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-07-31-student-chat-design.md`. Read it before starting. This plan is **Part 2**. Part 1 (the everyone group, `isEveryone`, `effectivePages`, inheritance in `listPagesForGroup`) is already merged — build on it, do not re-implement it.
- **Logic belongs in `lib/`.** Anything with a rule in it is a pure function in `lib/` with a test in `tests/lib/`. Components, Prisma access and route handlers are not unit-tested.
- **Comments explain the "why", especially the counter-intuitive.** Never add comments that restate the code. Every comment shown in this plan is part of the deliverable — reproduce it.
- **Imports** use the `@/` alias for repo-root-relative paths.
- **The student side is French; the admin side is English.** Chat UI a student sees is French.
- **The daily card stays public.** An untokened visit to `/g/marie` must render exactly what it renders today — card only, no tabs, no chat button, no hint that a private conversation exists. This is the load-bearing rule of the whole feature; every existing bookmark depends on it.
- **The everyone group has no chat and no tokens.** `isEveryone` rows keep `chatToken` and `filesToken` null.
- **Retention is forever.** No expiry, no cleanup job. Jenn can delete an individual message.
- **Never touch** `app/p/[slug]/raw/route.ts` or its CSP, `lib/card-ai.ts`, or anything under `GlobalCard`/`Card` resolution.
- **After any `prisma/schema.prisma` change**, run `npx prisma generate`, and create the migration with `npx prisma migrate dev --name <name>` so the migration file is committed.
- **Do not run `npx prisma migrate reset`** or delete `prisma/dev.db`. It holds the only local passkey. Verify migrations on throwaway copies under `/tmp`.
- **Local checks:** `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`. Baseline entering this plan: **23 files, 252 tests.**

---

### Task 1: The student's two tabs

**Files:**
- Create: `lib/student-tab.ts`
- Test: `tests/lib/student-tab.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `type StudentTab = "card" | "files"`, `parseStudentTab(value: string | undefined, hasFiles: boolean): StudentTab`.

The `hasFiles` argument is the rule: a student without files, or an untokened visitor who may not see them, resolves to the card whatever the URL says. A forwarded `?tab=files` link must not land a stranger on a tab that should not exist for them.

- [ ] **Step 1: Write the failing test**

Create `tests/lib/student-tab.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseStudentTab } from "@/lib/student-tab";

describe("parseStudentTab", () => {
  it("defaults to the card when the param is absent", () => {
    expect(parseStudentTab(undefined, true)).toBe("card");
  });

  it("returns the files tab when asked for and available", () => {
    expect(parseStudentTab("files", true)).toBe("files");
  });

  it("returns the card when asked for explicitly", () => {
    expect(parseStudentTab("card", true)).toBe("card");
  });

  it("falls back to the card when there are no files to show", () => {
    expect(parseStudentTab("files", false)).toBe("card");
  });

  it("falls back to the card for an unrecognised value", () => {
    expect(parseStudentTab("chat", true)).toBe("card");
  });

  it("is case sensitive, so a capitalised value falls back", () => {
    expect(parseStudentTab("Files", true)).toBe("card");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/lib/student-tab.test.ts`
Expected: FAIL — cannot resolve `@/lib/student-tab`.

- [ ] **Step 3: Write the implementation**

Create `lib/student-tab.ts`:

```ts
export type StudentTab = "card" | "files";

// `hasFiles` is the whole point of the second argument: an untokened visitor
// has no files tab, and a forwarded ?tab=files link must land them on the card
// rather than on a tab that should not exist for them.
export function parseStudentTab(
  value: string | undefined,
  hasFiles: boolean,
): StudentTab {
  return value === "files" && hasFiles ? "files" : "card";
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/lib/student-tab.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/student-tab.ts tests/lib/student-tab.test.ts
git commit -m "feat: parse the student page's tab param"
```

---

### Task 2: Day separators

**Files:**
- Create: `lib/chat-day.ts`
- Test: `tests/lib/chat-day.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `type DayGroup<T> = { day: string; messages: T[] }`, `groupByDay<T extends { createdAt: Date }>(messages: T[]): DayGroup<T>[]`.

`day` is a `YYYY-MM-DD` string. The spec chose a continuous log with day separators over a session model, so this function is what "a lesson" means in this codebase.

**Timezone:** days are computed in **UTC**, matching every other date in this project (`CLAUDE.md`: every date is UTC midnight, formatted with `timeZone: "UTC"`). A message at 20:00 Montréal on 30 July is 00:00 UTC on 31 July and lands under the 31st. That is a known, accepted consequence of the project-wide rule; do not introduce a local-time exception here.

- [ ] **Step 1: Write the failing test**

Create `tests/lib/chat-day.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { groupByDay } from "@/lib/chat-day";

const at = (iso: string) => ({ createdAt: new Date(iso) });

describe("groupByDay", () => {
  it("returns nothing for no messages", () => {
    expect(groupByDay([])).toEqual([]);
  });

  it("puts one day's messages under one heading", () => {
    const result = groupByDay([
      at("2026-07-30T10:00:00Z"),
      at("2026-07-30T18:30:00Z"),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].day).toBe("2026-07-30");
    expect(result[0].messages).toHaveLength(2);
  });

  it("splits messages across two days", () => {
    const result = groupByDay([
      at("2026-07-30T10:00:00Z"),
      at("2026-07-31T09:00:00Z"),
    ]);
    expect(result.map((g) => g.day)).toEqual(["2026-07-30", "2026-07-31"]);
  });

  it("groups in UTC, so a late-evening Montreal message lands on the next day", () => {
    // 20:00 in Montreal on the 30th is 00:00 UTC on the 31st.
    expect(groupByDay([at("2026-07-31T00:00:00Z")])[0].day).toBe("2026-07-31");
  });

  it("preserves the order messages arrived in within a day", () => {
    const first = at("2026-07-30T10:00:00Z");
    const second = at("2026-07-30T11:00:00Z");
    expect(groupByDay([first, second])[0].messages).toEqual([first, second]);
  });

  it("keeps the caller's own fields on the messages it returns", () => {
    const rich = [{ createdAt: new Date("2026-07-30T10:00:00Z"), body: "salut" }];
    expect(groupByDay(rich)[0].messages[0].body).toBe("salut");
  });

  it("starts a new group when the day changes back and forth", () => {
    const result = groupByDay([
      at("2026-07-30T10:00:00Z"),
      at("2026-07-31T10:00:00Z"),
      at("2026-08-01T10:00:00Z"),
    ]);
    expect(result).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/lib/chat-day.test.ts`
Expected: FAIL — cannot resolve `@/lib/chat-day`.

- [ ] **Step 3: Write the implementation**

Create `lib/chat-day.ts`:

```ts
export type DayGroup<T> = { day: string; messages: T[] };

// The spec chose a continuous log with day separators over a session model, so
// this is what "a lesson" means here — whatever happened on one calendar day.
//
// UTC, like every other date in this project. A message sent at 20:00 in
// Montreal lands under the following day's heading; that is the cost of the
// project-wide rule, not an oversight.
export function groupByDay<T extends { createdAt: Date }>(
  messages: T[],
): DayGroup<T>[] {
  const groups: DayGroup<T>[] = [];

  for (const message of messages) {
    const day = message.createdAt.toISOString().slice(0, 10);
    const current = groups[groups.length - 1];

    // Compared against the last group rather than looked up in a map: the
    // caller hands these over already ordered, so a day that reappears later
    // would mean the ordering broke, and silently merging it would hide that.
    if (current && current.day === day) {
      current.messages.push(message);
    } else {
      groups.push({ day, messages: [message] });
    }
  }

  return groups;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/lib/chat-day.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/chat-day.ts tests/lib/chat-day.test.ts
git commit -m "feat: group chat messages into days"
```

---

### Task 3: Student tokens

**Files:**
- Create: `lib/student-tokens.ts`
- Test: `tests/lib/student-tokens.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `newToken(): string` — 32 hex characters from `crypto.randomBytes(16)`
  - `readToken(fromQuery: string | undefined, fromCookie: string | undefined): string | null`
  - `STUDENT_COOKIE = "student-token"`
  - `cookiePathFor(slug: string): string`

`readToken` takes two plain strings rather than a request, so the precedence rule is testable without a server. The query wins over the cookie: a freshly shared link must override a stale cookie from a rotated token, or a student whose link Jenn regenerated could never get back in.

- [ ] **Step 1: Write the failing test**

Create `tests/lib/student-tokens.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  newToken,
  readToken,
  cookiePathFor,
  STUDENT_COOKIE,
} from "@/lib/student-tokens";

describe("newToken", () => {
  it("is 32 hex characters", () => {
    expect(newToken()).toMatch(/^[0-9a-f]{32}$/);
  });

  it("does not repeat", () => {
    const tokens = new Set(Array.from({ length: 50 }, () => newToken()));
    expect(tokens.size).toBe(50);
  });
});

describe("readToken", () => {
  it("returns null when neither source has one", () => {
    expect(readToken(undefined, undefined)).toBeNull();
  });

  it("reads the cookie when there is no query token", () => {
    expect(readToken(undefined, "cookievalue")).toBe("cookievalue");
  });

  it("reads the query token when there is no cookie", () => {
    expect(readToken("queryvalue", undefined)).toBe("queryvalue");
  });

  it("prefers the query token, so a reissued link overrides a stale cookie", () => {
    expect(readToken("fresh", "stale")).toBe("fresh");
  });

  it("treats an empty string as absent", () => {
    expect(readToken("", "cookievalue")).toBe("cookievalue");
    expect(readToken("", "")).toBeNull();
  });
});

describe("cookiePathFor", () => {
  it("scopes the cookie to that student's page", () => {
    expect(cookiePathFor("marie")).toBe("/g/marie");
  });

  it("names the cookie the same for every student", () => {
    expect(STUDENT_COOKIE).toBe("student-token");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/lib/student-tokens.test.ts`
Expected: FAIL — cannot resolve `@/lib/student-tokens`.

- [ ] **Step 3: Write the implementation**

Create `lib/student-tokens.ts`:

```ts
import { randomBytes } from "crypto";

export const STUDENT_COOKIE = "student-token";

export function newToken(): string {
  return randomBytes(16).toString("hex");
}

// Scoped to one student's page, so a browser holding several students' tokens
// (a family sharing a laptop) sends only the right one, and a leaked cookie
// from one student is useless on another's page.
export function cookiePathFor(slug: string): string {
  return `/g/${slug}`;
}

// Two plain strings rather than a request object, so the precedence rule is
// testable without a server.
//
// The query wins: a freshly shared link has to override a stale cookie, or a
// student whose token Jenn regenerated could never get back in — their browser
// would keep presenting the revoked one.
export function readToken(
  fromQuery: string | undefined,
  fromCookie: string | undefined,
): string | null {
  return fromQuery || fromCookie || null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/lib/student-tokens.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/student-tokens.ts tests/lib/student-tokens.test.ts
git commit -m "feat: mint and resolve student access tokens"
```

---

### Task 4: The chat schema

**Files:**
- Modify: `prisma/schema.prisma` — `Group`, new `Message`
- Create: `prisma/migrations/<generated>_add_chat/migration.sql`
- Modify: `app/actions.ts` — `createGroup` mints tokens

**Interfaces:**
- Consumes: `newToken` (Task 3).
- Produces: `Message` model; `Group.chatToken`, `Group.filesToken`, `Group.teacherLastReadAt`.

- [ ] **Step 1: Extend the schema**

In `prisma/schema.prisma`, add to `model Group`, after `isEveryone`:

```prisma
  // Null on the everyone group, which has no private surface at all. Two
  // tokens rather than one so sharing a files link never hands over the chat.
  chatToken         String?   @unique
  filesToken        String?   @unique
  // Stamped when Jenn opens this chat; the unread count is the student's
  // messages newer than it. Null means she has never opened it.
  teacherLastReadAt DateTime?
  messages          Message[]
```

And add the model:

```prisma
model Message {
  id      String @id @default(cuid())
  groupId String
  group   Group  @relation(fields: [groupId], references: [id], onDelete: Cascade)
  // Who wrote it. A boolean rather than a sender id because there are exactly
  // two participants and one of them has no row to point at.
  fromTeacher Boolean
  body        String
  createdAt   DateTime @default(now())

  @@index([groupId, createdAt])
}
```

- [ ] **Step 2: Generate the migration**

Run: `npx prisma migrate dev --name add_chat`

- [ ] **Step 3: Backfill tokens for existing students**

Groups that already exist have null tokens and would be unreachable. Append to the generated `migration.sql`:

```sql
-- Existing students predate tokens and would otherwise have no way in.
-- hex(randomblob(16)) is SQLite's equivalent of the 32-hex-character token
-- lib/student-tokens.ts mints, so backfilled rows are indistinguishable from
-- new ones. The everyone group is skipped: it has no private surface.
UPDATE "Group"
SET "chatToken" = lower(hex(randomblob(16))),
    "filesToken" = lower(hex(randomblob(16)))
WHERE "isEveryone" = false AND "chatToken" IS NULL;
```

- [ ] **Step 4: Verify the backfill on a throwaway copy**

Do **not** reset the dev database. Check on a copy:

```bash
rm -f /tmp/chat-check.db
sqlite3 prisma/dev.db ".backup /tmp/chat-check.db"
sqlite3 /tmp/chat-check.db 'UPDATE "Group" SET "chatToken" = lower(hex(randomblob(16))), "filesToken" = lower(hex(randomblob(16))) WHERE "isEveryone" = false AND "chatToken" IS NULL;'
sqlite3 /tmp/chat-check.db 'SELECT slug, isEveryone, length(chatToken), length(filesToken), chatToken = filesToken FROM "Group";'
```

Expected: every `isEveryone = 0` row shows `32|32|0` — two tokens of the right length that are not equal to each other. The `isEveryone = 1` row shows empty lengths. Then bring your own database to the same state by running that same `UPDATE` against `prisma/dev.db`, and clean up with `rm -f /tmp/chat-check.db`.

- [ ] **Step 5: Mint tokens for new students**

In `app/actions.ts`, `createGroup` currently creates a row with only `name` and `slug`. Change the create call:

```ts
    await prisma.group.create({
      data: { name, slug, chatToken: newToken(), filesToken: newToken() },
    });
```

and add the import:

```ts
import { newToken } from "@/lib/student-tokens";
```

Every group created through the admin is a student, so both tokens are always minted. The everyone group is not creatable through the UI.

- [ ] **Step 6: Verify**

Run: `npx prisma generate && npm run lint && npm run typecheck && npm test && npm run build`
Expected: PASS, 252 tests (this task adds none).

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations app/actions.ts
git commit -m "feat: add the message model and student tokens"
```

---

### Task 5: The message store and the bus

**Files:**
- Create: `lib/chat-bus.ts`
- Create: `lib/messages.ts`

**Interfaces:**
- Consumes: Prisma client, `Message` (Task 4).
- Produces:
  - `chatBus` — `{ publish(groupId: string, message: StoredMessage): void; subscribe(groupId: string, listener: (m: StoredMessage) => void): () => void }`
  - `type StoredMessage = { id: string; groupId: string; fromTeacher: boolean; body: string; createdAt: Date }`
  - `listMessages(groupId: string): Promise<StoredMessage[]>`
  - `messagesAfter(groupId: string, afterId: string): Promise<StoredMessage[]>`
  - `createMessage(groupId: string, fromTeacher: boolean, body: string): Promise<StoredMessage>`
  - `unreadCounts(): Promise<Map<string, number>>`
  - `markTeacherRead(groupId: string): Promise<void>`
  - `deleteMessageById(id: string): Promise<void>`

No tests: this is Prisma access plus an event emitter, both of which this project leaves untested by convention.

- [ ] **Step 1: Write the bus**

Create `lib/chat-bus.ts`:

```ts
import { EventEmitter } from "events";
import type { StoredMessage } from "@/lib/messages";

// Held on globalThis for the same reason lib/prisma.ts is: dev's module
// reloading would otherwise hand each reload a fresh emitter, and streams
// opened before the reload would never hear another message.
const globalForBus = globalThis as unknown as {
  chatEmitter: EventEmitter | undefined;
};

// An in-process emitter is correct ONLY because pm2 runs this app as a single
// process in fork mode. Under cluster mode a message would reach only the
// viewers connected to the same worker, silently — see docs/DEPLOYMENT.md
// before changing how the app is started.
const emitter = globalForBus.chatEmitter ?? new EventEmitter();
// A lesson can have several viewers and Node warns past ten listeners; the
// warning would be noise, not a leak.
emitter.setMaxListeners(50);

if (process.env.NODE_ENV !== "production") {
  globalForBus.chatEmitter = emitter;
}

export const chatBus = {
  publish(groupId: string, message: StoredMessage) {
    emitter.emit(groupId, message);
  },

  // Returns its own unsubscribe rather than exposing the emitter, so a stream
  // that closes cannot forget which listener was its own.
  subscribe(groupId: string, listener: (message: StoredMessage) => void) {
    emitter.on(groupId, listener);
    return () => {
      emitter.off(groupId, listener);
    };
  },
};
```

- [ ] **Step 2: Write the store**

Create `lib/messages.ts`:

```ts
import { prisma } from "@/lib/prisma";
import { chatBus } from "@/lib/chat-bus";

export type StoredMessage = {
  id: string;
  groupId: string;
  fromTeacher: boolean;
  body: string;
  createdAt: Date;
};

const SELECT = {
  id: true,
  groupId: true,
  fromTeacher: true,
  body: true,
  createdAt: true,
} as const;

export function listMessages(groupId: string): Promise<StoredMessage[]> {
  return prisma.message.findMany({
    where: { groupId },
    orderBy: { createdAt: "asc" },
    select: SELECT,
  });
}

// Ordered by createdAt then id, and compared against the missed message's
// createdAt rather than its id: SSE reconnects hand back the last id seen, and
// cuid values do not sort chronologically, so an id alone cannot say "after".
export async function messagesAfter(
  groupId: string,
  afterId: string,
): Promise<StoredMessage[]> {
  const anchor = await prisma.message.findUnique({
    where: { id: afterId },
    select: { createdAt: true },
  });
  // An unknown id means the client is holding something we no longer have —
  // a deleted message, or another deployment's data. Replaying everything is
  // the safe answer: the client de-duplicates by id.
  if (!anchor) return listMessages(groupId);

  return prisma.message.findMany({
    where: { groupId, createdAt: { gt: anchor.createdAt } },
    orderBy: { createdAt: "asc" },
    select: SELECT,
  });
}

export async function createMessage(
  groupId: string,
  fromTeacher: boolean,
  body: string,
): Promise<StoredMessage> {
  const message = await prisma.message.create({
    data: { groupId, fromTeacher, body },
    select: SELECT,
  });

  // Published after the write, never before: a viewer that received a message
  // the database then failed to store would show something nobody can reload.
  chatBus.publish(groupId, message);
  return message;
}

// One grouped query rather than one per student — the Students tab renders
// every group at once.
export async function unreadCounts(): Promise<Map<string, number>> {
  const groups = await prisma.group.findMany({
    where: { isEveryone: false },
    select: { id: true, teacherLastReadAt: true },
  });

  const counts = new Map<string, number>();
  for (const group of groups) {
    counts.set(
      group.id,
      await prisma.message.count({
        where: {
          groupId: group.id,
          fromTeacher: false,
          ...(group.teacherLastReadAt
            ? { createdAt: { gt: group.teacherLastReadAt } }
            : {}),
        },
      }),
    );
  }
  return counts;
}

export async function markTeacherRead(groupId: string): Promise<void> {
  await prisma.group.update({
    where: { id: groupId },
    data: { teacherLastReadAt: new Date() },
  });
}

// deleteMany rather than delete, matching this codebase's convention: a
// double-click or a stale tab is a no-op rather than a P2025.
export async function deleteMessageById(id: string): Promise<void> {
  await prisma.message.deleteMany({ where: { id } });
}
```

- [ ] **Step 3: Verify**

Run: `npm run lint && npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add lib/chat-bus.ts lib/messages.ts
git commit -m "feat: store chat messages and fan them out in process"
```

---

### Task 6: Who may speak in a chat

**Files:**
- Create: `lib/chat-access.ts`
- Test: `tests/lib/chat-access.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `type ChatRole = "teacher" | "student" | null`, `chatRole(input: { isTeacher: boolean; isEveryone: boolean; chatToken: string | null; presented: string | null }): ChatRole`.

Pulled into `lib/` rather than written inline in each route because both the POST and the SSE route need the identical answer, and a rule duplicated across two files is a rule that will diverge.

- [ ] **Step 1: Write the failing test**

Create `tests/lib/chat-access.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { chatRole } from "@/lib/chat-access";

const base = {
  isTeacher: false,
  isEveryone: false,
  chatToken: "secret" as string | null,
  presented: null as string | null,
};

describe("chatRole", () => {
  it("recognises the teacher without a token", () => {
    expect(chatRole({ ...base, isTeacher: true })).toBe("teacher");
  });

  it("recognises a student presenting the right token", () => {
    expect(chatRole({ ...base, presented: "secret" })).toBe("student");
  });

  it("refuses a wrong token", () => {
    expect(chatRole({ ...base, presented: "wrong" })).toBeNull();
  });

  it("refuses no token at all", () => {
    expect(chatRole(base)).toBeNull();
  });

  it("refuses everyone on the everyone group, teacher included", () => {
    expect(chatRole({ ...base, isEveryone: true, isTeacher: true })).toBeNull();
    expect(
      chatRole({ ...base, isEveryone: true, presented: "secret" }),
    ).toBeNull();
  });

  it("refuses when the group has no token, even if one is presented", () => {
    expect(
      chatRole({ ...base, chatToken: null, presented: "secret" }),
    ).toBeNull();
  });

  it("refuses an empty presented token against a null stored token", () => {
    expect(chatRole({ ...base, chatToken: null, presented: null })).toBeNull();
  });

  it("prefers the teacher role when both would match", () => {
    expect(
      chatRole({ ...base, isTeacher: true, presented: "secret" }),
    ).toBe("teacher");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/lib/chat-access.test.ts`
Expected: FAIL — cannot resolve `@/lib/chat-access`.

- [ ] **Step 3: Write the implementation**

Create `lib/chat-access.ts`:

```ts
export type ChatRole = "teacher" | "student" | null;

// One answer for both the POST route and the SSE route. Written here rather
// than inline in each because a rule duplicated across two files is a rule
// that will eventually differ in one of them, and the difference would be a
// hole rather than a bug report.
export function chatRole(input: {
  isTeacher: boolean;
  isEveryone: boolean;
  chatToken: string | null;
  presented: string | null;
}): ChatRole {
  // The everyone group has no conversation to join. Checked first, so not even
  // the teacher can open one there by accident.
  if (input.isEveryone) return null;

  if (input.isTeacher) return "teacher";

  // Both halves must be present: a group with no token cannot be entered by
  // presenting the string "null", and a visitor with no token cannot match a
  // group that happens to have none.
  if (input.chatToken && input.presented === input.chatToken) return "student";

  return null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/lib/chat-access.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/chat-access.ts tests/lib/chat-access.test.ts
git commit -m "feat: decide who may read and write a student's chat"
```

---

### Task 7: Sending a message

**Files:**
- Create: `app/api/chat/[slug]/route.ts`
- Create: `lib/chat-body.ts`
- Test: `tests/lib/chat-body.test.ts`

**Interfaces:**
- Consumes: `chatRole` (Task 6), `createMessage` (Task 5), `readToken`, `STUDENT_COOKIE` (Task 3), `getCurrentTeacher` from `@/lib/session`.
- Produces: `POST /api/chat/[slug]`; `MAX_MESSAGE_LENGTH = 4000`, `parseMessageBody(value: unknown): string | null`.

A route handler rather than a server action because the student is unauthenticated in this app's sense — server actions all begin with `requireTeacher()`, and this is the second endpoint (with `/api/pages`) that deliberately does not.

- [ ] **Step 1: Write the failing test**

Create `tests/lib/chat-body.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseMessageBody, MAX_MESSAGE_LENGTH } from "@/lib/chat-body";

describe("parseMessageBody", () => {
  it("accepts an ordinary message", () => {
    expect(parseMessageBody("Bonjour !")).toBe("Bonjour !");
  });

  it("trims surrounding whitespace", () => {
    expect(parseMessageBody("  salut  ")).toBe("salut");
  });

  it("rejects an empty message", () => {
    expect(parseMessageBody("")).toBeNull();
  });

  it("rejects whitespace only", () => {
    expect(parseMessageBody("   \n  ")).toBeNull();
  });

  it("rejects a non-string", () => {
    expect(parseMessageBody(42)).toBeNull();
    expect(parseMessageBody(null)).toBeNull();
    expect(parseMessageBody(undefined)).toBeNull();
    expect(parseMessageBody({ body: "salut" })).toBeNull();
  });

  it("accepts a message exactly at the limit", () => {
    expect(parseMessageBody("a".repeat(MAX_MESSAGE_LENGTH))).toHaveLength(
      MAX_MESSAGE_LENGTH,
    );
  });

  it("rejects a message past the limit", () => {
    expect(parseMessageBody("a".repeat(MAX_MESSAGE_LENGTH + 1))).toBeNull();
  });

  it("measures the limit after trimming", () => {
    const padded = `  ${"a".repeat(MAX_MESSAGE_LENGTH)}  `;
    expect(parseMessageBody(padded)).toHaveLength(MAX_MESSAGE_LENGTH);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/lib/chat-body.test.ts`
Expected: FAIL — cannot resolve `@/lib/chat-body`.

- [ ] **Step 3: Write the parser**

Create `lib/chat-body.ts`:

```ts
// Long enough for a pasted paragraph of corrections, short enough that the
// column cannot be used as free storage by anyone holding a student's token.
export const MAX_MESSAGE_LENGTH = 4000;

// Returns the message to store, or null if there is nothing worth storing.
// Trims first and measures after, so trailing whitespace cannot push an
// otherwise-valid message over the limit.
export function parseMessageBody(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (trimmed === "") return null;
  if (trimmed.length > MAX_MESSAGE_LENGTH) return null;

  return trimmed;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/lib/chat-body.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Write the route**

Create `app/api/chat/[slug]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentTeacher } from "@/lib/session";
import { chatRole } from "@/lib/chat-access";
import { createMessage } from "@/lib/messages";
import { parseMessageBody } from "@/lib/chat-body";
import { readToken, STUDENT_COOKIE } from "@/lib/student-tokens";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  const group = await prisma.group.findUnique({
    where: { slug },
    select: { id: true, isEveryone: true, chatToken: true },
  });
  // 404 rather than 403 for a group that exists but refuses: a caller probing
  // slugs learns the same thing either way.
  if (!group) return new NextResponse("Not found", { status: 404 });

  const url = new URL(request.url);
  const teacher = await getCurrentTeacher();
  const role = chatRole({
    isTeacher: Boolean(teacher),
    isEveryone: group.isEveryone,
    chatToken: group.chatToken,
    presented: readToken(
      url.searchParams.get("k") ?? undefined,
      request.headers
        .get("cookie")
        ?.match(new RegExp(`${STUDENT_COOKIE}=([^;]+)`))?.[1],
    ),
  });
  if (!role) return new NextResponse("Not found", { status: 404 });

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return new NextResponse("Bad request", { status: 400 });
  }

  const body = parseMessageBody(
    (payload as { body?: unknown } | null)?.body ?? null,
  );
  if (body === null) return new NextResponse("Bad request", { status: 400 });

  const message = await createMessage(group.id, role === "teacher", body);
  return NextResponse.json(message, { status: 201 });
}
```

- [ ] **Step 6: Verify**

Run: `npm run lint && npm run typecheck && npm test && npm run build`
Expected: PASS. `npm test` should now report 26 files and 284 tests (252 + 6 + 7 + 9 + 9 + 8 from Tasks 1, 2, 3, 6, 7).

- [ ] **Step 7: Commit**

```bash
git add lib/chat-body.ts tests/lib/chat-body.test.ts app/api/chat
git commit -m "feat: accept a chat message from the teacher or a student"
```

---

### Task 8: The live stream

**Files:**
- Create: `app/api/chat/[slug]/stream/route.ts`

**Interfaces:**
- Consumes: `chatRole` (Task 6), `chatBus`, `listMessages`, `messagesAfter` (Task 5), `readToken`, `STUDENT_COOKIE` (Task 3).
- Produces: `GET /api/chat/[slug]/stream` — an SSE stream.

Not unit-tested, per convention. The rules it depends on are already tested in Tasks 5 and 6.

- [ ] **Step 1: Write the route**

Create `app/api/chat/[slug]/stream/route.ts`:

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentTeacher } from "@/lib/session";
import { chatRole } from "@/lib/chat-access";
import { chatBus } from "@/lib/chat-bus";
import { listMessages, messagesAfter, type StoredMessage } from "@/lib/messages";
import { readToken, STUDENT_COOKIE } from "@/lib/student-tokens";

// Nginx's proxy_read_timeout is 60s by default and would drop a lesson that
// went quiet. A comment line every 20s is invisible to EventSource and keeps
// the connection counted as live.
const HEARTBEAT_MS = 20_000;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  const group = await prisma.group.findUnique({
    where: { slug },
    select: { id: true, isEveryone: true, chatToken: true },
  });
  if (!group) return new NextResponse("Not found", { status: 404 });

  const url = new URL(request.url);
  const teacher = await getCurrentTeacher();
  const role = chatRole({
    isTeacher: Boolean(teacher),
    isEveryone: group.isEveryone,
    chatToken: group.chatToken,
    presented: readToken(
      url.searchParams.get("k") ?? undefined,
      request.headers
        .get("cookie")
        ?.match(new RegExp(`${STUDENT_COOKIE}=([^;]+)`))?.[1],
    ),
  });
  if (!role) return new NextResponse("Not found", { status: 404 });

  // EventSource resends the last id it saw after a dropped connection. Replay
  // from there so a deploy mid-lesson costs a blink rather than a message.
  const lastEventId = request.headers.get("last-event-id");
  const backlog = lastEventId
    ? await messagesAfter(group.id, lastEventId)
    : await listMessages(group.id);

  const encoder = new TextEncoder();
  let unsubscribe = () => {};
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream({
    start(controller) {
      const send = (message: StoredMessage) => {
        // The id: line is what the browser sends back as Last-Event-ID.
        controller.enqueue(
          encoder.encode(
            `id: ${message.id}\ndata: ${JSON.stringify(message)}\n\n`,
          ),
        );
      };

      for (const message of backlog) send(message);

      unsubscribe = chatBus.subscribe(group.id, send);
      heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(": ping\n\n"));
      }, HEARTBEAT_MS);

      // A closed tab does not run cancel() in every runtime; the request's
      // abort signal is the reliable teardown.
      request.signal.addEventListener("abort", () => {
        unsubscribe();
        if (heartbeat) clearInterval(heartbeat);
      });
    },

    cancel() {
      unsubscribe();
      if (heartbeat) clearInterval(heartbeat);
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
      // Nginx buffers proxied responses by default, which would hold the whole
      // stream in memory and deliver nothing. This turns buffering off for
      // this response alone — no server-side nginx change is needed.
      "X-Accel-Buffering": "no",
    },
  });
}
```

- [ ] **Step 2: Force dynamic rendering**

Add to the top of the same file, below the imports:

```ts
// Without this Next may try to evaluate the handler at build time, which for a
// stream that never ends means a build that never finishes.
export const dynamic = "force-dynamic";
```

- [ ] **Step 3: Verify**

Run: `npm run lint && npm run typecheck && npm run build`
Expected: PASS, and the build must complete rather than hang. If it hangs, Step 2 was missed.

- [ ] **Step 4: Prove the stream actually streams**

Start `npm run dev`. Find a student's token:

```bash
sqlite3 prisma/dev.db 'SELECT slug, chatToken FROM "Group" WHERE isEveryone = 0;'
```

Open the stream with that slug and token, leaving it running:

```bash
curl -N "http://localhost:3000/api/chat/<slug>/stream?k=<chatToken>"
```

In a second terminal, post a message:

```bash
curl -X POST "http://localhost:3000/api/chat/<slug>?k=<chatToken>" \
  -H "Content-Type: application/json" -d '{"body":"salut"}'
```

Expected: the `curl -N` terminal prints an `id:`/`data:` pair within a second, and a `: ping` line roughly every 20 seconds. Also confirm a wrong token gives 404:

```bash
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/api/chat/<slug>/stream?k=wrong"
```

Expected: `404`.

- [ ] **Step 5: Commit**

```bash
git add app/api/chat
git commit -m "feat: stream chat messages over SSE"
```

---

### Task 9: The chat window

**Files:**
- Create: `components/chat/ChatFab.tsx`, `ChatWindow.tsx`, `MessageList.tsx`, `MessageInput.tsx`

**Interfaces:**
- Consumes: `groupByDay` (Task 2), the two routes (Tasks 7, 8).
- Produces: `ChatFab({ slug, token, self, labels })` — the only component the pages mount.

`self` is `"teacher" | "student"`, deciding which side each bubble sits on. `labels` carries the visible strings so the student side can be French and the admin English without the component knowing which is which.

- [ ] **Step 1: The message list**

Create `components/chat/MessageList.tsx`:

```tsx
"use client";

import { useEffect, useRef } from "react";
import { groupByDay } from "@/lib/chat-day";
import { cn } from "@/lib/utils";

export type ChatMessage = {
  id: string;
  fromTeacher: boolean;
  body: string;
  createdAt: Date;
};

export function MessageList({
  messages,
  self,
  emptyLabel,
  locale,
}: {
  messages: ChatMessage[];
  self: "teacher" | "student";
  emptyLabel: string;
  locale: string;
}) {
  const bottom = useRef<HTMLDivElement>(null);

  // Jump to the newest whenever one arrives. A chat that opens at the top of a
  // year of history is a chat nobody scrolls.
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  if (messages.length === 0) {
    return (
      <p className="px-4 py-6 text-center text-sm text-[var(--color-ink-muted)]">
        {emptyLabel}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4 px-4 py-3">
      {groupByDay(messages).map((day) => (
        <div key={day.day} className="flex flex-col gap-2">
          <div className="text-center text-[11px] uppercase tracking-[2px] text-[var(--color-ink-muted)]">
            {new Date(`${day.day}T00:00:00Z`).toLocaleDateString(locale, {
              day: "numeric",
              month: "long",
              timeZone: "UTC",
            })}
          </div>

          {day.messages.map((message) => {
            const mine =
              (self === "teacher") === message.fromTeacher;
            return (
              <div
                key={message.id}
                className={cn(
                  "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap break-words",
                  mine
                    ? "self-end bg-[var(--color-accent)] text-white"
                    : "self-start bg-[var(--color-field)] text-[var(--color-ink)]",
                )}
              >
                {message.body}
              </div>
            );
          })}
        </div>
      ))}
      <div ref={bottom} />
    </div>
  );
}
```

- [ ] **Step 2: The input**

Create `components/chat/MessageInput.tsx`:

```tsx
"use client";

import { useState, type FormEvent, type KeyboardEvent } from "react";
import { MAX_MESSAGE_LENGTH } from "@/lib/chat-body";

export function MessageInput({
  onSend,
  placeholder,
  sendLabel,
}: {
  onSend: (body: string) => Promise<void>;
  placeholder: string;
  sendLabel: string;
}) {
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    const trimmed = body.trim();
    if (trimmed === "" || sending) return;

    setSending(true);
    // Cleared optimistically: the field emptying is the acknowledgement, and
    // waiting for the round trip makes fast typing feel broken.
    setBody("");
    try {
      await onSend(trimmed);
    } catch {
      // Put it back rather than losing what they wrote.
      setBody(trimmed);
    } finally {
      setSending(false);
    }
  }

  // Enter sends, Shift+Enter makes a new line — the convention of every chat
  // this teacher and her students already use.
  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submit();
    }
  }

  return (
    <form
      onSubmit={submit}
      className="flex items-end gap-2 border-t border-[var(--color-field-border)] p-3"
    >
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        aria-label={placeholder}
        rows={1}
        maxLength={MAX_MESSAGE_LENGTH}
        className="max-h-32 flex-1 resize-none rounded-xl border border-[var(--color-field-border)] bg-[var(--color-field)] px-3 py-2 text-base text-[var(--color-ink)] focus:border-[var(--color-accent)] focus:outline-none"
      />
      <button
        type="submit"
        disabled={body.trim() === "" || sending}
        className="rounded-full bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
      >
        {sendLabel}
      </button>
    </form>
  );
}
```

- [ ] **Step 3: The window**

Create `components/chat/ChatWindow.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { MessageList, type ChatMessage } from "@/components/chat/MessageList";
import { MessageInput } from "@/components/chat/MessageInput";

export type ChatLabels = {
  title: string;
  empty: string;
  placeholder: string;
  send: string;
  close: string;
  locale: string;
};

export function ChatWindow({
  slug,
  token,
  self,
  labels,
  onClose,
  onMessages,
}: {
  slug: string;
  token: string | null;
  self: "teacher" | "student";
  labels: ChatLabels;
  onClose: () => void;
  onMessages: (messages: ChatMessage[]) => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const panel = useRef<HTMLDivElement>(null);

  const query = token ? `?k=${encodeURIComponent(token)}` : "";

  useEffect(() => {
    const source = new EventSource(`/api/chat/${slug}/stream${query}`);

    source.onmessage = (event) => {
      const raw = JSON.parse(event.data) as ChatMessage & { createdAt: string };
      const message = { ...raw, createdAt: new Date(raw.createdAt) };
      setMessages((current) =>
        // De-duplicated by id because a reconnect replays, and because the
        // sender receives its own message back through the stream.
        current.some((m) => m.id === message.id)
          ? current
          : [...current, message],
      );
    };

    return () => source.close();
  }, [slug, query]);

  useEffect(() => {
    onMessages(messages);
  }, [messages, onMessages]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    panel.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function send(body: string) {
    const response = await fetch(`/api/chat/${slug}${query}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
    if (!response.ok) throw new Error("send failed");
    // Nothing is appended here — the message arrives back through the stream,
    // which is also what gives it its real id and timestamp.
  }

  return (
    <div
      ref={panel}
      role="dialog"
      aria-label={labels.title}
      tabIndex={-1}
      // Deliberately not aria-modal: the point of a floating panel is that the
      // card stays readable behind it while they type.
      className="fixed bottom-24 right-4 z-50 flex h-[520px] max-h-[70vh] w-[380px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-[var(--color-field-border)] bg-[var(--color-bg)] shadow-2xl focus:outline-none"
    >
      <header className="flex items-center justify-between border-b border-[var(--color-field-border)] px-4 py-3">
        <span className="font-[family-name:var(--font-body)] text-sm font-medium text-[var(--color-ink)]">
          {labels.title}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label={labels.close}
          className="text-lg leading-none text-[var(--color-ink-muted)]"
        >
          ×
        </button>
      </header>

      <div className="flex-1 overflow-y-auto">
        <MessageList
          messages={messages}
          self={self}
          emptyLabel={labels.empty}
          locale={labels.locale}
        />
      </div>

      <MessageInput
        onSend={send}
        placeholder={labels.placeholder}
        sendLabel={labels.send}
      />
    </div>
  );
}
```

- [ ] **Step 4: The button**

Create `components/chat/ChatFab.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { ChatWindow, type ChatLabels } from "@/components/chat/ChatWindow";
import type { ChatMessage } from "@/components/chat/MessageList";

// Per-device by design: the student has no account to hang a read marker on,
// and tracking it server-side would mean a write path from an unauthenticated
// visitor for the sake of a dot.
const seenKey = (slug: string) => `chat-seen:${slug}`;

export function ChatFab({
  slug,
  token,
  self,
  labels,
}: {
  slug: string;
  token: string | null;
  self: "teacher" | "student";
  labels: ChatLabels;
}) {
  const [open, setOpen] = useState(false);
  const [unseen, setUnseen] = useState(false);

  const onMessages = useCallback(
    (messages: ChatMessage[]) => {
      const fromOther = messages.filter(
        (m) => m.fromTeacher !== (self === "teacher"),
      );
      const newest = fromOther[fromOther.length - 1];
      if (!newest) return;

      if (open) {
        window.localStorage.setItem(seenKey(slug), newest.id);
        setUnseen(false);
      } else {
        setUnseen(window.localStorage.getItem(seenKey(slug)) !== newest.id);
      }
    },
    [open, self, slug],
  );

  // The window unmounts when closed, so its stream closes with it. That is
  // intentional: a closed chat should not hold a connection open for a lesson
  // that ended. The cost is that the dot only updates while it is open.
  useEffect(() => {
    if (!open) return;
    setUnseen(false);
  }, [open]);

  return (
    <>
      {open && (
        <ChatWindow
          slug={slug}
          token={token}
          self={self}
          labels={labels}
          onClose={() => setOpen(false)}
          onMessages={onMessages}
        />
      )}

      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label={labels.title}
        className="fixed bottom-6 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-accent)] text-white shadow-lg transition-opacity hover:opacity-90"
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
        {unseen && !open && (
          <span
            aria-hidden="true"
            className="absolute right-1 top-1 h-3.5 w-3.5 rounded-full border-2 border-[var(--color-bg)] bg-[var(--card-rouge)]"
          />
        )}
      </button>
    </>
  );
}
```

- [ ] **Step 5: Verify**

Run: `npm run lint && npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add components/chat
git commit -m "feat: add the floating chat window"
```

---

### Task 10: The student's screen

**Files:**
- Create: `middleware.ts` (repo root)
- Create: `components/student/StudentTabs.tsx`
- Create: `components/student/FilesTab.tsx`
- Modify: `app/g/[slug]/page.tsx`

**Interfaces:**
- Consumes: `parseStudentTab` (Task 1), `readToken`, `STUDENT_COOKIE`, `cookiePathFor` (Task 3), `ChatFab` (Task 9), `listPagesForGroup` (already merged in Part 1).
- Produces: the two-tab student screen.

**The load-bearing rule:** an untokened visit renders the card and nothing else — no tab strip, no chat button, no sign a private conversation exists.

- [ ] **Step 1: Exchange the token for a cookie**

A server component cannot set a cookie in Next.js; middleware can. Create `middleware.ts` at the repo root:

```ts
import { NextResponse, type NextRequest } from "next/server";
import { STUDENT_COOKIE, cookiePathFor } from "@/lib/student-tokens";

// The one job here is moving ?k= out of the URL and into an httpOnly cookie,
// so the secret stops riding in browser history on every later visit. It does
// not validate the token — that needs the database, which middleware has no
// business touching. The page validates what it is handed.
export function middleware(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("k");
  if (!token) return NextResponse.next();

  const slug = request.nextUrl.pathname.split("/")[2];
  if (!slug) return NextResponse.next();

  const clean = request.nextUrl.clone();
  clean.searchParams.delete("k");

  const response = NextResponse.redirect(clean);
  response.cookies.set(STUDENT_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: cookiePathFor(slug),
    maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}

export const config = {
  matcher: "/g/:slug/:path*",
};
```

- [ ] **Step 2: The tab strip**

Create `components/student/StudentTabs.tsx`:

```tsx
import Link from "next/link";
import { cn } from "@/lib/utils";
import type { StudentTab } from "@/lib/student-tab";

// Mirrors /admin's strip so both halves of the site work the same way, in the
// flashcard palette rather than the admin one.
export function StudentTabs({
  slug,
  active,
  date,
}: {
  slug: string;
  active: StudentTab;
  date: string;
}) {
  const tabs: { tab: StudentTab; label: string; href: string }[] = [
    { tab: "card", label: "La carte", href: `/g/${slug}?date=${date}` },
    { tab: "files", label: "Les fichiers", href: `/g/${slug}?tab=files` },
  ];

  return (
    <nav
      aria-label="Sections"
      className="mx-auto mb-8 flex max-w-[560px] justify-center"
    >
      <div className="flex gap-1 rounded-full border border-[var(--card-line)] bg-[var(--card-paper)] p-1">
        {tabs.map(({ tab, label, href }) => (
          <Link
            key={tab}
            href={href}
            aria-current={tab === active ? "page" : undefined}
            className={cn(
              "rounded-full px-5 py-2 font-[family-name:var(--card-font-serif)] text-sm transition-colors",
              tab === active
                ? "bg-[var(--card-bleu)] text-white"
                : "text-[var(--card-moss)]",
            )}
          >
            {label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
```

- [ ] **Step 3: The files tab**

Create `components/student/FilesTab.tsx`:

```tsx
import { Tile } from "@/components/ui/Tile";
import { formatLongDate } from "@/lib/format";

export function FilesTab({
  pages,
}: {
  pages: { slug: string; title: string; createdAt: Date }[];
}) {
  if (pages.length === 0) {
    return (
      <p className="text-center font-[family-name:var(--card-font-serif)] italic text-[var(--card-moss)]">
        Rien ici pour l&apos;instant.
      </p>
    );
  }

  return (
    <ul className="mx-auto flex max-w-[560px] flex-col gap-3">
      {pages.map((page) => (
        <li key={page.slug}>
          <Tile
            href={`/p/${page.slug}`}
            title={page.title}
            eyebrow={formatLongDate(page.createdAt)}
          />
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 4: Wire the student page**

In `app/g/[slug]/page.tsx`, add these imports:

```ts
import { cookies } from "next/headers";
import { parseStudentTab } from "@/lib/student-tab";
import { readToken, STUDENT_COOKIE } from "@/lib/student-tokens";
import { listPagesForGroup } from "@/lib/pages";
import { StudentTabs } from "@/components/student/StudentTabs";
import { FilesTab } from "@/components/student/FilesTab";
import { ChatFab } from "@/components/chat/ChatFab";
```

Widen the `searchParams` type to `Promise<{ date?: string; tab?: string }>` and destructure `tab` alongside `date`.

After the `group` lookup and `notFound()` guard, add:

```ts
  // The card is public; everything else needs the token. An untokened visitor
  // sees exactly what this page rendered before chat existed.
  const presented = readToken(
    undefined,
    (await cookies()).get(STUDENT_COOKIE)?.value,
  );
  const unlocked =
    !group.isEveryone &&
    group.chatToken !== null &&
    presented === group.chatToken;

  // The everyone group has no chat but does show its own files, so its shelf
  // is public — that is the "someday" case the spec left room for.
  const pages =
    unlocked || group.isEveryone ? await listPagesForGroup(group.id) : [];
  const tab = parseStudentTab(tab_, pages.length > 0);
```

(name the destructured search param `tab_` to avoid colliding with the resolved `tab`).

Then, inside the returned `<main>`, immediately after the `</header>`:

```tsx
      {pages.length > 0 && (
        <StudentTabs slug={slug} active={tab} date={selected} />
      )}
```

Wrap the existing `WeekDayPicker` and card block so they render only on the card tab, and add the files tab beside them:

```tsx
      {tab === "card" ? (
        <>
          <WeekDayPicker slug={slug} today={today} selected={selected} />
          {card ? (
            <Flashcard card={card} />
          ) : (
            <p className="text-center font-[family-name:var(--font-body)] text-[var(--color-ink-muted)]">
              Nothing posted yet — check back soon!
            </p>
          )}
        </>
      ) : (
        <FilesTab pages={pages} />
      )}

      {unlocked && (
        <ChatFab
          slug={slug}
          token={null}
          self="student"
          labels={{
            title: "Clavardage",
            empty: "Aucun message pour l'instant.",
            placeholder: "Écrivez un message…",
            send: "Envoyer",
            close: "Fermer",
            locale: "fr-CA",
          }}
        />
      )}
```

`token={null}` is deliberate: the student's browser already holds the cookie, and putting the token back into a fetch URL would undo the point of the exchange.

- [ ] **Step 5: Verify**

Run: `npm run lint && npm run typecheck && npm test && npm run build`
Expected: PASS, 284 tests.

- [ ] **Step 6: Prove the public card is still public**

With `npm run dev`:

```bash
sqlite3 prisma/dev.db 'SELECT slug, chatToken FROM "Group" WHERE isEveryone = 0;'
curl -s "http://localhost:3000/g/<slug>" | grep -c "Clavardage"
```

Expected: `0` — no chat button in the untokened HTML. Then open `http://localhost:3000/g/<slug>?k=<chatToken>` in a browser and confirm the URL redirects to the clean `/g/<slug>`, the chat button appears, and a reload keeps it. Confirm `/g/all` shows no chat button at all.

- [ ] **Step 7: Commit**

```bash
git add middleware.ts components/student 'app/g/[slug]/page.tsx'
git commit -m "feat: give the student tabs and a chat button behind their token"
```

---

### Task 11: The opaque files link

**Files:**
- Create: `app/f/[token]/page.tsx`
- Delete: `app/g/[slug]/pages/page.tsx`

**Interfaces:**
- Consumes: `listPagesForGroup`, `FilesTab` (Task 10).
- Produces: `/f/<filesToken>`.

The old route is replaced rather than kept. It is a day old, linked from nowhere, and the spec chose an opaque URL so nothing about the link reveals whose it is.

- [ ] **Step 1: The route**

Create `app/f/[token]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { listPagesForGroup } from "@/lib/pages";
import { FilesTab } from "@/components/student/FilesTab";

// noindex on every student surface: the token is the only thing protecting
// this, and a crawler that found one would publish it.
export const metadata = { robots: { index: false, follow: false } };

export default async function StudentFilesPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const group = await prisma.group.findUnique({
    where: { filesToken: token },
    select: { id: true, name: true, slug: true },
  });
  // 404 rather than 403, so a crawler cannot tell a real student's link from
  // a made-up one.
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
          {group.name}
        </h1>
      </header>

      <FilesTab pages={pages} />

      <p className="mt-8 text-center">
        <Link
          href={`/g/${group.slug}`}
          className="font-[family-name:var(--card-font-serif)] text-sm italic text-[var(--card-bleu)] underline"
        >
          ← La carte du jour
        </Link>
      </p>
    </main>
  );
}
```

- [ ] **Step 2: Remove the old route**

```bash
git rm 'app/g/[slug]/pages/page.tsx'
```

- [ ] **Step 3: Verify**

Run: `npm run lint && npm run typecheck && npm run build`
Expected: PASS. A typecheck failure here means something still imports the deleted route — find and fix the importer.

- [ ] **Step 4: Check it**

```bash
sqlite3 prisma/dev.db 'SELECT slug, filesToken FROM "Group" WHERE isEveryone = 0;'
curl -s -o /dev/null -w "real token -> %{http_code}\n" "http://localhost:3000/f/<filesToken>"
curl -s -o /dev/null -w "made-up token -> %{http_code}\n" "http://localhost:3000/f/deadbeef"
curl -s -o /dev/null -w "old route -> %{http_code}\n" "http://localhost:3000/g/<slug>/pages"
```

Expected: `200`, `404`, `404`.

- [ ] **Step 5: Commit**

```bash
git add app/f
git commit -m "feat: serve a student's files from an opaque link"
```

---

### Task 12: Jenn's side

**Files:**
- Modify: `app/admin/[slug]/page.tsx` — mount the chat, mark it read
- Modify: `app/admin/page.tsx` — unread counts into `GroupsTab`
- Modify: `components/admin/GroupList.tsx` — the unread badge, the student links
- Modify: `app/actions.ts` — `deleteMessage`, `regenerateStudentLinks`

**Interfaces:**
- Consumes: `ChatFab` (Task 9), `unreadCounts`, `markTeacherRead`, `deleteMessageById` (Task 5), `newToken` (Task 3).
- Produces: `GroupSummary` gains `unread: number`, `chatToken: string | null`, `filesToken: string | null`.

- [ ] **Step 1: The two new actions**

Add to `app/actions.ts`:

```ts
export async function deleteMessage(groupSlug: string, messageId: string) {
  await requireTeacher();
  await deleteMessageById(messageId);
  revalidatePath(`/admin/${groupSlug}`);
}

// Revoking a leaked bookmark. Both tokens move together: a link that leaked
// probably leaked from the same place as its sibling.
export async function regenerateStudentLinks(groupId: string, slug: string) {
  await requireTeacher();

  await prisma.group.update({
    where: { id: groupId },
    data: { chatToken: newToken(), filesToken: newToken() },
  });

  revalidatePath("/admin");
  revalidatePath(`/admin/${slug}`);
}
```

with the imports:

```ts
import { deleteMessageById } from "@/lib/messages";
import { newToken } from "@/lib/student-tokens";
```

- [ ] **Step 2: Mount the chat on the student's admin page**

In `app/admin/[slug]/page.tsx`, add the imports:

```ts
import { ChatFab } from "@/components/chat/ChatFab";
import { markTeacherRead } from "@/lib/messages";
```

After the `notFound()` guard, stamp the read marker — opening this page is what "she has seen it" means:

```ts
  if (!group.isEveryone) await markTeacherRead(group.id);
```

Then, immediately before the closing `</main>`, add:

```tsx
        {!group.isEveryone && (
          <ChatFab
            slug={group.slug}
            token={null}
            self="teacher"
            labels={{
              title: `Chat with ${group.name}`,
              empty: "No messages yet.",
              placeholder: "Write a message…",
              send: "Send",
              close: "Close",
              locale: "en-CA",
            }}
          />
        )}
```

`token={null}`: the teacher's own session cookie authenticates her, and `chatRole` prefers the teacher role.

- [ ] **Step 3: Unread counts on the Students tab**

In `app/admin/page.tsx`, in `GroupsTab`, fetch the counts alongside the groups:

```tsx
  const [groups, unread] = await Promise.all([
    prisma.group.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { cards: true } } },
    }),
    unreadCounts(),
  ]);
```

with `import { unreadCounts } from "@/lib/messages";`, and add to the mapped groups:

```tsx
          unread: unread.get(g.id) ?? 0,
          chatToken: g.chatToken,
          filesToken: g.filesToken,
```

- [ ] **Step 4: The badge and the links**

In `components/admin/GroupList.tsx`, add to `GroupSummary`:

```ts
  unread: number;
  chatToken: string | null;
  filesToken: string | null;
```

Change the tile's `eyebrow` so an unread count is visible without opening every student:

```tsx
                eyebrow={`${group.cardCount} card${
                  group.cardCount === 1 ? "" : "s"
                } · /g/${group.slug}${
                  group.unread > 0 ? ` · ${group.unread} unread` : ""
                }`}
```

And below each tile, where the delete confirmation already renders, add the two shareable links for students only:

```tsx
              {group.chatToken && (
                <p className="mt-1 px-5 text-xs text-[var(--color-ink-muted)]">
                  Chat link:{" "}
                  <code className="break-all">
                    /g/{group.slug}?k={group.chatToken}
                  </code>
                  <br />
                  Files link: <code className="break-all">/f/{group.filesToken}</code>
                </p>
              )}
```

- [ ] **Step 5: Verify**

Run: `npm run lint && npm run typecheck && npm test && npm run build`
Expected: PASS, 284 tests.

- [ ] **Step 6: Commit**

```bash
git add app/actions.ts 'app/admin/[slug]/page.tsx' app/admin/page.tsx components/admin/GroupList.tsx
git commit -m "feat: give the teacher the chat and her students' links"
```

---

### Task 13: Documentation and the full check

**Files:**
- Modify: `CLAUDE.md` — routes table, a new Chat section, the Auth section
- Modify: `docs/DEPLOY.md` — a note on the single-process constraint

- [ ] **Step 1: The routes table**

In `CLAUDE.md`, replace the `/g/[slug]` row's Notes cell with:

```
the card for `?date=` (public); `?tab=files` and the chat appear only with a valid token
```

Replace the `/g/[slug]/pages` row entirely with:

```
| `/f/[token]` | students | that student's files, at an opaque unguessable link |
```

And add:

```
| `POST /api/chat/[slug]` | token or teacher | send one message |
| `GET /api/chat/[slug]/stream` | token or teacher | the SSE stream |
```

- [ ] **Step 2: The chat section**

Add a new section to `CLAUDE.md` after "Uploaded pages":

```markdown
### Lesson chat

A `Message` belongs to a group and carries `fromTeacher` rather than a sender
id, because there are exactly two participants and one of them has no row to
point at. There is no session or lesson model: the log is continuous and
`groupByDay` (`lib/chat-day.ts`) computes the date separators, in UTC like
every other date here. Retention is forever, deliberately — this is a teaching
record. Jenn can delete an individual message.

Each student row carries two tokens. `chatToken` unlocks the files tab and the
chat on `/g/[slug]`; `filesToken` addresses `/f/[token]` and nothing else, so
sharing a files link never hands over the conversation. The everyone group has
neither, and `chatRole` (`lib/chat-access.ts`) refuses it before it checks
anything else. **The daily card stays public**: an untokened visit to
`/g/marie` renders exactly what it rendered before chat existed, which is what
keeps every old bookmark working and means a forwarded plain link leaks
nothing. A wrong token is a 404, never a 403.

`middleware.ts` exists for one job: moving `?k=` out of the URL into an
httpOnly cookie scoped to that student's path, so the secret stops riding in
browser history. It does not validate — that needs the database. The page
validates what it is handed.

Delivery is SSE (`app/api/chat/[slug]/stream`) with an in-process
`EventEmitter` (`lib/chat-bus.ts`). **That emitter is correct only because pm2
runs this app as a single process in fork mode.** Under cluster mode a message
would reach only the viewers on the same worker, silently. Two details keep the
stream alive behind nginx without any nginx change: `X-Accel-Buffering: no`
disables its response buffering, and a `: ping` comment every 20 seconds stays
under the default 60-second `proxy_read_timeout`.
```

- [ ] **Step 3: The deploy note**

In `docs/DEPLOY.md`, at the end of the "Deploy" section, add:

```markdown
**Do not switch pm2 to cluster mode.** Chat fan-out is an in-process
`EventEmitter`; with more than one worker a message reaches only the viewers
connected to the same one, and nothing reports the loss. See the chat section
of `CLAUDE.md`.
```

- [ ] **Step 4: Run the full CI sequence**

```bash
npx prisma generate
npm run lint
npm run typecheck
npm test
npm run build
```

Expected: 27 files, 284 tests. Report the real numbers if they differ.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md docs/DEPLOY.md
git commit -m "docs: record the chat, its tokens, and the single-process constraint"
```

---

## Self-review notes

Spec coverage, section by section:

- **The student's screen** (two tabs, strip hidden when there is one, FAB, non-modal panel, localStorage dot) → Tasks 1, 9, 10.
- **Access** (two tokens, public card, `?k=` → cookie → redirect, 404 not 403, noindex) → Tasks 3, 6, 10, 11.
- **Schema** (`Message`, three `Group` columns, no session model) → Task 4.
- **Real-time** (SSE, in-process bus, `X-Accel-Buffering`, heartbeat, `Last-Event-ID` replay) → Tasks 5, 8.
- **Jenn's side** (chat on `/admin/[slug]`, unread counts, delete a message, regenerate links) → Task 12.
- **Retention forever** → Task 13, stated in `CLAUDE.md`.
- **Removal of `/g/[slug]/pages`** → Task 11.

Deliberately **not** here, per the spec's "Future" section: email notification when Jenn misses a message, Claude summarisation, typing indicators and read receipts.

Name consistency verified across tasks: `parseStudentTab`, `groupByDay`, `newToken`, `readToken`, `STUDENT_COOKIE`, `cookiePathFor`, `chatRole`, `parseMessageBody`, `MAX_MESSAGE_LENGTH`, `chatBus`, `StoredMessage`, `listMessages`, `messagesAfter`, `createMessage`, `unreadCounts`, `markTeacherRead`, `deleteMessageById`, `ChatFab`, `ChatWindow`, `ChatLabels`, `MessageList`, `ChatMessage`, `MessageInput`, `StudentTabs`, `FilesTab`.

Two risks worth naming for implementers:

1. **Task 8's stream can hang a build.** `export const dynamic = "force-dynamic"` is what prevents Next from trying to evaluate a never-ending stream at build time. Its Step 3 checks for exactly that.
2. **Task 10 is where the load-bearing rule lives.** If the untokened path ever renders a tab strip or a chat button, every existing student bookmark starts advertising a private conversation. Its Step 6 tests that with `curl`, not by eye.
