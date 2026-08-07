# One copy each: worksheet auto-save and Send

2026-08-07

## The problem

The worksheet flow shipped on 2026-08-05 gives a student two tabs and a Save
pill. They open the blank, type into it, press Save, and on the next load find
themselves choosing between "Le devoir" and "Mes réponses" — two tabs holding
the same worksheet at two moments, one of which is now worthless to them. Every
press posts a chat message, so revising three times tells Jenn three times that
the homework is finished. And unsaved answers live in a DOM nobody has written
down until the student remembers a button in the corner.

The document a student is filling in is not a *version* of anything to them. It
is their homework. Versions are Jenn's concept, because she is the only person
who has a reason to compare two of them.

## What changes

A student sees **their own copy and nothing else** until Jenn corrects it. It
auto-saves. The pill stops meaning "write this down" and starts meaning "tell
Jenn I am finished", which is the only thing the old press did that the student
could not do for themselves.

Jenn keeps the three-slot view, because comparing is her job.

Nothing about where bytes go changes. `PageVersion` keeps
`@@unique([pageId, groupId, fromTeacher])`, the save route keeps writing the
caller's own slot from whatever view called it, and the blank is still
`Page.html` rather than a row. What changes is which tabs are drawn, whether the
shell writes without being asked, and when a chat message is posted.

**PDF worksheets are out of scope and are not touched.** A student must be able
to print the blank, so a PDF cannot lose that tab, and an upload is a deliberate
act rather than a stream of keystrokes with nothing to debounce. Their uploads
keep posting a message each. The cost is one honest inconsistency between the
kinds, stated here rather than discovered later.

## Visible slots

| State | Student sees | Jenn sees |
|---|---|---|
| Nobody has typed | their copy, seeded from the blank | the blank |
| The student has typed | their copy | the blank, Marie's answers |
| Jenn has corrected | their copy, Jenn's correction | the blank, Marie's answers, My correction |

A student never sees the blank as a tab. Their first view *is* the blank's
content, under their own label — the seed, not a tab.

`WorksheetHeading` already hides a strip of one and draws the title instead, so
a student who has typed nothing and Jenn on an untouched worksheet both get the
document's name. That rule is unchanged and now covers the common case on both
sides.

The student's maximum is two tabs and Jenn's is three. That asymmetry is the
whole design in one line.

## Who may write

- **A student writes their own copy, always, and Jenn's correction, never.**
  This is today's rule, and today's reason: the route writes the caller's slot
  from whatever view called it, so a student saving from the correction would
  file Jenn's marks as their own attempt and lose what they handed in.
- **Jenn with no correction yet writes from any tab she is on.** Her typing
  seeds the correction — from the blank, which produces an answer key, or from
  the student's attempt, which produces an annotated attempt. Both are real
  workflows and the rules file already records the choice between them.
- **Jenn with a correction writes only from her correction tab.** The blank and
  Marie's answers become read-only, and the bar says so.

That last clause exists because auto-save removes the moment of intent that the
Save pill used to supply. Under a pill, Jenn opening Marie's answers a second
time and typing was an edit she then chose to keep or abandon. Under auto-save
it is a silent write to the slot her earlier correction is in, ten seconds
later, with her first correction gone. Making the source tabs read-only is the
cheapest rule that cannot lose work: the attempt and the correction can never
overwrite each other, because at any moment exactly one of them is writable.

A read-only tab is still typeable — text fields and checkboxes are browser
behaviour, and stopping them would mean rewriting the served document. So the
bar carries a read-only marker instead. Typing that vanishes on reload is
today's behaviour on Jenn's correction as seen by a student; this states it
rather than adding it.

## Auto-save

The frame already posts `DIRTY_MESSAGE` on every `input` and `change`, captured
on `document`. The shell starts a ten-second timer on each report and restarts
it on the next, so a run of typing costs one write. When it fires, the shell
asks the frame for a snapshot over the existing `SNAPSHOT_MESSAGE` channel and
POSTs it to the route that exists today.

