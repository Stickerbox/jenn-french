import { describe, it, expect } from "vitest";
import {
  normalise,
  filterPages,
  filterGroups,
  pageGroupNames,
  filterPagesByGroup,
} from "@/lib/admin-search";

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

describe("pageGroupNames", () => {
  it("returns the distinct group names across every page", () => {
    expect(pageGroupNames(pages)).toEqual(["A1", "Ados"]);
  });

  it("sorts them, so the chips do not reorder as pages are added", () => {
    expect(
      pageGroupNames([
        { title: "b", groupNames: ["Zèbres"] },
        { title: "a", groupNames: ["Ados", "A1"] },
      ]),
    ).toEqual(["A1", "Ados", "Zèbres"]);
  });

  it("returns nothing when no page belongs to a group", () => {
    expect(pageGroupNames([{ title: "a", groupNames: [] }])).toEqual([]);
  });
});

describe("filterPagesByGroup", () => {
  it("returns everything when no group is chosen", () => {
    expect(filterPagesByGroup(pages, null)).toHaveLength(3);
  });

  it("keeps only the pages in that group", () => {
    expect(filterPagesByGroup(pages, "A1").map((p) => p.title)).toEqual([
      "Verbes au passé",
      "Les nombres",
    ]);
  });

  it("matches a group name exactly, unlike the search box", () => {
    expect(filterPagesByGroup(pages, "a1")).toEqual([]);
  });

  it("returns nothing for a group no page belongs to", () => {
    expect(filterPagesByGroup(pages, "Zèbres")).toEqual([]);
  });

  it("keeps the caller's own fields on the rows it returns", () => {
    const rich = [{ title: "Les nombres", groupNames: ["A1"], slug: "n" }];
    expect(filterPagesByGroup(rich, "A1")[0].slug).toBe("n");
  });
});

describe("filterPagesByGroup with an everyone group", () => {
  const shelf = [
    { title: "Marie only", groupNames: ["Marie"], sharedWithEveryone: false },
    { title: "For all", groupNames: ["Everyone"], sharedWithEveryone: true },
    { title: "Luc only", groupNames: ["Luc"], sharedWithEveryone: false },
  ];

  it("includes the everyone pages when filtering by a student", () => {
    expect(
      filterPagesByGroup(shelf, "Marie", "Everyone").map((p) => p.title),
    ).toEqual(["Marie only", "For all"]);
  });

  it("shows only the everyone pages when filtering by the everyone group", () => {
    expect(
      filterPagesByGroup(shelf, "Everyone", "Everyone").map((p) => p.title),
    ).toEqual(["For all"]);
  });

  it("still returns everything when no group is chosen", () => {
    expect(filterPagesByGroup(shelf, null, "Everyone")).toHaveLength(3);
  });

  it("does not double-list a page that is both direct and shared", () => {
    const both = [
      { title: "Both", groupNames: ["Marie", "Everyone"], sharedWithEveryone: true },
    ];
    expect(filterPagesByGroup(both, "Marie", "Everyone")).toHaveLength(1);
  });

  it("behaves as before when no everyone group name is given", () => {
    expect(filterPagesByGroup(shelf, "Marie").map((p) => p.title)).toEqual([
      "Marie only",
    ]);
  });
});
