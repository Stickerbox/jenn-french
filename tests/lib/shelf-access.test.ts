import { describe, expect, it } from "vitest";
import { canStudentDelete, shelfRole } from "@/lib/shelf-access";

const base = {
  isTeacher: false,
  isEveryone: false,
  chatToken: "tok",
  presented: null as string | null,
};

describe("shelfRole", () => {
  it("lets the teacher write to any shelf, the everyone shelf included", () => {
    // The whole reason this is not chatRole, which refuses the everyone group
    // before it checks the teacher. Right for a conversation, wrong for
    // curation: the shared shelf is Jenn's to fill.
    expect(shelfRole({ ...base, isTeacher: true, isEveryone: true, chatToken: null }))
      .toBe("teacher");
  });

  it("accepts a student presenting the matching token", () => {
    expect(shelfRole({ ...base, presented: "tok" })).toBe("student");
  });

  it("refuses a student on the everyone shelf", () => {
    // That shelf is public with no token, so a control there would be an
    // unauthenticated write endpoint open to the internet.
    expect(shelfRole({ ...base, isEveryone: true, presented: "tok" })).toBeNull();
  });

  it("refuses a wrong token", () => {
    expect(shelfRole({ ...base, presented: "nope" })).toBeNull();
  });

  it("refuses when the group has no token and none is presented", () => {
    expect(shelfRole({ ...base, chatToken: null, presented: null })).toBeNull();
  });

  it("cannot be entered by presenting a nullish string", () => {
    expect(shelfRole({ ...base, chatToken: null, presented: "null" })).toBeNull();
  });
});

describe("canStudentDelete", () => {
  const link = { kind: "link" as const, addedByStudent: true, groupIds: ["g1"] };

  it("allows a student to retract their own link", () => {
    expect(canStudentDelete(link, "g1")).toBe(true);
  });

  it("refuses a page the teacher uploaded", () => {
    expect(canStudentDelete({ ...link, addedByStudent: false }, "g1")).toBe(false);
  });

  it("allows a student to retract a page they published", () => {
    expect(canStudentDelete({ ...link, kind: "html" }, "g1")).toBe(true);
  });

  it("still refuses a page Jenn published", () => {
    expect(
      canStudentDelete({ ...link, kind: "html", addedByStudent: false }, "g1"),
    ).toBe(false);
  });

  // The clause that makes widening the first one safe: a Page row is shared, so
  // deleting one on two shelves takes it off both.
  it("still refuses a page of theirs that reached a second shelf", () => {
    expect(
      canStudentDelete({ ...link, kind: "html", groupIds: ["g1", "g2"] }, "g1"),
    ).toBe(false);
  });

  it("refuses a row shared with anyone else", () => {
    // A Page row is shared. Deleting one assigned to several groups would take
    // it off every shelf it is on.
    expect(canStudentDelete({ ...link, groupIds: ["g1", "g2"] }, "g1")).toBe(false);
  });

  it("refuses a row belonging to a different shelf", () => {
    expect(canStudentDelete(link, "g2")).toBe(false);
  });
});
