import { describe, expect, it } from "vitest";
import { canSaveFromSlot } from "@/lib/worksheet-save-slots";

describe("canSaveFromSlot", () => {
  it("lets Jenn save from every version", () => {
    // Including the student's attempt: opening it, marking it and saving is
    // how a correction is made, and it writes her own slot.
    expect(canSaveFromSlot("blank", "teacher")).toBe(true);
    expect(canSaveFromSlot("student", "teacher")).toBe(true);
    expect(canSaveFromSlot("teacher", "teacher")).toBe(true);
  });

  it("lets a student save from the blank and from their own answers", () => {
    expect(canSaveFromSlot("blank", "student")).toBe(true);
    expect(canSaveFromSlot("student", "student")).toBe(true);
  });

  it("refuses a student saving from Jenn's correction", () => {
    // A save writes the CALLER'S slot, so this would file the teacher's marks
    // as the student's attempt and lose what they actually handed in.
    expect(canSaveFromSlot("teacher", "student")).toBe(false);
  });
});
