import { describe, expect, it } from "vitest";
import { slotForVersion, versionLabel } from "@/lib/version-labels";

describe("versionLabel", () => {
  it("gives the student their own side, in the browser's language", () => {
    expect(versionLabel("blank", "student", "Marie Dupont", "fr")).toBe("Le devoir");
    expect(versionLabel("student", "student", "Marie Dupont", "fr")).toBe(
      "Mes réponses",
    );
    expect(versionLabel("teacher", "student", "Marie Dupont", "fr")).toBe(
      "La correction de Jenn",
    );
  });

  it("gives Jenn the other side, and names the student in full", () => {
    // The whole name, for teacherPageLabel's reason: her problem is telling two
    // students apart, and two students can share a first name.
    expect(versionLabel("blank", "teacher", "Marie Dupont", "en")).toBe(
      "The worksheet",
    );
    expect(versionLabel("student", "teacher", "Marie Dupont", "en")).toBe(
      "Marie Dupont's answers",
    );
    expect(versionLabel("teacher", "teacher", "Marie Dupont", "en")).toBe(
      "My correction",
    );
  });

  it("uses 's on a name ending in s, as teacherPageLabel does", () => {
    expect(versionLabel("student", "teacher", "Jonas", "en")).toBe("Jonas's answers");
  });

  // THE TWO AXES ARE INDEPENDENT, and this is what the old audience-decides-
  // language rule made unreachable. Both of these were impossible before:
  // Jenn on an fr-CA browser got English, a student on an English one got
  // French, and neither could be corrected from inside the site.
  it("gives Jenn French when her browser asks for it", () => {
    expect(versionLabel("student", "teacher", "Marie Dupont", "fr")).toBe(
      "Les réponses de Marie Dupont",
    );
    expect(versionLabel("teacher", "teacher", "Marie Dupont", "fr")).toBe(
      "Ma correction",
    );
  });

  it("gives a student English when their browser asks for it", () => {
    expect(versionLabel("student", "student", "Marie", "en")).toBe("My answers");
    expect(versionLabel("teacher", "student", "Marie", "en")).toBe(
      "Jenn's correction",
    );
  });

  it("keeps the two perspectives distinct within one language", () => {
    // The student slot is "mine" to the student and "Marie's" to Jenn. If
    // audience ever stopped being read, these would collapse into one string
    // and nobody would be able to tell whose answers they were reading.
    for (const locale of ["fr", "en"] as const) {
      expect(versionLabel("student", "student", "Marie", locale)).not.toBe(
        versionLabel("student", "teacher", "Marie", locale),
      );
      expect(versionLabel("teacher", "student", "Marie", locale)).not.toBe(
        versionLabel("teacher", "teacher", "Marie", locale),
      );
    }
  });
});

describe("slotForVersion", () => {
  it("maps the stored boolean onto a slot", () => {
    expect(slotForVersion(true)).toBe("teacher");
    expect(slotForVersion(false)).toBe("student");
  });
});
