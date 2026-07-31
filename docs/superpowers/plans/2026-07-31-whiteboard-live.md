# Whiteboard, Part 2 — live drawing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The student watches Jenn's board appear stroke by stroke, from wherever they are on the page.

**Architecture:** Board ops fan out through the existing chat `EventEmitter` and ride the existing chat SSE stream as *named, id-less* frames, so they are invisible to the chat handler and cannot disturb its `Last-Event-ID` replay. A live board lives in memory keyed by group id, purely to fan out and to snapshot late joiners — **the client's log stays authoritative for saving**, so `/finish` from Part 1 is unchanged. The single `EventSource` moves out of `ChatFab` into a provider both the chat and the whiteboard consume.

**Tech Stack:** Next.js 16 route handlers, React 19 context, Node `EventEmitter`, Vitest 2.

**Prerequisite:** Part 1 (`docs/superpowers/plans/2026-07-31-whiteboard-static.md`) must be complete and merged. This plan assumes `lib/whiteboard-ops.ts`, `lib/whiteboards.ts`, `components/whiteboard/*` and `POST /api/whiteboard/[slug]/finish` all exist.

**Read first:** `docs/superpowers/specs/2026-07-31-whiteboard-design.md`, sections "Lifecycle", "Real-time", "Lifting the EventSource" and "The banner".

**The constraint that makes this correct — do not break it:** an in-process emitter only works because pm2 runs this app as a **single process in fork mode**. Under cluster mode a live board would be invisible to viewers on other workers, silently. `lib/chat-bus.ts` already carries this warning; you are adding a second dependency on it.

**Verification after every task:** `npm run lint && npm run typecheck && npm test`.

---

### Task 1: `lib/whiteboard-live.ts` — the in-memory board

**Files:**
- Create: `lib/whiteboard-live.ts`
- Test: `tests/lib/whiteboard-live.test.ts`

The state machine is a pure module, so it gets a test even though it holds mutable state. Read `lib/chat-bus.ts` first — the `globalThis` pattern below is deliberately the same.

- [ ] **Step 1: Write the failing tests**

Create `tests/lib/whiteboard-live.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { PALETTE, type Op } from "@/lib/whiteboard-ops";
import { liveBoards } from "@/lib/whiteboard-live";

const op = (id: string, page = 0): Op => ({
  id,
  page,
  kind: "stroke",
  points: [0, 0, 1, 1],
  colour: PALETTE[0],
  width: 5,
});

const date = new Date("2026-07-31T00:00:00Z");

describe("liveBoards", () => {
  beforeEach(() => {
    liveBoards.discard("g1");
    liveBoards.discard("g2");
  });

  it("has no board for a group that has not opened one", () => {
    expect(liveBoards.get("g1")).toBeNull();
  });

  it("opens a board and reports it", () => {
    expect(liveBoards.open("g1", date)).toBe(true);
    expect(liveBoards.get("g1")).toEqual({ date, ops: [], currentPage: 0 });
  });

  // The map is keyed by group, and one student cannot be watching two boards.
  it("refuses a second open for the same group", () => {
    liveBoards.open("g1", date);
    expect(liveBoards.open("g1", date)).toBe(false);
  });

  it("keeps groups independent", () => {
    liveBoards.open("g1", date);
    expect(liveBoards.open("g2", date)).toBe(true);
  });

  it("appends ops in order", () => {
    liveBoards.open("g1", date);
    expect(liveBoards.append("g1", [op("a")], 0, null)).toBe(true);
    expect(liveBoards.append("g1", [op("b")], 0, null)).toBe(true);
    expect(liveBoards.get("g1")?.ops.map((o) => o.id)).toEqual(["a", "b"]);
  });

  it("refuses an append with no board open", () => {
    expect(liveBoards.append("g1", [op("a")], 0, null)).toBe(false);
  });

  // currentPage is presentation state, not content: it rides alongside the ops
  // so the student's view follows hers, and is never stored.
  it("tracks the page she is presenting", () => {
    liveBoards.open("g1", date);
    liveBoards.append("g1", [op("a", 2)], 2, null);
    expect(liveBoards.get("g1")?.currentPage).toBe(2);
  });

  it("accepts a page change with no ops", () => {
    liveBoards.open("g1", date);
    expect(liveBoards.append("g1", [], 1, null)).toBe(true);
    expect(liveBoards.get("g1")?.currentPage).toBe(1);
  });

  // The stroke under her cursor is held in its own slot rather than appended,
  // so a growing line needs no id games and no retraction: the next flush
  // replaces it, and the committed stroke clears it.
  it("holds the in-progress stroke separately from the log", () => {
    liveBoards.open("g1", date);
    liveBoards.append("g1", [], 0, op("pending"));
    expect(liveBoards.get("g1")?.ops).toEqual([]);
    expect(liveBoards.get("g1")?.pending?.id).toBe("pending");
  });

  it("replaces the in-progress stroke on each flush", () => {
    liveBoards.open("g1", date);
    liveBoards.append("g1", [], 0, op("first"));
    liveBoards.append("g1", [], 0, op("second"));
    expect(liveBoards.get("g1")?.pending?.id).toBe("second");
  });

  it("clears the in-progress stroke when a committed op arrives", () => {
    liveBoards.open("g1", date);
    liveBoards.append("g1", [], 0, op("pending"));
    liveBoards.append("g1", [op("a")], 0, null);
    expect(liveBoards.get("g1")?.pending).toBeNull();
  });

  it("does not count the in-progress stroke against the op ceiling", () => {
    liveBoards.open("g1", date);
    for (let i = 0; i < 100; i += 1) {
      liveBoards.append("g1", [], 0, op(`p${i}`));
    }
    expect(liveBoards.get("g1")?.ops).toEqual([]);
  });

  it("discards a board", () => {
    liveBoards.open("g1", date);
    liveBoards.discard("g1");
    expect(liveBoards.get("g1")).toBeNull();
  });

  it("tolerates discarding a board that is not there", () => {
    expect(() => liveBoards.discard("g1")).not.toThrow();
  });

  // A board that grows without bound is a memory leak wearing a lesson as a
  // disguise, so the cap is enforced here rather than trusted to the client.
  it("refuses an append past the op ceiling", () => {
    liveBoards.open("g1", date);
    const many = Array.from({ length: 20_001 }, (_, i) => op(`o${i}`));
    expect(liveBoards.append("g1", many, 0)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/lib/whiteboard-live.test.ts`
