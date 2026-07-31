# Lesson chat and the everyone group — design

Date: 2026-07-31

## Problem

Jenn teaches one student at a time. During a lesson she wants to write to them —
a correction, a phrase to keep, tonight's homework — and have it land where the
student can read it now and find it again next week. Between lessons students
write to her, and those messages have to wait on the server until she looks.

A `Group` has always been a person in practice. Nothing in the app says so, and
nothing gives the two of them a place to talk.

Separately, uploaded pages are assigned to groups one at a time. A worksheet
meant for everybody has to be ticked against every student individually, and
every new student starts with an empty shelf.

## Goal

A student opens one link and sees their card, their files, and a live
conversation with Jenn. Jenn sees the same conversation from the admin area and
can tell at a glance who has written to her.

A page assigned to the everyone group appears on every student's shelf without
being assigned to any of them.

The daily card — the first purpose of this site — stays exactly as public and
as simple as it is today.

## Scope

New:

- `lib/everyone.ts` — `EVERYONE_SLUG` (the migration's seed and its fallback
  create are the only readers) and `canDeleteGroup(group)`, the tested predicate
- `lib/student-tokens.ts` — `newToken()`, and `readToken(searchParams, cookies)`
  resolving `?k=` ahead of the cookie
- `lib/effective-pages.ts` — `effectivePages(own, everyone)`
- `lib/chat-bus.ts` — the in-process fan-out
- `lib/messages.ts` — Prisma reads and writes for chat
- `lib/chat-day.ts` — `groupByDay(messages)` for the day separators
- `app/api/chat/[slug]/route.ts` — `POST` a message
- `app/api/chat/[slug]/stream/route.ts` — the SSE stream
- `app/f/[token]/page.tsx` — the opaque files list
- `components/chat/ChatPanel.tsx`, `MessageList.tsx`, `MessageInput.tsx`
- `components/student/FilesSection.tsx`
- `prisma/migrations/<...>_add_chat/` — `Message`, three `Group` columns
- `tests/lib/` — one test file per new pure module above

Changed:

- `prisma/schema.prisma` — `Message` model, `Group.isEveryone`,
  `Group.chatToken`, `Group.filesToken`, `Group.teacherLastReadAt`
- `app/g/[slug]/page.tsx` — becomes the hub
- `lib/pages.ts` — `listPagesForGroup` folds in the everyone group's pages
- `app/actions.ts` — `deleteGroup` refuses the everyone group; new
  `deleteMessage`, `regenerateStudentLinks`
- `app/admin/[slug]/page.tsx` — the chat, beside the overrides
- `components/admin/GroupList.tsx` — unread counts, no delete on everyone
- `components/admin/PageList.tsx` — inherited pages marked
- `CLAUDE.md`, `docs/DEPLOY.md` — routes, the everyone group, retention

Removed:

- `app/g/[slug]/pages/page.tsx`. Replaced by `/f/[token]`. This route is hours
  old, is linked from nowhere, and the only page on production is not yet
  shared with a student, so nothing is bookmarked against it.

Unchanged:

- `GlobalCard`, `Card`, card resolution, the week, the flashcard template.
- `app/p/[slug]` and its raw route. A page's own link never moves.
- Teacher auth. Students never get a passkey or a session row.

## The everyone group

`Group.isEveryone` is a boolean, default false, true on exactly one row. On
production that row already exists as `all` / "Everyone"; the migration sets the
flag on it, and creates it if absent so a rebuilt box is not silently missing it.

The flag rather than `slug === "all"`, because three separate rules key off it —
no chat, no tokens, pages flow outward — and a string compare scattered across
three files is three chances to forget one. It also gives `deleteGroup`
something honest to refuse on.

Deleting it is refused in `deleteGroup` with a message saying why. It is not
merely inadvisable: every student's shelf is assembled from it, so removing it
empties all of them at once.

Nothing enforces "exactly one" at the database level. A second flagged row would
mean pages inherited from two places, which is not wrong, just unintended;
there is no UI that can create one.

