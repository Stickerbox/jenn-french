# Chat redesign, landing redirect, PDF previews and FAB layering — 2026-08-05

Five pieces of work, dispatched as five tasks. Wave 1 (A, B, C) is independent by
file. Wave 2 (D1, D2) depends on C having created the overlay provider.

Conventions that bind every task: logic with a rule in it goes in `lib/` with a
test in `tests/lib/`; comments record the decision and the failure that motivated
it, never a restatement of the code; `@/` import alias; Tailwind v4 with the
`--color-*` (app) and `--card-*` (flashcard) palettes; no task touches
`CLAUDE.md` — the spec text is written once at the end.

Verification for every task: `npx prisma generate` is not needed (no schema
change); `npm run lint`, `npx tsc --noEmit`, `npm test` must all pass.

---

## Decision recorded up front: one student, one token

A student has exactly one `chatToken` and therefore exactly one
`student-token-<slug>` cookie, and that never changes. Earlier text in this repo
speculated about parents holding several students' links; that is not a case this
product has. Nothing anywhere should branch on "more than one student cookie".

---

## Task A — Landing page redirects a signed-in visitor

**Files:** `app/page.tsx`, `lib/cookie-name.ts`, new `lib/landing-redirect.ts`,
new `tests/lib/landing-redirect.test.ts`.

Today `/` is a static marketing page. A student who bookmarks the domain rather
than their group link lands on Jenn's bio and has to find their way; so does
Jenn.

1. In `lib/cookie-name.ts`, extract the prefix as an exported
   `STUDENT_TOKEN_PREFIX = "student-token-"` and build `cookieNameFor` from it.
   **That module must stay dependency-free** — middleware runs on the Edge
   runtime and importing anything with Node's `crypto` behind it breaks every
   `/g/*` request. A bare string constant is safe.
2. New `lib/landing-redirect.ts`, pure:
   - `STAY_PARAM = "stay"` and `STAY_VALUE = "1"`.
   - `studentSlugFromCookies(names: string[]): string | null` — the slug of the
     first name carrying the prefix, or null. One student means one cookie, so
     there is nothing to disambiguate; the function takes the first match and
     does not look for a second.
   - `wantsLanding(stay: string | string[] | undefined): boolean` — true when the
     escape hatch is set.
   Test both in `tests/lib/landing-redirect.test.ts`, including a cookie jar
   holding unrelated names (`teacherId`, `webauthn-challenge`).
3. `app/page.tsx` becomes an async server component taking
   `searchParams: Promise<{ stay?: string }>`:
   - If `wantsLanding(stay)`, render the page unchanged.
   - Else, `getCurrentTeacher()` (`@/lib/session`) — non-null → `redirect("/admin")`.
   - Else, `studentSlugFromCookies([...(await cookies())].map(c => c.name))`; if a
     slug comes back, load that group (`prisma.group.findUnique`, selecting
     `slug`, `chatToken`, `passwordHash`) and redirect to `/g/${slug}` **only
     when the presented cookie value equals `chatToken` and `passwordHash` is
     non-null** — i.e. only for the state `studentGate` calls `signed-in`. A
     stale or unknown cookie falls through to the landing page rather than
     bouncing someone into a sign-in form they did not ask for, and a deleted
     group cannot produce a 404 in place of the marketing page.
   - Anything else renders the page.
   Comment the accepted cost: reading cookies makes `/` dynamic, so the
   landing page is server-rendered per visit instead of static. That is
   affordable for a single-tutor site and is what buys correctness — a
   middleware version could not reach the database to tell a live token from a
   stale one.
4. The escape hatch has to be reachable. Add a small link beside the existing
   *Se connecter* pill — same visual treatment, reading **Voir la page
   publique** — rendered **only when a redirect would otherwise have fired**, so
   a plain visitor never sees a link about a page they are already on. It points
   at `/?stay=1`.

---

## Task B — A student's PDF upload gets a preview

**Files:** `components/pdf-thumbnail.ts`, `components/student/ShelfFab.tsx`,
`components/admin/ThumbBackfill.tsx`, `app/admin/page.tsx`,
`app/page-actions.ts` (comment only).

The server storage path and the shelf read path are both correct; the JPEG is
simply never produced on the student's phone. Two causes, both fixed here.

