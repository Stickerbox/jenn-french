import { describe, it, expect } from "vitest";
import { newToken, readToken, cookieNameFor } from "@/lib/student-tokens";

describe("newToken", () => {
  it("is 32 hex characters", () => {
    expect(newToken()).toMatch(/^[0-9a-f]{32}$/);
  });

  it("does not repeat", () => {
    const tokens = new Set(Array.from({ length: 50 }, () => newToken()));
    expect(tokens.size).toBe(50);
  });
});

describe("readToken", () => {
  it("returns null when neither source has one", () => {
    expect(readToken(undefined, undefined)).toBeNull();
  });

  it("reads the cookie when there is no query token", () => {
    expect(readToken(undefined, "cookievalue")).toBe("cookievalue");
  });

  it("reads the query token when there is no cookie", () => {
    expect(readToken("queryvalue", undefined)).toBe("queryvalue");
  });

  it("prefers the query token, so a reissued link overrides a stale cookie", () => {
    expect(readToken("fresh", "stale")).toBe("fresh");
  });

  it("treats an empty string as absent", () => {
    expect(readToken("", "cookievalue")).toBe("cookievalue");
    expect(readToken("", "")).toBeNull();
  });
});

describe("cookieNameFor", () => {
  it("names the cookie after the student", () => {
    expect(cookieNameFor("marie")).toBe("student-token-marie");
  });

  it("gives two students two different cookies", () => {
    expect(cookieNameFor("marie")).not.toBe(cookieNameFor("luc"));
  });
});
