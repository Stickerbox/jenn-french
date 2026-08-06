import { describe, expect, it } from "vitest";
import { linkifyBody } from "@/lib/chat-linkify";

describe("linkifyBody", () => {
  it("returns exactly one text segment for a message with no URL", () => {
    expect(linkifyBody("bonjour, comment ça va ?")).toEqual([
      { kind: "text", value: "bonjour, comment ça va ?" },
    ]);
  });

  it("returns a single link segment for a message that is nothing but a URL", () => {
    expect(linkifyBody("https://tv5.ca")).toEqual([
      { kind: "link", href: "https://tv5.ca/", label: "https://tv5.ca" },
    ]);
  });

  it("keeps the surrounding text on both sides of a mid-sentence URL", () => {
    expect(
      linkifyBody("regarde ça https://conjuguemos.com/verbes stp"),
    ).toEqual([
      { kind: "text", value: "regarde ça " },
      {
        kind: "link",
        href: "https://conjuguemos.com/verbes",
        label: "https://conjuguemos.com/verbes",
      },
      { kind: "text", value: " stp" },
    ]);
  });

  it("leaves a sentence's closing full stop in the text segment, not the href", () => {
    // Mirrors extractLinks's "drops a trailing full stop rather than storing a
    // 404" case: the period belongs to the sentence, not the address.
    expect(
      linkifyBody("c'est ici https://conjuguemos.com/verbes."),
    ).toEqual([
      { kind: "text", value: "c'est ici " },
      {
        kind: "link",
        href: "https://conjuguemos.com/verbes",
        label: "https://conjuguemos.com/verbes",
      },
      { kind: "text", value: "." },
    ]);
  });

  it("draws a bare www. host as a link, the same form extractLinks files", () => {
    expect(linkifyBody("va sur www.tv5.ca")).toEqual([
      { kind: "text", value: "va sur " },
      { kind: "link", href: "https://www.tv5.ca/", label: "www.tv5.ca" },
    ]);
  });

  it("leaves a rejected scheme-less candidate as text, exact false positives chat-links.ts names", () => {
    // Neither "mot.Ensuite" nor "3.Regarde" begins with www., so parseLinkUrl
    // never sees them as candidates worth accepting — they stay ordinary
    // prose, unlinked.
    expect(linkifyBody("un mot.Ensuite regarde")).toEqual([
      { kind: "text", value: "un mot.Ensuite regarde" },
    ]);
    expect(linkifyBody("3.Regarde la page")).toEqual([
      { kind: "text", value: "3.Regarde la page" },
    ]);
  });

  it("preserves newlines exactly, since the bubble renders whitespace-pre-wrap", () => {
    expect(linkifyBody("ligne un\nhttps://tv5.ca\nligne trois")).toEqual([
      { kind: "text", value: "ligne un\n" },
      { kind: "link", href: "https://tv5.ca/", label: "https://tv5.ca" },
      { kind: "text", value: "\nligne trois" },
    ]);
  });

  it("finds two URLs in one message, with the text between them intact", () => {
    expect(
      linkifyBody("https://conjuguemos.com/verbes et aussi https://tv5.ca"),
    ).toEqual([
      {
        kind: "link",
        href: "https://conjuguemos.com/verbes",
        label: "https://conjuguemos.com/verbes",
      },
      { kind: "text", value: " et aussi " },
      { kind: "link", href: "https://tv5.ca/", label: "https://tv5.ca" },
    ]);
  });

  it("returns one empty text segment for an empty message", () => {
    expect(linkifyBody("")).toEqual([{ kind: "text", value: "" }]);
  });
});
