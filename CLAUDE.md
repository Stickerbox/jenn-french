# CLAUDE.md

!! Always talk in ASD-STE100 Simplified Technical English. !!

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A daily French flashcard site for a single tutor (Jenn) and her students. Students
open a bookmarked group link and see that day's card; the teacher writes cards from
an admin area behind a passkey. Live at https://francaisavecjenn.ca.

## Commands

```bash
npm run dev            # next dev
npm run build          # next build
npm run lint           # eslint .
npm run typecheck      # tsc --noEmit
npm test               # vitest run

npx vitest run tests/lib/week.test.ts        # one file
npx vitest run -t "clamps future dates"      # one test by name
npx prisma generate                          # after any schema.prisma change
npx prisma migrate dev --name <name>         # create + apply a migration
```

`happy-dom` is a devDependency for exactly one file, `tests/lib/snapshot-dom.test.ts`, opted
into with a per-file `@vitest-environment happy-dom` docblock rather than a
config change — the global environment stays `node`, which every other test in
the suite runs against and none of them needs a DOM.

CI (`.github/workflows/ci.yml`) runs, in order: `prisma generate` → lint → `tsc
--noEmit` → test → build. Run those locally before claiming work is done.

Env vars live in two gitignored files: `.env` holds `DATABASE_URL`
(`file:./dev.db`), `.env.local` holds `RP_ID`, `ORIGIN`, `ANTHROPIC_API_KEY`,
`PAGES_UPLOAD_TOKEN`. Prisma reads `.env`; Next.js reads both.

## Routes

