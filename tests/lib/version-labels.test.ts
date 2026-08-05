import { describe, expect, it } from "vitest";
import { slotForVersion, versionLabel } from "@/lib/version-labels";

describe("versionLabel", () => {
  it("speaks French to the student", () => {
    expect(versionLabel("blank", "student", "Marie Dupont")).toBe("Le devoir");
    expect(versionLabel("student", "student", "Marie Dupont")).toBe("Mes réponses");
    expect(versionLabel("teacher", "student", "Marie Dupont")).toBe(
      "La correction de Jenn",
    );
  });

  it("speaks English to Jenn, and names the student in full", () => {
    // The whole name, for teacherPageLabel's reason: her problem is telling two
    // students apart, and two students can share a first name.
    expect(versionLabel("blank", "teacher", "Marie Dupont")).toBe("The worksheet");
    expect(versionLabel("student", "teacher", "Marie Dupont")).toBe(
      "Marie Dupont's answers",
    );
    expect(versionLabel("teacher", "teacher", "Marie Dupont")).toBe("My correction");
  });

  it("uses 's on a name ending in s, as teacherPageLabel does", () => {
    expect(versionLabel("student", "teacher", "Jonas")).toBe("Jonas's answers");
  });

  it("never shows a student an English label", () => {
    const slots = ["blank", "student", "teacher"] as const;
    for (const slot of slots) {
      const fr = versionLabel(slot, "student", "Marie");
      const en = versionLabel(slot, "teacher", "Marie");
      expect(fr).not.toBe(en);
    }
  });
});

describe("slotForVersion", () => {
  it("maps the stored boolean onto a slot", () => {
    expect(slotForVersion(true)).toBe("teacher");
    expect(slotForVersion(false)).toBe("student");
  });
});
