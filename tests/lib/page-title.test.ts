import { describe, it, expect } from "vitest";
import { titleFromHtml } from "@/lib/page-title";

describe("titleFromHtml", () => {
  it("prefers the document title", () => {
    expect(
      titleFromHtml("<html><head><title>Verb Drills</title></head><body><h1>Nope</h1></body></html>"),
    ).toBe("Verb Drills");
  });

  it("falls back to the first h1", () => {
    expect(titleFromHtml("<body><h1>Les verbes</h1><h1>Second</h1></body>")).toBe(
      "Les verbes",
    );
  });

  it("strips markup from inside the heading", () => {
    expect(titleFromHtml("<h1><span>Les</span> <em>verbes</em></h1>")).toBe(
      "Les verbes",
    );
  });

  // Tags are stripped BEFORE entities are decoded. The other order would turn
  // "&lt;b&gt;" into "<b>" and then strip it, losing text the author escaped
  // on purpose.
  it("decodes entities after stripping, not before", () => {
    expect(titleFromHtml("<title>a &lt;b&gt; c</title>")).toBe("a <b> c");
  });

  it("decodes the entities that actually turn up in a title", () => {
    expect(titleFromHtml("<title>Maths &amp; French &quot;notes&quot;</title>")).toBe(
      'Maths & French "notes"',
    );
  });

  it("collapses whitespace, including across newlines", () => {
    expect(titleFromHtml("<title>\n  Les    verbes\n</title>")).toBe("Les verbes");
  });

  it("is case-insensitive about the tag", () => {
    expect(titleFromHtml("<TITLE>Shouty</TITLE>")).toBe("Shouty");
  });

  it("skips an empty title and keeps looking", () => {
    expect(titleFromHtml("<title>   </title><h1>Real one</h1>")).toBe("Real one");
  });

  it("returns null when the document names itself nowhere", () => {
    expect(titleFromHtml("<div>just a div</div>")).toBeNull();
  });

  // The title becomes a slug, and a slug is a URL students bookmark.
  it("caps the length", () => {
    const long = "x".repeat(300);
    expect(titleFromHtml(`<title>${long}</title>`)?.length).toBe(120);
  });
});
