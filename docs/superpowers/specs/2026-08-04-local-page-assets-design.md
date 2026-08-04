# Publishing a page's local sibling files — design

Date: 2026-08-04

## Problem

`docs/superpowers/specs/2026-08-03-inlining-page-assets-design.md` made a
published page self-contained by folding its **external** assets into it at
publish time. It closed with sibling files listed under *Not doing*:

> **Sibling files on disk.** Inlining `./styles.css` from beside `index.html`
> needs the artifact directory, which only `tools/publish-dia-artifact.sh` can
> see. It is a second implementation in bash 3.2 and JXA with no test harness,
> and Jenn's own artifacts are already single files. Reported, not fixed.

The premise in that last clause has turned out to be false. Artifacts Jenn
publishes do ship sibling `.js` and `.css` files, and when they do the page
arrives unstyled and inert: `lib/page-inline.ts:99` skips every relative ref
before anything is attempted, and `tools/publish-dia-artifact.sh` uploads
`index.html` alone.

The reasoning about a second implementation still stands and shapes the design
below. What changed is that "her artifacts are already single files" no longer
justifies leaving it.

## Goal

Two halves of one change:

1. A relative `<script src>`, `<link rel=stylesheet>`, `<img src>`, `url(…)` or
   `@import` resolves against the files sitting beside `index.html` and is folded
   into the stored document, exactly as an allowlisted CDN ref already is.
2. `tools/publish-dia-artifact.sh` collects those files and sends them.

It renders at `/p/[slug]` with **no CSP change, no schema change, and no
third-party request from a student's browser** — the invariant the 2026-08-03
spec set, restated because this change is the one most likely to break it.

A sibling that cannot be used never blocks the publish. It is left alone and
reported by name, the same contract `readSections`, `readOps` and `readPageKind`
hold.

## Approach, and the two that were rejected

**Chosen: the bundle is a second byte source behind the existing inliner.** The
payload gains `assets: [{ path, base64 }]`; `inlinePageAssets` takes an optional
local resolver beside the injected network fetcher, and `lib/page-inline.ts:99`
routes a relative ref to it instead of skipping. Everything downstream is
untouched: the budget, the priority ordering, the `</script>`/`</style`
escaping, the data-URI encoder, the report shape, `savePage`, the schema, the
CSP, `/p/[slug]/raw`.

This is cheap because of a decision made in the previous spec for a different
reason. `fetchAsset` was **injected** rather than imported so the walk could be
tested "with a fake and no socket". A local bundle is structurally that fake: a
synchronous map from a key to `{ contentType, bytes }`. The seam was cut for
tests and it pays out as an extension point.

**Rejected: pre-inline inside the shell script.** The script does the
substitution in JXA and posts one finished document, for a zero-line server
diff. It reimplements, inside a single-quoted shell string that `npm test`
cannot reach: `</script>` escaping, the `</style` refusal, base64 measured
encoded, budget priority, and nested CSS resolved against the stylesheet's own
directory. The admin folder drop recorded under *Next* below would then need a
third copy. This is the objection the 2026-08-03 spec raised, and it is still
the right one.

**Rejected: store assets as rows and serve them from `/p/[slug]/a/[path]`.**
Genuinely the better architecture in a project without this CSP — no 2 MB
pressure, no base64 in storage, and a shared library cached across pages. It
needs a host expression in `script-src`, which is exactly what
`app/p/[slug]/raw/route.ts:7-21` exists to prevent, and `'self'` will not serve:
the framed document has an opaque origin under `sandbox="allow-scripts"`, a trap
already recorded at `2026-08-03-inlining-page-assets-design.md:436-440`. It also
breaks the `<a download>` → edit → paste round trip, because the downloaded file
would reference URLs that resolve only on our origin.

## Data flow

```
tools/publish-dia-artifact.sh
  │  picks …/<uuid>/<name>/site/index.html
  │  collects the relative refs it already computes, transitively through .css
  │  resolves each against site/, requires it stay inside, reads the bytes
  ▼
POST /api/pages   { title, html, assets: [{ path, base64 }, …] }
  │  parsePagePayload      — structure only; 400 on a malformed bundle
  │  assetBundle(entries)  — Map<normalised path, Uint8Array>
  ▼
inlinePage(html, bundle)
  │  findExternalRefs(html)
  │    ├── absolute ref → fetchAsset()       network, allowlisted — unchanged
  │    └── relative ref → bundle lookup      memory — new
  │  same budget, same priority, same escaping, same data URIs
  ▼
savePage({ kind: "html", html })   one self-contained document, no schema change
  ▼
/p/[slug]/raw                      byte for byte, CSP unchanged
```

