# Chat redesign, landing redirect, PDF previews and FAB layering — 2026-08-05

Five pieces of work in one pass. Three came from bug reports taken on a phone,
two from the owner. The implementation plan is
`docs/superpowers/plans/2026-08-05-chat-redesign-and-fixes.md`.

## 1. The landing page redirects a signed-in visitor

`/` was Jenn's bio and nothing else, so a student who bookmarked the domain
rather than their group link arrived at a page that was not for them, and so did
Jenn.

**One student has one token and one cookie.** That is a product fact and it is
what makes this simple: `studentSlugFromCookies` takes the first
`student-token-*` cookie it finds and does not look for a second. Text in this
repo that implied one browser might hold several students' links has been
corrected — it was never a case this product has.

The page still **validates before it redirects**, and only the `signed-in` state
of `studentGate` qualifies: the presented value equals the live `chatToken` and
`passwordHash` is non-null. Anything else falls through to the landing page. A
stale cookie must not bounce someone into a sign-in form they did not ask for,
and a deleted group must not turn the marketing page into a 404.

The escape hatch is `/?stay=1`, linked as *Voir la page publique* and drawn only
when a redirect would otherwise have fired. Without it Jenn could never look at
her own public page from her own browser.

**Rejected: doing this in middleware.** It would have kept `/` static. It cannot
reach the database — the Edge runtime — so it could not tell a live token from a
spent one, and would have redirected on cookie presence alone. Correctness won;
the cost is that `/` is dynamic, which for a single-tutor site is nothing.

## 2. A student's PDF upload gets a preview

Reported as "when a student uploads a PDF, it doesn't look like a preview is
generated". The server write path and the shelf read path were both correct, so
the JPEG was simply never produced in the student's browser.

**Cause: one timeout covering two different things.** `renderPdfThumbnail` raced
`render(file)` — which *begins* with `await import("pdfjs-dist")` — against a
single ten-second budget. pdf.js and its worker are most of a megabyte. On the
weak LTE the report came from, downloading them spent the entire budget before a
page was ever drawn, and every such student got the glyph for a document that
would have rendered fine.

Three changes, and the third is what makes the first two safe to be imperfect:

- `LOAD_TIMEOUT_MS` (30 s) covers the import. `RENDER_TIMEOUT_MS` (10 s) covers
  only the decode and draw.
- `ShelfFab.submitPdf` caps its wait at `THUMB_WAIT_MS` (3 s) instead of
  awaiting the job unbounded. The render starts at *staging*, while the student
  reads the title field, so this is a grace period rather than the budget — and
  a preview must never hold up the document it decorates. `NewPageForm` keeps
  its full await: Jenn uploads from a desktop.
- `ThumbBackfill` now covers pdf rows as well as html ones, through
  `renderAndStorePdfThumbnail`. It fetches the stored bytes back through the
  public `/p/[slug]/pdf`, renders them in the admin browser, and stores the JPEG
  through the existing teacher-only `setPageThumb`.

**No authority changed.** A student's own thumbnail still arrives inside its own
upload's FormData under `requireShelfRole`; the backfill only ever runs in
Jenn's admin. The total contract on `renderPdfThumbnail` is unchanged and must
stay unchanged: never throws, never rejects, `null` means "draw the glyph".

There is still no backfill *script*, for either kind. One would need the
server-side renderer this design refuses. The browser doing the work is the
point.

## 3. Two fixed buttons must not paint over an open overlay

Two screenshots, one cause. `Fab` is `fixed z-50`; `AddSheet` and `ChatPanel`
were also `z-50` and render *earlier* in the same tree, so the buttons won the
document-order tiebreak. On a phone the `+` landed on top of the PDF sheet's own
*Ajouter* button, and both buttons sat on top of the full-screen chat.

