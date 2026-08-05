import { describe, expect, it } from "vitest";
import { versionNotice } from "@/lib/version-notice";

describe("versionNotice", () => {
  it("says what the student did, in the student's own voice", () => {
    // It is posted AS the student — fromTeacher false — so it has to read like
    // something they would have typed, not like a system banner.
    expect(versionNotice("Devoir 3", false)).toBe(
      "« Devoir 3 » : mes réponses sont enregistrées.",
    );
  });

  it("says what Jenn did", () => {
    expect(versionNotice("Devoir 3", true)).toBe("J'ai corrigé « Devoir 3 ».");
  });

  it("is French on both sides, because both land in the student's chat", () => {
    // The one place the English/French split does NOT apply by audience: the
    // teacher inbox renders the same message the student reads.
    expect(versionNotice("Devoir 3", true)).not.toMatch(/[Ii] corrected/);
  });

  it("carries a title with quotes in it without breaking", () => {
    expect(versionNotice('Le "grand" test', false)).toContain('Le "grand" test');
  });
});
