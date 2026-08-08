// Keys, not sentences. lib/page-section-labels.ts sets that precedent: the
// site renders French or English by Accept-Language, and the counts need
// real plurals, so the dictionary (lib/strings.ts) owns the words and this
// module owns only the order.
export type SummaryKey =
  | "unreadMessages"
  | "toCorrect"
  | "started"
  | "notOpened"
  | "newFlashcards"
  | "newFiles"
  | "itemsDone";

export type SummaryCounts = Record<SummaryKey, number>;

export type SummaryBullet = { key: SummaryKey; count: number };

// Most-owed first, and the order is the rule this module exists to hold.
//
// Unread messages outrank homework because a message can say "I could not
// open it" — a broken upload is more urgent than a normal one waiting on a
// mark. The three homework states outrank the two activity counts and
// itemsDone because they are work Jenn owes back, and among themselves they
// escalate: something to correct is closer to done than something merely
// started, which is closer than something never opened at all. The last
// three are news about the student's own activity, not debt of Jenn's.
const ORDER: readonly SummaryKey[] = [
  "unreadMessages",
  "toCorrect",
  "started",
  "notOpened",
  "newFlashcards",
  "newFiles",
  "itemsDone",
];

// No cap, deliberately. The seven counts are disjoint and rarely exceed
// three at once; a silent "+2 more" would hide exactly the item that was
// worth surfacing on a student's row.
export function summaryBullets(counts: SummaryCounts): SummaryBullet[] {
  return ORDER.map((key) => ({ key, count: counts[key] })).filter(
    (bullet) => bullet.count > 0,
  );
}