Ten seconds is a compromise, not a measurement: short enough that a closed
laptop loses one sentence, long enough that a paragraph is one write of a
whole-document snapshot rather than forty. A snapshot is the entire DOM, brotli
to 40–70 KB, so the write is not free.

**The first save that creates a row moves the shell in place.** The new tab is
added, and the address is rewritten with `replaceState` — no reload, so no
keystroke is lost mid-write. This matters for Jenn: she starts on Marie's
answers with no correction, and ten seconds later she is on "My correction",
holding the document she has been typing in. That is not a redirect; the frame's
DOM *is* the correction, and the address now agrees.

The browser's leave prompt stays, on the same `dirty` flag, armed while a write
is outstanding and disarmed when it lands — never before, for the reason
`onSaved` already documents. The window it guards shrinks from "since you last
pressed the pill" to "the last ten seconds", which is the point.

The save route keeps `MAX_SNAPSHOT_BYTES` and its bounded body. An over-large
document now fails every ten seconds instead of on a press, so the shell must
show that failure once and stop retrying until the document changes again.

## Send

`PageVersion` gains one nullable column, `sentAt`.

- Every save sets it to `null`.
- Send sets it to now, and posts the message the save route posts today.

The button is enabled when the caller's row exists and `sentAt` is null.
Otherwise it is disabled and reads *Envoyé* / *Sent*, with the reason in its
`title`, matching how the current pill explains its own disabled state. One more
keystroke auto-saves, which clears `sentAt`, which arms it again — so a second
send is always possible after a real change, and never possible without one.

`sentAt` is nulled on save rather than compared against `updatedAt` on purpose.
A comparison depends on two clocks written by two mechanisms in one statement —
Prisma sets `@updatedAt` itself — and the two can differ by a microsecond in
either direction, which would make the button's state a coin toss on the write
that sends it. A single nullable field has one writer per transition and
nothing to compare.

Pressing Send flushes a write the timer still holds, and posts only after it
lands. A notice about work that was never stored is worse than a late notice.

**Send is about the caller's row, not about the tab they are standing on.**
Jenn reading Marie's attempt on a read-only tab still gets a live *Send to
Marie* if her correction is saved and unsent, because the thing being sent is
the correction either way. The same is true of *Delete correction*. Only
auto-save is per-tab, because only auto-save writes.

Labels: the student's reads *Envoyer à Jenn*, Jenn's reads *Send to Marie* —
the whole name, the rule `versionLabel` already keeps.

`createMessage` moves out of the save route into the send route unchanged, with
`automated: true` and the worksheet's address as `href`. `versionNotice` is
untouched: it already says "a terminé son devoir" and "a déposé sa correction",
which described a save badly and describes a send exactly.

## Delete your own copy

One route, two labels, one rule: **it deletes the caller's own row**, the same
rule save follows, so there is nothing in the request to forge.

| | Label | Drawn when | Effect |
|---|---|---|---|
| Student | *Recommencer* | they have a saved copy | their copy goes; their tab seeds from the blank again |
| Jenn | *Delete correction* | her correction exists | her correction goes; the blank and Marie's answers become writable again |

It asks for confirmation. It is not a version history, and the row is gone.

The student's half exists because auto-save removes their way out of an inert
worksheet. A Dia worksheet answered by clicking comes back with every script
stripped and nothing left to click, which the rules file records and refuses to
fix. Under two tabs, the student went back to the blank and started again.
Under one tab, their only view is the inert copy, and without this control a
single ten-second timer would end their homework permanently.

Jenn's half exists because read-only must be reversible. One stray keystroke on
her blank tab creates a correction and locks the other two tabs, and a control
that unlocks them is useless if it is only drawn on the tab she has to know to
open first. **Hers is drawn on all three of her tabs.**

After she deletes, the student drops to one tab. The student's own answers are a
different row and are untouched. Likewise a student pressing *Recommencer*
after Jenn has corrected: her correction survives, and its source is gone —
which is what "delete my own copy" means, and why it is confirmed.

## Modules

New and pure, with tests in `tests/lib/`:

