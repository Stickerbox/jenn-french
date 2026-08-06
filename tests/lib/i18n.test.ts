import { describe, it, expect } from "vitest";
import { pickLocale, toBCP47, DEFAULT_LOCALE } from "@/lib/i18n";

describe("pickLocale", () => {
  it("defaults to French — the fallback for this French tutor's site", () => {
    expect(DEFAULT_LOCALE).toBe("fr");
  });

  it("falls back to French for a missing header", () => {
    expect(pickLocale(null)).toBe("fr");
  });

  it("falls back to French for an empty header", () => {
    expect(pickLocale("")).toBe("fr");
  });

  it("picks English for a bare 'en'", () => {
    expect(pickLocale("en")).toBe("en");
  });

  it("picks French for a bare 'fr'", () => {
    expect(pickLocale("fr")).toBe("fr");
  });

  it("picks English when only a regional English tag is present", () => {
    expect(pickLocale("en-CA,en;q=0.9")).toBe("en");
  });

  it("picks French when it dominates a mixed header", () => {
    expect(pickLocale("fr-CA,fr;q=0.9,en;q=0.8")).toBe("fr");
  });

  it("lets French win on q even though it comes second in the header", () => {
    expect(pickLocale("en;q=0.8,fr;q=0.9")).toBe("fr");
  });

  it("does not read a bare wildcard as a vote for English", () => {
    expect(pickLocale("*")).toBe("fr");
  });

  it("falls back to French when neither language is named", () => {
    expect(pickLocale("de,es")).toBe("fr");
  });

  it("discards a malformed q-value rather than defaulting it to full strength", () => {
    // A naive parser reads "q=banana" as NaN, then treats a failed
    // Number.parseFloat as "no q supplied" and defaults to 1 — which would
    // silently make English win. The entry must be dropped instead.
    expect(pickLocale("en;q=banana")).toBe("fr");
  });

  it("discards a q-value outside 0–1 the same way", () => {
    expect(pickLocale("en;q=1.5")).toBe("fr");
  });

  it("is case-insensitive", () => {
    expect(pickLocale("EN-CA")).toBe("en");
  });

  it("ignores a French entry that also carries a malformed q, correctly", () => {
    // Both entries are dropped, so neither language is present — the default.
    expect(pickLocale("en;q=banana,fr;q=banana")).toBe("fr");
  });
});

describe("toBCP47", () => {
  it("maps fr to fr-CA", () => {
    expect(toBCP47("fr")).toBe("fr-CA");
  });

  it("maps en to en-CA", () => {
    expect(toBCP47("en")).toBe("en-CA");
  });
});
