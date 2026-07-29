import { describe, it, expect } from "vitest";
import { parseAdminDate } from "@/lib/admin-date";

// A Wednesday. The old suite used a Sunday, which now snaps forward and would
// make every fallback assertion below say something it does not mean.
const TODAY = "2026-07-29";

describe("parseAdminDate", () => {
  it("returns today when the value is missing", () => {
    expect(parseAdminDate(undefined, TODAY)).toBe(TODAY);
  });

  it("returns today for an empty string", () => {
    expect(parseAdminDate("", TODAY)).toBe(TODAY);
  });

  it("returns today for an unparseable value", () => {
    expect(parseAdminDate("not-a-date", TODAY)).toBe(TODAY);
  });

  it("returns today for a wrongly shaped value", () => {
    expect(parseAdminDate("2026-7-4", TODAY)).toBe(TODAY);
  });

  it("returns today for a date that does not exist", () => {
    expect(parseAdminDate("2026-02-31", TODAY)).toBe(TODAY);
  });

  it("returns a past weekday unchanged", () => {
    expect(parseAdminDate("2026-01-15", TODAY)).toBe("2026-01-15");
  });

  it("returns a future weekday unchanged, without clamping", () => {
    expect(parseAdminDate("2027-03-09", TODAY)).toBe("2027-03-09");
  });

  it("returns today's own date unchanged", () => {
    expect(parseAdminDate(TODAY, TODAY)).toBe(TODAY);
  });
});

describe("parseAdminDate weekend snapping", () => {
  it("snaps a Saturday to the following Monday", () => {
    expect(parseAdminDate("2026-08-01", TODAY)).toBe("2026-08-03");
  });

  it("snaps a Sunday to the following Monday", () => {
    expect(parseAdminDate("2026-08-02", TODAY)).toBe("2026-08-03");
  });

  it("snaps across a month boundary", () => {
    // Saturday 31 October 2026.
    expect(parseAdminDate("2026-10-31", TODAY)).toBe("2026-11-02");
  });

  it("snaps a future weekend without clamping it to today", () => {
    // Saturday 13 March 2027 — still in the future after snapping.
    expect(parseAdminDate("2027-03-13", TODAY)).toBe("2027-03-15");
  });

  it("snaps the today fallback when today is itself a weekend", () => {
    expect(parseAdminDate(undefined, "2026-08-02")).toBe("2026-08-03");
  });

  it("snaps the today fallback when the value was unusable", () => {
    expect(parseAdminDate("not-a-date", "2026-08-01")).toBe("2026-08-03");
  });
});
