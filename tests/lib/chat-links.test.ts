import { describe, expect, it } from "vitest";
import { extractLinks, MAX_LINKS_PER_MESSAGE } from "@/lib/chat-links";

describe("extractLinks", () => {
  it("finds a message that is nothing but a URL", () => {
    expect(extractLinks("https://tv5.ca")).toEqual(["https://tv5.ca/"]);
  });

  it("finds a URL inside a sentence", () => {
    expect(
      extractLinks("regarde ça https://conjuguemos.com/verbes stp"),
    ).toEqual(["https://conjuguemos.com/verbes"]);
  });

  it("drops a trailing full stop rather than storing a 404", () => {
    expect(extractLinks("c'est ici https://conjuguemos.com/verbes.")).toEqual([
      "https://conjuguemos.com/verbes",
    ]);
  });

  it("drops a trailing comma and a wrapping quote", () => {
    expect(extractLinks('https://tv5.ca, et aussi "https://arte.tv"')).toEqual([
      "https://tv5.ca/",
      "https://arte.tv/",
    ]);
  });

  it("keeps a closing paren that has an opening paren to match", () => {
    // A Wikipedia URL is the case this clause exists for.
    expect(
      extractLinks("https://fr.wikipedia.org/wiki/Accent_(linguistique)"),
    ).toEqual(["https://fr.wikipedia.org/wiki/Accent_(linguistique)"]);
  });

  it("drops a closing paren with nothing inside the URL to match it", () => {
    expect(extractLinks("(voir https://tv5.ca)")).toEqual(["https://tv5.ca/"]);
  });

  it("finds two URLs in one message", () => {
    expect(
      extractLinks("https://conjuguemos.com/verbes et aussi https://tv5.ca"),
    ).toEqual(["https://conjuguemos.com/verbes", "https://tv5.ca/"]);
  });

  it("returns the same URL once however many times it appears", () => {
    expect(extractLinks("https://tv5.ca et encore https://tv5.ca")).toEqual([
      "https://tv5.ca/",
    ]);
  });

  it("caps how many one message can file", () => {
    const body = ["a", "b", "c", "d", "e", "f", "g"]
      .map((host) => `https://${host}.com`)
      .join(" ");
    expect(extractLinks(body)).toHaveLength(MAX_LINKS_PER_MESSAGE);
  });

  it("honours an explicit cap", () => {
    expect(extractLinks("https://a.com https://b.com", 1)).toEqual([
      "https://a.com/",
    ]);
  });

  it("ignores a javascript: URL", () => {
    // Nothing but http and https is matched in the first place, which is the
    // outer half of the guard; parseLinkUrl is the inner half.
    expect(extractLinks("javascript:alert(1)")).toEqual([]);
  });

  it("ignores a scheme-less host, because prose is full of things that look like one", () => {
    expect(extractLinks("va sur www.tv5.ca. Ensuite regarde.")).toEqual([]);
  });

  it("ignores a URL past parseLinkUrl's length cap", () => {
    expect(extractLinks(`https://tv5.ca/${"a".repeat(2100)}`)).toEqual([]);
  });

  it("returns nothing for a message with no URL", () => {
    expect(extractLinks("bonjour, comment ça va ?")).toEqual([]);
  });

  it("returns nothing for an empty message", () => {
    expect(extractLinks("")).toEqual([]);
  });
});
