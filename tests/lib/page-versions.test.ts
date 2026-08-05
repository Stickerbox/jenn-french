import { describe, expect, it } from "vitest";
import { applyVersions, versionCount } from "@/lib/page-versions";

const A = new Date("2026-08-01T10:00:00Z");
const B = new Date("2026-08-02T10:00:00Z");

describe("applyVersions", () => {
  it("gives a page with no versions an empty list, not undefined", () => {
    // The tile reads .length to decide on a badge. An absent array would make
    // every consumer write the same ?? [] and one of them would forget.
    const [page] = applyVersions([{ id: "p1" }], []);
    expect(page.versions).toEqual([]);
  });

  it("folds this shelf's versions onto their pages", () => {
    const pages = applyVersions(
      [{ id: "p1" }, { id: "p2" }],
      [
        { pageId: "p1", fromTeacher: false, updatedAt: A },
        { pageId: "p1", fromTeacher: true, updatedAt: B },
      ],
    );
    expect(pages[0].versions).toHaveLength(2);
    expect(pages[1].versions).toHaveLength(0);
  });

  it("orders the student's version before the teacher's, whatever the query gave", () => {
    // A stable order, so the chooser does not reshuffle between renders. It is
    // the order the work happens in: the attempt, then the correction.
    const [page] = applyVersions(
      [{ id: "p1" }],
      [
        { pageId: "p1", fromTeacher: true, updatedAt: A },
        { pageId: "p1", fromTeacher: false, updatedAt: B },
      ],
    );
    expect(page.versions.map((v) => v.fromTeacher)).toEqual([false, true]);
  });

  it("drops a version whose page is not on this shelf", () => {
    const [page] = applyVersions(
      [{ id: "p1" }],
      [{ pageId: "other", fromTeacher: false, updatedAt: A }],
    );
    expect(page.versions).toEqual([]);
  });

  it("keeps the fields the page already had", () => {
    const [page] = applyVersions([{ id: "p1", title: "Devoir 3" }], []);
    expect(page.title).toBe("Devoir 3");
  });
});

describe("versionCount", () => {
  it("counts the blank, which is not a row", () => {
    // Page.html IS the first version. A count of 1 means nobody has saved
    // anything, which is why the badge only shows from 2.
    expect(versionCount([])).toBe(1);
    expect(versionCount([{ fromTeacher: false }])).toBe(2);
    expect(versionCount([{ fromTeacher: false }, { fromTeacher: true }])).toBe(3);
  });
});
