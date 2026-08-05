# Shelf uploads, stored previews, and signing in by email — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Five changes. A student can upload a PDF to their own shelf and Jenn
gets her full add menu on a student's page. The dia script is silent under
Shortcuts. An HTML tile shows a stored JPEG of the page as a student sees it,
captured once. Renaming happens in an overlay on both screens. A student can
sign in with an email address from the landing page.

**Architecture:** `Page.pdfThumb`/`pdfThumbAt` are renamed to `thumb`/`thumbAt`
and serve both kinds; `Group.email` becomes unique. Rules go in `lib/` as pure
functions with tests in `tests/lib/`. The HTML capture is an impure client
module with a total contract (`Promise<Blob | null>`, never throws) so its
internals can be replaced without touching a caller.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Prisma + SQLite,
Vitest, Tailwind v4 via PostCSS.

**Spec:** `docs/superpowers/specs/2026-08-04-shelf-previews-and-sign-in-design.md`
— **read it before Task 1.** Several choices below look arbitrary without it,
particularly why the capture frames the real route rather than the HTML in
memory, and why the pencil must be an anchor.

**Sequencing:** Self-contained. Ends green — lint, typecheck, tests and build
all pass, and every existing card, chat, whiteboard, link and PDF behaves
exactly as it does today.

---

## Critical context for whoever executes this

**Task 1 can stop the plan.** `Group.email` gains a unique index, and SQLite
will refuse it if two students already share an address. Task 1 checks. Do not
skip it because development data is empty — production is the database that
matters, and this is the only change here that can fail there and not here.

**Task 8 is a spike with a real chance of failing, and it is deliberately
early.** The whole of change 3 rests on rasterising a document through an SVG
`foreignObject` inside a sandboxed frame. It cannot be verified from a terminal.
If it fails, read *If the capture does not work* below before writing any
fallback — do not quietly widen the CSP or add `allow-same-origin` to make
something render.

**Never add `allow-same-origin` to any frame in this codebase.** With
`allow-scripts` beside it a page can remove its own sandbox. The capture frame
has `allow-scripts` and must never gain the other.

**Do not widen the CSP on `/p/[slug]/raw`.** The capture needs `img-src data:`
and `script-src 'unsafe-inline'`, both already present. If something does not
render, that is fault 2 from the spec — a real broken page — and the correct
outcome is a thumbnail that shows it broken.

**Task 4 renames two database columns.** Read the generated migration SQL. On
SQLite, Prisma rebuilds the table for a rename; confirm the data is carried and
that no other column is touched.

**Two documented decisions are being reversed, and the documentation must be
updated, not left to contradict the code.** CLAUDE.md says PDF upload is
teacher-only and that student upload "would need `canStudentDelete` extended";
`prisma/schema.prisma` says `Group.email` is "deliberately NOT `@unique`". Task
25 rewrites both. A reviewer reading either file afterwards must not find the
old argument.

**Project conventions, which you must follow:**
- Logic lives in `lib/` as pure functions tested in `tests/lib/`. Components and
  Prisma access are **not** unit-tested — do not add component tests.
- Comments explain *why*, especially the counter-intuitive. Never restate code.
- Imports use the `@/` alias.
- Deletes use `deleteMany`, updates `updateMany`/`upsert`, so a double-click or
  a stale tab is a no-op rather than a Prisma `P2025`.
- "Student" is the UI word, "Group" is the code word. In `lib/`, `prisma/` and
  route segments it is `group`.
- Server actions call `revalidatePath` for the pages they affect, and every
  mutating action starts with a teacher or shelf-role check.
- Repeated flashcard class strings go in `components/card-styles.ts`.
- Jenn's UI is English, a student's is French.

**Run before claiming any task complete:** `npx vitest run <the test file>` for
a task with a test; `npm run typecheck` for any task without one. The full CI
sequence — `npx prisma generate` → `npm run lint` → `npm run typecheck` →
`npm test` → `npm run build` — runs at Task 26.

---

## Task order and why

Task 1 first because it can stop everything. The two pure-function tasks next,
because they depend on nothing. Then the schema, because most of what follows
needs the columns.

The capture spike (Tasks 6–8) comes before anything that consumes it, so a
failure is discovered before four tasks have been built on top of it. The rest
of change 3 follows it.

The remaining four changes are independent of each other and of change 3. If
the work has to be split across sessions, split it at the phase boundaries;
each phase ends green.

Documentation is last because the shape has to settle before it can be
described.

---

## File structure

| File | Responsibility |
|---|---|
| `prisma/schema.prisma` | **Modify.** `Page.thumb`/`thumbAt` rename; `Group.email @unique`. |
| `prisma/migrations/*/migration.sql` | **Generated, then read.** Two migrations, kept separate. |
| `lib/login-throttle.ts` | **Modify.** `isSlugLocked` → `isLockedFor(key)`; prefixed keys. |
| `lib/printable-bootstrap.ts` | **Modify.** `CAPTURE_MESSAGE`, `withCaptureBootstrap` beside the print pair. |
| `lib/pages.ts` | **Modify.** Column rename through `SHELF_SELECT`, `savePage`, `getPageThumb`; new `setPageThumbnail`. |
| `components/html-thumbnail.ts` | **Create.** `captureHtmlThumbnail` — impure, total contract, not in `lib/`. |
| `components/pdf-thumbnail.ts` | **Move** from `components/admin/`. No longer admin-only. |
| `app/p/[slug]/raw/route.ts` | **Modify.** `?capture=1` gate beside `?printable=1`. |
| `app/p/[slug]/thumb/route.ts` | **Modify.** Drops the pdf-only check; serves either kind. |
| `app/page-actions.ts` | **Modify.** `setPageThumb`, `addShelfPdf`, `loadPageForEdit`. |
| `app/student-auth-actions.ts` | **Modify.** `signInByEmail`; claim collision message. |
| `components/ui/HtmlPreview.tsx` | **Modify.** `thumbVersion` prop; `<img>` or the live frame. |
| `components/ui/PdfPreview.tsx` | **Modify.** Column rename only. |
| `components/admin/ThumbBackfill.tsx` | **Create.** Serial, capped, admin-only capture of missing previews. |
| `components/admin/PageEditOverlay.tsx` | **Create.** `AddSheet` + `PageEditor`, driven by `?edit=`. |
| `components/admin/PageList.tsx` | **Modify.** Pencil becomes `?edit=`; pass `thumbVersion`. |
| `components/student/FilesTab.tsx` | **Modify.** Teacher pencil; pass `thumbVersion`; overlay. |
| `components/student/ShelfFab.tsx` | **Modify.** `role` prop; PDF sheet; two label sets. |
| `app/g/[slug]/page.tsx` | **Modify.** Wire the FAB role, the PDF action and the overlay. |
| `app/admin/page.tsx` | **Modify.** Mount `ThumbBackfill`; read `?edit=`. |
| `app/signin/page.tsx` | **Create.** The student email/password door. |
| `app/page.tsx` | **Modify.** `Login` link, top right. |
| `tools/publish-dia-artifact.sh` | **Modify.** Brief filter; TTY-gated output; new open target. |
| `CLAUDE.md` | **Modify.** Two reversed decisions, plus the new surfaces. |

