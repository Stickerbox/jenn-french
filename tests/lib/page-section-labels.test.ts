import { describe, it, expect } from "vitest";
import {
  adminSectionLabel,
  studentSectionLabel,
} from "@/lib/page-section-labels";

describe("adminSectionLabel", () => {
  it("names the three fixed sections", () => {
    expect(adminSectionLabel({ kind: "pinned" })).toBe("Pinned");
    expect(adminSectionLabel({ kind: "thisWeek" })).toBe("This week");
    expect(adminSectionLabel({ kind: "lastWeek" })).toBe("Last week");
  });

  // The year is always present: a shelf spanning a year boundary would
  // otherwise show two headings both reading "JULY".
  it("names a month with its year", () => {
    expect(adminSectionLabel({ kind: "month", year: 2026, month: 6 })).toBe(
      "JULY 2026",
    );
  });

  it("names January, the month index most likely to be off by one", () => {
    expect(adminSectionLabel({ kind: "month", year: 2026, month: 0 })).toBe(
      "JANUARY 2026",
    );
  });
});

describe("studentSectionLabel", () => {
  it("names the three fixed sections in French", () => {
    expect(studentSectionLabel({ kind: "pinned" })).toBe("Épinglé");
    expect(studentSectionLabel({ kind: "thisWeek" })).toBe("Cette semaine");
    expect(studentSectionLabel({ kind: "lastWeek" })).toBe("La semaine dernière");
  });

  it("names a month in French with its year", () => {
    expect(studentSectionLabel({ kind: "month", year: 2026, month: 6 })).toBe(
      "JUILLET 2026",
    );
  });

  it("names January, the month index most likely to be off by one", () => {
    expect(studentSectionLabel({ kind: "month", year: 2026, month: 0 })).toBe(
      "JANVIER 2026",
    );
  });
});
