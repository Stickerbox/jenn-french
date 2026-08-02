import { describe, it, expect } from "vitest";
import { pageVersion } from "@/lib/page-version";

describe("pageVersion", () => {
  it("is stable for the same instant", () => {
    const a = pageVersion(new Date("2026-08-02T10:00:00Z"));
    const b = pageVersion(new Date("2026-08-02T10:00:00Z"));
    expect(a).toBe(b);
  });

  it("changes when the page is edited", () => {
    const before = pageVersion(new Date("2026-08-02T10:00:00Z"));
    const after = pageVersion(new Date("2026-08-02T10:00:01Z"));
    expect(after).not.toBe(before);
  });

  it("is short and URL-safe", () => {
    const token = pageVersion(new Date("2026-08-02T10:00:00Z"));
    expect(token).toMatch(/^[a-z0-9]+$/);
    expect(token.length).toBeLessThan(12);
  });

  // A malformed Date must not produce the string "NaN" and then MATCH another
  // malformed one, which would hand a caller an immutable header keyed to
  // nothing at all.
  it("refuses an invalid date rather than tokenising it", () => {
    expect(pageVersion(new Date("nonsense"))).toBe("");
  });
});
