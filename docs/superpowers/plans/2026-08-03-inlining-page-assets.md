# Inlining a page's external assets — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An uploaded page that loads a script, stylesheet, image or font from a
CDN is rewritten at publish time into one self-contained document, so it renders
at `/p/[slug]` with **no change to the CSP** and no third-party request from a
student's browser.

**Architecture:** Three pure modules in `lib/` (allowlist + content-type policy,
a small ref matcher, the escaping and splicing) plus one impure network adapter,
orchestrated by `lib/page-inline.ts`, which takes its fetcher as an argument so
every rule is testable with a fake. The step runs between validation and
`savePage` on both write paths. Assets that cannot be inlined are left alone and
reported; a publish never fails because of one.

**Tech Stack:** Next.js 16 (App Router), TypeScript strict, Prisma/SQLite,
Vitest, Tailwind v4. No new dependencies.

**Read first:** `docs/superpowers/specs/2026-08-03-inlining-page-assets-design.md`.
It records why the CSP is not being widened, why the fetcher is treated as an
SSRF primitive, and which rejected approaches not to reintroduce.

---

## Why this is not a CSP change

`app/p/[slug]/raw/route.ts:20-31` sets `script-src 'unsafe-inline' 'unsafe-eval'
blob:` and **no host source anywhere in the policy**. A source list with no host
expression matches no URL, so `script-src-elem` falls back to `script-src` and
every `<script src>` is blocked — external or same-origin alike.

But `'unsafe-inline'` is already there. An inline `<script>` runs today. The
policy bans *network requests*, not JavaScript, so the fix is to make the
document carry its assets rather than to let the document reach for them. **If
you find yourself editing the CSP, stop — something has gone wrong.**

---

## File structure

| File | Status | Responsibility |
|---|---|---|
| `lib/asset-policy.ts` | create | Which hosts may be fetched, which content types count, what kind of asset a URL names, the skip reasons. Pure. |
| `lib/page-refs.ts` | create | Find external refs in HTML and CSS; escape and splice replacements. Pure. |
| `lib/asset-fetch.ts` | create | The only module that opens a socket. Not unit-tested. |
| `lib/page-inline.ts` | create | The walk, the fetch depth, the byte budget, the report. Fetcher injected. |
| `lib/bounded-body.ts` | modify | Extract `readBoundedBytes` so a `Response` body gets the same bounded read a `Request` body already gets. |
| `app/api/pages/route.ts` | modify | Inline between `parsePagePayload` and `savePage`; add `skipped` to the 201 body. |
| `app/page-actions.ts` | modify | Same step in `createPage`/`updatePage`; both return `{ slug, skipped }`. |
| `components/admin/PageEditor.tsx` | modify | Render the skipped notice. |
| `tools/publish-dia-artifact.sh` | modify | Print a `⚠` line per skipped asset. |
| `tools/publish-extension/background.js` | modify | Count in the notification, detail in the console. |
| `scripts/backfill-page-assets.mjs` | create | Run the inliner over pages already published. |
| `CLAUDE.md` | modify | Record the new contract in *Files: pages and links*. |
| `tests/lib/asset-policy.test.ts` | create | |
| `tests/lib/page-refs.test.ts` | create | |
| `tests/lib/page-inline.test.ts` | create | Fake fetcher; no socket. |

Dependency order, which is also the task order — it is acyclic and must stay so:

```
asset-policy   → page-html
page-refs      → asset-policy          (RefKind, assetKindForUrl)
asset-fetch    → asset-policy, bounded-body
page-inline    → page-refs, asset-policy, asset-fetch, page-html
```

`RefKind` lives in `asset-policy` and not beside the matcher on purpose: the fetch
policy is written against it, and defining it in `page-refs` would mean the two
modules importing each other.

`lib/page-inline.ts` and `lib/asset-fetch.ts` are **server-only** — they are
imported by a route handler, a server action and a Node script, never by a client
component. That is what makes `Buffer` legitimate in them.

---

## Task 1: The asset policy

**Files:**
- Create: `lib/asset-policy.ts`
- Test: `tests/lib/asset-policy.test.ts`

- [x] **Step 1: Write the failing test**

Create `tests/lib/asset-policy.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  ASSET_HOSTS,
  assetKindForUrl,
  contentTypeMatches,
  isAllowedAssetUrl,
} from "@/lib/asset-policy";

describe("isAllowedAssetUrl", () => {
  it("accepts an allowlisted host over https", () => {
    expect(
      isAllowedAssetUrl(
        "https://artifactcdn.diabrowser.engineering/ajax/libs/animejs/anime.min.js",
      ),
    ).toBe(true);
  });

  it("accepts every host in the list", () => {
    for (const host of ASSET_HOSTS) {
      expect(isAllowedAssetUrl(`https://${host}/x.js`)).toBe(true);
    }
  });

  it("rejects http, so a fetch is never downgraded", () => {
    expect(isAllowedAssetUrl("http://cdnjs.cloudflare.com/x.js")).toBe(false);
  });

  it("rejects a host that is not listed", () => {
    expect(isAllowedAssetUrl("https://evil.example/x.js")).toBe(false);
  });

  // A suffix match would admit every subdomain anyone can register.
  it("rejects a subdomain of an allowed host", () => {
    expect(isAllowedAssetUrl("https://evil.cdn.jsdelivr.net/x.js")).toBe(false);
  });

  // The whole point of reading URL.host rather than the raw string: the host
  // here is evil.example, and the allowlisted name is only the username.
  it("rejects credentials used to make a host look allowlisted", () => {
    expect(isAllowedAssetUrl("https://cdnjs.cloudflare.com@evil.example/x.js")).toBe(
      false,
    );
  });

  it("rejects an explicit port", () => {
    expect(isAllowedAssetUrl("https://cdnjs.cloudflare.com:8443/x.js")).toBe(false);
  });

  it("rejects the EC2 metadata service and bare IP literals", () => {
    expect(isAllowedAssetUrl("http://169.254.169.254/latest/meta-data/")).toBe(false);
    expect(isAllowedAssetUrl("https://169.254.169.254/")).toBe(false);
    expect(isAllowedAssetUrl("https://[::1]/x.js")).toBe(false);
  });

  it("matches the host case-insensitively, as a URL does", () => {
    expect(isAllowedAssetUrl("https://CDNJS.Cloudflare.COM/x.js")).toBe(true);
  });

  it("returns false rather than throwing on anything unparseable", () => {
    for (const junk of ["", "   ", "not a url", "//cdnjs.cloudflare.com/x.js"]) {
      expect(isAllowedAssetUrl(junk)).toBe(false);
    }
  });
});

describe("contentTypeMatches", () => {
  it("accepts the javascript types a CDN actually sends", () => {
    for (const type of [
      "application/javascript; charset=utf-8",
      "text/javascript",
      "application/ecmascript",
    ]) {
      expect(contentTypeMatches("script", type, "https://x.test/a.js")).toBe(true);
    }
  });

  // Without this an nginx or Cloudflare 404 page lands inside a <script> and
  // the page fails with a syntax error at a line Jenn never wrote.
  it("rejects an HTML error page served in place of a script", () => {
    expect(contentTypeMatches("script", "text/html", "https://x.test/a.js")).toBe(
      false,
    );
  });

  it("requires text/css for a stylesheet", () => {
    expect(contentTypeMatches("style", "text/css", "https://x.test/a.css")).toBe(true);
    expect(contentTypeMatches("style", "text/plain", "https://x.test/a.css")).toBe(
      false,
    );
  });

  it("requires an image type for an image", () => {
    expect(contentTypeMatches("image", "image/png", "https://x.test/a.png")).toBe(true);
    expect(contentTypeMatches("image", "text/html", "https://x.test/a.png")).toBe(
      false,
    );
  });

  it("accepts a font sent as octet-stream only when the path names a font", () => {
    expect(
      contentTypeMatches("font", "application/octet-stream", "https://x.test/a.woff2"),
    ).toBe(true);
    expect(
      contentTypeMatches("font", "application/octet-stream", "https://x.test/a.js"),
    ).toBe(false);
  });

  it("accepts font/woff2, which is what gstatic sends", () => {
    expect(contentTypeMatches("font", "font/woff2", "https://x.test/a.woff2")).toBe(
      true,
    );
  });
});