`path` in that payload is the ref **as written in the document** — unfolded and
still percent-encoded, `./css/../app.js?v=2` rather than `app.js`. Normalising is
the server's job, and only the server's. See *The script never folds a path*.

## Scope

All five relative shapes `lib/page-refs.ts` already finds — script, stylesheet,
image, `url()` and `@import` — not just `.js` and `.css`. A page shipping
`styles.css` and `logo.png` that rendered styled with a broken image would need
the report to explain why one sibling worked and the other did not, and that
distinction has no defensible reason behind it. Binary siblings travel base64 and
become data URIs exactly as a CDN image already does.

## Modules

New, all pure, all with a test in `tests/lib/`:

| Module | Job |
|---|---|
| `lib/asset-path.ts` | `normaliseAssetPath(ref): string \| null` — a bundle key, or null if it escapes. Strips `?query` and `#fragment`, percent-decodes, folds `.` and `..`, strips a leading `/`. |
| `lib/asset-media-type.ts` | `mediaTypeForPath(path): string` from the extension. A local file has no `Content-Type` header, and an image or font still needs one for its data URI. |
| `lib/page-bundle.ts` | `assetBundle(entries)` builds the map; `bundleResolver(map)` returns a `LocalResolver` with the same result shape as `AssetFetcher`. |

`lib/page-bundle.ts` is deliberately **not** folded into `lib/asset-policy.ts`.
That module's header comment is about SSRF and its content is a fetch policy; a
file that never crossed a socket has no fetch policy to be judged by. Putting one
inside the other would muddle the module a reviewer goes to in order to check the
allowlist.

Changed:

- **`lib/page-refs.ts`** — `resolveRef` takes a base descriptor in place of
  `baseUrl: string | null`:

  ```ts
  type RefBase =
    | { kind: "remote"; url: string } // a fetched stylesheet — today's behaviour
    | { kind: "local"; dir: string }; // keys relative to a directory in the bundle
  ```

  Two variants, not three. The **document** is `{ kind: "local", dir: "" }`,
  exported as `DOCUMENT_BASE`, rather than a variant of its own: an inline
  `<style>`'s `url(./bg.png)` and a `<link href="./bg.png">` must produce the
  same key, and one rule is what guarantees it rather than two that agree today.

  `ExternalRef` gains `localPath: string | null`, always normalised or null. This
  is what makes `url(../fonts/x.woff2)` inside a sibling `css/main.css` resolve
  to `fonts/x.woff2`: CSS resolves against the stylesheet, not the document, and
  `lib/page-refs.ts:85-89` already records that rule for the remote case.

- **`lib/page-inline.ts`** — a fourth, optional parameter (see *Signature*
  below). Line 99 routes rather than skipping. `MAX_FETCH_DEPTH` is renamed
  `MAX_REF_DEPTH` — module-private, so no ripple — because its comment says
  "counted in fetches" and a bundle read is not a fetch. It still bounds the same
  number for a different reason: a cycle, `a.css → b.css → a.css`, rather than a
  network budget. A false comment is worse than a rename.

- **`PRIORITY`** gains one tiebreak: **local before remote within a kind.** A
  sibling `app.js` is the page's own behaviour and nothing else can supply it; a
  CDN library is a dependency whose absence still leaves the HTML rendering.

- **`lib/page-payload.ts`** — validates `assets`, and owns `MAX_UPLOAD_BYTES`
  (3 MB) and `MAX_ASSET_COUNT` (50). They live here rather than in
  `lib/page-html.ts` because they describe a request body, which is what this
  module parses.

- **`app/api/pages/route.ts`** — the body cap becomes `MAX_UPLOAD_BYTES`; it
  builds the bundle and passes it through. Its two 413 bodies currently say
  "That page is larger than 2 MB", which becomes wrong, and get the real number.
  They stay the single authority the shell script echoes.

Unchanged, and this is the point: `inlinePage(html, bundle = new Map())` leaves
`app/page-actions.ts`, `scripts/backfill-page-assets.mjs`, `savePage`, the
schema, the CSP, `/p/[slug]/raw` and `SkippedAssets` without a single edited
line.

### Signature

```ts
inlinePageAssets(html, fetchAsset, budgetBytes, local?: LocalResolver)
```

A fourth optional parameter rather than a `sources: { remote, local }` object.
`tests/lib/page-inline.test.ts` calls this positionally in about twenty cases,
and those cases **are** the regression suite for "nothing changed for absolute
refs". Their evidential value comes from being untouched: a reviewer can see at a
glance that no remote-path assertion moved. Rewriting them all to pass an object
buries the real change and invites a stray edit to an assertion nobody
re-derives.

