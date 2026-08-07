import { describe, expect, it } from "vitest";
import { resolveChip } from "@/lib/admin-chip";

const names = ["Chloé", "Luc", "Marie"];

describe("resolveChip", () => {
  it("keeps a chip that is in the row", () => {
    expect(resolveChip("Luc", names)).toBe("Luc");
  });

  it("falls to the first name when nothing has been chosen", () => {
    // There is no "All" chip any more, so there is no nothing-selected state
    // left to render.
    expect(resolveChip(null, names)).toBe("Chloé");
  });

  it("falls to the first name when the chip has gone stale", () => {
    // The last page under that student was deleted, so the row no longer draws
    // their chip. Left alone it would filter the list to nothing with no lit
    // chip to explain why.
    expect(resolveChip("Amélie", names)).toBe("Chloé");
  });

  it("answers null only when the row is empty", () => {
    expect(resolveChip(null, [])).toBeNull();
    expect(resolveChip("Luc", [])).toBeNull();
  });

  it("matches exactly, so a near-miss is treated as stale", () => {
    // Group.name is not unique and is compared as a string throughout the
    // admin — see filterPagesByGroup and visibleGroupChips, which key off the
    // same value.
    expect(resolveChip("luc", names)).toBe("Chloé");
  });

  it("does not reorder the row", () => {
    // The list arrives sorted by name and this must not impose a second
    // ordering rule beside that one.
    expect(resolveChip(null, ["Marie", "Chloé"])).toBe("Marie");
  });
});
