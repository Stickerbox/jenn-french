import { describe, expect, it } from "vitest";
import { MAX_PDF_BYTES, validatePagePdf } from "@/lib/page-pdf";

function bytesOf(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

// A minimal thing that starts the way every PDF starts, padded to a length.
function pdfOfSize(size: number): Uint8Array {
  const out = new Uint8Array(size);
  out.set(bytesOf("%PDF-1.7\n").slice(0, size));
  return out;
}

describe("validatePagePdf", () => {
  it("accepts something that starts like a PDF", () => {
    const bytes = bytesOf("%PDF-1.4\n1 0 obj\n");
    const result = validatePagePdf(bytes);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.bytes).toBe(bytes);
  });

  it("accepts every version prefix a PDF can carry", () => {
    for (const version of ["1.0", "1.3", "1.7", "2.0"]) {
      expect(validatePagePdf(bytesOf(`%PDF-${version}\n`)).ok).toBe(true);
    }
  });

  it("rejects an empty file", () => {
    expect(validatePagePdf(new Uint8Array(0)).ok).toBe(false);
  });

  it("rejects an HTML file chosen by mistake", () => {
    // The whole reason the check exists: the drop zone takes both kinds now, so
    // picking the wrong one is a real slip rather than a hypothetical.
    expect(validatePagePdf(bytesOf("<!doctype html><html></html>")).ok).toBe(false);
  });

  it("rejects a PNG renamed to .pdf", () => {
    expect(
      validatePagePdf(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a])).ok,
    ).toBe(false);
  });

  it("rejects a PDF whose header is not at the start", () => {
    // Readers tolerate leading junk; we do not. A file needing that tolerance
    // is a file worth telling her about before students meet it.
    expect(validatePagePdf(bytesOf("   %PDF-1.7\n")).ok).toBe(false);
  });

  it("accepts a file of exactly the cap", () => {
    expect(validatePagePdf(pdfOfSize(MAX_PDF_BYTES)).ok).toBe(true);
  });

  it("rejects one byte over the cap", () => {
    const result = validatePagePdf(pdfOfSize(MAX_PDF_BYTES + 1));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("3 MB");
  });

  it("caps at 3 MB, which is what fits under the nginx body limit", () => {
    expect(MAX_PDF_BYTES).toBe(3 * 1024 * 1024);
  });
});
