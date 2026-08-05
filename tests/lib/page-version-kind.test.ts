import { describe, expect, it } from "vitest";
import { readVersionKind } from "@/lib/page-version-kind";

describe("readVersionKind", () => {
  it("reads the two kinds it knows", () => {
    expect(readVersionKind({ kind: "html", pdfSize: null })).toBe("html");
    expect(readVersionKind({ kind: "pdf", pdfSize: 1024 })).toBe("pdf");
  });

  it("resolves an unrecognised kind toward the row most likely to be real", () => {
    // Same defensive contract readPageKind, readSections and readOps have: the
    // row most likely to be broken is one with content and a wrong kind, and
    // calling that html would serve a PDF's bytes into an iframe.
    expect(readVersionKind({ kind: "", pdfSize: 4096 })).toBe("pdf");
    expect(readVersionKind({ kind: "wat", pdfSize: null })).toBe("html");
  });

  it("never returns link, which readPageKind can", () => {
    // The reason this is not readPageKind: a version can never be a link, and
    // reusing that function would push a dead case into every caller.
    expect(readVersionKind({ kind: "link", pdfSize: null })).toBe("html");
  });
});
