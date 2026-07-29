const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// Removing Saturday from the teaching week moves content rather than deleting
// it: cards keep their order and refill consecutive Monday-Friday slots. The
// drift is not constant — it grows by a day for every Saturday crossed, so
// week one shifts by 0-1 days, week two by 1-2, week three by 2-3.
//
// The mapping indexes the old calendar as six teaching days per week and the
// new one as five, then maps position to position. `anchor` must be a Monday
// at UTC midnight: the week index below is `floor(days / 7)`, which is only a
// week number because the count starts on a Monday.
export function shiftToFiveDayWeek(date: Date, anchor: Date): Date {
  // Checked first, so the negative week index a pre-anchor date would produce
  // never arises.
  if (date.getTime() < anchor.getTime()) return new Date(date);

  const dayOfWeek = date.getUTCDay(); // 0 = Sunday
  // Sunday has no slot in a Monday-Saturday week, so there is no honest answer
  // here. A Sunday card is a data anomaly for a human to resolve, not
  // something to round in one direction and hope.
  if (dayOfWeek === 0) {
    throw new Error(
      `No five-day slot for Sunday ${date.toISOString().slice(0, 10)}`,
    );
  }

  const weeks = Math.floor((date.getTime() - anchor.getTime()) / WEEK_MS);
  const oldSlot = weeks * 6 + (dayOfWeek - 1); // Monday = 0 ... Saturday = 5

  const shifted = new Date(anchor);
  shifted.setUTCDate(
    shifted.getUTCDate() + Math.floor(oldSlot / 5) * 7 + (oldSlot % 5),
  );
  return shifted;
}