1. **The timeout covers the download of pdf.js itself.** `renderPdfThumbnail`
   races `render(file)` — which begins with `await import("pdfjs-dist")` — against
   a single 10-second budget. On weak LTE, fetching the renderer and its worker
   is most of a megabyte and eats the whole budget before a page is ever drawn.
   Split it: load pdf.js under its own generous budget
   (`LOAD_TIMEOUT_MS = 30_000`), then race the actual render against
   `RENDER_TIMEOUT_MS = 10_000`. Both still resolve `null` rather than throwing —
   **the total contract is unchanged and must stay unchanged: never throws, never
   rejects, `null` means "draw the glyph".**
2. **The upload must not wait for a slow render.** In `ShelfFab.submitPdf`,
   `await thumbJob.current` is currently unbounded, so on the connection that
   caused this bug the student presses *Enregistrer* and waits on a preview.
   Cap it: race the job against a short timer (`THUMB_WAIT_MS = 3_000`) and
   upload without a thumbnail if it has not finished. Comment why the number is
   small: the render starts at staging, while they read the title field, so
   three more seconds is a grace period rather than the budget; and anything
   missed is picked up by the backfill below. Leave `NewPageForm` alone — Jenn
   uploads from a desktop and the existing await is correct there.
3. **A backfill for whatever still fails.** `ThumbBackfill` covers html pages
   with no stored preview; extend it to pdf rows, which is exactly the set a
   student's failed render leaves behind.
   - `app/admin/page.tsx`: `missingThumbs` currently filters
     `readPageKind(page) === "html" && page.thumbAt === null`. Widen it to both
     kinds and carry the kind through: `{ slug, version, kind }`.
   - New `renderAndStorePdfThumbnail(slug: string): Promise<boolean>` in
     `components/pdf-thumbnail.ts` — the impure module is the right home, beside
     `renderPdfThumbnail` and for the same reason it is not in `lib/`. It fetches
     `/p/${slug}/pdf`, wraps the blob as a `File`, renders it through the
     existing `renderPdfThumbnail`, and stores it through the existing
     `setPageThumb` server action in a `FormData` under the field name `thumb`.
     Returns false on any failure, silently — same contract as
     `captureAndStoreThumbnail`.
   - `ThumbBackfill` dispatches on `kind`, still **one at a time** and still
     capped at `PER_VISIT`. The serial rule is not an optimisation: it is what
     keeps a page of tiles from running a dozen renderers at once.
   - `setPageThumb`'s comment in `app/page-actions.ts` says it stores "a captured
     preview of an html page". Correct it: it stores a preview for either kind,
     and it is still teacher-only, and a student's own PDF thumbnail still
     arrives inside its own upload's FormData under `requireShelfRole`. **No
     authority changes.**

---

## Task C — Two fixed buttons must not paint over an open overlay

**Files:** new `components/ui/OverlayProvider.tsx`, `components/ui/Fab.tsx`,
`components/ui/AddSheet.tsx`, `components/ui/AddMenu.tsx`,
`components/student/ShelfFab.tsx`, `app/layout.tsx`.

Two reported bugs, one cause. `Fab` is `fixed z-50`; `AddSheet` and `ChatPanel`
are also `z-50` and render *before* the FAB in the same tree, so the FAB wins on
document order. On a phone the `+` lands on top of the PDF sheet's *Ajouter*
button, and both FABs sit on top of the full-screen chat.

Raising z-index alone is not the fix asked for: over a dimmed backdrop the button
would still be visible, just behind the card. The buttons should be **gone**.

1. `components/ui/OverlayProvider.tsx` — a client context holding a count of open
   full-screen-or-modal overlays, with `useOverlayLock()` (registers on mount,
   releases on unmount, via `useEffect`) and `useOverlayCount()`. The default
   context value is `0` with no-op registration, so a `Fab` rendered outside a
   provider behaves exactly as it does today. This is UI plumbing rather than a
   rule, so it stays in `components/` and gets no `lib/` module and no unit test —
   say so in a comment, because the convention otherwise reads as broken here.
2. Mount `OverlayProvider` in `app/layout.tsx` around `children`, so every FAB
   and every overlay on every route is inside one.
