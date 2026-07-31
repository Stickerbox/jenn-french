import { describe, it, expect } from "vitest";
import { sectionPages } from "@/lib/page-sections";

const at = (iso: string) => new Date(`${iso}T00:00:00Z`);

// Friday. This week is Mon 27 - Fri 31 July; last week is Mon 20 - Fri 24.
const TODAY = at("2026-07-31");

const page = (id: string, created: string, pinned?: string) => ({
  id,
  createdAt: at(created),
  pinnedAt: pinned ? at(pinned) : null,
});

const kinds = (sections: { key: { kind: string } }[]) =>
  sections.map((s) => s.key.kind);

const ids = (section: { pages: { id: string }[] }) =>
  section.pages.map((p) => p.id);

describe("sectionPages", () => {
  it("returns nothing for no pages", () => {
    expect(sectionPages([], TODAY)).toEqual([]);
  });

  it("puts a page from today in this week", () => {
    const result = sectionPages([page("a", "2026-07-31")], TODAY);
    expect(kinds(result)).toEqual(["thisWeek"]);
  });

  it("puts Monday of this week in this week, and the Friday before in last week", () => {
    const result = sectionPages(
      [page("mon", "2026-07-27"), page("fri", "2026-07-24")],
      TODAY,
    );
    expect(kinds(result)).toEqual(["thisWeek", "lastWeek"]);
    expect(ids(result[0])).toEqual(["mon"]);
    expect(ids(result[1])).toEqual(["fri"]);
  });

  // weekRange ends on Friday. A closed range would drop this page into a month
  // section BELOW pages a week older than it.
  it("keeps a Saturday page in the week that just ended", () => {
    const saturday = at("2026-08-01");
    const result = sectionPages([page("sat", "2026-08-01")], saturday);
    expect(kinds(result)).toEqual(["thisWeek"]);
  });

  it("splits everything older into one section per month, newest first", () => {
    const result = sectionPages(
      [page("jul", "2026-07-06"), page("jun", "2026-06-15")],
      TODAY,
    );
    expect(result.map((s) => s.key)).toEqual([
      { kind: "month", year: 2026, month: 6 },
      { kind: "month", year: 2026, month: 5 },
    ]);
  });

  it("keeps two Julys a year apart in two sections", () => {
    const result = sectionPages(
      [page("new", "2026-07-06"), page("old", "2025-07-06")],
      TODAY,
    );
    expect(result.map((s) => s.key)).toEqual([
      { kind: "month", year: 2026, month: 6 },
      { kind: "month", year: 2025, month: 6 },
    ]);
  });

  it("lifts a pinned page out of its date section", () => {
    const result = sectionPages([page("p", "2025-01-05", "2026-07-30")], TODAY);
    expect(kinds(result)).toEqual(["pinned"]);
    expect(ids(result[0])).toEqual(["p"]);
  });

  it("orders pinned pages by when they were pinned, not when they were made", () => {
    const result = sectionPages(
      [
        page("madeLast", "2026-06-01", "2026-07-01"),
        page("pinnedLast", "2026-01-01", "2026-07-29"),
      ],
      TODAY,
    );
    expect(ids(result[0])).toEqual(["pinnedLast", "madeLast"]);
  });

  it("orders every other section newest first", () => {
    const result = sectionPages(
      [page("older", "2026-07-27"), page("newer", "2026-07-30")],
      TODAY,
    );
    expect(ids(result[0])).toEqual(["newer", "older"]);
  });

  it("puts pinned first, then this week, then last week, then months", () => {
    const result = sectionPages(
      [
        page("month", "2026-05-02"),
        page("last", "2026-07-22"),
        page("this", "2026-07-29"),
        page("pin", "2026-05-02", "2026-07-30"),
      ],
      TODAY,
    );
    expect(kinds(result)).toEqual([
      "pinned",
      "thisWeek",
      "lastWeek",
      "month",
    ]);
  });

  it("omits sections with no pages", () => {
    const result = sectionPages([page("a", "2026-07-29")], TODAY);
    expect(result).toHaveLength(1);
  });
});
