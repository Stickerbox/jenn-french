// How a deck is ordered. Three answers, and only one of them is arithmetic —
// the other two are rules about what a reader is trying to do.

export type FlashcardSort = "added" | "random" | "revision";

type Row = { createdAt: Date; lastViewedAt: Date | null };

// A tiny deterministic generator (mulberry32), so a seed produces the same
// order every time it is asked.
//
// Math.random() would be wrong here twice over. The shelf is a client
// component fed server-rendered data, so an unseeded shuffle differs across
// hydration — the same class of fault FilesTab's `today` prop already avoids
// by being passed in rather than read as `new Date()`. And the deck re-renders
// as the reader flips and pages, so an order that was recomputed each time
// would move under them mid-read.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Fisher-Yates, drawing from the seeded generator. On a copy: every branch here
// returns a new array, so a caller can pass the same list to two sorts without
// the first rearranging it.
function shuffle<T>(items: T[], seed: number): T[] {
  const next = mulberry32(seed);
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Ties break on the cards' ORIGINAL array position rather than on engine sort
// stability — that guarantee is easy to lose without noticing, and this list
// has a real way to produce a tie: two cards added in the same second.
// sortPages records the same decision for the same reason.
//
// `||` and not `!== 0`, which is what sortPages uses for the same decision.
// The two are not interchangeable: `||` also absorbs a NaN comparator result
// and falls through to the index, so a corrupt timestamp degrades to
// insertion order instead of handing .sort() an undefined comparison. Do not
// "harmonise" this with sortPages.
function byIndex<T>(rows: T[], compare: (a: T, b: T) => number): T[] {
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => compare(a.row, b.row) || a.index - b.index)
    .map(({ row }) => row);
}

export function orderFlashcards<T extends Row>(
  cards: T[],
  sort: FlashcardSort,
  // Held in client state and regenerated only when Random is chosen. Taken as
  // an argument rather than made here so this module stays pure and testable.
  seed: number,
): T[] {
  if (sort === "random") return shuffle(cards, seed);

  if (sort === "revision") {
    // A card never opened needs revision MORE than one opened a month ago, so
    // nulls lead. Written as an explicit branch rather than by coercing null
    // through the date comparison: a null that became 0 would sort as 1970 and
    // happen to be right, and a null that became NaN would sort unpredictably
    // and be wrong — and neither says which was intended.
    return byIndex(cards, (a, b) => {
      if (a.lastViewedAt === null && b.lastViewedAt === null) return 0;
      if (a.lastViewedAt === null) return -1;
      if (b.lastViewedAt === null) return 1;
      return a.lastViewedAt.getTime() - b.lastViewedAt.getTime();
    });
  }

  return byIndex(cards, (a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}
