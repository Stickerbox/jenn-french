import { describe, expect, it } from "vitest";
import { credentialProblemLabel } from "@/lib/student-auth-labels";
import { getStrings } from "@/lib/strings";
import {
  MIN_PASSWORD_LENGTH,
  type CredentialProblem,
} from "@/lib/student-credentials";

const PROBLEMS: CredentialProblem[] = ["bad-email", "too-short", "too-long"];

describe("credentialProblemLabel", () => {
  it("gives a distinct, non-empty sentence for every problem, in French", () => {
    const strings = getStrings("fr");
    const sentences = PROBLEMS.map((p) => credentialProblemLabel(p, strings));
    expect(new Set(sentences).size).toBe(PROBLEMS.length);
    for (const sentence of sentences) {
      expect(sentence.length).toBeGreaterThan(0);
      expect(sentence.endsWith(".")).toBe(true);
    }
  });

  it("gives a distinct, non-empty sentence for every problem, in English", () => {
    const strings = getStrings("en");
    const sentences = PROBLEMS.map((p) => credentialProblemLabel(p, strings));
    expect(new Set(sentences).size).toBe(PROBLEMS.length);
    for (const sentence of sentences) {
      expect(sentence.length).toBeGreaterThan(0);
      expect(sentence.endsWith(".")).toBe(true);
    }
  });

  it("names the minimum it actually enforces, rather than a hardcoded number, in either language", () => {
    expect(
      credentialProblemLabel("too-short", getStrings("fr")),
    ).toContain(String(MIN_PASSWORD_LENGTH));
    expect(
      credentialProblemLabel("too-short", getStrings("en")),
    ).toContain(String(MIN_PASSWORD_LENGTH));
  });
});

describe("the failure messages", () => {
  it("names both halves of the sign-in, so it cannot reveal which was wrong — French", () => {
    const { signInFailed } = getStrings("fr").student.auth;
    expect(signInFailed).toContain("courriel");
    expect(signInFailed).toContain("mot de passe");
  });

  it("names both halves of the sign-in, so it cannot reveal which was wrong — English", () => {
    const { signInFailed } = getStrings("en").student.auth;
    expect(signInFailed.toLowerCase()).toContain("email");
    expect(signInFailed.toLowerCase()).toContain("password");
  });

  it("points a locked-out or stranded student at Jenn, who is the only recovery, in both languages", () => {
    for (const locale of ["fr", "en"] as const) {
      const auth = getStrings(locale).student.auth;
      expect(auth.tooManyTries).toContain("Jenn");
      expect(auth.inviteUsed).toContain("Jenn");
    }
  });

  it("keeps every message free of internal detail, in both languages", () => {
    for (const locale of ["fr", "en"] as const) {
      const auth = getStrings(locale).student.auth;
      for (const message of [
        auth.signInFailed,
        auth.tooManyTries,
        auth.inviteUsed,
        auth.genericFailure,
      ]) {
        expect(message).not.toMatch(/error|invalid|unauthorized|prisma/i);
      }
    }
  });
});
