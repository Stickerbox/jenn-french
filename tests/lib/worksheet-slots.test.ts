import { describe, expect, it } from "vitest";
import { visibleSlots } from "@/lib/worksheet-slots";

describe("visibleSlots", () => {
  it("gives a student one tab until Jenn has corrected", () => {
    // Their first view IS the blank's content, under their own label — the
    // seed, not a tab. So "nobody has typed" and "I have typed" look the same.
    expect(
      visibleSlots({ audience: "student", hasStudent: false, hasTeacher: false }),
    ).toEqual(["student"]);
    expect(
      visibleSlots({ audience: "student", hasStudent: true, hasTeacher: false }),
    ).toEqual(["student"]);
  });

  it("never shows a student the blank", () => {
    expect(
      visibleSlots({ audience: "student", hasStudent: true, hasTeacher: true }),
    ).toEqual(["student", "teacher"]);
    // Jenn can correct before the student has typed anything, by writing from
    // the blank. The student still gets no blank tab.
    expect(
      visibleSlots({ audience: "student", hasStudent: false, hasTeacher: true }),
    ).toEqual(["student", "teacher"]);
  });

  it("gives Jenn the blank alone until somebody has saved", () => {
    expect(
      visibleSlots({ audience: "teacher", hasStudent: false, hasTeacher: false }),
    ).toEqual(["blank"]);
  });

  it("gives Jenn the blank plus every slot that exists", () => {
    expect(
      visibleSlots({ audience: "teacher", hasStudent: true, hasTeacher: false }),
    ).toEqual(["blank", "student"]);
    expect(
      visibleSlots({ audience: "teacher", hasStudent: false, hasTeacher: true }),
    ).toEqual(["blank", "teacher"]);
    expect(
      visibleSlots({ audience: "teacher", hasStudent: true, hasTeacher: true }),
    ).toEqual(["blank", "student", "teacher"]);
  });

  it("caps the student at two tabs and Jenn at three", () => {
    // The asymmetry is the whole design in one line, so it is pinned.
    expect(
      visibleSlots({ audience: "student", hasStudent: true, hasTeacher: true }),
    ).toHaveLength(2);
    expect(
      visibleSlots({ audience: "teacher", hasStudent: true, hasTeacher: true }),
    ).toHaveLength(3);
  });
});