describe("assetKindForUrl", () => {
  it("calls a font a font, by extension and past a query string", () => {
    expect(assetKindForUrl("https://x.test/a.woff2")).toBe("font");
    expect(assetKindForUrl("https://x.test/a.ttf?v=2")).toBe("font");
    expect(assetKindForUrl("https://x.test/a.otf#f")).toBe("font");
  });

  it("calls everything else an image", () => {
    expect(assetKindForUrl("https://x.test/a.png")).toBe("image");
    expect(assetKindForUrl("https://x.test/woff2-icons.svg")).toBe("image");
  });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/lib/asset-policy.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/asset-policy"`.

- [x] **Step 3: Write the implementation**

Create `lib/asset-policy.ts`:

```ts
import { MAX_PAGE_BYTES } from "@/lib/page-html";

// What to fetch, and which content type to demand for it. This type lives here
// rather than beside the matcher because it is the key the fetch policy below is
// written against — putting it in lib/page-refs.ts would make these two modules
// import each other.
export type RefKind = "script" | "style" | "image" | "font";

const FONT_PATH = /\.(?:woff2?|ttf|otf|eot)(?:[?#]|$)/i;

// A url() in CSS says nothing about what it points at, so the extension decides.
// Used by the octet-stream branch below as well as by the matcher.
export function assetKindForUrl(url: string): "image" | "font" {
  return FONT_PATH.test(url) ? "font" : "image";
}

// This list is the primary control on lib/asset-fetch.ts, and the reason it
// exists is worth stating plainly: the URLs that module fetches arrive in a
// request body, and the response is inlined into a document that is then public
// at /p/[slug]/raw. That is a read primitive. Without a list, whoever holds
// PAGES_UPLOAD_TOKEN could publish a page whose <script src> points at
// http://169.254.169.254/latest/meta-data/iam/security-credentials/ and read
// the box's S3 backup credentials straight out of it.
//
// Deliberately absent: esm.sh, cdn.skypack.dev, jspm.dev and every other module
// CDN. An ES module's `import` resolves against the module's own URL, so
// inlining one leaves its imports with nothing to resolve against — the ref
// would turn a page that is merely blocked into a page that is broken.
export const ASSET_HOSTS: readonly string[] = [
  "artifactcdn.diabrowser.engineering",
  "cdnjs.cloudflare.com",
  "cdn.jsdelivr.net",
  "unpkg.com",
  "cdn.tailwindcss.com",
  // The Google pair is listed together because either alone is useless: the
  // stylesheet without the fonts renders in a fallback face, and the fonts
  // without the stylesheet are unreachable.
  "fonts.googleapis.com",
  "fonts.gstatic.com",
];

// An asset larger than a whole page can never fit inside one. The cap is here
// to bound how much the process buffers, not to be a useful limit.
export const MAX_ASSET_BYTES = MAX_PAGE_BYTES;

// Phrased for a teacher, not a developer — these strings are shown to her
// verbatim by three different callers.
export const SKIP_REASONS = {
  notAllowed: "is not on the list of allowed sources",
  fetchFailed: "could not be fetched",
  wrongType: "was not the kind of file it claimed to be",
  tooBig: "would not fit inside the 2 MB page limit",
  relative: "is a file next to the page, and only the page itself is published",
  unsafe: "could not be inlined safely",
  tooDeep: "sits behind too many stylesheets to reach",
} as const;

export function isAllowedAssetUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  if (url.protocol !== "https:") return false;
  // An explicit port on a CDN is a sign of something other than the CDN.
  if (url.port !== "") return false;
  // https://cdnjs.cloudflare.com@evil.example/x has hostname evil.example.
  // Credentials in one of these URLs exist only to make a host look like
  // another one, which is why the check is on presence rather than content.
  if (url.username !== "" || url.password !== "") return false;

  // Exact, never a suffix: matching on `.jsdelivr.net` would admit every
  // subdomain anyone can register under it. URL.hostname is already
  // lowercased by the parser for ASCII hosts; the fold is belt and braces.
  return ASSET_HOSTS.includes(url.hostname.toLowerCase());
}

export function contentTypeMatches(
  kind: RefKind,
  contentType: string,
  url: string,
): boolean {
  const media = contentType.split(";")[0].trim().toLowerCase();

  if (kind === "script") {
    return media.includes("javascript") || media.includes("ecmascript");
  }
  if (kind === "style") return media === "text/css";
  if (kind === "image") return media.startsWith("image/");

  // Serving a font as octet-stream is a common CDN misconfiguration, so the
  // path extension stands in as the second signal. Narrow enough that an HTML
  // error page still cannot pass.
  return (
    media.startsWith("font/") ||
    media.startsWith("application/font") ||
    media === "application/vnd.ms-fontobject" ||
    (media === "application/octet-stream" && assetKindForUrl(url) === "font")
  );
}
```

- [x] **Step 4: Run the test**

Run: `npx vitest run tests/lib/asset-policy.test.ts`
Expected: PASS. This module imports nothing but `lib/page-html.ts`, so it stands
on its own — nothing here waits on a later task.

- [x] **Step 5: Commit**

```bash
git add lib/asset-policy.ts tests/lib/asset-policy.test.ts
git commit -m "feat: add the asset host allowlist and content-type policy

The allowlist is the primary SSRF control on the fetcher that follows: the
URLs it takes arrive in a request body and its responses become a public
document, so an unlisted host must never be reachable.

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 2: The ref matcher

**Files:**
- Create: `lib/page-refs.ts`
- Test: `tests/lib/page-refs.test.ts`

There is no HTML parser here and none is being added. This is a deliberately
small matcher in the spirit of `lib/inline-markup.ts`, which is a tiny inline
markup parser and not Markdown for the same reason: the shapes are narrow and
known, and a dependency is not free. Nothing validates markup — an unrecognised
shape is left alone, which means it stays blocked rather than becoming broken.

- [x] **Step 1: Write the failing test for document refs**

Create `tests/lib/page-refs.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  applyReplacements,
  escapeScriptBody,
  findCssRefs,
  findExternalRefs,
} from "@/lib/page-refs";

const CDN = "https://cdn.jsdelivr.net";

describe("findExternalRefs", () => {
  it("finds a script and hands back the span of the whole element", () => {
    const html = `<body><script src="${CDN}/a.js"></script></body>`;
    const [ref] = findExternalRefs(html);
    expect(ref.kind).toBe("script");
    expect(ref.form).toBe("script-element");
    expect(ref.url).toBe(`${CDN}/a.js`);
    // The whole element, because an inline script is a different element.
    expect(html.slice(ref.start, ref.end)).toBe(
      `<script src="${CDN}/a.js"></script>`,
    );
  });

  it("keeps a script's other attributes and drops src", () => {
    const html = `<script src="${CDN}/a.js" defer data-x="1"></script>`;
    const [ref] = findExternalRefs(html);
    expect(ref.attrs).toBe(` defer data-x="1"`);
    expect(ref.attrs).not.toContain("src");
  });

  it("finds a stylesheet link and carries only media across", () => {
    const html = `<link rel="stylesheet" href="${CDN}/a.css" media="print">`;
    const [ref] = findExternalRefs(html);
    expect(ref.kind).toBe("style");
    expect(ref.form).toBe("style-element");
    expect(ref.attrs).toBe(` media="print"`);
  });

  it("treats rel as a token list", () => {
    expect(
      findExternalRefs(`<link rel="preload stylesheet" href="${CDN}/a.css">`),
    ).toHaveLength(1);
    expect(findExternalRefs(`<link rel="icon" href="${CDN}/a.png">`)).toHaveLength(0);
  });

  it("finds an image and spans only the URL, so the quoting survives", () => {
    const html = `<img src="${CDN}/a.png" alt="x">`;
    const [ref] = findExternalRefs(html);
    expect(ref.kind).toBe("image");
    expect(ref.form).toBe("url-value");
    expect(html.slice(ref.start, ref.end)).toBe(`${CDN}/a.png`);
  });

  it("never touches an anchor", () => {
    expect(findExternalRefs(`<a href="${CDN}/a.css">x</a>`)).toEqual([]);
  });

  it("ignores a URL there is nothing to fetch for", () => {
    const html = [
      `<img src="data:image/png;base64,AAA">`,
      `<img src="blob:x">`,
      `<a href="#top">t</a>`,
      `<a href="mailto:a@b.test">m</a>`,
      `<script src="javascript:void 0"></script>`,
    ].join("");
    expect(findExternalRefs(html)).toEqual([]);
  });

  it("reads single-quoted, double-quoted and unquoted attributes", () => {
    expect(findExternalRefs(`<script src='${CDN}/a.js'></script>`)[0].url).toBe(
      `${CDN}/a.js`,
    );
    expect(findExternalRefs(`<script src=${CDN}/a.js></script>`)[0].url).toBe(
      `${CDN}/a.js`,
    );
  });

  // A Google Fonts href is written with &amp; in HTML. Fetching that literally
  // asks for a parameter called `amp;display`.
  it("decodes &amp; in a URL", () => {
    const html =
      `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter&amp;display=swap">`;
    expect(findExternalRefs(html)[0].url).toBe(
      "https://fonts.googleapis.com/css2?family=Inter&display=swap",
    );
  });

  it("upgrades a protocol-relative URL rather than dropping it", () => {
    expect(findExternalRefs(`<script src="//cdn.jsdelivr.net/a.js"></script>`)[0].url)
      .toBe("https://cdn.jsdelivr.net/a.js");
  });

  it("marks a relative ref, which is reported and never fetched", () => {
    const [ref] = findExternalRefs(`<link rel="stylesheet" href="./styles.css">`);
    expect(ref.relative).toBe(true);
    expect(ref.url).toBe("./styles.css");
  });

  it("finds refs inside an inline style block", () => {
    const html = `<style>@font-face{src:url("https://fonts.gstatic.com/a.woff2")}</style>`;
    const [ref] = findExternalRefs(html);
    expect(ref.kind).toBe("font");
    expect(ref.form).toBe("css-url");
    expect(html.slice(ref.start, ref.end)).toBe(
      `url("https://fonts.gstatic.com/a.woff2")`,
    );
  });

  it("finds an @import inside an inline style block as a stylesheet fetch", () => {
    const html = `<style>@import url('https://fonts.googleapis.com/css2?family=Inter');</style>`;
    const [ref] = findExternalRefs(html);
    expect(ref.kind).toBe("style");
    expect(ref.form).toBe("css-text");
    expect(ref.url).toBe("https://fonts.googleapis.com/css2?family=Inter");
  });

  it("finds every ref in a document with several", () => {
    const html = [
      `<html><head>`,
      `<link rel="stylesheet" href="${CDN}/a.css">`,
      `<script src="${CDN}/b.js"></script>`,
      `</head><body><img src="${CDN}/c.png"></body></html>`,
    ].join("");
    expect(findExternalRefs(html).map((r) => r.kind)).toEqual([
      "script",
      "style",
      "image",
    ]);
  });
});
```

Note the ordering assertion in the last case: refs come back grouped by the
matcher's own passes — scripts, then links, then images, then style-block refs —
not in document order. `lib/page-inline.ts` sorts them itself and
`applyReplacements` sorts by position, so nothing downstream depends on the
order they arrive in. The test pins what the matcher actually does so a later
reader is not misled.

- [x] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/lib/page-refs.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/page-refs"`.

- [x] **Step 3: Write the types, the attribute helpers and the document pass**

Create `lib/page-refs.ts`:

```ts
import { assetKindForUrl, type RefKind } from "@/lib/asset-policy";

// A deliberately small matcher, in the spirit of lib/inline-markup.ts: the
// shapes it has to recognise are narrow and known, and an HTML parser would be
// this project's first parsing dependency. Nothing here validates markup — an
// unrecognised shape is left alone, which means it stays blocked rather than
// becoming broken.
//
// The known limit of matching attributes with [^>]* is an attribute value
// containing a literal `>`. Such a tag is not recognised and so not inlined.
// Accepted: the same contract the inline markup parser has, where an unclosed
// marker stays literal.

// What the replacement looks like, which is a different question from RefKind —
// that one says what to fetch, this one says what to write in its place: a <link>
// becomes a <style> element, an @import inside a <style> becomes the
// stylesheet's text with no element around it, and an image becomes a bare data
// URI spliced in where its URL was.
export type RefForm =
  | "script-element"
  | "style-element"
  | "css-text"
  | "url-value"
  | "css-url";

export type ExternalRef = {
  kind: RefKind;
  form: RefForm;
  // Absolute and entity-decoded, unless `relative` is true — in which case this
  // is the raw text, kept only so the report can name it.
  url: string;
  // The span the replacement takes over.
  start: number;
  end: number;
  // Carried onto the inline element, already prefixed with a space when
  // non-empty. Always "" unless form is script-element or style-element.
  attrs: string;
  relative: boolean;
  // Known to be unsafe to inline before anything is fetched: an @import
  // carrying a media condition. Reported, never fetched.
  unsafe: boolean;
};

export type Replacement = { start: number; end: number; text: string };

const SCRIPT = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
const LINK = /<link\b([^>]*)>/gi;
const IMG = /<img\b([^>]*)>/gi;
const STYLE = /<style\b([^>]*)>([\s\S]*?)<\/style\s*>/gi;

const CSS_IMPORT =
  /@import\s+(?:url\(\s*)?(?:"([^"]*)"|'([^']*)'|([^\s"')]+))\s*\)?([^;]*);/gi;
const CSS_URL = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]*))\s*\)/gi;

// Nothing to fetch for any of these, so they are not refs at all.
const IGNORED = /^(?:data:|blob:|about:|javascript:|mailto:|tel:|#)/i;

const SCHEME = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;

// A URL in an HTML attribute is entity-encoded, and `&` is the only character
// that shows up that way in practice: a Google Fonts href carries
// `?family=Inter&amp;display=swap`. Deliberately not a general entity decoder.
// &amp; decodes last, for the reason tools/publish-dia-artifact.sh records —
// doing it first would collapse a deliberately double-escaped value by a level.
function decodeAttrUrl(value: string): string {
  return value
    .replace(/&#x26;/gi, "&")
    .replace(/&#38;/g, "&")
    .replace(/&amp;/gi, "&");
}

type Target = { url: string; relative: boolean };

// baseUrl is the document (null) or the stylesheet a ref was found inside.
function resolveRef(raw: string, baseUrl: string | null): Target | null {
  const value = decodeAttrUrl(raw).trim();
  if (!value || IGNORED.test(value)) return null;
  if (SCHEME.test(value)) return { url: value, relative: false };
  // A protocol-relative URL is absolute with the page's scheme, which is https
  // in production. Upgrading it here means the allowlist gets to judge it
  // rather than it being silently dropped as relative.
  if (value.startsWith("//")) return { url: `https:${value}`, relative: false };
  if (baseUrl === null) return { url: value, relative: true };
  try {
    // Resolved against the stylesheet's own URL, not the page's — that is what
    // CSS does, and it is what makes url(./fonts/x.woff2) inside a jsdelivr
    // stylesheet reach jsdelivr. Resolution preserves the host, so this cannot
    // reach off the allowlist; the allowlist is checked again regardless.
    return { url: new URL(value, baseUrl).toString(), relative: false };
  } catch {
    return null;
  }
}

type AttrMatch = { value: string; start: number; end: number };

// Returns the value and where the value's text sits inside `attrs`, so a caller
// can splice into it without rebuilding the tag.
function attrMatch(attrs: string, name: string): AttrMatch | null {
  const found = new RegExp(
    `\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`,
    "i",
  ).exec(attrs);
  if (!found) return null;

  const value = found[1] ?? found[2] ?? found[3] ?? "";
  const quoted = found[1] !== undefined || found[2] !== undefined;
  const end = found.index + found[0].length - (quoted ? 1 : 0);
  return { value, start: end - value.length, end };
}

function attr(attrs: string, name: string): string | null {
  return attrMatch(attrs, name)?.value ?? null;
}

// Returns "" or a string already starting with one space, so a caller can write
// `<style${attrs}>` without deciding about spacing.
function attrsWithout(attrs: string, name: string): string {
  const rest = attrs
    .replace(
      new RegExp(`\\s*\\b${name}\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\s"'>]+)`, "i"),
      "",
    )
    .replace(/\s*\/\s*$/, "")
    .trim();
  return rest ? ` ${rest}` : "";
}

