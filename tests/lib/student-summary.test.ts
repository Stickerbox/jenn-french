import { describe, expect, it } from "vitest";
import { summaryBullets, type SummaryCounts } from "@/lib/student-summary";

const none: SummaryCounts = {
  unreadMessages: 0,
  toCorrect: 0,
  started: 0,
  notOpened: 0,
  newFlashcards: 0,
  newFiles: 0,
  itemsDone: 0,
};

describe("summaryBullets", () => {
  it("returns nothing for a quiet student", () => {
    expect(summaryBullets(none)).toEqual([]);
  });

  it("drops a zero count rather than drawing it", () => {
    expect(summaryBullets({ ...none, newFiles: 2 })).toEqual([
      { key: "newFiles", count: 2 },
    ]);
  });

  it("orders most-owed first, regardless of the input order", () => {
    // Unread outranks homework because a message can say "I could not open
    // it"; homework outranks the activity counts because it is work Jenn owes
    // back.
    const bullets = summaryBullets({
      ...none,
      itemsDone: 1,
      newFlashcards: 3,
      toCorrect: 2,
      unreadMessages: 4,
    });
    expect(bullets.map((b) => b.key)).toEqual([
      "unreadMessages",
      "toCorrect",
      "newFlashcards",
      "itemsDone",
    ]);
  });

  it("keeps the three homework bullets in escalating order", () => {
    const bullets = summaryBullets({
      ...none,
      notOpened: 1,
      started: 1,
      toCorrect: 1,
    });
    expect(bullets.map((b) => b.key)).toEqual([
      "toCorrect",
      "started",
      "notOpened",
    ]);
  });

  it("does not cap the list", () => {
    // The seven are disjoint and rarely exceed three. A silent "+2 more" would
    // hide exactly the item that was worth surfacing.
    const bullets = summaryBullets({
      unreadMessages: 1,
      toCorrect: 1,
      started: 1,
      notOpened: 1,
      newFlashcards: 1,
      newFiles: 1,
      itemsDone: 1,
    });
    expect(bullets).toHaveLength(7);
  });
});