---

## Phase 1 — Blockers and pure functions

### Task 1: Check for duplicate email addresses — BLOCKING

- [x] Run against the development database:
      `npx prisma db execute --stdin <<< "SELECT email, COUNT(*) c FROM \"Group\" WHERE email IS NOT NULL GROUP BY email HAVING c > 1;"`
- [x] **Ask the human to run the same query against production** before Task 5.
      The runbook is `docs/DEPLOYMENT.md`; the database is SQLite on the box.
      **Answered 2026-08-04: production has no email addresses at all, so the
      unique index cannot collide. Task 5 unblocked.**
- [x] If any row comes back, **stop and report it**. Do not deduplicate data on
      your own initiative — which student keeps the address is Jenn's decision,
      and the other student's account has to be reset by her afterwards.
- [x] Record the result in the task notes either way.

**Result (dev, 2026-08-04):** clean. 2 `Group` rows, 1 with a non-null email, no
duplicates. Note that `prisma db execute` does not print rows, so the check was
run as `sqlite3 prisma/dev.db`. The production query is still outstanding and
blocks Task 5:

```
sqlite3 <the production db> \
  'SELECT email, COUNT(*) c FROM "Group" WHERE email IS NOT NULL GROUP BY email HAVING c > 1;'
```

**Why blocking:** SQLite rejects a unique index over a column with two equal
non-null values. Discovering that during a production deploy means a failed
migration on a live box; discovering it now means a conversation.

### Task 2: Rekey the login throttle

- [x] In `lib/login-throttle.ts`, rename `isSlugLocked(slug)` to
      `isLockedFor(key)`. `noteFailure` and `clearAttempts` keep their names and
      take the same `key`.
- [x] Leave the pure half — `recordFailure`, `isLocked`, `MAX_FAILURES`,
      `WINDOW_MS` — completely untouched.
- [x] Update the two existing callers in `app/student-auth-actions.ts` to pass
      `` `slug:${slug}` ``.
- [x] Comment why the key is prefixed: two namespaces share one Map, and a
      function called `isSlugLocked` handed an email address is a comment that
      lies.
- [x] Extend `tests/lib/login-throttle.test.ts`: a `slug:` key and an `email:`
      key with the same trailing text do not share a counter.
- [x] Add a line to the existing single-process note — this throttle is now a
      *fourth* thing depending on pm2 fork mode, alongside the chat bus, the
      live board and the SSE stream.

**Verify:** `npx vitest run tests/lib/login-throttle.test.ts`

### Task 3: `withCaptureBootstrap`

- [x] In `lib/printable-bootstrap.ts`, add `CAPTURE_MESSAGE = "capture-page"`
      and `withCaptureBootstrap(html: string): string`, beside the print pair
      rather than in a new module — one gate rule, two injections.
- [x] The injected script must:
      - Ignore any message whose `event.source !== window.parent`. **Not
        `event.origin`** — the frame has an opaque origin and no origin string
        to compare against. Copy the reasoning from the print bootstrap.
      - On `CAPTURE_MESSAGE`, serialise `document.documentElement` into an SVG
        `foreignObject` at the document's own width, draw it into a canvas via
        an `<img>` with a `data:` URL, and `canvas.toBlob(…, "image/jpeg", 0.6)`.
      - Post `{ type: CAPTURE_MESSAGE, blob }` back to `window.parent`, or
        `{ type: CAPTURE_MESSAGE, blob: null }` on any failure.
      - **Never throw.** Wrap the whole body; a thrown error inside the frame is
        invisible to the parent and would hang it until its timeout.
- [x] Paint the canvas white before drawing. An unpainted canvas is transparent,
      which a JPEG encodes as black — the same trap `renderPdfThumbnail`
      documents.
- [x] Target 320px wide, matching `THUMB_WIDTH`, so nothing upscales in a tile.
- [x] Append rather than splice before `</body>`: a document that has been
      through a text editor may have none, or several.
- [x] Extend `tests/lib/printable-bootstrap.test.ts`: the original html is a
      prefix of the result, the capture bootstrap is not injected by
      `withPrintableBootstrap` and vice versa.

**Verify:** `npx vitest run tests/lib/printable-bootstrap.test.ts`

**Note:** this task writes the script as a string. Whether it *works* is Task 8.

---

## Phase 2 — Schema

### Task 4: Rename the thumbnail columns

- [x] In `prisma/schema.prisma`, rename `Page.pdfThumb` → `Page.thumb` and
      `Page.pdfThumbAt` → `Page.thumbAt`.
