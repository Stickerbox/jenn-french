export const MONTHS = [
  "JANUARY",
  "FEBRUARY",
  "MARCH",
  "APRIL",
  "MAY",
  "JUNE",
  "JULY",
  "AUGUST",
  "SEPTEMBER",
  "OCTOBER",
  "NOVEMBER",
  "DECEMBER",
];

// The teaching week runs Monday to Friday, matching the five days the
// WeekDayPicker offers. Saturday and Sunday belong to the week that has just
// ended, not the one about to start.
export function weekRange(date: Date): { start: Date; end: Date } {
  const dayOfWeek = date.getUTCDay(); // 0 = Sunday
  const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

  const start = new Date(date);
  start.setUTCDate(start.getUTCDate() - daysSinceMonday);

  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 4); // Monday + 4 = Friday

  return { start, end };
}

// The latest day a student may look at. Normally today — but neither weekend
// day is a teaching day and neither has a dot in the picker, so the page opens
// on the Friday that closed the week rather than on a blank day. This doubles
// as the ceiling for an explicit ?date=, which is also what keeps a Saturday
// card left behind by an earlier six-day week out of reach.
export function latestViewableDate(today: Date): Date {
  const dayOfWeek = today.getUTCDay(); // 0 = Sunday, 6 = Saturday
  if (dayOfWeek !== 0 && dayOfWeek !== 6) return today;

  const friday = new Date(today);
  friday.setUTCDate(friday.getUTCDate() - (dayOfWeek === 0 ? 2 : 1));
  return friday;
}

export function formatWeekRange(start: Date, end: Date): string {
  const from = `${MONTHS[start.getUTCMonth()]} ${start.getUTCDate()}`;
  const to = `${MONTHS[end.getUTCMonth()]} ${end.getUTCDate()}`;

  // A week straddling New Year needs both years or the range reads as though
  // it runs backwards.
  if (start.getUTCFullYear() !== end.getUTCFullYear()) {
    return `${from}, ${start.getUTCFullYear()} → ${to}, ${end.getUTCFullYear()}`;
  }

  return `${from} → ${to}, ${end.getUTCFullYear()}`;
}
