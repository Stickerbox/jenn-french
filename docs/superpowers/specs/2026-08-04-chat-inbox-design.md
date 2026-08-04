# Chat inbox — design

2026-08-04

## Problem

Jenn's chat is one conversation at a time, reachable from one place, under a
condition that has nothing to do with her.

1. **There is no view of "who is waiting on me".** The closest thing is the
   `· N unread` eyebrow on the Students tab (`components/admin/GroupList.tsx`),
   which is a number with no message behind it. To find out what three students
   said, she opens three pages.
2. **Her chat is gated on the student's token, not on her session.**
   `unlocked` in `app/g/[slug]/page.tsx` compares the cookie against
   `group.chatToken` and never looks at the teacher session, so her own
   conversation is invisible to her unless she arrived carrying that student's
   secret. The server never agreed with this: `chatRole` returns `"teacher"` on
   the session alone, for both the POST and the SSE route. Only the UI withheld
   it.
3. **Her chat does not exist on `/admin` at all**, which is where she does
   everything else.
4. **Messages carry no time.** `MessageList` prints one date separator per day
   and nothing else, so "when did she say that" is unanswerable inside the app.
5. **That separator is UTC**, so a message sent at 20:00 in Montréal already
   appears under the following day's heading — a cost the chat spec accepted in
   exchange for consistency with cards and weeks, and which becomes indefensible
   the moment a clock time sits next to it.

## Goal

One FAB, on every page Jenn is signed in to, opening an inbox: students down the
left with an unread dot and the last line of the thread, the selected
conversation on the right. On a phone it collapses to two full-screen levels —
the list, then the conversation. Every message shows the time it was sent in the
reader's own timezone, under day headings that stick to the top of the scroll.

Students are unchanged in kind: one conversation with Jenn, no list, no other
student's name anywhere near it. They gain the times, the headings, and the same
full-screen treatment on a phone.

## What this retires

Three things stated deliberately elsewhere. Each is retired in a bounded way,
and the boundary is the point.

### 1. "The chat FAB is gated on the token, teacher included"

Two documents say this. CLAUDE.md:

> the floating `ChatFab` only renders when the page's own `unlocked` flag is
> true, and `unlocked` checks only the token cookie against `group.chatToken` —
> never the teacher session. A teacher who opens a student's page without that
> token sees no chat, same as anyone else.

And the student sign-in design (2026-08-03), which restates it deliberately
under *Why `unlocked` does not consult the teacher session*, having just
rewritten `unlocked` as `gate === "signed-in"`.

Retired **for the teacher's FAB only**. Her inbox follows her session.

**The sign-in spec's rule is not contradicted, because it is a rule about
`unlocked`, and `unlocked` does not change here.** It is still derived from
`studentGate` (`lib/student-gate.ts`), still token-derived, and still the gate
on the Files tab, the Whiteboard tab and everything inside them. A teacher
without the token still sees the page body a stranger sees. What moves is one
floating control that was never part of the page body.

Nor does any access rule change. `chatRole` answers `"teacher"` on the session
alone — it always has — and both `POST /api/chat/[slug]` and the SSE route
already honoured that, which is why the sign-in design could claim "not one
authorisation check changes" while rewriting how a student is admitted. A
teacher without the token could always have sent a message by hand. The UI was
the only thing withholding it, and it was withholding it from the one person the
conversation belongs to.

One thing gets **better** as a side effect, and it is worth recording so nobody
"fixes" it back. Claiming an account rotates `chatToken`, which invalidates the
cookie Jenn is holding for that student and puts her in the gate's
`"teacher-stale"` state. Today that costs her the chat as well as the tabs. With
a session-gated FAB she keeps the conversation and loses only the tabs, so the
stale-token failure gets strictly smaller and the one-click fix stays one click.

What survives unchanged, and must keep surviving:

- **`unlocked` still gates the page body**, from the token alone, via the gate.
- **The daily card stays public.** The oldest load-bearing decision here.
- **A wrong token is a 404, never a 403.**
- **The everyone group has no conversation**, and `chatRole` still refuses it
  before it checks anything else. It does not appear in the inbox list. The gate
  refuses it first too, for the same reason.

