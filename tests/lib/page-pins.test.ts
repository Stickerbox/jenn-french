import { describe, expect, it } from "vitest";
import { applyPins, canPinToShelf } from "@/lib/page-pins";

const pinnedAt = new Date("2026-07-30T00:00:00Z");

describe("applyPins", () => {
  it("attaches a pin to its page", () => {
    const result = applyPins([{ id: "a" }], [{ pageId: "a", pinnedAt }]);
    expect(result[0].pinnedAt).toEqual(pinnedAt);
  });

  it("gives an unpinned page null, not undefined", () => {
    // sectionPages branches on truthiness, but the type is Date | null and a
    // stray undefined would widen it everywhere downstream.
    const result = applyPins([{ id: "a" }], []);
    expect(result[0].pinnedAt).toBeNull();
  });

  it("ignores a pin for a page not on this shelf", () => {
    // A pin can outlive a page's assignment; it is not a dangling reference.
    const result = applyPins([{ id: "a" }], [{ pageId: "zz", pinnedAt }]);
    expect(result).toHaveLength(1);
    expect(result[0].pinnedAt).toBeNull();
  });

  it("preserves order and the rest of each row", () => {
    const result = applyPins(
      [{ id: "a", title: "A" }, { id: "b", title: "B" }],
      [{ pageId: "b", pinnedAt }],
    );
    expect(result.map((p) => p.id)).toEqual(["a", "b"]);
    expect(result[1].title).toBe("B");
  });

  it("does not mutate its input", () => {
    const pages = [{ id: "a" }];
    applyPins(pages, [{ pageId: "a", pinnedAt }]);
    expect(pages[0]).not.toHaveProperty("pinnedAt");
  });
});

describe("canPinToShelf", () => {
  it("allows a student's own shelf", () => {
    expect(canPinToShelf({ isEveryone: false })).toBe(true);
  });

  it("refuses the shared shelf", () => {
    // A pin orders ONE shelf, and the shared shelf is nobody's. Retired
    // 2026-08-07 with the everyone chip that was the only way to reach it.
    expect(canPinToShelf({ isEveryone: true })).toBe(false);
  });

  it("reads only the flag, so a group named 'all' is still pinnable", () => {
    // Bound to a variable, not passed as a literal: TypeScript's
    // excess-property check fires only on fresh literals at a call site, and
    // the point is that the extra field is ignored rather than rejected. The
    // same shape tests/lib/everyone.test.ts uses for canDeleteGroup.
    const namedAll = { isEveryone: false, slug: "all" };
    expect(canPinToShelf(namedAll)).toBe(true);
  });
});
