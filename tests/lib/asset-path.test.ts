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
