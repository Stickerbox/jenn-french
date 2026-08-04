import { describe, expect, it } from "vitest";
import { readPageKind } from "@/lib/page-kind";

describe("readPageKind", () => {
  it("reads the recognised values", () => {
    expect(readPageKind({ kind: "html", url: null, pdfSize: null })).toBe("html");
    expect(
      readPageKind({ kind: "link", url: "https://example.com/", pdfSize: null }),
    ).toBe("link");
    expect(readPageKind({ kind: "pdf", url: null, pdfSize: 1024 })).toBe("pdf");
  });

  it("resolves an unrecognised kind by the url column", () => {
    // Falling back to "html" would be the wrong repair for the row most likely
    // to be broken: one with a url and no document, which would then render as
    // a page with nothing in it.
    expect(
      readPageKind({ kind: "", url: "https://example.com/", pdfSize: null }),
    ).toBe("link");
    expect(
      readPageKind({ kind: "wat", url: "https://example.com/", pdfSize: null }),
    ).toBe("link");
  });

  it("resolves an unrecognised kind by pdfSize", () => {
    expect(readPageKind({ kind: "", url: null, pdfSize: 2048 })).toBe("pdf");
    expect(readPageKind({ kind: "wat", url: null, pdfSize: 0 })).toBe("pdf");
  });

  it("prefers pdfSize over url on a row that has both", () => {
    // Only reachable through a hand-edited database or a migration that half
    // ran. A stored file beats a url the row should no longer have: serving the
    // document we hold is the repair that loses nothing.
    expect(
      readPageKind({ kind: "wat", url: "https://example.com/", pdfSize: 99 }),
    ).toBe("pdf");
  });

  it("falls back to html when there is no url and no pdf either", () => {
    expect(readPageKind({ kind: "wat", url: null, pdfSize: null })).toBe("html");
  });
});
