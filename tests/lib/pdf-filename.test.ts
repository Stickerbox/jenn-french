import { describe, expect, it } from "vitest";
import { contentDispositionInline } from "@/lib/pdf-filename";

describe("contentDispositionInline", () => {
  it("is inline, so the browser's viewer opens it rather than saving it", () => {
    expect(contentDispositionInline("Verbs", "verbs")).toMatch(/^inline; /);
  });

  it("uses the title as the filename, with a .pdf suffix", () => {
    const value = contentDispositionInline("Irregular Verbs", "irregular-verbs");
    expect(value).toContain('filename="Irregular Verbs.pdf"');
  });

  it("keeps accents in the encoded form and strips them from the ASCII one", () => {
    // Both forms are sent: filename* is what every current browser uses, and
    // the quoted form is the fallback that cannot carry a non-ASCII byte.
    const value = contentDispositionInline("Verbes irréguliers", "verbes");
    expect(value).toContain('filename="Verbes irreguliers.pdf"');
    expect(value).toContain("filename*=UTF-8''Verbes%20irr%C3%A9guliers.pdf");
  });

  it("cannot be escaped with a quote, a backslash or a semicolon", () => {
    const BACKSLASH = String.fromCharCode(92);
    const value = contentDispositionInline(
      `a" ; attachment; x="b${BACKSLASH}`,
      "safe-slug",
    );
    // Exactly one quoted run, and exactly the two semicolons this header's own
    // structure needs - a third would mean the title had introduced a parameter
    // of its own.
    expect(value.match(/"/g)).toHaveLength(2);
    expect(value.match(/;/g)).toHaveLength(2);
    expect(value.includes(BACKSLASH)).toBe(false);
  });

  it("never emits a CR, an LF or a tab", () => {
    // The one that matters: a line break here is response-header injection.
    // fromCharCode rather than an escape, so the source names the byte it means.
    const CR = String.fromCharCode(13);
    const LF = String.fromCharCode(10);
    const TAB = String.fromCharCode(9);

    for (const hostile of [
      `a${CR}${LF}Set-Cookie: x=1`,
      `a${LF}X-Evil: 1`,
      `a${CR}b`,
      `a${TAB}b`,
    ]) {
      const value = contentDispositionInline(hostile, "safe-slug");
      // A space is fine - the header's own syntax has them, and so does a
      // two-word title. A line break is not.
      for (const forbidden of [CR, LF, TAB]) {
        expect(value.includes(forbidden)).toBe(false);
      }
    }
  });

  it("falls back to the slug when the title has nothing usable in it", () => {
    // slugify already guarantees the slug is a safe token, so it is the right
    // fallback rather than a literal like "page".
    for (const title of ["", "   ", "…", "——", "...", "???"]) {
      const value = contentDispositionInline(title, "le-slug");
      expect(value).toContain('filename="le-slug.pdf"');
      expect(value).toContain("filename*=UTF-8''le-slug.pdf");
    }
  });

  it("does not double the suffix on a title that already ends in .pdf", () => {
    const value = contentDispositionInline("Exercice.pdf", "exercice");
    expect(value).toContain('filename="Exercice.pdf"');
    expect(value).not.toContain(".pdf.pdf");
  });

  it("bounds the length, because a title has none", () => {
    const value = contentDispositionInline("a".repeat(500), "slug");
    expect(value.length).toBeLessThan(400);
  });

  it("collapses newlines and runs of space into single spaces", () => {
    expect(contentDispositionInline("Deux    mots", "slug")).toContain(
      'filename="Deux mots.pdf"',
    );
  });
});
