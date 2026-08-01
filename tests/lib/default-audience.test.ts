import { describe, expect, it } from "vitest";
import { defaultGroupId } from "@/lib/default-audience";

const groups = [
  { id: "g1", name: "Marie" },
  { id: "g2", name: "Everyone" },
];

describe("defaultGroupId", () => {
  it("maps the active chip to its group id", () => {
    expect(defaultGroupId("Marie", groups)).toBe("g1");
  });

  it("returns null when no chip is active", () => {
    expect(defaultGroupId(null, groups)).toBeNull();
  });

  it("returns null for a name no group has", () => {
    // Exact match, like filterPagesByGroup: the name came from a chip built out
    // of the data, so a near-miss means the chip list is wrong, not the input.
    expect(defaultGroupId("marie", groups)).toBeNull();
    expect(defaultGroupId("Gone", groups)).toBeNull();
  });
});
