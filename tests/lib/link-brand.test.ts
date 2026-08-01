import { describe, expect, it } from "vitest";
import { linkBrand, linkHostLabel } from "@/lib/link-brand";

describe("linkBrand", () => {
  it("tells the three docs.google.com products apart by path", () => {
    // They share a host, so a host-only rule would give a spreadsheet the
    // Docs icon.
    expect(linkBrand("https://docs.google.com/document/d/abc/edit")).toBe("google-docs");
    expect(linkBrand("https://docs.google.com/spreadsheets/d/abc")).toBe("google-sheets");
    expect(linkBrand("https://docs.google.com/presentation/d/abc")).toBe("google-slides");
    expect(linkBrand("https://docs.google.com/forms/d/abc")).toBe("google-forms");
  });

  it("falls back to Drive for an unrecognised docs.google.com path", () => {
    expect(linkBrand("https://docs.google.com/something/else")).toBe("google-drive");
  });

  it("recognises the other Google hosts", () => {
    expect(linkBrand("https://drive.google.com/file/d/abc")).toBe("google-drive");
    expect(linkBrand("https://forms.gle/abc")).toBe("google-forms");
  });

  it("recognises YouTube in its several hostnames", () => {
    expect(linkBrand("https://www.youtube.com/watch?v=abc")).toBe("youtube");
    expect(linkBrand("https://youtu.be/abc")).toBe("youtube");
    expect(linkBrand("https://m.youtube.com/watch?v=abc")).toBe("youtube");
  });

  it("recognises a PDF by extension", () => {
    expect(linkBrand("https://example.com/files/verbes.PDF")).toBe("pdf");
  });

  it("does not mistake a query string for a PDF", () => {
    expect(linkBrand("https://example.com/page?file=x.pdf")).toBe("generic");
  });

  it("falls back to generic", () => {
    expect(linkBrand("https://example.com/anything")).toBe("generic");
  });

  it("never throws on malformed input", () => {
    expect(linkBrand("not a url")).toBe("generic");
    expect(linkBrand("")).toBe("generic");
  });
});

describe("linkHostLabel", () => {
  it("strips www", () => {
    expect(linkHostLabel("https://www.example.com/a")).toBe("example.com");
  });

  it("returns an empty string rather than a locale-specific word", () => {
    // lib/ has no business knowing whether the caller renders French.
    expect(linkHostLabel("not a url")).toBe("");
  });
});