- [x] Rewrite both comments: they already describe "the picture" and "the
      existence signal and the cache version". Remove every mention of PDFs from
      them and keep both arguments — no shelf query may select `thumb`, and
      `/p/[slug]/thumb` is `immutable` for a year only because the tile appends
      `?v=thumbAt`.
- [x] `npx prisma migrate dev --name rename_page_thumb_columns`
- [x] **Read the generated SQL.** SQLite rebuilds the table for a rename;
      confirm every column is carried and nothing else changes.
- [x] `npx prisma generate`, then follow the compiler. Expect errors in:
      `lib/pages.ts` (`SHELF_SELECT`, `savePage`'s three branches,
      `getPageThumb`, `listPagesForAdmin`), `app/p/[slug]/thumb/route.ts`,
      `app/page-actions.ts`, `components/ui/PdfPreview.tsx` (prop plumbing only
      — its own `thumbVersion` prop name is already general and stays),
      `components/admin/PageList.tsx`, `components/student/FilesTab.tsx`.
- [x] In `savePage`, keep writing both columns on **every** branch. The html
      and link branches still write `null`. This is not an oversight to fix
      later — a replaced document's old picture is stale, and the capture writes
      the new one afterwards.
- [x] In `app/p/[slug]/thumb/route.ts`, drop the `readPageKind(page) !== "pdf"`
      check so the route serves either kind. Keep the null check, the headers
      and every comment about why the year-long cache is safe.

**Verify:** `npm run typecheck` — green. Then load the admin Pages tab and
confirm existing PDF tiles still show their pictures.

### Task 5: `Group.email` becomes unique

- [x] **Confirm Task 1 came back clean for production first.**
- [x] Add `@unique` to `Group.email`.
- [x] Replace the comment. The current one argues *against* uniqueness on the
      grounds that sign-in is scoped to the slug. Say instead that `/signin`
      takes an address and nothing else, so the address has to name one student,
      and that the shared-inbox case is now served by Jenn sending each student
      their own invite.
- [x] `npx prisma migrate dev --name unique_group_email`
- [x] Read the SQL. It should be one unique index and nothing else.

**Verify:** `npx prisma generate && npm run typecheck`. Then, by hand: claim two
students with the same address and confirm the second fails — Task 21 turns
that failure into a sentence.

---

## Phase 3 — Capturing an HTML preview

Read the spec's *Stored previews for HTML pages* before starting. The two
choices most likely to be "simplified" into bugs are that the capture frames
the **stored page through its real route** rather than the HTML in memory, and
that the rasterising happens **inside** the frame rather than in the parent.

### Task 6: The `?capture=1` gate

- [x] In `app/p/[slug]/raw/route.ts`, read `capture` beside the existing
      `printable` and apply `withCaptureBootstrap` when it is `1`.
- [x] The two gates are independent and neither implies the other. `printable=1`
      must not inject the capture script and vice versa — the admin's
      `<a download>` has to keep returning Jenn's bytes byte-for-byte, and a
      student's print must not carry a capture listener.
- [x] Do not touch `CONTENT_SECURITY_POLICY`. Do not touch the `?v=` cache
      logic. Add the gate and nothing else.
- [x] Comment the gate the way `printable` is commented: only the capture
      harness asks for it, and injecting unconditionally would put our script
      into the file she downloads to edit, which the next upload would carry
      back in.

**Verify:** `npm run typecheck`, then `curl` the route three ways — bare, with
`?printable=1`, with `?capture=1` — and confirm each returns exactly the
expected script and no other.

### Task 7: `captureHtmlThumbnail`

- [x] Create `components/html-thumbnail.ts`, marked `"use client"`.
- [x] Open the file with the same explanation `components/pdf-thumbnail.ts`
      carries: impure, needs a DOM, therefore **not** in `lib/`, where "a rule
      with a test" is what the directory means.
- [x] Signature: `captureHtmlThumbnail(slug: string, version: string | null):
      Promise<Blob | null>`. `null` omits `?v=` and takes the `no-store`
      response, which is what a page saved a moment ago wants — see Task 10.
- [x] It must:
      1. Create an iframe positioned offscreen, sized to a laptop-ish width
         (1024×768 is fine) so the page lays out the way opening it would —
         **not** sized to a tile, for the reason `HtmlPreview` frames at 500%.
      2. Set `sandbox="allow-scripts"`. **Never `allow-same-origin`.**
      3. Point it at `/p/${slug}/raw?v=${version}&capture=1`.
      4. Wait for `load`, then a short settle delay so CDN-driven layout (a
         Tailwind build rewriting the DOM, a chart drawing itself) has run.
      5. `postMessage(CAPTURE_MESSAGE)` into it and await the reply, matching
         `event.source === iframe.contentWindow`.
      6. Resolve the Blob, or `null`.
      7. Remove the iframe in a `finally`, always.
- [x] **Total contract, and it is the point of the module.** It never throws and
      never rejects: a frame that will not load, a null reply, a tainted canvas,
      a timeout and an oversized blob all resolve `null`. State in the comment
      that `null` means "leave the live iframe in place", which is a working
      preview — the same contract and the same reason as `renderPdfThumbnail`.
- [x] Give it a timeout in the same register as `RENDER_TIMEOUT_MS` (10s), via
      `Promise.race`, so a page with an infinite script cannot hang a save.
- [x] Reject a blob larger than `MAX_THUMB_BYTES` here as well as on the server.
      The server is the authority; this avoids a pointless 128 KB round trip.
- [x] No test. It is impure and has no rule in it — the same split
      `lib/whiteboard-thumbnail.ts` and `BoardEditor.renderThumbnail` make.

**Verify:** `npm run typecheck`.

### Task 8: SPIKE — does the capture actually work?

**This task is verification, not code, and it cannot be done from a terminal.
Do not proceed to Task 9 until it passes or its fallback is chosen.**