The delete control and the read marker (`markChatRead`) move with the FAB: they
were described as things she gets "once unlocked", and they are now things she
gets because she is signed in. Both were already `requireTeacher()`-guarded
server actions, so again, no rule changes — only which page can reach them.

### 1a. "Jenn cannot chat with a student who has not signed up"

The sign-in spec states this as a consequence of the rule above:

> **Jenn cannot open the chat or the whiteboard tab for a student who has not
> signed up yet.** There is nobody on the other end of a conversation nobody has
> claimed.

**Kept for the whiteboard, kept in substance for the chat, and made visible
rather than implicit.** An inbox that lists every student would otherwise hand
her a composer pointed at someone who cannot read it — the sign-in spec's point
is right, and an empty thread with a working text box is exactly how that point
gets lost.

So an unclaimed student **is listed**, with `Hasn't signed up yet` where the
preview line goes, and selecting them replaces the composer with that sentence
and the invite link to share. Listing them rather than hiding them is the
deliberate half: a student Jenn created ten seconds ago being absent from her
inbox with no explanation reads as a bug, and the first thing she needs for that
student is the invite anyway.

"Unclaimed" is `passwordHash === null`, the same fact `studentGate` calls
`claimed`. It is not re-derived here — `listConversations` selects it and the UI
switches on it.

A student can be unclaimed *and* have messages, because Jenn could have written
to them under the old model. That thread renders normally, read-only, with the
composer still replaced. Nothing is hidden; it just cannot be added to.

### 2. "Every date here is UTC"

CLAUDE.md says every date is UTC midnight and formatted with `timeZone: "UTC"`,
and `lib/chat-day.ts` says so again with a test asserting that a 20:00 Montréal
message lands on the next day.

Retired **for chat message grouping and chat timestamps only**. Cards, weeks,
page sections, whiteboard dates and the admin calendar are all untouched and
remain UTC.

The rule earned its place because a card belongs to a *teaching day* that Jenn
picks, and a week runs Monday to Friday regardless of where anyone is standing.
A chat message belongs to no such day — it belongs to the moment someone typed
it. Putting "8:02 PM" under tomorrow's date is not consistency, it is a bug with
a rationale.

The consequence to hold onto: **a message's day heading now depends on who is
reading it.** Jenn in Montréal and a student in Vancouver see the same message
under different headings, and both are correct. Nothing is stored differently;
`createdAt` remains an instant.

### 3. Nothing about the single connection

`components/StreamProvider.tsx` exists because two `EventSource`s each replayed
the whole chat backlog at connect. That holds, and it is the reason the teacher
stream carries board frames as well as messages rather than letting a second
connection open beside it.

## Scope

In:

- A teacher-wide SSE endpoint, and `StreamProvider` reshaped to take a URL
  rather than a slug.
- The inbox: conversation list, unread dot, preview line, selected conversation.
- The unclaimed state: listed, read-only, with the invite link in place of the
  composer.
- The FAB on every teacher-authenticated page.
- Per-message times and sticky day headings, on both sides.
- Full-screen chat on mobile, on both sides.

Out, and deliberately so:

- **Sending notifications of any kind.** No email, no push, no browser
  notification. There is no provider in this project — see the 2026-08-03
  student sign-in spec, which makes the same exclusion for the same reason.
- **A student-visible read receipt.** Jenn's read state is
  `Group.teacherLastReadAt` and stays hers. The student's own unread dot stays
  the per-device `localStorage` marker it is today, for the reason already
  recorded: a student has no account to hang a marker on, and a server-side one
  would mean a write path from an unauthenticated visitor for the sake of a dot.
- **Typing indicators, attachments, editing, reactions.**
- **Search inside a conversation.** The list gets a search field, reusing
  `filterGroups`; a conversation does not.
