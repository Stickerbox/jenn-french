import { describe, expect, it } from "vitest";
import { versionNotice } from "@/lib/version-notice";

describe("versionNotice", () => {
  it("says what the student did, naming her, in the third person", () => {
    // Third person because the SAME string is read by both parties — a
    // first-person "mes réponses sont enregistrées" only reads right to the
    // one who typed it.
    expect(versionNotice("Devoir 3", false, "Marie Dupont")).toBe(
      "Marie a terminé son devoir : « Devoir 3 »",
    );
  });

  it("says what Jenn did, naming her", () => {
    expect(versionNotice("Devoir 3", true, "Marie Dupont")).toBe(
      "Jenn a déposé sa correction de « Devoir 3 »",
    );
  });

  it("is French on both sides, because both land in the student's chat", () => {
    // The one place the English/French split does NOT apply by audience: the
    // teacher inbox renders the same message the student reads.
    expect(versionNotice("Devoir 3", true, "Marie Dupont")).not.toMatch(
      /[Ii] uploaded|[Ii] corrected/,
    );
  });

  it("carries a title with quotes in it without breaking", () => {
    expect(versionNotice('Le "grand" test', false, "Marie Dupont")).toContain(
      'Le "grand" test',
    );
  });

  it("uses the student's first name only, the same rule greeting() draws", () => {
    // "Marie Dupont a terminé son devoir" reads like a report card, not a
    // note in a chat — and two students can share a first name, which is
    // exactly why teacherPageLabel goes the other way for its own purpose.
    expect(versionNotice("Devoir 3", false, "Marie Dupont")).toContain(
      "Marie a terminé",
    );
    expect(versionNotice("Devoir 3", false, "Marie Dupont")).not.toContain(
      "Dupont",
    );
  });

  // The URL used to live inline at the end of this string, and the bubble
  // linkified it. It now travels structurally as createMessage's href, with
  // automated: true — these two cases pin that the body carries no address at
  // all, on either side of the conversation.
  it("carries no URL for the student's line", () => {
    const studentLine = versionNotice("Devoir 3", false, "Marie Dupont");
    expect(studentLine).not.toMatch(/https?:\/\//);
  });

  it("carries no URL for Jenn's line", () => {
    const teacherLine = versionNotice("Devoir 3", true, "Marie Dupont");
    expect(teacherLine).not.toMatch(/https?:\/\//);
  });
});