- [x] `npm run dev`.
- [x] Publish, or find, a page that reproduces the reported bug: a Dia artifact
      that links out to external JavaScript and CSS. A page whose layout comes
      from `cdn.tailwindcss.com` is the canonical case. Confirm first that its
      tile previews blank today — that is the bug being fixed.
- [x] From the browser console on `/admin`, call `captureHtmlThumbnail` for that
      slug and inspect the returned Blob (`URL.createObjectURL` it into a new
      tab).
- [x] **Pass condition:** the JPEG shows the page laid out, with the
      CDN-driven styling applied — not a blank white box.
- [x] Check three more shapes and record what each produced:
      a plain text-only page, a page with an inlined data-URL image, and a page
      that draws into a `<canvas>` (expected: the canvas area is blank — a known,
      accepted cost).
- [x] Confirm the failure path: point it at a slug that does not exist and
      confirm it resolves `null` within the timeout rather than hanging or
      throwing.
- [x] **Report the outcome to the human before continuing**, with the images.

**Spike result (2026-08-04): PASS.** Run in headless Chrome against the real
`/p/[slug]/raw?capture=1` route. A page whose entire layout is drawn by
JavaScript captured correctly at 649ms / 4.9 KB — that is fault 1, fixed. Plain
text (2.4 KB) and an inlined data-URL image (2.4 KB) both render. A `<canvas>`
serialises blank, the accepted cost. A slug that does not exist resolves `null`
at the 10s timeout without hanging or throwing.

One bug was found and fixed by the spike: the `load` listener was attached
after `appendChild`, so on a same-box response `load` could fire before anything
was listening and every capture waited out its full timeout.

#### If the capture does not work

In order, and stop at the first that succeeds:

1. **Missing fonts or styling only.** The serialiser is probably not carrying
   computed styles. Inline the document's own `<style>` blocks into the
   serialised markup rather than relying on the SVG inheriting them.
2. **A blank or tainted result everywhere.** Swap the implementation inside
   `withCaptureBootstrap` for `html2canvas`, inlined into the bootstrap string.
   This costs a dependency and a larger injected script, and the CSP already
   permits it (`script-src 'unsafe-inline'`). No caller changes — that is what
   the total contract bought.
3. **Neither works.** Report it and stop. Change 3 then reduces to nothing, and
   the live iframe stays. **Do not** reach for `allow-same-origin`, a widened
   CSP, or a server-side renderer; all three are refused in the spec and in
   CLAUDE.md, and each trades a real security property for a thumbnail.

### Task 9: `setPageThumb`

- [x] In `lib/pages.ts`, add `setPageThumbnail(slug, jpeg: Uint8Array)`: writes
      `thumb` and `thumbAt` and **nothing else**. Its own function beside
      `updatePageMeta` for the reason `updatePageMeta` exists — `savePage`
      writes every content column on every call, and a "leave the content alone"
      case inside it would put a hole in the one place that invariant is
      enforced.
- [x] Use `updateMany` on the slug, so a page deleted between the save and the
      capture is a no-op rather than a `P2025`.
- [x] In `app/page-actions.ts`, add `setPageThumb(slug, formData)`:
      `requireTeacher()`, read the `thumb` field, validate with the existing
      `readThumb` helper, and return silently when it is null.
- [x] Teacher-only, deliberately: HTML publishing is teacher-only again after
      Phase 4, and a PDF's thumbnail still arrives inside its own upload under
      `requireShelfRole`. One authority per path, neither widened. Say so in a
      comment.
- [x] A rejected thumbnail is **not** an error. It is dropped silently, exactly
      as `readThumb` already documents: the document is the thing being saved
      and the fallback is a working preview.
- [x] `revalidatePages(slug)`.

**Verify:** `npm run typecheck`.

### Task 10: Capture after a document is saved

- [x] In `components/admin/NewPageForm.tsx`, after `onSubmit` resolves and the
      result's slug is known, call `captureHtmlThumbnail(slug, …)` and then
      `setPageThumb`. Do it **after** the save, never before — the capture
      frames the stored page.
- [x] Do not block the sheet on it, and never let it turn a successful publish
      into an error. Fire it, and let `onDone()` / the skipped-assets branch
      behave exactly as they do now.
- [x] `PageSaveResult` already carries the slug, so nothing new has to be
      threaded through.
- [x] Pass `null` as the version. The form does not hold `updatedAt`, and an
      un-versioned raw response is `no-store` — exactly right for a one-shot
      read of a page written a moment ago. Note why in a comment, so nobody
      "fixes" it by threading through a token that would be stale by
      construction. `ThumbBackfill` (Task 12) reads from the server and passes a
      real one.
- [x] Do the same in `components/admin/PageEditor.tsx`, on the html branch only.
      A pdf branch save must not touch `thumb` — its picture comes from
      `renderPdfThumbnail` inside its own submission.
- [x] `router.refresh()` after the thumbnail lands, so the tile swaps from the
      live frame to the image without a manual reload.

**Verify:** by hand — publish a page, watch the tile change from a live frame to
a still image within a few seconds.

### Task 11: Render the stored preview

- [x] `components/ui/HtmlPreview.tsx` gains
      `thumbVersion: number | null` — **required**, not optional, for the reason
      `version` is required there and `pdfSize` is required in `readPageKind`: a
      caller that forgot it would silently fall back to the slow path, and "a
      shelf that is merely slow" is invisible in review.
- [x] Non-null renders `<img src={`/p/${slug}/thumb?v=${thumbVersion}`}>` with
      the same `object-cover object-top`, `alt=""`, `aria-hidden` and
      `loading="lazy"` that `PdfPreview` uses. Null keeps today's iframe
      verbatim — the 500%/0.2 pair, `sandbox=""`, `inert`, all of it.
- [x] Comment that `?v=` is not decoration: the thumb route answers `immutable`
      for a year, and this parameter is the only thing that can replace a
      replaced document's picture.
- [x] Pass `thumbVersion` from both lists. `PageList` and `FilesTab` already
      compute exactly this expression for `PdfPreview`
      (`page.thumbAt ? new Date(page.thumbAt).getTime() : null`) — lift it to a
      single `const` per row and hand it to whichever preview the kind selects.