function mediaAttr(attrs: string): string {
  const media = attr(attrs, "media");
  return media ? ` media="${media.replace(/"/g, "&quot;")}"` : "";
}

// A token list, so rel="preload stylesheet" counts and rel="icon" does not.
// Substring matching would make an icon a stylesheet the first time someone
// wrote rel="apple-touch-icon".
function isStylesheet(attrs: string): boolean {
  const rel = attr(attrs, "rel");
  return rel !== null && rel.toLowerCase().split(/\s+/).includes("stylesheet");
}

// Where group 1 (the attributes) starts, relative to the document. The first
// `>` in the match closes the open tag, because [^>]* cannot cross one.
function attrsOffset(match: RegExpExecArray): number {
  return match.index + match[0].indexOf(">") - match[1].length;
}

export function findExternalRefs(html: string): ExternalRef[] {
  const refs: ExternalRef[] = [];

  for (const match of html.matchAll(SCRIPT)) {
    const target = resolveRef(attr(match[1], "src") ?? "", null);
    if (!target) continue;
    refs.push({
      kind: "script",
      form: "script-element",
      url: target.url,
      start: match.index,
      end: match.index + match[0].length,
      attrs: attrsWithout(match[1], "src"),
      relative: target.relative,
      unsafe: false,
    });
  }

  for (const match of html.matchAll(LINK)) {
    if (!isStylesheet(match[1])) continue;
    const target = resolveRef(attr(match[1], "href") ?? "", null);
    if (!target) continue;
    refs.push({
      kind: "style",
      form: "style-element",
      url: target.url,
      start: match.index,
      end: match.index + match[0].length,
      // Only media travels. A <style media="print"> means what the <link>
      // meant; nothing else a <link> carries has a meaning on a <style>.
      attrs: mediaAttr(match[1]),
      relative: target.relative,
      unsafe: false,
    });
  }

  for (const match of html.matchAll(IMG)) {
    const src = attrMatch(match[1], "src");
    if (!src) continue;
    const target = resolveRef(src.value, null);
    if (!target) continue;
    const offset = attrsOffset(match);
    refs.push({
      kind: assetKindForUrl(target.url),
      form: "url-value",
      url: target.url,
      start: offset + src.start,
      end: offset + src.end,
      attrs: "",
      relative: target.relative,
      unsafe: false,
    });
  }

  // An inline <style> is not a fetch, so refs inside it are first-depth fetches
  // exactly like the document's own — which is what makes the common
  // `@import url(fonts.googleapis.com/...)` reach its fonts within the depth cap.
  for (const match of html.matchAll(STYLE)) {
    const contentAt = match.index + match[0].indexOf(">") + 1;
    refs.push(...findCssRefs(match[2], null, contentAt));
  }

  return refs;
}
```

- [x] **Step 4: Run the document tests**

Run: `npx vitest run tests/lib/page-refs.test.ts -t findExternalRefs`
Expected: FAIL — `findCssRefs is not a function`. Only the two style-block cases
fail; every other case in that describe passes. Step 5 completes it.

- [x] **Step 5: Add the CSS pass and the replacement helpers**

Append to `lib/page-refs.ts`:

```ts
// `offset` is where this CSS sits inside the document, so a ref found in an
// inline <style> carries a span the document's own splicer can use. It is 0
// when the CSS was fetched and is being rewritten on its own.
export function findCssRefs(
  css: string,
  baseUrl: string | null,
  offset = 0,
): ExternalRef[] {
  const refs: ExternalRef[] = [];
  const importSpans: Array<[number, number]> = [];

  for (const match of css.matchAll(CSS_IMPORT)) {
    importSpans.push([match.index, match.index + match[0].length]);
    const target = resolveRef(match[1] ?? match[2] ?? match[3] ?? "", baseUrl);
    if (!target) continue;
    refs.push({
      kind: "style",
      form: "css-text",
      url: target.url,
      start: offset + match.index,
      end: offset + match.index + match[0].length,
      attrs: "",
      relative: target.relative,
      // `@import "a.css" screen;` means "only for screens", and replacing the
      // rule with the stylesheet's text would apply it everywhere. Reported
      // rather than silently widened.
      unsafe: (match[4] ?? "").trim() !== "",
    });
  }

  for (const match of css.matchAll(CSS_URL)) {
    // A url() inside an @import is that rule's own target, already handled.
    const inImport = importSpans.some(
      ([from, to]) => match.index >= from && match.index < to,
    );
    if (inImport) continue;
    const target = resolveRef(match[1] ?? match[2] ?? match[3] ?? "", baseUrl);
    if (!target) continue;
    refs.push({
      kind: assetKindForUrl(target.url),
      form: "css-url",
      url: target.url,
      start: offset + match.index,
      end: offset + match.index + match[0].length,
      attrs: "",
      relative: target.relative,
      unsafe: false,
    });
  }

  return refs;
}

// A JavaScript bundle containing the literal `</script>` — in a string, a
// template literal or a regex — closes the tag early once it is inlined,
// because the HTML tokenizer does not know it is inside a string. `<\/script`
// is the same JavaScript in all three of those contexts.
//
// Residual: String.raw around a template literal holding `</script>` changes
// meaning, since \/ stops being an escape there. Accepted — refusing to inline
// any script that so much as mentions `</script` would reject libraries that
// legitimately carry HTML snippets.
export function escapeScriptBody(code: string): string {
  return code.replace(/<\/(script)/gi, "<\\/$1");
}