Expected: FAIL — cannot resolve `@/lib/whiteboard-live`.

- [ ] **Step 3: Write the implementation**

Create `lib/whiteboard-live.ts`:

```ts
import type { DrawOp, Op } from "@/lib/whiteboard-ops";

export type LiveBoard = {
  // Stamped when she opened it, so a lesson crossing UTC midnight belongs to
  // the day it started rather than the day it ended.
  date: Date;
  ops: Op[];
  // Which page she is presenting. Presentation state, not board content — a
  // saved board has no current page, and the reader opens whichever they like.
  currentPage: number;
  // The stroke currently under her cursor, held in its own slot rather than
  // appended to the log. That is what lets a long line GROW on the student's
  // screen without any id trickery: each flush replaces this, and the committed
  // stroke clears it. Never stored — /finish reads the client's log, not this.
  pending: DrawOp | null;
};

// Held on globalThis for the same reason lib/prisma.ts and lib/chat-bus.ts are:
// dev's module reloading would otherwise hand each reload a fresh map, and a
// board opened before the reload would vanish mid-lesson.
const globalForLive = globalThis as unknown as {
  liveBoards: Map<string, LiveBoard> | undefined;
};

const boards = globalForLive.liveBoards ?? new Map<string, LiveBoard>();

if (process.env.NODE_ENV !== "production") {
  globalForLive.liveBoards = boards;
}

// A lesson-length board is a few thousand ops. This is a memory bound, not a
// product limit, and it is enforced here rather than trusted to the client.
const MAX_LIVE_OPS = 20_000;

export const liveBoards = {
  get(groupId: string): LiveBoard | null {
    return boards.get(groupId) ?? null;
  },

  // False rather than throwing when one is already open: the route turns that
  // into a 409 with a message she can read, and one student cannot be watching
  // two boards at once.
  open(groupId: string, date: Date): boolean {
    if (boards.has(groupId)) return false;
    boards.set(groupId, { date, ops: [], currentPage: 0, pending: null });
    return true;
  },

  append(
    groupId: string,
    ops: Op[],
    currentPage: number,
    pending: DrawOp | null,
  ): boolean {
    const board = boards.get(groupId);
    if (!board) return false;
    // The ceiling counts the log only. `pending` is one op that is replaced
    // rather than accumulated, so it cannot grow without bound.
    if (board.ops.length + ops.length > MAX_LIVE_OPS) return false;

    board.ops.push(...ops);
    board.currentPage = currentPage;
    // A committed op supersedes whatever was in flight: the stroke she just
    // finished IS the pending one, now in the log.
    board.pending = ops.length > 0 ? null : pending;
    return true;
  },

  // Tolerant of a group with no board: /finish and /discard both call it, and
  // so does a restart-crossed retry.
  discard(groupId: string): void {
    boards.delete(groupId);
  },
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/lib/whiteboard-live.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/whiteboard-live.ts tests/lib/whiteboard-live.test.ts
git commit -m "feat: add in-memory live whiteboard state

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 2: Board events on the bus

**Files:**
- Modify: `lib/chat-bus.ts`

- [ ] **Step 1: Add the board channel**

In `lib/chat-bus.ts`, add below the existing `revokeEvent` definition:

```ts
// A distinct event name per channel, so a listener filters by subscription
// rather than by inspecting the shape of what it received.
const boardEvent = (groupId: string) => `board:${groupId}`;

