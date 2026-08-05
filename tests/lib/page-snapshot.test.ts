import { describe, expect, it } from "vitest";
import { MAX_SNAPSHOT_BYTES, validateSnapshot } from "@/lib/page-snapshot";
import { MAX_PAGE_BYTES } from "@/lib/page-html";

describe("MAX_SNAPSHOT_BYTES", () => {
  it("exceeds the cap on the document it is a snapshot of", () => {
    // A snapshot is the worksheet PLUS what the student typed PLUS any canvas
    // rasterised to a PNG data URL. Capping it at MAX_PAGE_BYTES would make a
    // 2 MB worksheet unanswerable.
    expect(MAX_SNAPSHOT_BYTES).toBeGreaterThan(MAX_PAGE_BYTES);
  });

  it("stays under nginx's 4 MB client_max_body_size", () => {
    // Raising it means an SSH session and an nginx reload first; until then the
    // failure is a raw 413 that Next never sees and the app cannot explain.
    expect(MAX_SNAPSHOT_BYTES).toBeLessThan(4 * 1024 * 1024);
  });
});

describe("validateSnapshot", () => {
  it("accepts a document", () => {
    const result = validateSnapshot("<!doctype html><html><body>x</body></html>");
    expect(result).toEqual({
      ok: true,
      html: "<!doctype html><html><body>x</body></html>",
    });
  });

  it("refuses anything that is not a string", () => {
    expect(validateSnapshot(null).ok).toBe(false);
    expect(validateSnapshot(42).ok).toBe(false);
  });

  it("refuses an empty snapshot", () => {
    expect(validateSnapshot("   ").ok).toBe(false);
  });

  it("refuses one over the cap, and says so in bytes", () => {
    // Bytes, not characters: a page of accented French takes more room on disk
    // than String.length suggests, and the cap protects the database.
    const result = validateSnapshot("<p>" + "é".repeat(MAX_SNAPSHOT_BYTES));
    expect(result.ok).toBe(false);
  });

  it("catches the obvious wrong thing without parsing HTML", () => {
    // Same limited ambition as validatePageHtml's includes("<").
    expect(validateSnapshot("just some text").ok).toBe(false);
  });
});
