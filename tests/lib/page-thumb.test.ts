import { describe, expect, it } from "vitest";
import { MAX_THUMB_BYTES, validatePageThumb } from "@/lib/page-thumb";

function jpeg(size = 64): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes.set([0xff, 0xd8, 0xff]);
  return bytes;
}

describe("validatePageThumb", () => {
  it("accepts something that starts like a JPEG", () => {
    const bytes = jpeg();
    expect(validatePageThumb(bytes)).toEqual({ ok: true, bytes });
  });

  it("rejects a PNG", () => {
    expect(
      validatePageThumb(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d])).ok,
    ).toBe(false);
  });

  // The obvious slip this guard exists for: the PDF ending up in the thumbnail
  // field.
  it("rejects PDF bytes", () => {
    expect(validatePageThumb(new TextEncoder().encode("%PDF-1.7\n")).ok).toBe(
      false,
    );
  });

  it("rejects nothing at all", () => {
    expect(validatePageThumb(new Uint8Array(0))).toEqual({
      ok: false,
      error: "The preview is missing.",
    });
  });

  it("rejects something too short to have a magic number", () => {
    expect(validatePageThumb(new Uint8Array([0xff, 0xd8])).ok).toBe(false);
  });

  it("rejects one byte over the cap", () => {
    expect(validatePageThumb(jpeg(MAX_THUMB_BYTES + 1))).toEqual({
      ok: false,
      error: "That preview is larger than 128 KB.",
    });
  });

  it("accepts exactly the cap", () => {
    expect(validatePageThumb(jpeg(MAX_THUMB_BYTES)).ok).toBe(true);
  });

  // Pinned deliberately: raising it is as much an nginx question as raising
  // MAX_PDF_BYTES, and this test is where someone finds that out.
  it("caps at 128 KB", () => {
    expect(MAX_THUMB_BYTES).toBe(128 * 1024);
  });
});
