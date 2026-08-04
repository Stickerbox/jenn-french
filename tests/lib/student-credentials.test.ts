import { describe, expect, it } from "vitest";
import {
  checkPassword,
  normaliseEmail,
  MAX_PASSWORD_BYTES,
  MIN_PASSWORD_LENGTH,
} from "@/lib/student-credentials";

describe("normaliseEmail", () => {
  it("trims and lowercases", () => {
    expect(normaliseEmail("  Marie.Dupont@Example.COM ")).toBe(
      "marie.dupont@example.com",
    );
  });

  it("rejects blank input", () => {
    expect(normaliseEmail("   ")).toBeNull();
  });

  it("rejects an address with no dot in the domain", () => {
    expect(normaliseEmail("marie@example")).toBeNull();
  });

  it("rejects an address with no local part", () => {
    expect(normaliseEmail("@example.com")).toBeNull();
  });

  it("rejects internal whitespace", () => {
    expect(normaliseEmail("mar ie@example.com")).toBeNull();
  });

  it("rejects an address past 254 characters", () => {
    expect(normaliseEmail(`${"a".repeat(250)}@example.com`)).toBeNull();
  });

  it("accepts a plus-addressed mailbox", () => {
    expect(normaliseEmail("marie+francais@example.com")).toBe(
      "marie+francais@example.com",
    );
  });
});

describe("checkPassword", () => {
  it("accepts the minimum length", () => {
    expect(checkPassword("a".repeat(MIN_PASSWORD_LENGTH))).toBeNull();
  });

  it("rejects one character short", () => {
    expect(checkPassword("a".repeat(MIN_PASSWORD_LENGTH - 1))).toBe("too-short");
  });

  it("does not trim — spaces count toward the minimum", () => {
    expect(checkPassword("  abc   ")).toBeNull();
  });

  it("measures the maximum in bytes, not characters", () => {
    // 40 accented characters are 80 bytes in UTF-8 — past bcrypt's 72-byte
    // truncation point — even though `.length` is comfortably under it. A
    // `.length` check would let this through to be silently truncated.
    const accented = "é".repeat(40);
    expect(accented.length).toBeLessThan(MAX_PASSWORD_BYTES);
    expect(checkPassword(accented)).toBe("too-long");
  });

  it("accepts exactly the byte limit and rejects one past it", () => {
    expect(checkPassword("a".repeat(MAX_PASSWORD_BYTES))).toBeNull();
    expect(checkPassword("a".repeat(MAX_PASSWORD_BYTES + 1))).toBe("too-long");
  });
});