export type BoardFrame =
  | { kind: "open"; currentPage: number }
  // `ops` are committed and append on the viewer; `pending` is the stroke under
  // her cursor and REPLACES the viewer's copy each time, which is what makes a
  // long line grow rather than duplicate.
  | { kind: "ops"; ops: unknown[]; pending: unknown; currentPage: number }
  | { kind: "saved" }
  | { kind: "closed" };
```

Then add these two methods inside the `chatBus` object, after `subscribeRevoke`:

```ts
  publishBoard(groupId: string, frame: BoardFrame) {
    emitter.emit(boardEvent(groupId), frame);
  },

  subscribeBoard(groupId: string, listener: (frame: BoardFrame) => void) {
    emitter.on(boardEvent(groupId), listener);
    return () => {
      emitter.off(boardEvent(groupId), listener);
    };
  },
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/chat-bus.ts
git commit -m "feat: add board channel to the chat bus

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 3: `POST /open`, `POST /ops`, `POST /discard`

**Files:**
- Create: `app/api/whiteboard/[slug]/open/route.ts`
- Create: `app/api/whiteboard/[slug]/ops/route.ts`
- Create: `app/api/whiteboard/[slug]/discard/route.ts`

All three copy the guard block from `app/api/whiteboard/[slug]/finish/route.ts` verbatim: group lookup, `chatRole`, `role !== "teacher"` → 404.

- [ ] **Step 1: Write `/open`**

Create `app/api/whiteboard/[slug]/open/route.ts`:

```ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getCurrentTeacher } from "@/lib/session";
import { chatRole } from "@/lib/chat-access";
import { readToken, cookieNameFor } from "@/lib/student-tokens";
import { chatBus } from "@/lib/chat-bus";
import { liveBoards } from "@/lib/whiteboard-live";

export async function POST(
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
  const cookieStore = await cookies();
  const role = chatRole({
    isTeacher: Boolean(teacher),
    isEveryone: group.isEveryone,
    chatToken: group.chatToken,
    presented: readToken(
      url.searchParams.get("k") ?? undefined,
      cookieStore.get(cookieNameFor(slug))?.value,
    ),
  });
  if (role !== "teacher") return new NextResponse("Not found", { status: 404 });

  // The board's date is stamped here rather than at /finish, so a lesson that
  // crosses UTC midnight belongs to the day it started.
  const today = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);

  if (!liveBoards.open(group.id, today)) {
    // 409 and not 404: this one she can act on, by closing the other tab.
    return new NextResponse("Already drawing", { status: 409 });
  }

  chatBus.publishBoard(group.id, { kind: "open", currentPage: 0 });
  return NextResponse.json({ ok: true }, { status: 201 });
}
```

- [ ] **Step 2: Write `/ops`**

Create `app/api/whiteboard/[slug]/ops/route.ts`:

```ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getCurrentTeacher } from "@/lib/session";
import { chatRole } from "@/lib/chat-access";
import { readToken, cookieNameFor } from "@/lib/student-tokens";
import { readBoundedBody } from "@/lib/bounded-body";
import { chatBus } from "@/lib/chat-bus";
import { liveBoards } from "@/lib/whiteboard-live";
import { readOps } from "@/lib/whiteboard-ops";

// One flush is a partial stroke — tens of points. 256KB is far more than that
// and still bounds what a caller can make the process buffer.
const MAX_OPS_BYTES = 256 * 1024;

export async function POST(
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
  const cookieStore = await cookies();
  const role = chatRole({
    isTeacher: Boolean(teacher),
    isEveryone: group.isEveryone,
    chatToken: group.chatToken,
    presented: readToken(
      url.searchParams.get("k") ?? undefined,
      cookieStore.get(cookieNameFor(slug))?.value,
    ),
  });
  if (role !== "teacher") return new NextResponse("Not found", { status: 404 });

  const text = await readBoundedBody(request, MAX_OPS_BYTES);
  if (text === null) return new NextResponse("Bad request", { status: 400 });

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    return new NextResponse("Bad request", { status: 400 });
  }

  const body = (payload ?? {}) as {
    ops?: unknown;
    pending?: unknown;
    currentPage?: unknown;
  };
  const ops = readOps(body.ops);

  // readOps on a one-element array so `pending` goes through exactly the same
  // validation as a committed op, rather than a second, drifting copy of it.
  const pendingCandidate = readOps([body.pending])[0] ?? null;
  const pending =
    pendingCandidate && pendingCandidate.kind !== "remove"
      ? pendingCandidate
      : null;

  const currentPage =
    typeof body.currentPage === "number" &&
    Number.isInteger(body.currentPage) &&
    body.currentPage >= 0
      ? body.currentPage
      : 0;

  // 409 rather than 404 when no board is open: the client can react by
  // reopening, and it will happen after every deploy mid-lesson.
  if (!liveBoards.append(group.id, ops, currentPage, pending)) {
    return new NextResponse("No board", { status: 409 });
  }

  // Republished from the validated values, not the raw body, so a malformed op
  // never reaches a viewer. Read back from the record rather than reusing the
  // locals, because append() decides whether pending survived.
  const board = liveBoards.get(group.id);
  chatBus.publishBoard(group.id, {
    kind: "ops",
    ops,
    pending: board?.pending ?? null,
    currentPage,
  });

  // 204: the sender already has these ops, and returning them would double
  // every flush.
  return new NextResponse(null, { status: 204 });
}
```

