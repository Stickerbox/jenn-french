import { describe, expect, it } from "vitest";
import { versionNotice } from "@/lib/version-notice";

const URL = "https://francaisavecjenn.ca/g/marie/w/devoir-3";

describe("versionNotice", () => {
  it("says what the student did, naming her, in the third person", () => {
    // Third person because the SAME string is read by both parties — a
    // first-person "mes réponses sont enregistrées" only reads right to the
    // one who typed it.
    expect(versionNotice("Devoir 3", false, "Marie Dupont", URL)).toBe(
      `Marie a terminé son devoir : « Devoir 3 » ${URL}`,
    );
  });

  it("says what Jenn did, naming her", () => {
    expect(versionNotice("Devoir 3", true, "Marie Dupont", URL)).toBe(
      `Jenn a déposé sa correction de « Devoir 3 » ${URL}`,
    );
  });

  it("is French on both sides, because both land in the student's chat", () => {
    // The one place the English/French split does NOT apply by audience: the
    // teacher inbox renders the same message the student reads.
    expect(versionNotice("Devoir 3", true, "Marie Dupont", URL)).not.toMatch(
      /[Ii] uploaded|[Ii] corrected/,
    );
  });

  it("carries a title with quotes in it without breaking", () => {
    expect(
      versionNotice('Le "grand" test', false, "Marie Dupont", URL),
    ).toContain('Le "grand" test');
  });

  it("uses the student's first name only, the same rule greeting() draws", () => {
    // "Marie Dupont a terminé son devoir" reads like a report card, not a
    // note in a chat — and two students can share a first name, which is
    // exactly why teacherPageLabel goes the other way for its own purpose.
    expect(versionNotice("Devoir 3", false, "Marie Dupont", URL)).toContain(
      "Marie a terminé",
    );
    expect(versionNotice("Devoir 3", false, "Marie Dupont", URL)).not.toContain(
      "Dupont",
    );
  });

  it("carries the url verbatim, at the end, with nothing appended after it", () => {
    const studentLine = versionNotice("Devoir 3", false, "Marie Dupont", URL);
    expect(studentLine).toContain(URL);
    expect(studentLine.endsWith(URL)).toBe(true);

    const teacherLine = versionNotice("Devoir 3", true, "Marie Dupont", URL);
    expect(teacherLine).toContain(URL);
    expect(teacherLine.endsWith(URL)).toBe(true);
  });
});