## The size limits

One constant currently does two jobs: `MAX_PAGE_BYTES` (2 MB) caps both the
request body (`readBoundedBody(request, MAX_PAGE_BYTES)`) and the stored document
(`validatePageHtml`). After this change those measure different things — the body
carries HTML plus assets, binary ones inflated a third by base64; the document
carries HTML plus inlined assets. So they split:

| Constant | Value | Bounds |
|---|---|---|
| `MAX_UPLOAD_BYTES` | 3 MB | the request body |
| `MAX_PAGE_BYTES` | 2 MB, unchanged | the stored document |

3 MB is chosen the way `MAX_PDF_BYTES` was: it sits under nginx's
`client_max_body_size 4m` (`docs/DEPLOYMENT.md` item 11), so raising it needs no
SSH session and no nginx reload, and a rejection is this app's own message rather
than a raw 413 Next never sees.

The stored document stays at 2 MB. Every page row is copied whole by the nightly
`VACUUM INTO`, and the existing budget machinery already reports what will not
fit, scripts first. Raising it would also need a third number, since a 3 MB body
cannot hold a 3 MB document plus its base64 overhead.

**No per-asset cap server-side.** The streaming body cap bounds the sum already,
and a single oversized asset then earns the useful report line — "would not fit
inside the 2 MB page limit" — instead of a flat 413 that names nothing.

## The report

`SKIP_REASONS` splits what is currently one reason:

| Key | Text shown to Jenn | When |
|---|---|---|
| `relative` (existing) | is a file next to the page, and only the page itself is published | No bundle was sent — the admin paste box, the extension |
| `missing` (new) | was not found next to the page | A bundle was sent and this file was not in it, or its ref escaped the artifact folder |

Two reasons rather than one because the cure differs. The first means *publish it
with the script instead*; the second means *the artifact is broken*.

A malformed `assets` **structure** is a 400 — the client is ours and is broken,
the same way `parsePagePayload` already 400s on a bad `groups` array. An asset
that cannot be **used** is reported and never fails the publish.

All three existing report surfaces are unchanged and pick the new reason up for
free: `skipped` in the 201 body, the `⚠` lines in the shell script, and
`SkippedAssets` in both admin write paths.

## The shell script

**One shared JXA prelude, two programs.** `osascript -l JavaScript` accepts
multiple `-e` flags and they share scope — verified — so the ref-collection and
path-resolution helpers live in one shell variable interpolated into both the
picker's describe call and the body builder. There is no copy-paste pair to
drift. The prelude must avoid backticks as well as single quotes, since it rides
inside a double-quoted shell string; `$.NSString` is safe, because `$` followed
by `.` is not a parameter name and bash leaves it literal.

### The script never folds a path

This is the rule that keeps the two sides honest.

To **read** a file it concatenates (`root + "/" + ref`) and hands the result to
`NSURL.URLByResolvingSymlinksInPath`, letting the OS fold `.`, `..` and symlinks
— then requires the resolved path to sit under the resolved root.

To **key** an asset it sends the ref **verbatim and unfolded**. The server
normalises bundle keys with the same `normaliseAssetPath` it normalises the
document's own refs with, so `./css/../app.js?v=2` and `app.js` collapse
identically on both sides *by construction* rather than by two implementations
agreeing.

The duplicated logic is therefore nothing. And if the script picks the wrong file
for a ref, that file is reported **missing** — never served as the wrong bytes.

For a nested ref the key is `dirname(cssRef) + "/" + rawRef`, still unfolded, and
the server folds it to the same value it computes for that ref under
`{ kind: "local", dir }`.

### Path containment is the security control

The script reads files from Jenn's machine and publishes them at a public URL.
A ref of `../../../../.ssh/id_rsa` in a model-authored artifact would exfiltrate
a private key. Two controls, and the second is the one usually missed:

1. Resolve **both** the root and the candidate through
   `URLByResolvingSymlinksInPath`, then require `full.indexOf(root + "/") === 0`.
   Resolving both through the same function is what stops `/tmp` versus
   `/private/tmp` splitting them — comparing a resolved path against an
   unresolved root is the classic bug in this check.
2. **Symlinks are covered by that, and a string check on `..` is not.** A
   symlink inside `site/` pointing at `~/.ssh` has no `..` in its ref at all.
   Verified rejected.

Containment and existence are separate questions: a ref may resolve inside the
root and simply not exist. Both must pass, and the file must be a regular file.

### Collection is transitive, one level