3. `Fab` reads `useOverlayCount()` and adds `hidden md:flex` when it is above
   zero. **Below `md` only** — at desktop size the chat panel floats at
   `bottom-24 right-4` with the page readable behind it, and the FAB is the
   control that closes it, so hiding it there would strand the panel.
4. `AddSheet` calls `useOverlayLock()` and moves to `z-[60]`. `AddMenu`
   deliberately does **not** lock and stays at `z-50`: the FAB is its anchor and
   the menu reads as hanging off it.
5. `ShelfFab` needs no change of its own beyond whatever Task B does to it — the
   lock lives in `AddSheet`, which it already renders.
6. `ChatPanel` is wired in Task D1, not here. Do not edit it.

---

## Task D1 — The chat panel: animation, header, and the mobile keyboard

**Files:** `components/chat/ChatPanel.tsx`, `app/globals.css`.
**Depends on Task C** for `useOverlayLock`.

`ChatPanel` is one tree for both sizes driven entirely by CSS, and it must stay
hydration-safe — **no `matchMedia` read during render**. Effects are fine: the
panel is only ever mounted from an `open` state that starts `false`, so it never
renders on the server.

1. **Keyframes in `app/globals.css`**, named exactly so Task D2 can use them:
   - `panel-rise` — from `translateY(16px)` + `opacity: 0` to neutral. Mobile.
   - `panel-pop` — from `scale(.97)` + `opacity: 0` to neutral, origin
     bottom-right. Desktop.
   - `bubble-in` — from `translateY(6px)` + `opacity: 0` to neutral, ~180ms.
   - Wrap all three in a `@media (prefers-reduced-motion: reduce)` block that
     collapses them to a plain opacity fade at 1ms. Motion is decoration; a
     reader who has asked for none must still get a working panel.
2. Apply `panel-rise` below `md` and `panel-pop` at `md` and up (Tailwind
   arbitrary `animate-[…]` with a `md:` variant).
3. **The X is always visible.** Today it carries `onBack && "hidden md:block"`,
   so on a phone Jenn inside a student's conversation has no close control at
   all — she has to go back to the list first. Drop that rule: back and close are
   different actions and both belong in the header.
4. **The back control is one button wrapping the arrow and the title**, with real
   padding around both — the whole `← Marie Dupont` is the hit target, not a
   14-pixel glyph. When there is no `onBack`, the title stays a plain `<span>`
   exactly as now. Keep `md:hidden` on the back affordance: at desktop size both
   panes are on screen and there is nowhere to go back to.
5. **Touch targets:** the X gets at least a 44px box (`-m-2 p-2` around the glyph
   or equivalent) and a visible pressed/hover state. It is currently a bare `×`
   at `text-lg`.
6. **The keyboard must not push the X off screen.** Below `md` the panel is
   `fixed inset-0`, and iOS Safari does not reliably shrink that when the
   keyboard opens — the composer and the header get pushed out of the visual
   viewport. In an effect, when `window.visualViewport` exists and
   `window.matchMedia("(min-width: 768px)").matches` is false, subscribe to its
   `resize` and `scroll` events and drive the panel's height and vertical offset
   from `visualViewport.height` and `visualViewport.offsetTop`. Clean the
   listeners up on unmount and clear the inline styles at `md` and up. Comment
   the *why*: `100dvh` alone does not account for the on-screen keyboard on iOS,
   which is the device most of these students are on.
7. The composer sits at the bottom of that box, so pad it for the home
   indicator: `env(safe-area-inset-bottom)`.
8. Call `useOverlayLock()` from Task C's provider, and raise the panel to
   `z-[60]` — so the two FABs disappear below `md` while it is open, which is the
   second reported bug.
9. Keep everything else: `role="dialog"`, the Escape handler, the focus on mount,
   the deliberate absence of `aria-modal` at desktop size, the `min-h-0` on both
   flex children, and the `aside ? md:w-[720px] : md:w-[380px]` split.

---

## Task D2 — The conversation itself: bubbles, composer, list

