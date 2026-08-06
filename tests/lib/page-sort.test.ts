import { describe, it, expect } from "vitest";
import { sortPages, orderPages } from "@/lib/page-sort";

const at = (iso: string) => new Date(`${iso}T00:00:00Z`);

// Friday, matching tests/lib/page-sections.test.ts's own fixture: this week
// is Mon 27 - Fri 31 July; last week is Mon 20 - Fri 24.
const TODAY = at("2026-07-31");

const page = (
  id: string,
  created: string,
  updated: string,
  pinned?: string,
) => ({
  id,
  createdAt: at(created),
  updatedAt: at(updated),
  pinnedAt: pinned ? at(pinned) : null,
});

const ids = (pages: { id: string }[]) => pages.map((p) => p.id);

describe("sortPages", () => {
  it("orders newest created first", () => {
    const result = sortPages(
      [
        page("older", "2026-07-01", "2026-07-01"),
        page("newer", "2026-07-15", "2026-07-15"),
      ],
      "created",
    );
    expect(ids(result)).toEqual(["newer", "older"]);
  });

  it("orders by updatedAt, not createdAt, when sorting by modified", () => {
    // Made first, edited most recently — the case that makes "modified" a
    // different rule from "created" rather than a relabelling of it.
    const madeFirstEditedLast = page("editedLast", "2026-01-01", "2026-07-30");
    const madeLastNeverEdited = page("madeLast", "2026-07-15", "2026-07-15");
    const result = sortPages(
      [madeLastNeverEdited, madeFirstEditedLast],
      "modified",
    );
    expect(ids(result)).toEqual(["editedLast", "madeLast"]);
  });

  it("does not reorder two rows with the same timestamp", () => {
    // Both regimes must be stable: given a tie, the input order survives.
    // Array.prototype.sort is spec-stable, but the tie-break here is
    // explicit — an index compare — rather than a bet on that guarantee, so
    // this test pins the behaviour this module actually implements.
    const a = page("a", "2026-07-15", "2026-07-15");
    const b = page("b", "2026-07-15", "2026-07-15");
    expect(ids(sortPages([a, b], "created"))).toEqual(["a", "b"]);
    expect(ids(sortPages([b, a], "created"))).toEqual(["b", "a"]);
    expect(ids(sortPages([a, b], "modified"))).toEqual(["a", "b"]);
    expect(ids(sortPages([b, a], "modified"))).toEqual(["b", "a"]);
  });

  it("returns nothing for no pages", () => {
    expect(sortPages([], "created")).toEqual([]);
  });
});

describe("orderPages", () => {
  it("delegates to sectionPages under 'created', unchanged", () => {
    const pages = [
      page("mon", "2026-07-27", "2026-07-27"),
      page("fri", "2026-07-24", "2026-07-24"),
    ];
    const result = orderPages(pages, "created", TODAY);
    expect(result.map((g) => g.heading?.kind)).toEqual([
      "thisWeek",
      "lastWeek",
    ]);
    expect(ids(result[0].pages)).toEqual(["mon"]);
    expect(ids(result[1].pages)).toEqual(["fri"]);
  });

  it("collapses everything unpinned into one headingless group under 'modified'", () => {
    const pages = [
      // Old creation date, recent edit — would land in a month section
      // under "created"; under "modified" it must be a flat top group.
      page("editedRecently", "2025-01-01", "2026-07-30"),
      page("madeRecently", "2026-07-29", "2026-07-01"),
    ];
    const result = orderPages(pages, "modified", TODAY);
    expect(result).toHaveLength(1);
    expect(result[0].heading).toBeNull();
    expect(ids(result[0].pages)).toEqual(["editedRecently", "madeRecently"]);
  });

  it("keeps pinned pages in their own heading under 'modified', ordered by pinnedAt", () => {
    const pages = [
      page("pinnedFirst", "2026-01-01", "2026-01-01", "2026-07-01"),
      page("pinnedSecond", "2026-06-01", "2026-06-01", "2026-07-15"),
      page("unpinned", "2026-07-20", "2026-07-29"),
    ];
    const result = orderPages(pages, "modified", TODAY);
    expect(result).toHaveLength(2);
    expect(result[0].heading?.kind).toBe("pinned");
    // pinnedSecond was pinned more recently than pinnedFirst, so it leads —
    // by pinnedAt, not by either page's own created/updated date.
    expect(ids(result[0].pages)).toEqual(["pinnedSecond", "pinnedFirst"]);
    expect(result[1].heading).toBeNull();
    expect(ids(result[1].pages)).toEqual(["unpinned"]);
  });

  it("omits the flat group entirely when every page is pinned", () => {
    const pages = [page("p", "2026-01-01", "2026-01-01", "2026-07-01")];
    const result = orderPages(pages, "modified", TODAY);
    expect(result).toHaveLength(1);
    expect(result[0].heading?.kind).toBe("pinned");
  });

  it("returns nothing for no pages, under either sort", () => {
    expect(orderPages([], "created", TODAY)).toEqual([]);
    expect(orderPages([], "modified", TODAY)).toEqual([]);
  });
});
