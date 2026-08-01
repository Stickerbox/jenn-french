import { describe, expect, it } from "vitest";
import { readPageKind } from "@/lib/page-kind";

describe("readPageKind", () => {
  it("reads the recognised values", () => {
    expect(readPageKind({ kind: "html", url: null })).toBe("html");
    expect(readPageKind({ kind: "link", url: "https://example.com/" })).toBe("link");
  });

  it("resolves an unrecognised kind by the url column", () => {
    // Falling back to "html" would be the wrong repair for the row most likely
    // to be broken: one with a url and no document, which would then render as
    // a page with nothing in it.
    expect(readPageKind({ kind: "", url: "https://example.com/" })).toBe("link");
    expect(readPageKind({ kind: "wat", url: "https://example.com/" })).toBe("link");
  });

  it("falls back to html when there is no url either", () => {
    expect(readPageKind({ kind: "wat", url: null })).toBe("html");
  });
});
