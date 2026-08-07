import { describe, it, expect } from "vitest";
import {
  DEFAULT_KIND,
  DEFAULT_SORT,
  filtersAreActive,
} from "@/lib/shelf-filters";

describe("the defaults", () => {
  it("are the values FilesTab opens with", () => {
    // If either of these moves, the dot lights up on a shelf nobody has
    // touched — so they are pinned here rather than left as a convention.
    expect(DEFAULT_KIND).toBe("all");
    expect(DEFAULT_SORT).toBe("created");
  });
});

describe("filtersAreActive", () => {
  it("is false when nothing has been touched", () => {
    expect(filtersAreActive({ kind: "all", sort: "created" })).toBe(false);
  });

  it("is true when the kind is narrowed", () => {
    expect(filtersAreActive({ kind: "pdf", sort: "created" })).toBe(true);
  });

  it("is true when the sort is changed", () => {
    expect(filtersAreActive({ kind: "all", sort: "modified" })).toBe(true);
  });

  it("is true when both are changed", () => {
    expect(filtersAreActive({ kind: "link", sort: "modified" })).toBe(true);
  });

  it("is true for every narrowing kind", () => {
    for (const kind of ["html", "link", "pdf"] as const) {
      expect(filtersAreActive({ kind, sort: "created" })).toBe(true);
    }
  });
});