- **Changing retention.** The log is still forever.
- **A `/admin/chat` route.** The inbox is a panel, not a page; see *Rejected*.
- **Localisation itself.** Every string in the new components is a prop rather
  than inline copy, so a future locale is a map swap — but this build ships
  English for Jenn and French for students, exactly as today.

## Architecture

### Transport

`GET /api/chat/stream` — new, teacher only, 404 for anyone else. It carries
every conversation Jenn may see.

- **Broadcast, not enumeration.** `chatBus` gains `publishAll`/`subscribeAll` on
  a single channel that `createMessage` emits to alongside the per-group one.
  The alternative — subscribing to each group id at connect — silently misses a
  student created after she opened the page, and the failure looks like a
  student whose messages never arrive.
- **The everyone group is filtered out** by id, fetched once at connect. No
  message can exist for it (`chatRole` refuses the POST route first), so this
  never fires. It is there because the stream should mirror the access rule
  rather than assume the other end enforced it — the same defensive contract
  `readSections`, `readOps` and `readPageKind` have.
- **No first-connect backlog.** The per-slug stream replays the entire
  conversation at connect, which is right for one conversation. Doing that
  across every conversation, on every admin page load, with retention set to
  forever, is not. The teacher stream sends live messages only.
- **`Last-Event-ID` still replays**, through a new `messagesAfterAll(afterId)`
  ordered by the same `(createdAt, id)` total order as the per-group query. The
  replay is bounded by how long she was disconnected, so a deploy mid-lesson
  still costs a blink rather than a message.
- **`?board=<slug>` is optional.** When present the stream also subscribes to
  that group's board channel and sends the live-board snapshot, exactly as the
  per-slug route does. This is what keeps Jenn on `/g/marie` down to one
  connection while she has both an inbox and a whiteboard.
- Board frames keep carrying **no `id:` line** and a named `board` event, for
  the two reasons already recorded: an event without an id leaves the client's
  replay anchor untouched, and `onmessage` fires only for unnamed events.
- **The single-process constraint extends to this endpoint.** Under pm2 cluster
  mode a message would reach only the viewers on the same worker, silently. This
  is now true of four things — the chat bus, the live board, the sign-in
  throttle, and this stream.

The student's connection to `/api/chat/[slug]/stream` is unchanged, byte for
byte. That route keeps its full backlog replay, its revoke subscription and its
heartbeat.

### Client state

`StreamProvider` takes a `url` rather than a `slug`, computed by a pure
`streamUrl()` so the choice between the two endpoints is one testable rule
rather than a ternary in a page.

Its `messages` array becomes flat and multi-conversation: `ChatMessage` gains
`groupId`, which the payload has always carried — `StoredMessage` selects it and
the route `JSON.stringify`s the whole record — and which the client currently
discards. For a student every message shares one groupId and nothing changes.

It gains `ingest(messages)` beside `removeMessage`, because a selected
conversation's history arrives from a server action rather than the stream.
`messagesFor(all, groupId)` is a pure selector that filters and sorts by
`(createdAt, id)`; sorting is not optional, because history fetched after a live
message arrived would otherwise sit below it.

### Read model

`lib/inbox.ts` → `listConversations()` returns, per non-everyone group: id,
name, slug, unread count, `claimed`, and the last message in the thread (body
truncated to 200 characters, sender, timestamp) or `null`.

`claimed` is `passwordHash !== null` — computed in the query rather than shipped
as the hash, which must never leave the server. It is the same fact
`studentGate` reads, deliberately not re-derived: two definitions of "claimed"
would eventually differ, and the difference would be a composer pointed at
someone who cannot read it.

**The invite link is not in this payload.** It is `chatToken`, and it is a live
credential. `GroupList` already renders every student's on `/admin?tab=groups`,
so shipping them again would not be a new class of exposure — but the inbox
renders on *every* teacher page, including `/g/marie` during a screen-shared
lesson, and that would put every other student's invite in that page's source
for the sake of a control she reaches a few times a term. Instead
`inviteLink(groupId)` is a `requireTeacher()` server action called when she
selects an unclaimed conversation. One extra round trip on a rare path; zero
tokens in any page payload.

