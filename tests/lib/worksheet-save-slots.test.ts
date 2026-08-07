import { describe, expect, it } from "vitest";
import { canSaveFromSlot, isWritableSlot } from "@/lib/worksheet-save-slots";

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

describe("isWritableSlot", () => {
  it("lets a student write their own copy and nothing else", () => {
    expect(
      isWritableSlot({ slot: "student", audience: "student", hasTeacher: false }),
    ).toBe(true);
    expect(
      isWritableSlot({ slot: "student", audience: "student", hasTeacher: true }),
    ).toBe(true);
    // Auto-save writes the CALLER'S slot, so this would file Jenn's marks as
    // the student's own attempt ten seconds after they touched a key.
    expect(
      isWritableSlot({ slot: "teacher", audience: "student", hasTeacher: true }),
    ).toBe(false);
    // Not a tab they can reach, but the predicate must not depend on that.
    expect(
      isWritableSlot({ slot: "blank", audience: "student", hasTeacher: false }),
    ).toBe(false);
  });

  it("lets Jenn seed her correction from any tab while she has none", () => {
    // From the blank this makes an answer key; from the attempt it makes an
    // annotated attempt. Both are real, and both write her own slot.
    expect(
      isWritableSlot({ slot: "blank", audience: "teacher", hasTeacher: false }),
    ).toBe(true);
    expect(
      isWritableSlot({ slot: "student", audience: "teacher", hasTeacher: false }),
    ).toBe(true);
  });

  it("confines Jenn to her correction once she has one", () => {
    // The clause that stops a second visit from overwriting her first
    // correction ten seconds later, with no press to reconsider.
    expect(
      isWritableSlot({ slot: "teacher", audience: "teacher", hasTeacher: true }),
    ).toBe(true);
    expect(
      isWritableSlot({ slot: "student", audience: "teacher", hasTeacher: true }),
    ).toBe(false);
    expect(
      isWritableSlot({ slot: "blank", audience: "teacher", hasTeacher: true }),
    ).toBe(false);
  });

  it("keeps exactly one writable slot for each party at any moment", () => {
    // The invariant the whole read-only rule buys: the attempt and the
    // correction can never overwrite each other.
    const slots = ["blank", "student", "teacher"] as const;
    for (const hasTeacher of [false, true]) {
      const writable = slots.filter((slot) =>
        isWritableSlot({ slot, audience: "student", hasTeacher }),
      );
      expect(writable).toEqual(["student"]);
    }
    expect(
      slots.filter((slot) =>
        isWritableSlot({ slot, audience: "teacher", hasTeacher: true }),
      ),
    ).toEqual(["teacher"]);
  });
});
