import { describe, it, expect } from "vitest";
import { normalise, filterPages, filterGroups } from "@/lib/admin-search";

const pages = [
  { title: "Verbes au passé", groupNames: ["A1", "Ados"] },
  { title: "Les nombres", groupNames: ["A1"] },
  { title: "Où est le chat", groupNames: [] },
];

const groups = [
  { name: "Débutants", slug: "a1" },
  { name: "Ados", slug: "teens" },
];

describe("normalise", () => {
  it("lowercases", () => {
    expect(normalise("PASSE")).toBe("passe");
  });

  it("strips diacritics", () => {
    expect(normalise("passé")).toBe("passe");
    expect(normalise("Où")).toBe("ou");
  });
});

describe("filterPages", () => {
  it("returns everything for an empty query", () => {
    expect(filterPages(pages, "")).toHaveLength(3);
  });

  it("returns everything for a whitespace-only query", () => {
    expect(filterPages(pages, "   ")).toHaveLength(3);
  });

  it("matches on the title", () => {
    expect(filterPages(pages, "nombres").map((p) => p.title)).toEqual([
      "Les nombres",
    ]);
  });

  it("matches on a group name", () => {
    expect(filterPages(pages, "ados").map((p) => p.title)).toEqual([
      "Verbes au passé",
    ]);
  });

  it("matches a query without the accent against a title with one", () => {
    expect(filterPages(pages, "passe").map((p) => p.title)).toEqual([
      "Verbes au passé",
    ]);
  });

  it("matches a query with an accent against a title without one", () => {
    expect(filterPages([{ title: "Passe compose", groupNames: [] }], "passé"))
      .toHaveLength(1);
  });

  it("ignores case", () => {
    expect(filterPages(pages, "VERBES")).toHaveLength(1);
  });

  it("returns nothing when nothing matches", () => {
    expect(filterPages(pages, "zzz")).toEqual([]);
  });

  it("keeps the caller's own fields on the rows it returns", () => {
    const rich = [{ title: "Les nombres", groupNames: [], slug: "les-nombres" }];
    expect(filterPages(rich, "nombres")[0].slug).toBe("les-nombres");
  });
});

describe("filterGroups", () => {
  it("returns everything for an empty query", () => {
    expect(filterGroups(groups, "")).toHaveLength(2);
  });

  it("matches on the name, accent-insensitively", () => {
    expect(filterGroups(groups, "debutants").map((g) => g.slug)).toEqual(["a1"]);
  });

  it("matches on the slug", () => {
    expect(filterGroups(groups, "teens").map((g) => g.name)).toEqual(["Ados"]);
  });

  it("returns nothing when nothing matches", () => {
    expect(filterGroups(groups, "zzz")).toEqual([]);
  });
});