- [ ] **Step 3: Write `/discard`**

Create `app/api/whiteboard/[slug]/discard/route.ts`. Identical guard block, then:

```ts
  liveBoards.discard(group.id);
  chatBus.publishBoard(group.id, { kind: "closed" });
  return new NextResponse(null, { status: 204 });
```

The full file:

```ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getCurrentTeacher } from "@/lib/session";
import { chatRole } from "@/lib/chat-access";
import { readToken, cookieNameFor } from "@/lib/student-tokens";
import { chatBus } from "@/lib/chat-bus";
import { liveBoards } from "@/lib/whiteboard-live";

export async function POST(
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
  const cookieStore = await cookies();
  const role = chatRole({
    isTeacher: Boolean(teacher),
    isEveryone: group.isEveryone,
    chatToken: group.chatToken,
    presented: readToken(
      url.searchParams.get("k") ?? undefined,
      cookieStore.get(cookieNameFor(slug))?.value,
    ),
  });
  if (role !== "teacher") return new NextResponse("Not found", { status: 404 });

  liveBoards.discard(group.id);
  chatBus.publishBoard(group.id, { kind: "closed" });
  return new NextResponse(null, { status: 204 });
}
```

- [ ] **Step 4: Make `/finish` announce and clean up**

In `app/api/whiteboard/[slug]/finish/route.ts`, add the imports:

```ts
import { chatBus } from "@/lib/chat-bus";
import { liveBoards } from "@/lib/whiteboard-live";
```

Replace the date line — the live board's date wins when there is one:

```ts
  // Part 1 had no live board and fell back to today. Now a board that was
  // opened before UTC midnight keeps the day it started; the fallback stays for
  // the case where the server restarted mid-board, which /finish still survives
  // because the body is authoritative.
  const live = liveBoards.get(group.id);
  const date =
    live?.date ??
    new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
```

and pass `date` instead of `today` to `createWhiteboard`.

Then, immediately before the `return`:

```ts
  liveBoards.discard(group.id);
  chatBus.publishBoard(group.id, { kind: "saved" });
```

- [ ] **Step 5: Typecheck and lint**

Run: `npm run lint && npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add "app/api/whiteboard/[slug]"
git commit -m "feat: add live whiteboard open, ops and discard routes

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 4: Board frames on the chat stream

**Files:**
- Modify: `app/api/chat/[slug]/stream/route.ts`

Read the whole file first. The two properties below are what make this safe, and both are easy to destroy by accident.

- [ ] **Step 1: Add the imports**

```ts
import { chatBus, type BoardFrame } from "@/lib/chat-bus";
import { liveBoards } from "@/lib/whiteboard-live";
```

(`chatBus` is already imported — extend the existing import rather than duplicating it.)

- [ ] **Step 2: Add a board sender and subscription inside `start(controller)`**

After the existing `send` function, add:

```ts
      // NO id: line, and a named event. Both matter:
      //
      // - Per the SSE spec an event without an id leaves the client's
      //   last-event-id buffer untouched, so ephemeral board traffic cannot
      //   corrupt the chat's replay anchor. Boards are deliberately NOT
      //   replayed from the database, because there is nothing there to replay.
      // - onmessage fires only for unnamed events, so the chat handler in
      //   ChatFab cannot see these and adding them cannot break chat.
      const sendBoard = (frame: BoardFrame) => {
        try {
          controller.enqueue(
            encoder.encode(`event: board\ndata: ${JSON.stringify(frame)}\n\n`),
          );
        } catch {
          teardown();
        }
      };
```

- [ ] **Step 3: Subscribe before the backlog, like the message channel already does**

Immediately after the existing `unsubscribe = chatBus.subscribe(...)` block, add:

```ts
      // Subscribed before the snapshot is sent, for the same reason the message
      // channel subscribes before its backlog: doing it afterwards leaves a
      // window the width of the snapshot in which an op reaches neither path
      // and is never seen again.
      const pendingBoard: BoardFrame[] = [];
      let replayingBoard = true;
      unsubscribeBoard = chatBus.subscribeBoard(group.id, (frame) => {
        if (replayingBoard) pendingBoard.push(frame);
        else sendBoard(frame);
      });
```

- [ ] **Step 4: Declare and tear down the new unsubscribe**

Beside the existing `let unsubscribeRevoke = () => {};`, add:

```ts
  let unsubscribeBoard = () => {};
