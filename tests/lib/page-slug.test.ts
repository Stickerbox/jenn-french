import { describe, it, expect } from "vitest";
import { slugify, uniqueSlug } from "@/lib/page-slug";

describe("slugify", () => {
  it("lowercases and hyphenates a plain title", () => {
    expect(slugify("Verb Drills")).toBe("verb-drills");
  });

  it("strips accents rather than dropping the letters", () => {
    expect(slugify("Passé Composé")).toBe("passe-compose");
  });

  it("collapses punctuation and runs of spaces into single hyphens", () => {
    expect(slugify("Numbers 1–10:  a  quiz!")).toBe("numbers-1-10-a-quiz");
  });

  it("trims leading and trailing hyphens", () => {
    expect(slugify("  ...être...  ")).toBe("etre");
  });

  it("falls back to 'page' when nothing usable survives", () => {
    expect(slugify("")).toBe("page");
    expect(slugify("   ")).toBe("page");
    expect(slugify("!!!")).toBe("page");
    expect(slugify("日本語")).toBe("page");
  });

  it("caps the length and never ends on a hyphen", () => {
    const slug = slugify("a ".repeat(80));
    expect(slug.length).toBeLessThanOrEqual(60);
    expect(slug.endsWith("-")).toBe(false);
  });

  it("transliterates ligatures instead of dropping them", () => {
    expect(slugify("Cœur")).toBe("coeur");
    expect(slugify("Sœur en français")).toBe("soeur-en-francais");
    expect(slugify("Æsop")).toBe("aesop");
  });
});

describe("uniqueSlug", () => {
  it("returns the base when it is free", () => {
    expect(uniqueSlug("verb-drills", [])).toBe("verb-drills");
    expect(uniqueSlug("verb-drills", ["other"])).toBe("verb-drills");
  });

  it("appends a numeric suffix when the base is taken", () => {
    expect(uniqueSlug("verb-drills", ["verb-drills"])).toBe("verb-drills-2");
  });

  it("keeps counting past a taken suffix", () => {
    expect(
      uniqueSlug("verb-drills", ["verb-drills", "verb-drills-2", "verb-drills-3"]),
    ).toBe("verb-drills-4");
  });
});
