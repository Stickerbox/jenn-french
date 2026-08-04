import { describe, expect, it } from "vitest";
import {
  credentialProblemLabel,
  SIGN_IN_FAILED,
  TOO_MANY_TRIES,
  INVITE_USED,
  GENERIC_FAILURE,
} from "@/lib/student-auth-labels";
import {
  MIN_PASSWORD_LENGTH,
  type CredentialProblem,
} from "@/lib/student-credentials";

const PROBLEMS: CredentialProblem[] = ["bad-email", "too-short", "too-long"];

describe("credentialProblemLabel", () => {
  it("gives a distinct, non-empty sentence for every problem", () => {
    const sentences = PROBLEMS.map(credentialProblemLabel);
    expect(new Set(sentences).size).toBe(PROBLEMS.length);
    for (const sentence of sentences) {
      expect(sentence.length).toBeGreaterThan(0);
      expect(sentence.endsWith(".")).toBe(true);
    }
  });

  it("names the minimum it actually enforces, rather than a hardcoded number", () => {
    expect(credentialProblemLabel("too-short")).toContain(
      String(MIN_PASSWORD_LENGTH),
    );
  });
});

describe("the failure messages", () => {
  it("names both halves of the sign-in, so it cannot reveal which was wrong", () => {
    expect(SIGN_IN_FAILED).toContain("courriel");
    expect(SIGN_IN_FAILED).toContain("mot de passe");
  });

  it("points a locked-out or stranded student at Jenn, who is the only recovery", () => {
    expect(TOO_MANY_TRIES).toContain("Jenn");
    expect(INVITE_USED).toContain("Jenn");
  });

  it("keeps every message French and free of internal detail", () => {
    for (const message of [
      SIGN_IN_FAILED,
      TOO_MANY_TRIES,
      INVITE_USED,
      GENERIC_FAILURE,
    ]) {
      expect(message).not.toMatch(/error|invalid|unauthorized|prisma/i);
    }
  });
});