| Route | Who | Notes |
|---|---|---|
| `/` | public | landing page — **but a signed-in visitor is redirected off it**: a teacher session goes to `/admin`, a live student cookie to that student's `/g/[slug]`. `/?stay=1` is the escape hatch and renders the page for anyone; the link to it is drawn only when a redirect would otherwise have fired |
| `/g/[slug]` | students | the card for `?date=` (public); `?tab=files`, `?tab=board` and the student's own chat need the student to be signed in — a valid `chatToken` cookie **and** a claimed account — teacher included, who once unlocked also gets *Nouveau tableau* and a delete per board — except the everyone group, whose files are public and which has neither chat nor whiteboard. **Jenn's own chat is her inbox FAB and follows her session, not the token** — the only thing on this page that does, and it carries the delete and read-marker controls with it. Everything the gate controls is unchanged. Both extra tabs are present for anyone unlocked, empty state and all. **An unlocked teacher has no card tab** and lands on Files; an untokened teacher is just a visitor and still gets the public card. Adding to the shelf is a `+` FAB left of the chat button, present on every tab, and either party may pin a page. **Its menu depends on who is looking**: a student gets *Ajouter un lien* and *Ajouter un PDF*, Jenn gets *Add a link*, *Add a page* and *Add a PDF* — she keeps the full admin menu on the one screen where "put this on Marie's shelf" is the obvious act, and the student loses the HTML paste box, because they may upload a PDF and not a website. `addShelfPage` keeps its guard and its tests; what changed is which control is drawn. Jenn also gets a pencil on each editable tile. The card tab carries the week's five day dots, a week-range line that opens a month calendar, and *Aujourd'hui*; a day with no card cannot be selected. The shelf's kind and sort chips sit behind a filter icon, closed by default, with a dot on the icon — and an `sr-only` *Filtres actifs* / *Filters active* beside it, following `ConversationList`'s unread-dot precedent — while a hidden filter is narrowing the list (`lib/shelf-filters.ts`); the admin Pages tab deliberately keeps its rows visible, because its student chip also decides pin target and default audience. A teacher session also adds a *← Back to admin* link and turns the header line into *Marie Dupont's page* in place of the student's *Bonjour Marie*, and **suppresses `LiveBanner`** — she is the only person who can be drawing. Two more tabs as of 2026-08-07, both gated on `unlocked` like Files and Whiteboard. **Vocabulaire** is a deck of two-sided cards either party may add and delete, opened in a full-screen overlay that reuses the daily card's flip; it sorts by Ajout, Aléatoire or À réviser (`lib/flashcard-order.ts`). It is called *Vocabulaire* and not *Les cartes* because the daily-card tab is *La carte* and two adjacent tabs one letter apart is a trap. The overlay takes focus on open and traps Tab: `aria-modal` is a hint to assistive tech and does nothing to the tab order, so without it Shift+Tab reached the deck tile painted underneath and re-stamped another card's `lastViewedAt`. **À faire** is one shared checklist — either party adds, ticks and deletes, and a done row is struck through **in place** rather than moved, so an accidental tick is easy to undo. Both use `chatRole`, so the everyone group has neither. The tab strip scrolls horizontally now: three tabs fit a phone and five do not |
| `/signin` | students | sign in with an email address and a password, from anywhere |
| `/login` | teacher | passkey register/authenticate |
| `/admin` | teacher | three tabs via `?tab=` — the global card for `?date=` (default), groups, pages. **The everyone group is not drawn as a student on any of them** as of 2026-08-07: no row in Students, no chip on Pages. It keeps one pill in the three audience forms, labelled *All students* from the dictionary rather than from `Group.name` — see `lib/audience.ts`. The consequence is that the admin has no link to `/g/all`; shared pages are found under any student's chip, which `filterPagesByGroup` already widens for exactly that reason |
| `/p/[slug]` | public | an uploaded HTML page, in a sandboxed iframe; a pdf row renders `PdfShell` over `PdfDocumentView` — pdf.js rasterises each page onto its own canvas in-site rather than redirecting out to the browser's own viewer, still never in an iframe |
| `/p/[slug]/pdf` | public | the raw PDF bytes — `/p/[slug]`'s byte source and its fallback on a render failure |
| `GET /p/[slug]/thumb` | public | a page's cached preview picture — a pdf's first page, or an html page's captured top |
| `/f/[token]` | students | that student's files, at an opaque unguessable link |
| `/admin/pages/[slug]` | teacher | edits one uploaded page |
| `POST /api/pages` | token | publishes a page from outside the browser |
| `POST /api/chat/[slug]` | token or teacher | send one message |
| `GET /api/chat/[slug]/stream` | token or teacher | the SSE stream |
| `GET /api/inbox/stream` | teacher | every conversation on one stream, plus `?board=` |
| `POST /api/whiteboard/[slug]/finish` | teacher | saves a whole board |
| `POST /api/whiteboard/[slug]/open` | teacher | starts a live board |
| `POST /api/whiteboard/[slug]/ops` | teacher | appends and fans out ops |
| `POST /api/whiteboard/[slug]/discard` | teacher | drops a live board, saving nothing |
| `GET /api/whiteboard/[slug]/[id]` | token or teacher | a board's ops, for the JPEG export |
| `/g/[slug]/w/[pageSlug]` | student or teacher | an html worksheet gets the worksheet shell: full-screen frame, version switcher, print pill, and — in place of the Save pill it carried until 2026-08-07 — a ten-second debounced auto-save with a *Send* notice and a delete beside it. A pdf worksheet gets `PdfShell` over `PdfDocumentView` instead — the same version tabs, a back control, and `UploadVersion`, and **it keeps the old flow whole**: three tabs for both parties, and an upload that notifies on its own |
| `GET /g/[slug]/w/[pageSlug]/raw` | student or teacher | `?v=blank\|student\|teacher`; the document, under `SANDBOXED_DOCUMENT_CSP` |
| `GET /g/[slug]/w/[pageSlug]/pdf` | student or teacher | `?v=blank\|student\|teacher`; the raw PDF bytes for that slot — the pdf worksheet view's byte source and its fallback on a render failure |
| `POST /api/worksheets/[slug]/[pageSlug]` | student or teacher | saves the caller's own slot |
| `POST /api/worksheets/[slug]/[pageSlug]/send` | student or teacher | announces the caller's own row; 204, or 400 `"Nothing to send."` with no row |
| `POST /api/worksheets/[slug]/[pageSlug]/restart` | student or teacher | deletes the caller's own row |
| `/api/auth/*` | — | WebAuthn ceremonies (server actions everywhere except here, `/api/pages`, `/api/chat/*`, `/api/inbox/*`, `/api/whiteboard/*`, `/api/worksheets/*`, and `/p/[slug]/raw`) |