- **`lib/worksheet-slots.ts`** — `visibleSlots({ audience, hasStudent, hasTeacher })`.
  The table at the top of this document, and the only place it exists.
- **`lib/worksheet-send.ts`** — the enabled rule, and which of the three button
  states to draw. It takes facts and returns a state; it does not fetch.
- **`isWritableSlot({ slot, audience, hasTeacher })`** added beside
  `canSaveFromSlot` in `lib/worksheet-save-slots.ts`.

**Both save-slot predicates stay, in one file, and this is deliberate.**
`canSaveFromSlot` governs the PDF path, which keeps today's behaviour and lets
Jenn upload from any of her three tabs; `isWritableSlot` governs HTML, where she
is confined to her correction once one exists. They agree on the student and
disagree on Jenn, because the two kinds now differ. A comment in the file must
say which kind each serves, or the next reader will delete one as a duplicate.

Changed:

- **`components/worksheet/WorksheetShell.tsx`** — the debounce, the read-only
  state, the two new controls in place of the Save pill.
- **`app/g/[slug]/w/[pageSlug]/page.tsx`** — `slots` from `visibleSlots`, and a
  student's default slot becomes their own rather than the blank. A student
  asking for `?v=blank` is coerced to their own copy: there is no such tab, and
  a URL that draws a tab strip disagreeing with itself is worse than one that
  quietly agrees.
- **`app/api/worksheets/[slug]/[pageSlug]/route.ts`** — its `createMessage`
  block moves out. Everything else, including the slot rule and the caps, is
  untouched.
- **`app/g/[slug]/w/[pageSlug]/raw/route.ts`** — one narrow fallback. It
  currently 404s when a requested version has no row, on the stated grounds that
  answering a request for "Marie's answers" with an empty worksheet would be a
  working feature showing the wrong thing. That reasoning holds for Jenn asking
  for a slot that is not hers, and it is exactly wrong for the seed: a student
  who has typed nothing asks for `?v=student` and must receive the blank, since
  that request means "my homework" and not "a saved version". So the fallback is
  allowed **only** when the caller is a student asking for their own slot, and
  the 404 stands in every other case. Getting this backwards serves an empty
  document over saved answers, which is why the condition is on the caller and
  not on the emptiness.
- **`prisma/schema.prisma`** — one nullable column, one migration.

New routes:

- `POST /api/worksheets/[slug]/[pageSlug]/send`
- `POST /api/worksheets/[slug]/[pageSlug]/restart`

Routes rather than server actions, the reason the chat's send is a route: a
student calls both, and every action in `app/actions.ts` starts with a teacher
check. Both resolve access through `resolveWorksheet`, which reuses `chatRole`
verbatim and already refuses the everyone group before it checks anything else.

## Testing

`lib/worksheet-slots.ts`, `lib/worksheet-send.ts` and `isWritableSlot` are pure
and get a test each, covering the table above and both parties in every state —
including the two that the old design could not reach: Jenn writing from a
read-only tab, and a Send with no row behind it.

The debounce, the `replaceState` move and the postMessage plumbing live in the
shell and are not unit-tested, matching every other component here. What is
testable about them is the predicate they call, which is why the predicates are
separate modules rather than conditions inline in the shell.

The existing `canSaveFromSlot` tests stay green, unchanged, because the PDF path
they describe is unchanged.

## What this costs

- **A student cannot see the blank once they have typed.** Deliberate; that is
  the feature. *Recommencer* is the way back, and it is destructive.
- **Ten seconds of typing is losable** on a closed laptop or a dropped network.
  The leave prompt covers the deliberate exits and not the accidental ones.
- **Jenn's correction cannot be re-seeded from the attempt** without deleting
  it first. That is the same trade the read-only rule buys: no silent overwrite,
  at the price of one confirmed delete.
- **The two page kinds now notify by different rules.** An HTML worksheet
  notifies on Send; a PDF worksheet notifies on every upload. Bringing PDFs
  across is a later decision, not an oversight.
</content>
</invoke>
