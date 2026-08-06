import { describe, it, expect } from "vitest";
import { pageAudienceLabel } from "@/lib/page-tile";

describe("pageAudienceLabel", () => {
  it("names the students a page is assigned to, regardless of locale", () => {
    expect(
      pageAudienceLabel(
        { groupNames: ["Marie", "Luc"], sharedWithEveryone: false },
        "en",
      ),
    ).toBe("Marie, Luc");
  });

  it("says so when a page is assigned to nobody", () => {
    expect(
      pageAudienceLabel({ groupNames: [], sharedWithEveryone: false }, "en"),
    ).toBe("no students");
    expect(
      pageAudienceLabel({ groupNames: [], sharedWithEveryone: false }, "fr"),
    ).toBe("aucun élève");
  });

  it("reports the everyone group rather than its name", () => {
    expect(
      pageAudienceLabel(
        { groupNames: ["Everyone"], sharedWithEveryone: true },
        "en",
      ),
    ).toBe("shared with everyone");
    expect(
      pageAudienceLabel(
        { groupNames: ["Everyone"], sharedWithEveryone: true },
        "fr",
      ),
    ).toBe("partagé avec tous");
  });

  // A page can be assigned to the everyone group AND to two students. Naming
  // those two would understate its reach: every student has it.
  it("prefers everyone over the student names beside it", () => {
    expect(
      pageAudienceLabel(
        { groupNames: ["Everyone", "Marie"], sharedWithEveryone: true },
        "en",
      ),
    ).toBe("shared with everyone");
  });

  it("defaults to French, this project's fallback, with no locale given", () => {
    expect(
      pageAudienceLabel({ groupNames: [], sharedWithEveryone: false }),
    ).toBe("aucun élève");
  });
});