## Architecture

### Cards

A card belongs to a date, and every student sees the same one: `getEffectiveCard`
(`lib/cards.ts`) reads the `GlobalCard` row for that date and takes no student
or group id at all. A date with no row resolves to `null` and the page says
nothing was posted — it deliberately does **not** fall back to an earlier day,
because that made the week picker lie.

Per-student overrides used to exist — a `Card` model unique on `(groupId, date)`,
a `pickEffectiveCard` resolution rule, and an `/admin/[slug]` route to edit one —
and were removed on 2026-07-31 with zero rows in either database, so nothing was
lost. `getEffectiveCard` took a group id before that and preferred the override;
if you find a reference to one of those names, or to `getArchiveDates` or
`mergeArchiveDates` (dead code that queried the dropped table and was deleted
with it), that is why — not a bug.

### Card sections

The body of a card is `sections: Json?` — an array of `{title, body}` the teacher
orders herself (`lib/sections.ts`). The older scalar columns
(`examples`, `pronunciation`, `tip`, `idiom`) are still in the schema and are
intentionally left untouched: `toUpdateData` in `app/actions.ts` omits them so they
remain a rollback path. `toCreateData` must still supply `examples: ""` because the
column is non-nullable. Don't "clean up" either of these without deciding to give up
the rollback.

Everything read out of the `sections` column goes through `readSections`, which
discards malformed entries rather than throwing — Prisma types a Json column as
`JsonValue`, i.e. not at all. Everything written goes through `normaliseSections`.

Two section titles are load-bearing: `IDIOM_TITLE` ("Idiom of the day") selects the
gold box on the card back, and `PRONUNCIATION_TITLE` is seeded empty on new cards.
The idiom box is matched **on the title**, not on the shape of the text — a previous
content-driven rule silently dropped styling from existing cards.

### Dates

Every date is UTC midnight, constructed as ``new Date(`${str}T00:00:00Z`)``, and
formatted with `timeZone: "UTC"`. The teaching week runs Monday–Friday; both
Saturday and Sunday belong to the week that just ended (`lib/week.ts`).
`mondayOf` is where that rule lives and `weekDates` returns the five teaching
days of any date's week. `lib/month-grid.ts` keeps its own copy of the same
arithmetic on purpose — it steps over the weekend while walking a whole month,
which is a different job.

One deliberate exception, added 2026-08-04: **chat message grouping and
timestamps are in the reader's local zone**, not UTC. `lib/chat-time.ts` is the
only module here that omits `timeZone: "UTC"`, and `groupByDay` keys on its
`localDayKey`. A card belongs to a teaching day Jenn picked; a message belongs
to the moment someone typed it, and "8:02 p.m." under tomorrow's date is not
consistency. The consequence: a message's day heading depends on who is reading
it, and nothing in the chat may render on the server — see *Lesson chat*.

The student page clamps `?date=` to `latestViewableDate(today)` so students cannot
read ahead of pre-posted cards. `parseAdminDate` deliberately does *not* clamp —
pre-posting is the teacher's workflow, and clamping would make those days
unreachable from `/admin`. It does, however, snap a weekend date forward to the
following Monday, including its `today` fallback, so `/admin` never opens on a
non-teaching day; the five-column calendar is the UI half of the same rule.

Two more things enforce the same bound now that the card page has a calendar
students can page through. `listCardDates` (`lib/cards.ts`) filters to
`<= latestViewableDate(today)` **in the query**, so the dates of pre-posted
cards never reach the browser at all, and `isSelectableCardDate`
(`lib/card-dates.ts`) re-checks it, because the calendar can page into a month
the query said nothing about. A day with no card is disabled rather than absent:
a calendar missing a Tuesday reads as a rendering fault. One value —
`latestViewableDate(today)` — is both that ceiling and the day *Aujourd'hui*
goes to, passed as a single prop because they are the same rule; on a weekend
that is the Friday that closed the week, so the button appears to do nothing if
you push the real Saturday and let `parseDate` clamp it back.

