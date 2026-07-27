import { describe, it, expect } from "vitest";
import { parseAdminDate } from "@/lib/admin-date";

const TODAY = "2026-07-26";

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

  it("returns a past date unchanged", () => {
    expect(parseAdminDate("2026-01-15", TODAY)).toBe("2026-01-15");
  });

  it("returns a future date unchanged, without clamping", () => {
    expect(parseAdminDate("2027-03-09", TODAY)).toBe("2027-03-09");
  });

  it("returns today's own date unchanged", () => {
    expect(parseAdminDate(TODAY, TODAY)).toBe(TODAY);
  });
});