`localRefs` becomes `collectRefs` and returns the list it already builds
internally and currently discards: it accumulates the distinct refs in a `seen{}`
map and returns only `n`, so the paths this feature needs are computed and thrown
away one line before the function ends (`tools/publish-dia-artifact.sh:186-209`).

After the document's own refs, any collected ref ending `.css` is read and its
`url()` and `@import` targets collected too. Without this, `<link
href="css/main.css">` whose stylesheet names a local `.woff2` publishes styled
with a fallback typeface — precisely the Google Fonts failure that motivated the
server's depth-2 rule. One level here matches `MAX_REF_DEPTH` there.

### The picker

`describe_artifacts` emits `title⇥total⇥missing`. A ref is *missing* when
containment fails, or the target is not a readable regular file.

| Condition | Row |
|---|---|
| `missing > 0` | `Crêpes — Fri 1 Aug 14:32  ⚠ 2 missing files` |
| `missing = 0`, `total > 0` | `Crêpes — Fri 1 Aug 14:32  + 3 files` |
| `total = 0` | `Crêpes — Fri 1 Aug 14:32` |

The existing `⚠ 3 linked files` marker means "these will be missing", which is
now false for the resolvable case. A marker that appears on every row is one
nobody reads — the lesson `tools/publish-dia-artifact.sh:447` already records
about the old `find`-based count — so the `⚠` is kept for exactly the case that
is still actionable.

`candidate_rows` carries a fifth column. `--list`, `--latest` and the
title-search path read the same rows and get it free. Duplicate-label suffixing
is unaffected: it operates on finished label strings.

The post-selection `warn` at line 453 inverts — it fires on `missing`, not on
`total` — and its wording changes from "will not be published" to "are not on
disk".

### Two guards

**No asset-count cap in the script.** The server owns `MAX_ASSET_COUNT` and 400s
past it with a message naming the limit, which the existing `die "The site said
$STATUS: $PAYLOAD"` prints. Duplicating the constant would let the two drift into
silently dropping files.

**A local collection ceiling of 200 refs**, which is a resource guard against a
pathological artifact making the script read hundreds of files before it posts —
deliberately not a protocol constant, so it has nothing to stay in step with.

An artifact with no siblings sends no `assets` field and behaves exactly as it
does today.

## Testing

Unit tests in `tests/lib/`, per the convention in `CLAUDE.md`. No test opens a
socket and no test touches a filesystem.

**`asset-path.test.ts`** — `./app.js`; `css/../app.js`; `app.js?v=2#x`;
`%20spaced.css`; `caf%C3%A9.css`; `/app.js` with the leading slash dropped;
`../secret`, `css/../../secret`, `..` and `""` all null; a malformed `%zz` does
not throw; `..\..\x` stays one literal segment, **pinned** so nobody "fixes" it
into a traversal; idempotent under a second pass. Also `css/` → `"css"` rather
than null: a trailing slash needs no special case, because no bundle key is ever
a directory, so it is reported missing by the rule that already exists.

**The order of operations inside `normaliseAssetPath` is load-bearing** and gets
its own test. Split on `/` **before** percent-decoding, or `%2F` decodes into a
separator and invents a segment; drop empty and `.` segments while folding, so a
leading `/` needs no separate rule; and reject a `..` that pops an empty stack, so
`/../secret` is null rather than being clamped to `secret` by a fold that runs
before the slash is dropped.

**`asset-media-type.test.ts`** — each extension; uppercase; no extension; a dot
in a directory but not the filename (`v1.2/app`); unknown →
`application/octet-stream`.

**`page-bundle.test.ts`** — key hit and miss; keys normalised at construction, so
`./a.js` and `a.js` collapse; an entry whose path will not normalise dropped at
construction; `<script src="styles.css">` skipped as `wrongType` through the
existing `contentTypeMatches`, so that rule keeps one implementation.

**`page-refs.test.ts`** — `localPath` always normalised or null;
`url(./f.woff2)` in bundle css `css/main.css` → `css/f.woff2`;
`url(../img/bg.png)` → `img/bg.png`; an absolute ref inside a bundle stylesheet
stays `relative: false` and still goes to the network; the remote-base cases
unchanged.

**`page-inline.test.ts`** — local script inlined and its `</script>` escaped;
local `<link>` → `<style>` with `media` preserved; local css → local font at
depth 2; a depth-3 chain reports `tooDeep`; an `@import` cycle terminates;
`</style` in a local css → `unsafe`; the local-before-remote budget tiebreak with
the result still passing `validatePageHtml`; a local css that `@import`s Google
Fonts; a second pass over an already-inlined document is a no-op. Plus the two
that pin the reason split: a ref absent from a **non-empty** bundle → `missing`;
a ref with an **empty** bundle → `relative`. A `refuseLocal` resolver that throws
mirrors the existing `refuse` fetcher, proving the bundle is never consulted for
an absolute ref.

