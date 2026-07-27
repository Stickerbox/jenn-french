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