### Auth

Exactly one teacher and exactly one passkey. `register-begin` returns 400 once a
passkey exists, and there is no UI to add a second or remove one — transferring the
account means deleting the `Passkey` row on the server (see `docs/DEPLOYMENT.md`).
The session is a 7-day httpOnly cookie holding the teacher id (`lib/session.ts`);
deleting the passkey does not invalidate it.

Students sign in with an email address and a password, on `/g/[slug]` itself.
`?k=<chatToken>` is no longer a key: it is a **single-use invitation** that
permits creating the account, and the first sign-in is the sign-up. Claiming
**rotates `chatToken`**, which spends the invitation — without that rotation,
`unlocked` (`holdsToken && claimed`) would admit anyone still holding a
forwarded copy of the same link, with no password. `filesToken` is not rotated
on claim, only on reset.

`studentGate` (`lib/student-gate.ts`) decides which of six states a visitor is
in, and its clause order is the specification — see the comments. Two clauses
exist for Jenn specifically: she must never be shown a sign-up form she could
complete on a student's behalf, and after a claim her stored cookie is stale, so
she is told to reopen the student from the admin rather than shown a student
sign-in form.

`authPanelMode` sits beside it and answers a narrower question — which form, if
any, to render — and returns `null` for the teacher in every state. That is not
cosmetic: the panel's signed-in mode is *Se déconnecter*, and `signOutStudent`
clears the **student's** cookie for that slug, which is the cookie `unlocked` is
derived from, so the control offered her a way to lock herself out of the Files
and Whiteboard tabs. It is a predicate rather than a seventh gate state because
`unlocked` compares against `signed-in` and a new state would have to be added
to that comparison too.

`unlocked` is derived from the gate and still never consults the
teacher session, which means **she cannot open the chat or a board for a student
who has not signed up yet**. That is deliberate: there is nobody on the other
end. Pages can still be assigned and pinned to that student from the admin.

Passwords are bcrypt, cost 12, through `lib/password-hash.ts` — **the async API
only**, because one pm2 fork process serves every SSE stream and a synchronous
hash would stall the `: ping` heartbeats. The 72-byte cap in
`lib/student-credentials.ts` is not cosmetic: bcrypt silently truncates past it,
and `tests/lib/password-hash.test.ts` pins that behaviour so the cap is not
"cleaned up" later. Sign-in failures are one message that names both fields, an
unclaimed student still costs a hash, and the form renders identically either
way — three halves of one defence against slug enumeration.

`resetStudentSignIn` (`app/actions.ts`) replaces the old
`regenerateStudentLinks`: it clears the credential and rotates both tokens,
because clearing a password without rotating would leave whoever is signed in
still signed in. It obliges Jenn to send the new invite — the student's page
cannot tell them their account was reset without telling a stranger the same
thing.

**One student, one token, one cookie.** A student has exactly one `chatToken`,
and therefore at most one `student-token-<slug>` cookie in their browser. That
is a product fact, not an accident of the current code: nothing here should
branch on a browser holding two students' cookies, and any text implying one
person manages several students is wrong. It is what lets the landing page take
the first `student-token-*` cookie it finds and redirect on it with nothing to
disambiguate (`studentSlugFromCookies`, `lib/landing-redirect.ts`).

That page still validates before it redirects, which is the part worth keeping.
It resolves the cookie against the database and goes to `/g/[slug]` **only** for
the state `studentGate` calls `signed-in` — the presented value equals the live
`chatToken` and `passwordHash` is non-null. A stale cookie, or one naming a
deleted group, falls through to the landing page: bouncing someone into a
sign-in form they did not ask for is worse than showing them Jenn's bio, and a
404 in place of the marketing page is worse still. The accepted cost is that
reading a cookie makes `/` **dynamic** rather than static. Middleware could have
kept it static, but middleware runs on the Edge runtime with no database, so it
could not tell a live token from a spent one.