It keeps the per-group loop `unreadCounts()` already uses and adds a `findFirst`
beside each `count`. That is 2N queries where N is the number of students Jenn
teaches, against a SQLite file on the same box. A single-query formulation needs
either a window function — this project has no raw SQL — or fetching the message
table and reducing in JS, which is worse as the log grows. The loop is the
legible answer at this size; if N ever justifies otherwise, the shape to reach
for is a `lastMessageAt` column maintained on write.

`unreadCounts()` is replaced by this, not kept beside it. The Students tab reads
its `unread` field, so the eyebrow keeps working with one query path instead of
two that can disagree.

Ordering is a pure `orderConversations()`: threads with messages by last message
descending, then never-messaged students alphabetically below them. Recency
ordering is only tolerable with a way to find a specific name, so the list gets
the same `SearchField` + `filterGroups` the Students tab uses.

The preview line is a pure `previewText(last, labels)`: `null` becomes the empty
label, a message from Jenn is prefixed with the "You: " label, and newlines
collapse to spaces so one multi-line message cannot double a row's height.

### Time

Three pure functions, each taking an explicit optional `timeZone` that defaults
to `undefined`.

That default is the whole design. `undefined` means "the runtime's zone", which
in the browser is the reader's zone — the requirement. But a function that reads
an ambient zone cannot be tested without mutating `process.env.TZ` and hoping
nothing else in the run depends on it. An explicit parameter that nobody passes
in production makes the same function pure at the test boundary.

- `localDayKey(date, timeZone?)` → `"YYYY-MM-DD"`, via
  `Intl.DateTimeFormat("en-CA", { timeZone, year, month, day })`, which emits
  that format directly. `getFullYear()`/`getMonth()`/`getDate()` would work for
  the ambient case and cannot express an explicit zone at all.
- `formatTime(date, locale, timeZone?)` → `"8:02 PM"` / `"20 h 02"`. Note the
  deliberate absence of `timeZone: "UTC"`, which every other formatter in this
  project passes.
- `dayHeading(day, todayKey, labels)` → the "Today" label when the keys match,
  otherwise the formatted date.

`groupByDay` switches from `toISOString().slice(0, 10)` to `localDayKey`. Its
contract is otherwise untouched, including the deliberate compare-against-the-
last-group behaviour that surfaces a broken ordering instead of hiding it. Its
test changes from asserting UTC grouping to asserting the opposite, and that
inversion is the point of the change, not collateral damage.

**The day heading says "Today" or a date. There is no "Yesterday".** The list's
compact timestamp does have one, because a bare `Jul 28` for something eight
hours old reads as older than it is, and the list is scanned rather than read.
The heading is read in place, where the date is more useful than the word.

### Hydration