**`page-payload.test.ts`** — `assets` absent, null and `[]`; not an array → 400;
bad entry types → 400; non-base64 → 400; over `MAX_ASSET_COUNT` → 400 naming the
limit; a 2.9 MB `html` field still rejected by `validatePageHtml` even though the
body cap is now 3 MB.

**Not unit-tested, and deliberately.** `lib/asset-fetch.ts`, which is unchanged,
and the bash and JXA. `npm test` is vitest only; there is no shell harness and
this does not add one. `DIA_ARTIFACTS` is the manual hook, and it exists for
exactly this.

## Manual verification

A fixture tree under `$DIA_ARTIFACTS`:

```
<uuid>/plain/site/index.html          no siblings
<uuid>/styled/site/index.html         → styles.css, app.js
                  /styles.css         → url(./fonts/x.woff2)
                  /fonts/x.woff2
<uuid>/nested/site/index.html         → css/main.css
                  /css/main.css       → url(../img/bg.png)
                  /img/bg.png
<uuid>/broken/site/index.html         → missing.css, not on disk
<uuid>/evil/site/index.html           → ../../secret/key.pem
                  /escape -> outside   a symlink
<uuid>/mixed/site/index.html          → a local app.js and a cdnjs script
```

1. `--list` markers: `plain` bare, `styled` `+ 3 files`, `broken` and `evil`
   `⚠ 1 missing file`.
2. `styled` published with `--local` renders styled, with the right typeface.
3. **On `/p/<slug>`, the Network tab shows zero third-party requests.** The
   invariant the 2026-08-03 spec set, restated because this change is the one
   most likely to break it.
4. `evil` publishes 201 and `key.pem`'s contents appear **nowhere** — grep the
   response body *and* the stored row. This check is not optional.
5. `broken` → 201 with `⚠ … was not found next to the page`.
6. `PageEditor`'s `<a download>` on `styled` yields a self-contained file, and
   re-pasting it is a no-op. Re-pasting a **bare** `index.html` reports every
   sibling, confirming the regression below announces itself.
7. Publishing the same artifact twice at the same slug is idempotent.
8. `npm run lint`, `npx tsc --noEmit`, `npm test`, `npm run build`.

## Accepted costs

**Re-pasting a bare `index.html` into `PageEditor` strips siblings a previous
publish folded in.** The paste box cannot see a directory, so the refs come back
relative and unresolvable. It is self-announcing: `SkippedAssets` names every
sibling that just went missing, which is the signal to re-run the script instead.
The cure is the follow-up below.

**A depth-3 local chain is not reached.** `index.html → css/main.css →
@import base.css → url(font)` stops at the font and reports "sits behind too many
stylesheets to reach". One rule for local and remote rather than two to keep in
step; raising it is a one-constant change if it ever bites.

**An extensionless image ref is reported rather than guessed.**
`mediaTypeForPath` returns `application/octet-stream`, which
`contentTypeMatches` refuses for an image, so `<img src="logo">` is reported. The
alternative is sniffing bytes, which is a format parser this project has declined
twice already — see `validatePagePdf` and `validatePageHtml`.

## Unchanged, deliberately

- **The CSP and the sandbox.** Not one directive moves. If this change appears to
  need a CSP edit, something has gone wrong in it.
- **The schema.** No table, no column. The stored document is still one
  self-contained HTML string in `Page.html`.
- **`savePage`'s every-column invariant.**
- **`/p/[slug]/raw` serves `page.html` verbatim**, same headers, same CSP.
- **`HtmlPreview` stays `sandbox=""`.**
- **`tools/publish-extension`.** Dia serves from `chrome-untrusted://`, so the
  extension cannot see a file. It sends no `assets` field and gets the existing
  `relative` reason.
- **`scripts/backfill-page-assets.mjs`.** A stored page has no directory to read,
  so there is nothing local to recover. It keeps folding remote refs only and
  must **not** be extended to attempt local ones.

## Next

**A folder drop in the admin.** An `<input webkitdirectory>` or multi-file drop
beside the paste box in `NewPageForm` and `PageEditor`, so a whole artifact folder
can be published from the browser and the re-paste regression above has a cure.
Named as the next step rather than filed under *not doing*: the server side of it
is finished by this spec — it is the same `assets` payload from a different
reader — and what remains is two forms, a staging control and a client-side
reader. Its own spec.