```

and add `unsubscribeBoard();` to the body of `teardown`.

- [ ] **Step 5: Send the snapshot after the message backlog**

After the existing `for (const message of pending) { ... }` loop, add:

```ts
      // A student who opens their page mid-board must see the whole thing, not
      // the tail. The in-memory board holds the full log, so this is the same
      // idea as the message backlog above, pointed at memory instead of Prisma.
      const live = liveBoards.get(group.id);
      if (live) {
        sendBoard({
          kind: "ops",
          ops: live.ops,
          pending: live.pending,
          currentPage: live.currentPage,
        });
      }

      replayingBoard = false;
      for (const frame of pendingBoard) sendBoard(frame);
```

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 7: Verify chat still works**

Run `npm run dev`, open a student page with `?k=…`, send a chat message both ways, then reload mid-conversation and confirm the transcript replays intact. **A regression here is worse than the feature is worth** — the chat is in production use.

- [ ] **Step 8: Commit**

```bash
git add "app/api/chat/[slug]/stream/route.ts"
git commit -m "feat: carry board frames on the chat stream

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 5: `components/StreamProvider.tsx` — one connection

**Files:**
- Create: `components/StreamProvider.tsx`
- Modify: `components/chat/ChatFab.tsx`

This is a refactor of working code. The reason belongs in the commit message: two `EventSource`s would mean two streams, and **each one replays the entire chat backlog from the database at connect**.

- [ ] **Step 1: Write the provider**

Create `components/StreamProvider.tsx`:

```ts
"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { ChatMessage } from "@/components/chat/MessageList";
import { readOps, type DrawOp, type Op } from "@/lib/whiteboard-ops";

export type LiveBoardState = {
  ops: Op[];
  // The stroke under her cursor. Replaced wholesale on every frame, never
  // appended — that is what makes a growing line grow instead of duplicating.
  pending: DrawOp | null;
  currentPage: number;
} | null;

type StreamValue = {
  messages: ChatMessage[];
  removeMessage: (id: string) => void;
  board: LiveBoardState;
};

const StreamContext = createContext<StreamValue | null>(null);

export function useStream(): StreamValue {
  const value = useContext(StreamContext);
  if (!value) throw new Error("useStream used outside StreamProvider");
  return value;
}

export function StreamProvider({
  slug,
  children,
}: {
  slug: string;
  children: ReactNode;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [board, setBoard] = useState<LiveBoardState>(null);

  // Opened on mount and held for as long as this component is mounted — not
  // just while a panel is open. That was already true of the EventSource this
  // replaces, deliberately: an unread dot can only reflect messages the client
  // actually observed, and a live board must reach a student sitting on the
  // Card tab.
  useEffect(() => {
    const source = new EventSource(`/api/chat/${slug}/stream`);

    source.onmessage = (event) => {
      const raw = JSON.parse(event.data) as ChatMessage & { createdAt: string };
      const message = { ...raw, createdAt: new Date(raw.createdAt) };
      setMessages((current) =>
        // De-duplicated by id because a reconnect replays, and because the
        // sender receives its own message back through the stream.
        current.some((m) => m.id === message.id) ? current : [...current, message],
      );
    };

    source.addEventListener("board", (event) => {
      const frame = JSON.parse((event as MessageEvent).data) as {
        kind: "open" | "ops" | "saved" | "closed";
        ops?: unknown;
        pending?: unknown;
        currentPage?: number;
      };

      if (frame.kind === "saved" || frame.kind === "closed") {
        setBoard(null);
        return;
      }

      if (frame.kind === "open") {
        setBoard({ ops: [], pending: null, currentPage: 0 });
        return;
      }

      // readOps on the way in as well as on the way out: this arrived over a
      // network as JSON, and nothing between here and there has checked it.
      const ops = readOps(frame.ops);
      const candidate = readOps([frame.pending])[0] ?? null;
      const pending =
        candidate && candidate.kind !== "remove" ? candidate : null;

      setBoard((current) => {
        const page = frame.currentPage ?? current?.currentPage ?? 0;
        // ops APPEND — a snapshot arrives as one frame holding the whole log,
        // and an incremental flush as a few ops, and appending handles both
        // because a snapshot only ever reaches a client whose board is empty.
        // pending REPLACES, because it is one stroke being redrawn.
        if (!current) return { ops, pending, currentPage: page };
        return { ops: [...current.ops, ...ops], pending, currentPage: page };
      });
    });

    return () => source.close();
  }, [slug]);

  const value = useMemo<StreamValue>(
    () => ({
      messages,
      removeMessage: (id: string) =>
        setMessages((current) => current.filter((m) => m.id !== id)),
      board,
    }),
    [messages, board],
  );

  return (
    <StreamContext.Provider value={value}>{children}</StreamContext.Provider>
  );
}
```

- [ ] **Step 2: Make `ChatFab` a consumer**

In `components/chat/ChatFab.tsx`:

Remove the `useEffect` that creates the `EventSource` (currently lines 48–75) and the `messages` `useState`. Replace them with:

```ts
  const { messages, removeMessage } = useStream();
```

Add the import:

```ts
import { useStream } from "@/components/StreamProvider";
```

The unread dot must keep working, and it previously lived in the stream's `onmessage`. Move it to an effect watching `messages`:

```ts
  // Was inside the stream handler before the connection moved to the provider.
  // Same rule, same localStorage key: the newest message from the other party,
  // compared against the last one this device saw.
  useEffect(() => {
    const fromOther = messages.filter(
      (m) => m.fromTeacher !== (self === "teacher"),
    );
    const newest = fromOther[fromOther.length - 1];
    if (!newest) return;

    if (openRef.current) {
      window.localStorage.setItem(seenKey(slug), newest.id);
      setUnseen(false);
    } else {
      setUnseen(window.localStorage.getItem(seenKey(slug)) !== newest.id);
    }
  }, [messages, self, slug]);
```

Change `handleDeleteMessage` to use the provider's remover instead of its own state:

```ts
  async function handleDeleteMessage(id: string) {
    if (!onDeleteMessage) return;
    await onDeleteMessage(id);
    // The SSE stream only ever carries insertions, so a delete has to be
    // reflected locally by hand — nothing else will tell this client it is gone.
    removeMessage(id);
  }
```

The `query` string and the `token` prop are no longer used for the stream, but `send` still uses `query`. Leave both alone.

- [ ] **Step 3: Wrap the student page**

In `app/g/[slug]/page.tsx`, wrap everything the provider must serve. Replace the `unlocked && <ChatFab … />` block and the tab body so both sit inside one provider:

```tsx
      {unlocked ? (
        <StreamProvider slug={slug}>
          {body}
          <ChatFab … />
        </StreamProvider>
      ) : (
        body
      )}
```

where `body` is the existing tab-switching JSX extracted to a `const body = (…)` above the `return`. Add the import:

```ts
import { StreamProvider } from "@/components/StreamProvider";
```

- [ ] **Step 4: Verify one connection, not two**

Run `npm run dev`, open a tokened student page, and check the Network tab: exactly **one** request to `/api/chat/<slug>/stream`, in `eventsource` type, staying pending.

- [ ] **Step 5: Lint, typecheck, test**

Run: `npm run lint && npm run typecheck && npm test`
Expected: all pass. Send a message both ways and confirm the unread dot still appears.

- [ ] **Step 6: Commit**

```bash
git add components/StreamProvider.tsx components/chat/ChatFab.tsx "app/g/[slug]/page.tsx"
git commit -m "refactor: lift the EventSource into StreamProvider

Two EventSources would mean two streams, and each one replays the whole
chat backlog from the database at connect. The chat and the whiteboard
now share one connection.

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 6: Live drawing in the editor

**Files:**
- Modify: `components/whiteboard/BoardEditor.tsx`

- [ ] **Step 1: Open a board on mount and discard on cancel**

First widen the React import — Part 1 left it at `{ useRef, useState }`:

```ts
import { useEffect, useRef, useState } from "react";
```

Then add to `BoardEditor`:

```ts
  const [liveError, setLiveError] = useState(false);

  // Opened once, on mount. A failure here is not fatal: she can still draw and
  // save, the student simply will not watch it happen — which is exactly what
  // Part 1 was.
  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/whiteboard/${slug}/open`, { method: "POST" }).then(
      (response) => {
        if (!cancelled && !response.ok) setLiveError(true);
      },
      () => {
        if (!cancelled) setLiveError(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [slug]);
```

Change `onCancel` handling so the live board is dropped too — in the *Annuler* button:

```tsx
          <button
            type="button"
            onClick={() => {
              void fetch(`/api/whiteboard/${slug}/discard`, { method: "POST" });
              onCancel();
            }}
            className="rounded-full border border-[var(--card-line)] px-4 py-2 text-sm"
          >
            Annuler
          </button>
```

- [ ] **Step 2: Flush ops as she draws**

Add a flush queue. Ops already committed to `ops` state are the source of truth for saving; this only mirrors them outward.

```ts
  const flushed = useRef(0);
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // At most one request every 150ms. Committed ops go in `ops` and append on
  // the viewer; the stroke under her cursor goes in `pending` and REPLACES the
  // viewer's copy, which is what makes a long line grow rather than duplicate.
  // Worst case is roughly seven requests a second — fine for one teacher and one
  // student, and the ops route does no database round trip per call.
  function flushSoon() {
    if (flushTimer.current) return;
    flushTimer.current = setTimeout(() => {
      flushTimer.current = null;

      const committed = opsRef.current.slice(flushed.current);
      const inProgress = pendingRef.current;
      if (committed.length === 0 && !inProgress) return;

      const sent = committed.length;
      flushed.current += sent;

      void fetch(`/api/whiteboard/${slug}/ops`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ops: committed,
          pending: inProgress,
          currentPage: pageRef.current,
        }),
      }).catch(() => {
        // Rewind so the next flush retries them. Her local log is untouched, so
        // the saved board is correct whether or not this ever succeeds.
        flushed.current -= sent;
      });
    }, 150);
  }
```

