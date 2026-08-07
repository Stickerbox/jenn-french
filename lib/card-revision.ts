// Which old card comes back on a day Jenn has not posted one.
//
// This reinstates a fallback that was REMOVED on 2026-07-31, and the
// difference is the whole reason it is allowed back. The old one resolved a
// missing date to an earlier card silently, so the page showed a card the
// calendar said did not exist — "it made the week picker lie", as CLAUDE.md
// puts it. This one is narrower on both counts: it applies only to the latest
// day a student may open (never to a past date they navigated to, so every
// disabled cell in the calendar stays honest), and what it returns is drawn
// with a *Révision* chip rather than dressed up as the day's new card.
//
// The other half is free and needs no code: the pick happens at read time, so
// the moment Jenn posts a card for that date the real row wins and the
// revision is gone.

// Teaching days strictly after `from`, up to and including `to`. Saturday and
// Sunday count for nothing, which is what keeps the cycle below from skipping
// two cards every weekend — a Friday-to-Monday gap is one teaching day, not
// three.
//
// A loop rather than a closed-form weekday count. The arithmetic for the
// latter is where off-by-one bugs live, and the distances here are days to
// weeks: this is called once per request, on a date range bounded by how long
// Jenn has gone without posting.
//
// Both arguments are ISO `YYYY-MM-DD`, and the walk is in UTC — every date in
// this project is UTC midnight (see lib/week.ts). Reading local days here
// would step over a different set of Saturdays for a reader in Sydney.
export function teachingDaysBetween(from: string, to: string): number {
  if (to <= from) return 0;

  const end = new Date(`${to}T00:00:00Z`);
  const cursor = new Date(`${from}T00:00:00Z`);
  let count = 0;

  while (cursor < end) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    const day = cursor.getUTCDay();
    // 0 is Sunday and 6 is Saturday, the rule mondayOf already encodes: both
    // weekend days belong to the week that just ended and neither is a
    // teaching day.
    if (day !== 0 && day !== 6) count += 1;
  }

  return count;
}

// The card to revise on `forDate`, or null when there is nothing behind it.
//
// OLDEST FIRST, CYCLING. The index walks the archive from its oldest entry
// forward, one step per teaching day since the newest card, so every card
// comes round again before any of them repeats. A "most recent card" rule
// would show the same one every day of a long gap and never bring older
// material back, which is the opposite of what revision is for.
//
// STABLE, which is why the step is derived from the date rather than drawn at
// random. A random pick would hand the reader a different card on every
// reload — and on the server it would differ between the render and any later
// one, so the page would appear to lose its place on its own.
//
// Only cards STRICTLY BEFORE `forDate` are eligible. `listCardDates` is
// already bounded to the latest viewable day, but this must not depend on its
// caller having done that: surfacing a pre-posted card as revision would let a
// student read ahead through the one door the whole date-clamping design
// exists to close.
export function pickRevisionDate(
  cardDates: readonly string[],
  forDate: string,
): string | null {
  // Sorted here rather than trusted from the caller: listCardDates returns
  // newest-first for the calendar's benefit, and this walks the other way.
  // ISO-8601 dates compare correctly as strings, so no Date round trip — and
  // therefore no timezone picked up on the way through one.
  const past = cardDates.filter((date) => date < forDate).sort();
  if (past.length === 0) return null;

  const newest = past[past.length - 1];
  // At least one, because `forDate` is after `newest` on the calendar even
  // when no teaching day separates them — a Friday card and a Saturday
  // request, which latestViewableDate makes rare rather than impossible.
  // Without the floor the index would be -1 and the lookup undefined.
  const elapsed = Math.max(1, teachingDaysBetween(newest, forDate));

  return past[(elapsed - 1) % past.length];
}