// Splices rather than replaces. Two refs to the same URL — an artifact using
// one icon twice — and a ref whose text is a substring of another's both defeat
// String.replace, silently and in different ways.
export function applyReplacements(
  source: string,
  edits: Replacement[],
): string {
  const ordered = [...edits].sort((a, b) => a.start - b.start);
  let out = "";
  let cursor = 0;

  for (const edit of ordered) {
    // Overlapping spans cannot happen from the passes above; if one ever does,
    // the first wins rather than the output being corrupted.
    if (edit.start < cursor) continue;
    out += source.slice(cursor, edit.start) + edit.text;
    cursor = edit.end;
  }

  return out + source.slice(cursor);
}
```

- [x] **Step 6: Add the CSS and helper tests**

Append to `tests/lib/page-refs.test.ts`:

```ts
describe("findCssRefs", () => {
  it("resolves a relative url() against the stylesheet, not the page", () => {
    const [ref] = findCssRefs(
      `@font-face{src:url(./fonts/a.woff2)}`,
      "https://cdn.jsdelivr.net/npm/pkg/dist/a.css",
    );
    expect(ref.url).toBe("https://cdn.jsdelivr.net/npm/pkg/dist/fonts/a.woff2");
    expect(ref.relative).toBe(false);
  });

  it("reads an absolute url() as it stands", () => {
    const [ref] = findCssRefs(
      `@font-face{src:url("https://fonts.gstatic.com/a.woff2") format("woff2")}`,
      "https://fonts.googleapis.com/css2",
    );
    expect(ref.url).toBe("https://fonts.gstatic.com/a.woff2");
    expect(ref.kind).toBe("font");
  });

  it("does not double-count the url() belonging to an @import", () => {
    const refs = findCssRefs(`@import url("https://x.test/a.css");`, null);
    expect(refs).toHaveLength(1);
    expect(refs[0].form).toBe("css-text");
  });

  it("reads an @import with no url() wrapper", () => {
    const [ref] = findCssRefs(`@import "https://x.test/a.css";`, null);
    expect(ref.url).toBe("https://x.test/a.css");
  });

  // Replacing the rule with the stylesheet's text would apply a print-only
  // sheet to the screen.
  it("marks an @import carrying a media condition unsafe", () => {
    const [ref] = findCssRefs(`@import "https://x.test/a.css" print;`, null);
    expect(ref.unsafe).toBe(true);
  });

  it("ignores a data URI already inlined", () => {
    expect(findCssRefs(`@font-face{src:url(data:font/woff2;base64,AA)}`, null))
      .toEqual([]);
  });

  it("offsets spans so a caller can splice into the document", () => {
    const html = `<style>a{background:url(https://x.test/a.png)}</style>`;
    const [ref] = findCssRefs(html.slice(7, -8), null, 7);
    expect(html.slice(ref.start, ref.end)).toBe("url(https://x.test/a.png)");
  });
});

describe("escapeScriptBody", () => {
  it("neutralises a closing tag hidden in a string literal", () => {
    const escaped = escapeScriptBody(`var t = "</script>";`);
    expect(escaped).toBe(`var t = "<\\/script>";`);
    expect(escaped).not.toContain("</script");
  });

  it("catches every occurrence and any casing", () => {
    expect(escapeScriptBody(`a</SCRIPT>b</script >c`)).toBe(
      `a<\\/SCRIPT>b<\\/script >c`,
    );
  });

  it("leaves ordinary code alone", () => {
    expect(escapeScriptBody(`var a = 1 / 2;`)).toBe(`var a = 1 / 2;`);
  });
});

describe("applyReplacements", () => {
  it("returns the source untouched when there is nothing to do", () => {
    expect(applyReplacements("<p>x</p>", [])).toBe("<p>x</p>");
  });

  it("replaces two refs to the same URL independently", () => {
    const source = `<img src="a.png"><img src="a.png">`;
    const out = applyReplacements(source, [
      { start: 10, end: 15, text: "ONE" },
      { start: 28, end: 33, text: "TWO" },
    ]);
    expect(out).toBe(`<img src="ONE"><img src="TWO">`);
  });

  it("does not care what order the edits arrive in", () => {
    const source = "abcdef";
    const edits = [
      { start: 4, end: 5, text: "E" },
      { start: 1, end: 2, text: "B" },
    ];
    expect(applyReplacements(source, edits)).toBe("aBcdEf");
  });
});
```

- [x] **Step 7: Run both lib test files**

Run: `npx vitest run tests/lib/page-refs.test.ts tests/lib/asset-policy.test.ts`
Expected: PASS, both files.

- [x] **Step 8: Commit**

```bash
git add lib/page-refs.ts tests/lib/page-refs.test.ts
git commit -m "feat: find and splice a page's external asset refs

Spans rather than string replacement, because an artifact that uses one icon
twice defeats String.replace. escapeScriptBody covers the bundle that carries
a literal </script> in a string, which would otherwise close the tag early.

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 3: Give a Response body the same bounded read a Request body gets

**Files:**
- Modify: `lib/bounded-body.ts:1-35`

The comment at the top of that file — "Content-Length is a claim, not a fact …
counting bytes as they arrive is what actually bounds how much a caller can make
the process buffer" — applies word for word to a response from a third-party
host. That is why this is a refactor and not a second bounded read.

- [x] **Step 1: Extract the byte-level read**

Replace the whole of `lib/bounded-body.ts` with:

```ts
// Content-Length is a claim, not a fact: a chunked request omits it entirely
// and a hostile one can lie. Counting bytes as they arrive is what actually
// bounds how much a caller can make the process buffer, and it stops reading
// the moment the cap is passed rather than after the whole body has landed.
//
// Takes a body rather than a Request so a Response gets the same treatment: an
// asset fetched from a CDN is exactly as much of a claim as an upload is.
export async function readBoundedBytes(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number,
): Promise<Uint8Array | null> {
  if (!body) return new Uint8Array(0);
  const reader = body.getReader();

  const chunks: Uint8Array[] = [];
  let total = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;

    total += value.length;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }

  return bytes;
}

export async function readBoundedBody(
  request: Request,
  maxBytes: number,
): Promise<string | null> {
  const bytes = await readBoundedBytes(request.body, maxBytes);
  return bytes === null ? null : new TextDecoder().decode(bytes);
}
```

- [x] **Step 2: Verify nothing that used it changed shape**

Run: `npx tsc --noEmit`
Expected: no errors. `readBoundedBody` keeps its signature and its
missing-body-means-empty-string behaviour, so `app/api/pages/route.ts:70` is
untouched.

- [x] **Step 3: Commit**

```bash
git add lib/bounded-body.ts
git commit -m "refactor: bound a read by body rather than by Request

A CDN response is as much of a claim as an upload is, and deserves the same
count-as-it-arrives cap instead of a second implementation of one.

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 4: The fetcher

**Files:**
- Create: `lib/asset-fetch.ts`

This is the only module here that opens a socket, and it is deliberately **not**
unit-tested — the same exemption components and Prisma access have in `CLAUDE.md`.
Everything testable about it was pushed into `lib/asset-policy.ts` in Task 1.

**Reviewer's checklist for this file, because a fake fetcher cannot cover any of
it:** the allowlist is consulted *before* `fetch`; `redirect: "error"` is present;
there is a timeout; the body read is bounded; the content type is checked before
the bytes are used.

- [x] **Step 1: Write the implementation**

Create `lib/asset-fetch.ts`:

```ts
import {
  contentTypeMatches,
  isAllowedAssetUrl,
  MAX_ASSET_BYTES,
  SKIP_REASONS,
  type RefKind,
} from "@/lib/asset-policy";
import { readBoundedBytes } from "@/lib/bounded-body";

export type FetchedAsset = { contentType: string; bytes: Uint8Array };

export type AssetFetchResult =
  | { ok: true; asset: FetchedAsset }
  | { ok: false; reason: string };

// Injected into lib/page-inline.ts rather than imported by it, so the depth,
// budget and priority rules can be tested with a fake and no socket. Same
// arrangement as the measurer in lib/whiteboard-hit.ts.
export type AssetFetcher = (
  url: string,
  kind: RefKind,
) => Promise<AssetFetchResult>;

// A publish waits on this, so it cannot wait long. Five seconds is generous for
// a CDN edge and short enough that a dead host does not hold the request open.
const TIMEOUT_MS = 5_000;

export const fetchAsset: AssetFetcher = async (url, kind) => {
  // Before the fetch, never after. This is the control that decides whether the
  // rest of the function is reachable for a given URL at all.
  if (!isAllowedAssetUrl(url)) {
    return { ok: false, reason: SKIP_REASONS.notAllowed };
  }

  let response: Response;
  try {
    response = await fetch(url, {
      // The control that carries the most weight here. Without it an
      // allowlisted host answering 302 to http://169.254.169.254/ turns the
      // allowlist into decoration, because the check above already passed.
      // A redirect is an error; it is never followed.
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { accept: "*/*" },
    });
  } catch {
    // A DNS failure, a TLS failure, a redirect and a timeout are one thing to
    // the teacher: it did not arrive. The reason she is shown says that.
    return { ok: false, reason: SKIP_REASONS.fetchFailed };
  }

  if (!response.ok) return { ok: false, reason: SKIP_REASONS.fetchFailed };

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentTypeMatches(kind, contentType, url)) {
    return { ok: false, reason: SKIP_REASONS.wrongType };
  }

  const bytes = await readBoundedBytes(response.body, MAX_ASSET_BYTES);
  if (bytes === null) return { ok: false, reason: SKIP_REASONS.tooBig };

  return { ok: true, asset: { contentType, bytes } };
};
```

- [x] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [x] **Step 3: Confirm the allowlist holds, without a browser**

Run:

```bash
node --experimental-strip-types --input-type=module -e "
const { isAllowedAssetUrl } = await import('./lib/asset-policy.ts');
for (const u of [
  'https://artifactcdn.diabrowser.engineering/ajax/libs/animejs/anime.min.js',
  'http://169.254.169.254/latest/meta-data/',
  'https://cdnjs.cloudflare.com@evil.example/x.js',
]) console.log(isAllowedAssetUrl(u), u);
"
```

Expected: `true`, then `false`, then `false`.

- [x] **Step 4: Commit**

```bash
git add lib/asset-fetch.ts
git commit -m "feat: add the allowlisted asset fetcher

redirect: 'error' is load-bearing. The allowlist is checked before the fetch,
so a 302 from an allowlisted host to the metadata service would otherwise walk
straight past it.

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 5: The orchestrator

**Files:**
- Create: `lib/page-inline.ts`
- Test: `tests/lib/page-inline.test.ts`

- [x] **Step 1: Write the failing test**