## Page inheritance

A student's shelf is their own pages plus the everyone group's:

```ts
effectivePages(own: Page[], everyone: Page[]): Page[]
```

Pure, in `lib/`, with a test — the same shape as `pickEffectiveCard`, and for
the same reason. It concatenates, drops duplicates by id (a page assigned both
directly and to everyone appears once), and sorts by `createdAt` descending so
the merged shelf reads like one list rather than two stacked ones.

`listPagesForGroup(groupId)` fetches both sets and returns the result. Callers
do not know inheritance happened.

In the admin Pages tab, filtering by a student shows their effective shelf, not
their assignments — the chip answers "what does Marie have?", which is the
question Jenn is asking when she clicks it. An inherited tile is marked
`shared with everyone` so it is obvious why it is there and why unticking Marie
would not remove it.

The everyone group's own shelf is reachable at `/g/all`, which grows a files
section when it has any. Today it has none, so `/g/all` is the card alone, as it
is now.

## Access

Two random tokens per student, both null on the everyone group:

- `chatToken` — unlocks the hub's files and chat sections
- `filesToken` — addresses the opaque files list

Two rather than one so that sharing a files link never hands over the chat. The
relationship is one-way and deliberate: `chatToken` opens the hub, which
contains the files, so it grants everything `filesToken` does. `filesToken`
grants only the shelf.

**The card stays public.** An untokened visit to `/g/marie` renders what it
renders today and nothing more. This is the load-bearing decision in the whole
design: every existing bookmark keeps working, a forwarded plain link leaks
nothing, and there is no login wall in front of the site's first purpose.

The token arrives once as `?k=`, is exchanged for an httpOnly cookie scoped to
that group's path, and is then dropped from the URL by a redirect. After the
first visit the student's plain `/g/marie` bookmark shows the full hub, and the
secret has stopped riding in history on every later visit.

| Route | Who | What |
|---|---|---|
| `/g/all` | public | the card; files when any exist |
| `/g/marie` | public | the card |
| `/g/marie?k=…` | token | card + files + chat; sets cookie, redirects |
| `/g/marie` + cookie | student | card + files + chat |
| `/f/<filesToken>` | token | that student's shelf, nothing else |

`/f/[token]` carries no name, no slug and no structure: seen over a shoulder or
in a shared screen it says nothing about whose it is. Every one of these routes
sends `X-Robots-Tag: noindex, nofollow`, and a wrong or missing token is a 404
rather than a 401, so a crawler cannot tell a real student's link from a
made-up one.

Jenn regenerates either token from the admin, which revokes a leaked bookmark.
Regenerating tells her the old link will stop working, because for a
non-technical user that consequence is not obvious from the word "regenerate".

## Schema

```prisma
model Group {
  isEveryone        Boolean   @default(false)
  chatToken         String?   @unique
  filesToken        String?   @unique
  // Stamped when Jenn opens this chat. The unread count is the messages from
  // the student newer than it; null means she has never opened it.
  teacherLastReadAt DateTime?
  messages          Message[]
}

model Message {
  id          String   @id @default(cuid())
  groupId     String
  group       Group    @relation(fields: [groupId], references: [id], onDelete: Cascade)
  // Who wrote it. A boolean rather than a sender id because there are exactly
  // two participants and one of them has no row to point at.
  fromTeacher Boolean
  body        String
  createdAt   DateTime @default(now())

  @@index([groupId, createdAt])
}
```

No session or lesson model. Day separators are computed from `createdAt` by
`groupByDay`, a pure function with a test, so "a lesson" stays a thing the
calendar decides rather than a thing someone has to remember to press. A
summary later takes a date range and needs no new table.

`onDelete: Cascade` on the relation: deleting a student takes their
conversation with them, which is what deleting a student means.

## Real-time

`GET /api/chat/[slug]/stream` returns a `ReadableStream` as `text/event-stream`.
Sending is an ordinary `POST /api/chat/[slug]`, not a socket, because nothing
needs to travel client-to-server that a request cannot carry.

