import { describe, it, expect } from "vitest";
import { sectionLabel } from "@/lib/page-section-labels";

// Formerly two describe blocks, one per function — adminSectionLabel and
// studentSectionLabel — before Task H2 collapsed them into one. See the
// comment on sectionLabel for why: both surfaces now follow the visitor's
// locale, which made the two implementations identical.
describe("sectionLabel", () => {
  it("names the three fixed sections in French", () => {
    expect(sectionLabel({ kind: "pinned" }, "fr")).toBe("Épinglé");
    expect(sectionLabel({ kind: "thisWeek" }, "fr")).toBe("Cette semaine");
    expect(sectionLabel({ kind: "lastWeek" }, "fr")).toBe(
      "La semaine dernière",
    );
  });

  it("names the three fixed sections in English", () => {
    expect(sectionLabel({ kind: "pinned" }, "en")).toBe("Pinned");
    expect(sectionLabel({ kind: "thisWeek" }, "en")).toBe("This week");
    expect(sectionLabel({ kind: "lastWeek" }, "en")).toBe("Last week");
  });

  it("names a month in French with its year", () => {
    expect(sectionLabel({ kind: "month", year: 2026, month: 6 }, "fr")).toBe(
      "JUILLET 2026",
    );
  });

  it("names the same month in English with its year", () => {
    expect(sectionLabel({ kind: "month", year: 2026, month: 6 }, "en")).toBe(
      "JULY 2026",
    );
  });

  it("names January, the month index most likely to be off by one", () => {
    expect(sectionLabel({ kind: "month", year: 2026, month: 0 }, "fr")).toBe(
      "JANVIER 2026",
    );
  });
});
