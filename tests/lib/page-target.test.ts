import { describe, expect, it } from "vitest";
import { pageTarget } from "@/lib/page-target";

describe("pageTarget", () => {
  it("sends an html page to its shell, in this tab", () => {
    expect(pageTarget({ kind: "html", slug: "verbes", url: null })).toEqual({
      href: "/p/verbes",
      newTab: false,
    });
  });

  it("sends a pdf to its own page, in this tab", () => {
    // /p/[slug] and not the raw bytes: that route no longer redirects out to
    // the browser's own viewer, it renders PdfShell over PdfDocumentView, so
    // a pdf tile now opens exactly where an html tile does.
    expect(pageTarget({ kind: "pdf", slug: "tableau", url: null })).toEqual({
      href: "/p/tableau",
      newTab: false,
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

describe("a worksheet", () => {
  const sheet = { kind: "html" as const, slug: "devoir-3", url: null, worksheet: true };

  it("goes to the student's own worksheet route when there is a shelf", () => {
    expect(pageTarget(sheet, "marie")).toEqual({
      href: "/g/marie/w/devoir-3",
      newTab: false,
    });
  });

  it("sends a pdf worksheet there too, so the chooser is reachable", () => {
    // A PDF has nowhere to put a save control — it opens in the browser's own
    // viewer — so the chooser is the only surface it has.
    expect(pageTarget({ ...sheet, kind: "pdf" }, "marie").href).toBe(
      "/g/marie/w/devoir-3",
    );
  });

  it("falls back to the public page with no shelf to open it on", () => {
    // "All" on the admin Pages tab is not a shelf, and /f/[token] is read-only.
    // Neither has a student whose versions could be listed.
    expect(pageTarget(sheet)).toEqual({ href: "/p/devoir-3", newTab: false });
    expect(pageTarget(sheet, null)).toEqual({ href: "/p/devoir-3", newTab: false });
  });

  it("leaves a page Jenn has not ticked exactly where it was", () => {
    expect(pageTarget({ ...sheet, worksheet: false }, "marie")).toEqual({
      href: "/p/devoir-3",
      newTab: false,
    });
  });

  it("refuses a link row even with worksheet true, matching worksheetOpenable", () => {
    // No write path can set worksheet on a link row today — a link has no
    // edit form — but this pins that pageTarget does not silently trust the
    // flag if one ever did. A link is off-site regardless.
    expect(
      pageTarget(
        { kind: "link", slug: "devoir-3", url: "https://example.com/a", worksheet: true },
        "marie",
      ),
    ).toEqual({ href: "https://example.com/a", newTab: true });
  });
});