Raising z-index alone was not the fix asked for. Over a dimmed backdrop the
button would still be visible, merely behind the card; the ask was that it be
gone. So both overlays moved to `z-[60]` **and** call `useOverlayLock`
(`components/ui/OverlayProvider.tsx`, mounted in `app/layout.tsx`), and `Fab`
hides itself while the count is above zero.

**Below `md` only.** At desktop size the chat panel floats with the page
readable behind it and the FAB is the control that closes it, so hiding it there
would strand the panel with no way out but Escape.

`AddMenu` deliberately does not lock — the FAB is its anchor and the menu reads
as hanging off it.

The provider gets no `lib/` module and no unit test. It is a shared counter, not
a domain rule. That is a deliberate exception to "logic belongs in `lib/`",
recorded in the file so it does not read as an oversight.

## 4. The chat, redesigned

The owner's assessment was that it was ugly: cramped, with a send control that
did not read as a button, a timestamp under every single bubble, and small touch
targets. The reference is a modern tutoring messenger (Preply).

**The panel.** It opens with motion now — `panel-rise` below `md`, `panel-pop`
at `md` and up — and every consumer carries `motion-reduce:animate-none`. The
variant sits on the element rather than in a rule matching class names: the
duration lives inside the Tailwind utility, so a global override would have to
substring-match a generated class string and would break silently the first time
a caller chose a different duration. That was the first attempt and it was
replaced.

**The keyboard.** iOS Safari does not shrink a `fixed inset-0` element when the
on-screen keyboard opens — the visual viewport shrinks and the layout viewport,
and so `100dvh`, does not — which pushed the header and its X above what the
reader could see, on the device most of these students use. Below `md` the panel
drives its own `top` and `height` from `window.visualViewport`, in an **effect**.
That is safe only because the panel mounts from an `open` state that starts
`false` and so never renders on the server, which is the same rule that keeps
the whole chat hydration-safe.

**The X is drawn in every state.** It used to hide whenever the back arrow
showed, which left Jenn inside a student's conversation on a phone with no way
to close the panel without first going back to the list. Back and close are
different actions and both belong in the header. The back control is now one
button wrapping the arrow *and* the student's name, with padding: the arrow
alone was a 14px hit target.

**Runs, not bubbles.** `groupIntoRuns` (`lib/chat-run.ts`) collapses consecutive
messages from one sender, and a gap over five minutes starts a new run even from
the same sender. One timestamp per run. It runs **inside** each day group, so
`groupByDay` is untouched and still owns the date separators — and the
local-timezone rule the *Dates* section carves out for chat is unaffected.

**The composer.** The send control is a 44px circular button with a paper-plane
icon, with `sendLabel` moved to `aria-label` so the accessible name did not
regress when the text left the button, and a disabled state that is a different
colour rather than 40% opacity. `text-base` on the textarea is kept, because
anything smaller makes iOS Safari zoom the page on focus.

## 5. The inbox remembers where Jenn was

Asked for after the rest was built: the inbox reset to nothing on every open.

`resolveInboxSelection` (`lib/inbox-selection.ts`) answers what the panel opens
on, in this clause order — `initialSelectedId` (standing on a student's page)
wins, then a selection stored on this device, then the first conversation at
`md` and up, then the list below `md`. An id no longer in the list, because the
student was deleted, falls through rather than selecting a group that does not
exist; both branches test membership rather than trusting the value.

Two details are load-bearing.

- It is read in the **click handler**, never during render. `InboxFab`'s button
  does render on the server, so a render-phase `localStorage` or `matchMedia`
  read is a hydration mismatch.
- Opening onto the list on a phone must **not** call `select()`, because
  `select()` stamps the conversation read. Marking the first student's thread
  read while showing Jenn a list would clear an unread dot she never saw.

Storage is one `chat-inbox-selection` key, per device, following
`chat-seen:<slug>` — the panel's state is a fact about this browser, not about a
student. It parses defensively and answers `null` to anything malformed, the
contract `readSections`, `readOps` and `readPageKind` all carry.
