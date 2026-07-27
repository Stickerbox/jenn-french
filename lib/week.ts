const MONTHS = [
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

// The teaching week runs Monday to Saturday, matching the six days the
// WeekDayPicker offers. Sunday belongs to the week that has just ended, not
// the one about to start.
export function weekRange(date: Date): { start: Date; end: Date } {
  const dayOfWeek = date.getUTCDay(); // 0 = Sunday
  const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

  const start = new Date(date);
  start.setUTCDate(start.getUTCDate() - daysSinceMonday);

  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 5); // Monday + 5 = Saturday

  return { start, end };
}

// The latest day a student may look at. Normally today — but Sunday is not a
// teaching day and has no dot in the picker, so the page opens on the Saturday
// that closed the week rather than on a blank day. This doubles as the ceiling
// for an explicit ?date=, so a future date clamps to something that has a card
// rather than to an empty Sunday.
export function latestViewableDate(today: Date): Date {
  if (today.getUTCDay() !== 0) return today;
  const saturday = new Date(today);
  saturday.setUTCDate(saturday.getUTCDate() - 1);
  return saturday;
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
