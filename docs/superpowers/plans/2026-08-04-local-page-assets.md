# Local Page Assets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A page published from a Dia artifact folds in the `.js`, `.css`, image and font files sitting beside its `index.html`, so it renders complete at `/p/[slug]` with no CSP change and no third-party request.

**Architecture:** `lib/page-inline.ts` already walks a document's asset refs and fills them from an **injected** fetcher. This adds a second byte source behind the same interface — an in-memory bundle uploaded with the document — and routes relative refs to it instead of skipping them. `tools/publish-dia-artifact.sh` collects those files, refusing any ref that escapes the artifact folder. Nothing changes in the schema, the CSP, `savePage`, or `/p/[slug]/raw`.

**Tech Stack:** Next.js App Router, TypeScript, Prisma/SQLite, Vitest, Tailwind v4. The publish tool is bash 3.2 + JXA (`osascript -l JavaScript`) — macOS ships no usable python3.

**Read first:** `docs/superpowers/specs/2026-08-04-local-page-assets-design.md` (this plan's spec) and `docs/superpowers/specs/2026-08-03-inlining-page-assets-design.md` (the inliner it extends).

---

## Ground rules for this codebase

Read these before Task 1. They are conventions from `CLAUDE.md` that this plan assumes:

- **Logic belongs in `lib/`** as a pure function with a test in `tests/lib/`. Components and Prisma access are not unit-tested; the pure modules underneath them are.
- **Comments explain the "why", especially the counter-intuitive.** Most comments here record a decision and the failure that motivated it. Do not add comments that restate the code. The comments in this plan's code blocks are part of the deliverable — keep them.
- **Imports use the `@/` alias** for repo-root-relative paths.
- **Run `npx prisma generate` before your first `npm test`** if you have a fresh checkout. This plan needs no migration.
- CI order is: `prisma generate` → `npm run lint` → `npx tsc --noEmit` → `npm test` → `npm run build`.

## File structure

| File | Status | Responsibility |
|---|---|---|
| `lib/asset-path.ts` | create | Turn a ref into a bundle key. The single normaliser both sides of the wire depend on. |
| `lib/asset-media-type.ts` | create | A media type from a file extension, for a file that arrived with no HTTP header. |
| `lib/page-bundle.ts` | create | The uploaded files as a keyed map, and a resolver over it shaped like `AssetFetcher`. |
| `lib/asset-policy.ts` | modify | One new skip reason. |
| `lib/page-refs.ts` | modify | Refs carry the bundle key they address; a stylesheet's base can be a bundle directory. |
| `lib/page-inline.ts` | modify | Route a relative ref to the bundle; local-before-remote budget order. |
| `lib/page-payload.ts` | modify | Validate the `assets` field; own the upload-size constants. |
| `app/api/pages/route.ts` | modify | Build the bundle and pass it in; correct the 413 text. |
| `tools/publish-dia-artifact.sh` | modify | Collect siblings, refuse escapes, report unresolvable refs in the picker. |
| `CLAUDE.md`, `tools/README.md` | modify | Document the behaviour. |

Untouched, and **do not change them**: `prisma/schema.prisma`, `app/p/[slug]/raw/route.ts` (the CSP), `lib/pages.ts` (`savePage`), `app/page-actions.ts`, `scripts/backfill-page-assets.mjs`, `components/admin/SkippedAssets.tsx`, `tools/publish-extension/`.

---

### Task 1: `lib/asset-path.ts` — the single normaliser

The keystone. The publish script uploads a file keyed by the ref **as written** (`css/../fonts/x.woff2`) and this function folds both that key and the document's own ref to the same value (`fonts/x.woff2`). Because only one implementation exists, the two sides cannot drift.

**Files:**
- Create: `lib/asset-path.ts`
- Test: `tests/lib/asset-path.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/asset-path.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { assetDir, joinRef, normaliseAssetPath } from "@/lib/asset-path";

describe("normaliseAssetPath", () => {
  it("keys a plain sibling by its own name", () => {
    expect(normaliseAssetPath("app.js")).toBe("app.js");
  });

  it("drops a leading ./", () => {
    expect(normaliseAssetPath("./app.js")).toBe("app.js");
  });

  it("folds a .. that stays inside", () => {
    expect(normaliseAssetPath("css/../app.js")).toBe("app.js");
  });

  it("strips a query and a fragment", () => {
    expect(normaliseAssetPath("app.js?v=2")).toBe("app.js");
    expect(normaliseAssetPath("app.js#top")).toBe("app.js");
    // The fragment splits first: a ? sitting inside a fragment is part of it.
    expect(normaliseAssetPath("app.js#a?b")).toBe("app.js");
  });

  it("percent-decodes a segment", () => {
    expect(normaliseAssetPath("%20spaced.css")).toBe(" spaced.css");
    expect(normaliseAssetPath("caf%C3%A9.css")).toBe("café.css");
  });

  it("drops a leading slash rather than treating it as a root", () => {
    expect(normaliseAssetPath("/app.js")).toBe("app.js");
  });

  it("collapses a doubled and a trailing separator", () => {
    expect(normaliseAssetPath("css//main.css")).toBe("css/main.css");
    // No special case for a trailing slash: no bundle key is ever a directory,
    // so this is reported missing by the rule that already exists.
    expect(normaliseAssetPath("css/")).toBe("css");
  });

  it("refuses a ref that climbs above the artifact", () => {
    expect(normaliseAssetPath("../secret")).toBeNull();
    expect(normaliseAssetPath("css/../../secret")).toBeNull();
    expect(normaliseAssetPath("..")).toBeNull();
  });

  // Order of operations. Empty segments are dropped by the same pass that folds
  // "..", so the leading slash needs no separate rule and cannot be removed
  // AFTER a fold that had already clamped this to "secret".
  it("refuses an absolute ref that then climbs out", () => {
    expect(normaliseAssetPath("/../secret")).toBeNull();
  });

  // Splitting before decoding is the whole safety property. These two must NOT
  // be equal: the first is one segment whose literal filename contains slashes,
  // the second is a three-segment path that folds. Decoding first would collapse
  // them into each other, which is the traversal this ordering exists to refuse.
  it("does not let an encoded separator invent a segment", () => {
    expect(normaliseAssetPath("a%2F..%2Fsecret")).toBe("a/../secret");
    expect(normaliseAssetPath("a/../secret")).toBe("secret");
  });

  it("returns null for nothing addressable", () => {
    expect(normaliseAssetPath("")).toBeNull();
    expect(normaliseAssetPath("./")).toBeNull();
  });

  it("does not throw on malformed percent-encoding", () => {
    expect(normaliseAssetPath("100%discount.css")).toBe("100%discount.css");
  });

  // A backslash is a legal character in a macOS filename, so this is ONE segment
  // and not a traversal. Pinned so nobody "fixes" it into one.
  it("treats a backslash as an ordinary character", () => {
    expect(normaliseAssetPath("..\\..\\x")).toBe("..\\..\\x");
  });

  it("is idempotent", () => {
    const once = normaliseAssetPath("./css/../a%20b.js?v=1");
    expect(once).toBe("a b.js");
    expect(normaliseAssetPath(once as string)).toBe(once);
  });
});

describe("joinRef", () => {
  it("leaves a document ref untouched", () => {
    expect(joinRef("", "./a.js")).toBe("./a.js");
  });

  it("prefixes a stylesheet's own directory without folding", () => {
    expect(joinRef("css", "../fonts/x.woff2")).toBe("css/../fonts/x.woff2");
  });
});

describe("assetDir", () => {
  it("is empty for a key at the root", () => {
    expect(assetDir("app.js")).toBe("");
  });

  it("is everything before the last separator", () => {
    expect(assetDir("css/main.css")).toBe("css");
    expect(assetDir("a/b/c.css")).toBe("a/b");
  });
});

// The property the whole scheme rests on. tools/publish-dia-artifact.sh uploads
// an unfolded key and never normalises; the server folds both that key and the
// document's own ref. This test is where those two meet.
describe("the script and the server agree on a key", () => {
  it("folds an unfolded upload key to the same value as the ref", () => {
    const uploaded = joinRef(assetDir("css/main.css"), "../fonts/x.woff2");
    expect(uploaded).toBe("css/../fonts/x.woff2");
    expect(normaliseAssetPath(uploaded)).toBe("fonts/x.woff2");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/lib/asset-path.test.ts`

Expected: FAIL — `Failed to resolve import "@/lib/asset-path"`.

- [ ] **Step 3: Write the implementation**

Create `lib/asset-path.ts`:

```ts
// A relative ref inside a document and a key into an uploaded bundle are one
// string seen from two sides, and this is the only place either becomes the
// other. tools/publish-dia-artifact.sh deliberately does NOT normalise: it
// uploads refs verbatim and lets this function key both the bundle and the
// document's refs, so the two agree by construction rather than by two
// implementations of one rule staying in step.

// Null when a ref addresses nothing inside the bundle: it is empty, or it climbs
// above the root. Callers report that; they never guess a substitute.
export function normaliseAssetPath(ref: string): string | null {
  // Fragment first, then query: a `?` appearing after a `#` is part of the
  // fragment, not a query string.
  const path = ref.split("#")[0].split("?")[0];

  // Split BEFORE decoding. Decoding first would let %2F become a separator and
  // invent a segment out of a filename, which is the traversal this refuses.
  const segments: string[] = [];
  for (const raw of path.split("/")) {
    const segment = decodeSegment(raw);
    // "" covers a leading slash, a trailing one and a doubled one, so none of
    // those needs a rule of its own.
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      // Nothing left to climb out of, so the ref names something outside the
      // artifact. Refused rather than clamped to the root.
      if (segments.length === 0) return null;
      segments.pop();
      continue;
    }
    segments.push(segment);
  }

  return segments.length === 0 ? null : segments.join("/");
}

// decodeURIComponent throws on a lone `%`, which a filename may legitimately
// contain — "100% done.css" is not exotic. The raw segment is a better guess
// than no path at all, and if it is wrong the asset is reported missing rather
// than served as some other file's bytes.
function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

// Concatenation only — folding is normaliseAssetPath's single job, and doing any
// of it here would be the second implementation this module exists to avoid.
// The separator is omitted for the document, whose refs are already keys.
export function joinRef(dir: string, ref: string): string {
  return dir === "" ? ref : `${dir}/${ref}`;
}

