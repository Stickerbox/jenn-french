import { describe, it, expect } from "vitest";
import { EVERYONE_SLUG, EVERYONE_NAME, canDeleteGroup } from "@/lib/everyone";

describe("the everyone group's identity", () => {
  it("is the slug students already have bookmarked", () => {
    expect(EVERYONE_SLUG).toBe("all");
  });

  it("is named the way the production row is named", () => {
    expect(EVERYONE_NAME).toBe("Everyone");
  });
});

describe("canDeleteGroup", () => {
  it("allows deleting an ordinary student", () => {
    expect(canDeleteGroup({ isEveryone: false })).toBe(true);
  });

  it("refuses the everyone group", () => {
    expect(canDeleteGroup({ isEveryone: true })).toBe(false);
  });

  it("reads only the flag, so a group named 'all' is still deletable", () => {
    // Bound to a variable rather than passed as a literal: TypeScript's
    // excess-property check fires only on fresh literals at a call site, and
    // the point here is that the extra field is ignored, not rejected.
    const namedAll = { isEveryone: false, slug: "all" };
    expect(canDeleteGroup(namedAll)).toBe(true);
  });
});
