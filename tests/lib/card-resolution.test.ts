import { describe, it, expect } from "vitest";
import {
  pickEffectiveCard,
  mergeArchiveDates,
  type CardContent,
} from "@/lib/card-resolution";

function makeCard(date: string, subject: string): CardContent {
  return {
    date: new Date(date),
    subject,
    usage: null,
    englishPrompt: "prompt",
    hint: null,
    frenchAnswer: "answer",
    sections: [],
  };
}

describe("pickEffectiveCard", () => {
  it("returns the global card when there is no override", () => {
    const global = makeCard("2026-07-20", "imparfait");
    expect(pickEffectiveCard(null, global)).toBe(global);
  });

  it("returns the override when there is no global card", () => {
    const override = makeCard("2026-07-20", "passé composé");
    expect(pickEffectiveCard(override, null)).toBe(override);
  });

  it("returns null when neither exists", () => {
    expect(pickEffectiveCard(null, null)).toBeNull();
  });

  it("prefers whichever of the two has the later date", () => {
    const olderOverride = makeCard("2026-07-15", "passé composé");
    const newerGlobal = makeCard("2026-07-20", "imparfait");
    expect(pickEffectiveCard(olderOverride, newerGlobal)).toBe(newerGlobal);

    const newerOverride = makeCard("2026-07-22", "passé composé");
    const olderGlobal = makeCard("2026-07-20", "imparfait");
    expect(pickEffectiveCard(newerOverride, olderGlobal)).toBe(newerOverride);
  });

  it("prefers the override when dates are exactly equal", () => {
    const override = makeCard("2026-07-20", "passé composé");
    const global = makeCard("2026-07-20", "imparfait");
    expect(pickEffectiveCard(override, global)).toBe(override);
  });
});

describe("mergeArchiveDates", () => {
  it("returns dates sorted most-recent first", () => {
    const result = mergeArchiveDates(
      [new Date("2026-07-15")],
      [new Date("2026-07-20"), new Date("2026-07-10")],
    );
    expect(result.map((d) => d.toISOString().slice(0, 10))).toEqual([
      "2026-07-20",
      "2026-07-15",
      "2026-07-10",
    ]);
  });

  it("dedupes when an override and a global card share the same day", () => {
    const result = mergeArchiveDates(
      [new Date("2026-07-20T00:00:00Z")],
      [new Date("2026-07-20T00:00:00Z")],
    );
    expect(result).toHaveLength(1);
  });

  it("returns an empty array when given no dates", () => {
    expect(mergeArchiveDates([], [])).toEqual([]);
  });
});
