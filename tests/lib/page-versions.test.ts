import { describe, expect, it } from "vitest";
import { applyVersions, shelfSlotCount } from "@/lib/page-versions";

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

describe("shelfSlotCount", () => {
  const attempt = [{ fromTeacher: false }];
  const both = [{ fromTeacher: false }, { fromTeacher: true }];

  it("counts the blank for Jenn, who has a tab for it", () => {
    // Page.html IS her first version, and her numbers are what they always
    // were: 1 means nobody has saved anything.
    expect(shelfSlotCount([], "teacher")).toBe(1);
    expect(shelfSlotCount(attempt, "teacher")).toBe(2);
    expect(shelfSlotCount(both, "teacher")).toBe(3);
  });

  it("never counts the blank for a student, who has no tab for it", () => {
    // The bug this function was written for: a student who had saved once
    // counted 2 under the old rule, so the shelf badged their homework "2"
    // and the tile opened a chooser offering a blank they cannot reach.
    expect(shelfSlotCount([], "student")).toBe(1);
    expect(shelfSlotCount(attempt, "student")).toBe(1);
  });

  it("reaches 2 for a student only once Jenn has corrected", () => {
    // Which is exactly when the badge should appear: it is the signal that
    // there is something new to read.
    expect(shelfSlotCount(both, "student")).toBe(2);
    // Jenn can correct from the blank before the student has typed anything.
    // The correction still counts; the missing attempt still does not.
    expect(shelfSlotCount([{ fromTeacher: true }], "student")).toBe(2);
  });

  it("never lets a student's count reach Jenn's three", () => {
    expect(shelfSlotCount(both, "student")).toBeLessThan(
      shelfSlotCount(both, "teacher"),
    );
  });
});
