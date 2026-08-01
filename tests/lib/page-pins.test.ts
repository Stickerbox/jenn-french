import { describe, expect, it } from "vitest";
import { applyPins } from "@/lib/page-pins";

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