Create `tests/lib/page-inline.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { inlineBudget, inlinePageAssets } from "@/lib/page-inline";
import { SKIP_REASONS } from "@/lib/asset-policy";
import { MAX_PAGE_BYTES, validatePageHtml } from "@/lib/page-html";
import type { AssetFetcher } from "@/lib/asset-fetch";

const encoder = new TextEncoder();

// The fetcher is injected, so every rule below is exercised with no socket.
// This fake ignores `kind`: demanding the right content type belongs to the real
// fetcher, and the rule itself is covered in tests/lib/asset-policy.test.ts.
function fakeFetcher(
  files: Record<string, { contentType: string; body: string }>,
): AssetFetcher {
  return async (url) => {
    const file = files[url];
    if (!file) return { ok: false, reason: SKIP_REASONS.fetchFailed };
    return {
      ok: true,
      asset: { contentType: file.contentType, bytes: encoder.encode(file.body) },
    };
  };
}

const refuse: AssetFetcher = async () => {
  throw new Error("the fetcher must not be called");
};

const JS = "application/javascript";
const CSS = "text/css";
const ANIME =
  "https://artifactcdn.diabrowser.engineering/ajax/libs/animejs/anime.min.js";

describe("inlinePageAssets", () => {
  it("replaces a script element with its code", async () => {
    const html = `<body><script src="${ANIME}"></script></body>`;
    const fetcher = fakeFetcher({ [ANIME]: { contentType: JS, body: "var anime=1;" } });

    const result = await inlinePageAssets(html, fetcher, 10_000);

    expect(result.html).toBe(`<body><script>var anime=1;</script></body>`);
    expect(result.skipped).toEqual([]);
  });

  it("escapes a closing tag hiding in the fetched code", async () => {
    const html = `<script src="${ANIME}"></script>`;
    const fetcher = fakeFetcher({
      [ANIME]: { contentType: JS, body: `d.write("</script>")` },
    });

    const result = await inlinePageAssets(html, fetcher, 10_000);

    expect(result.html).toBe(`<script>d.write("<\\/script>")</script>`);
  });

  it("turns a stylesheet link into a style element, keeping media", async () => {
    const url = "https://cdn.jsdelivr.net/npm/a/dist/a.css";
    const html = `<link rel="stylesheet" href="${url}" media="print">`;
    const fetcher = fakeFetcher({ [url]: { contentType: CSS, body: "a{color:red}" } });

    const result = await inlinePageAssets(html, fetcher, 10_000);

    expect(result.html).toBe(`<style media="print">a{color:red}</style>`);
  });

  // The case the depth rule exists for: fonts.googleapis.com answers a
  // stylesheet request with CSS that points at fonts.gstatic.com, so a one-level
  // implementation inlines the stylesheet and leaves the fonts blocked.
  it("follows a stylesheet to the fonts it names", async () => {
    const sheet = "https://fonts.googleapis.com/css2?family=Inter";
    const font = "https://fonts.gstatic.com/s/inter/a.woff2";
    const html = `<link rel="stylesheet" href="${sheet}">`;
    const fetcher = fakeFetcher({
      [sheet]: { contentType: CSS, body: `@font-face{src:url(${font})}` },
      [font]: { contentType: "font/woff2", body: "FONT" },
    });

    const result = await inlinePageAssets(html, fetcher, 10_000);

    expect(result.html).toContain("data:font/woff2;base64,");
    expect(result.html).not.toContain("fonts.gstatic.com");
    expect(result.skipped).toEqual([]);
  });

  it("reaches the fonts behind an @import in an inline style block", async () => {
    const sheet = "https://fonts.googleapis.com/css2?family=Inter";
    const font = "https://fonts.gstatic.com/s/inter/a.woff2";
    const html = `<style>@import url(${sheet});</style>`;
    const fetcher = fakeFetcher({
      [sheet]: { contentType: CSS, body: `@font-face{src:url(${font})}` },
      [font]: { contentType: "font/woff2", body: "FONT" },
    });

    const result = await inlinePageAssets(html, fetcher, 10_000);

    // The @import rule becomes the stylesheet's text, with no element around it.
    expect(result.html).toBe(
      `<style>@font-face{src:url("data:font/woff2;base64,Rk9OVA==")}</style>`,
    );
  });

  it("stops at the third fetch", async () => {
    const outer = "https://cdn.jsdelivr.net/a.css";
    const inner = "https://cdn.jsdelivr.net/b.css";
    const font = "https://cdn.jsdelivr.net/c.woff2";
    const html = `<link rel="stylesheet" href="${outer}">`;
    const fetcher = fakeFetcher({
      [outer]: { contentType: CSS, body: `@import url(${inner});` },
      [inner]: { contentType: CSS, body: `@font-face{src:url(${font})}` },
      [font]: { contentType: "font/woff2", body: "FONT" },
    });

    const result = await inlinePageAssets(html, fetcher, 10_000);

    // Both stylesheets arrive; the font behind the second one does not.
    expect(result.html).toContain(font);
    expect(result.skipped).toEqual([{ url: font, reason: SKIP_REASONS.tooDeep }]);
  });

  it("leaves an unlisted host alone and names it", async () => {
    const url = "https://evil.example/a.js";
    const html = `<script src="${url}"></script>`;

    const result = await inlinePageAssets(html, refuse, 10_000);

    expect(result.html).toBe(html);
    expect(result.skipped).toEqual([{ url, reason: SKIP_REASONS.notAllowed }]);
  });

  it("reports a relative ref rather than trying to fetch it", async () => {
    const html = `<link rel="stylesheet" href="./styles.css">`;

    const result = await inlinePageAssets(html, refuse, 10_000);

    expect(result.html).toBe(html);
    expect(result.skipped).toEqual([
      { url: "./styles.css", reason: SKIP_REASONS.relative },
    ]);
  });

  it("reports a fetch that failed and leaves the ref in place", async () => {
    const html = `<script src="${ANIME}"></script>`;

    const result = await inlinePageAssets(html, fakeFetcher({}), 10_000);

    expect(result.html).toBe(html);
    expect(result.skipped).toEqual([{ url: ANIME, reason: SKIP_REASONS.fetchFailed }]);
  });

  // No CSS escape is safe inside a comment, unlike <\/script in a script body.
  it("skips a stylesheet that would close its own tag", async () => {
    const url = "https://cdn.jsdelivr.net/a.css";
    const html = `<link rel="stylesheet" href="${url}">`;
    const fetcher = fakeFetcher({
      [url]: { contentType: CSS, body: `a{content:"</style>"}` },
    });

    const result = await inlinePageAssets(html, fetcher, 10_000);

    expect(result.html).toBe(html);
    expect(result.skipped).toEqual([{ url, reason: SKIP_REASONS.unsafe }]);
  });

  it("skips an @import carrying a media condition without fetching it", async () => {
    const url = "https://cdn.jsdelivr.net/print.css";
    const html = `<style>@import "${url}" print;</style>`;

    const result = await inlinePageAssets(html, refuse, 10_000);

    expect(result.skipped).toEqual([{ url, reason: SKIP_REASONS.unsafe }]);
  });

  // Scripts before images: a missing image is a gap, a missing script is a page
  // that does nothing.
  it("spends a tight budget on the script and reports the image", async () => {
    const img = "https://cdn.jsdelivr.net/big.png";
    const html = `<img src="${img}"><script src="${ANIME}"></script>`;
    const fetcher = fakeFetcher({
      [ANIME]: { contentType: JS, body: "var a=1;" },
      [img]: { contentType: "image/png", body: "x".repeat(400) },
    });

    const result = await inlinePageAssets(html, fetcher, 40);

    expect(result.html).toContain("<script>var a=1;</script>");
    expect(result.html).toContain(img);
    expect(result.skipped).toEqual([{ url: img, reason: SKIP_REASONS.tooBig }]);
  });

  it("never returns a document its own validator would reject", async () => {
    const html = `<script src="${ANIME}"></script>`;
    const fetcher = fakeFetcher({ [ANIME]: { contentType: JS, body: "var a=1;" } });

    const result = await inlinePageAssets(html, fetcher, inlineBudget(html));

    expect(validatePageHtml(result.html).ok).toBe(true);
  });

  // Idempotence is what makes the backfill safe to re-run and the
  // download-edit-reupload round trip a no-op for this step.
  it("changes nothing on a document that is already self-contained", async () => {
    const html = `<body><script>var a=1;</script><img src="data:image/png;base64,AA"></body>`;

    const first = await inlinePageAssets(html, refuse, 10_000);
    const second = await inlinePageAssets(first.html, refuse, 10_000);

    expect(first.html).toBe(html);
    expect(second.html).toBe(html);
    expect(second.skipped).toEqual([]);
  });
});

describe("inlineBudget", () => {
  it("leaves room under the page cap", () => {
    const budget = inlineBudget("<p>x</p>");
    expect(budget).toBeGreaterThan(0);
    expect(budget).toBeLessThan(MAX_PAGE_BYTES);
  });

  it("is zero rather than negative for a document already at the cap", () => {
    expect(inlineBudget("x".repeat(MAX_PAGE_BYTES))).toBe(0);
  });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/lib/page-inline.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/page-inline"`.

- [x] **Step 3: Write the implementation**

Create `lib/page-inline.ts`:

```ts
import { byteLength, MAX_PAGE_BYTES, validatePageHtml } from "@/lib/page-html";
import {
  applyReplacements,
  escapeScriptBody,
  findCssRefs,
  findExternalRefs,
  type ExternalRef,
  type Replacement,
} from "@/lib/page-refs";
import { isAllowedAssetUrl, SKIP_REASONS, type RefKind } from "@/lib/asset-policy";
import type { AssetFetcher, FetchedAsset } from "@/lib/asset-fetch";

export type SkippedRef = { url: string; reason: string };
export type InlineResult = { html: string; skipped: SkippedRef[] };

// Two fetches deep, counted in fetches rather than in documents. A <link> to
// fonts.googleapis.com is one fetch for the stylesheet and a second for each
// woff2 it names, which is the case this exists for; an @import inside an inline
// <style> is the same two, because an inline <style> is not a fetch. A third
// would mean a stylesheet importing a stylesheet that names a font, which has no
// case behind it, and recursion over input the server does not control is a
// budget problem waiting to happen.
const MAX_FETCH_DEPTH = 2;

// Room for the tags the rewrite adds around fetched text, so the accounting
// never has to be exact to stay under MAX_PAGE_BYTES.
const BUDGET_MARGIN = 4096;

// A missing image degrades to a gap; a missing script degrades to a page that
// does nothing. So a tight budget is spent on scripts first.
const PRIORITY: Record<RefKind, number> = { script: 0, style: 1, image: 2, font: 2 };

type Budget = { remaining: number };

export function inlineBudget(html: string): number {
  return Math.max(0, MAX_PAGE_BYTES - byteLength(html) - BUDGET_MARGIN);
}

export async function inlinePageAssets(
  html: string,
  fetchAsset: AssetFetcher,
  budgetBytes: number,
): Promise<InlineResult> {
  const refs = findExternalRefs(html);
  if (refs.length === 0) return { html, skipped: [] };

  const skipped: SkippedRef[] = [];
  const budget: Budget = { remaining: budgetBytes };
  const edits = await inlineRefs(refs, fetchAsset, budget, skipped, 1);

  const result = applyReplacements(html, edits);

  // The budget should make this unreachable. If it is ever reached, the publish
  // keeps the document it was handed rather than storing one the app's own
  // validator would reject — the next edit of that page would otherwise fail on
  // content the server itself created.
  if (!validatePageHtml(result).ok) {
    return {
      html,
      skipped: refs.map((ref) => ({ url: ref.url, reason: SKIP_REASONS.tooBig })),
    };
  }

  return { html: result, skipped };
}

async function inlineRefs(
  refs: ExternalRef[],
  fetchAsset: AssetFetcher,
  budget: Budget,
  skipped: SkippedRef[],
  depth: number,
): Promise<Replacement[]> {
  const ordered = [...refs].sort(
    (a, b) => PRIORITY[a.kind] - PRIORITY[b.kind] || a.start - b.start,
  );

  const edits: Replacement[] = [];
  for (const ref of ordered) {
    const text = await inlineRef(ref, fetchAsset, budget, skipped, depth);
    if (text !== null) edits.push({ start: ref.start, end: ref.end, text });
  }
  return edits;
}

async function inlineRef(
  ref: ExternalRef,
  fetchAsset: AssetFetcher,
  budget: Budget,
  skipped: SkippedRef[],
  depth: number,
): Promise<string | null> {
  const skip = (reason: string): null => {
    skipped.push({ url: ref.url, reason });
    return null;
  };

  if (ref.relative) return skip(SKIP_REASONS.relative);
  if (ref.unsafe) return skip(SKIP_REASONS.unsafe);
  if (depth > MAX_FETCH_DEPTH) return skip(SKIP_REASONS.tooDeep);
  // Checked here as well as inside the fetcher, so the rule is covered by a test
  // that uses a fake and a fake cannot make an unlisted host reachable.
  if (!isAllowedAssetUrl(ref.url)) return skip(SKIP_REASONS.notAllowed);

  const fetched = await fetchAsset(ref.url, ref.kind);
  if (!fetched.ok) return skip(fetched.reason);

  if (ref.kind === "style") {
    return inlineStyle(ref, fetched.asset, fetchAsset, budget, skipped, depth, skip);
  }

  if (ref.kind === "script") {
    const code = escapeScriptBody(new TextDecoder().decode(fetched.asset.bytes));
    // defer and async are no-ops on an inline script, so the code now runs where
    // the tag sits rather than after parsing. Harmless for a library, which is
    // all any host on the allowlist serves; the attributes are kept so the
    // source still reads the way its author wrote it.
    return charge(`<script${ref.attrs}>${code}</script>`, budget, skip);
  }

  const uri = dataUri(fetched.asset);
  return charge(ref.form === "css-url" ? `url("${uri}")` : uri, budget, skip);
}

async function inlineStyle(
  ref: ExternalRef,
  asset: FetchedAsset,
  fetchAsset: AssetFetcher,
  budget: Budget,
  skipped: SkippedRef[],
  depth: number,
  skip: (reason: string) => null,
): Promise<string | null> {
  const css = new TextDecoder().decode(asset.bytes);

  // A CSS escape does not apply inside a comment, so no substitution is safe in
  // every context — unlike <\/script in a script body, which means the same
  // thing everywhere. Skipped rather than half-escaped.
  if (/<\/style/i.test(css)) return skip(SKIP_REASONS.unsafe);

  // Charged before the nested pass, which charges its own assets. Charging the
  // finished text instead would count every inlined font twice.
  if (charge(css, budget, skip) === null) return null;

  const nested = await inlineRefs(
    findCssRefs(css, ref.url),
    fetchAsset,
    budget,
    skipped,
    depth + 1,
  );
  const inlined = applyReplacements(css, nested);

  return ref.form === "css-text" ? inlined : `<style${ref.attrs}>${inlined}</style>`;
}

function charge(
  text: string,
  budget: Budget,
  skip: (reason: string) => null,
): string | null {
  const cost = byteLength(text);
  if (cost > budget.remaining) return skip(SKIP_REASONS.tooBig);
  budget.remaining -= cost;
  return text;
}

// Buffer rather than btoa: btoa needs a binary string, and building one from a
// 100 KB font with String.fromCharCode overflows the argument list. This module
// is server-only — a route handler, a server action and a Node script — which is
// what makes Buffer available everywhere it runs.
function dataUri(asset: FetchedAsset): string {
  // Parameters are dropped: charset=utf-8 on a font means nothing, and a stray
  // `;` inside a data URI's media type would need escaping.
  const media =
    asset.contentType.split(";")[0].trim() || "application/octet-stream";
  return `data:${media};base64,${Buffer.from(asset.bytes).toString("base64")}`;
}
```

- [x] **Step 4: Run the test**

Run: `npx vitest run tests/lib/page-inline.test.ts`
Expected: PASS, 15 tests.

If the `@import` case fails on the exact base64, note that `Rk9OVA==` is
`btoa("FONT")` — check the fake's body string rather than changing the assertion.

- [x] **Step 5: Run the whole suite and typecheck**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: all pass. Nothing outside `lib/` has changed yet.

- [x] **Step 6: Commit**

```bash
git add lib/page-inline.ts tests/lib/page-inline.test.ts
git commit -m "feat: inline a page's external assets, two fetches deep

Two is the number the Google Fonts case needs: one fetch for the stylesheet,
one for each woff2 it names. The budget is charged at the leaf so an inlined
font is not counted twice, and a document the validator would reject is never
returned.

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 6: Run it on the token path

**Files:**
- Modify: `lib/page-inline.ts` (add the bound convenience wrapper)
- Modify: `app/api/pages/route.ts:1-8` (imports), `:122-125` (the save and the reply)

- [x] **Step 1: Add the wrapper the three call sites share**

Append to `lib/page-inline.ts`:

```ts
// The injected form above is the tested one; this is the one-line binding the
// three write paths share, so none of them has to know which fetcher or which
// budget is the right one.
export function inlinePage(html: string): Promise<InlineResult> {
  return inlinePageAssets(html, fetchAsset, inlineBudget(html));
}
```

and add `fetchAsset` to the existing import from `@/lib/asset-fetch`, which
becomes two imports because one of them is a type:

```ts
import { fetchAsset } from "@/lib/asset-fetch";
import type { AssetFetcher, FetchedAsset } from "@/lib/asset-fetch";
```

`isolatedModules` is on, so the type import must stay marked `type` — and the
backfill in Task 10 relies on that too, since Node's type stripper removes
annotations without working out which imports were types.

- [x] **Step 2: Wire the route**

In `app/api/pages/route.ts`, add to the imports:

```ts
import { inlinePage } from "@/lib/page-inline";
```

Then replace lines 122-125:

```ts
  const saved = await savePage({ slug, kind: "html", title, html, groupIds });

  const origin = process.env.ORIGIN ?? new URL(request.url).origin;
  return NextResponse.json({ url: `${origin}/p/${saved}` }, { status: 201 });
```

with:

```ts
  // Between validation and the save, so what lands in the database is the
  // self-contained document. /p/[slug]/raw still serves page.html byte for byte,
  // which is what keeps the download-and-re-edit round trip honest.
  const inlined = await inlinePage(html);

  const saved = await savePage({
    slug,
    kind: "html",
    title,
    html: inlined.html,
    groupIds,
  });

  const origin = process.env.ORIGIN ?? new URL(request.url).origin;
  // `skipped` is always present, empty included: a caller that has to test for
  // the key's existence will eventually forget to.
  return NextResponse.json(
    { url: `${origin}/p/${saved}`, skipped: inlined.skipped },
    { status: 201 },
  );
```

- [x] **Step 3: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: both pass.

- [x] **Step 4: Prove it end to end against the dev server**

This is the first point where the whole path can be exercised without a browser.

```bash
npm run dev &            # leave it running
sleep 5
TOKEN=$(grep '^PAGES_UPLOAD_TOKEN=' .env.local | cut -d= -f2- | tr -d '"'"'"' \t\r')

cat > /tmp/claude/probe.json <<'JSON'
{"title":"CSP probe",
 "html":"<!doctype html><html><body><h1>probe</h1><script src=\"https://artifactcdn.diabrowser.engineering/ajax/libs/animejs/anime.min.js\"></script><script src=\"https://evil.example/x.js\"></script></body></html>"}
JSON

curl -sS -X POST http://localhost:3000/api/pages \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  --data-binary @/tmp/claude/probe.json
```

Expected: a 201 body holding a `url`, and a `skipped` array with exactly one
entry — `https://evil.example/x.js`, "is not on the list of allowed sources".

Then confirm the stored document is self-contained:

```bash
SLUG=csp-probe   # or whatever the reply's url ended in
curl -sS "http://localhost:3000/p/$SLUG/raw" | grep -c 'artifactcdn'
curl -sS "http://localhost:3000/p/$SLUG/raw" | grep -c 'evil.example'
```

Expected: `0`, then `1`. The allowlisted script is gone from the markup because
its code is now inline; the unlisted one is untouched.

If `grep -c artifactcdn` returns non-zero, the fetch failed rather than the
rewrite — re-run the `node --experimental-strip-types` check from Task 4 Step 3
and confirm the box has outbound HTTPS.

- [x] **Step 5: Commit**