**`/signin` is a second door, not a change to `/login`.** A student who has
bookmarked nothing — or who is on a new phone — had nowhere to go, because
sign-in was per-page and the form was scoped to the slug in the URL.
`signInByEmail` takes an address and a password and redirects to that student's
page. One page for both audiences was rejected: it would show every student a
*Sign in with passkey* button that is not for them, and put a student form on
the teacher's page. `/login` keeps the passkey ceremony and stays unadvertised,
and `signInStudent` is untouched, so a student who still has their link never
sees `/signin`.

`Group.email` is `@unique` for it, which retires the schema's old argument
against uniqueness — that argument was right when sign-in was scoped to a slug,
and a door taking an address and nothing else has to have that address name one
student. The alternatives were worse: silently choosing one of the matches, or a
chooser that reads other students' names out to whoever typed the address.
`claimStudent` catches the resulting `P2002` and returns a specific sentence —
the one specific message in an area whose whole design is uniform failures,
because the uniform ones are about *sign-in*, where naming which half was wrong
is enumeration, and a claim is already authorised by a single-use invite for a
named student.

Every defence in `signInStudent` is carried across deliberately, because this
endpoint is reachable **without knowing any slug** and is therefore a better
target than the per-page form: one message for every failure, a hash performed
even when no group matches (an instant answer would say which addresses are
real), and the throttle — `isLockedFor`, keyed `email:…` rather than `slug:…` so
the two namespaces cannot share a counter. Measured: a wrong password, an
unknown address and an unclaimed student all answer in ~305ms with the same
sentence, and the eleventh attempt locks.

Nothing here sends email. The address is stored for newsletters and chat alerts
later; "I forgot my password" is Jenn pressing Reset sign-in.

Every mutating server action in `app/actions.ts` and `app/ai-actions.ts` starts with
a teacher check. Add one to any new action — `ai-actions` without it is an
unauthenticated endpoint spending the project's API budget.

### Claude card generation

`lib/card-ai.ts` calls `claude-sonnet-5` to write exactly three fields —
`hint`, `grammar`, `idiom`. Subject, usage, and Québec pronunciation are the
teacher's; `CardSuggestion` has no shape for them, so a generated value cannot
reach those inputs. `thinking: { type: "disabled" }` is intentional: `max_tokens`
caps thinking and output together, and adaptive thinking was truncating the JSON.
Failures become `CardAiError` whose messages are shown to the teacher verbatim;
anything else is logged server-side and replaced with a generic message.

### Rendering

Card text uses a deliberately tiny inline markup parser (`lib/inline-markup.ts`),
not Markdown: `**bold**`, `*italic*`, `` `code` `` and nothing else. `**` is matched
before `*`, and unclosed markers stay literal.

All text should be localized to the browser. User-facing strings should not go into pure JS code, but instead into localization files for English and French translations.

### Subsystem rules, loaded on demand

Four subsystems keep their full design rationale in `.claude/rules/`, which loads
only when you touch the matching files — the reasoning arrives with the code it
explains, instead of sitting in every session. The hard rules below stay here,
always loaded, because a prohibition must not depend on which file you opened
first.

| Subsystem | Rationale in | Loads when you touch |
|---|---|---|
| Files: pages, links and PDFs | `.claude/rules/files-pages-pdfs.md` | `app/p`, `app/f`, `app/api/pages`, `lib/page-*`, `lib/asset-*`, `lib/link-*`, `lib/shelf-*`, the admin and student shelves |
| Worksheet versions | `.claude/rules/worksheets.md` | `app/g`, `app/api/worksheets`, `lib/worksheet-*`, `lib/snapshot-*`, `lib/editable-fields.ts`, `components/worksheet` |
| Lesson chat | `.claude/rules/lesson-chat.md` | `app/api/chat`, `app/api/inbox`, `lib/chat-*`, `lib/inbox*`, `middleware.ts`, `components/chat` |
| Whiteboards | `.claude/rules/whiteboards.md` | `app/api/whiteboard`, `lib/whiteboard-*`, `lib/leave-guard.ts`, `components/whiteboard` |