- [x] `ShelfPage` and `PageSummary` need no new field: `pdfThumbAt` became
      `thumbAt` in Task 4 and already flows through `SHELF_SELECT`.

**Verify:** `npm run typecheck`, then confirm a page with a stored JPEG shows
the image and one without still shows the live frame.

### Task 12: `ThumbBackfill`

- [x] Create `components/admin/ThumbBackfill.tsx`, a client component that
      renders nothing.
- [x] Props: the list of `{ slug, version }` for pages where `kind === "html"`
      and `thumbAt === null`. Compute it on the server in `app/admin/page.tsx`
      from the list already fetched — no new query.
- [x] It captures **one at a time**, awaiting each before starting the next, and
      stops after a small cap per visit (5 is a reasonable start). Serial and
      capped for the same reason a shelf frame has no `allow-scripts`: the
      objection was ever only to a dozen documents running scripts at once.
- [x] A `null` result is skipped silently and retried on a later visit. Do not
      record failures, do not retry within a visit, do not surface anything to
      Jenn — this is an optimisation over a working fallback.
- [x] `router.refresh()` once at the end, not once per page.
- [x] Mount it on the Pages tab only, and only for the teacher — which
      `/admin` already guarantees.
- [x] Comment that this is what covers pages published through
      `POST /api/pages`, where there is no browser to capture in, and that it is
      why there is no backfill script: one would need the server-side renderer
      this design refuses.

**Verify:** by hand — with several thumbnail-less pages, open the Pages tab,
wait, and confirm they gain pictures one after another and that the cap holds.
Then confirm the student shelf shows the same images.

---

## Phase 4 — Student PDF upload, and Jenn's full menu

Independent of Phase 3. Read the spec's *Student PDF upload* first, in
particular why `canStudentDelete` needs no change — that is the load-bearing
fact, and "extend it to handle blobs" is the tempting wrong move.

### Task 13: Move the PDF renderer out of `admin/`

- [x] `git mv components/admin/pdf-thumbnail.ts components/pdf-thumbnail.ts`.
- [x] Update the two importers: `NewPageForm.tsx`, `PageEditor.tsx`.
- [x] Rewrite the paragraph claiming it "runs once, in the admin, in Jenn's
      browser, at upload time". It is now also a student's browser. Keep every
      other comment — the dynamic `import()` is still the load-bearing line, and
      it now matters *more*: without it a PDF renderer would ship in a chunk the
      router could serve to a student who never uploads anything.
- [x] Add a sentence recording the accepted cost: a student staging a PDF
      fetches pdf.js once, at that moment, and the ten-second timeout degrades
      to the glyph on a slow connection.

**Verify:** `npm run typecheck`, and confirm a PDF still uploads from `/admin`
with its preview intact.

### Task 14: `addShelfPdf`

- [x] In `app/page-actions.ts`, add
      `addShelfPdf(groupId: string, formData: FormData): Promise<void>`.
- [x] `const role = await requireShelfRole(groupId)` — the same guard as
      `addShelfLink` and `addShelfPage`, so the everyone group and an untokened
      visitor are refused by a rule that already exists and is already tested.
      **Do not write a new check.**
- [x] Reuse `readPdfForm` and `readThumb` verbatim. Throw
      `"A PDF file is required."` when there are no bytes, as `createPdfPage`
      does.
- [x] `saveOrExplain({ slug: null, kind: "pdf", title, pdf, pdfSize, thumb,
      groupIds: [groupId] })`, then `revalidatePages(slug)`.
- [x] **`SavePageInput`'s pdf branch has no `addedByStudent` field**, and its
      comment says so: *"uploading one is teacher-only, and the union says so by
      not offering the field."* That is now false. Add the optional field to the
      pdf branch, pass `addedByStudent: role === "student"`, and update
      `savePage`'s `create` — the current expression is
      `input.kind !== "pdf" && input.addedByStudent === true`, which must become
      simply `input.addedByStudent === true`. Rewrite both comments.
- [x] **Do not touch `canStudentDelete`.** It keys off `addedByStudent`, not
      `kind`, so a student's own PDF assigned to their shelf alone is already
      deletable by them, and `deleteShelfLink` already re-checks it server-side.
      Add a comment in `addShelfPdf` recording that this is why the action is
      safe, because the old CLAUDE.md text says otherwise until Task 25.
- [x] Note in a comment that the 3 MB cap is nginx's `4m` minus room, and that
      the bytes come as a `File` in `FormData` because base64 would cost a third
      more.

**Verify:** `npm run typecheck`, then confirm from a browser that a student
token can upload and that an untokened visitor and `/g/all` are both refused.

### Task 15: `ShelfFab` grows a role and a PDF sheet

- [x] Add `role: "student" | "teacher"` and `onAddPdf: (formData: FormData) =>
      Promise<void>` to `ShelfFab`. `onAddPage` becomes optional — a student no
      longer has it.
- [x] The menu is chosen by role:
      - `"student"`: *Ajouter un lien*, *Ajouter un PDF*.
      - `"teacher"`: *Add a link*, *Add a page*, *Add a PDF*.
      Jenn's is English and the student's is French, following the split this
      codebase keeps everywhere.
- [x] Keep the FAB itself, its `bottom-6 right-24` position and every comment
      about why it sits left of the chat button.
- [x] The PDF sheet uses `FileDropZone` and follows `NewPageForm`'s **staged**
      flow, not a choose-is-submit flow: choosing stages the file and derives a
      title from the filename, and a Save button commits. Start
      `renderPdfThumbnail` on stage, hold it in a ref, and `await` it at submit
      — copy the reasoning from `NewPageForm`, which records why a ref beats a
      boolean here.
- [x] Check `MAX_PDF_BYTES` client-side before upload, as both admin forms do,
      and show the student a French sentence rather than a leaked English one —
      the existing `submitLink` catch block is the pattern.
