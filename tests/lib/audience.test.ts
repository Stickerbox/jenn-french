import { describe, it, expect } from "vitest";
import {
  visibleStudents,
  audienceOptions,
  visibleGroupChips,
} from "@/lib/audience";

const groups = [
  { id: "g1", name: "Everyone", isEveryone: true },
  { id: "g2", name: "Luc", isEveryone: false },
  { id: "g3", name: "Marie", isEveryone: false },
];

describe("visibleStudents", () => {
  it("removes the everyone row", () => {
    expect(visibleStudents(groups).map((g) => g.id)).toEqual(["g2", "g3"]);
  });

  it("keeps the order of the rows it keeps", () => {
    const reversed = [groups[2], groups[1], groups[0]];
    expect(visibleStudents(reversed).map((g) => g.id)).toEqual(["g3", "g2"]);
  });

  it("returns everything when no row is flagged", () => {
    expect(visibleStudents([groups[1], groups[2]])).toHaveLength(2);
  });

  it("returns an empty list rather than throwing on an empty one", () => {
    expect(visibleStudents([])).toEqual([]);
  });
});

describe("audienceOptions", () => {
  it("relabels the everyone row and leaves the students alone", () => {
    expect(audienceOptions(groups, "All students")).toEqual([
      { id: "g1", label: "All students" },
      { id: "g2", label: "Luc" },
      { id: "g3", label: "Marie" },
    ]);
  });

  it("keeps the everyone row in place rather than moving it to the front", () => {
    const middle = [groups[1], groups[0], groups[2]];
    expect(audienceOptions(middle, "All students").map((o) => o.label)).toEqual([
      "Luc",
      "All students",
      "Marie",
    ]);
  });

  it("keeps every id, because the id is what the form submits", () => {
    expect(audienceOptions(groups, "All students").map((o) => o.id)).toEqual([
      "g1",
      "g2",
      "g3",
    ]);
  });

  it("does not read Group.name for the flagged row", () => {
    const renamed = [{ id: "g1", name: "Tout le monde", isEveryone: true }];
    expect(audienceOptions(renamed, "All students")[0].label).toBe(
      "All students",
    );
  });
});

describe("visibleGroupChips", () => {
  it("removes the everyone name", () => {
    expect(visibleGroupChips(["Everyone", "Luc", "Marie"], "Everyone")).toEqual([
      "Luc",
      "Marie",
    ]);
  });

  it("returns every name when there is no everyone row to name", () => {
    expect(visibleGroupChips(["Luc", "Marie"], null)).toEqual(["Luc", "Marie"]);
  });

  it("matches exactly, so a near-miss is kept", () => {
    expect(visibleGroupChips(["everyone", "Luc"], "Everyone")).toEqual([
      "everyone",
      "Luc",
    ]);
  });

  it("removes every copy of the name", () => {
    // pageGroupNames dedupes, so this cannot happen today. The function must
    // not depend on that: a filter is cheaper to make total than to make
    // conditional on a caller's behaviour.
    expect(visibleGroupChips(["Everyone", "Luc", "Everyone"], "Everyone")).toEqual(
      ["Luc"],
    );
  });
});