**The prohibitions those files explain. Never relax one without reading its rule
file first — each of these records a failure that already happened.**

- **Never add `allow-same-origin`** to the iframe sandbox on `/p/[slug]`. Beside
  `allow-scripts` it lets the framed page remove its own sandbox.
- **Never add `allow-scripts` to a preview frame.** `HtmlPreview` is `sandbox=""`
  and a shelf mounts a dozen documents at once, with no control surface to stop
  an animation or an autoplaying `<audio>` inside a 160px thumbnail.
- **Never add `allow-same-origin`** to `captureHtmlThumbnail`'s offscreen frame,
  for the same reason as the first rule.
- **Never widen the CSP** on `/p/[slug]/raw` to make an asset load. `inlinePage`
  exists so the policy does not have to move, and no directive in it admits
  `https:` — a subresource load is a real GET and would exfiltrate what a student
  typed.
- **`/p/[slug]/raw` and `POST /api/pages` never redirect to an external URL** —
  404 or 400 instead. An open redirect on a public route is a phishing primitive.
- **`?printable=1` and `?capture=1` stay gated.** The admin's `<a download>` and
  every preview must return Jenn's bytes exactly as she uploaded them, or the
  next upload carries our injected script back in.
- **A student never saves from Jenn's correction** (`canSaveFromSlot`). A save
  writes the caller's own slot from whatever view called it, so it would file her
  marks as their attempt and lose what they handed in.
- **`canSaveFromSlot` and `isWritableSlot` are two rules, not one.** The first
  governs PDF uploads, the second html auto-save. They disagree about Jenn on
  purpose, because a press and a ten-second timer are not the same act.
- **`snapshotDocument` stays self-contained ES5** — no imports, no closure over
  module scope. It is the bundled output, inlined into the page via `toString()`.
- **Brotli and bcrypt through the async API only.** One pm2 fork process serves
  every SSE stream, and a synchronous compress or hash stalls the `: ping`
  heartbeats.
- **pm2 must stay in fork mode.** The chat bus, the live board, the sign-in
  throttle and the inbox stream are all single-process; under cluster mode each
  would fail silently for viewers on another worker.
- **Nothing in the chat may render on the server.** Every heading and timestamp
  resolves in the reader's zone, so an SSR pass would not match hydration — both
  FABs mount their panel on an `open` state that starts `false`.
- **Keep the admin's edit pencil and the version chooser's rows as anchors.** The
  whiteboard leave-guard is a capture-phase `click` listener that inspects
  anchors, so a `router.push` handler slips past it and destroys a live op log
  with no prompt.
- **`savePage`'s update branch never rewrites `worksheet`.** Only
  `updatePageMeta` may change that flag, or an edit clobbers one Jenn set by hand.
- **An upload never fails because a preview did not render.** The glyph is a
  working fallback; `renderPdfThumbnail` and `captureHtmlThumbnail` return `null`
  rather than throwing.

## Conventions

- **Logic belongs in `lib/`.** Anything with a rule in it — date handling, card
  resolution, section manipulation, idiom splitting, markup parsing — is a pure
  function in `lib/` with a test in `tests/lib/`. Components and Prisma access are
  not unit-tested; the pure modules underneath them are. Follow this when adding
  behaviour.
- **Comments explain the "why", especially the counter-intuitive.** Most comments in
  this codebase record a decision and the failure that motivated it. Match that —
  don't add comments that restate the code.
- **`markFlashcardViewed` is the only write-on-read in this codebase**, and it
  is refused for the teacher. A card sits on one student's deck but two people
  can open it, so if Jenn's browsing stamped `lastViewedAt`, flicking through a
  deck would tell that student's app they had revised everything — and the
  cards they are struggling with would drop off the top of the list that exists
  to surface them. It also does not `revalidatePath`: the caller fires it
  without awaiting, and a revalidation would reorder the deck under a reader
  mid-flip.