```bash
git add lib/page-inline.ts app/api/pages/route.ts
git commit -m "feat: inline assets on the token publish path

Between validation and the save, so the database holds the self-contained
document and the raw route keeps serving page.html verbatim. skipped is always
present in the reply, empty included.

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 7: Run it on the admin path, and show the report

**Files:**
- Modify: `app/page-actions.ts:1-13` (imports), `:113-135` (`createPage`, `updatePage`)
- Modify: `components/admin/PagesTabClient.tsx:31`
- Modify: `components/admin/PageEditor.tsx:27`, `:31-48`, `:94-96`, `:211-215`

- [x] **Step 1: Return the report from both actions**

In `app/page-actions.ts`, add to the imports:

```ts
import { inlinePage, type SkippedRef } from "@/lib/page-inline";
```

Add beside the existing `PageInput` type:

```ts
// One shape for both actions, so PageEditor does not need to know which of them
// it is calling. updatePage returns the slug it was handed.
export type PageSaveResult = { slug: string; skipped: SkippedRef[] };
```

Replace `createPage` and `updatePage` (lines 113-135) with:

```ts
export async function createPage(input: PageInput): Promise<PageSaveResult> {
  await requireTeacher();
  const { title, html } = validatePage(input);
  const inlined = await inlinePage(html);

  const slug = await saveOrExplain({
    slug: null,
    kind: "html",
    title,
    html: inlined.html,
    groupIds: input.groupIds,
  });

  revalidatePages(slug);
  return { slug, skipped: inlined.skipped };
}

export async function updatePage(
  slug: string,
  input: PageInput,
): Promise<PageSaveResult> {
  await requireTeacher();
  const { title, html } = validatePage(input);
  const inlined = await inlinePage(html);

  await saveOrExplain({
    slug,
    kind: "html",
    title,
    html: inlined.html,
    groupIds: input.groupIds,
  });

  revalidatePages(slug);
  return { slug, skipped: inlined.skipped };
}
```

`createLink` and `addShelfLink` are untouched: a link row has no `html`.

- [x] **Step 2: Widen the prop type through the one component in between**

In `components/admin/PagesTabClient.tsx`, change line 31 from:

```ts
  onCreatePage: (input: PageInput) => Promise<unknown>;
```

to:

```ts
  onCreatePage: (input: PageInput) => Promise<PageSaveResult>;
```

and add `PageSaveResult` to the existing `@/app/page-actions` type import.

- [x] **Step 3: Render the notice in PageEditor**

In `components/admin/PageEditor.tsx`:

Change the type import on line 9 to bring both types in:

```ts
import type { PageInput, PageSaveResult } from "@/app/page-actions";
```

Change the `onSubmit` prop (line 27) from `Promise<unknown>` to:

```ts
  onSubmit: (input: PageInput) => Promise<PageSaveResult>;
```

Add state beside `error` (after line 48):

```ts
  const [skipped, setSkipped] = useState<PageSaveResult["skipped"]>([]);
