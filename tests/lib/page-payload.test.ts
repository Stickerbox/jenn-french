import { describe, it, expect } from "vitest";
import { MAX_ASSET_COUNT, parsePagePayload } from "@/lib/page-payload";

const valid = {
  title: "Verb drills",
  html: "<!doctype html><p>Bonjour</p>",
};

describe("parsePagePayload", () => {
  it("accepts the minimum payload", () => {
    const result = parsePagePayload(valid);
    expect(result).toEqual({
      ok: true,
      payload: {
        title: "Verb drills",
        html: "<!doctype html><p>Bonjour</p>",
        groups: null,
        slug: null,
        // Additive: a caller that uploaded nothing beside the document.
        assets: [],
      },
    });
  });

  it("accepts groups and a slug", () => {
    const result = parsePagePayload({
      ...valid,
      groups: ["a1", "tuesday-adults"],
      slug: "verb-drills",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.groups).toEqual(["a1", "tuesday-adults"]);
      expect(result.payload.slug).toBe("verb-drills");
    }
  });

  it("keeps an empty groups array distinct from an absent one", () => {
    const absent = parsePagePayload(valid);
    const empty = parsePagePayload({ ...valid, groups: [] });
    expect(absent.ok && absent.payload.groups).toBe(null);
    expect(empty.ok && empty.payload.groups).toEqual([]);
  });

  it("normalises a supplied slug", () => {
    const result = parsePagePayload({ ...valid, slug: "Passé Composé!" });
    expect(result.ok && result.payload.slug).toBe("passe-compose");
  });

  it("trims the title", () => {
    const result = parsePagePayload({ ...valid, title: "  Verb drills  " });
    expect(result.ok && result.payload.title).toBe("Verb drills");
  });

  it("rejects a body that is not an object", () => {
    expect(parsePagePayload(null).ok).toBe(false);
    expect(parsePagePayload("title=x").ok).toBe(false);
    expect(parsePagePayload([valid]).ok).toBe(false);
  });

  it("rejects a missing or empty title", () => {
    expect(parsePagePayload({ html: valid.html }).ok).toBe(false);
    expect(parsePagePayload({ ...valid, title: "   " }).ok).toBe(false);
    expect(parsePagePayload({ ...valid, title: 7 }).ok).toBe(false);
  });

  it("rejects html that fails validation, passing the message through", () => {
    const result = parsePagePayload({ ...valid, html: "not a page" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/HTML/i);
  });

  it("rejects groups that are not an array of non-empty strings", () => {
    expect(parsePagePayload({ ...valid, groups: "a1" }).ok).toBe(false);
    expect(parsePagePayload({ ...valid, groups: [1] }).ok).toBe(false);
    expect(parsePagePayload({ ...valid, groups: [""] }).ok).toBe(false);
  });

  it("rejects a slug that is not a string", () => {
    expect(parsePagePayload({ ...valid, slug: 12 }).ok).toBe(false);
  });

  it("treats an explicit null the same as an absent key", () => {
    const result = parsePagePayload({ ...valid, groups: null, slug: null });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.groups).toBe(null);
      expect(result.payload.slug).toBe(null);
    }
  });
});

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