- [x] There is no audience picker. The action is curried on `group.id`, so the
      shelf is the page she is on.

**Verify:** `npm run typecheck` and `npm run lint`.

### Task 16: Wire the student page

- [x] In `app/g/[slug]/page.tsx`, pass `role={viewerIsTeacher ? "teacher" :
      "student"}` and `onAddPdf={addShelfPdf.bind(null, group.id)}` to both
      `ShelfFab` instances — the one inside `TeacherInbox` and the one inside
      `StreamProvider`.
- [x] Pass `onAddPage` only in the teacher branch.
- [x] **Do not change the `unlocked` guard.** The FAB is still gated on
      `unlocked`, not on the session: the shelf controls belong to the page body,
      which the token gates, and only the chat ever moved. The existing comment
      says this; leave it.

**Verify:** by hand, all four combinations — student unlocked, student
untokened, Jenn unlocked, `/g/all` — and confirm each sees exactly the menu the
table in the spec describes.

---

## Phase 5 — Editing in an overlay

Independent of Phases 3 and 4.

### Task 17: `loadPageForEdit`

- [x] In `app/page-actions.ts`, add `loadPageForEdit(slug: string)`:
      `requireTeacher()`, then return `getPageForAdmin(slug)` plus the group
      list the editor needs.
- [x] Fetched on open rather than shipped with the list, following
      `loadConversation`: the payload contains a whole document, and a shelf
      renders many tiles.
- [x] Return `null` for a missing row and for a link row — `/admin/pages/[slug]`
      already 404s on a link, and the overlay must agree rather than render an
      upload form over a row that can never accept one.

**Verify:** `npm run typecheck`.

### Task 18: `PageEditOverlay`

- [x] Create `components/admin/PageEditOverlay.tsx`, a client component.
- [x] Props: `slug: string | null` and `onClose: () => void`. A null slug
      renders nothing.
- [x] On a slug change, call `loadPageForEdit`, then render `AddSheet` wrapping
      the existing **unmodified** `PageEditor` with the same
      `initial` shape `/admin/pages/[slug]` already builds.
- [x] Show a small loading line while the action is in flight. Close and report
      nothing if it returns null — a stale link to a deleted page must not leave
      an empty dialog open.
- [x] Bind `onSubmit`, `onSubmitPdf` and `onDelete` to the same teacher-only
      actions the standalone route uses. `onDelete` should close the overlay and
      refresh rather than `router.push("/admin?tab=pages")` — the list is
      already behind it.
- [x] Do not restyle `PageEditor`. It uses the admin's `--color-*` palette and
      will sit on a `--card-*` page when opened from a student's shelf. That is
      a known, accepted awkwardness on a teacher-only surface; leave a comment
      so it is not "fixed" into a second copy of the editor.

**Verify:** `npm run typecheck`.

### Task 19: The overlay on `/admin`

- [x] `app/admin/page.tsx` reads `?edit=` from `searchParams` and passes it
      down; the overlay closes by navigating back to the same URL without it.
- [x] In `components/admin/PageList.tsx`, change the pencil from
      `<Link href={`/admin/pages/${page.slug}`}>` to `<Link href={`?edit=${page.slug}`}>`.
      **It stays an anchor** — see Task 20 for why that matters, and keep them
      the same on both screens so the reason survives.
- [x] Leave `/admin/pages/[slug]` completely untouched. It keeps working for a
      bookmark and is where the dia script's URL resolves to.
- [x] Comment on the pencil why the overlay is a search param: Back closes it,
      it has a URL the dia script can open, and the list keeps its scroll
      position, its search text and — the one that matters — the active student
      chip, which drives which pin applies and a new page's default audience.

**Verify:** by hand — open the overlay from a tile, rename, save, close, and
confirm the chip and the search text are still where they were. Then press Back
and confirm the overlay closes rather than leaving the page.

### Task 20: The pencil on a student's shelf

- [x] `FilesTab` gains `canEdit?: boolean`, passed as `viewerIsTeacher` from
      `app/g/[slug]/page.tsx` — `false` on `/f/[token]`, which is read-only.
- [x] When true, render a pencil beside the pin and the × under the same rule
      `PageList` applies: html and pdf rows get it, a **link row does not**. The
      two screens then agree about which tiles are editable, which is worth more
      than either rule alone. Renaming a link stays impossible on both sides.
- [x] The pencil is a `<Link href={`?tab=files&edit=${page.slug}`}>`.
- [x] **It must be an anchor, and this is not a style preference.** The
      whiteboard's leave-guard is a capture-phase `click` listener on `document`
      that inspects anchors, written that way so *"a future link is protected
      without knowing the guard exists."* A button calling `router.push` would
      slip past it, and opening this overlay during a live board would destroy
      the op log with no prompt. Put that sentence in the comment.
- [x] Mount `PageEditOverlay` on the student page, teacher-only, reading
      `?edit=` from the page's `searchParams`.
- [x] Reuse the pencil icon. It currently lives inside `PageList.tsx`; lift it
      to a shared module rather than copying the path data.
- [x] No new authority: `updatePage`, `updatePdfPage` and `deletePage` are
      already `requireTeacher()`. Say so in a comment — only a control is drawn
      where the authority already reached.

**Verify:** by hand — as Jenn on `/g/marie`, rename a page and confirm the shelf
updates. As a student, confirm no pencil appears. On `/f/[token]`, confirm no
pencil appears. Then open a live whiteboard, click the pencil, and confirm the
leave dialog appears.

---

## Phase 6 — Signing in by email

Depends on Task 5. Read the spec's *Signing in by email* first. Every defence in
`signInStudent` has to be carried across deliberately: this endpoint is
reachable **without knowing any slug**, which makes it a better target than the
per-page form, not a worse one.

### Task 21: `signInByEmail`, and the claim collision