```

In `handleSubmit`, clear it with the other flags and record what came back —
replace lines 94-96:

```ts
    try {
      await onSubmit({ title, html, groupIds });
      setSaved(true);
```

with:

```ts
    setSkipped([]);
    try {
      const result = await onSubmit({ title, html, groupIds });
      setSaved(true);
      setSkipped(result.skipped);
```

Note the `setSkipped([])` goes **before** the `try`, next to the existing
`setError(null)` — a stale list from the previous save would otherwise sit under
a page that published cleanly.

Then render it, after the existing `{error && …}` block (line 215):

```tsx
      {skipped.length > 0 && (
        <div role="status" className="text-sm text-[var(--color-ink-muted)]">
          <p className="text-[var(--color-accent)]">
            The page is published, but {skipped.length}{" "}
            {skipped.length === 1 ? "file" : "files"} could not be included:
          </p>
          <ul className="mt-1 space-y-0.5">
            {skipped.map((item) => (
              <li key={`${item.url}${item.reason}`}>
                <span className="break-all">{item.url}</span> — {item.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
```

The key combines url and reason: the same URL can legitimately appear twice with
different reasons, and a duplicate key would drop one of the two lines.

- [x] **Step 4: Typecheck, lint, test**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: all pass.

- [x] **Step 5: Commit**

```bash
git add app/page-actions.ts components/admin/PagesTabClient.tsx components/admin/PageEditor.tsx
git commit -m "feat: inline assets on the admin path and report what was left out

Both actions return one shape so the editor does not need to know which it
called. A publish is never blocked by an asset it could not fetch; she is told
which one instead.

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 8: Print the report from the shell script

**Files:**
- Modify: `tools/publish-dia-artifact.sh:223` (after the `✓ $URL` line)
- Modify: `tools/README.md:66-72` (the "What it warns about" section)

Every message this script produces is already invisible to Jenn when it runs from
a menu-bar Shortcut — that is the problem
`docs/superpowers/specs/2026-08-02-dia-artifact-picker-design.md:304-322` sets
out. This task only adds the line; if that spec's `gui_alert` and `die` changes
have since landed, route this line through the same TTY test so the alert path
carries it too.

- [x] **Step 1: Print what could not be inlined**

In `tools/publish-dia-artifact.sh`, immediately after:

```bash
echo "✓ $URL"
```

insert:

```bash
# The site inlines a page's external assets when it publishes it and reports
# whatever it could not fetch. That report exists only in the reply, so it has
# to be printed here or it is lost.
SKIPPED=$(osascript -l JavaScript -e '
function run(argv) {
  var list = JSON.parse(argv[0]).skipped || [];
  return list.map(function (item) { return item.url + " — " + item.reason; }).join("\n");
}' "$PAYLOAD")

if [ -n "$SKIPPED" ]; then
  echo "⚠ The page published, but some files could not be included:"
  # A read loop rather than one printf, so each line is indented. `<<<` is fine
  # on the bash 3.2 macOS ships; mapfile is not.
  while IFS= read -r line; do
    echo "    $line"
  done <<< "$SKIPPED"
fi
```

`|| []` matters: this same script publishes to whatever `$JENN_SITE` names, which
may be a deployment that predates the field.

- [x] **Step 2: Update what the README says it warns about**

In `tools/README.md`, replace the "Extra files" bullet (lines 67-70):

```markdown
- **Extra files.** If an artifact ships images or stylesheets beside
  `index.html`, only `index.html` is published and the rest go missing — the
  site's CSP blocks everything a page loads from elsewhere. The script says so
  before publishing rather than letting it fail silently in front of students.
```

with:

```markdown
- **Extra files.** If an artifact ships images or stylesheets beside
  `index.html`, only `index.html` is published and the rest go missing. The
  script says so before publishing rather than letting it fail silently in front
  of students.
- **Files it could not include.** A page that loads a script, stylesheet, image
  or font from a known CDN has it folded into the page on publish, so it works
  behind the site's CSP without anything being loaded from elsewhere. Anything
  the site could not fold in is listed after the link, with the reason — an
  unknown source, a fetch that failed, or a page that would go over 2 MB.
```

- [x] **Step 3: Check the script by hand against the dev server**

With `npm run dev` running and a Dia artifact present:

```bash
JENN_SITE=http://localhost:3000 ./tools/publish-dia-artifact.sh --local --list
JENN_SITE=http://localhost:3000 ./tools/publish-dia-artifact.sh --local
```

Expected: the usual `✓ http://localhost:3000/p/<slug>` line, followed by a `⚠`
block only if something could not be inlined. On an artifact that is already one
self-contained file, no `⚠` block at all.

If no Dia artifact is available, point the script at a fixture instead:

```bash
mkdir -p /tmp/claude/artifacts/x/site
cat > /tmp/claude/artifacts/x/site/index.html <<'HTML'
<!doctype html><html><head><title>Inline probe</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter&amp;display=swap">
</head><body><script src="https://evil.example/x.js"></script></body></html>
HTML
DIA_ARTIFACTS=/tmp/claude/artifacts ./tools/publish-dia-artifact.sh --local
```

Expected: one `⚠` line naming `https://evil.example/x.js`, and no line about the
Google stylesheet — it and its fonts were folded in.

- [x] **Step 4: Commit**

```bash
git add tools/publish-dia-artifact.sh tools/README.md
git commit -m "feat: report un-inlinable assets from the publish script

The reply carries the list and nothing else would show it. || [] so the script
still works against a deployment that predates the field.

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 9: Report it from the extension

**Files:**
- Modify: `tools/publish-extension/background.js:79-91`

- [x] **Step 1: Put the count in the notification and the detail in the console**

Replace lines 85-91 of `tools/publish-extension/background.js`:

```js
  // Published with no groups, so the link works immediately but no class sees
  // it yet. Opening the editor is how she picks the groups and fixes the title
  // without having to find the page in the admin list.
  const slug = data.url.split("/p/").pop();
  chrome.tabs.create({ url: `${siteUrl}/admin/pages/${slug}` });
  notify("Published", data.url, true);
```

with:

```js
  // The site folds a page's external scripts, stylesheets, images and fonts into
  // the document when it publishes, and lists whatever it could not. The count
  // goes in the notification because a notification has no room for URLs; the
  // list goes to the console, which is where the service worker inspector is.
  const skipped = Array.isArray(data.skipped) ? data.skipped : [];
  if (skipped.length > 0) {
    console.log(
      `[publish] could not be included:\n${skipped
        .map((item) => `  ${item.url} — ${item.reason}`)
        .join("\n")}`,
    );
  }

  // Published with no groups, so the link works immediately but no class sees
  // it yet. Opening the editor is how she picks the groups and fixes the title
  // without having to find the page in the admin list.
  const slug = data.url.split("/p/").pop();
  chrome.tabs.create({ url: `${siteUrl}/admin/pages/${slug}` });
  notify(
    "Published",
    skipped.length > 0
      ? `${data.url} — ${skipped.length} file(s) could not be included`
      : data.url,
    true,
  );
```

`Array.isArray` rather than a truthiness test: the extension is loaded unpacked
and is not redeployed with the site, so it will outlive at least one version that
does not send the field.

- [x] **Step 2: Lint**

Run: `npm run lint`
Expected: pass. `eslint.config.mjs` ignores only `.next/**`, so `eslint .` already
covers `tools/` and this file is linted today.

- [x] **Step 3: Commit**

```bash
git add tools/publish-extension/background.js
git commit -m "feat: report un-inlinable assets from the publish extension

Count in the notification, list in the console — the same split notify() already
makes, for the same reason.

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 10: Backfill the pages already published

**Files:**
- Create: `scripts/backfill-page-assets.mjs`

- [x] **Step 1: Write the script**

Create `scripts/backfill-page-assets.mjs`:

```js
// One-off, run once per environment. Idempotent: a page with no external refs
// is left alone, so re-running is safe and a second run reports nothing.
//
// Run it as:
//   node --experimental-strip-types scripts/backfill-page-assets.mjs
//
// The flag is needed because this imports ../lib/*.ts directly, the same way
// scripts/backfill-sections.mjs does. Without it Node stops at
// ERR_UNKNOWN_FILE_EXTENSION before running anything.
import { PrismaClient } from "@prisma/client";
import { inlinePage } from "../lib/page-inline.ts";
import { readPageKind } from "../lib/page-kind.ts";

const prisma = new PrismaClient();

const pages = await prisma.page.findMany({
  select: { id: true, slug: true, kind: true, url: true, html: true },
});

let rewritten = 0;
let untouched = 0;
let links = 0;

for (const page of pages) {
  // A link row has no document, and readPageKind is the only thing that decides
  // which a row is — its `kind` column is a plain String on SQLite.
  if (readPageKind(page) !== "html" || page.html === null) {
    links += 1;
    continue;
  }

  const result = await inlinePage(page.html);

  for (const item of result.skipped) {
    console.log(`  ${page.slug}: ${item.url} — ${item.reason}`);
  }

  if (result.html === page.html) {
    untouched += 1;
    continue;
  }

  await prisma.page.update({
    where: { id: page.id },
    data: { html: result.html },
  });
  rewritten += 1;
}

console.log(
  `${rewritten} rewritten, ${untouched} already self-contained, ${links} link rows skipped`,
);

await prisma.$disconnect();
```

- [x] **Step 2: Dry-run it against a copy, not the live file**

The database is a file, so a copy is the whole safety net:

```bash
cp dev.db /tmp/claude/dev.db.before
DATABASE_URL="file:/tmp/claude/dev.db.before" \
  node --experimental-strip-types scripts/backfill-page-assets.mjs
```

Expected: a count line, and one indented line per asset it could not include.
Nothing throws.

- [x] **Step 3: Confirm it is idempotent**

Run the exact same command again.
Expected: `0 rewritten`, and the same skipped lines as before — those are refs
that stay in the document by design.

- [x] **Step 4: Run it for real on dev, then check one page**

```bash
node --experimental-strip-types scripts/backfill-page-assets.mjs
curl -sS http://localhost:3000/p/<a-slug-it-rewrote>/raw | grep -c 'https://'
```

Expected: whatever refs it reported as skipped, and nothing else. A count of `0`
means the page is now entirely self-contained.

- [x] **Step 5: Commit**

```bash
git add scripts/backfill-page-assets.mjs
git commit -m "feat: backfill inlined assets into pages already published

Idempotent, so it can be re-run after the allowlist grows. Needs
--experimental-strip-types for the same reason backfill-sections.mjs does.

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

**Production note for whoever deploys this:** `docs/DEPLOYMENT.md` covers the
nightly `VACUUM INTO` backup. Take one on demand before running this, then run it
on the box with the live `DATABASE_URL`. It rewrites rows and does not migrate, so
there is nothing for Prisma to do first.

---

## Task 11: Record the contract in CLAUDE.md

**Files:**
- Modify: `CLAUDE.md:183-184` and the paragraph that follows it

The invariant sentence stays true and must stay in place — no directive admits
`https:`. What changes is that a document is now *made* self-contained instead of
being required to arrive that way.

- [x] **Step 1: Replace the CDN sentence**

In `CLAUDE.md`, replace lines 183-184, which currently read:

```markdown
student typed via `<img src="https://…?d=answer">`. Nothing loads from a CDN;
self-contained files are the only supported kind. One residual is accepted and
```

with:

```markdown
student typed via `<img src="https://…?d=answer">`. Nothing loads from a CDN at
render time; a self-contained document is the only kind that works, and
publishing makes one. One residual is accepted and
```

- [x] **Step 2: Add the paragraph describing the inliner**

Immediately after the paragraph that ends "…the session cookie is httpOnly with
no `localStorage` in use." (around line 191), and before "There is no HTML
sanitiser, deliberately.", insert:

```markdown
A page that arrives referencing a CDN is rewritten at publish time rather than
served broken: `inlinePage` (`lib/page-inline.ts`) folds each external script,
stylesheet, image and font into the document, so `'unsafe-inline'` and
`img-src data:` — already in the policy — are all it needs to render. **The CSP
was not widened to make this work and must not be.** The step runs between
validation and `savePage` on both write paths (`app/api/pages/route.ts` and
`createPage`/`updatePage` in `app/page-actions.ts`); `/p/[slug]/raw` still serves
`page.html` verbatim, so the served document can never drift from the stored one
and the `<a download>` round trip is unaffected.

The fetcher (`lib/asset-fetch.ts`) takes a URL out of a request body and returns
its response into a public document, which makes it an SSRF read primitive and is
why it has five controls rather than none: the host allowlist in
`lib/asset-policy.ts`, https only, `redirect: "error"` — without which an
allowlisted host answering `302` to `http://169.254.169.254/` would walk straight
past the allowlist — a timeout, a bounded read, and a content-type check per kind
so a CDN's 404 page never lands inside a `<script>`. Module CDNs are deliberately
absent from that list: an inlined ES module's `import` has nothing to resolve
against, so inlining one turns a blocked page into a broken one. It is injected
into `lib/page-inline.ts` rather than imported by it, the arrangement
`lib/whiteboard-hit.ts` uses, so the depth and budget rules are tested with a
fake and no socket.

Two fetches deep and no further, counted in fetches: `fonts.googleapis.com`
answers with CSS that names fonts on `fonts.gstatic.com`, so one level would
inline the stylesheet and leave the typeface wrong with nothing to report. An
asset that cannot be inlined — unlisted host, failed fetch, wrong content type,
or a document that would pass 2 MB — is **left exactly as it was and reported**,
never a reason to fail a publish: the same degrade-rather-than-throw contract
`readSections`, `readOps` and `readPageKind` have. The report reaches Jenn three
ways, because there are three ways in: `skipped` in the `POST /api/pages` reply
(printed by `tools/publish-dia-artifact.sh`, counted by the extension) and a
notice in `PageEditor`. A relative ref is reported too, since only `index.html`
is ever uploaded. `scripts/backfill-page-assets.mjs` runs the same inliner over
pages published before this existed.
```

- [x] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: record that documents are made self-contained at publish

The no-https: invariant is unchanged and still load-bearing; what changed is
that a page referencing a CDN is now rewritten rather than served broken.

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 12: The full CI run

**Files:** none

- [x] **Step 1: Run what CI runs, in CI's order**

Run:

```bash
npx prisma generate && npm run lint && npx tsc --noEmit && npm test && npm run build
```

Expected: all five pass. `.github/workflows/ci.yml` runs exactly this sequence;
running it locally is what "done" means in this repo.

- [x] **Step 2: Confirm the CSP was not touched**

Run: `git diff main --stat -- app/p/`
Expected: **no output.** Nothing under `app/p/` should have changed. If the raw
route or the iframe page appears in that diff, the implementation took the
approach the spec rejected — stop and re-read
`docs/superpowers/specs/2026-08-03-inlining-page-assets-design.md`.

- [x] **Step 3: Commit anything the build touched**

```bash
git status --short
```

Expected: clean. Commit only if a lint autofix or a generated type moved.

---

## Manual verification — needs a real browser

The implementing session has no browser. These are for whoever does, on
`npm run dev`, with DevTools open on both the **Console** and the **Issues**
panel — the original report came from Issues, and a CSP block shows there when
the console is quiet.

The invariant, above every individual check: **on `/p/<slug>`, the Network tab
shows zero third-party requests.** That is what the CSP was protecting, and this
change has to leave it true.

- [ ] 1. Publish a page that loads the Dia CDN script — `./tools/publish-dia-artifact.sh --local`, or the `curl` from Task 6 Step 4. Open `/p/<slug>`: **no CSP violation in Issues**, and the animation runs.
- [ ] 2. View source on `/p/<slug>/raw`. The `<script src>` is gone and the library's code is inline. One file, no references out.
- [ ] 3. Drag the same `.html` onto `/admin` → Pages. Same result, and **no skipped notice** appears.
- [ ] 4. Publish a page referencing a host that is not on the allowlist. It publishes, the page loads, the notice names that URL and its reason, and Issues shows a CSP block for **that ref only**.
- [ ] 5. A page using Google Fonts (`<link>` in one test, `@import` inside `<style>` in another). The typeface renders, and the Network tab shows **no request to fonts.gstatic.com or fonts.googleapis.com**.
- [ ] 6. Network tab on `/p/<slug>`, filtered to third-party: empty. Repeat on the page from step 4 — the one blocked ref may appear as blocked, never as a completed request.
- [ ] 7. A page whose assets exceed 2 MB once inlined. It still publishes, the notice names what was dropped, and the page loads with the script that did fit.
- [ ] 8. `/admin?tab=pages` — tile previews still render. A page drawn entirely by JavaScript still previews blank; that is unchanged and documented, not a regression.
- [ ] 9. In the admin editor, click the download link, then re-upload the file it gives you. It saves with an **empty** skipped list — the round trip is a no-op for this step.
- [ ] 10. After the backfill: open a page that existed before this change and repeat steps 1, 2 and 6 on it.
- [ ] 11. A student's view: `/g/<slug>` → Files → open a page from the shelf. Nothing about tokens or access changed, and this confirms it.

---

## Notes for the implementer

**If a test in Task 2 or Task 5 fails on an off-by-one span,** the cause is
almost always `attrsOffset` or the `<style>` content offset. Print
`html.slice(ref.start, ref.end)` and compare it against what the replacement is
meant to take over — the test for each shape asserts exactly that slice for this
reason.

**Do not add a host to `ASSET_HOSTS` to make a page work** without checking what
that host serves. A module CDN cannot be inlined at all (see the comment in
`lib/asset-policy.ts`), and the list is the only thing standing between a request
body and the box's metadata service.

**Do not "clean up" the double allowlist check.** `lib/page-inline.ts` checks
`isAllowedAssetUrl` and so does `lib/asset-fetch.ts`. The first is what a test
with a fake fetcher can cover; the second is what actually guards the socket.
Removing either leaves a hole in one of those two.

**Do not widen the CSP.** Task 12 Step 2 exists to catch it.
