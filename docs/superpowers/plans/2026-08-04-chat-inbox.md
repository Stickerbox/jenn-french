# Chat Inbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Jenn's one-conversation chat FAB into an inbox — students on the left, the selected conversation on the right — available on every page she is signed in to, with per-message local times under sticky day headings, and full-screen on mobile for both her and her students.

**Architecture:** A new teacher-only SSE endpoint carries every conversation over one connection (plus an optional board channel, so `/g/[slug]` still holds exactly one `EventSource`). `StreamProvider` stops taking a slug and takes a URL; its message array becomes flat and multi-conversation, keyed by a `groupId` the payload already carries. Day grouping and timestamps move from UTC to the reader's local zone — a deliberate, bounded exception to the project-wide UTC rule, scoped to chat only. All new logic lands as pure functions in `lib/` with tests in `tests/lib/`.

**Tech Stack:** Next.js App Router (RSC + server actions), Prisma on SQLite, Tailwind v4 via PostCSS, Vitest, `Intl.DateTimeFormat`, SSE over `ReadableStream`.

**Read first:** `docs/superpowers/specs/2026-08-04-chat-inbox-design.md`, and then `docs/superpowers/specs/2026-08-03-student-login-design.md`, which shipped before this and which this builds on top of. The second one matters for three reasons: `unlocked` on `/g/[slug]` is now `gate === "signed-in"` from `lib/student-gate.ts` rather than a hand-rolled token compare; `GroupSummary` and the admin Students tab were rewritten around claim state; and it explicitly re-states the rule this design retires. That apparent conflict is resolved in *What this retires §1 and §1a* of the chat inbox spec — read those two sections before touching `app/g/[slug]/page.tsx`.

**A standing instruction for this plan:** several tasks below touch files the sign-in build rewrote. Where a step describes an edit by anchor (a symbol name, a JSX block) rather than by line number, that is deliberate — **read the file first and place the change by what is actually there.** Do not assume the surrounding code matches any snippet in this document unless the step shows a full-file replacement.

---

## File Structure

**New pure modules** (`lib/`, each with a test in `tests/lib/`):

| File | Responsibility |
|---|---|
| `lib/chat-message.ts` | The `ChatMessage` shape, moved out of a component so `lib/` never imports from `components/`. |
| `lib/chat-time.ts` | `localDayKey`, `formatTime` — the only two places in this project that do **not** pass `timeZone: "UTC"`. |
| `lib/chat-stamp.ts` | `dayHeading` (message list), `listStamp` (conversation list). |
| `lib/chat-preview.ts` | The one-line preview under a student's name. |
| `lib/inbox-order.ts` | Conversation ordering. |
| `lib/chat-select.ts` | Selecting one conversation out of the flat message array. |
| `lib/stream-url.ts` | Which SSE endpoint a viewer connects to. |

**Modified:**

| File | Change |
|---|---|
| `lib/chat-day.ts` | Group by local day instead of UTC. |
| `lib/chat-bus.ts` | Add a broadcast channel for the teacher stream. |
| `lib/messages.ts` | Add `messagesAfterAll`; remove `unreadCounts`. |
| `app/actions.ts` | Add `loadConversation` and `inviteLink`. |
| `components/StreamProvider.tsx` | `url` prop, `ingest`, flat multi-conversation messages. |
| `components/chat/MessageList.tsx` | Sticky headings, per-message time. |
| `components/chat/ChatFab.tsx` | Student-only; uses the new panel parts. |
| `app/admin/page.tsx`, `app/admin/pages/[slug]/page.tsx`, `app/g/[slug]/page.tsx` | Render `<TeacherInbox />`. |
| `CLAUDE.md` | Routes table + the *Lesson chat* section. |

**New components:**

| File | Responsibility |
|---|---|
| `lib/inbox.ts` | `listConversations()` — the read model behind the left pane. |
| `app/api/inbox/stream/route.ts` | The teacher-wide SSE endpoint. |
| `components/chat/ChatPanel.tsx` | Panel chrome: positioning, responsive layout, header, back/close. |
| `components/chat/Conversation.tsx` | One conversation column: `MessageList` + `MessageInput`. |
| `components/chat/ConversationList.tsx` | The left pane / mobile level one. |
| `components/chat/UnclaimedNotice.tsx` | What replaces the composer for a student who has not signed up. |
| `components/chat/InboxFab.tsx` | Jenn's FAB: open state, selection, view state, unread. |
| `components/chat/TeacherInbox.tsx` | Server component: session check + `listConversations()`. |

**Deleted:** `components/chat/ChatWindow.tsx` — its two responsibilities split into `ChatPanel` and `Conversation`.

**Why `/api/inbox/stream` and not `/api/chat/stream`:** a static `stream` segment under `app/api/chat/` would take routing precedence over the existing `app/api/chat/[slug]/`, so a student whose name produced the slug `stream` would have their chat silently shadowed. Slugs are generated from teacher input (`lib/student-slug.ts`), so that is reachable. A separate top-level segment cannot collide with any slug.

---

## Task 1: The `ChatMessage` type moves to `lib/`

`ChatMessage` currently lives in `components/chat/MessageList.tsx`, and `lib/chat-select.ts` (Task 7) needs it. A module under `lib/` importing from `components/` inverts this codebase's layering, so the type moves first. It also gains `groupId` — the field the SSE payload has always carried and the client has always discarded.

**Files:**
- Create: `lib/chat-message.ts`
- Modify: `components/chat/MessageList.tsx` (remove the local type, import instead)
- Modify: `components/StreamProvider.tsx:11` (import path)

- [x] **Step 1: Create the type module**

```ts
// lib/chat-message.ts

// Mirrors StoredMessage in lib/messages.ts, minus nothing: the SSE route
// JSON.stringifies the whole selected record, so groupId has always been on the
// wire. It was dropped here only because a per-slug stream had no use for it.
// The inbox does — one array holds every conversation and this is what sorts
// them apart.
export type ChatMessage = {
  id: string;
  groupId: string;
  fromTeacher: boolean;
  body: string;
  createdAt: Date;
};
```

- [x] **Step 2: Point `MessageList` at it**

In `components/chat/MessageList.tsx`, delete the `export type ChatMessage = {...}` block (lines 7–12) and add to the imports:

```ts
import type { ChatMessage } from "@/lib/chat-message";
```

- [x] **Step 3: Point `StreamProvider` at it**

In `components/StreamProvider.tsx`, replace:

```ts
import type { ChatMessage } from "@/components/chat/MessageList";
```

with:

```ts
import type { ChatMessage } from "@/lib/chat-message";
```

- [x] **Step 4: Verify the project still compiles**

Run: `npx tsc --noEmit`
Expected: no output, exit 0. If another file imported `ChatMessage` from `MessageList`, the error names it — repoint that import the same way.

- [x] **Step 5: Commit**

```bash
git add lib/chat-message.ts components/chat/MessageList.tsx components/StreamProvider.tsx
git commit -m "refactor: move ChatMessage into lib and add groupId"
```

---

## Task 2: Local-time formatting (`lib/chat-time.ts`)

The two functions that make chat local. Both take an optional `timeZone` that **nothing in production passes** — it exists so the tests can pin a zone instead of mutating `process.env.TZ`, which would leak into every other test in the run.

**Files:**
- Create: `lib/chat-time.ts`
- Test: `tests/lib/chat-time.test.ts`

- [x] **Step 1: Write the failing test**

```ts
// tests/lib/chat-time.test.ts
import { describe, it, expect } from "vitest";
import { localDayKey, formatTime } from "@/lib/chat-time";

const MONTREAL = "America/Toronto";

describe("localDayKey", () => {
  it("returns a YYYY-MM-DD key", () => {
    expect(localDayKey(new Date("2026-08-04T15:00:00Z"), MONTREAL)).toBe(
      "2026-08-04",
    );
  });

  // The point of the whole change: this instant is 20:00 on the 4th in
  // Montreal, and the UTC rule this replaces filed it under the 5th.
  it("files a late-evening Montreal message under the day it was typed", () => {
    expect(localDayKey(new Date("2026-08-05T00:00:00Z"), MONTREAL)).toBe(
      "2026-08-04",
    );
  });

  it("files an early-morning Tokyo message under the day it was typed", () => {
    expect(localDayKey(new Date("2026-08-04T23:00:00Z"), "Asia/Tokyo")).toBe(
      "2026-08-05",
    );
  });

  it("pads single-digit months and days", () => {
    expect(localDayKey(new Date("2026-01-02T12:00:00Z"), "UTC")).toBe(
      "2026-01-02",
    );
  });

  it("reads the runtime zone when none is given", () => {
    // Not asserting a value — the runtime's zone is whatever the machine says.
    // Asserting the shape is what matters: production passes no zone.
    expect(localDayKey(new Date("2026-08-04T15:00:00Z"))).toMatch(
      /^\d{4}-\d{2}-\d{2}$/,
    );
  });
});

describe("formatTime", () => {
  it("formats an afternoon time in English", () => {
    expect(formatTime(new Date("2026-08-04T18:41:00Z"), "en-CA", MONTREAL)).toBe(
      "2:41 p.m.",
    );
  });

  it("shifts with the zone it is given", () => {
    const instant = new Date("2026-08-04T18:41:00Z");
    expect(formatTime(instant, "en-CA", "UTC")).not.toBe(
      formatTime(instant, "en-CA", MONTREAL),
    );
  });

  // Asserted loosely on purpose: fr-CA renders this as "20 h 02", but the exact
  // spacing character has changed between ICU versions and pinning it would
  // make this test fail on a Node upgrade for no behavioural reason.
  it("formats in French with both parts present", () => {
    const result = formatTime(
      new Date("2026-08-05T00:02:00Z"),
      "fr-CA",
      MONTREAL,
    );
    expect(result).toContain("20");
    expect(result).toContain("02");
  });

  it("pads the minute", () => {
    expect(formatTime(new Date("2026-08-04T13:05:00Z"), "en-CA", MONTREAL)).toBe(
      "9:05 a.m.",
    );
  });
});
```

- [x] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/lib/chat-time.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/chat-time"`.

- [x] **Step 3: Write the implementation**

```ts
// lib/chat-time.ts

// The only two formatters in this project that do NOT pass timeZone: "UTC".
// That rule earned its place because a card belongs to a teaching day Jenn
// picks and a week runs Monday to Friday wherever anyone is standing. A chat
// message belongs to no such day — it belongs to the moment someone typed it,
// and printing "8:02 p.m." under tomorrow's date is not consistency.
// See docs/superpowers/specs/2026-08-04-chat-inbox-design.md.
//
// `timeZone` defaults to undefined, which Intl reads as "the runtime's zone" —
// in a browser, the reader's. Nothing in this app passes it. It is a parameter
// so the tests can pin a zone without mutating process.env.TZ, which would leak
// into every other test in the run.

export function localDayKey(date: Date, timeZone?: string): string {
  // en-CA emits YYYY-MM-DD directly, which is the same key shape the UTC
  // version produced with toISOString().slice(0, 10), so nothing downstream
  // changes shape. Building it from getFullYear()/getMonth()/getDate() would
  // work for the ambient case and could not express an explicit zone at all —
  // which is exactly what makes this one testable.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function formatTime(
  date: Date,
  locale: string,
  timeZone?: string,
): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}
```

- [x] **Step 4: Run the test again**

Run: `npx vitest run tests/lib/chat-time.test.ts`
Expected: PASS, 9 tests.

If `formatTime` returns `"2:41 PM"` rather than `"2:41 p.m."`, the local Node build is using a reduced ICU. Confirm with `node -e "console.log(process.versions.icu)"` — a full build reports a version. Adjust the two exact-match assertions to whatever the full-ICU build in CI produces rather than weakening them; CI (`.github/workflows/ci.yml`) is the authority.

- [x] **Step 5: Commit**

```bash
git add lib/chat-time.ts tests/lib/chat-time.test.ts
git commit -m "feat: add local-timezone chat formatters"
```

---

## Task 3: `groupByDay` switches to local days

`lib/chat-day.ts` keeps its contract — including the deliberate compare-against-the-last-group behaviour that surfaces a broken ordering instead of hiding it — and changes only how the key is derived. Its test inverts: the case that asserted UTC grouping now asserts the opposite. That inversion **is** the change, not collateral damage.

**Files:**
- Modify: `lib/chat-day.ts`
- Modify: `tests/lib/chat-day.test.ts`

- [x] **Step 1: Rewrite the test**

Replace the whole contents of `tests/lib/chat-day.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { groupByDay } from "@/lib/chat-day";

const MONTREAL = "America/Toronto";
const at = (iso: string) => ({ createdAt: new Date(iso) });

describe("groupByDay", () => {
  it("returns nothing for no messages", () => {
    expect(groupByDay([], MONTREAL)).toEqual([]);
  });

  it("puts one day's messages under one heading", () => {
    const result = groupByDay(
      [at("2026-07-30T14:00:00Z"), at("2026-07-30T22:30:00Z")],
      MONTREAL,
    );
    expect(result).toHaveLength(1);
    expect(result[0].day).toBe("2026-07-30");
    expect(result[0].messages).toHaveLength(2);
  });

  it("splits messages across two days", () => {
    const result = groupByDay(
      [at("2026-07-30T14:00:00Z"), at("2026-07-31T14:00:00Z")],
      MONTREAL,
    );
    expect(result.map((g) => g.day)).toEqual(["2026-07-30", "2026-07-31"]);
  });

  // The inversion. This instant is 20:00 on the 30th in Montreal. The UTC rule
  // this replaces filed it under the 31st, which was defensible until a clock
  // time was printed beside it. See the 2026-08-04 chat inbox design.
  it("keeps a late-evening Montreal message on the day it was typed", () => {
    expect(groupByDay([at("2026-07-31T00:00:00Z")], MONTREAL)[0].day).toBe(
      "2026-07-30",
    );
  });

  it("groups the same instants differently in a different zone", () => {
    const messages = [at("2026-07-31T00:00:00Z")];
    expect(groupByDay(messages, MONTREAL)[0].day).toBe("2026-07-30");
    expect(groupByDay(messages, "Europe/Paris")[0].day).toBe("2026-07-31");
  });

  it("preserves the order messages arrived in within a day", () => {
    const first = at("2026-07-30T14:00:00Z");
    const second = at("2026-07-30T15:00:00Z");
    expect(groupByDay([first, second], MONTREAL)[0].messages).toEqual([
      first,
      second,
    ]);
  });

  it("keeps the caller's own fields on the messages it returns", () => {
    const rich = [
      { createdAt: new Date("2026-07-30T14:00:00Z"), body: "salut" },
    ];
    expect(groupByDay(rich, MONTREAL)[0].messages[0].body).toBe("salut");
  });

  it("starts a new group when the day changes back and forth", () => {
    const result = groupByDay(
      [
        at("2026-07-30T14:00:00Z"),
        at("2026-07-31T14:00:00Z"),
        at("2026-08-01T14:00:00Z"),
      ],
      MONTREAL,
    );
    expect(result).toHaveLength(3);
  });
});
```

