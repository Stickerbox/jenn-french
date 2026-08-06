---
name: lesson-chat
description: Design rationale for lesson chat: the message model, the teacher inbox, SSE delivery, local-zone day grouping and the token/cookie model.
paths:
  - app/api/chat/**
  - app/api/inbox/**
  - lib/chat-*.ts
  - lib/inbox.ts
  - lib/inbox-*.ts
  - lib/cookie-name.ts
  - middleware.ts
  - components/chat/**
  - components/StreamProvider.tsx
  - tests/lib/chat-*.test.ts
  - tests/lib/inbox-*.test.ts
---
### Lesson chat

A `Message` belongs to a group and carries `fromTeacher` rather than a sender
id, because there are exactly two participants and one of them has no row to
point at. There is no session or lesson model: the log is continuous and
`groupByDay` (`lib/chat-day.ts`) computes the date separators, in the reader's
local zone — the one deliberate exception to the project-wide UTC rule, see
*Dates*. Retention is forever, deliberately — this is a teaching record. Jenn
can delete an individual message, and can regenerate a student's tokens from
the admin, which revokes both at once.

A message carrying a URL also files it on that student's shelf — see *Files:
pages, links and PDFs*. `MessageList` draws the same URL as a clickable link in
the bubble, through `lib/chat-linkify.ts`'s `linkifyBody`, which shares
`chat-links.ts`'s matcher and `parseLinkUrl`'s guard rather than a second one —
so the shelf and the bubble can never disagree about what counts as a link.

Jenn chats from an inbox: one FAB, on `/admin`, `/admin/pages/[slug]` and
`/g/[slug]`, rendered by `components/chat/TeacherInbox.tsx` and invisible to
anyone without a teacher session. Students on the left with an unread dot and
the last line of the thread, the selected conversation on the right; below
`md` the two become full-screen levels with a back arrow between them.
Students keep the single-conversation `ChatFab`, which gains the same
full-screen treatment and no back arrow, because they have no second level.
`/admin/[slug]` no longer exists (it was the override-card editor removed
above, and never hosted chat).

**The inbox remembers where she was.** `resolveInboxSelection`
(`lib/inbox-selection.ts`) answers what the panel opens on, from four inputs and
in this clause order: `initialSelectedId` still wins, so standing on a student's
page and pressing the FAB lands in that conversation; then a selection stored on
this device; then, at `md` and up, the first conversation in the ordered list;
then, below `md`, the list itself. An id that is no longer in the list — a
student deleted since — falls through rather than selecting a group that does
not exist, which is why both the pinned and the stored branches test membership
rather than trusting the value.

Two details are load-bearing. It is read in the **click handler**, never during
render: `InboxFab`'s button does render on the server, so a render-phase
`localStorage` or `matchMedia` read is a hydration mismatch — the same rule the
rest of this section states, reached from the other direction. And opening onto
the list on a phone must **not** call `select()`, because `select()` stamps the
conversation read: marking the first student's thread read while showing Jenn a
list would clear an unread dot she never saw.

Storage is one `chat-inbox-selection` key in `localStorage`, per device, the
precedent `chat-seen:<slug>` already set — the panel's state is a fact about
this browser, not about a student. It parses defensively and answers `null` to
anything malformed, the contract `readSections`, `readOps` and `readPageKind`
all carry.

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

A student's row in the admin carries **three icon buttons** in `Tile`'s action
slot: copy the invite link (only while unclaimed — a claimed student's invite is
spent), reset sign-in / new invite link (present in **both** claim states, label
switching, because it is the only way to revoke an invite that leaked before it
was used), and delete. The invite URL is no longer printed in a `<code>` to be
selected by hand — it was never paste-able, having no origin. It is now copied
**absolute**, built in the click handler from `window.location.origin` rather
than the `ORIGIN` env var: what she wants to send is a link to the site she is
looking at, and where those two disagree the browser is right. Building it during
render instead would be a hydration mismatch.

**The panel's own shape.** `ChatPanel` is still one tree for both sizes driven
entirely by CSS, and still must not read `matchMedia` during render. One
exception is made in an **effect**, which is safe because the panel is mounted
from an `open` state that starts `false` and so never renders on the server:
below `md` it drives its own `top` and `height` from `window.visualViewport`.
iOS Safari does not shrink a `fixed inset-0` element when the on-screen keyboard
opens — the visual viewport shrinks and the layout viewport, and so `100dvh`,
does not — which pushed the header and its X above what the reader could see, on
the device most of these students use. At `md` and up the inline style is
cleared so the floating panel's own classes take back over.

The X is now drawn in **every** state. It used to hide whenever the back arrow
showed, which left Jenn inside a student's conversation on a phone with no way
to close the panel at all without going back to the list first; back and close
are different actions. The back control is one button wrapping the arrow *and*
the title, because the arrow alone was a 14px hit target.

Message bubbles group into runs (`groupIntoRuns`, `lib/chat-run.ts`): consecutive
messages from one sender collapse, a gap over five minutes starts a new run even
from the same sender, and one timestamp is drawn per run rather than under every
bubble. It runs **inside** each day group, so `groupByDay` is untouched and still
owns the date separators.

The three animations (`panel-rise`, `panel-pop`, `bubble-in`) live as named
keyframes in `app/globals.css` and each consumer carries
`motion-reduce:animate-none`. The variant sits on the element rather than a rule
matching class names, because the duration lives inside the Tailwind utility —
a global override would have to substring-match a generated class string and
would break silently the first time a caller chose a different duration.

The header line on `/g/[slug]` is chosen by audience: `greeting` gives the
student *Bonjour Marie* in French from the first word of the name, and
`teacherPageLabel` gives Jenn *Marie Dupont's page* in English from the whole
name — her problem is telling two students apart, and two students can share a
first name. The possessive is always `'s`, including a name ending in s. The
caller suppresses both on the everyone group, which is named "Everyone" and is
nobody's page.

Each student row carries two tokens. `chatToken` unlocks the files tab and the
chat on `/g/[slug]`, but only once the student has claimed their account — on
its own it now only permits *creating* that account (see *Auth*);
`filesToken` addresses `/f/[token]` and nothing else, so
sharing a files link never hands over the conversation. As of 2026-07-31 the
admin shows only the chat link, so `filesToken` has no UI surface, though it
remains minted and rotated alongside `chatToken` and reachable only by reading
it from the database; restoring the files link means adding a control back to
the Students tab, not changing the model. The everyone group has neither, and
`chatRole` (`lib/chat-access.ts`) refuses it before it checks
anything else — not even the teacher can open a conversation there. **The
daily card stays public**: an untokened visit to `/g/marie` renders exactly
what it rendered before chat existed, which is what keeps every old bookmark
working and means a forwarded plain link leaks nothing. The everyone group's
files tab is the one deliberate exception, public without a token, because
that shelf has no conversation to protect. A wrong token is a 404, never a
403.

`middleware.ts` exists for one job: moving `?k=` out of the URL into an
httpOnly cookie, so the secret stops riding in browser history. The cookie's
*name* is per-student (`cookieNameFor(slug)`), but its path is `/` rather than
`/g/<slug>` — a path-scoped cookie would never be sent to `/api/chat/<slug>`,
so the name is what keeps students separated, not the path. `cookieNameFor`
lives in its own dependency-free `lib/cookie-name.ts`, imported by both
`middleware.ts` and `lib/student-tokens.ts`: middleware runs on the Edge
runtime, and `lib/student-tokens.ts` needs Node's `crypto` to mint tokens, so
importing it from middleware would drag `crypto` into the Edge bundle. Merging
the two modules back would break every `/g/*` request. Middleware does not
validate the token — that needs the database. The page validates what it is
handed.

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

Two details keep either stream alive behind nginx without any nginx change:
`X-Accel-Buffering: no` disables its response buffering, and a `: ping` comment
every 20 seconds stays under the default 60-second `proxy_read_timeout`.
Messages are ordered by `(createdAt, id)`, not `createdAt` alone — a review
found that two messages landing in the same millisecond made `gt createdAt`
drop the second one on every future reconnect, since a `Last-Event-ID` replay
has no other anchor to resume from.

**Both emitters are still correct only because pm2 runs this app as a single
process in fork mode.** Under cluster mode a message would reach only the
viewers on the same worker, silently. Four things now depend on that: the
chat bus, the live board, the sign-in throttle, and this stream.

**Nothing in the chat may render on the server.** Every heading and timestamp
resolves in the runtime's timezone, so an SSR pass would produce different HTML
from the hydration pass. What protects it is that both FABs mount their panel
on an `open` state that starts `false`. A change that renders a panel eagerly
breaks production and nothing else.

`listConversations` (`lib/inbox.ts`) is the single read model behind both the
inbox list and the Students tab's `· N unread` eyebrow, which reads
`teacherLastReadAt` as it always did; `unreadCounts` was removed rather than
kept beside it, because two query paths for one number are two things that can
disagree. It runs 2N queries for N students against a local SQLite file —
legible at this size; the shape to reach for if that ever changes is a
`lastMessageAt` column maintained on write.