// The directory a bundle stylesheet's own refs resolve against: its key minus
// the last segment, and "" for a stylesheet at the root — which joinRef then
// leaves its refs untouched, exactly as the document's are.
export function assetDir(key: string): string {
  const cut = key.lastIndexOf("/");
  return cut === -1 ? "" : key.slice(0, cut);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/lib/asset-path.test.ts`

Expected: PASS, 17 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/asset-path.ts tests/lib/asset-path.test.ts
git commit -m "feat: add the single normaliser for local asset paths

Turns a ref into a bundle key. Splits on / before percent-decoding so an
encoded separator cannot invent a segment, and refuses a .. that climbs
above the root rather than clamping it.

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 2: `lib/asset-media-type.ts` — a media type without a header

A fetched asset arrives with `Content-Type`. A file lifted off disk arrives with nothing, and an image or font still needs a media type for the data URI it becomes.

**Files:**
- Create: `lib/asset-media-type.ts`
- Test: `tests/lib/asset-media-type.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/asset-media-type.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { mediaTypeForPath } from "@/lib/asset-media-type";

describe("mediaTypeForPath", () => {
  it("types the two text kinds a page carries", () => {
    expect(mediaTypeForPath("app.js")).toBe("text/javascript");
    expect(mediaTypeForPath("app.mjs")).toBe("text/javascript");
    expect(mediaTypeForPath("styles.css")).toBe("text/css");
  });

  it("types an image", () => {
    expect(mediaTypeForPath("logo.png")).toBe("image/png");
    expect(mediaTypeForPath("photo.jpg")).toBe("image/jpeg");
    expect(mediaTypeForPath("photo.jpeg")).toBe("image/jpeg");
    expect(mediaTypeForPath("icon.svg")).toBe("image/svg+xml");
  });

  it("types a font", () => {
    expect(mediaTypeForPath("x.woff2")).toBe("font/woff2");
    expect(mediaTypeForPath("x.ttf")).toBe("font/ttf");
  });

  it("ignores the case of the extension", () => {
    expect(mediaTypeForPath("LOGO.PNG")).toBe("image/png");
  });

  // Reported rather than guessed. contentTypeMatches refuses octet-stream for an
  // image, so <img src="logo"> becomes a report line — and sniffing bytes would
  // be a format parser, which validatePagePdf and validatePageHtml have both
  // already declined to be.
  it("falls back to octet-stream rather than guessing", () => {
    expect(mediaTypeForPath("logo")).toBe("application/octet-stream");
    expect(mediaTypeForPath("thing.xyz")).toBe("application/octet-stream");
  });

  // The dot belongs to a directory, not to the filename.
  it("does not read an extension out of a directory name", () => {
    expect(mediaTypeForPath("v1.2/app")).toBe("application/octet-stream");
    expect(mediaTypeForPath("v1.2/app.js")).toBe("text/javascript");
  });

  it("does not treat a dotfile as an extension", () => {
    expect(mediaTypeForPath(".gitignore")).toBe("application/octet-stream");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/lib/asset-media-type.test.ts`

Expected: FAIL — `Failed to resolve import "@/lib/asset-media-type"`.

- [ ] **Step 3: Write the implementation**

Create `lib/asset-media-type.ts`:

```ts
// A fetched asset carries a Content-Type header; a file lifted off Jenn's disk
// carries nothing, and an image or a font still needs a media type for the data
// URI it becomes. The extension is the only signal there is.
const MEDIA_TYPES: Record<string, string> = {
  js: "text/javascript",
  mjs: "text/javascript",
  css: "text/css",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  otf: "font/otf",
};

// application/octet-stream for anything unrecognised, which contentTypeMatches
// then refuses for every kind except a font whose path says otherwise. So an
// extensionless <img src="logo"> is reported rather than guessed at. Sniffing
// the bytes would make this a format parser, which validatePagePdf and
// validatePageHtml have both already declined to be.
export function mediaTypeForPath(path: string): string {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  // `<= 0` covers both no extension at all and a dotfile, whose leading dot
  // names the file rather than an extension.
  if (dot <= 0) return "application/octet-stream";
  return (
    MEDIA_TYPES[name.slice(dot + 1).toLowerCase()] ?? "application/octet-stream"
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/lib/asset-media-type.test.ts`

Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/asset-media-type.ts tests/lib/asset-media-type.test.ts
git commit -m "feat: derive a media type from an asset's extension

A file uploaded beside a document has no Content-Type header, and an image
or font needs one for its data URI. Unrecognised falls back to
octet-stream, which contentTypeMatches then reports rather than guessing.

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 3: `lib/page-bundle.ts` — the uploaded files as a byte source

The local half of `lib/page-inline.ts`'s two sources. Same result shape as `AssetFetcher`, so the walk never branches on which one answered. Synchronous, because nothing here opens a socket — which is also why it is not in `lib/asset-fetch.ts`.

**Files:**
- Create: `lib/page-bundle.ts`
- Modify: `lib/asset-policy.ts` (one new skip reason, in `SKIP_REASONS`)
- Test: `tests/lib/page-bundle.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/page-bundle.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { assetBundle, bundleResolver } from "@/lib/page-bundle";
import { SKIP_REASONS } from "@/lib/asset-policy";

const encoder = new TextEncoder();
const bytes = (text: string) => encoder.encode(text);

describe("assetBundle", () => {
  it("keys an entry by its normalised path", () => {
    const bundle = assetBundle([
      { path: "./css/../app.js?v=2", bytes: bytes("var a=1;") },
    ]);
    expect([...bundle.keys()]).toEqual(["app.js"]);
  });

  it("collapses two spellings of one file onto one key", () => {
    const bundle = assetBundle([
      { path: "./a.js", bytes: bytes("first") },
      { path: "a.js", bytes: bytes("second") },
    ]);
    expect(bundle.size).toBe(1);
  });

  // Kept under a key no ref could ever produce, it would be dead weight in the
  // upload budget and invisible in the report.
  it("drops an entry whose path addresses nothing inside the bundle", () => {
    expect(assetBundle([{ path: "../secret", bytes: bytes("x") }]).size).toBe(0);
  });
});

describe("bundleResolver", () => {
  it("answers with the bytes and a derived content type", () => {
    const resolve = bundleResolver(
      assetBundle([{ path: "app.js", bytes: bytes("var a=1;") }]),
    );

    const result = resolve("app.js", "script");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.asset.contentType).toBe("text/javascript");
    expect(new TextDecoder().decode(result.asset.bytes)).toBe("var a=1;");
  });

  // A bundle WAS uploaded and this file was not in it, which is a different
  // sentence from "only the page itself is published" — so it is a different
  // reason. lib/page-inline.ts is what chooses between the two.
  it("reports a key the bundle does not hold as missing", () => {
    const resolve = bundleResolver(assetBundle([]));

    expect(resolve("app.js", "script")).toEqual({
      ok: false,
      reason: SKIP_REASONS.missing,
    });
  });

  // Checked by the same rule a fetched asset is checked by, so a confused
  // artifact writing <script src="styles.css"> is reported rather than having
  // CSS inlined into a <script> element.
  it("refuses a file whose extension contradicts the ref", () => {
    const resolve = bundleResolver(
      assetBundle([{ path: "styles.css", bytes: bytes("a{}") }]),
    );

    expect(resolve("styles.css", "script")).toEqual({
      ok: false,
      reason: SKIP_REASONS.wrongType,
    });
  });

  it("accepts a font and an image on their extensions", () => {
    const resolve = bundleResolver(
      assetBundle([
        { path: "fonts/x.woff2", bytes: bytes("W") },
        { path: "logo.png", bytes: bytes("P") },
      ]),
    );

    expect(resolve("fonts/x.woff2", "font").ok).toBe(true);
    expect(resolve("logo.png", "image").ok).toBe(true);
  });

  // Pins the contract rather than a limitation: the resolver is handed
  // ExternalRef.localPath, which lib/page-refs.ts has already normalised.
  // Normalising again here would put the rule in a second place.
  it("expects an already-normalised key", () => {
    const resolve = bundleResolver(
      assetBundle([{ path: "app.js", bytes: bytes("x") }]),
    );

    expect(resolve("./app.js", "script").ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/lib/page-bundle.test.ts`

Expected: FAIL — `Failed to resolve import "@/lib/page-bundle"`.

- [ ] **Step 3: Add the new skip reason**

In `lib/asset-policy.ts`, inside `SKIP_REASONS`, add `missing` and extend the comment on `relative` so the difference between the two is recorded where they sit side by side:

```ts
export const SKIP_REASONS = {
  notAllowed: "is not on the list of allowed sources",
  fetchFailed: "could not be fetched",
  wrongType: "was not the kind of file it claimed to be",
  tooBig: "would not fit inside the 2 MB page limit",
  // These two are the same ref for two different reasons, and the cure differs.
  // `relative` means no files were uploaded beside the document at all — the
  // admin's paste box and the browser extension, neither of which can see a
  // directory — so the answer is to publish with tools/publish-dia-artifact.sh
  // instead. `missing` means files WERE uploaded and this one was not among
  // them, or its ref pointed outside the artifact folder, so the answer is that
  // the artifact is broken.
  relative: "is a file next to the page, and only the page itself is published",
  missing: "was not found next to the page",
  unsafe: "could not be inlined safely",
  tooDeep: "sits behind too many stylesheets to reach",
} as const;
```

- [ ] **Step 4: Write the implementation**

Create `lib/page-bundle.ts`:

```ts
import { normaliseAssetPath } from "@/lib/asset-path";
import { mediaTypeForPath } from "@/lib/asset-media-type";
import {
  contentTypeMatches,
  SKIP_REASONS,
  type RefKind,
} from "@/lib/asset-policy";
import type { AssetFetchResult } from "@/lib/asset-fetch";

// The files uploaded beside a document, keyed the way lib/asset-path.ts keys the
// document's own refs.
export type AssetBundle = Map<string, Uint8Array>;

export type AssetEntry = { path: string; bytes: Uint8Array };

// The local half of lib/page-inline.ts's two byte sources. It shares
// AssetFetcher's result shape so the walk never branches on which source
// answered, and it is synchronous because nothing here opens a socket — which is
// also why it does not live in lib/asset-fetch.ts, whose whole subject is the
// SSRF surface of one that does.
export type LocalResolver = (path: string, kind: RefKind) => AssetFetchResult;

// Keys are normalised here, once, so a caller uploading "./a.js" and a document
// referencing "a.js" meet. An entry addressing nothing inside the bundle is
// dropped rather than stored under a key no ref can produce.
export function assetBundle(entries: AssetEntry[]): AssetBundle {
  const bundle: AssetBundle = new Map();
  for (const entry of entries) {
    const key = normaliseAssetPath(entry.path);
    if (key === null) continue;
    bundle.set(key, entry.bytes);
  }
  return bundle;
}

export function bundleResolver(bundle: AssetBundle): LocalResolver {
  return (path, kind) => {
    const bytes = bundle.get(path);
    if (!bytes) return { ok: false, reason: SKIP_REASONS.missing };

    // Derived from the extension, then judged by the same rule that judges a
    // fetched response. A local file cannot serve a 404 page into a <script>,
    // but a confused artifact can point <script src> at its stylesheet, and one
    // shared check reports that instead of inlining CSS as JavaScript.
    const contentType = mediaTypeForPath(path);
    if (!contentTypeMatches(kind, contentType, path)) {
      return { ok: false, reason: SKIP_REASONS.wrongType };
    }

    return { ok: true, asset: { contentType, bytes } };
  };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/lib/page-bundle.test.ts`

Expected: PASS, 9 tests.

- [ ] **Step 6: Confirm nothing else moved**

Run: `npx vitest run tests/lib/asset-policy.test.ts`

Expected: PASS — adding a key to `SKIP_REASONS` changes no existing behaviour.

- [ ] **Step 7: Commit**

```bash
git add lib/page-bundle.ts lib/asset-policy.ts tests/lib/page-bundle.test.ts
git commit -m "feat: resolve a page's assets from an uploaded bundle

The local half of the inliner's two byte sources, shaped like AssetFetcher
so the walk does not branch. Splits SKIP_REASONS.relative in two: no files
uploaded at all is a different sentence, with a different cure, from a file
that was not among the ones uploaded.

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 4: `lib/page-refs.ts` — refs carry the key they address

Every ref learns the bundle key it points at, and a stylesheet's base can now be a directory inside the bundle rather than only a URL.

**A note on scope, so you do not "fix" it back:** this task changes `findCssRefs`'s second parameter from `string | null` to a `RefBase`, which breaks 7 call sites in `tests/lib/page-refs.test.ts`. That is deliberate, and it is a different judgement from Task 5, where `inlinePageAssets` gains a *fourth optional* parameter specifically to leave its tests untouched. The difference: here the parameter's **meaning** genuinely widens from two cases to three addresses, and every call site is named by `tsc --noEmit` with a mechanical one-token fix. There, the existing arguments mean exactly what they always did, and rewriting twenty call sites would bury the real change.

**Files:**
- Modify: `lib/page-refs.ts`
- Test: `tests/lib/page-refs.test.ts`

- [ ] **Step 1: Write the failing tests**

Add these to the `findExternalRefs` describe block in `tests/lib/page-refs.test.ts`, just after the existing `"marks a relative ref, which is reported and never fetched"` test:

```ts
  it("carries the bundle key a relative ref addresses", () => {
    const [ref] = findExternalRefs(`<script src="./css/../app.js?v=2"></script>`);
    expect(ref.relative).toBe(true);
    // `url` is what the author wrote, so the report can name it; `localPath` is
    // what the bundle is actually asked for.
    expect(ref.url).toBe("./css/../app.js?v=2");
    expect(ref.localPath).toBe("app.js");
  });

  it("leaves localPath null on a ref that climbs out of the artifact", () => {
    const [ref] = findExternalRefs(`<img src="../../secret/key.pem">`);
    expect(ref.relative).toBe(true);
    expect(ref.localPath).toBeNull();
  });

  // An inline <style> is not a stylesheet of its own, so its refs key from the
  // document root — the same key a <link href="./img/bg.png"> would produce.
  // That equality is why the document is a local base with an empty directory
  // rather than a variant of its own.
  it("keys a relative url() in an inline style from the document root", () => {
    const [ref] = findExternalRefs(`<style>a{background:url(./img/bg.png)}</style>`);
    expect(ref.localPath).toBe("img/bg.png");
  });

  it("carries no localPath on an absolute ref", () => {
    const [ref] = findExternalRefs(`<script src="${CDN}/a.js"></script>`);
    expect(ref.relative).toBe(false);
    expect(ref.localPath).toBeNull();
  });
```

Add these to the `findCssRefs` describe block:

```ts
  it("resolves a relative url() against a bundle stylesheet's own directory", () => {
    const [ref] = findCssRefs(`@font-face{src:url(../fonts/a.woff2)}`, {
      kind: "local",
      dir: "css",
    });

    expect(ref.relative).toBe(true);
    expect(ref.localPath).toBe("fonts/a.woff2");
  });

  // A sibling stylesheet naming a Google font must still reach the network. The
  // bundle base changes where RELATIVE refs resolve from, not what counts as
  // relative.
  it("keeps a bundle stylesheet's absolute ref on the network", () => {
    const [ref] = findCssRefs(
      `@import url("https://fonts.googleapis.com/css2?family=Inter");`,
      { kind: "local", dir: "css" },
    );

    expect(ref.relative).toBe(false);
    expect(ref.localPath).toBeNull();
    expect(ref.url).toBe("https://fonts.googleapis.com/css2?family=Inter");
  });
```

- [ ] **Step 2: Migrate the existing `findCssRefs` call sites**

Also in `tests/lib/page-refs.test.ts`, update the import and the 7 existing `findCssRefs` calls. This is a token swap, nothing more:

- Add `DOCUMENT_BASE` to the import from `@/lib/page-refs`.
- Each `findCssRefs(css, null)` becomes `findCssRefs(css, DOCUMENT_BASE)`.
- The one with an offset, `findCssRefs(html.slice(7, -8), null, 7)`, becomes `findCssRefs(html.slice(7, -8), DOCUMENT_BASE, 7)`.
- Each `findCssRefs(css, "https://…")` becomes `findCssRefs(css, { kind: "remote", url: "https://…" })`, keeping the same URL string.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run tests/lib/page-refs.test.ts`

Expected: FAIL — `DOCUMENT_BASE` is not exported, and `localPath` does not exist on the ref type.

- [ ] **Step 4: Add the base type and the key**

In `lib/page-refs.ts`, extend the imports at the top:

```ts
import { assetKindForUrl, type RefKind } from "@/lib/asset-policy";
import { joinRef, normaliseAssetPath } from "@/lib/asset-path";
```

Add the base type immediately after the `RefForm` type:

```ts
// Where a relative ref resolves from. Two variants, not three: the document is a
// local base with an empty directory, because an inline <style>'s url(./bg.png)
// and a <link href="./bg.png"> must produce the same bundle key, and one rule is
// what guarantees that rather than two that happen to agree today.
export type RefBase =
  | { kind: "remote"; url: string }
  | { kind: "local"; dir: string };

export const DOCUMENT_BASE: RefBase = { kind: "local", dir: "" };
```

Add `localPath` to `ExternalRef`, after the existing `relative` field:

```ts
  relative: boolean;
  // The bundle key a relative ref addresses, normalised — or null when it
  // addresses nothing inside the bundle, which is the case a report names and a
  // lookup never attempts. Always null when `relative` is false.
  localPath: string | null;
```

- [ ] **Step 5: Rewrite `resolveRef`**

Replace the `Target` type and the whole `resolveRef` function:

```ts
type Target = { url: string; relative: boolean; localPath: string | null };

function absolute(url: string): Target {
  return { url, relative: false, localPath: null };
}

// `base` is where a relative ref resolves from: a directory inside the uploaded
// bundle, or the URL of a stylesheet that was fetched.
function resolveRef(raw: string, base: RefBase): Target | null {
  const value = decodeAttrUrl(raw).trim();
  if (!value || IGNORED.test(value)) return null;
  if (SCHEME.test(value)) return absolute(value);
  // A protocol-relative URL is absolute with the page's scheme, which is https
  // in production. Upgrading it here means the allowlist gets to judge it
  // rather than it being silently dropped as relative.
  if (value.startsWith("//")) return absolute(`https:${value}`);

  if (base.kind === "local") {
    return {
      // The raw text, so the report names what the author wrote.
      url: value,
      relative: true,
      // joinRef concatenates and normaliseAssetPath folds. Never the other way
      // round, and never anywhere else — tools/publish-dia-artifact.sh uploads
      // its keys unfolded precisely so this is the only implementation.
      localPath: normaliseAssetPath(joinRef(base.dir, value)),
    };
  }

  try {
    // Resolved against the stylesheet's own URL, not the page's — that is what
    // CSS does, and it is what makes url(./fonts/x.woff2) inside a jsdelivr
    // stylesheet reach jsdelivr. Resolution preserves the host, so this cannot
    // reach off the allowlist; the allowlist is checked again regardless.
    return absolute(new URL(value, base.url).toString());
  } catch {
    return null;
  }
}
```

- [ ] **Step 6: Thread the base through both finders**

In `findExternalRefs`, replace all three `resolveRef(…, null)` calls with `resolveRef(…, DOCUMENT_BASE)`, and add `localPath: target.localPath,` to each of the four `refs.push({…})` object literals — the `<script>`, `<link>`, `<img>` and (in `findCssRefs`) both CSS cases.

Change the inline-`<style>` recursion at the end of `findExternalRefs`:

```ts
    refs.push(...findCssRefs(match[2], DOCUMENT_BASE, contentAt));
```

Change `findCssRefs`'s signature and its doc comment, and pass `base` to both `resolveRef` calls inside it:

```ts
// `offset` is where this CSS sits inside the document, so a ref found in an
// inline <style> carries a span the document's own splicer can use. It is 0
// when the CSS was fetched or read from the bundle and is being rewritten on its
// own.
export function findCssRefs(
  css: string,
  base: RefBase,
  offset = 0,
): ExternalRef[] {
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run tests/lib/page-refs.test.ts`

Expected: PASS. Every pre-existing assertion still holds — `localPath` is additive.

- [ ] **Step 8: Check the compiler for callers you have not reached yet**

Run: `npx tsc --noEmit`

Expected: errors **only** in `lib/page-inline.ts`, which still calls `findCssRefs(css, ref.url)` and does not yet know about `localPath`. Task 5 fixes exactly those. If anything else is named, you have missed a call site — do not proceed until the only remaining errors are in `lib/page-inline.ts`.

- [ ] **Step 9: Commit**

```bash
git add lib/page-refs.ts tests/lib/page-refs.test.ts
git commit -m "feat: carry the bundle key a relative ref addresses

Refs gain localPath, and a stylesheet's base can be a directory in the
uploaded bundle rather than only a URL. The document is a local base with an
empty directory, so an inline <style>'s url() and a <link href> key
identically by construction.

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 5: `lib/page-inline.ts` — route a relative ref to the bundle

The change the whole feature turns on: line 99's `if (ref.relative) return skip(…)` becomes a choice of byte source.

**Two things to know before you start.**

*The signature gains a fourth optional parameter and does not become an object.* `tests/lib/page-inline.test.ts` calls `inlinePageAssets` positionally in about twenty places, and those calls are the regression evidence that absolute refs still behave identically. Their value comes from being untouched — a reviewer can see at a glance that no remote-path assertion moved. Do not refactor them.

*One deliberate behaviour change.* Today `relative` is checked *before* `unsafe`, so `@import "./a.css" print;` with no bundle reports "only the page itself is published". After this it reports "could not be inlined safely", which is the better answer: a media condition is why the rule cannot be replaced by its stylesheet's text, and that is true wherever the bytes live. No existing test covers this combination.

**Files:**
- Modify: `lib/page-inline.ts`
- Test: `tests/lib/page-inline.test.ts`

- [ ] **Step 1: Write the failing tests**

Add the two helpers to `tests/lib/page-inline.test.ts`, just below the existing `refuse` fetcher:

```ts
import { assetBundle, bundleResolver, type LocalResolver } from "@/lib/page-bundle";

// The real resolver, driven from bytes made here. It is pure, so there is nothing
// to fake — and using it means these tests exercise the same content-type rule
// the server will.
function localBundle(files: Record<string, string>): LocalResolver {
  return bundleResolver(
    assetBundle(
      Object.entries(files).map(([path, body]) => ({
        path,
        bytes: encoder.encode(body),
      })),
    ),
  );
}

// The mirror of `refuse`, for the other source.
const refuseLocal: LocalResolver = () => {
  throw new Error("the bundle must not be consulted");
};
```

Add these cases inside the existing `describe("inlinePageAssets", …)` block:

```ts
  it("inlines a script sitting beside the document", async () => {
    const html = `<body><script src="./app.js"></script></body>`;

    const result = await inlinePageAssets(html, refuse, 10_000, localBundle({
      "app.js": "var a=1;",
    }));

    expect(result.html).toBe(`<body><script>var a=1;</script></body>`);
    expect(result.skipped).toEqual([]);
  });

  it("escapes a closing tag hiding in a local script", async () => {
    const html = `<script src="app.js"></script>`;

    const result = await inlinePageAssets(html, refuse, 10_000, localBundle({
      "app.js": `d.write("</script>")`,
    }));

    expect(result.html).toBe(`<script>d.write("<\\/script>")</script>`);
  });

  it("turns a local stylesheet into a style element, keeping media", async () => {
    const html = `<link rel="stylesheet" media="print" href="./styles.css">`;

    const result = await inlinePageAssets(html, refuse, 10_000, localBundle({
      "styles.css": "a{color:red}",
    }));

    expect(result.html).toBe(`<style media="print">a{color:red}</style>`);
  });

  // The local mirror of the Google Fonts case that set the depth rule: one level
  // would inline the stylesheet and leave the typeface wrong with nothing to
  // report.
  it("reaches a local font through a local stylesheet", async () => {
    const html = `<link rel="stylesheet" href="css/main.css">`;

    const result = await inlinePageAssets(html, refuse, 100_000, localBundle({
      "css/main.css": `@font-face{src:url(../fonts/x.woff2)}`,
      "fonts/x.woff2": "WOFF",
    }));

    expect(result.html).toContain("data:font/woff2;base64,");
    expect(result.skipped).toEqual([]);
  });

  it("stops at the third level and says so", async () => {
    const html = `<link rel="stylesheet" href="a.css">`;

    const result = await inlinePageAssets(html, refuse, 100_000, localBundle({
      "a.css": `@import "b.css";`,
      "b.css": `@font-face{src:url(x.woff2)}`,
      "x.woff2": "WOFF",
    }));

    expect(result.skipped).toEqual([
      { url: "x.woff2", reason: SKIP_REASONS.tooDeep },
    ]);
  });

  // There is no network to exhaust here, so the depth cap is the only thing
  // terminating this. That is the second job the constant does.
  it("terminates on a stylesheet cycle", async () => {
    const html = `<link rel="stylesheet" href="a.css">`;

    const result = await inlinePageAssets(html, refuse, 100_000, localBundle({
      "a.css": `@import "b.css";`,
      "b.css": `@import "a.css";`,
    }));

    expect(result.skipped).toEqual([
      { url: "a.css", reason: SKIP_REASONS.tooDeep },
    ]);
  });

  it("reports a ref the bundle does not hold", async () => {
    const html = `<link rel="stylesheet" href="./styles.css">`;

    const result = await inlinePageAssets(html, refuse, 10_000, localBundle({
      "app.js": "var a=1;",
    }));

    expect(result.html).toBe(html);
    expect(result.skipped).toEqual([
      { url: "./styles.css", reason: SKIP_REASONS.missing },
    ]);
  });

  it("reports a ref that climbs out of the artifact", async () => {
    const html = `<img src="../../secret/key.pem">`;

    const result = await inlinePageAssets(html, refuse, 10_000, localBundle({
      "app.js": "var a=1;",
    }));

    expect(result.html).toBe(html);
    expect(result.skipped).toEqual([
      { url: "../../secret/key.pem", reason: SKIP_REASONS.missing },
    ]);
  });

  it("never consults the bundle for an absolute ref", async () => {
    const html = `<script src="${ANIME}"></script>`;
    const fetcher = fakeFetcher({ [ANIME]: { contentType: JS, body: "var a=1;" } });

    const result = await inlinePageAssets(html, fetcher, 10_000, refuseLocal);

    expect(result.html).toBe(`<script>var a=1;</script>`);
  });

  // A sibling stylesheet naming a Google font still reaches the network: the
  // bundle changes where relative refs resolve from, not what counts as one.
  it("fetches a remote font named by a local stylesheet", async () => {
    const font = "https://fonts.gstatic.com/x.woff2";
    const html = `<link rel="stylesheet" href="css/main.css">`;
    const fetcher = fakeFetcher({
      [font]: { contentType: "font/woff2", body: "WOFF" },
    });

    const result = await inlinePageAssets(html, fetcher, 100_000, localBundle({
      "css/main.css": `@font-face{src:url(${font})}`,
    }));

    expect(result.html).toContain("data:font/woff2;base64,");
    expect(result.skipped).toEqual([]);
  });

  // Local before remote WITHIN a kind. The budget of 30 fits exactly one of
  // these two scripts, and the remote one is first in the document — so without
  // the tiebreak this passes with the answers swapped.
  it("spends a tight budget on the local script before the remote one", async () => {
    const html = `<script src="${ANIME}"></script><script src="app.js"></script>`;
    const fetcher = fakeFetcher({ [ANIME]: { contentType: JS, body: "y" } });

    const result = await inlinePageAssets(html, fetcher, 30, localBundle({
      "app.js": "var a=1;",
    }));

    expect(result.html).toContain("<script>var a=1;</script>");
    expect(result.html).toContain(ANIME);
    expect(result.skipped).toEqual([{ url: ANIME, reason: SKIP_REASONS.tooBig }]);
  });

  it("skips a local stylesheet that would close its own tag", async () => {
    const html = `<link rel="stylesheet" href="styles.css">`;

    const result = await inlinePageAssets(html, refuse, 10_000, localBundle({
      "styles.css": `a{content:"</style>"}`,
    }));

    expect(result.html).toBe(html);
    expect(result.skipped).toEqual([
      { url: "styles.css", reason: SKIP_REASONS.unsafe },
    ]);
  });
```

**Do not modify** the existing test `"reports a relative ref rather than trying to fetch it"`. It passes no resolver and must keep expecting `SKIP_REASONS.relative` — that is the proof the admin paste box and the extension did not regress.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/lib/page-inline.test.ts`

Expected: FAIL — `inlinePageAssets` takes 3 arguments, and `@/lib/page-bundle`'s resolver is not wired in.

- [ ] **Step 3: Update the imports and the depth constant**

In `lib/page-inline.ts`, extend the imports:

```ts
import {
  applyReplacements,
  escapeScriptBody,
  findCssRefs,
  findExternalRefs,
  type ExternalRef,
  type RefBase,
  type Replacement,
} from "@/lib/page-refs";
import { assetDir } from "@/lib/asset-path";
import {
  bundleResolver,
  type AssetBundle,
  type LocalResolver,
} from "@/lib/page-bundle";
import type { AssetFetchResult } from "@/lib/asset-fetch";
```

Replace `MAX_FETCH_DEPTH` and its comment block (it is module-private, so nothing outside is affected):

```ts
// Two levels deep, and no third. Counted in resolutions, whether a fetch or a
// bundle read: a <link> to fonts.googleapis.com is one for the stylesheet and a
// second for each woff2 it names, which is the case this exists for, and a
// sibling styles.css naming a local font is the same two. An @import inside an
// inline <style> is still the first level, because an inline <style> is neither
// a fetch nor a read.
//
// It bounds two different things at once. For a fetch it is a budget: recursion
// over input the server does not control is a problem waiting to happen. For a
// bundle read, where there is no network to spend, it is what terminates a
// cycle — a.css importing b.css importing a.css.
const MAX_REF_DEPTH = 2;
```

Update the two other references to the old name in this file (the `depth > …` test in `inlineRef` and nothing else).

- [ ] **Step 4: Thread the resolver through the walk**

Change `inlinePageAssets` to take the fourth parameter and pass it down:

```ts
export async function inlinePageAssets(
  html: string,
  fetchAsset: AssetFetcher,
  budgetBytes: number,
  // Absent when nothing was uploaded beside the document, which is a different
  // thing from an empty one — see inlineRef.
  local?: LocalResolver,
): Promise<InlineResult> {
  const refs = findExternalRefs(html);
  if (refs.length === 0) return { html, skipped: [] };

  const skipped: SkippedRef[] = [];
  const budget: Budget = { remaining: budgetBytes };
  const edits = await inlineRefs(refs, fetchAsset, budget, skipped, 1, local);
  …
```

Add `local: LocalResolver | undefined` as the final parameter of `inlineRefs`, pass it to its `inlineRef` call, and add the sort tiebreak:

```ts
  const ordered = [...refs].sort(
    (a, b) =>
      PRIORITY[a.kind] - PRIORITY[b.kind] ||
      // Local before remote within a kind. A sibling app.js is the page's own
      // behaviour and nothing else can supply it; a CDN library is a dependency
      // whose absence still leaves the document rendering.
      Number(b.relative) - Number(a.relative) ||
      a.start - b.start,
  );
```

- [ ] **Step 5: Rewrite the head of `inlineRef`**

Replace the four guard lines and the fetch with this, keeping the rest of the function as it is apart from renaming `fetched` to `result`:

```ts
  // Both of these are decided before either source is consulted, and both apply
  // to both: an @import carrying a media condition is no safer for having come
  // off a disk, and the depth cap bounds a local cycle as well as a fetch.
  if (ref.unsafe) return skip(SKIP_REASONS.unsafe);
  if (depth > MAX_REF_DEPTH) return skip(SKIP_REASONS.tooDeep);

  let result: AssetFetchResult;
  if (ref.relative) {
    // No bundle at all: the admin's paste box and the browser extension, where
    // only the document itself was ever uploaded. A different sentence from a
    // bundle that did not contain the file, so a different reason.
    if (!local) return skip(SKIP_REASONS.relative);
    result =
      ref.localPath === null
        ? { ok: false, reason: SKIP_REASONS.missing }
        : local(ref.localPath, ref.kind);
  } else {
    // Checked here as well as inside the fetcher, so the rule is covered by a
    // test that uses a fake and a fake cannot make an unlisted host reachable.
    if (!isAllowedAssetUrl(ref.url)) return skip(SKIP_REASONS.notAllowed);
    result = await fetchAsset(ref.url, ref.kind);
  }

  if (!result.ok) return skip(result.reason);
```

Then in the rest of `inlineRef`, replace `fetched.asset` with `result.asset` in all three places, and pass `local` as a final argument to the `inlineStyle` call.

- [ ] **Step 6: Give `inlineStyle` the right base for nested refs**

Add `local: LocalResolver | undefined` as `inlineStyle`'s final parameter, change its `findCssRefs` call, pass `local` down, and add the helper below it:

```ts
  const nested = await inlineRefs(
    findCssRefs(css, styleBase(ref)),
    fetchAsset,
    budget,
    skipped,
    depth + 1,
    local,
  );
```

```ts
// Where a stylesheet's own relative refs resolve from. A fetched stylesheet
// resolves them against its URL, which is what CSS does; a bundle stylesheet
// resolves them against its own directory inside the bundle, which is the same
// rule against a different kind of address.
function styleBase(ref: ExternalRef): RefBase {
  if (!ref.relative) return { kind: "remote", url: ref.url };
  // Non-null here: inlineRef refuses a relative ref with no localPath before any
  // bytes are resolved, so this is only reached for one that has a key.
  return { kind: "local", dir: assetDir(ref.localPath ?? "") };
}
```

- [ ] **Step 7: Let `inlinePage` take a bundle**

Replace the exported binding at the bottom of the file:

```ts
// The injected form above is the tested one; this is the one-line binding the
// three write paths share, so none of them has to know which fetcher or which
// budget is the right one. The bundle defaults to empty, which is what leaves
// app/page-actions.ts and scripts/backfill-page-assets.mjs untouched.
export function inlinePage(
  html: string,
  bundle: AssetBundle = new Map(),
): Promise<InlineResult> {
  return inlinePageAssets(
    html,
    fetchAsset,
    inlineBudget(html),
    // An empty bundle passes UNDEFINED, not a resolver over nothing. "No files
    // were uploaded" and "this file was not among the uploaded ones" are
    // different report lines, and the paste box must keep the first.
    bundle.size === 0 ? undefined : bundleResolver(bundle),
  );
}
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx vitest run tests/lib/page-inline.test.ts`

Expected: PASS — the new cases and every pre-existing one.

- [ ] **Step 9: Run the whole suite and the compiler**

Run: `npx vitest run && npx tsc --noEmit`

Expected: PASS and no output. `app/page-actions.ts` and `scripts/backfill-page-assets.mjs` compile unchanged, because `bundle` has a default.

- [ ] **Step 10: Commit**

```bash
git add lib/page-inline.ts tests/lib/page-inline.test.ts
git commit -m "feat: inline a page's local sibling assets from an uploaded bundle

A relative ref now resolves against files uploaded beside the document
instead of being skipped. The budget spends on local refs before remote ones
within a kind, since nothing else can supply a sibling. MAX_FETCH_DEPTH
becomes MAX_REF_DEPTH: it now also terminates a local @import cycle, where
there is no network budget for it to be about.

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 6: `lib/page-payload.ts` — validate the bundle, own the upload limits

**Files:**
- Modify: `lib/page-payload.ts`
- Test: `tests/lib/page-payload.test.ts`

- [ ] **Step 1: Write the failing tests**

Add a new describe block to `tests/lib/page-payload.test.ts`, and add `MAX_ASSET_COUNT` to the existing import from `@/lib/page-payload`:

```ts
describe("parsePagePayload assets", () => {
  const base = { title: "T", html: "<p>x</p>" };

  it("defaults to no assets when the field is absent", () => {
    const result = parsePagePayload(base);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.assets).toEqual([]);
  });

  // The browser extension cannot see a file at all, so it sends neither — and
  // absent and null must mean the same thing to it.
  it("treats null and an empty array as no assets", () => {
    for (const assets of [null, []]) {
      const result = parsePagePayload({ ...base, assets });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.payload.assets).toEqual([]);
    }
  });

  it("decodes an entry's base64 into bytes", () => {
    const result = parsePagePayload({
      ...base,
      assets: [{ path: "./app.js", base64: "dmFyIGE9MTs=" }],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.assets).toHaveLength(1);
    // Carried through UNTOUCHED. Normalising is lib/asset-path.ts's job, reached
    // through assetBundle; doing any of it here would be a second place the rule
    // lives.
    expect(result.payload.assets[0].path).toBe("./app.js");
    expect(new TextDecoder().decode(result.payload.assets[0].bytes)).toBe(
      "var a=1;",
    );
  });

  it("refuses a bundle that is not an array", () => {
    expect(parsePagePayload({ ...base, assets: "app.js" })).toEqual({
      ok: false,
      error: "assets must be an array.",
    });
  });

  it("refuses an entry that is not an object", () => {
    expect(parsePagePayload({ ...base, assets: ["app.js"] }).ok).toBe(false);
  });

  it("refuses an entry with no usable path", () => {
    for (const path of [undefined, "", "   ", 7]) {
      expect(
        parsePagePayload({ ...base, assets: [{ path, base64: "" }] }).ok,
      ).toBe(false);
    }
  });

  // Buffer.from does not throw on invalid base64, it silently truncates — so
  // without this check a corrupt asset would be stored rather than reported.
  it("refuses contents that are not valid base64", () => {
    for (const base64 of ["!!!!", "abc", "ab=c", 7, undefined]) {
      expect(
        parsePagePayload({ ...base, assets: [{ path: "a.js", base64 }] }).ok,
      ).toBe(false);
    }
  });

  it("accepts an empty file", () => {
    const result = parsePagePayload({
      ...base,
      assets: [{ path: "a.js", base64: "" }],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.assets[0].bytes).toHaveLength(0);
  });

  // Failing loudly with the limit named beats dropping files silently, which is
  // why tools/publish-dia-artifact.sh applies no cap of its own.
  it("refuses more files than the limit and names it", () => {
    const assets = Array.from({ length: MAX_ASSET_COUNT + 1 }, (_, i) => ({
      path: `a${i}.js`,
      base64: "",
    }));

    const result = parsePagePayload({ ...base, assets });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain(String(MAX_ASSET_COUNT));
  });

  // The body limit rose to 3 MB; the DOCUMENT limit did not. These two now
  // measure different things and validatePageHtml still owns the second.
  it("still refuses a document over the page limit", () => {
    const html = `<p>${"x".repeat(2 * 1024 * 1024)}</p>`;
    expect(parsePagePayload({ title: "T", html }).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/lib/page-payload.test.ts`

Expected: FAIL — `MAX_ASSET_COUNT` is not exported and `payload.assets` does not exist.

- [ ] **Step 3: Add the constants and the type**

At the top of `lib/page-payload.ts`, add the import and the three constants:

```ts
import { validatePageHtml } from "@/lib/page-html";
import { slugify } from "@/lib/page-slug";
import type { AssetEntry } from "@/lib/page-bundle";

// The whole request body, which now carries a document AND the files beside it.
// Deliberately larger than MAX_PAGE_BYTES, because those two stopped measuring
// the same thing: this holds assets as base64, a third larger than the bytes,
// while MAX_PAGE_BYTES holds them inlined into the document.
//
// 3 MB is chosen the way MAX_PDF_BYTES was — it sits under nginx's
// client_max_body_size 4m (docs/DEPLOYMENT.md item 11), so raising it needs no
// SSH session, and a rejection is this app's own message rather than a raw 413
// that Next never sees and cannot explain.
export const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;

// A generous ceiling on how many files one page may bring, not a tuned number.
// Past it the publish fails with this limit named, rather than dropping files
// silently: tools/publish-dia-artifact.sh applies no cap of its own precisely so
// there is one authority and the two cannot drift.
export const MAX_ASSET_COUNT = 50;

// Buffer.from(x, "base64") does not throw on invalid input, it silently
// truncates, so an unchecked payload would store a corrupt asset rather than
// report one. Padding is required because every client here produces it.
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;
```

Add the field to `PagePayload`:

```ts
  slug: string | null;
  // The files uploaded beside the document, empty when there were none. Paths
  // are carried through EXACTLY as the caller sent them: the ref as written in
  // the document, unfolded and still percent-encoded. Normalising belongs to
  // lib/asset-path.ts, reached through assetBundle, and doing any of it here
  // would put that rule in a second place.
  assets: AssetEntry[];
```

- [ ] **Step 4: Add the validator**

Add below `parsePagePayload` in the same file:

```ts
type AssetsResult =
  | { ok: true; assets: AssetEntry[] }
  | { ok: false; error: string };

// A malformed bundle is a 400, not a report line. Every client here is ours, so a
// bad shape means one of them is broken — the same call this module already makes
// for a bad `groups` array. An asset that cannot be USED is a different thing,
// and lib/page-inline.ts reports those without ever failing the publish.
//
// Server-only, for the Buffer decode. lib/page-inline.ts records the same note
// for the same reason.
function parseAssets(value: unknown): AssetsResult {
  if (!Array.isArray(value)) {
    return { ok: false, error: "assets must be an array." };
  }
  if (value.length > MAX_ASSET_COUNT) {
    return {
      ok: false,
      error: `A page may carry at most ${MAX_ASSET_COUNT} files.`,
    };
  }

  const assets: AssetEntry[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      return { ok: false, error: "Each asset must be an object." };
    }

    const { path, base64 } = entry as Record<string, unknown>;
    if (typeof path !== "string" || path.trim() === "") {
      return { ok: false, error: "Each asset needs a path." };
    }
    if (typeof base64 !== "string") {
      return { ok: false, error: `The contents of ${path} are missing.` };
    }
    if (base64.length % 4 !== 0 || !BASE64.test(base64)) {
      return {
        ok: false,
        error: `The contents of ${path} are not valid base64.`,
      };
    }

    assets.push({ path, bytes: new Uint8Array(Buffer.from(base64, "base64")) });
  }

  return { ok: true, assets };
}
```

And replace the final return of `parsePagePayload`:

```ts
  let assets: AssetEntry[] = [];
  // Absent and null mean the same thing, as they do for `groups`: a caller that
  // uploaded nothing beside the document.
  if (raw.assets !== undefined && raw.assets !== null) {
    const parsed = parseAssets(raw.assets);
    if (!parsed.ok) return { ok: false, error: parsed.error };
    assets = parsed.assets;
  }

  return {
    ok: true,
    payload: { title, html: html.html, groups, slug, assets },
  };
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/lib/page-payload.test.ts`

Expected: PASS — the new block and every pre-existing case.

- [ ] **Step 6: Commit**

```bash
git add lib/page-payload.ts tests/lib/page-payload.test.ts
git commit -m "feat: validate the uploaded asset bundle

Splits the one size constant in two: the request body may now reach 3 MB
because it carries base64 assets, while the stored document stays at 2 MB.
Invalid base64 is a 400 rather than a silent truncation, since Buffer.from
does not throw on it.

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 7: `app/api/pages/route.ts` — build the bundle and pass it in

Routes are not unit-tested in this project — the pure modules underneath them are, and every rule this route depends on is already covered by Tasks 1–6. Verification here is the compiler, the linter, and the manual checks in Task 12.

**Files:**
- Modify: `app/api/pages/route.ts`

- [ ] **Step 1: Update the imports**

Replace the `MAX_PAGE_BYTES` import — it becomes unused, and `npm run lint` will fail if you leave it:

```ts
import { MAX_UPLOAD_BYTES, parsePagePayload } from "@/lib/page-payload";
import { assetBundle } from "@/lib/page-bundle";
```

so the import block reads:

```ts
import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { savePage } from "@/lib/pages";
import { readPageKind } from "@/lib/page-kind";
import { MAX_UPLOAD_BYTES, parsePagePayload } from "@/lib/page-payload";
import { assetBundle } from "@/lib/page-bundle";
import { inlinePage } from "@/lib/page-inline";
import { readBoundedBody } from "@/lib/bounded-body";
```

- [ ] **Step 2: Add the derived message**

Above the `OPTIONS` handler:

```ts
// Derived rather than written out, so the number the teacher is shown cannot
// drift from the number enforced. tools/publish-dia-artifact.sh prints this
// verbatim, which is why that script carries no size limit of its own.
const TOO_BIG = `That upload is larger than ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB.`;
```

- [ ] **Step 3: Raise the body cap**

Replace both size checks inside `publish`. Note the old text said "That page is larger than 2 MB", which is now wrong twice over — it is an upload, and the limit moved:

```ts
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: TOO_BIG }, { status: 413 });
  }

  const text = await readBoundedBody(request, MAX_UPLOAD_BYTES);
  if (text === null) {
    return NextResponse.json({ error: TOO_BIG }, { status: 413 });
  }
```

- [ ] **Step 4: Pass the bundle to the inliner**

Add `assets` to the destructuring:

```ts
  const { title, html, groups, slug, assets } = parsed.payload;
```

and change the inline call, keeping it exactly where it is — between validation and the save:

```ts
  // Between validation and the save, so what lands in the database is the
  // self-contained document. The bundle holds the files uploaded beside it, and
  // assetBundle keys them the way the document's own refs are keyed.
  // /p/[slug]/raw still serves page.html byte for byte, which is what keeps the
  // download-and-re-edit round trip honest.
  const inlined = await inlinePage(html, assetBundle(assets));
```

- [ ] **Step 5: Verify the compiler and the linter**

Run: `npx tsc --noEmit && npm run lint`

Expected: no output from either.

- [ ] **Step 6: Run the whole suite**

Run: `npx vitest run`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/api/pages/route.ts
git commit -m "feat: accept a page's sibling files at POST /api/pages

Raises the body cap to MAX_UPLOAD_BYTES and derives the 413 message from it,
so the limit the script reports cannot drift from the limit enforced.

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 8: `tools/dia-fixtures.sh` — a tree to verify the script against

There is no automated harness for the publish script — `npm test` is vitest only — so `$DIA_ARTIFACTS` is the hook that makes it testable at all. This fills it. Committing the generator rather than pasting the same twenty commands into three later tasks is what makes the manual checks repeatable.

**Files:**
- Create: `tools/dia-fixtures.sh`

- [ ] **Step 1: Write the script**

Create `tools/dia-fixtures.sh`:

```bash
#!/bin/bash
# Builds a disposable Dia artifact tree and prints its path, for verifying
# tools/publish-dia-artifact.sh by hand.
#
# There is no automated harness for that script — npm test is vitest only — so
# $DIA_ARTIFACTS is the hook that makes it testable, and this is what fills it.
# Each artifact below exists for one numbered check in
# docs/superpowers/plans/2026-08-04-local-page-assets.md.
#
#   export DIA_ARTIFACTS="$(tools/dia-fixtures.sh)"
#   tools/publish-dia-artifact.sh --list
set -euo pipefail

ROOT="${TMPDIR:-/tmp}/dia-fixtures"
rm -rf "$ROOT"

# Dia's own layout is <uuid>/<name>/site/index.html. The uuid is arbitrary here;
# what matters is that the script finds artifacts by that path shape.
art() { mkdir -p "$ROOT/uuid-$1/$1/site"; printf '%s' "$ROOT/uuid-$1/$1/site"; }

# 1. Self-contained. No marker on the picker row at all.
P=$(art plain)
cat > "$P/index.html" <<'HTML'
<html><head><title>Plain</title></head><body><h1>Nothing linked</h1></body></html>
HTML

# 2. Siblings that all resolve, including a font reached THROUGH the stylesheet
#    rather than named by the document. That is the transitive case.
P=$(art styled)
mkdir -p "$P/fonts"
cat > "$P/index.html" <<'HTML'
<html><head><title>Styled</title>
<link rel="stylesheet" href="styles.css">
<script src="./app.js?v=2"></script></head>
<body><h1 id="t">Styled</h1></body></html>
HTML
cat > "$P/styles.css" <<'CSS'
@font-face{font-family:F;src:url(./fonts/x.woff2) format("woff2")}
h1{font-family:F,serif;color:#c8102e}
CSS
printf 'not-a-real-woff2' > "$P/fonts/x.woff2"
printf 'document.getElementById("t").textContent = "Styled by app.js";' > "$P/app.js"

# 3. A stylesheet in a subdirectory reaching back out with ../ — the case that
#    proves refs resolve against the STYLESHEET and not the document.
P=$(art nested)
mkdir -p "$P/css" "$P/img"
cat > "$P/index.html" <<'HTML'
<html><head><title>Nested</title>
<link rel="stylesheet" href="css/main.css"></head>
<body><h1>Nested</h1></body></html>
HTML
printf 'body{background:url(../img/bg.png)}' > "$P/css/main.css"
printf 'not-a-real-png' > "$P/img/bg.png"

# 4. A ref to a file that is simply not there.
P=$(art broken)
cat > "$P/index.html" <<'HTML'
<html><head><title>Broken</title>
<link rel="stylesheet" href="missing.css"></head>
<body><h1>Broken</h1></body></html>
HTML

# 5. Two escapes: a .. traversal and a symlink pointing out of the artifact.
#    NEITHER may ever be published. The secret sits outside site/ deliberately —
#    this is the check that must not be skipped.
P=$(art evil)
mkdir -p "$ROOT/uuid-evil/evil/secret"
printf 'BEGIN-PRIVATE-KEY-DO-NOT-PUBLISH' > "$ROOT/uuid-evil/evil/secret/key.pem"
ln -s "$ROOT/uuid-evil/evil/secret" "$P/escape"
cat > "$P/index.html" <<'HTML'
<html><head><title>Evil</title></head><body>
<img src="../secret/key.pem"><img src="escape/key.pem">
</body></html>
HTML

# 6. A local script beside a CDN one. Both must end up inlined, by the two
#    different sources.
P=$(art mixed)
cat > "$P/index.html" <<'HTML'
<html><head><title>Mixed</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/animejs/3.2.1/anime.min.js"></script>
<script src="local.js"></script></head><body><h1>Mixed</h1></body></html>
HTML
printf 'window.__local = true;' > "$P/local.js"

printf '%s' "$ROOT"
```

- [ ] **Step 2: Make it executable and check it builds the tree**

```bash
chmod +x tools/dia-fixtures.sh
export DIA_ARTIFACTS="$(tools/dia-fixtures.sh)"
find "$DIA_ARTIFACTS" -name index.html | sort
```

Expected: six paths, one per artifact, each ending `/site/index.html`.

- [ ] **Step 3: Confirm the existing script still lists them**

Run: `tools/publish-dia-artifact.sh --list`

Expected: six rows. The markers will still be the **old** `⚠ N linked files` — Task 9 changes that. If you see no rows, the path shape is wrong; fix the fixture before continuing.

- [ ] **Step 4: Commit**

```bash
git add tools/dia-fixtures.sh
git commit -m "test: add a Dia artifact fixture tree for manual verification

\$DIA_ARTIFACTS is the only hook that makes publish-dia-artifact.sh testable,
since npm test is vitest only. One artifact per case, including the
traversal and symlink escapes that must never publish.

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 9: `tools/publish-dia-artifact.sh` — collect refs and mark the unresolvable

The picker half. After this task the script still uploads only `index.html`; what changes is that it knows which siblings exist and says so.

**Files:**
- Modify: `tools/publish-dia-artifact.sh`

- [ ] **Step 1: Add the shared JXA prelude**

Insert this **above** `gui_alert()`, after the `WORK`/`trap` lines. It must be defined before either program that uses it.

```bash
# Shared by describe_artifacts and build_body, passed as the FIRST -e to both so
# they see the same functions: osascript concatenates multiple -e flags into one
# script and they share scope. Two copies of these rules would let the picker
# call a file present and the upload skip it.
#
# No single quotes anywhere below — it rides inside a single-quoted shell string.
# The class ["\x27] is how a quote of that kind is written when one cannot appear
# literally.
JXA_ASSETS='
ObjC.import("Foundation");

function readUtf8(path) {
  var s = $.NSString.stringWithContentsOfFileEncodingError(path, $.NSUTF8StringEncoding, null);
  // .js === undefined covers both an unreadable file and one that is not UTF-8.
  // s.isNil is a *method*; referencing it without calling it is always truthy.
  return s.js === undefined ? null : s.js;
}

// One filter for both collectors: a ref carrying a scheme, a protocol-relative
// one, or a bare fragment addresses nothing on this disk. Distinct refs in
// document order — the count labels the picker row and the list is what gets
// uploaded, and both come from this single pass.
function refSink() {
  var out = [], seen = {};
  return {
    add: function (u) {
      u = String(u).trim();
      if (!u) { return; }
      if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(u)) { return; }
      if (u.slice(0, 2) === "//" || u.charAt(0) === "#") { return; }
      if (!seen[u]) { seen[u] = 1; out.push(u); }
    },
    list: function () { return out; }
  };
}

function collectHtmlRefs(html) {
  var sink = refSink(), m, b, u;
  var attr = /(?:src|href)\s*=\s*"([^"]*)"/gi;
  while ((m = attr.exec(html)) !== null) { sink.add(m[1]); }
  // url(...) is the case that matters, not an afterthought: these artifacts put
  // their CSS in an inline <style>, so a background image is referenced this way
  // and no other. Counting attributes alone returned 0 for such a page, and 0 is
  // the value meaning self-contained.
  var block = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  while ((b = block.exec(html)) !== null) {
    var css = /url\(\s*(["\x27]?)([^)"\x27]*)\1\s*\)/gi;
    while ((u = css.exec(b[1])) !== null) { sink.add(u[2]); }
  }
  return sink.list();
}

// A stylesheet names files of its own, relative to IT. Without this a page whose
// styles.css reaches for a local .woff2 publishes with the wrong typeface and
// nothing to report — the same failure the Google Fonts case had before the
// server went two levels deep.
function collectCssRefs(css) {
  var sink = refSink(), u, i;
  var url = /url\(\s*(["\x27]?)([^)"\x27]*)\1\s*\)/gi;
  while ((u = url.exec(css)) !== null) { sink.add(u[2]); }
  var imp = /@import\s+(?:url\(\s*)?(["\x27]?)([^)"\x27;]*)\1\s*\)?/gi;
  while ((i = imp.exec(css)) !== null) { sink.add(i[2]); }
  return sink.list();
}

// A query or a fragment addresses the same file, so neither belongs in the name
// looked for on disk. This is the ONLY rewriting done here: the key uploaded is
// the ref verbatim, and folding . and .. belongs to the OS below and to
// lib/asset-path.ts on the server.
function stripRefSuffix(ref) { return ref.split("#")[0].split("?")[0]; }

function resolvePath(p) {
  var u = $.NSURL.fileURLWithPath(p).URLByResolvingSymlinksInPath;
  return u.js === undefined ? null : u.path.js;
}

// The absolute path a ref names, but only while it stays inside the artifact.
//
// Both sides go through the SAME resolver, which is what stops /tmp and
// /private/tmp splitting them — comparing a resolved path against an unresolved
// root is the classic bug in this check. Resolving also covers symlinks, which a
// string test for .. does not: a link inside site/ pointing at ~/.ssh has no ..
// in it at all, and this script publishes what it reads to a public URL.
function insideRoot(root, ref) {
  var r = resolvePath(root);
  var full = resolvePath(root + "/" + stripRefSuffix(ref));
  if (r === null || full === null || full === r) { return null; }
  return full.indexOf(r + "/") === 0 ? full : null;
}

function isRegularFile(path) {
  var isDir = Ref();
  if (!$.NSFileManager.defaultManager.fileExistsAtPathIsDirectory(path, isDir)) {
    return false;
  }
  return !isDir[0];
}

// Containment and existence are separate questions and both must pass: a ref can
// resolve inside the artifact and simply not be there.
function usableAsset(root, ref) {
  var full = insideRoot(root, ref);
  return full !== null && isRegularFile(full) ? full : null;
}

function refDir(ref) {
  var p = stripRefSuffix(ref);
  var cut = p.lastIndexOf("/");
  return cut === -1 ? "" : p.slice(0, cut);
}

// Concatenation only, matching joinRef in lib/asset-path.ts. The server folds it.
function joinRef(dir, ref) { return dir === "" ? ref : dir + "/" + ref; }

// A resource guard, NOT a protocol constant: it stops a pathological artifact
// making this read hundreds of files. MAX_ASSET_COUNT on the server is the limit
// that actually decides a publish, and duplicating that here would let the two
// drift into silently dropping files.
var MAX_COLLECTED = 200;

// Every ref the artifact needs: the document own, plus one level through each
// stylesheet. Keys are left unfolded on purpose.
function collectAllRefs(root, html) {
  var refs = collectHtmlRefs(html);
  var all = refs.slice(), seen = {};
  all.forEach(function (r) { seen[r] = 1; });

  refs.forEach(function (r) {
    if (all.length >= MAX_COLLECTED) { return; }
    if (!/\.css$/i.test(stripRefSuffix(r))) { return; }
    var full = usableAsset(root, r);
    if (full === null) { return; }
    var css = readUtf8(full);
    if (css === null) { return; }
    collectCssRefs(css).forEach(function (n) {
      var key = joinRef(refDir(r), n);
      if (!seen[key] && all.length < MAX_COLLECTED) {
        seen[key] = 1;
        all.push(key);
      }
    });
  });

  return all;
}

// .../<uuid>/<name>/site/index.html -> the site directory
function siteRoot(indexPath) {
  return indexPath.slice(0, indexPath.lastIndexOf("/"));
}

// .../<uuid>/<name>/site/index.html -> <name>
function folderName(path) {
  var p = path.split("/");
  return p.length >= 3 ? p[p.length - 3] : path;
}

// decode() is deliberately partial: it knows the five core entities and every
// numeric reference, and nothing else. A surviving &name; is left intact for
// decode_entities to hand to textutil, which owns the full table.
//
// &amp; decodes LAST. Doing it first would turn a deliberately double-escaped
// &amp;lt; into a bare <, losing the escaping the author asked for.
function decode(s) {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, function (_, h) { return String.fromCodePoint(parseInt(h, 16)); })
    .replace(/&#(\d+);/g, function (_, d) { return String.fromCodePoint(parseInt(d, 10)); })
    .replace(/&quot;/g, "\"").replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

function titleOf(html, path) {
  var m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  // Collapse whitespace: a title spanning newlines is normal, and a tab inside
  // one would corrupt the tab-delimited output format.
  var title = decode(m ? m[1] : "").replace(/\s+/g, " ").trim();
  return title || folderName(path);
}
'
```

- [ ] **Step 2: Replace `describe_artifacts` entirely**

Delete the whole existing function — including its `localRefs`, `folderName`, `decode` and `readUtf8`, which have all moved into the prelude — and put this in its place:

```bash
# argv[0] is a file holding one artifact path per line. Emits one
# "title<TAB>total<TAB>missing" line per input path, in input order.
#
# Title extraction lives here rather than after selection because the picker needs
# the title *before* the choice is made, and two extraction paths would drift — a
# list reading Cr&ecirc;pes beside a page published as Crêpes.
#
# total counts every file the page needs, including the ones a stylesheet names.
# missing counts those that are not on disk or that point outside the artifact.
# Only the second is a warning now: the rest are published.
describe_artifacts() {
  osascript -l JavaScript -e "$JXA_ASSETS" -e '
function run(argv) {
  var listing = readUtf8(argv[0]);
  // This throws where an unreadable *artifact* degrades to (unreadable) in
  // place: a missing path list means the caller is broken, and every row would
  // be wrong. One bad artifact must not cost the other nine their place.
  if (listing === null) { throw new Error("cannot read the path list"); }
  return listing.split("\n").filter(function (p) { return p.length > 0; }).map(function (p) {
    var html = readUtf8(p);
    if (html === null) { return "(unreadable)\t0\t0"; }
    var root = siteRoot(p);
    var refs = collectAllRefs(root, html);
    var missing = refs.filter(function (r) { return usableAsset(root, r) === null; });
    return titleOf(html, p) + "\t" + refs.length + "\t" + missing.length;
  }).join("\n");
}' "$1"
}
```

- [ ] **Step 3: Widen `candidate_rows` to five columns**

Replace its output line and the loop that builds it:

```bash
# stdin:  "mtime path" lines, as list_artifacts emits them
# stdout: "mtime<TAB>path<TAB>title<TAB>total<TAB>missing", titles fully decoded
#
# Tab-delimited because the paths contain spaces ("Application Support").
candidate_rows() {
  local src="$WORK/src.txt" paths="$WORK/paths.txt" desc="$WORK/desc.txt"
  cat > "$src"
  [ -s "$src" ] || return 0
  cut -d' ' -f2- < "$src" > "$paths"
  describe_artifacts "$paths" > "$desc" \
    || die "Could not read the Dia artifacts. Is the folder readable?"
  # osascript appends a newline to its result, so both counts are the row count.
  [ "$(wc -l < "$paths")" = "$(wc -l < "$desc")" ] \
    || die "describe_artifacts returned the wrong number of rows."
  paste -d'\t' <(cut -d' ' -f1 < "$src") "$paths" "$desc" \
    | while IFS=$'\t' read -r mtime path title total missing; do
        printf '%s\t%s\t%s\t%s\t%s\n' \
          "$mtime" "$path" "$(decode_entities "$title")" "$total" "$missing"
      done
}
```

- [ ] **Step 4: Change what the label says**

Replace `build_labels`:

```bash
build_labels() {
  local mtime path title total missing label i j n dup
  local labels=()
  while IFS=$'\t' read -r mtime path title total missing; do
    # %-d rather than %e, so a single-digit day gives "Fri 1 Aug" and not the
    # double-spaced "Fri  1 Aug". The - padding modifier is usually a glibc
    # extension; it was verified working in macOS's BSD date.
    label="$title — $(date -r "$mtime" '+%a %-d %b %H:%M')"
    # The ⚠ is reserved for what is still actionable. Linked files used to earn
    # one because they were about to go missing; they are published now, so a
    # marker on every row would be one nobody reads — the same lesson the old
    # find-based count taught. A ref that cannot be resolved still earns it.
    if [ "${missing:-0}" -gt 1 ]; then
      label="$label  ⚠ $missing missing files"
    elif [ "${missing:-0}" = "1" ]; then
      label="$label  ⚠ 1 missing file"
    elif [ "${total:-0}" -gt 1 ]; then
      label="$label  + $total files"
    elif [ "${total:-0}" = "1" ]; then
      label="$label  + 1 file"
    fi
    labels[${#labels[@]}]="$label"
  done
  n=${#labels[@]}
  for ((i = 0; i < n; i++)); do
    dup=1
    for ((j = 0; j < i; j++)); do
      [ "${labels[$j]}" = "${labels[$i]}" ] && dup=$((dup + 1))
    done
    [ "$dup" -gt 1 ] && labels[$i]="${labels[$i]} ($dup)"
    printf '%s\n' "${labels[$i]}"
  done
}
```

- [ ] **Step 5: Carry both counts through selection**

In `choose_artifact`, replace `refslist` with two arrays and set both variables:

```bash
# Sets INDEX, TITLE, TOTAL, MISSING from the teacher's choice. Exits 0 on cancel.
choose_artifact() {
  local rows="$WORK/rows.txt" labels="$WORK/labels.txt" picked i n
  local paths=() titles=() totals=() missings=() labellist=()
  list_artifacts | head -"$LIST_ROWS" | candidate_rows > "$rows"
  [ -s "$rows" ] || die "No artifacts found yet."

  while IFS=$'\t' read -r mtime path title total missing; do
    paths[${#paths[@]}]="$path"
    titles[${#titles[@]}]="$title"
    totals[${#totals[@]}]="$total"
    missings[${#missings[@]}]="$missing"
  done < "$rows"
```

and in the label-matching loop at the end of that function:

```bash
    if [ "${labellist[$i]}" = "$picked" ]; then
      INDEX="${paths[$i]}"; TITLE="${titles[$i]}"
      TOTAL="${totals[$i]}"; MISSING="${missings[$i]}"
      return 0
    fi
```

Replace the three initialisers below `choose_artifact`:

```bash
INDEX=""
TITLE=""
TOTAL=0
MISSING=0
```

In the title-search branch, change the read and the assignment:

```bash
  while IFS=$'\t' read -r mtime path title total missing; do
    HAY=$(printf '%s' "$title" | tr '[:upper:]' '[:lower:]')
    case "$HAY" in
      *"$WANT"*)
        HITS=$((HITS + 1))
        # Rows arrive newest first, so the first hit is the newest.
        [ -z "$INDEX" ] && {
          INDEX="$path"; TITLE="$title"; TOTAL="$total"; MISSING="$missing"
        }
        ;;
    esac
    # `< <(…)` rather than a pipe: a while on the right of a pipe runs in a
    # subshell in bash 3.2, so INDEX would be empty afterwards.
  done < <(list_artifacts | candidate_rows)
```

And in the `--latest` branch:

```bash
  while IFS=$'\t' read -r mtime path title total missing; do
    INDEX="$path"; TITLE="$title"; TOTAL="$total"; MISSING="$missing"
  done < <(list_artifacts | head -1 | candidate_rows)
```

Finally, the trailing comment on the `else` branch that calls it:

```bash
  choose_artifact          # sets INDEX, TITLE, TOTAL, MISSING
```

- [ ] **Step 5a: Prove every rename landed**

Run: `grep -n 'REFS\|refslist\|title refs' tools/publish-dia-artifact.sh`

Expected: **no output.** `$REFS` was read in nine places and a missed one is silent — under `set -u` an unset variable would abort, but every read here is written `${REFS:-0}`, so a survivor quietly reads 0 and the warning never fires.

- [ ] **Step 6: Invert the warning**

Replace the `if [ "${REFS:-0}" != "0" ]` block. The old sentence — "will not be published" — is false now for everything that resolves:

```bash
# The sibling files are published now, so only the ones that could not be found
# are worth saying anything about. A ref pointing outside the artifact folder is
# counted here too: it is refused deliberately and never read.
#
# The dialog already showed this on the chosen row, so only the flag-driven paths
# need telling.
if [ "${MISSING:-0}" != "0" ]; then
  warn "This page links to $MISSING file(s) that are not on disk, so they will be missing. Continuing anyway."
fi
```

- [ ] **Step 7: Verify the markers against the fixtures**

```bash
export DIA_ARTIFACTS="$(tools/dia-fixtures.sh)"
tools/publish-dia-artifact.sh --list
```

Expected, exactly:

| Artifact | Marker |
|---|---|
| Plain | none |
| Styled | `+ 3 files` — `styles.css`, `app.js?v=2`, and the font reached through the stylesheet |
| Nested | `+ 2 files` |
| Broken | `⚠ 1 missing file` |
| Evil | `⚠ 2 missing files` — the traversal and the symlink, both refused |
| Mixed | `+ 1 file` — the CDN script is not a local ref |

If Styled shows `+ 2 files`, `collectAllRefs` is not recursing into the stylesheet. If Evil shows `+ 2 files`, `insideRoot` is not refusing — **stop and fix that before Task 10**, because the next task starts reading these files.

- [ ] **Step 8: Confirm a real artifact still lists**

Run: `unset DIA_ARTIFACTS; tools/publish-dia-artifact.sh --list`

Expected: your own Dia artifacts, titles intact and correctly decoded. This is the check that the title extraction survived moving into the prelude.

- [ ] **Step 9: Commit**

```bash
git add tools/publish-dia-artifact.sh
git commit -m "feat: find the files a Dia artifact links to, one level deep

Collects the document's relative refs and those its stylesheets name, and
refuses any that leave the artifact folder — resolving symlinks, since a link
inside site/ pointing at ~/.ssh carries no .. to test for. The picker's
warning marker now means 'not on disk' rather than 'will not be published',
which is the only case still worth a symbol.

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 10: `tools/publish-dia-artifact.sh` — upload the files

**Files:**
- Modify: `tools/publish-dia-artifact.sh`

- [ ] **Step 1: Read the assets into the body**

Replace the `BODY=$(osascript …)` block. Note it now takes the prelude as its first `-e`, exactly as `describe_artifacts` does:

```bash
# Only the file *paths* cross the process boundary, so megabytes of arbitrary
# HTML never meet shell word-splitting or quoting. The assets are read in here
# for that reason and one more: their bytes may not be text at all.
#
# The title matters more than it looks: the server derives the page slug from it
# when the payload sends no slug, and a slug never moves again once created. A
# mangled title bakes in a mangled bookmark. It is extracted exactly once, in
# describe_artifacts, so the string the picker showed is the string sent here.
BODY=$(osascript -l JavaScript -e "$JXA_ASSETS" -e '
function run(argv) {
  var index = argv[1];
  var html = readUtf8(index);
  if (html === null) { throw new Error("cannot read the artifact"); }

  var root = siteRoot(index);
  var assets = [];
  collectAllRefs(root, html).forEach(function (ref) {
    var full = usableAsset(root, ref);
    // Dropped silently, because these are exactly the refs describe_artifacts
    // already counted as missing and the picker already marked with a warning.
    // The server names each one in its own report afterwards.
    if (full === null) { return; }
    var data = $.NSData.dataWithContentsOfFile(full);
    if (data.isNil()) { return; }
    assets.push({
      // The ref VERBATIM: unfolded, still percent-encoded, query and all.
      // lib/asset-path.ts normalises both this key and the document ref it has
      // to meet, so the two agree by construction rather than by two
      // implementations of one rule staying in step.
      path: ref,
      base64: data.base64EncodedStringWithOptions(0).js
    });
  });

  return JSON.stringify({ title: argv[0], html: html, assets: assets });
}' "$TITLE" "$INDEX")
```

- [ ] **Step 2: Say how many files are going**

Replace the `echo "Publishing …"` line, so the count can be checked against the picker row she just clicked:

```bash
EXTRA=""
if [ "${TOTAL:-0}" != "0" ]; then
  EXTRA=", plus $((TOTAL - MISSING)) file(s)"
fi
echo "Publishing \"${TITLE}\" ($(wc -c < "$INDEX" | tr -d ' ') bytes$EXTRA) to ${SITE} ..."
```

- [ ] **Step 3: Correct the stale comment about the size ceiling**

The comment above the `curl` names the old limit. Replace it:

```bash
# The body arrives on stdin, not in an argument. ARG_MAX is 1 MB while the
# endpoint accepts MAX_UPLOAD_BYTES, so `-d "$BODY"` died with "argument list too
# long" before sending anything for pages in between — a raw shell error rather
# than this script's own reporting. Piping leaves the size ceiling where it
# belongs, on the server: this script carries no limit of its own, so a payload
# that is too large comes back as the endpoint's own 413 message, which the die
# below prints verbatim.
```

- [ ] **Step 4: Publish each fixture against a local server**

In one terminal: `npm run dev`. Then:

```bash
export DIA_ARTIFACTS="$(tools/dia-fixtures.sh)"
tools/publish-dia-artifact.sh --local Plain
tools/publish-dia-artifact.sh --local Styled
tools/publish-dia-artifact.sh --local Nested
tools/publish-dia-artifact.sh --local Broken
tools/publish-dia-artifact.sh --local Evil
tools/publish-dia-artifact.sh --local Mixed
```

Expected per artifact:

| Artifact | Expected output |
|---|---|
| Plain | `✓ http://localhost:3000/p/plain`, no `⚠` |
| Styled | `plus 3 file(s)`, then `✓`, no `⚠` |
| Nested | `plus 2 file(s)`, then `✓`, no `⚠` |
| Broken | `⚠ This page links to 1 file(s) that are not on disk`, then `✓`, then `⚠ … missing.css — was not found next to the page` |
| Evil | two refs reported `was not found next to the page`, and a published page |
| Mixed | `plus 1 file(s)`, then `✓`, no `⚠` — the CDN script inlines from the network |

- [ ] **Step 5: Confirm the secret did not leak**

This is the check that must not be skipped.

```bash
DB=$(find . -maxdepth 2 -name 'dev.db' -not -path './node_modules/*' | head -1)
sqlite3 "$DB" "select html from Page where slug='evil';" > /tmp/evil.html
if grep -q 'BEGIN-PRIVATE-KEY' /tmp/evil.html; then
  echo "FAIL — the key was published"
else
  echo "OK — nothing outside the artifact was read"
fi
```

Expected: `OK`. A `FAIL` means `insideRoot` is not doing its job; stop and fix it.

- [ ] **Step 6: Confirm the assets actually landed inline**

```bash
sqlite3 "$DB" "select html from Page where slug='styled';" > /tmp/styled.html
grep -c 'Styled by app.js' /tmp/styled.html      # expect 1 — the local script inlined
grep -c 'data:font/woff2;base64,' /tmp/styled.html  # expect 1 — the font, reached via the stylesheet
grep -c 'styles.css' /tmp/styled.html            # expect 0 — the <link> was replaced
```

- [ ] **Step 7: Look at it in a browser**

Open `http://localhost:3000/p/styled`. Expected: the heading reads **"Styled by app.js"** in red — proving the local script ran and the local stylesheet applied. Open the Network tab and reload: **zero third-party requests.**

- [ ] **Step 8: Commit**

```bash
git add tools/publish-dia-artifact.sh
git commit -m "feat: upload the files a Dia artifact links to

Reads each resolvable ref and sends it base64 beside the document, keyed by
the ref verbatim so the server's normaliser is the only one. Refs that are
missing or that escape the artifact are dropped here and reported by name in
the reply.

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 11: Documentation

`CLAUDE.md` currently contains a sentence that this work makes false. Find it, in the *Files: pages, links and PDFs* section:

> A relative ref is reported too, since only `index.html` is ever uploaded.

**Files:**
- Modify: `CLAUDE.md`
- Modify: `tools/README.md`

- [ ] **Step 1: Correct `CLAUDE.md`**

Replace that sentence with:

```markdown
A relative ref is resolved from the files uploaded beside the document, when
there are any. `tools/publish-dia-artifact.sh` collects them — the document's
own refs plus one level through each stylesheet, since a `styles.css` naming a
local `.woff2` is the same shape as the Google Fonts case that set the depth
rule — and sends them as `assets: [{ path, base64 }]`. `lib/asset-path.ts` is
the **only** normaliser: the script uploads each key as the ref was written,
unfolded, and the server folds both that key and the document's ref, so the two
sides agree by construction rather than by two implementations of one rule
staying in step. A ref that escapes the artifact folder is refused on the
script's side by resolving symlinks and comparing against the resolved root —
a link inside `site/` pointing at `~/.ssh` carries no `..` to test for, and this
publishes what it reads to a public URL. The admin's paste box and the browser
extension can see no directory, so they upload no bundle and their relative refs
keep the older reason: `relative` says only the page itself was published,
`missing` says files were uploaded and this one was not among them, and the cure
differs. The request body may now reach `MAX_UPLOAD_BYTES` (3 MB, under nginx's
`4m`) because it carries base64; the stored document is still capped at
`MAX_PAGE_BYTES`, and the two stopped being the same measurement.
```

- [ ] **Step 2: Document it in `tools/README.md`**

Add to the `publish-dia-artifact.sh` section:

```markdown
### Files beside the page

An artifact that links to its own `.js`, `.css`, images or fonts publishes with
them folded in. The script reads each file the document names, plus anything its
stylesheets name one level deeper, and uploads them with the page; the server
inlines them into one self-contained document.

The picker says which is which. `+ 3 files` means three were found and will be
published. `⚠ 1 missing file` means one was named but is not on disk, or points
outside the artifact folder — those are refused, and the reply names each one.

A ref pointing outside the artifact is never read, symlinks included. These pages
are published at a public URL, so a ref of `../../.ssh/id_rsa` has to be refused
rather than trusted.
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md tools/README.md
git commit -m "docs: record that a page publishes with its sibling files

Corrects the claim that only index.html is ever uploaded, and states where
the single normaliser lives and why the script does not have one.

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 12: Full verification

- [ ] **Step 1: Run everything CI runs, in CI's order**

```bash
npx prisma generate
npm run lint
npx tsc --noEmit
npm test
npm run build
```

Expected: all five clean. Nothing here needs a migration.

- [ ] **Step 2: Confirm the paths that must not have changed**

The admin paste box and the extension send no bundle, so their behaviour must be identical. With `npm run dev` running, in `/admin` → Pages → the `+` FAB, paste a document containing `<link rel="stylesheet" href="./styles.css">`.

Expected: it publishes, and `SkippedAssets` reads **"is a file next to the page, and only the page itself is published"** — not "was not found next to the page". If you see the second, `inlinePage` is passing a resolver for an empty bundle; check the `bundle.size === 0` guard.

- [ ] **Step 3: Confirm the round trip**

At `/admin/pages/styled`, use the download link. Expected: a self-contained file with the script and font already inline. Paste it straight back and save — expected: no `SkippedAssets` notice, because there is nothing left to resolve.

- [ ] **Step 4: Confirm the announced regression announces itself**

At `/admin/pages/styled`, paste the **original** bare `index.html` from `$DIA_ARTIFACTS/uuid-styled/styled/site/index.html` and save.

Expected: it saves, and `SkippedAssets` names `styles.css` and `./app.js?v=2` as *"is a file next to the page…"*. This is the accepted cost recorded in the spec; the point of the check is that it is visible rather than silent.

- [ ] **Step 5: Confirm idempotence**

Run `tools/publish-dia-artifact.sh --local Styled` a second time. Expected: the same slug, no error, and `select length(html) from Page where slug='styled';` returns the same number as before.

- [ ] **Step 6: Re-run the backfill and confirm it is unaffected**

```bash
node --experimental-strip-types scripts/run-ts.mjs scripts/backfill-page-assets.mjs
```

Expected: it reports the already-inlined pages as self-contained and rewrites nothing. A stored page has no directory to read, so there is nothing local for it to recover — it must **not** have been extended to try.

- [ ] **Step 7: Final commit**

```bash
git add -A
git commit -m "test: verify local page assets end to end

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Notes for the reviewer

Three things to look for that no test can prove:

1. **`insideRoot` resolves both sides.** If it ever compares a resolved candidate against an unresolved root, `/tmp` versus `/private/tmp` splits them and every ref reads as an escape. If it drops `URLByResolvingSymlinksInPath` for a string test on `..`, the symlink case publishes a private key. Task 10 Step 5 is the check.
2. **`bundle.size === 0` passes `undefined`.** Passing a resolver over an empty map instead would change the admin's report line from "only the page itself is published" to "was not found next to the page", which is the wrong advice to give someone using the paste box.
3. **The script normalises nothing.** `stripRefSuffix` removes a query and a fragment so a file can be found on disk. If any `.`/`..` folding or percent-decoding appears in the JXA, there are two normalisers again and they will drift.
