import { describe, expect, it } from "vitest";
import { inlineBudget, inlinePageAssets } from "@/lib/page-inline";
import { SKIP_REASONS } from "@/lib/asset-policy";
import { MAX_PAGE_BYTES, validatePageHtml } from "@/lib/page-html";
import type { AssetFetcher } from "@/lib/asset-fetch";
import {
  assetBundle,
  bundleResolver,
  type LocalResolver,
} from "@/lib/page-bundle";

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
