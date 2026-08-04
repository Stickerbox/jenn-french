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

// The Monday of the week containing `date`. A Sunday counts back six days, not
// none: the teaching week runs Monday to Friday and a Sunday belongs to the
// week that has just ended, not the one about to start.
//
// Extracted because this arithmetic was written out three times — here, in the
// student page's day strip, and in lib/month-grid.ts — and each copy carried
// its own version of the sentence above. month-grid.ts keeps its copy: it steps
// over the weekend as it walks a whole month, which is a different job.
export function mondayOf(date: Date): Date {
  const dayOfWeek = date.getUTCDay(); // 0 = Sunday
  const monday = new Date(date);
  monday.setUTCDate(
    monday.getUTCDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1),
  );
  return monday;
}

// The five teaching days of the week containing `date`, Monday first.
//
// It takes any date rather than today, and that is the entire reason it exists:
// the student's day strip used to compute its five days from `today` and so
// could only ever show the week we are in.
export function weekDates(date: Date): Date[] {
  const monday = mondayOf(date);
  return Array.from({ length: 5 }, (_, index) => {
    const day = new Date(monday);
    day.setUTCDate(day.getUTCDate() + index);
    return day;
  });
}

// The teaching week runs Monday to Friday, matching the five days the student's
// day strip offers. Saturday and Sunday belong to the week that has just ended,
// not the one about to start.
export function weekRange(date: Date): { start: Date; end: Date } {
  const start = mondayOf(date);

  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 4); // Monday + 4 = Friday

  return { start, end };
}

// The latest day a student may look at. Normally today — but neither weekend
// day is a teaching day and neither has a dot in the picker, so the page opens
// on the Friday that closed the week rather than on a blank day. This doubles
// as the ceiling for an explicit ?date=, which during the deploy window is
// also what keeps the current week's not-yet-moved Saturday card out of
// reach — a past Saturday reached by an explicit ?date= still renders, since
// this clamps only the upper bound.
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
