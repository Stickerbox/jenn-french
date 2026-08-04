import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/password-hash";

// Cost 4, not the production 12: a cost-12 hash is roughly 300ms and this file
// wants several. The cost is a parameter for exactly this reason.
const TEST_COST = 4;

describe("password hashing", () => {
  it("verifies a password against its own hash", async () => {
    const hash = await hashPassword("bonjour-québec", TEST_COST);
    await expect(verifyPassword("bonjour-québec", hash)).resolves.toBe(true);
  });

  it("rejects a wrong password", async () => {
    const hash = await hashPassword("bonjour-québec", TEST_COST);
    await expect(verifyPassword("bonjour-quebec", hash)).resolves.toBe(false);
  });

  it("salts, so the same password hashes differently every time", async () => {
    const first = await hashPassword("bonjour-québec", TEST_COST);
    const second = await hashPassword("bonjour-québec", TEST_COST);
    expect(first).not.toBe(second);
    await expect(verifyPassword("bonjour-québec", second)).resolves.toBe(true);
  });

  it("produces a recognisable bcrypt string", async () => {
    const hash = await hashPassword("bonjour-québec", TEST_COST);
    expect(hash).toMatch(/^\$2[aby]\$/);
  });

  it("truncates past 72 bytes — which is why checkPassword rejects longer input", async () => {
    // Pinned here so nobody "cleans up" MAX_PASSWORD_BYTES without seeing what
    // it defends: two different passwords sharing a 72-byte prefix verify
    // against the same hash.
    const prefix = "a".repeat(72);
    const hash = await hashPassword(`${prefix}ONE`, TEST_COST);
    await expect(verifyPassword(`${prefix}TWO`, hash)).resolves.toBe(true);
  });
});