**Files:** `components/chat/MessageList.tsx`, `components/chat/MessageInput.tsx`,
`components/chat/Conversation.tsx`, `components/chat/ConversationList.tsx`, new
`lib/chat-run.ts`, new `tests/lib/chat-run.test.ts`.
**Do not touch `app/globals.css` or `ChatPanel.tsx`** — Task D1 owns both. Use the
keyframe names it defines.

The reference is a modern tutoring messenger (Preply): generous padding,
grouped runs of messages, one timestamp per run rather than one per bubble, a
send control that is obviously a button, and large touch targets throughout.

1. **`lib/chat-run.ts` — the grouping rule, pure, with a test.**
   `groupIntoRuns(messages: ChatMessage[]): { fromTeacher: boolean; messages:
   ChatMessage[] }[]` — consecutive messages from the same sender collapse into
   one run, and a gap longer than `RUN_GAP_MS` (5 minutes) starts a new one even
   from the same sender. It runs *inside* a day group, so `groupByDay` is
   unchanged and still owns the date separators. Test: a single message, two from
   the same sender close together, two from the same sender far apart, an
   alternating thread, and an empty array.
2. **`MessageList`** renders `groupByDay(...)` then `groupIntoRuns(...)` inside
   each day.
   - Bubbles in a run are tight together (`gap-0.5`); runs are separated
     (`gap-4`).
   - Rounded `2xl`, with the corner nearest the run's tail squared off
     (`rounded-br-md` on the last of a sent run, `rounded-bl-md` on the last of a
     received run) — the bubble tail every messenger uses, without an SVG.
   - **One timestamp per run**, under its last bubble, keeping the existing
     `<time dateTime={…isoString}>` so the machine-readable instant stays
     unambiguous while the visible value stays local.
   - Padding up from `px-4 py-3` to `px-4 py-5`, and bubbles from `px-3.5 py-2`
     to `px-4 py-2.5` with `leading-relaxed`.
   - New bubbles animate in with `bubble-in`. **Only genuinely new ones** — apply
     the animation class unconditionally on the element and let React's keying do
     the work; a re-render of an existing message must not replay it, so the
     class must live on the keyed message element and nothing may remount the
     list.
   - Keep the header comment about never rendering on the server, keep
     `todayKey` read during render, keep the sticky day heading and its reason,
     keep the delete button's behaviour (hover-revealed, teacher only) but give
     it a real hit box.
   - Nicer empty state: the existing sentence, centred, with a muted chat glyph
     above it.
3. **`MessageInput`**
   - The send control becomes an obvious circular button carrying a paper-plane
     icon, at least 44px, in `--color-accent`, with a clearly distinct disabled
     state (not just `opacity-40`). Keep `sendLabel` as its `aria-label` so the
     accessible name does not regress when the text leaves the button.
   - A subtle press/active transform, and a focus ring on the textarea that reads
     as focus rather than a border colour change.
   - Keep Enter-sends / Shift+Enter-newlines and keep the optimistic clear with
     the restore-on-failure — both are documented decisions.
   - Keep `text-base` on the textarea: anything smaller makes iOS Safari zoom the
     page on focus.
   - Auto-grow the textarea up to its existing `max-h-32`.
4. **`ConversationList`**
   - Rows get an initials avatar in a soft accent circle, `py-3.5`, and the name
     and preview line laid out beside it.
   - Keep the unread **dot** rather than a count — the count lives on the
     Students tab and this list answers "who", not "how many" — and keep the
     `sr-only` unread text, since the dot is `aria-hidden`.
   - Keep the ordering-then-filtering rule and its comment, keep `now` read
     during render and its reason, keep the no-SSR note.
5. **`Conversation`** stays presentational and keeps its comment; it changes only
   if the composer/footer swap needs different spacing.

---

## After all five: verification and documentation

Run `npm run lint`, `npx tsc --noEmit`, `npm test`, `npm run build` — in that
order, all four green — before anything is claimed as done.

Then write the spec and update `CLAUDE.md`: the landing redirect and its escape
hatch under *Routes*; the one-student-one-token rule under *Auth*, replacing the
text that implies a link may be shared with a parent who then holds several; the
two-stage PDF thumbnail timeout and the pdf backfill under *Files*; the overlay
provider under the *Two fixed buttons share the bottom-right corner* convention;
and the chat panel's viewport handling and run-grouping under *Lesson chat*.
