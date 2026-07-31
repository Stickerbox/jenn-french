import { describe, it, expect } from "vitest";
import { studentSlug } from "@/lib/student-slug";

describe("studentSlug", () => {
  it("lowercases a single name", () => {
    expect(studentSlug("Jordan", [])).toBe("jordan");
  });

  it("hyphenates a name with a space, so the URL and cookie name stay valid", () => {
    expect(studentSlug("Marie Dupont", [])).toBe("marie-dupont");
  });

  it("strips French accents rather than dropping the letter", () => {
    expect(studentSlug("Zoé", [])).toBe("zoe");
    expect(studentSlug("Chloé Bérubé", [])).toBe("chloe-berube");
  });

  it("drops punctuation that would break a path or a cookie", () => {
    expect(studentSlug("O'Brien", [])).toBe("o-brien");
    expect(studentSlug("A; B=C", [])).toBe("a-b-c");
  });

  it("suffixes a name that is already taken", () => {
    expect(studentSlug("Jordan", ["jordan"])).toBe("jordan-2");
  });

  it("keeps counting past the first collision", () => {
    expect(studentSlug("Jordan", ["jordan", "jordan-2"])).toBe("jordan-3");
  });

  it("falls back rather than returning an empty slug", () => {
    expect(studentSlug("!!!", [])).not.toBe("");
  });

  it("never returns a slug containing a space, semicolon or equals sign", () => {
    for (const name of ["Marie Dupont", "A; B=C", "Zoé Bérubé"]) {
      expect(studentSlug(name, [])).not.toMatch(/[\s;=]/);
    }
  });
});
