import { describe, expect, it } from "vitest";
import { authPanelMode, studentGate } from "@/lib/student-gate";

const base = {
  isTeacher: false,
  isEveryone: false,
  chatToken: "tok" as string | null,
  presented: null as string | null,
  claimed: false,
};

describe("studentGate", () => {
  it("refuses the everyone group before anything else can admit it", () => {
    expect(
      studentGate({
        ...base,
        isEveryone: true,
        isTeacher: true,
        presented: "tok",
        claimed: true,
      }),
    ).toBe("none");
  });

  it("refuses a group with no token at all", () => {
    expect(studentGate({ ...base, chatToken: null, presented: "tok" })).toBe(
      "none",
    );
  });

  it("cannot be entered by presenting the string null", () => {
    expect(studentGate({ ...base, chatToken: null, presented: "null" })).toBe(
      "none",
    );
  });

  it("signs in a claimed student holding the current token", () => {
    expect(studentGate({ ...base, presented: "tok", claimed: true })).toBe(
      "signed-in",
    );
  });

  it("offers sign-up to an unclaimed student holding a live invite", () => {
    expect(studentGate({ ...base, presented: "tok" })).toBe("signup");
  });

  it("offers sign-in identically whether or not the student is claimed", () => {
    // The security requirement behind the terminal clause: the presence of the
    // form must not tell a slug-guesser which students exist.
    expect(studentGate({ ...base, claimed: true })).toBe("login");
    expect(studentGate({ ...base, claimed: false })).toBe("login");
  });

  it("offers sign-in on a spent or wrong token", () => {
    expect(studentGate({ ...base, presented: "old", claimed: true })).toBe(
      "login",
    );
  });

  it("never offers the teacher a form she could claim a student with", () => {
    expect(studentGate({ ...base, isTeacher: true, presented: "tok" })).toBe(
      "unclaimed",
    );
    expect(studentGate({ ...base, isTeacher: true, presented: null })).toBe(
      "unclaimed",
    );
  });

  it("tells the teacher her link is stale rather than showing a student form", () => {
    expect(
      studentGate({
        ...base,
        isTeacher: true,
        claimed: true,
        presented: "old",
      }),
    ).toBe("teacher-stale");
    expect(
      studentGate({ ...base, isTeacher: true, claimed: true, presented: null }),
    ).toBe("teacher-stale");
  });

  it("signs the teacher in when she holds the current token", () => {
    expect(
      studentGate({
        ...base,
        isTeacher: true,
        claimed: true,
        presented: "tok",
      }),
    ).toBe("signed-in");
  });
});

describe("authPanelMode", () => {
  it("gives a student the mode matching their gate", () => {
    expect(authPanelMode("signup", false)).toBe("signup");
    expect(authPanelMode("login", false)).toBe("login");
    expect(authPanelMode("signed-in", false)).toBe("signed-in");
  });

  it("shows no panel where there is nothing to sign in to", () => {
    expect(authPanelMode("none", false)).toBeNull();
  });

  it("never offers the teacher a student's sign-out", () => {
    // The bug this function exists for. signOutStudent clears the STUDENT's
    // cookie for this slug, which is the thing `unlocked` reads — so the
    // control would have locked her out of Les fichiers and Le tableau.
    expect(authPanelMode("signed-in", true)).toBeNull();
  });

  it("leaves the two teacher-facing notices to the page", () => {
    // Both name the student, and that name must never reach a public page, so
    // the page renders them on a teacher-only branch rather than in the panel.
    expect(authPanelMode("unclaimed", true)).toBeNull();
    expect(authPanelMode("teacher-stale", true)).toBeNull();
  });

  it("shows the teacher no panel in any state whatsoever", () => {
    for (const gate of [
      "none",
      "signed-in",
      "unclaimed",
      "teacher-stale",
      "signup",
      "login",
    ] as const) {
      expect(authPanelMode(gate, true)).toBeNull();
    }
  });
});