- [x] In `app/student-auth-actions.ts`, add
      `signInByEmail(email: string, password: string): Promise<{ ok: true; slug:
      string } | { error: string }>`. Not `AuthResult` — the caller needs the
      slug to redirect, and widening `AuthResult` itself would let every
      existing caller ignore a field it now has.
- [x] Order of operations, and it is the specification:
      1. `isLockedFor(`email:${normalised}`)` → `TOO_MANY_TRIES`. **Before any
         hashing** — hashing is expensive on purpose, so an unthrottled endpoint
         that hashes attacker input is a CPU-exhaustion vector against a two-core
         box. Copy that comment.
      2. `normaliseEmail`. A malformed address still costs a hash below; do not
         return early on it.
      3. Find the group by the normalised email, selecting
         `slug, isEveryone, chatToken, passwordHash`.
      4. If there is no group, or it is the everyone group, or its `chatToken`
         is null, or its `passwordHash` is null: **hash the submitted password
         and throw the result away**, `noteFailure`, return `SIGN_IN_FAILED`.
         An instant answer would tell someone which addresses are real.
      5. Otherwise `verifyPassword`. On failure, `noteFailure`, return
         `SIGN_IN_FAILED`.
      6. `setStudentCookie(group.slug, group.chatToken)`, `clearAttempts`,
         `revalidatePath(`/g/${group.slug}`)`, return the slug.
- [x] **One message for every failure**, reusing the existing `SIGN_IN_FAILED`.
      Wrong address, wrong password, unclaimed student and the everyone group
      must be indistinguishable — including in timing.
- [x] Log the slug on success only, never the email. The existing
      `console.info("[student-auth] claimed …")` comment gives the rule: the
      address is PII and never goes into a log.
- [x] Leave `signInStudent` in place. `/g/marie` keeps its own form and the
      invite flow is unchanged.
- [x] Separately, in `claimStudent`: the unique index from Task 5 means a second
      student claiming with an address already in use now hits a Prisma `P2002`.
      Catch it and return a specific, actionable sentence — add it to
      `lib/student-auth-labels.ts` beside its neighbours.
- [x] Comment why that one message is specific in an area whose whole design is
      uniform failures: the uniform ones are about *sign-in*, where naming the
      wrong half is enumeration. A claim is already authorised by a single-use
      invite for a named student, so there is nothing left to enumerate.

**Verify:** `npm run typecheck`, then by hand — right address and password,
wrong password, unknown address, and an unclaimed student's address. The last
three must be indistinguishable and must not be noticeably faster than the
first.

### Task 22: `/signin`

- [x] Create `app/signin/page.tsx`. French, for students.
- [x] Two fields, one submit, one error line. Reuse `Input`, the card palette
      and `lib/student-auth-labels.ts` — do **not** write new copy where a label
      exists.
- [x] On success, `router.push(`/g/${slug}`)`.
- [x] `export const metadata = { robots: { index: false, follow: false } }`,
      matching every other student surface.
- [x] Do not touch `/login`. It keeps the passkey ceremony and stays
      unadvertised — one page for both would show every student a *Sign in with
      passkey* button that is not for them.
- [x] Add a quiet line pointing a stuck student at Jenn. There is no password
      reset and nothing here sends email; the cure is her pressing Reset
      sign-in.

**Verify:** `npm run lint && npm run typecheck`, then sign in end to end and
confirm the landing page is `/g/<the right student>`.

### Task 23: The landing page's Login button

- [x] In `app/page.tsx`, add a `Login` link to `/signin`, top right.
- [x] Small and in the corner, not a call to action: it is the first thing on
      that page that is not about Jenn, and it must not compete with *Word of
      the day*.
- [x] Match the existing pill styling — `SERIF`, `--card-line`, `--card-bleu` —
      rather than importing an admin button.
- [x] The page currently has no navigation at all; position the link without
      shifting the centred column at any width. `/g/[slug]`'s absolutely
      positioned *← Back to admin* is the precedent.

**Verify:** by hand at a narrow and a wide viewport.

---

## Phase 7 — The dia script

Independent of everything else, but Task 24's open target assumes Task 19 has
landed. `tools/dia-fixtures.sh` builds a disposable artifact tree; use it with
`DIA_ARTIFACTS` rather than the live Dia folder.

### Task 24: Filter *The X Brief*, and stop talking

**Half A — the filter.**

- [x] Drop any artifact whose title matches `^The .+ Brief$`, case-insensitively,
      **inside `candidate_rows`**. Every selection path — the picker, `--list`,
      `--latest` and the title search — reads through that one function, which
      is what makes the four agree by construction. Do not add a second filter
      anywhere.
- [x] Anchored at both ends, so *The Brief History of Québec* and *Brief Notes*
      survive. On the **title**, not the folder name — the folder is usually
      `template_output`.
- [x] Apply it after `decode_entities`, so a title arriving as
      `The Morning &amp; Evening Brief` is tested in its decoded form.
- [x] Comment the deliberate consequence: `publish-dia-artifact.sh "The Morning
      Brief"` now reports *No page whose title contains …*. That is correct for
      a rule saying these are never published, and the message names the search
      that found nothing.

**Half B — the output.**

- [x] Gate every success-path `echo` and the `gui_alert` call on `[ -t 1 ]`.
      The script already draws this distinction at `die()` and already justifies
      it: environment detection is rejected for *selection*, because a slug is
      permanent, and is fine for *presentation*, which changes only visibility.
- [x] **Change no wording.** In a terminal the output is byte-identical to
      today's, including the skipped-asset report and the clipboard line.
- [x] Under Shortcuts: nothing at all. No stdout, no alert. `die` still exits
      non-zero; it just draws nothing.
- [x] `pbcopy` still runs in both cases. Only the sentence announcing it was
      noise.
- [x] Change the final `open` to `"$SITE/admin?tab=pages&edit=$SLUG"`. The
      script publishes with no groups assigned, so the next step is always
      picking an audience, and this lands there with the list behind it.