- **"Student" is the UI word, "Group" is the code word.** The admin renders
  "Students", "Add a student", and student-facing error copy, but the
  `Group` model, its routes (`/g/[slug]`, `/f/[token]`), Prisma queries, and
  the `?tab=groups` URL value were left as `group` — renaming those would
  have meant a migration and a route move for no behavioural gain. Match
  whichever layer you're in: `group` in `lib/`, `prisma/`, and route
  segments; `student` in copy and in new code that has no reason to touch
  the model, like `lib/student-slug.ts` and `lib/student-tokens.ts`.
- **Language follows the browser, on both surfaces.** This retires the rule that
  stood here until 2026-08-06: "the admin renders English and a student's page
  French". `pickLocale` (`lib/i18n.ts`) reads `Accept-Language`, parses its
  q-values, and answers `"en"` only when English **strictly outranks** French;
  a malformed q discards its entry rather than defaulting to 1, which is the
  naive-parser trap. Everything else — a missing header, `*`, a language we do
  not have — falls back to French, because this is a French tutor's site and an
  unknown visitor should get the language the content is in.

  There is **no switcher**, deliberately, and the cost is stated plainly: a
  wrong browser setting cannot be corrected from inside the site. The
  consequence to keep in mind is that *Admin* and *Hello Jenn!* are the English
  **translations** of two strings, not fixed labels — Jenn on an `fr-CA` browser
  correctly gets the French ones.

  `lib/strings.ts` holds one `Strings` type and two objects **both annotated as
  it**, so a key missing or mistyped on either side is a compile error naming
  the key rather than an `undefined` a student eventually reads. Interpolating
  values are **functions**, never placeholder templates: French and English
  disagree about word order (*Marie's page* / *La page de Marie*), and a
  placeholder scheme invites building sentences by concatenation.

  **Those functions are why the LOCALE, and never the resolved object, crosses
  into a client component.** React cannot serialize a function across the
  server/client boundary. Passing the object threw a 500 on every affected page
  while lint, `tsc`, the tests and the build all stayed green — a runtime-only
  failure, which is exactly how it shipped. A client component takes
  `locale: Locale` and calls `getStrings(locale)` itself; `lib/strings.ts` and
  `lib/i18n.ts` import only types and are safe to reach from the browser, and
  `lib/locale.ts` is the server-only half because it reads `headers()`. **Do not
  reintroduce a resolved `Strings` prop, and do not flatten the functions to fix
  it — the boundary was what was wrong.**

  Reading `headers()` in the root layout opts the whole app into dynamic
  rendering, so `/login` and `/signin` are no longer prerendered. Accepted: the
  language is right on first paint rather than flickering after hydration.

  `adminSectionLabel` and `studentSectionLabel` were two functions because the
  admin said "This week" and the student "Cette semaine". Once both followed one
  locale they became the same function and are merged into `sectionLabel`.
  Jenn's UI being English is gone; the `Student`/`Group` naming convention above
  is untouched and still holds.
- **Styling:** Tailwind v4 via PostCSS, no `tailwind.config`. Design tokens are CSS
  custom properties in `app/globals.css`, and there are two distinct palettes: the
  general app (`--color-*`) and the Québec flashcard template (`--card-*`). The
  latter belongs to the flashcard template and travels with it rather than with
  a route: the student card pages, the landing page's sample card, the admin
  card editor — which is a live representation of the student's card — and
  `components/ui/Tile.tsx` and `components/ui/PageTile.tsx`, which the admin
  student and page lists render so Jenn sees her pages the way her students do.
  (`Tile` is the row; `PageTile` is the previewed tile. The page lists use
  `PageTile`, the students list still uses `Tile`.) Repeated flashcard class strings live
  in `components/card-styles.ts` — extend that rather than duplicating the
  strings. `tileActionClass` is one of them: the round icon button in a tile's
  action slot, rendered by both the page list and the student list.

  **The two palettes stay two palettes**, but the admin uses much more of the
  card one as of 2026-08-06 — paper, lines and ink on its panels, tiles, fields
  and headings, keeping `--color-accent` for primary controls. That extends the
  reason `Tile` and `PageTile` already gave: Jenn should see her pages the way
  her students do. It is not a merge, and neither set may be deleted or renamed.
  The admin now carries the student page's header block too — the wordmark, then
  *Admin*, then *Hello Jenn!* — and the wordmark is **not a link on either
  page**: with `/` redirecting a signed-in visitor straight back, it was a round
  trip to nowhere.

  `--color-accent` is a lilac, `#AC5395`, drawn from `--card-plum`'s hue and
  lightened. The two are meant to stay in the same family, so change one and
  look at the other. `#B05C9A` was the first cut and was rejected on
  measurement: 4.34:1 against white, short of the 4.5:1 it needs as button and
  chat-bubble text. The shipped value clears it at 4.75:1. **Measure before
  moving it** — this variable carries white text.

  `--space-1` … `--space-6` exist and are used for the **page-level rhythm
  seams** — header, tab strip, date nav, content — on `/g/[slug]` and `/admin`,
  which is what keeps those two pages agreeing. They are deliberately not
  retrofitted onto every gap. Interactive controls on those two surfaces reach a
  44px hit box, often through padding and a negative margin rather than by
  growing the visible control; two documented exceptions state their reasons in
  place (a tile's three action icons, and the month calendar's dense grid).
  Anything that animates carries `motion-reduce:animate-none`, anything that
  transitions carries `motion-reduce:transition-none`, and there are no
  keyframes beyond the three in `app/globals.css`.
- **Imports** use the `@/` alias for repo-root-relative paths.
- Server actions call `revalidatePath` for the page they affect. Deletes use
  `deleteMany` so a double-click or stale tab is a no-op rather than a P2025.
- **Two fixed buttons share the bottom-right corner.** `InboxFab` is at
  `bottom-6 right-4` on `/admin`, `/admin/pages/[slug]` and `/g/[slug]`; the add
  `+` sits at `bottom-6 right-24`, to its left, in both `AdminChrome` and
  `ShelfFab`. They are the same `z-50`, so a third fixed control at `right-4`
  will silently paint over one of them — which is exactly what the admin's `+`
  did until 2026-08-04. `bottom-24` is not a free slot either: that is where the
  open panel and the add menu go.
- **An open overlay hides both of them, below `md` only.** `AddSheet` and
  `ChatPanel` were `z-50` too and render *earlier* in the tree, so on a phone
  the `+` painted on top of the PDF sheet's own submit button and both buttons
  sat on top of the full-screen chat. Both overlays are `z-[60]` now, but that
  alone only fixes the overlap: over a dimmed backdrop the button would still be
  visible, just behind the card. So they call `useOverlayLock`
  (`components/ui/OverlayProvider.tsx`, mounted in `app/layout.tsx`) and `Fab`
  hides itself while the count is above zero. **Below `md` only** — at desktop
  size the chat panel floats with the page readable behind it and the FAB is
  what closes it, so hiding it there would strand the panel. `AddMenu`
  deliberately does *not* lock: the FAB is its anchor. The provider is UI
  plumbing rather than a rule, which is why it has no `lib/` module and no unit
  test; that is a deliberate exception to the convention above it, not an
  oversight.

## Docs

`docs/superpowers/specs/` and `docs/superpowers/plans/` hold the design specs and
implementation plans for each feature, dated. Read the relevant spec before
reworking a feature — the reasoning behind the current behaviour is usually there.

`docs/DEPLOY.md` is the everyday loop: local checks → commit → push → CI → one
`deploy.sh` run on the server, plus rollback and failure modes. Pushing to `main`
runs CI but does **not** deploy; the server only changes when someone runs the
deploy step.

`docs/DEPLOYMENT.md` is the full production runbook behind it: EC2 + pm2 + nginx +
certbot, SQLite on the box with nightly `VACUUM INTO` backups to S3. It covers
restoring the database and passkey handover/lockout recovery.