Add refs so the timer always reads current values without being torn down and rebuilt on every stroke:

```ts
  const opsRef = useRef<Op[]>([]);
  const pageRef = useRef(0);
  const pendingRef = useRef<Op | null>(null);

  useEffect(() => {
    opsRef.current = ops;
    pageRef.current = page;
    flushSoon();
    // flushSoon only reads refs, so it is stable and needs no dependency entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ops, page]);
```

Then set `pendingRef` wherever the preview is set, and flush. In `handlePointerMove`, after the existing `setPreview(...)` call in each branch, add:

```ts
    pendingRef.current =
      tool === "arrow"
        ? {
            id: "pending",
            page,
            kind: "arrow",
            x1: drawing.current[0],
            y1: drawing.current[1],
            x2: x,
            y2: y,
            colour,
          }
        : {
            id: "pending",
            page,
            kind: "stroke",
            points: [...drawing.current],
            colour,
            width: 5,
          };
    flushSoon();
```

And clear it in `handlePointerUp`, before the `append(...)` call, so the committed op arrives in the same or the next flush and supersedes it:

```ts
    // The append below puts the finished stroke in the log; the server clears
    // `pending` for us the moment a committed op arrives, so there is nothing
    // to retract and no id to reconcile.
    pendingRef.current = null;
```

- [ ] **Step 3: Show a degraded state when live failed**

Beside the existing `error` display:

```tsx
          {liveError && (
            <span className="text-sm text-[var(--card-moss)]">
              Diffusion en direct indisponible — le tableau sera visible après
              l&apos;enregistrement.
            </span>
          )}
```

- [ ] **Step 4: Lint, typecheck, test**

Run: `npm run lint && npm run typecheck && npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add components/whiteboard/BoardEditor.tsx
git commit -m "feat: stream board ops as Jenn draws

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 7: The live view and the banner

**Files:**
- Create: `components/whiteboard/LiveBanner.tsx`
- Modify: `components/whiteboard/BoardTab.tsx`

- [ ] **Step 1: Write the banner**

Create `components/whiteboard/LiveBanner.tsx`:

```ts
"use client";

import Link from "next/link";
import { useStream } from "@/components/StreamProvider";

// A banner rather than an auto-switch, because yanking the page out from under
// someone mid-sentence is worse than a button — and rather than nothing,
// because a missed verbal instruction means drawing to an empty room.
export function LiveBanner({ slug }: { slug: string }) {
  const { board } = useStream();
  if (!board) return null;

  return (
    <div className="mx-auto mb-6 flex max-w-[560px] items-center justify-between gap-3 rounded-xl border border-[var(--card-line)] bg-[var(--card-bleu-soft)] px-4 py-3">
      <span className="font-[family-name:var(--card-font-serif)] text-sm text-[var(--card-bleu)]">
        Jenn dessine en ce moment
      </span>
      <Link
        href={`/g/${slug}?tab=board`}
        className="rounded-full bg-[var(--card-bleu)] px-4 py-1.5 text-sm text-white"
      >
        Ouvrir le tableau
      </Link>
    </div>
  );
}
```

- [ ] **Step 2: Render the live board in the tab**

In `components/whiteboard/BoardTab.tsx`, add:

```ts
import { foldPage } from "@/lib/whiteboard-ops";
import { BoardCanvas } from "@/components/whiteboard/BoardCanvas";
import { useStream } from "@/components/StreamProvider";
```

and, immediately after the `if (drawing) { … }` block that renders the editor, add:

```tsx
  // The student's live view. Above the archive rather than replacing it, so
  // switching to this tab mid-lesson does not hide the boards they already have.
  if (board && !isTeacher) {
    const page = [
      ...foldPage(board.ops).filter((op) => op.page === board.currentPage),
      // The stroke still under her cursor, drawn last so it sits on top. It is
      // not in the log and never will be — the committed version arrives on
      // pointerup and the server clears this in the same breath.
      ...(board.pending && board.pending.page === board.currentPage
        ? [board.pending]
        : []),
    ];
    return (
      <div className="mx-auto w-full max-w-[1100px]">
        <div
          style={{ aspectRatio: "1600 / 1000" }}
          className="w-full overflow-hidden rounded-xl border border-[var(--card-line)]"
        >
          <BoardCanvas ops={page} className="h-full w-full" />
        </div>
        <p className="mt-3 text-center font-[family-name:var(--card-font-serif)] text-sm italic text-[var(--card-moss)]">
          Page {board.currentPage + 1} — Jenn dessine…
        </p>
      </div>
    );
  }