Every string these functions produce differs between the server (UTC on the EC2
box) and the browser (the reader's zone). Rendering one during SSR is a
hydration mismatch.

**Nothing in the chat may render before mount.** The FAB's panel is already
`{open && <panel/>}` with `open` starting `false`, which is what makes this safe
today by accident; this spec makes it a rule. The conversation list is inside
that panel, so its timestamps are covered by the same rule. `listConversations`
may cross the RSC boundary — `createdAt` is an instant and serializes fine — but
nothing may *format* it on the server.

### Components

```
components/chat/
  TeacherInbox.tsx      server — listConversations(), renders InboxFab
  InboxFab.tsx          client — FAB, panel shell, view state, selection
  ConversationList.tsx  client — left pane / mobile level one
  UnclaimedNotice.tsx   client — the composer's replacement, with the invite
  ChatPanel.tsx         new — panel chrome, header slot, responsive
  Conversation.tsx      new — one conversation column
  MessageList.tsx       reworked — sticky headings, per-message time
  MessageInput.tsx      unchanged
  ChatFab.tsx           reworked — the student's single-conversation FAB
  ChatWindow.tsx        deleted — split into ChatPanel and Conversation
```

One tree, CSS-driven, no JavaScript breakpoint check — a `matchMedia` read is
another thing that differs between server and client.

- Below `md`: `fixed inset-0`. A `view` state swaps the panes. The list header
  shows X; the conversation header shows a back arrow and the student's name.
- At `md` and up: a floating `720 × 560` panel, both panes visible, X only. The
  `view` state is ignored. Still not `aria-modal`, for the reason already
  recorded: the point of a floating panel is that the page stays readable.
- Students: the same full-screen treatment below `md`, X only, no list, no back
  arrow. There is no second level for a student, so a back arrow would either do
  nothing or duplicate the X.

The unread dot is client state seeded from `Conversation.unread`. Selecting a
conversation zeroes it locally and calls `markChatRead`. A message arriving for
the conversation that is both selected and open re-stamps `markChatRead` rather
than raising the dot — one small UPDATE per message read on arrival, which is
the correct cost for a two-person tutoring app.

### Where the FAB renders

`<TeacherInbox />` is rendered by `/admin`, `/admin/pages/[slug]` and
`/g/[slug]`. It returns `null` when `getCurrentTeacher()` is empty, so a page
that renders it for both audiences needs no branch of its own.

Not on `/f/[token]`. That link is deliberately forwardable to a parent and
addresses a shelf and nothing else; rendering a teacher's inbox on it would make
a forwarded link's contents depend on who opens it. Not on `/p/[slug]`, which is
nothing but a sandboxed iframe. Not on `/login` or `/`.

## Rejected

- **One `EventSource` per student.** Browsers cap concurrent connections per
  origin at around six on HTTP/1.1, so this breaks at the seventh student, and
  it breaks by hanging rather than by erroring.
- **Polling the conversation list.** The infrastructure for live delivery
  already exists and is already open on the page.
- **Replaying every conversation on the teacher stream at connect.** Correct
  for one conversation, quadratic-feeling across all of them, and paid on every
  admin page load forever given the retention policy.
- **A `/admin/chat` route.** The FAB has to work while she is editing a card —
  that is most of why this is being built. A route would mean navigating away
  from unsaved work to answer a question.
- **A `lastMessageAt` column on `Group`.** It is the right answer at a scale
  this project will not reach, and it is a denormalisation that can drift from
  the messages it summarises. `listConversations` can be swapped to read it
  later without any caller changing.
- **Keeping day headings in UTC while showing local times.** Considered and
  rejected in the same breath: "8:02 PM" under tomorrow's date is worse than
  either alternative on its own.
- **A per-message read model.** `teacherLastReadAt` is one timestamp per
  conversation and answers every question this UI asks.
- **Hiding unclaimed students from the inbox.** The cleanest reading of the
  sign-in spec — no conversation, nothing to list. Rejected because the first
  thing Jenn does after creating a student is look for them, and an empty result
  with no explanation is indistinguishable from a broken list.
- **Letting her write to an unclaimed student anyway**, storing it until they
  claim. Tempting, and it is what the schema would happily allow. Rejected
  because the sign-in spec is right that there is nobody there: a message
  written weeks before a student first signs in is a message she will assume was
  read.
- **Shipping `chatToken` in the conversation list** so the invite link needs no
  round trip. Rejected on where the inbox renders — every teacher page, not just
  the admin — see *Read model*.

## Risks

- **pm2 must stay in fork mode.** This is the third feature to depend on it.
- **Hydration.** The client-only-after-mount rule is not enforced by a test.
  It is enforced by the panel being conditionally rendered, and a future change
  that mounts the list eagerly would break it quietly in production only.
- **This builds on top of student sign-in (2026-08-03), which is already
  shipped.** `unlocked` on `/g/[slug]` is now `gate === "signed-in"` and
  `GroupSummary` carries `email`/`claimedAt`, so both of those files look
  different from what a reader of the chat spec alone would expect. This design
  changes `unlocked`'s *uses*, never its definition. The one place the two
  documents pull against each other is *What this retires §1a*, and it is
  resolved there rather than left to whoever notices.
- **`claimed` is now load-bearing in two places** — the gate and the inbox — and
  they read the same column. If a future change adds a third notion of "signed
  up", these must be pointed at it together.
