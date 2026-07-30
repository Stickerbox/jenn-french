import { describe, it, expect } from "vitest";
import { validatePageHtml, byteLength, MAX_PAGE_BYTES } from "@/lib/page-html";

describe("byteLength", () => {
  it("counts UTF-8 bytes, not characters", () => {
    expect(byteLength("abc")).toBe(3);
    expect(byteLength("é")).toBe(2);
  });
});

describe("validatePageHtml", () => {
  it("accepts a document and trims it", () => {
    const result = validatePageHtml("  <!doctype html><p>Bonjour</p>  ");
    expect(result).toEqual({ ok: true, html: "<!doctype html><p>Bonjour</p>" });
  });

  it("rejects a value that is not a string", () => {
    expect(validatePageHtml(undefined).ok).toBe(false);
    expect(validatePageHtml(42).ok).toBe(false);
  });

  it("rejects empty and whitespace-only input", () => {
    expect(validatePageHtml("").ok).toBe(false);
    expect(validatePageHtml("   \n  ").ok).toBe(false);
  });

  it("rejects text with no tag in it", () => {
    const result = validatePageHtml("https://example.com/worksheet.html");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/HTML/i);
  });

  it("rejects a document over the byte cap", () => {
    const result = validatePageHtml(`<p>${"a".repeat(MAX_PAGE_BYTES)}</p>`);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/2 MB/);
  });

  it("measures the cap in bytes, so multi-byte text can exceed it early", () => {
    // Half the cap in characters, every one of them two bytes: under the cap
    // by String.length and over it on disk.
    const body = "é".repeat(MAX_PAGE_BYTES / 2);
    expect(body.length).toBeLessThan(MAX_PAGE_BYTES);
    expect(validatePageHtml(`<p>${body}</p>`).ok).toBe(false);
  });
});
