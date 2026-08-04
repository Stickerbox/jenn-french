import { describe, expect, it } from "vitest";
import { pageTarget } from "@/lib/page-target";

describe("pageTarget", () => {
  it("sends an html page to its shell, in this tab", () => {
    expect(pageTarget({ kind: "html", slug: "verbes", url: null })).toEqual({
      href: "/p/verbes",
      newTab: false,
    });
  });

  it("sends a pdf straight to the bytes, in a new tab", () => {
    // The bytes and not /p/[slug]: that route only exists to redirect here, and
    // a tile that knows the destination should not make the browser ask twice.
    expect(pageTarget({ kind: "pdf", slug: "tableau", url: null })).toEqual({
      href: "/p/tableau/pdf",
      newTab: true,
    });
  });

  it("sends a link off-site, in a new tab", () => {
    expect(
      pageTarget({ kind: "link", slug: "doc", url: "https://example.com/a" }),
    ).toEqual({ href: "https://example.com/a", newTab: true });
  });

  it("gives a link with no url a dead href rather than throwing", () => {
    // readPageKind can call a row a link on the strength of the kind column
    // alone, so a url-less link row is reachable. A shelf must still render.
    expect(pageTarget({ kind: "link", slug: "doc", url: null })).toEqual({
      href: "#",
      newTab: true,
    });
  });
});
