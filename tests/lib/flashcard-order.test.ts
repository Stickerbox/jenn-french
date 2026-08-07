import { describe, it, expect } from "vitest";
import { orderFlashcards, type FlashcardSort } from "@/lib/flashcard-order";

const at = (iso: string) => new Date(`${iso}T00:00:00Z`);

// Deliberately NOT in creation order, so a test that passes by accident of
// input order fails here.
const cards = [
  { id: "a", createdAt: at("2026-06-01"), lastViewedAt: at("2026-06-10") },
  { id: "b", createdAt: at("2026-06-03"), lastViewedAt: null },
  { id: "c", createdAt: at("2026-06-02"), lastViewedAt: at("2026-06-05") },
  { id: "d", createdAt: at("2026-06-05"), lastViewedAt: null },
  { id: "e", createdAt: at("2026-06-04"), lastViewedAt: at("2026-06-20") },
];

const ids = (rows: { id: string }[]) => rows.map((row) => row.id);

describe("added", () => {
  it("puts the newest first", () => {
    expect(ids(orderFlashcards(cards, "added", 1))).toEqual([
      "d",
      "e",
      "b",
      "c",
      "a",
    ]);
  });

  it("breaks ties on the original position", () => {
    // Two cards written by the same import in the same millisecond. Left to
    // engine sort stability this is a guarantee that is easy to lose without
    // noticing — the same reason sortPages pins it.
    const tied = [
      { id: "first", createdAt: at("2026-06-01"), lastViewedAt: null },
      { id: "second", createdAt: at("2026-06-01"), lastViewedAt: null },
    ];
    expect(ids(orderFlashcards(tied, "added", 1))).toEqual(["first", "second"]);
  });
});

describe("revision", () => {
  it("puts never-viewed cards first, then the longest unseen", () => {
    // b and d have never been opened, so they lead in their original order.
    // Then c (5 June) before a (10 June) before e (20 June).
    expect(ids(orderFlashcards(cards, "revision", 1))).toEqual([
      "b",
      "d",
      "c",
      "a",
      "e",
    ]);
  });

  it("treats a null as needing revision most, not least", () => {
    // The trap: a null coerced through a date comparison sorts as either the
    // oldest or the newest possible moment depending on how it is written, and
    // one of those silently buries every card nobody has opened.
    const rows = [
      { id: "seen-long-ago", createdAt: at("2026-01-01"), lastViewedAt: at("2020-01-01") },
      { id: "never-seen", createdAt: at("2026-01-01"), lastViewedAt: null },
    ];
    expect(ids(orderFlashcards(rows, "revision", 1))).toEqual([
      "never-seen",
      "seen-long-ago",
    ]);
  });
});

describe("random", () => {
  it("is stable for one seed", () => {
    // The shelf re-renders as the reader flips and pages. A shuffle that moved
    // under them on every render would be unusable, and would also differ
    // across hydration.
    expect(ids(orderFlashcards(cards, "random", 1))).toEqual(
      ids(orderFlashcards(cards, "random", 1)),
    );
  });

  it("produces a known order for a known seed", () => {
    expect(ids(orderFlashcards(cards, "random", 1))).toEqual([
      "e",
      "c",
      "b",
      "a",
      "d",
    ]);
  });

  it("produces a different order for a different seed", () => {
    expect(ids(orderFlashcards(cards, "random", 2))).toEqual([
      "c",
      "e",
      "a",
      "b",
      "d",
    ]);
  });

  it("keeps every card", () => {
    expect(ids(orderFlashcards(cards, "random", 7)).sort()).toEqual([
      "a",
      "b",
      "c",
      "d",
      "e",
    ]);
  });
});

describe("every sort", () => {
  it("returns a new array and leaves the input alone", () => {
    const before = ids(cards);
    for (const sort of ["added", "random", "revision"] as FlashcardSort[]) {
      const result = orderFlashcards(cards, sort, 3);
      expect(result).not.toBe(cards);
      expect(ids(cards)).toEqual(before);
    }
  });

  it("answers an empty deck with an empty list", () => {
    for (const sort of ["added", "random", "revision"] as FlashcardSort[]) {
      expect(orderFlashcards([], sort, 1)).toEqual([]);
    }
  });

  it("degrades to insertion order rather than scrambling on a corrupt date", () => {
    // Prisma cannot produce an Invalid Date from a DATETIME column, so this is
    // not reachable today — it is pinned because byIndex's `||` is what makes
    // it safe, and a future tidy-up toward sortPages' `!== 0` would silently
    // remove that.
    const corrupt = [
      { id: "a", createdAt: new Date("2026-06-01T00:00:00Z"), lastViewedAt: new Date("nonsense") },
      { id: "b", createdAt: new Date("2026-06-02T00:00:00Z"), lastViewedAt: new Date("2026-06-02T00:00:00Z") },
    ];
    expect(orderFlashcards(corrupt, "revision", 1).map((row) => row.id)).toEqual([
      "a",
      "b",
    ]);
  });
});
