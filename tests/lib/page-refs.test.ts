import { describe, expect, it } from "vitest";
import {
  applyReplacements,
  DOCUMENT_BASE,
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

describe("findCssRefs", () => {
  it("resolves a relative url() against the stylesheet, not the page", () => {
    const [ref] = findCssRefs(`@font-face{src:url(./fonts/a.woff2)}`, {
      kind: "remote",
      url: "https://cdn.jsdelivr.net/npm/pkg/dist/a.css",
    });
    expect(ref.url).toBe("https://cdn.jsdelivr.net/npm/pkg/dist/fonts/a.woff2");
    expect(ref.relative).toBe(false);
  });

  it("reads an absolute url() as it stands", () => {
    const [ref] = findCssRefs(
      `@font-face{src:url("https://fonts.gstatic.com/a.woff2") format("woff2")}`,
      { kind: "remote", url: "https://fonts.googleapis.com/css2" },
    );
    expect(ref.url).toBe("https://fonts.gstatic.com/a.woff2");
    expect(ref.kind).toBe("font");
  });

  it("does not double-count the url() belonging to an @import", () => {
    const refs = findCssRefs(`@import url("https://x.test/a.css");`, DOCUMENT_BASE);
    expect(refs).toHaveLength(1);
    expect(refs[0].form).toBe("css-text");
  });

  it("reads an @import with no url() wrapper", () => {
    const [ref] = findCssRefs(`@import "https://x.test/a.css";`, DOCUMENT_BASE);
    expect(ref.url).toBe("https://x.test/a.css");
  });

  // Replacing the rule with the stylesheet's text would apply a print-only
  // sheet to the screen.
  it("marks an @import carrying a media condition unsafe", () => {
    const [ref] = findCssRefs(`@import "https://x.test/a.css" print;`, DOCUMENT_BASE);
    expect(ref.unsafe).toBe(true);
  });

  it("ignores a data URI already inlined", () => {
    expect(findCssRefs(`@font-face{src:url(data:font/woff2;base64,AA)}`, DOCUMENT_BASE))
      .toEqual([]);
  });

  it("offsets spans so a caller can splice into the document", () => {
    const html = `<style>a{background:url(https://x.test/a.png)}</style>`;
    const [ref] = findCssRefs(html.slice(7, -8), DOCUMENT_BASE, 7);
    expect(html.slice(ref.start, ref.end)).toBe("url(https://x.test/a.png)");
  });

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
      { start: 27, end: 32, text: "TWO" },
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