- [x] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/lib/chat-day.test.ts`
Expected: FAIL — `expected '2026-07-31' to be '2026-07-30'` on the late-evening case.

- [x] **Step 3: Change the implementation**

Replace the whole contents of `lib/chat-day.ts`:

```ts
import { localDayKey } from "@/lib/chat-time";

export type DayGroup<T> = { day: string; messages: T[] };

// The spec chose a continuous log with day separators over a session model, so
// this is what "a lesson" means here — whatever happened on one calendar day.
//
// That day is the READER's, not UTC. Every other date in this project is UTC
// and stays UTC; this one moved on 2026-08-04, when a clock time was printed
// under each message and a 20:00 Montreal message sitting under tomorrow's
// heading stopped being a consistent rule and started being a bug.
//
// The consequence to hold onto: a message's heading now depends on who is
// reading it, and Jenn in Montreal and a student in Vancouver can correctly see
// the same message under different dates. Nothing is stored differently.
//
// `timeZone` is for tests only — see lib/chat-time.ts.
export function groupByDay<T extends { createdAt: Date }>(
  messages: T[],
  timeZone?: string,
): DayGroup<T>[] {
  const groups: DayGroup<T>[] = [];

  for (const message of messages) {
    const day = localDayKey(message.createdAt, timeZone);
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

- [x] **Step 4: Run the test again**

Run: `npx vitest run tests/lib/chat-day.test.ts`
Expected: PASS, 8 tests.

- [x] **Step 5: Commit**

```bash
git add lib/chat-day.ts tests/lib/chat-day.test.ts
git commit -m "feat: group chat messages by the reader's local day"
```

---

## Task 4: Day headings and list stamps (`lib/chat-stamp.ts`)

Two label producers. `dayHeading` is what sticks to the top of the message list: **"Today" or a date — there is no "Yesterday"**, because a heading is read in place where the date is more useful than the word. `listStamp` is the compact right-aligned stamp in the conversation list, and that one **does** have "Yesterday", because a bare `Jul 28` on something eight hours old reads as older than it is, and the list is scanned rather than read.

Every string is a parameter. Localisation is coming and inline copy is what makes it expensive.

**Files:**
- Create: `lib/chat-stamp.ts`
- Test: `tests/lib/chat-stamp.test.ts`

- [x] **Step 1: Write the failing test**

```ts
// tests/lib/chat-stamp.test.ts
import { describe, it, expect } from "vitest";
import { dayHeading, listStamp } from "@/lib/chat-stamp";

const MONTREAL = "America/Toronto";
const EN = { today: "Today" };
const FR = { today: "Aujourd'hui" };

describe("dayHeading", () => {
  it("says today when the key matches today's", () => {
    expect(dayHeading("2026-08-04", "2026-08-04", EN, "en-CA")).toBe("Today");
  });

  it("uses the label it is given, not a hardcoded word", () => {
    expect(dayHeading("2026-08-04", "2026-08-04", FR, "fr-CA")).toBe(
      "Aujourd'hui",
    );
  });

  it("formats any other day as a full date", () => {
    expect(dayHeading("2026-07-28", "2026-08-04", EN, "en-CA")).toContain("28");
    expect(dayHeading("2026-07-28", "2026-08-04", EN, "en-CA")).toContain(
      "2026",
    );
  });

  // Retention is forever, so a heading without a year is ambiguous on an old
  // conversation.
  it("includes the year", () => {
    expect(dayHeading("2025-07-28", "2026-08-04", EN, "en-CA")).toContain(
      "2025",
    );
  });

  // The key is ALREADY a local calendar day. Re-reading it in the reader's zone
  // would shift it by one; it has to be read back in UTC to survive intact.
  it("does not shift the day it was handed", () => {
    expect(dayHeading("2026-07-28", "2026-08-04", EN, "en-CA")).not.toContain(
      "27",
    );
  });
});

describe("listStamp", () => {
  const labels = { yesterday: "Yesterday" };
  // 2026-08-04 15:00 UTC is 11:00 on the 4th in Montreal.
  const now = new Date("2026-08-04T15:00:00Z");

  it("shows a time for something sent today", () => {
    const result = listStamp(
      new Date("2026-08-04T14:41:00Z"),
      now,
      "en-CA",
      labels,
      MONTREAL,
    );
    expect(result).toContain("41");
  });

  it("says yesterday for the day before", () => {
    expect(
      listStamp(
        new Date("2026-08-03T14:41:00Z"),
        now,
        "en-CA",
        labels,
        MONTREAL,
      ),
    ).toBe("Yesterday");
  });

  it("shows a short date for anything older", () => {
    const result = listStamp(
      new Date("2026-07-28T14:41:00Z"),
      now,
      "en-CA",
      labels,
      MONTREAL,
    );
    expect(result).toContain("28");
    expect(result).not.toBe("Yesterday");
  });

  // "Yesterday" is derived by stepping the calendar key back one day, not by
  // subtracting 24 hours of elapsed time. On a day a clock shifts, 24 hours
  // earlier is not reliably the previous calendar day.
  it("still says yesterday across a daylight-saving change", () => {
    // 2026-11-01 is the fall-back Sunday in America/Toronto.
    const afterFallBack = new Date("2026-11-02T15:00:00Z");
    expect(
      listStamp(
        new Date("2026-11-01T15:00:00Z"),
        afterFallBack,
        "en-CA",
        labels,
        MONTREAL,
      ),
    ).toBe("Yesterday");
  });

  it("treats a message from a month ago as a date, not a time", () => {
    const result = listStamp(
      new Date("2026-07-04T14:41:00Z"),
      now,
      "en-CA",
      labels,
      MONTREAL,
    );
    expect(result).not.toContain(":");
  });
});
```

- [x] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/lib/chat-stamp.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/chat-stamp"`.

- [x] **Step 3: Write the implementation**

```ts
// lib/chat-stamp.ts
import { localDayKey, formatTime } from "@/lib/chat-time";

export type DayHeadingLabels = { today: string };
export type ListStampLabels = { yesterday: string };

// A day key is a plain calendar label — "2026-07-28" — that localDayKey already
// resolved in the reader's zone. Reading it back through the reader's zone a
// second time would shift it by a day, so it is parsed and formatted in UTC.
// That looks like a violation of the local rule and is the opposite of one.
function formatDayKey(
  day: string,
  locale: string,
  options: Intl.DateTimeFormatOptions,
): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString(locale, {
    ...options,
    timeZone: "UTC",
  });
}

// Steps a calendar key back one day in UTC space, where there is no daylight
// saving to trip over. Subtracting 86_400_000 milliseconds from the instant
// would be wrong on the two days a year a clock moves.
function previousDayKey(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

// "Today", or the date. Deliberately no "Yesterday": a heading is read in
// place, where the date says more than the word does.
export function dayHeading(
  day: string,
  todayKey: string,
  labels: DayHeadingLabels,
  locale: string,
): string {
  if (day === todayKey) return labels.today;
  return formatDayKey(day, locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// The conversation list's compact stamp. This one DOES have a "Yesterday",
// because the list is scanned rather than read, and a bare "Jul 28" on
// something eight hours old reads as older than it is.
export function listStamp(
  date: Date,
  now: Date,
  locale: string,
  labels: ListStampLabels,
  timeZone?: string,
): string {
  const day = localDayKey(date, timeZone);
  const today = localDayKey(now, timeZone);

  if (day === today) return formatTime(date, locale, timeZone);
  if (day === previousDayKey(today)) return labels.yesterday;

  return formatDayKey(day, locale, { day: "numeric", month: "short" });
}
```

- [x] **Step 4: Run the test again**

Run: `npx vitest run tests/lib/chat-stamp.test.ts`
Expected: PASS, 10 tests.

- [x] **Step 5: Commit**

```bash
git add lib/chat-stamp.ts tests/lib/chat-stamp.test.ts
git commit -m "feat: add chat day headings and list stamps"
```

---

## Task 5: The preview line (`lib/chat-preview.ts`)

The line under a student's name in the list. Newlines collapse to spaces so one multi-line message cannot double a row's height, and a message from Jenn is prefixed so she can tell at a glance whether she already answered.

**Files:**
- Create: `lib/chat-preview.ts`
- Test: `tests/lib/chat-preview.test.ts`

- [x] **Step 1: Write the failing test**

```ts
// tests/lib/chat-preview.test.ts
import { describe, it, expect } from "vitest";
import { previewText } from "@/lib/chat-preview";

const labels = { you: "You: ", empty: "No messages yet" };

describe("previewText", () => {
  it("shows the empty label when there is no message", () => {
    expect(previewText(null, labels)).toBe("No messages yet");
  });

  it("shows a student's message as written", () => {
    expect(
      previewText({ body: "Merci beaucoup!", fromTeacher: false }, labels),
    ).toBe("Merci beaucoup!");
  });

  it("prefixes Jenn's own message", () => {
    expect(previewText({ body: "À demain", fromTeacher: true }, labels)).toBe(
      "You: À demain",
    );
  });

  // The label carries its own separator so a locale can change it — French
  // wants "Vous : " with a space before the colon.
  it("takes the separator from the label, not from the function", () => {
    expect(
      previewText(
        { body: "À demain", fromTeacher: true },
        { you: "Vous : ", empty: "Aucun message" },
      ),
    ).toBe("Vous : À demain");
  });

  it("collapses newlines so one row cannot become three", () => {
    expect(
      previewText({ body: "Bonjour\n\nMarie", fromTeacher: false }, labels),
    ).toBe("Bonjour Marie");
  });

  it("collapses runs of spaces and tabs too", () => {
    expect(
      previewText({ body: "a  \t  b", fromTeacher: false }, labels),
    ).toBe("a b");
  });

  it("trims surrounding whitespace", () => {
    expect(
      previewText({ body: "  salut  ", fromTeacher: false }, labels),
    ).toBe("salut");
  });

  // A body that is nothing but whitespace cannot reach the database — the POST
  // route trims before it stores — but a row that renders as a blank line under
  // a student who did write something is worse than the empty label.
  it("falls back to the empty label for a whitespace-only body", () => {
    expect(previewText({ body: "   ", fromTeacher: false }, labels)).toBe(
      "No messages yet",
    );
  });
});
```

- [x] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/lib/chat-preview.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/chat-preview"`.

- [x] **Step 3: Write the implementation**

```ts
// lib/chat-preview.ts

export type PreviewSource = { body: string; fromTeacher: boolean } | null;
export type PreviewLabels = { you: string; empty: string };

// Labels rather than inline copy, like lib/page-section-labels.ts: the admin
// says "You: " and a future French admin says "Vous : ", and the separator has
// to travel with the word because French puts a space before a colon.
export function previewText(
  last: PreviewSource,
  labels: PreviewLabels,
): string {
  if (!last) return labels.empty;

  // Collapsed, not truncated. The row is one line clamped by CSS; the job here
  // is making sure that line is not blank because the message happened to start
  // with a newline. The body arrives already capped at 200 characters by
  // lib/inbox.ts, which is a payload concern rather than a display one.
  const flat = last.body.replace(/\s+/g, " ").trim();
  if (flat === "") return labels.empty;

  return last.fromTeacher ? `${labels.you}${flat}` : flat;
}
```

- [x] **Step 4: Run the test again**

Run: `npx vitest run tests/lib/chat-preview.test.ts`
Expected: PASS, 8 tests.

- [x] **Step 5: Commit**

```bash
git add lib/chat-preview.ts tests/lib/chat-preview.test.ts
git commit -m "feat: add conversation preview line"
```

---

## Task 6: Conversation ordering (`lib/inbox-order.ts`)

Threads with messages sort by their last message, newest first. Students who have never written sit below them, alphabetically. Recency ordering is only tolerable because the list has a search field beside it (Task 15).

**Files:**
- Create: `lib/inbox-order.ts`
- Test: `tests/lib/inbox-order.test.ts`

- [x] **Step 1: Write the failing test**

```ts
// tests/lib/inbox-order.test.ts
import { describe, it, expect } from "vitest";
import { orderConversations } from "@/lib/inbox-order";

const conv = (name: string, iso: string | null) => ({
  name,
  lastMessage: iso ? { createdAt: new Date(iso) } : null,
});

const names = (list: { name: string }[]) => list.map((c) => c.name);

describe("orderConversations", () => {
  it("returns nothing for an empty list", () => {
    expect(orderConversations([])).toEqual([]);
  });

  it("puts the most recent conversation first", () => {
    const result = orderConversations([
      conv("Luc", "2026-08-01T10:00:00Z"),
      conv("Marie", "2026-08-04T10:00:00Z"),
      conv("Sophie", "2026-07-28T10:00:00Z"),
    ]);
    expect(names(result)).toEqual(["Marie", "Luc", "Sophie"]);
  });

  it("puts students who have never written at the bottom", () => {
    const result = orderConversations([
      conv("Antoine", null),
      conv("Marie", "2026-08-04T10:00:00Z"),
    ]);
    expect(names(result)).toEqual(["Marie", "Antoine"]);
  });

  it("orders the never-written alphabetically among themselves", () => {
    const result = orderConversations([
      conv("Zoé", null),
      conv("Antoine", null),
      conv("Marie", null),
    ]);
    expect(names(result)).toEqual(["Antoine", "Marie", "Zoé"]);
  });

  // Two messages landing in the same millisecond would otherwise order by
  // whatever the sort happened to do, and the list would reshuffle on refresh.
  it("breaks a tie on the name", () => {
    const result = orderConversations([
      conv("Zoé", "2026-08-04T10:00:00Z"),
      conv("Antoine", "2026-08-04T10:00:00Z"),
    ]);
    expect(names(result)).toEqual(["Antoine", "Zoé"]);
  });

  it("sorts accented names the way a French reader expects", () => {
    const result = orderConversations([
      conv("Émile", null),
      conv("Eva", null),
      conv("Fabien", null),
    ]);
    expect(names(result)).toEqual(["Émile", "Eva", "Fabien"]);
  });

  it("does not mutate the array it was given", () => {
    const input = [
      conv("Luc", "2026-08-01T10:00:00Z"),
      conv("Marie", "2026-08-04T10:00:00Z"),
    ];
    orderConversations(input);
    expect(names(input)).toEqual(["Luc", "Marie"]);
  });

  it("keeps the caller's own fields", () => {
    const result = orderConversations([
      { ...conv("Marie", "2026-08-04T10:00:00Z"), unread: 3 },
    ]);
    expect(result[0].unread).toBe(3);
  });
});
```

- [x] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/lib/inbox-order.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/inbox-order"`.

- [x] **Step 3: Write the implementation**

```ts
// lib/inbox-order.ts

export type OrderableConversation = {
  name: string;
  lastMessage: { createdAt: Date } | null;
};

// Inbox order: whoever wrote last is on top. Only tolerable because the list
// has a search field beside it — recency alone means a specific student is
// somewhere different every time she looks.
//
// Copied before sorting: Array.prototype.sort mutates, and this is handed a
// prop that React may be holding on to.
export function orderConversations<T extends OrderableConversation>(
  list: T[],
): T[] {
  return [...list].sort((a, b) => {
    if (a.lastMessage && b.lastMessage) {
      const difference =
        b.lastMessage.createdAt.getTime() - a.lastMessage.createdAt.getTime();
      // Two messages in the same millisecond would otherwise order by whatever
      // the sort happened to do, and the list would reshuffle on refresh.
      return difference !== 0 ? difference : byName(a, b);
    }
    // A student with no messages is not "infinitely old" — they are a separate
    // group that sits below every conversation, however stale.
    if (a.lastMessage) return -1;
    if (b.lastMessage) return 1;
    return byName(a, b);
  });
}

// fr-CA so "Émile" files under E rather than after Z, which is where a plain
// code-point compare would put it.
function byName(a: OrderableConversation, b: OrderableConversation): number {
  return a.name.localeCompare(b.name, "fr-CA");
}
```

- [x] **Step 4: Run the test again**

Run: `npx vitest run tests/lib/inbox-order.test.ts`
Expected: PASS, 8 tests.

- [x] **Step 5: Commit**

```bash
git add lib/inbox-order.ts tests/lib/inbox-order.test.ts
git commit -m "feat: add conversation ordering"
```

---

## Task 7: Selecting one conversation (`lib/chat-select.ts`)

`StreamProvider` will hold one flat array covering every conversation. This picks one out and sorts it. **The sort is not optional**: a conversation's history arrives from a server action and can land after a live message from that same conversation has already been appended.

**Files:**
- Create: `lib/chat-select.ts`
- Test: `tests/lib/chat-select.test.ts`

- [x] **Step 1: Write the failing test**

```ts
// tests/lib/chat-select.test.ts
import { describe, it, expect } from "vitest";
import { messagesFor } from "@/lib/chat-select";
import type { ChatMessage } from "@/lib/chat-message";

const msg = (
  id: string,
  groupId: string,
  iso: string,
): ChatMessage => ({
  id,
  groupId,
  fromTeacher: false,
  body: id,
  createdAt: new Date(iso),
});

describe("messagesFor", () => {
  it("returns nothing when the group has no messages", () => {
    expect(messagesFor([msg("a", "g1", "2026-08-04T10:00:00Z")], "g2")).toEqual(
      [],
    );
  });

  it("keeps only the group asked for", () => {
    const all = [
      msg("a", "g1", "2026-08-04T10:00:00Z"),
      msg("b", "g2", "2026-08-04T10:01:00Z"),
      msg("c", "g1", "2026-08-04T10:02:00Z"),
    ];
    expect(messagesFor(all, "g1").map((m) => m.id)).toEqual(["a", "c"]);
  });

  // The case the sort exists for: history fetched on select lands after a live
  // message that arrived before she opened the conversation.
  it("sorts out-of-order arrivals by time", () => {
    const all = [
      msg("live", "g1", "2026-08-04T12:00:00Z"),
      msg("old", "g1", "2026-08-04T09:00:00Z"),
    ];
    expect(messagesFor(all, "g1").map((m) => m.id)).toEqual(["old", "live"]);
  });

  // The same total order the server queries use, (createdAt, id). Without the
  // tiebreak, two messages sharing a millisecond swap places between renders.
  it("breaks a same-millisecond tie on the id", () => {
    const all = [
      msg("b", "g1", "2026-08-04T10:00:00.000Z"),
      msg("a", "g1", "2026-08-04T10:00:00.000Z"),
    ];
    expect(messagesFor(all, "g1").map((m) => m.id)).toEqual(["a", "b"]);
  });

  it("does not mutate the array it was given", () => {
    const all = [
      msg("live", "g1", "2026-08-04T12:00:00Z"),
      msg("old", "g1", "2026-08-04T09:00:00Z"),
    ];
    messagesFor(all, "g1");
    expect(all.map((m) => m.id)).toEqual(["live", "old"]);
  });

  it("returns the messages themselves, not copies", () => {
    const one = msg("a", "g1", "2026-08-04T10:00:00Z");
    expect(messagesFor([one], "g1")[0]).toBe(one);
  });
});
```

- [x] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/lib/chat-select.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/chat-select"`.

- [x] **Step 3: Write the implementation**

```ts
// lib/chat-select.ts
import type { ChatMessage } from "@/lib/chat-message";

// StreamProvider holds one flat array covering every conversation the viewer
// may see. For a student that is one conversation and this is a no-op filter;
// for Jenn it is the whole inbox.
//
// The sort is not optional. A conversation's history arrives from a server
// action when she selects it, and can land after a live message from that same
// conversation was already appended. Ordering is (createdAt, id) — the same
// total order lib/messages.ts queries with, so the client and the server never
// disagree about what "the last message" is.
//
// .filter() already returns a fresh array, so sorting it in place cannot reach
// the caller's.
export function messagesFor(
  all: ChatMessage[],
  groupId: string,
): ChatMessage[] {
  return all
    .filter((message) => message.groupId === groupId)
    .sort((a, b) => {
      const difference = a.createdAt.getTime() - b.createdAt.getTime();
      if (difference !== 0) return difference;
      // cuids are not chronological, but they are unique and stable, which is
      // all a tiebreaker has to be.
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
}
```

- [x] **Step 4: Run the test again**

Run: `npx vitest run tests/lib/chat-select.test.ts`
Expected: PASS, 6 tests.

- [x] **Step 5: Commit**

```bash
git add lib/chat-select.ts tests/lib/chat-select.test.ts
git commit -m "feat: add per-conversation message selector"
```

---

## Task 8: Which stream to open (`lib/stream-url.ts`)

One rule rather than a ternary in each page. A student's URL is byte-for-byte what `StreamProvider` hardcoded before. Jenn's is the new endpoint, with the board channel of whichever student's page she is standing on folded in — which is what keeps her down to one `EventSource` there.

**Files:**
- Create: `lib/stream-url.ts`
- Test: `tests/lib/stream-url.test.ts`

- [x] **Step 1: Write the failing test**

```ts
// tests/lib/stream-url.test.ts
import { describe, it, expect } from "vitest";
import { streamUrl } from "@/lib/stream-url";

describe("streamUrl", () => {
  it("sends a student to their own conversation's stream", () => {
    expect(streamUrl({ isTeacher: false, slug: "marie" })).toBe(
      "/api/chat/marie/stream",
    );
  });

  it("sends the teacher to the inbox stream", () => {
    expect(streamUrl({ isTeacher: true, slug: null })).toBe(
      "/api/inbox/stream",
    );
  });

  // One connection, not two: on a student's page she needs the inbox AND that
  // board, and a second EventSource would replay a backlog twice — the bug
  // StreamProvider was created to fix.
  it("folds the board channel into the teacher's stream on a student page", () => {
    expect(streamUrl({ isTeacher: true, slug: "marie" })).toBe(
      "/api/inbox/stream?board=marie",
    );
  });

  it("encodes a slug so an odd one cannot break the URL", () => {
    expect(streamUrl({ isTeacher: true, slug: "a b" })).toBe(
      "/api/inbox/stream?board=a%20b",
    );
    expect(streamUrl({ isTeacher: false, slug: "a b" })).toBe(
      "/api/chat/a%20b/stream",
    );
  });

  // A student with no slug is not a state any page can reach — it would mean a
  // chat with nobody. Throwing says so, rather than opening a 404 stream that
  // retries forever.
  it("throws for a student with no slug", () => {
    expect(() => streamUrl({ isTeacher: false, slug: null })).toThrow();
  });
});
```

- [x] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/lib/stream-url.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/stream-url"`.

- [x] **Step 3: Write the implementation**

```ts
// lib/stream-url.ts

// One rule rather than a ternary in each page that mounts a StreamProvider.
//
// The teacher's endpoint lives at /api/inbox/stream and NOT /api/chat/stream on
// purpose: a static `stream` segment under app/api/chat/ would take routing
// precedence over app/api/chat/[slug]/, so a student whose name produced the
// slug "stream" would have their chat silently shadowed. Slugs come from
// teacher input via lib/student-slug.ts, so that is reachable.
export function streamUrl(input: {
  isTeacher: boolean;
  slug: string | null;
}): string {
  if (!input.isTeacher) {
    // Not a reachable state — a student's page always knows its own slug — but
    // an EventSource pointed at a 404 retries forever and silently, so this
    // fails loudly instead.
    if (!input.slug) throw new Error("a student stream needs a slug");
    return `/api/chat/${encodeURIComponent(input.slug)}/stream`;
  }

  // The board channel rides along so she holds ONE connection on a student's
  // page. On /admin there is no student page and so no board.
  return input.slug
    ? `/api/inbox/stream?board=${encodeURIComponent(input.slug)}`
    : "/api/inbox/stream";
}
```

- [x] **Step 4: Run the test again**

Run: `npx vitest run tests/lib/stream-url.test.ts`
Expected: PASS, 5 tests.

- [x] **Step 5: Commit**

```bash
git add lib/stream-url.ts tests/lib/stream-url.test.ts
git commit -m "feat: add stream endpoint selection"
```

---

## Task 9: A broadcast channel on the chat bus

The teacher stream needs every message, from every conversation, including from students created after she opened the page. Subscribing to each group id at connect misses those, and the failure mode is a student whose messages simply never arrive.

**Files:**
- Modify: `lib/chat-bus.ts`

`lib/chat-bus.ts` has no test today — it is an `EventEmitter` wrapper, not a rule — and this task does not add one. The behaviour is covered where it matters, in Task 13's manual verification.

- [x] **Step 1: Add the channel constant**

In `lib/chat-bus.ts`, below the existing `boardEvent` declaration (around line 31), add:

```ts
// One channel every message is published to, alongside its own group's. The
// teacher's inbox subscribes here rather than to each group id, because
// enumerating groups at connect silently misses a student created afterwards —
// and that failure looks like a student whose messages never arrive, which is
// the hardest kind to notice.
//
// A group id is a cuid, so this name can never collide with one.
const ALL_MESSAGES = "message:*";
```

- [x] **Step 2: Publish to it**

Replace the existing `publish` method:

```ts
  publish(groupId: string, message: StoredMessage) {
    emitter.emit(groupId, message);
  },
```

with:

```ts
  publish(groupId: string, message: StoredMessage) {
    emitter.emit(groupId, message);
    // Emitted second, so a per-group listener and the inbox never disagree
    // about ordering within one publish.
    emitter.emit(ALL_MESSAGES, message);
  },
```

- [x] **Step 3: Add the subscription**

Immediately after the existing `subscribe` method, add:

```ts
  // Returns its own unsubscribe rather than exposing the emitter, same as
  // subscribe: a stream that closes cannot forget which listener was its own.
  subscribeAll(listener: (message: StoredMessage) => void) {
    emitter.on(ALL_MESSAGES, listener);
    return () => {
      emitter.off(ALL_MESSAGES, listener);
    };
  },
```

- [x] **Step 4: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no output, exit 0.

- [x] **Step 5: Commit**

```bash
git add lib/chat-bus.ts
git commit -m "feat: add a broadcast message channel to the chat bus"
```

---

## Task 10: Global replay (`messagesAfterAll`)

The teacher stream's `Last-Event-ID` replay. It differs from the per-group `messagesAfter` in two ways that both matter, and both are about not shipping every conversation ever recorded.

**Files:**
- Modify: `lib/messages.ts`

- [x] **Step 1: Add the function**

In `lib/messages.ts`, directly below the existing `messagesAfter` (after line 64), add:

```ts
// The teacher stream's replay. Same (createdAt, id) total order as the
// per-group version, and the same reason for it: a message sharing a
// millisecond with the anchor would otherwise be dropped on every future
// reconnect, not just once.
//
// Two deliberate differences from messagesAfter:
//
// 1. An unknown anchor returns NOTHING rather than falling back to everything.
//    "Everything" there is one conversation; here it is every conversation Jenn
//    has ever had, and shipping it is precisely the cost this stream exists to
//    avoid. She loses nothing: the list comes down with the page and selecting
//    a conversation loads its own history.
// 2. It is capped. A tab left open on a sleeping laptop can accumulate an
//    unbounded gap, and the cap keeps a reconnect from becoming a table scan.
//    Ordered DESC and reversed so the cap drops the OLDEST of the gap — the
//    newest are what a live view is for, and anything dropped is still in the
//    database behind the conversation's own history load.
const MAX_REPLAY = 500;

export async function messagesAfterAll(
  afterId: string,
): Promise<StoredMessage[]> {
  const anchor = await prisma.message.findUnique({
    where: { id: afterId },
    select: { createdAt: true },
  });
  if (!anchor) return [];

  const newest = await prisma.message.findMany({
    where: {
      // The everyone group has no conversation. No message can exist for it —
      // chatRole refuses the POST route before anything else — but the query
      // mirrors the access rule rather than assuming the other end held.
      group: { isEveryone: false },
      OR: [
        { createdAt: { gt: anchor.createdAt } },
        { createdAt: anchor.createdAt, id: { gt: afterId } },
      ],
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: MAX_REPLAY,
    select: SELECT,
  });

  // Reversed on the way out: SSE has to arrive oldest-first, and the client
  // appends in the order it receives.
  return newest.reverse();
}
```

- [x] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no output, exit 0.

If Prisma complains that `group` is not a valid filter on `MessageWhereInput`, the client is stale — run `npx prisma generate` and try again.

- [x] **Step 3: Commit**

```bash
git add lib/messages.ts
git commit -m "feat: add bounded global message replay"
```

---

## Task 11: The read model (`lib/inbox.ts`)

What the left pane is drawn from. It **replaces** `unreadCounts()` rather than sitting beside it — two query paths for the same number are two things that can disagree.

**Files:**
- Create: `lib/inbox.ts`
- Modify: `lib/messages.ts` (remove `unreadCounts`)
- Modify: `app/admin/page.tsx:99-126` (`GroupsTab` reads the new function)

`lib/inbox.ts` touches Prisma, so it gets no unit test — this codebase tests the pure modules underneath its database access, not the access itself. `orderConversations` and `previewText` are the tested parts.

- [x] **Step 1: Create the read model**

```ts
// lib/inbox.ts
import { prisma } from "@/lib/prisma";

export type ConversationSummary = {
  groupId: string;
  name: string;
  slug: string;
  unread: number;
  // Has this student signed up (2026-08-03 student sign-in). The same fact
  // studentGate calls `claimed`, read from the same column and deliberately not
  // re-derived: two definitions of "signed up" would eventually differ, and the
  // difference would be a composer pointed at someone who cannot read it.
  //
  // A boolean, not the hash. passwordHash must never leave the server.
  claimed: boolean;
  lastMessage: {
    body: string;
    fromTeacher: boolean;
    createdAt: Date;
  } | null;
};

// Enough that the CSS clamp is what visibly truncates the preview, small enough
// that a 2000-character message is not shipped to draw a list row.
const PREVIEW_CHARS = 200;

// The everyone group is absent, not empty: chatRole refuses it before it checks
// anything else, so it has no conversation to list.
export async function listConversations(): Promise<ConversationSummary[]> {
  const groups = await prisma.group.findMany({
    where: { isEveryone: false },
    select: {
      id: true,
      name: true,
      slug: true,
      teacherLastReadAt: true,
      // Selected only to be turned into a boolean below. It is never returned,
      // never logged, and never crosses the RSC boundary.
      passwordHash: true,
    },
    orderBy: { name: "asc" },
  });

  // 2N queries, where N is the number of students Jenn teaches, against a
  // SQLite file on the same box. A single-query version needs either a window
  // function — this project has no raw SQL anywhere — or the message table
  // pulled into JS and reduced, which gets worse as the log grows and retention
  // is forever. If N ever justifies otherwise, the shape to reach for is a
  // lastMessageAt column maintained on write, and nothing outside this function
  // would change.
  return Promise.all(
    groups.map(async (group) => {
      const [last, unread] = await Promise.all([
        prisma.message.findFirst({
          where: { groupId: group.id },
          // (createdAt, id) descending — the same total order everything else
          // here uses, so "the last message" means one thing project-wide.
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          select: { body: true, fromTeacher: true, createdAt: true },
        }),
        prisma.message.count({
          where: {
            groupId: group.id,
            fromTeacher: false,
            ...(group.teacherLastReadAt
              ? { createdAt: { gt: group.teacherLastReadAt } }
              : {}),
          },
        }),
      ]);

      return {
        groupId: group.id,
        name: group.name,
        slug: group.slug,
        unread,
        claimed: group.passwordHash !== null,
        lastMessage: last
          ? { ...last, body: last.body.slice(0, PREVIEW_CHARS) }
          : null,
      };
    }),
  );
}
```

- [x] **Step 2: Remove `unreadCounts`**

Delete the whole `unreadCounts` function from `lib/messages.ts` (lines 83–106, including its `// One grouped query rather than one per student…` comment). `listConversations` answers the same question and returns the message behind the number.

- [x] **Step 3: Repoint the Students tab**

**Read `app/admin/page.tsx` first.** The sign-in build rewrote `GroupsTab` — it now also selects `email` and `claimedAt` and passes them into `GroupSummary`, and the regenerate action was replaced by a reset. Do not paste over it; make two surgical changes.

Replace the import:

```ts
import { unreadCounts } from "@/lib/messages";
```

with:

```ts
import { listConversations } from "@/lib/inbox";
```

Then, inside `GroupsTab`, find the `Promise.all` that fetches groups alongside `unreadCounts()` and swap the second call, deriving the map from the result:

```ts
  // The group query stays exactly as the sign-in build left it — including its
  // email/claimedAt selection — because this list includes the everyone row,
  // which has no conversation and so is absent from listConversations.
  const [groups, conversations] = await Promise.all([
    /* leave this call untouched */
    listConversations(),
  ]);
  const unread = new Map(conversations.map((c) => [c.groupId, c.unread]));
```

Everything downstream is unchanged: it already reads `unread.get(g.id) ?? 0`, and `listConversations` returns the same number `unreadCounts` did, from the same `teacherLastReadAt` comparison.

If `unreadCounts` turns out to have a second caller the sign-in build added, repoint it the same way rather than keeping the old function alive.

- [x] **Step 4: Verify**

Run: `npx tsc --noEmit && npm test`
Expected: no type errors; the full suite passes.

- [ ] **Step 5: Check the Students tab still shows unread counts**

Run: `npm run dev`, sign in, open `http://localhost:3000/admin?tab=groups`.
Expected: the student rows render, and any student with unread messages still shows `· N unread` in the eyebrow.

- [x] **Step 6: Commit**

```bash
git add lib/inbox.ts lib/messages.ts app/admin/page.tsx
git commit -m "feat: add conversation read model, replacing unreadCounts"
```

---

## Task 12: Two server actions — history, and the invite link

The teacher stream sends no first-connect backlog, so selecting a conversation has to fetch it. Server actions, because that is what this codebase uses for everything that is not one of the listed routes.

**Files:**
- Modify: `app/actions.ts`

- [x] **Step 1: Add the action**

In `app/actions.ts`, extend the existing import from `lib/messages`:

```ts
import { deleteMessageById, markTeacherRead, listMessages } from "@/lib/messages";
```

Then add, beside the other chat actions (near `markChatRead`, around line 168):

```ts
// The inbox stream carries no first-connect backlog — it would be every
// conversation Jenn has ever had, on every admin page load, and retention here
// is forever. This is the other half: history arrives when she opens one.
//
// requireTeacher first, like every other mutating action in this file. It reads
// rather than writes, but it reads someone else's private conversation, which
// is the same bar.
export async function loadConversation(groupId: string) {
  await requireTeacher();

  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: { isEveryone: true },
  });
  // Mirrors chatRole, which refuses the everyone group before it checks
  // anything else. It has no conversation, so there is nothing to return — and
  // an empty array rather than a throw, because a stale tab holding a deleted
  // student should render an empty thread, not an error page.
  if (!group || group.isEveryone) return [];

  return listMessages(groupId);
}
```

- [x] **Step 2: Add the invite-link action**

An unclaimed student's conversation shows the invite link instead of a composer. That link contains `chatToken`, which is a live credential, so it is fetched on demand rather than shipped in the conversation list — the inbox renders on *every* teacher page, and putting every student's invite into the source of `/g/marie` for the sake of a control she uses a few times a term is the wrong trade. `GroupList` already renders these on the Students tab; this keeps the exposure to that one page.

Add, directly below `loadConversation`:

```ts
// Returns the invite link for a student who has not signed up yet, on demand.
// Deliberately NOT part of listConversations: chatToken is a live credential
// and that payload renders on every teacher page, including a student's page
// during a screen-shared lesson.
//
// Relative, matching what GroupList already renders for her to copy.
export async function inviteLink(groupId: string): Promise<string | null> {
  await requireTeacher();

  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: { slug: true, chatToken: true, passwordHash: true, isEveryone: true },
  });
  if (!group || group.isEveryone || group.chatToken === null) return null;

  // Refused once the account is claimed. The claim rotated this token, so the
  // value is live rather than spent, and there is no reason to hand it out —
  // the way back in for a claimed student is Reset sign-in, which mints a new
  // one.
  if (group.passwordHash !== null) return null;

  return `/g/${group.slug}?k=${group.chatToken}`;
}
```

- [x] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no output, exit 0.

`app/actions.ts` already imports `prisma`; if it does not, add `import { prisma } from "@/lib/prisma";`.

- [x] **Step 4: Commit**

```bash
git add app/actions.ts
git commit -m "feat: add loadConversation and inviteLink server actions"
```

---

## Task 13: The teacher stream (`/api/inbox/stream`)

One connection carrying every conversation, plus optionally one group's board. Structurally it is `app/api/chat/[slug]/stream/route.ts` with four changes: session auth instead of `chatRole`, `subscribeAll` instead of a per-group subscribe, no first-connect backlog, and no revoke subscription.

**No revoke subscription is deliberate.** Revocation exists because a per-slug stream authenticated with a token would otherwise relay forever after that token was regenerated. This stream is authenticated by Jenn's session, which regenerating a student's link does not touch.

**Files:**
- Create: `app/api/inbox/stream/route.ts`

- [x] **Step 1: Write the route**

```ts
// app/api/inbox/stream/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentTeacher } from "@/lib/session";
import { chatBus, type BoardFrame } from "@/lib/chat-bus";
import { messagesAfterAll, type StoredMessage } from "@/lib/messages";
import { liveBoards } from "@/lib/whiteboard-live";

// Without this Next may try to evaluate the handler at build time, which for a
// stream that never ends means a build that never finishes.
export const dynamic = "force-dynamic";

// Same 20s as the per-slug stream, and for the same reason: nginx's
// proxy_read_timeout is 60s by default and would drop a quiet inbox.
const HEARTBEAT_MS = 20_000;

// NOT under /api/chat/. A static `stream` segment there would take routing
// precedence over app/api/chat/[slug]/, silently shadowing a student whose name
// produced the slug "stream".
//
// Like lib/chat-bus.ts and lib/whiteboard-live.ts, this is correct ONLY because
// pm2 runs this app as a single process in fork mode. Under cluster mode a
// message would reach only the viewers on the same worker, silently. This is
// now the third feature depending on that — see docs/DEPLOYMENT.md.
export async function GET(request: Request) {
  // 404 rather than 403, matching every other route here: a caller probing
  // learns the same thing either way.
  const teacher = await getCurrentTeacher();
  if (!teacher) return new NextResponse("Not found", { status: 404 });

  const url = new URL(request.url);
  const boardSlug = url.searchParams.get("board");

  // Fetched once at connect so the filter in send() is a comparison rather than
  // a query per message.
  const everyone = await prisma.group.findFirst({
    where: { isEveryone: true },
    select: { id: true },
  });

  // Optional, and a missing or unknown slug is NOT a 404: the inbox is the
  // point of this stream and it has to open on /admin, where there is no
  // student page and so no board.
  const boardGroup = boardSlug
    ? await prisma.group.findUnique({
        where: { slug: boardSlug },
        select: { id: true, isEveryone: true },
      })
    : null;
  const boardGroupId =
    boardGroup && !boardGroup.isEveryone ? boardGroup.id : null;

  const lastEventId = request.headers.get("last-event-id");

  const encoder = new TextEncoder();
  let unsubscribe = () => {};
  let unsubscribeBoard = () => {};
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  // Safe to call more than once: EventEmitter.off and clearInterval both
  // tolerate being called after the listener/timer is already gone.
  const teardown = () => {
    unsubscribe();
    unsubscribeBoard();
    if (heartbeat) clearInterval(heartbeat);
  };

  const stream = new ReadableStream({
    async start(controller) {
      const send = (message: StoredMessage) => {
        // No message can exist for the everyone group — chatRole refuses the
        // POST route first — but the stream mirrors the access rule rather than
        // assuming the other end enforced it. Same defensive contract as
        // readSections, readOps and readPageKind.
        if (everyone && message.groupId === everyone.id) return;
        try {
          // The id: line is what the browser sends back as Last-Event-ID.
          controller.enqueue(
            encoder.encode(
              `id: ${message.id}\ndata: ${JSON.stringify(message)}\n\n`,
            ),
          );
        } catch {
          // The connection died between its close and our teardown callback
          // firing. Swallowing this matters: publish() is synchronous inside
          // the SENDER's request, so an exception here would surface as a 500
          // on someone else's message — one that was already saved.
          teardown();
        }
      };

      // NO id: line, and a named event — the same two properties the per-slug
      // stream relies on. An event without an id leaves the client's
      // last-event-id buffer untouched, so ephemeral board traffic cannot
      // corrupt the message replay anchor; and onmessage fires only for unnamed
      // events, so the message handler cannot see these.
      const sendBoard = (frame: BoardFrame) => {
        try {
          controller.enqueue(
            encoder.encode(`event: board\ndata: ${JSON.stringify(frame)}\n\n`),
          );
        } catch {
          teardown();
        }
      };

      // Subscribed BEFORE the replay is read, with anything arriving in between
      // held back: subscribing afterwards leaves a window the width of a
      // database round trip in which a message reaches neither path.
      const pending: StoredMessage[] = [];
      let replaying = true;
      unsubscribe = chatBus.subscribeAll((message) => {
        if (replaying) pending.push(message);
        else send(message);
      });

      const pendingBoard: BoardFrame[] = [];
      let replayingBoard = true;
      if (boardGroupId) {
        unsubscribeBoard = chatBus.subscribeBoard(boardGroupId, (frame) => {
          if (replayingBoard) pendingBoard.push(frame);
          else sendBoard(frame);
        });
      }

      // No first-connect backlog, unlike the per-slug stream. That route
      // replays one conversation, which is right. This one would replay every
      // conversation Jenn has ever had, on every admin page load, forever. The
      // list comes down with the page; a selected conversation loads its own
      // history through loadConversation.
      //
      // A reconnect still replays, bounded by how long she was disconnected, so
      // a deploy mid-lesson costs a blink rather than a message.
      const backlog = lastEventId ? await messagesAfterAll(lastEventId) : [];
      for (const message of backlog) send(message);

      replaying = false;
      const seen = new Set(backlog.map((message) => message.id));
      for (const message of pending) {
        if (!seen.has(message.id)) send(message);
      }

      // A teacher who opens a student's page mid-board must see the whole
      // thing, not the tail — the same idea as the per-slug route, pointed at
      // the same in-memory log.
      if (boardGroupId) {
        const live = liveBoards.get(boardGroupId);
        if (live) {
          sendBoard({
            kind: "ops",
            ops: live.ops,
            pending: live.pending,
            currentPage: live.currentPage,
          });
        }
      }

      replayingBoard = false;
      for (const frame of pendingBoard) sendBoard(frame);

      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          teardown();
        }
      }, HEARTBEAT_MS);

      // A closed tab does not run cancel() in every runtime; the request's
      // abort signal is the reliable teardown.
      request.signal.addEventListener("abort", teardown);
    },

    cancel() {
      teardown();
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
      // Nginx buffers proxied responses by default, which would hold the whole
      // stream in memory and deliver nothing.
      "X-Accel-Buffering": "no",
    },
  });
}
```

- [x] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no output, exit 0.

- [x] **Step 3: Check it refuses a stranger**

Run `npm run dev` in one terminal, then in another:

```bash
curl -si http://localhost:3000/api/inbox/stream | head -1
```

Expected: `HTTP/1.1 404 Not Found`.

- [x] **Step 4: Check it streams for Jenn**

Sign in at `http://localhost:3000/login`, then open `http://localhost:3000/api/inbox/stream` in that same browser tab.

Expected: the tab hangs open with no content, and a `: ping` comment appears roughly every 20 seconds (visible in DevTools ▸ Network ▸ the request ▸ Response). Nothing is sent at connect — that is the no-backlog rule working, not a failure.

Now, in a second browser (or a private window) open a student's link `/g/<slug>?k=<chatToken>` and send a message. Expected: an `id:`/`data:` pair appears in the first tab within a second, and its JSON carries the right `groupId`.

- [x] **Step 5: Commit**

```bash
git add app/api/inbox/stream/route.ts
git commit -m "feat: add teacher-wide chat stream"
```

---

## Task 14: `StreamProvider` takes a URL

Three changes: the `slug` prop becomes a `url`, the message array becomes flat and multi-conversation, and it gains `ingest` so fetched history joins the same store as live messages. The board handling is untouched.

**Files:**
- Modify: `components/StreamProvider.tsx`

- [x] **Step 1: Change the value type and the props**

Replace the `StreamValue` type (lines 22–26) with:

```ts
type StreamValue = {
  // Flat and multi-conversation. For a student every entry shares one groupId
  // and this behaves exactly as the single-conversation array it replaces; for
  // Jenn it is the whole inbox. lib/chat-select.ts picks one out.
  messages: ChatMessage[];
  // History fetched by loadConversation lands here, in the same store as live
  // messages, so a conversation has one source of truth rather than two that
  // have to be merged at every read.
  ingest: (messages: ChatMessage[]) => void;
  removeMessage: (id: string) => void;
  board: LiveBoardState;
};
```

Then replace the component signature (lines 36–42):

```ts
export function StreamProvider({
  url,
  children,
}: {
  // A URL rather than a slug, because there are two endpoints now — see
  // lib/stream-url.ts, which is the only thing that should build one.
  url: string;
  children: ReactNode;
}) {
```

- [x] **Step 2: Point the EventSource at it**

Replace line 52:

```ts
    const source = new EventSource(`/api/chat/${slug}/stream`);
```

with:

```ts
    const source = new EventSource(url);
```

and the effect's dependency array on line 103:

```ts
  }, [url]);
```

- [x] **Step 3: Add `ingest` to the context value**

Replace the `useMemo` block (lines 105–113):

```ts
  const value = useMemo<StreamValue>(
    () => ({
      messages,
      ingest: (incoming: ChatMessage[]) =>
        setMessages((current) => {
          const known = new Set(current.map((m) => m.id));
          const fresh = incoming.filter((m) => !known.has(m.id));
          // Returning the SAME array when nothing is new matters: re-selecting
          // an already-loaded conversation would otherwise replace the array
          // identity and re-render every message in it.
          return fresh.length === 0 ? current : [...current, ...fresh];
        }),
      removeMessage: (id: string) =>
        setMessages((current) => current.filter((m) => m.id !== id)),
      board,
    }),
    [messages, board],
  );
```

- [x] **Step 4: Fix the one existing caller so the app still builds**

In `app/g/[slug]/page.tsx:177`, replace:

```tsx
        <StreamProvider slug={slug}>
```

with:

```tsx
        <StreamProvider url={streamUrl({ isTeacher: false, slug })}>
```

and add to the imports:

```ts
import { streamUrl } from "@/lib/stream-url";
```

This is temporary — Task 18 rewrites this page properly. It exists so the tree compiles between commits.

- [x] **Step 5: Verify**

Run: `npx tsc --noEmit && npm test`
Expected: no type errors; the full suite passes.

- [ ] **Step 6: Check the student chat still works end to end**

Run `npm run dev`, open `/g/<slug>?k=<chatToken>` in a private window, open the chat FAB, send a message.
Expected: it appears in the panel within a second — the stream is still connected and still replays.

- [x] **Step 7: Commit**

```bash
git add components/StreamProvider.tsx app/g/\[slug\]/page.tsx
git commit -m "refactor: StreamProvider takes a URL and holds every conversation"
```

---

## Task 15: `MessageList` gets times and sticky headings

**Files:**
- Modify: `components/chat/MessageList.tsx`

The heading is `position: sticky` inside its own day group, which is what makes it scroll away when its day ends rather than stacking. This component **must never render on the server** — every string it produces depends on the reader's timezone. It is safe today because the panel around it is conditionally rendered on an `open` state that starts `false`, and that is now a rule rather than an accident.

- [x] **Step 1: Replace the whole file**

```tsx
"use client";

import { useEffect, useRef } from "react";
import { groupByDay } from "@/lib/chat-day";
import { dayHeading } from "@/lib/chat-stamp";
import { formatTime, localDayKey } from "@/lib/chat-time";
import type { ChatMessage } from "@/lib/chat-message";
import { cn } from "@/lib/utils";

export type MessageListLabels = {
  empty: string;
  locale: string;
  today: string;
  deleteMessage: string;
};

// NEVER RENDERED ON THE SERVER. Every heading and every timestamp below is
// resolved in the runtime's timezone — UTC on the box, the reader's zone in the
// browser — so an SSR pass would produce different HTML from the hydration pass
// and React would throw. What protects it is that the panel holding it is
// mounted on an `open` state that starts false, so it does not exist until
// after mount. Anything that renders this eagerly breaks production only.
export function MessageList({
  messages,
  self,
  labels,
  onDeleteMessage,
}: {
  messages: ChatMessage[];
  self: "teacher" | "student";
  labels: MessageListLabels;
  onDeleteMessage?: (id: string) => void;
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
        {labels.empty}
      </p>
    );
  }

  // Read during render rather than held in state: "today" has to be right for a
  // panel left open across midnight, and this component re-renders on every
  // message anyway. Safe to call here only because of the no-SSR rule above.
  const todayKey = localDayKey(new Date());

  return (
    <div className="flex flex-col gap-4 px-4 py-3">
      {groupByDay(messages).map((day) => (
        <div key={day.day} className="flex flex-col gap-2">
          {/* Sticky inside its own day group, not inside the scroll container:
              that is what makes a heading scroll away when its day ends
              instead of stacking under the next one. */}
          <div className="sticky top-0 z-10 flex justify-center py-1">
            <span className="rounded-full bg-[var(--color-bg)]/90 px-3 py-0.5 text-[11px] uppercase tracking-[2px] text-[var(--color-ink-muted)] backdrop-blur-sm">
              {dayHeading(day.day, todayKey, { today: labels.today }, labels.locale)}
            </span>
          </div>

          {day.messages.map((message) => {
            const mine = (self === "teacher") === message.fromTeacher;
            return (
              <div
                key={message.id}
                className={cn(
                  "group/msg flex max-w-[85%] flex-col gap-0.5",
                  mine ? "self-end items-end" : "self-start items-start",
                )}
              >
                <div
                  className={cn(
                    "flex items-center gap-1",
                    mine && "flex-row-reverse",
                  )}
                >
                  <div
                    className={cn(
                      "rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap break-words",
                      mine
                        ? "bg-[var(--color-accent)] text-white"
                        : "bg-[var(--color-field)] text-[var(--color-ink)]",
                    )}
                  >
                    {message.body}
                  </div>
                  {onDeleteMessage && (
                    <button
                      type="button"
                      onClick={() => onDeleteMessage(message.id)}
                      aria-label={`${labels.deleteMessage}: ${message.body.slice(0, 40)}`}
                      className="text-xs text-[var(--color-ink-muted)] opacity-0 transition-opacity group-hover/msg:opacity-100 focus:opacity-100"
                    >
                      ×
                    </button>
                  )}
                </div>

                {/* dateTime carries the instant, so the machine-readable value
                    is unambiguous even though the visible one is local. */}
                <time
                  dateTime={message.createdAt.toISOString()}
                  className="px-1.5 text-[11px] text-[var(--color-ink-muted)]"
                >
                  {formatTime(message.createdAt, labels.locale)}
                </time>
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

- [x] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: errors in `components/chat/ChatWindow.tsx`, which still passes the old `emptyLabel`/`locale`/`deleteLabel` props. Task 16 deletes that file. Continue.

- [x] **Step 3: Commit**

```bash
git add components/chat/MessageList.tsx
git commit -m "feat: add message times and sticky day headings"
```

---

## Task 16: Split `ChatWindow` into `ChatPanel` and `Conversation`

`ChatWindow` did two jobs: panel chrome and conversation body. The inbox needs the chrome around *two* panes, so the two jobs separate.

**Files:**
- Create: `components/chat/ChatPanel.tsx`
- Create: `components/chat/Conversation.tsx`
- Delete: `components/chat/ChatWindow.tsx`

- [x] **Step 1: Create the panel chrome**

```tsx
// components/chat/ChatPanel.tsx
"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type PanelLabels = { close: string; back: string };

// One tree for both sizes, driven entirely by CSS. Deliberately no matchMedia
// read: that is another value that differs between the server and the browser,
// and this component is one of the things that has to stay hydration-safe.
//
// Below md: full screen, and `aside` and `children` take turns — which one
// shows is the caller's `showAside`.
// At md and up: a floating panel with both visible side by side, and
// `showAside` is ignored.
export function ChatPanel({
  title,
  labels,
  onClose,
  onBack,
  aside,
  showAside = true,
  children,
}: {
  title: string;
  labels: PanelLabels;
  onClose: () => void;
  // Provided only when there is somewhere to go back TO — the inbox, on mobile,
  // with a conversation open. A student has no second level, so they never get
  // one, and a back arrow that closed the chat would be a second X.
  onBack?: () => void;
  aside?: ReactNode;
  showAside?: boolean;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    panel.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      ref={panel}
      role="dialog"
      aria-label={title}
      tabIndex={-1}
      // Still deliberately not aria-modal at desktop size: the point of a
      // floating panel is that the page stays readable behind it while she
      // types. Below md it is full screen and there is nothing behind it.
      className={cn(
        "fixed inset-0 z-50 flex flex-col bg-[var(--color-bg)] focus:outline-none",
        "md:inset-auto md:bottom-24 md:right-4 md:max-h-[70vh] md:h-[560px]",
        "md:max-w-[calc(100vw-2rem)] md:rounded-2xl md:border md:border-[var(--color-field-border)] md:shadow-2xl",
        // The inbox needs room for two panes; a student's single conversation
        // keeps the width it has today.
        aside ? "md:w-[720px]" : "md:w-[380px]",
      )}
    >
      <header className="flex shrink-0 items-center gap-2 border-b border-[var(--color-field-border)] px-4 py-3">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label={labels.back}
            // md:hidden because at desktop size both panes are visible and
            // there is nothing to go back to.
            className="text-lg leading-none text-[var(--color-ink-muted)] md:hidden"
          >
            ←
          </button>
        )}

        <span className="flex-1 truncate font-[family-name:var(--font-body)] text-sm font-medium text-[var(--color-ink)]">
          {title}
        </span>

        <button
          type="button"
          onClick={onClose}
          aria-label={labels.close}
          // When a back arrow is showing on a phone, the X steps aside: the
          // list behind it is where closing belongs.
          className={cn(
            "text-lg leading-none text-[var(--color-ink-muted)]",
            onBack && "hidden md:block",
          )}
        >
          ×
        </button>
      </header>

      {/* min-h-0 on both of these: without it a flex child refuses to shrink
          below its content and the inner overflow-y-auto never scrolls. */}
      <div className="flex min-h-0 flex-1 md:flex-row">
        {aside && (
          <aside
            className={cn(
              "min-h-0 flex-col border-[var(--color-field-border)] md:flex md:w-[260px] md:shrink-0 md:border-r",
              showAside ? "flex flex-1" : "hidden",
            )}
          >
            {aside}
          </aside>
        )}

        <section
          className={cn(
            "min-h-0 flex-col md:flex md:flex-1",
            aside && showAside ? "hidden" : "flex flex-1",
          )}
        >
          {children}
        </section>
      </div>
    </div>
  );
}
```

- [x] **Step 2: Create the conversation body**

```tsx
// components/chat/Conversation.tsx
"use client";

