import { describe, it, expect } from "vitest";
import { pageAudienceLabel } from "@/lib/page-tile";

describe("pageAudienceLabel", () => {
  it("names the students a page is assigned to", () => {
    expect(
      pageAudienceLabel({
        groupNames: ["Marie", "Luc"],
        sharedWithEveryone: false,
      }),
    ).toBe("Marie, Luc");
  });

  it("says so when a page is assigned to nobody", () => {
    expect(
      pageAudienceLabel({ groupNames: [], sharedWithEveryone: false }),
    ).toBe("no students");
  });

  it("reports the everyone group rather than its name", () => {
    expect(
      pageAudienceLabel({ groupNames: ["Everyone"], sharedWithEveryone: true }),
    ).toBe("shared with everyone");
  });

  // A page can be assigned to the everyone group AND to two students. Naming
  // those two would understate its reach: every student has it.
  it("prefers everyone over the student names beside it", () => {
    expect(
      pageAudienceLabel({
        groupNames: ["Everyone", "Marie"],
        sharedWithEveryone: true,
      }),
    ).toBe("shared with everyone");
  });
});