- [x] Update the file's header comment block to describe the new behaviour, and
      record the accepted trade: a silent failure is indistinguishable from a
      mis-clicked Shortcut, accepted because the flow ends with a browser
      opening — so a failed publish is a click that did nothing — and because
      the same command in a terminal reports in full.

**Verify:**
- `DIA_ARTIFACTS=<fixtures> ./tools/publish-dia-artifact.sh --list` — a *The X
  Brief* fixture is absent; a *Brief Notes* fixture is present.
- `./tools/publish-dia-artifact.sh --local --latest` in a terminal — output
  unchanged from today.
- The same command with stdout redirected (`> /dev/null 2>&1`) — silent, and
  the browser still opens on success.
- A deliberate failure (a bad token) from the Shortcut — nothing is drawn and
  nothing opens.

---

## Phase 8 — Documentation and verification

### Task 25: CLAUDE.md

Two paragraphs currently argue for the opposite of what the code now does. A
reviewer must not find the old argument.

- [x] **PDF upload is no longer teacher-only.** Rewrite *"Uploading a PDF is
      teacher-only … would need `canStudentDelete` extended from rows-with-a-url
      to rows-with-a-blob — a separate decision."* Say that this was that
      decision; that `canStudentDelete` was independently rewritten to key off
      `addedByStudent` rather than `kind`, which is what made it cheap; and that
      `addShelfPdf` shares `requireShelfRole` with its two siblings.
- [x] **`Group.email` is unique**, in both CLAUDE.md and the schema comment.
      Record why the old argument was right when written — sign-in was scoped to
      the slug — and what changed.
- [x] **The student's menu lost the HTML paste box** and Jenn's gained a PDF.
      Update the `/g/[slug]` row of the routes table and the *Files* section.
- [x] **`pdfThumb`/`pdfThumbAt` are now `thumb`/`thumbAt`** and serve both kinds.
      The existing paragraph about the two columns and the year-long cache is
      still correct in substance; generalise it off PDFs and keep both
      arguments.
- [x] **Add the HTML capture**: the `?capture=1` gate beside `?printable=1`, why
      the capture frames the real route under the real CSP rather than the HTML
      in memory, the total contract, and why `ThumbBackfill` exists instead of a
      script.
- [x] **Add the edit overlay**: `?edit=`, why it is a search param, and why the
      pencil must stay an anchor for the leave-guard.
- [x] **Add `/signin`** to the routes table, and why it is a second door rather
      than a change to `/login`.
- [x] **`components/pdf-thumbnail.ts` moved** and is no longer admin-only.
- [x] Match the file's voice: record the decision and the failure that motivated
      it. Do not restate the code.

### Task 26: Full verification

- [x] `npx prisma generate`
- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `npm test`
- [x] `npm run build`
- [x] Paste the actual output. Do not claim any of these passed without it.

**Run 2026-08-05, all green:**

```
$ npx prisma generate
✔ Generated Prisma Client (v6.19.3) to ./node_modules/@prisma/client in 117ms

$ npm run lint          # eslint .            exit=0, no output
$ npm run typecheck     # tsc --noEmit        exit=0, no output

$ npm test
 Test Files  76 passed (76)
      Tests  834 passed (834)

$ npm run build
✓ Generating static pages using 9 workers (13/13) in 140ms
Route (app) … └ ○ /signin
```

**Browser checklist:** rows 1-10 and 14-15 were verified during implementation
(the capture spike, the ThumbBackfill runs, and the four /signin outcomes plus
the throttle). Rows 11-13 (Back closes the overlay, the chip survives a rename,
the leave-guard prompts during a live board) and rows 16-18 (the dia script's
native picker) are left to a human — a native dialog and a live whiteboard
cannot be driven from here.

**Then the browser checklist, which the build cannot cover.** Hand the last
three to a human if you cannot run them.

| # | Check | Expected |
|---|---|---|
| 1 | A CDN-driven page's tile, after capture | The layout, not a blank box |
| 2 | A page with no stored JPEG | The live iframe, unchanged |
| 3 | Publish a page from the admin | Tile becomes a still image within seconds |
| 4 | Re-save that page with new HTML | The picture updates, never shows the old document |
| 5 | Open the Pages tab with several thumbnail-less pages | They fill in serially, capped |
| 6 | An existing PDF tile | Its picture still shows |
| 7 | Student uploads a PDF on `/g/marie` | Appears, with a preview, deletable by them |
| 8 | The same student on `/g/all` | No PDF option, no write controls |
| 9 | Untokened visitor on `/g/marie` | Public card only, no FAB |
| 10 | Jenn's FAB on `/g/marie` | Link, page and PDF, in English, no *Add a student* |
| 11 | Pencil on `/admin` | Overlay opens, chip and search survive, Back closes it |
| 12 | Pencil on `/g/marie` as Jenn | Overlay opens; absent for a student and on `/f/[token]` |
| 13 | Pencil during a live whiteboard | The leave dialog appears first |
| 14 | `/signin` with the right credentials | Lands on that student's page |
| 15 | `/signin` with a wrong password, an unknown address, and an unclaimed student's address | One identical message, no timing difference |
| 16 | The dia script in a terminal | Output unchanged from today |
| 17 | The dia script from the Shortcut | Silent; the editor overlay opens on success, nothing on failure |
| 18 | `--list` with a *The X Brief* fixture present | It is absent from the list |

---

## What "done" looks like

CI green, and every row of that table checked. Nothing in this plan changes
what an existing student, card, chat, whiteboard, link or PDF does today: a
shelf with no stored previews renders exactly as it does now, `/login` and
`/admin/pages/[slug]` are untouched, and `signInStudent` and the invite flow are
unchanged.

Three things must be **reported rather than worked around** if they go wrong:
a duplicate email in production (Task 1), a capture that will not rasterise
(Task 8), and any temptation to widen the CSP or add `allow-same-origin` to make
something render.