import type { ReactNode } from "react";
import { MessageList, type MessageListLabels } from "@/components/chat/MessageList";
import { MessageInput } from "@/components/chat/MessageInput";
import type { ChatMessage } from "@/lib/chat-message";

export type ConversationLabels = MessageListLabels & {
  placeholder: string;
  send: string;
};

// Presentational only — the stream, the send function and the message store all
// live in the FAB above it, so this can mount and unmount with a selection
// without tearing down the connection the unread dots depend on.
export function Conversation({
  messages,
  self,
  labels,
  onSend,
  onDeleteMessage,
  footer,
}: {
  messages: ChatMessage[];
  self: "teacher" | "student";
  labels: ConversationLabels;
  // Optional because a read-only thread has nothing to send. Required in
  // practice whenever `footer` is absent — the two are alternatives.
  onSend?: (body: string) => Promise<void>;
  onDeleteMessage?: (id: string) => void;
  // Replaces the composer. Used for a student who has not signed up yet: the
  // thread stays readable and there is nothing to type into, because there is
  // nobody on the other end to read it.
  footer?: ReactNode;
}) {
  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <MessageList
          messages={messages}
          self={self}
          labels={labels}
          onDeleteMessage={onDeleteMessage}
        />
      </div>

      {footer ??
        (onSend && (
          <MessageInput
            onSend={onSend}
            placeholder={labels.placeholder}
            sendLabel={labels.send}
          />
        ))}
    </>
  );
}
```

- [x] **Step 3: Delete the old file**

```bash
git rm components/chat/ChatWindow.tsx
```

- [x] **Step 4: Verify**

Run: `npx tsc --noEmit`
Expected: one remaining error, in `components/chat/ChatFab.tsx`, which still imports `ChatWindow`. Task 17 fixes it.

- [x] **Step 5: Commit**

```bash
git add components/chat/ChatPanel.tsx components/chat/Conversation.tsx
git commit -m "refactor: split ChatWindow into panel chrome and conversation body"
```

---

## Task 17: `ChatFab` becomes the student's FAB

It loses `self`, `onOpen` and `onDeleteMessage` — all three existed to serve the teacher, who now has her own FAB. It keeps the per-device `localStorage` unread marker exactly as it is, for the reason already recorded: a student has no account to hang a read marker on.

**Files:**
- Modify: `components/chat/ChatFab.tsx`

- [x] **Step 1: Replace the whole file**

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { ChatPanel } from "@/components/chat/ChatPanel";
import {
  Conversation,
  type ConversationLabels,
} from "@/components/chat/Conversation";
import { useStream } from "@/components/StreamProvider";

// Per-device by design: the student has no account to hang a read marker on,
// and tracking it server-side would mean a write path from an unauthenticated
// visitor for the sake of a dot.
const seenKey = (slug: string) => `chat-seen:${slug}`;

export type StudentChatLabels = ConversationLabels & {
  title: string;
  close: string;
  back: string;
};

// The student's side only. Jenn's FAB is components/chat/InboxFab.tsx — she has
// a list of conversations and this has exactly one, so they are two components
// rather than one with a mode flag.
export function ChatFab({
  slug,
  labels,
}: {
  slug: string;
  labels: StudentChatLabels;
}) {
  const [open, setOpen] = useState(false);
  const [unseen, setUnseen] = useState(false);

  // The connection lives in StreamProvider: the whiteboard needs the same
  // stream, and two EventSources would each replay the whole chat backlog.
  const { messages } = useStream();

  // The unread effect below closes over `open` from the render that ran it.
  // Reading it through a ref keeps that check current without making the effect
  // re-run every time the panel toggles.
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  }, [open]);

  useEffect(() => {
    const fromTeacher = messages.filter((m) => m.fromTeacher);
    const newest = fromTeacher[fromTeacher.length - 1];
    if (!newest) return;

    if (openRef.current) {
      window.localStorage.setItem(seenKey(slug), newest.id);
      setUnseen(false);
    } else {
      setUnseen(window.localStorage.getItem(seenKey(slug)) !== newest.id);
    }
  }, [messages, slug]);

  async function send(body: string) {
    const response = await fetch(`/api/chat/${slug}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
    if (!response.ok) throw new Error("send failed");
    // Nothing is appended here — the message arrives back through the stream,
    // which is also what gives it its real id and timestamp.
  }

  function handleToggle() {
    if (!open) {
      // Cleared here rather than in an effect watching `open`: this handler is
      // the only thing that ever opens the panel, so an effect would be
      // reacting to a change it already knows about, one render later.
      setUnseen(false);
      const fromTeacher = messages.filter((m) => m.fromTeacher);
      const newest = fromTeacher[fromTeacher.length - 1];
      if (newest) window.localStorage.setItem(seenKey(slug), newest.id);
    }
    setOpen(!open);
  }

  return (
    <>
      {/* Conditionally rendered, and that is load-bearing rather than an
          optimisation: everything inside formats dates in the reader's
          timezone, so rendering it during SSR would be a hydration mismatch.
          See the note at the top of MessageList. */}
      {open && (
        <ChatPanel
          title={labels.title}
          labels={{ close: labels.close, back: labels.back }}
          onClose={() => setOpen(false)}
        >
          <Conversation
            messages={messages}
            self="student"
            labels={labels}
            onSend={send}
          />
        </ChatPanel>
      )}

      <button
        type="button"
        onClick={handleToggle}
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

Note the `messages` prop is passed straight through rather than through `messagesFor`: a student's stream carries one conversation, so filtering would be a no-op that implies otherwise.

- [x] **Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: one error in `app/g/[slug]/page.tsx` — it still passes `token`, `self`, `onOpen` and `onDeleteMessage`. Task 21 rewrites that page.

- [x] **Step 3: Commit**

```bash
git add components/chat/ChatFab.tsx
git commit -m "refactor: ChatFab is the student's single-conversation FAB"
```

---

## Task 18: The conversation list (`ConversationList.tsx`)

The left pane, and mobile level one. Reuses `SearchField` and `filterGroups` from the Students tab rather than growing a second search — recency ordering is only tolerable because this is beside it.

**Files:**
- Create: `components/chat/ConversationList.tsx`

- [x] **Step 1: Write the component**

```tsx
// components/chat/ConversationList.tsx
"use client";

import { useState } from "react";
import { SearchField } from "@/components/admin/SearchField";
import { filterGroups } from "@/lib/admin-search";
import { orderConversations } from "@/lib/inbox-order";
import { previewText } from "@/lib/chat-preview";
import { listStamp } from "@/lib/chat-stamp";
import type { ConversationSummary } from "@/lib/inbox";
import { cn } from "@/lib/utils";

export type ConversationListLabels = {
  search: string;
  noStudents: string;
  noMatch: string;
  noMessages: string;
  // The preview line for a student who has not signed up yet. Listed rather
  // than hidden: a student Jenn created ten seconds ago being absent from her
  // inbox with no explanation reads as a bug.
  notSignedUp: string;
  you: string;
  yesterday: string;
  unread: string;
  locale: string;
};

// Renders only inside an open panel — listStamp resolves in the reader's
// timezone and an SSR pass would produce different HTML. See MessageList.
export function ConversationList({
  conversations,
  selectedId,
  unread,
  onSelect,
  labels,
}: {
  conversations: ConversationSummary[];
  selectedId: string | null;
  // Live, client-side unread counts. Seeded from ConversationSummary.unread and
  // then moved by the stream, which is why it is a separate map rather than a
  // field read off the summary — the summary is a server snapshot and does not
  // change until the page reloads.
  unread: Map<string, number>;
  onSelect: (groupId: string) => void;
  labels: ConversationListLabels;
}) {
  const [query, setQuery] = useState("");

  // Ordered before filtering, so a search never reorders what is left.
  const visible = filterGroups(orderConversations(conversations), query);

  // Read during render so a panel left open across midnight still says the
  // right thing. Safe here only because this never renders on the server.
  const now = new Date();

  if (conversations.length === 0) {
    return (
      <p className="px-4 py-6 text-center text-sm text-[var(--color-ink-muted)]">
        {labels.noStudents}
      </p>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 px-3 pt-3">
        <SearchField label={labels.search} value={query} onChange={setQuery} />
      </div>

      {visible.length === 0 ? (
        <p className="px-4 py-2 text-center text-sm text-[var(--color-ink-muted)]">
          {labels.noMatch}
        </p>
      ) : (
        <ul className="min-h-0 flex-1 overflow-y-auto pb-2">
          {visible.map((conversation) => {
            const count = unread.get(conversation.groupId) ?? 0;
            const selected = conversation.groupId === selectedId;
            return (
              <li key={conversation.groupId}>
                <button
                  type="button"
                  onClick={() => onSelect(conversation.groupId)}
                  aria-current={selected ? "true" : undefined}
                  className={cn(
                    "flex w-full flex-col gap-0.5 px-4 py-3 text-left transition-colors",
                    selected
                      ? "bg-[var(--color-accent-soft)]"
                      : "hover:bg-[var(--color-field)]",
                  )}
                >
                  <span className="flex items-center gap-2">
                    {count > 0 && (
                      <span
                        // A dot, not a number: the count is on the Students tab
                        // and this list answers "who", not "how many".
                        aria-hidden="true"
                        className="h-2 w-2 shrink-0 rounded-full bg-[var(--card-rouge)]"
                      />
                    )}
                    <span
                      className={cn(
                        "flex-1 truncate text-sm text-[var(--color-ink)]",
                        count > 0 && "font-semibold",
                      )}
                    >
                      {conversation.name}
                    </span>
                    {count > 0 && (
                      // The dot is aria-hidden, so the unread state reaches a
                      // screen reader here instead.
                      <span className="sr-only">{labels.unread}</span>
                    )}
                    {conversation.lastMessage && (
                      <span className="shrink-0 text-[11px] text-[var(--color-ink-muted)]">
                        {listStamp(
                          conversation.lastMessage.createdAt,
                          now,
                          labels.locale,
                          { yesterday: labels.yesterday },
                        )}
                      </span>
                    )}
                  </span>

                  <span className="truncate text-xs text-[var(--color-ink-muted)]">
                    {previewText(conversation.lastMessage, {
                      you: labels.you,
                      // Only reached when there is no last message, so an
                      // unclaimed student who DOES have history — Jenn could
                      // have written to them under the old model — still shows
                      // that history here.
                      empty: conversation.claimed
                        ? labels.noMessages
                        : labels.notSignedUp,
                    })}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
```

- [x] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: the same single pre-existing error in `app/g/[slug]/page.tsx` from Task 17, and nothing new.

- [x] **Step 3: Commit**

```bash
git add components/chat/ConversationList.tsx
git commit -m "feat: add the inbox conversation list"
```

---

## Task 19: The unclaimed notice and Jenn's FAB

The FAB is the one stateful piece. It owns: open/closed, which conversation is selected, which mobile pane is showing, which histories have been loaded, and the live unread map.

**Files:**
- Create: `components/chat/UnclaimedNotice.tsx`
- Create: `components/chat/InboxFab.tsx`

- [x] **Step 1: Write the unclaimed notice**

This is what replaces the composer for a student who has not signed up. The sign-in design's point — *"there is nobody on the other end of a conversation nobody has claimed"* — is right, and an empty thread with a working text box is exactly how that point gets lost.

```tsx
// components/chat/UnclaimedNotice.tsx
"use client";

import { useEffect, useState } from "react";

export type UnclaimedLabels = {
  notSignedUpLong: string;
  copyInvite: string;
  copied: string;
};

// Replaces MessageInput when the selected student has not claimed their
// account. Listed rather than hidden, and read-only rather than writable — see
// "What this retires §1a" in the 2026-08-04 chat inbox design.
export function UnclaimedNotice({
  groupId,
  name,
  labels,
  onInviteLink,
}: {
  groupId: string;
  name: string;
  labels: UnclaimedLabels;
  onInviteLink: (groupId: string) => Promise<string | null>;
}) {
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Fetched on mount rather than shipped with the conversation list: this is
  // chatToken, a live credential, and the list renders on every teacher page.
  useEffect(() => {
    let cancelled = false;
    setLink(null);
    setCopied(false);
    void onInviteLink(groupId).then((value) => {
      // A response that arrives after she has moved to another student must not
      // paint that student's panel with this one's invite.
      if (!cancelled) setLink(value);
    });
    return () => {
      cancelled = true;
    };
  }, [groupId, onInviteLink]);

  async function copy() {
    if (!link) return;
    // Absolute, because what she pastes into a message has to work away from
    // this tab. window is safe here — this only ever runs in an event handler.
    await navigator.clipboard.writeText(`${window.location.origin}${link}`);
    setCopied(true);
  }

  return (
    <div className="shrink-0 border-t border-[var(--color-field-border)] p-4">
      <p className="mb-2 text-sm text-[var(--color-ink-muted)]">
        {labels.notSignedUpLong.replace("{name}", name)}
      </p>

      {link && (
        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-lg bg-[var(--color-field)] px-2 py-1 text-xs text-[var(--color-ink)]">
            {link}
          </code>
          <button
            type="button"
            onClick={copy}
            className="shrink-0 text-xs text-[var(--color-ink-muted)] underline"
          >
            {copied ? labels.copied : labels.copyInvite}
          </button>
        </div>
      )}
    </div>
  );
}
```

- [x] **Step 2: Write the FAB**

```tsx
// components/chat/InboxFab.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useStream } from "@/components/StreamProvider";
import { ChatPanel } from "@/components/chat/ChatPanel";
import {
  Conversation,
  type ConversationLabels,
} from "@/components/chat/Conversation";
import {
  ConversationList,
  type ConversationListLabels,
} from "@/components/chat/ConversationList";
import {
  UnclaimedNotice,
  type UnclaimedLabels,
} from "@/components/chat/UnclaimedNotice";
import { messagesFor } from "@/lib/chat-select";
import type { ConversationSummary } from "@/lib/inbox";
import type { ChatMessage } from "@/lib/chat-message";

export type InboxLabels = ConversationLabels &
  ConversationListLabels &
  UnclaimedLabels & {
    title: string;
    close: string;
    back: string;
    // Shown in the right pane at desktop size when nothing is selected yet.
    // Unreachable below md, where an unselected inbox shows the list instead.
    pickOne: string;
  };

export function InboxFab({
  conversations,
  initialSelectedId,
  labels,
  onLoadConversation,
  onMarkRead,
  onDeleteMessage,
  onInviteLink,
}: {
  conversations: ConversationSummary[];
  // Set when she is standing on a student's page, so opening the FAB there
  // lands in that conversation rather than on a list she has to search.
  initialSelectedId: string | null;
  labels: InboxLabels;
  onLoadConversation: (groupId: string) => Promise<ChatMessage[]>;
  onMarkRead: (groupId: string) => Promise<void>;
  onDeleteMessage: (messageId: string) => Promise<void>;
  onInviteLink: (groupId: string) => Promise<string | null>;
}) {
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(initialSelectedId);
  // Mobile only — at md both panes are visible and ChatPanel ignores this.
  const [view, setView] = useState<"list" | "conversation">(
    initialSelectedId ? "conversation" : "list",
  );
  const [unread, setUnread] = useState(
    () => new Map(conversations.map((c) => [c.groupId, c.unread])),
  );

  const { messages, ingest, removeMessage } = useStream();

  // Every message id this component has already decided about, so a re-render
  // cannot count the same message twice. Seeded with fetched history BEFORE it
  // is ingested — otherwise loading a conversation would count every old
  // message in it as newly arrived.
  const counted = useRef(new Set<string>());
  // Conversations whose history is loaded, and those with a load in flight, so
  // a double-click does not fetch twice.
  const loaded = useRef(new Set<string>());
  const loading = useRef(new Set<string>());

  // The unread effect below runs on every message change and must see the
  // CURRENT open/selected state, not the values captured when it was scheduled.
  const openRef = useRef(open);
  const selectedRef = useRef(selectedId);
  useEffect(() => {
    openRef.current = open;
  }, [open]);
  useEffect(() => {
    selectedRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    for (const message of messages) {
      if (message.fromTeacher) continue;
      if (counted.current.has(message.id)) continue;
      counted.current.add(message.id);

      const reading =
        openRef.current && selectedRef.current === message.groupId;
      if (reading) {
        // Read on arrival: one small UPDATE per message she is looking at. That
        // is the correct cost for a two-person tutoring app, and the
        // alternative — stamping only on open and close — leaves the dot up on
        // a conversation she is actively reading.
        void onMarkRead(message.groupId);
        continue;
      }

      setUnread((current) => {
        const next = new Map(current);
        next.set(message.groupId, (next.get(message.groupId) ?? 0) + 1);
        return next;
      });
    }
  }, [messages, onMarkRead]);

  async function select(groupId: string) {
    setSelectedId(groupId);
    setView("conversation");
    setUnread((current) => new Map(current).set(groupId, 0));
    // Fire and forget: a failure to stamp "read" must not stop the conversation
    // from opening.
    void onMarkRead(groupId);

    if (loaded.current.has(groupId) || loading.current.has(groupId)) return;
    loading.current.add(groupId);
    try {
      const history = await onLoadConversation(groupId);
      // Before ingest, not after: the effect above runs on the resulting state
      // change and would otherwise treat a year of history as new arrivals.
      for (const message of history) counted.current.add(message.id);
      ingest(history);
      loaded.current.add(groupId);
    } catch {
      // Deliberately left unloaded so re-selecting retries. The empty state is
      // wrong but recoverable; a permanently blank conversation is not.
    } finally {
      loading.current.delete(groupId);
    }
  }

  function toggle() {
    if (!open && selectedId) void select(selectedId);
    setOpen(!open);
  }

  async function send(body: string) {
    const selected = conversations.find((c) => c.groupId === selectedId);
    if (!selected) return;
    // No ?k= — chatRole reads her session and answers "teacher" without one,
    // which is why this FAB works on a student page she has no token for.
    const response = await fetch(`/api/chat/${selected.slug}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
    if (!response.ok) throw new Error("send failed");
    // Nothing appended here — it arrives back through the stream, which is what
    // gives it its real id and timestamp.
  }

  // The SSE stream only ever carries insertions, so a delete has to be
  // reflected locally by hand — nothing else will tell this client it is gone.
  async function handleDelete(id: string) {
    await onDeleteMessage(id);
    removeMessage(id);
  }

  const selected = conversations.find((c) => c.groupId === selectedId) ?? null;
  const anyUnread = [...unread.values()].some((count) => count > 0);

  return (
    <>
      {/* Conditionally rendered, and load-bearing: everything inside formats
          dates in the reader's timezone, so an SSR pass would mismatch on
          hydration. See the note at the top of MessageList. */}
      {open && (
        <ChatPanel
          title={selected ? selected.name : labels.title}
          labels={{ close: labels.close, back: labels.back }}
          onClose={() => setOpen(false)}
          // Only when there is somewhere to go back to. ChatPanel hides it at
          // md, where both panes are on screen at once.
          onBack={view === "conversation" ? () => setView("list") : undefined}
          showAside={view === "list"}
          aside={
            <ConversationList
              conversations={conversations}
              selectedId={selectedId}
              unread={unread}
              onSelect={(id) => void select(id)}
              labels={labels}
            />
          }
        >
          {selected ? (
            <Conversation
              messages={messagesFor(messages, selected.groupId)}
              self="teacher"
              labels={labels}
              // Both omitted for an unclaimed student: the thread stays
              // readable and there is nothing to type into, because nobody has
              // claimed the other end of it. Deleting is withheld for the same
              // reason it is offered at all — it is a control over a live
              // conversation, and this is not one yet.
              onSend={selected.claimed ? send : undefined}
              onDeleteMessage={selected.claimed ? handleDelete : undefined}
              footer={
                selected.claimed ? undefined : (
                  <UnclaimedNotice
                    // Keyed so switching between two unclaimed students
                    // refetches rather than showing the first one's invite.
                    key={selected.groupId}
                    groupId={selected.groupId}
                    name={selected.name}
                    labels={labels}
                    onInviteLink={onInviteLink}
                  />
                )
              }
            />
          ) : (
            // Only reachable at md and up, where the list is beside this pane.
            // Below md an unselected inbox shows the list full-screen instead.
            <p className="flex flex-1 items-center justify-center px-6 text-center text-sm text-[var(--color-ink-muted)]">
              {labels.pickOne}
            </p>
          )}
        </ChatPanel>
      )}

      <button
        type="button"
        onClick={toggle}
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
        {anyUnread && !open && (
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

- [x] **Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: the same single pre-existing error in `app/g/[slug]/page.tsx`, and nothing new. If `messagesFor` or `ConversationSummary` is reported as unresolved, Tasks 7 and 11 are incomplete.

- [x] **Step 3: Commit**

```bash
git add components/chat/InboxFab.tsx
git commit -m "feat: add the teacher inbox FAB"
```

---

## Task 20: The server wrapper (`TeacherInbox.tsx`)

A server component that runs the session check and the query, and **owns the `StreamProvider`**. That last part is the important one: on a student's page the provider has to wrap the page body too, so `LiveBanner` and `BoardTab` read the same stream Jenn's inbox does. Two providers on one page would be two `EventSource`s — the exact bug `StreamProvider` was created to fix.

It takes `children` for that reason, and returns them untouched for anyone who is not the teacher.

**Files:**
- Create: `components/chat/TeacherInbox.tsx`

- [x] **Step 1: Write the component**

```tsx
// components/chat/TeacherInbox.tsx
import type { ReactNode } from "react";
import { getCurrentTeacher } from "@/lib/session";
import { listConversations } from "@/lib/inbox";
import { streamUrl } from "@/lib/stream-url";
import { StreamProvider } from "@/components/StreamProvider";
import { InboxFab } from "@/components/chat/InboxFab";
import {
  loadConversation,
  markChatRead,
  deleteMessage,
  inviteLink,
} from "@/app/actions";

// English throughout, matching the rest of the admin. On /g/marie that means a
// French page with an English FAB, which is correct: the page is the student's
// and the FAB is hers. Every string is a prop rather than inline copy so the
// planned localisation is a map swap — see lib/page-section-labels.ts for the
// pattern this follows.
const LABELS = {
  title: "Messages",
  close: "Close",
  back: "Back",
  pickOne: "Pick a student to see your conversation.",
  empty: "No messages yet.",
  placeholder: "Write a message…",
  send: "Send",
  locale: "en-CA",
  today: "Today",
  yesterday: "Yesterday",
  deleteMessage: "Delete",
  search: "Search students",
  noStudents: "No students yet.",
  noMatch: "Nothing matches that.",
  noMessages: "No messages yet",
  you: "You: ",
  unread: "Unread messages",
  // Claim state (2026-08-03 student sign-in). Copy about a student stays
  // gender-neutral, as that spec requires: Jenn's students are not all of one
  // gender and the schema records a name, not a pronoun.
  notSignedUp: "Hasn't signed up yet",
  notSignedUpLong:
    "{name} hasn't signed up yet, so there's nobody to receive a message. Share their invite link.",
  copyInvite: "Copy invite",
  copied: "Copied",
};

// Owns the StreamProvider rather than sitting inside one, because on a student
// page the provider has to wrap the page body as well — LiveBanner and BoardTab
// call useStream. Two providers would mean two EventSources, which is precisely
// what StreamProvider exists to prevent.
export async function TeacherInbox({
  studentSlug = null,
  children,
}: {
  // The student whose page this is, when there is one. It does two jobs: it is
  // the board channel folded into her single stream, and it is the conversation
  // the inbox opens on.
  studentSlug?: string | null;
  children?: ReactNode;
}) {
  const teacher = await getCurrentTeacher();
  // Not a redirect and not a throw: this renders on pages that legitimately
  // have non-teacher visitors, and its job there is to be invisible.
  if (!teacher) return <>{children}</>;

  const conversations = await listConversations();
  const selected =
    conversations.find((c) => c.slug === studentSlug)?.groupId ?? null;

  return (
    <StreamProvider url={streamUrl({ isTeacher: true, slug: studentSlug })}>
      {children}
      <InboxFab
        conversations={conversations}
        initialSelectedId={selected}
        labels={LABELS}
        onLoadConversation={loadConversation}
        onMarkRead={markChatRead}
        onDeleteMessage={deleteMessage}
        onInviteLink={inviteLink}
      />
    </StreamProvider>
  );
}
```

- [x] **Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: the same single pre-existing error in `app/g/[slug]/page.tsx`.

If TypeScript rejects `onLoadConversation={loadConversation}` because the action returns `StoredMessage[]` and the prop wants `ChatMessage[]`, check the two types match field for field — they should, and `StoredMessage` is the one to change if not. Do **not** widen the prop to `unknown[]`.

- [x] **Step 3: Commit**

```bash
git add components/chat/TeacherInbox.tsx
git commit -m "feat: add the TeacherInbox server wrapper"
```

---

## Task 21: Wire the three pages

**Files:**
- Modify: `app/g/[slug]/page.tsx`
- Modify: `app/admin/page.tsx`
- Modify: `app/admin/pages/[slug]/page.tsx`

- [x] **Step 1: Rewrite the bottom of the student page**

**Read `app/g/[slug]/page.tsx` first.** The sign-in build rewrote it: `unlocked` is no longer computed inline from the cookie but derived from `studentGate` (`lib/student-gate.ts`) as `gate === "signed-in"`, and a `StudentAuthPanel` now renders under the tabs. None of that changes here — this task touches only the `StreamProvider`/`ChatFab` block at the bottom.

Three things to establish before editing:

1. **`unlocked` keeps its current definition.** Do not make it consult the teacher session. The sign-in design devotes a section to why, and that reasoning still holds — it gates the Files and Whiteboard tabs, which stay token-derived. Only the FAB moves.
2. **`StudentAuthPanel` and the gate switch are untouched.** If the edit below makes either disappear, it landed in the wrong place.
3. **A teacher-session boolean is needed.** The file already resolves the teacher session to feed `studentGate`'s `isTeacher` input — reuse that variable. If it is computed inline inside the `studentGate({...})` call, hoist it to a `const viewerIsTeacher = Boolean(await getCurrentTeacher());` above and pass it in, rather than calling `getCurrentTeacher()` twice.

Now the imports. Drop `markChatRead` and `deleteMessage` from the `@/app/actions` import — both moved into `TeacherInbox` — keeping whatever else that line brings in (`deleteWhiteboard` at least). Add:

```ts
import { TeacherInbox } from "@/components/chat/TeacherInbox";
import { streamUrl } from "@/lib/stream-url";
```

Then find the block near the bottom that reads `{unlocked ? (<StreamProvider …>{body}<ChatFab …/></StreamProvider>) : (body)}` and replace that whole ternary with the three-way version below. It is a three-way branch now because the teacher case is no longer a subset of the unlocked case:

```tsx
      {viewerIsTeacher ? (
        // Her inbox owns the provider here, so `body` sits inside it and
        // LiveBanner still has a stream to read. Two providers would mean two
        // EventSources.
        //
        // She gets no ChatFab: the inbox replaces it, and it reaches her on this
        // page through her session rather than through this student's token.
        // `unlocked` is untouched and still gates everything in `body` — a
        // teacher without the token sees the same page body a stranger does.
        //
        // Deliberately independent of the gate. In "unclaimed" she gets the
        // conversation with the composer replaced by the invite; in
        // "teacher-stale" — her cookie left behind by the token rotation a claim
        // performs — she keeps the conversation and loses only the tabs, which
        // is strictly better than losing both.
        <TeacherInbox studentSlug={slug}>{body}</TeacherInbox>
      ) : unlocked ? (
        <StreamProvider url={streamUrl({ isTeacher: false, slug })}>
          {body}
          <ChatFab
            slug={slug}
            labels={{
              title: "Clavardage",
              empty: "Aucun message pour l'instant.",
              placeholder: "Écrivez un message…",
              send: "Envoyer",
              close: "Fermer",
              // Never shown — a student has no list to go back to — but the
              // panel's label type asks for it.
              back: "Retour",
              locale: "fr-CA",
              today: "Aujourd'hui",
              // Never shown either: onDeleteMessage is not passed here.
              deleteMessage: "Supprimer",
            }}
          />
        </StreamProvider>
      ) : (
        body
      )}
```

- [x] **Step 2: Add the FAB to the admin**

In `app/admin/page.tsx`, add the import:

```ts
import { TeacherInbox } from "@/components/chat/TeacherInbox";
```

and add it as the last child of `<main>`, after the closing `</div>` of the `max-w-xl lg:max-w-[1152px]` wrapper:

```tsx
        {active === "pages" && <PagesTab />}
      </div>

      {/* Outside the width wrapper: the FAB is fixed-positioned and a
          max-width ancestor would have no effect, but nesting it inside a
          content column implies otherwise. */}
      <TeacherInbox />
    </main>
```

- [x] **Step 3: Add the FAB to the page editor**

In `app/admin/pages/[slug]/page.tsx`, add the same import, and add `<TeacherInbox />` as the last child of its `<main>`, after the closing `</div>` of the `max-w-[560px]` wrapper.

- [x] **Step 4: Verify the whole tree compiles and the suite passes**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: no type errors, no lint errors, all tests pass.

If lint flags an unused `StreamProvider` import in `app/g/[slug]/page.tsx`, it is still used by the student branch — check the edit landed inside the ternary rather than replacing it.

- [x] **Step 5: Commit**

```bash
git add app/g/\[slug\]/page.tsx app/admin/page.tsx app/admin/pages/\[slug\]/page.tsx
git commit -m "feat: render the teacher inbox on every signed-in page"
```

---

## Task 22: Update `CLAUDE.md`

The retirements in the spec are all things `CLAUDE.md` asserts. Leaving them is worse than never having written them — this file's value is that it is true.

**Read the current `CLAUDE.md` first.** The sign-in build already edited the Auth section, the `/g/[slug]` routes row and the Lesson chat paragraph about `chatToken`. The steps below give the *substance* of each change and the section to make it in; match the wording that is actually there rather than the wording quoted here.

**Files:**
- Modify: `CLAUDE.md`

- [x] **Step 1: Add the route**

In the Routes table, after the `GET /api/chat/[slug]/stream` row, add:

```
| `GET /api/inbox/stream` | teacher | every conversation on one stream, plus `?board=` |
```

and extend the `/api/auth/*` row's parenthetical, which lists the routes that are not server actions, to include `/api/inbox/*`.

- [x] **Step 2: Correct the `/g/[slug]` row**

The sign-in build rewrote this row around the sign-in form and the claimed account. Leave all of that. The one clause to change is whichever now says the chat needs the token with the teacher included — add to the row, in its own words:

```
**Jenn's own chat is her inbox FAB and follows her session, not the token** — the only thing on this page that does. Everything the gate controls is unchanged.
```

- [x] **Step 3: Amend the Dates section**

After the paragraph beginning "Every date is UTC midnight", add:

```
One deliberate exception, added 2026-08-04: **chat message grouping and
timestamps are in the reader's local zone**, not UTC. `lib/chat-time.ts` is the
only module here that omits `timeZone: "UTC"`, and `groupByDay` keys on its
`localDayKey`. A card belongs to a teaching day Jenn picked; a message belongs
to the moment someone typed it, and "8:02 p.m." under tomorrow's date is not
consistency. The consequence: a message's day heading depends on who is reading
it, and nothing in the chat may render on the server — see *Lesson chat*.
```

- [x] **Step 4: Rewrite the parts of *Lesson chat* that are now wrong**

Find the paragraph describing how Jenn reaches a chat (it begins "Jenn chats from `/g/[slug]` itself" unless the sign-in build reworded it) and the one beginning "Delivery is SSE", and replace both with:

```
Jenn chats from an inbox: one FAB, on `/admin`, `/admin/pages/[slug]` and
`/g/[slug]`, rendered by `components/chat/TeacherInbox.tsx` and invisible to
anyone without a teacher session. Students on the left with an unread dot and
the last line of the thread, the selected conversation on the right; below
`md` the two become full-screen levels with a back arrow between them.
Students keep the single-conversation `ChatFab`, which gains the same
full-screen treatment and no back arrow, because they have no second level.

**Her FAB follows her session, not the token.** That changes no access rule:
`chatRole` has always answered `"teacher"` on the session alone, and both the
POST and the SSE route have always honoured it — the UI was the only thing
withholding her own conversations from her. `unlocked` is untouched, still
derived from `studentGate`, and still gates the Files tab, the Whiteboard tab
and everything inside them from the token alone. The student sign-in design's
*Why `unlocked` does not consult the teacher session* therefore still holds
verbatim: it is a rule about `unlocked`, and this is not `unlocked`.

**A student who has not signed up is listed and read-only.** That design's
other consequence — "there is nobody on the other end of a conversation nobody
has claimed" — is kept rather than quietly dropped: the row shows *Hasn't
signed up yet*, and selecting it replaces the composer with that sentence and
the invite link. Listing them rather than hiding them is deliberate; a student
created ten seconds ago being absent from the inbox reads as a bug. `claimed`
is `passwordHash !== null`, the same fact the gate reads, selected by
`listConversations` and never re-derived. The invite link itself is fetched by
the `inviteLink` server action rather than shipped in that list, because it is
a live `chatToken` and the list renders on every teacher page.

Delivery is SSE with an in-process `EventEmitter` (`lib/chat-bus.ts`) over two
endpoints. Students connect to `/api/chat/[slug]/stream`, which replays that
one conversation in full. Jenn connects to `/api/inbox/stream`, which
subscribes to a broadcast channel — not to each group id, because enumerating
at connect misses a student created afterwards — and **sends no first-connect
backlog at all**: every conversation, on every admin page load, with retention
set to forever, is what that would cost. Her list arrives with the page and a
selected conversation loads its own history through the `loadConversation`
server action. A `Last-Event-ID` reconnect still replays, capped at 500 and
newest-first, so a deploy mid-lesson costs a blink.

That endpoint is `/api/inbox/stream` and not `/api/chat/stream` because a
static `stream` segment under `app/api/chat/` would take routing precedence
over `app/api/chat/[slug]/`, silently shadowing a student whose name produced
the slug `stream`.

`?board=<slug>` folds a group's board frames into her stream, so on a student's
page she still holds exactly one `EventSource` — the property `StreamProvider`
exists to protect. It takes a URL rather than a slug now, built by
`lib/stream-url.ts`, and its `messages` array is flat and multi-conversation:
`ChatMessage` carries the `groupId` the payload always had, and
`lib/chat-select.ts` picks one conversation out.

**Both emitters are still correct only because pm2 runs this app as a single
process in fork mode.** Under cluster mode a message would reach only the
viewers on the same worker, silently. Four things now depend on that: the
chat bus, the live board, the sign-in throttle, and this stream.

**Nothing in the chat may render on the server.** Every heading and timestamp
resolves in the runtime's timezone, so an SSR pass would produce different HTML
from the hydration pass. What protects it is that both FABs mount their panel
on an `open` state that starts `false`. A change that renders a panel eagerly
breaks production and nothing else.
```

- [x] **Step 5: Note the read model**

In the same section, after the `teacherLastReadAt` mention, add:

```
`listConversations` (`lib/inbox.ts`) is the single read model behind both the
inbox list and the Students tab's `· N unread` eyebrow; `unreadCounts` was
removed rather than kept beside it, because two query paths for one number are
two things that can disagree. It runs 2N queries for N students against a local
SQLite file — legible at this size; the shape to reach for if that ever changes
is a `lastMessageAt` column maintained on write.
```

- [x] **Step 6: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: record the chat inbox and what it retires"
```

---

## Task 23: Full verification

CI runs `prisma generate` → lint → `tsc --noEmit` → test → build, in that order. Run the same locally before calling this done, then work the manual list — most of what this feature changes is not unit-testable.

- [x] **Step 1: Run the CI sequence**

```bash
npx prisma generate && npm run lint && npx tsc --noEmit && npm test && npm run build
```

Expected: every step exits 0. Report the actual output; do not claim this passed without it.

- [ ] **Step 2: Manual — Jenn's inbox on `/admin`**

`npm run dev`, sign in, open `/admin`.

- The FAB is bottom-right on all three tabs.
- Opening it shows the student list. Never-messaged students are at the bottom with the empty preview.
- The search field filters, and `passe` finds a student named `Passé`.
- Selecting a student loads the conversation on the right; the day headings say **Today** for today and a full date above older days, and each message has a time beneath it in your own timezone.
- Scrolling a long conversation: the heading sticks to the top of the scroll area and is pushed off by the next day's.
- Send a message. It appears in the thread and the preview line updates on the next page load.

- [ ] **Step 3: Manual — live delivery and the unread dot**

With `/admin` open in one browser and `/g/<slug>?k=<chatToken>` in a private window:

- Send from the student. With Jenn's panel **closed**: the FAB's dot appears and that student's row gains a dot and moves to the top.
- Open her panel on a *different* student and send again: the dot appears on the sender's row, not the open one.
- With her panel open **on that student**: no dot appears, and reloading `/admin` confirms the unread count stayed zero — that is `markChatRead` firing on arrival.
- Send from Jenn: it reaches the student's FAB within a second.

- [ ] **Step 4: Manual — `/g/[slug]` as Jenn, no token**

Open `/g/<slug>` in the signed-in browser with **no** `?k=`, after clearing that student's cookie (DevTools ▸ Application ▸ Cookies ▸ delete `student-token-<slug>`).

- The page body is the public card only — no Files tab, no Whiteboard tab. That is `unlocked` still working on the token.
- Her FAB is present anyway, and opens **on that student's conversation**.
- Sending works. This is the retirement in Task 22 Step 4 — if the FAB is missing, `viewerIsTeacher` is not reaching `TeacherInbox`.

- [ ] **Step 5: Manual — one connection on `/g/[slug]`**

With the same page open, DevTools ▸ Network ▸ filter `eventsource`.

Expected: exactly **one** request, to `/api/inbox/stream?board=<slug>`. Two rows here means the page is rendering its own `StreamProvider` beside `TeacherInbox`'s.

Then open a whiteboard from the Whiteboard tab (with the token, so the tab is present) and draw: the strokes reach a student watching, over that same single connection.

- [ ] **Step 6: Manual — mobile, both sides**

DevTools ▸ device toolbar ▸ iPhone.

- Jenn: the FAB opens full-screen on the list, header shows **X**. Tapping a student shows the conversation full-screen, header shows **←** and the student's name, no X. Back returns to the list.
- Student: full-screen conversation, header shows **X** only, no back arrow.
- Both: the message input is reachable and the list scrolls. If the inner list does not scroll, a `min-h-0` is missing from a flex ancestor in `ChatPanel`.

- [ ] **Step 7: Manual — the timezone change**

DevTools ▸ ⋮ ▸ More tools ▸ Sensors ▸ Location ▸ Tokyo (or run the dev server with `TZ=Asia/Tokyo`), reload, reopen a conversation.

Expected: the times shift, and a message near local midnight moves under a different heading. Nothing is stored differently — that is the point.

- [ ] **Step 8: Manual — an unclaimed student**

Create a new student from `/admin?tab=groups` and do **not** claim the account.

- They appear in the inbox list, at the bottom, with `Hasn't signed up yet` as the preview.
- Selecting them shows an empty thread with **no message box** — the notice and the invite link are in its place.
- **Copy invite** puts an absolute URL on the clipboard. Paste it somewhere and confirm it carries `?k=`.
- Complete the sign-up in a private window with that link, reload `/admin`, and confirm the row now shows a normal empty conversation with a working composer.
- Confirm the invite link is no longer offered for that student — `inviteLink` returns `null` once `passwordHash` is set, because the claim rotated the token.

If the composer is present for an unclaimed student, `claimed` is not reaching `InboxFab` — check `listConversations` selects `passwordHash`.

- [ ] **Step 9: Manual — the everyone group is absent**

Expected: `all` / "Everyone" does not appear in the inbox list. It has no `chatToken`, `chatRole` refuses it before anything else, and `studentGate` refuses it first too.

- [ ] **Step 10: Manual — the sign-in build still works**

This plan touched two files that build owns. Confirm none of it regressed:

- `/g/<slug>` signed out, no cookie: public card, the collapsed *Vous avez un compte ?* line, no tabs.
- Sign in as the student: tabs appear, the student's own `ChatFab` works.
- Sign out: tabs disappear again.
- `/admin?tab=groups`: claimed students show their email and sign-up date with no link; unclaimed ones show the invite and **New invite link**; the unread eyebrow still reads correctly on both.

- [x] **Step 11: Commit anything outstanding**

```bash
git status
```

Expected: clean. If not, the uncommitted file belongs to whichever task left it — commit it there.

---

## Notes for whoever executes this

- **`getCurrentTeacher` is now called twice per admin request** — once by the page, once by `TeacherInbox`. If it is not already wrapped in React's `cache()`, wrapping it is a free win and touches nothing else. Check `lib/session.ts` before adding a workaround.
- **Do not add a second `StreamProvider` anywhere.** If a new page needs the stream, it goes inside the one `TeacherInbox` already provides, or the page mounts one itself — never both.
- **Do not render a chat panel unconditionally.** The `{open && …}` guard is what keeps local-time formatting out of SSR.
- **Never make `unlocked` consult the teacher session.** The sign-in design argues that at length and it is still right. This plan moves one floating control onto her session and leaves `unlocked` — and therefore the Files tab, the Whiteboard tab and the gate — exactly as it found them. If a task seems to want `unlocked` changed, it has been misread.
- **`claimed` has two readers now** — `studentGate` and `listConversations` — and both read `passwordHash`. Keep it that way. A third notion of "signed up" is how a composer ends up pointed at someone who cannot read it.
- **This plan's snapshot of `app/g/[slug]/page.tsx` and the admin Students tab predates the sign-in build.** Every step touching them says "read the file first". Do that; do not reconcile from the snippets here.







## Execution note (2026-08-04)

Every code task is complete and committed on `feat/chat-inbox`. The CI sequence
(`prisma generate` → lint → `tsc --noEmit` → test → build) passes.

The 11 unticked steps above all need a real browser: they require a passkey
sign-in and client-side JavaScript, neither of which is reachable from a
terminal. What *was* verified headlessly, against the local dev database with a
session cookie set by hand:

- `/api/inbox/stream` answers 404 with no session.
- With a session it opens, sends **no first-connect backlog**, and heartbeats
  `: ping` at 20s.
- A student POST to `/api/chat/[slug]` arrives on that stream within a second,
  carrying the correct `groupId` — the broadcast channel works.
- The inbox FAB renders on `/admin`, `/admin?tab=groups`, `/admin/pages/[slug]`
  and `/g/[slug]`, including `/g/[slug]` with **no student token**; it does not
  render for an anonymous visitor, who still gets the public card.
- `streamUrl` produces `/api/inbox/stream?board=<slug>` on a student page.
- The conversation list omits the everyone group, lists an unclaimed student
  with `claimed: false`, and **contains no `chatToken` anywhere** in any page
  payload.

One thing to watch during the manual pass: `markChatRead` fired several times in
close succession from a browser tab left open on `/admin` while messages
arrived. That tab had hot-reloaded across several incompatible versions of
`InboxFab`, so it is most likely stale HMR state rather than a real loop — the
read marker was stable across a 25s idle afterwards. Confirm on a fresh load
that one arriving message produces at most one `markChatRead`, since the action
calls `revalidatePath("/admin")` and a remount would reset the `counted` ref.
