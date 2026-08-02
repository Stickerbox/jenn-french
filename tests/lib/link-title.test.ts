import { describe, it, expect } from "vitest";
import { titleFromUrl } from "@/lib/link-title";

describe("titleFromUrl", () => {
  it("names a page after its last path segment", () => {
    expect(titleFromUrl("https://example.com/docs/verb-conjugation.pdf")).toBe(
      "Verb Conjugation",
    );
  });

  it("treats underscores as separators too", () => {
    expect(titleFromUrl("https://example.com/Lesson_3_Notes")).toBe(
      "Lesson 3 Notes",
    );
  });

  it("skips routing words and keeps looking leftwards", () => {
    expect(titleFromUrl("https://example.com/passe-compose/edit")).toBe(
      "Passe Compose",
    );
  });

  // A segment with digits and no separator is an id, not a name. This is the
  // case the whole rule exists for: a Google Doc URL is a key and a verb.
  it("falls back to the host for a Google Doc", () => {
    expect(
      titleFromUrl("https://docs.google.com/document/d/1AbCdEfGh2IjKl/edit"),
    ).toBe("docs.google.com");
  });

  it("falls back to the host for a short opaque id", () => {
    expect(titleFromUrl("https://youtu.be/xY12ab")).toBe("youtu.be");
  });

  it("falls back to the host when there is no path at all", () => {
    expect(titleFromUrl("https://www.lemonde.fr/")).toBe("lemonde.fr");
  });

  it("ignores a trailing slash", () => {
    expect(titleFromUrl("https://example.com/les-articles/")).toBe(
      "Les Articles",
    );
  });

  it("ignores a query string and a fragment", () => {
    expect(titleFromUrl("https://example.com/les-articles?p=2#top")).toBe(
      "Les Articles",
    );
  });

  it("skips a purely numeric segment", () => {
    expect(titleFromUrl("https://example.com/les-verbes/2026")).toBe(
      "Les Verbes",
    );
  });

  it("decodes a percent-encoded segment", () => {
    expect(titleFromUrl("https://example.com/le%20passe%20compose")).toBe(
      "Le Passe Compose",
    );
  });

  // parseLinkUrl runs before this and guarantees a parseable URL, but a pure
  // function handed junk must return something rather than throw.
  it("returns the input when it cannot be parsed", () => {
    expect(titleFromUrl("not a url")).toBe("not a url");
  });
});