```

with `const { board } = useStream();` added at the top of the component alongside the existing hooks.

- [ ] **Step 3: Render the banner on the other tabs**

In `app/g/[slug]/page.tsx`, inside the extracted `body`, render the banner on the card and files tabs only — the board tab already shows the thing itself:

```tsx
      {tab !== "board" && <LiveBanner slug={slug} />}
```

Add the import:

```ts
import { LiveBanner } from "@/components/whiteboard/LiveBanner";
```

Because `LiveBanner` calls `useStream`, it must sit inside `StreamProvider` — which the Task 5 restructure already guarantees, since `body` is rendered inside it when `unlocked`.

- [ ] **Step 4: Lint, typecheck, test, build**

Run: `npm run lint && npm run typecheck && npm test && npm run build`
Expected: all pass.

- [ ] **Step 5: Two-browser manual check**

This is the only way to verify the feature, and it must be done before claiming it works.

1. Browser A: log in at `/login`, open `/g/<slug>?k=<chatToken>`, go to *Le tableau*, click *Nouveau tableau*.
2. Browser B (or a private window): open `/g/<slug>?k=<chatToken>` and stay on *La carte*.
3. Draw in A. **Expect in B:** the banner appears within a second.
4. Click *Ouvrir le tableau* in B. **Expect:** the strokes already drawn are all present — not just the ones since switching. This is the snapshot working.
5. Keep drawing in A. **Expect:** B follows, and a long stroke grows rather than appearing whole.
6. Add a page in A and draw on it. **Expect:** B follows to page 2.
7. Click *Terminé* in A. **Expect:** the banner clears in B, and the board appears in B's archive after a reload.
8. Reload B mid-draw. **Expect:** it re-snapshots and catches up.
9. Send a chat message in both directions while a board is live. **Expect:** chat is unaffected.

- [ ] **Step 6: Commit**

```bash
git add components/whiteboard/LiveBanner.tsx components/whiteboard/BoardTab.tsx "app/g/[slug]/page.tsx"
git commit -m "feat: live whiteboard view and banner

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 8: Documentation

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add the routes**

Add to the Routes table:

```markdown
| `POST /api/whiteboard/[slug]/open` | teacher | starts a live board |
| `POST /api/whiteboard/[slug]/ops` | teacher | appends and fans out ops |
| `POST /api/whiteboard/[slug]/discard` | teacher | drops a live board, saving nothing |
```

- [ ] **Step 2: Extend the Whiteboards section**

Append to the Whiteboards section added in Part 1:

```markdown
A live board is an in-memory record in `lib/whiteboard-live.ts`, keyed by group
id and held on `globalThis` like `lib/prisma.ts` and `lib/chat-bus.ts`. **It
inherits the single-process constraint**: under pm2 cluster mode a live board
would be invisible to viewers on other workers, silently — the same trap the
chat has.

It exists only to fan out and to snapshot a student who connects mid-board.
**The client's log is authoritative for saving**, so `/finish` writes the ops
from its request body and a server restart mid-board costs the live view, not
the board.

Board traffic rides the **existing** chat SSE stream — no second endpoint and no
second access check, since `chatRole` already decides who may listen. Two
properties make that safe rather than merely convenient: board frames carry
**no `id:` line**, so per the SSE spec they leave `Last-EventID` untouched and
cannot corrupt the chat's replay anchor; and `onmessage` fires only for unnamed
events, so the chat handler cannot see them. Boards are deliberately not
replayed from the database, because there is nothing there to replay.

`components/StreamProvider.tsx` owns the single `EventSource`. It used to live
inside `ChatFab`, and was moved because two connections would each replay the
whole chat backlog at connect. It is opened on mount and held for the life of
the page, not the life of a panel — which is what lets a live board reach a
student sitting on the Card tab.

Which page Jenn is presenting travels as `currentPage` beside the ops and is
never stored: a saved board has no current page.
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document live whiteboards

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 9: Full CI verification

- [ ] **Step 1: Run CI in order**

```bash
npx prisma generate && npm run lint && npm run typecheck && npm test && npm run build
```

Expected: every step exits 0. Paste the real output; do not claim success without it.

- [ ] **Step 2: Confirm the chat is not regressed**

Run `npm test` and confirm `chat-access`, `chat-body`, `chat-day` and `student-tokens` all still pass, then repeat the manual chat check from Task 4 Step 7. The chat is in production use and shares a stream with this feature now.

---

## Known limitations, accepted

- **A second teacher tab** gets a 409 from `/open` rather than joining the existing board. Deliberate: the live map is keyed by group, and one student cannot be watching two boards.
- **The student's live view shows only `currentPage`.** They cannot browse a live board's other pages while she is drawing, because following her is the point.
- **A crash mid-board loses the live view, not the board.** She clicks *Terminé* and it saves; the student sees it after a reload.
- **No pointer.** Preply has a laser pointer precisely because a shared canvas has no shared cursor. Cheap to add later — an ephemeral op that is never folded into a scene and never stored.
