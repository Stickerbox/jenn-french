import { describe, expect, it } from "vitest";
import { navigationTarget, shouldGuardNavigation } from "@/lib/leave-guard";

const ORIGIN = "https://francaisavecjenn.ca";
const HERE = `${ORIGIN}/g/marie?tab=board`;

// The defaults are an unmodified primary click on a plain in-app link.
function click(over: Partial<Parameters<typeof shouldGuardNavigation>[0]> = {}) {
  return shouldGuardNavigation({
    href: `${ORIGIN}/g/marie?tab=files`,
    target: null,
    download: false,
    modified: false,
    currentUrl: HERE,
    ...over,
  });
}

describe("shouldGuardNavigation", () => {
  // The case this whole module exists for: the tab strip is next/link, so
  // switching tabs is a soft navigation that unmounts the board editor.
  it("guards a same-path, different-query link", () => {
    expect(click()).toBe(true);
  });

  it("guards an off-site link, because leaving the site loses the board too", () => {
    expect(click({ href: "https://example.com/somewhere" })).toBe(true);
  });

  it("guards target=_self explicitly", () => {
    expect(click({ target: "_self" })).toBe(true);
  });

  it("ignores a click that was not on a link", () => {
    expect(click({ href: null })).toBe(false);
  });

  it("ignores a modified click, which opens elsewhere", () => {
    expect(click({ modified: true })).toBe(false);
  });

  it("ignores target=_blank", () => {
    expect(click({ target: "_blank" })).toBe(false);
  });

  it("ignores a named frame target", () => {
    expect(click({ target: "preview" })).toBe(false);
  });

  it("ignores a download, which saves rather than navigates", () => {
    expect(click({ href: `${ORIGIN}/p/x/raw`, download: true })).toBe(false);
  });

  it("ignores a fragment-only change, which re-renders nothing", () => {
    expect(click({ href: `${HERE}#bas` })).toBe(false);
  });

  it("ignores a link to exactly where we already are", () => {
    expect(click({ href: HERE })).toBe(false);
  });
});

describe("navigationTarget", () => {
  it("keeps a same-origin href as a router path, query and hash included", () => {
    expect(navigationTarget(`${ORIGIN}/g/marie?tab=files#x`, ORIGIN)).toEqual({
      kind: "internal",
      path: "/g/marie?tab=files#x",
    });
  });

  it("sends a cross-origin href to a full load", () => {
    expect(navigationTarget("https://example.com/a", ORIGIN)).toEqual({
      kind: "external",
      href: "https://example.com/a",
    });
  });

  // A mailto: or tel: href is not something router.push can take. It parses —
  // its origin comes out as the string "null", which never equals a real one —
  // so it reaches `external` through the comparison rather than through the
  // catch.
  it("treats a non-http scheme as external", () => {
    expect(navigationTarget("mailto:jenn@example.com", ORIGIN)).toEqual({
      kind: "external",
      href: "mailto:jenn@example.com",
    });
  });

  // A protocol-relative href leaves the origin, so it is a full load.
  it("treats a protocol-relative href to another host as external", () => {
    expect(navigationTarget("//example.com/a", ORIGIN)).toEqual({
      kind: "external",
      href: "//example.com/a",
    });
  });

  // The catch branch. Note what it takes to reach: with a valid base, `new URL`
  // resolves essentially anything — even "::::" comes back as the path
  // "/::::" — so it is a bad BASE that throws, not a bad href. In production the
  // base is window.location.origin and this is unreachable; it is here so the
  // function has no way to throw at a call site that cannot handle it.
  it("hands the href back whole rather than throwing on a bad origin", () => {
    expect(navigationTarget("/g/marie", "not-an-origin")).toEqual({
      kind: "external",
      href: "/g/marie",
    });
  });
});
