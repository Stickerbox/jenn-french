// Whether a student may open the card for `date`.
//
// Two conditions, and the second is NOT redundant with the query that produced
// `cardDates`. That query is already bounded to `latest` so the dates of
// pre-posted cards never reach the browser — but the calendar can page into a
// month the query said nothing about, and a cell there must be dead rather
// than merely absent from the list.
export function isSelectableCardDate(
  date: string,
  input: { cardDates: ReadonlySet<string>; latest: string },
): boolean {
  // ISO-8601 dates compare correctly as strings, so this needs no Date round
  // trip — and therefore cannot pick up a timezone on the way through one.
  if (date > input.latest) return false;

  return input.cardDates.has(date);
}
