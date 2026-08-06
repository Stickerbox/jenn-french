import { describe, it, expect } from "vitest";
import {
  studentSlugFromCookies,
  wantsLanding,
  STAY_VALUE,
} from "@/lib/landing-redirect";

describe("studentSlugFromCookies", () => {
  it("returns the slug of the one student cookie present", () => {
    expect(
      studentSlugFromCookies(["teacherId", "student-token-marie"]),
    ).toBe("marie");
  });

  it("ignores unrelated cookies and returns null when no student cookie is present", () => {
    expect(
      studentSlugFromCookies(["teacherId", "webauthn-challenge"]),
    ).toBeNull();
  });

  it("returns null for an empty jar", () => {
    expect(studentSlugFromCookies([])).toBeNull();
  });

  it("takes the first match without looking for a second", () => {
    // One student means one cookie in practice, but the function itself must
    // not assume it was called correctly — it just answers "first match".
    expect(
      studentSlugFromCookies(["student-token-marie", "student-token-luc"]),
    ).toBe("marie");
  });
});

describe("wantsLanding", () => {
  it("is true when the escape hatch value is present", () => {
    expect(wantsLanding(STAY_VALUE)).toBe(true);
  });

  it("is false when absent", () => {
    expect(wantsLanding(undefined)).toBe(false);
  });

  it("is false for any other value, including an array from a repeated param", () => {
    expect(wantsLanding("0")).toBe(false);
    expect(wantsLanding([STAY_VALUE, STAY_VALUE])).toBe(false);
  });
});