Fan-out is an in-process `EventEmitter` held on `globalThis`, the same pattern
`lib/prisma.ts` already uses for the same reason. This is correct **because pm2
runs a single process in fork mode**. Moving to cluster mode would silently
break it — a message would reach only the viewers connected to the same worker —
so that constraint is recorded in `CLAUDE.md` next to the emitter, not left to
be rediscovered.

Two details keep this working behind nginx without touching nginx:

- Every response sets `X-Accel-Buffering: no`. Nginx buffers proxied responses
  by default, which would hold the stream in memory and deliver nothing; this
  header turns it off for that response alone.
- A `: ping` comment every 20 seconds. Nginx's `proxy_read_timeout` is 60
  seconds by default and would otherwise drop an idle lesson mid-silence.

`EventSource` reconnects on its own. Each event carries the message id as its
SSE `id:`, so on reconnect the browser sends `Last-Event-ID` and the route
replays everything after it from the database. A deploy mid-lesson costs a
blink, not a message.

Messages are rows the instant they are sent, so a student writing while Jenn is
away needs no special path — she sees it when she next opens the chat. That is
the ordinary case, not an edge case.

## Jenn's side

The chat lives on `/admin/[slug]`, which is already the per-student screen,
beside the card overrides she is usually there to edit.

The Students tab tiles carry an unread count — messages from the student newer
than her last view of that chat, stored as `Group.teacherLastReadAt`. Without
it she has to open every student to find the one who wrote.

She can delete any message, hers or the student's. Retention is otherwise
forever, by decision: this is a teaching record, and a conversation that
silently evaporates after ninety days is worse than one that does not. Stated
in `CLAUDE.md` so it is a position rather than an omission.

## Build order

This spec covers two features that happen to meet at the hub, and they are
independent enough to ship separately:

**Part 1 — the everyone group and page inheritance.** `isEveryone`, its delete
guard, `effectivePages`, the admin's inherited-page marker. No tokens, no
chat, no new routes. Shippable on its own, and it makes every new student
start with a shelf instead of nothing.

**Part 2 — chat.** The tokens, the hub, `/f/[token]`, `Message`, the SSE
stream, Jenn's chat and unread counts. Depends on Part 1 only for the hub's
files section, which is a component by then.

Two plans, in that order. Part 1 is small and touches the code just deployed;
Part 2 is most of the work and all of the new surface area. Building them as
one plan would mean a single review over a migration, a new access model, and
a streaming endpoint at once.

## Testing

Pure modules with tests, per the existing convention:
`effective-pages`, `chat-day`, `chat-token`, `everyone`. Components, Prisma
access and the SSE route are not unit-tested, as with everything else here.

The everyone-group delete guard gets a test at the `lib/` level — it is the one
rule in this design whose failure is silent and wide.

## Future — not in this build

- **Email on a message Jenn missed.** She has this today by other means and
  asked to keep it out of scope. When it comes back it belongs on the same
  write path as the SSE publish, gated on her not having an open stream for
  that group.
- **Claude summarisation** of a long conversation. Takes a date range over
  `Message`; needs no schema change. `lib/card-ai.ts` is the model for how the
  call and its failure modes should be shaped.
- **Typing indicators and read receipts.** Deliberately absent. Both need a
  second channel of ephemeral state for a two-person chat that is usually
  happening on a video call anyway.

## Rejected

**A PIN, or any student login.** Rejected in favour of the link being the
secret. It is one more thing for a student to lose, and the material behind it
is homework, not banking.

**WebSockets.** Would need a custom `server.js`, a change to how pm2 starts the
app, and nginx upgrade headers — all to gain a client-to-server channel that
`POST` already provides.

**A `Lesson` or `Session` model.** Considered for grouping a transcript. The
continuous log with day separators gives the same reading experience with no
lifecycle to manage and nothing to forget to press.

**Renaming `Group` to `Student`.** The honest name, but it rewrites two tables
and three foreign keys under the cards and pages that point at them, for a
word. The UI says "students"; the schema keeps its history.
