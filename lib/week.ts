import type { Locale } from "@/lib/i18n";

// Left exported under its original name for monthNamesFor's English branch
// below and for the one test that pins its casing. Task H2 (2026-08-06)
// converted every direct importer in components/admin/** to monthNamesFor
// instead — this array itself is no longer imported anywhere but here.
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

// The French counterpart, same ALL-CAPS convention. Added once the student
// page's week-range button and the calendar behind it began following the
// visitor's locale instead of borrowing MONTHS — English — to visually match
// a trigger that had no other reason to be English either. See the comment
// CardDateNav used to carry, replaced along with the code it explained.
const MONTHS_FR = [
  "JANVIER",
  "FÉVRIER",
  "MARS",
  "AVRIL",
  "MAI",
  "JUIN",
  "JUILLET",
  "AOÛT",
  "SEPTEMBRE",
  "OCTOBRE",
  "NOVEMBRE",
  "DÉCEMBRE",
];

export function monthNamesFor(locale: Locale): readonly string[] {
  return locale === "fr" ? MONTHS_FR : MONTHS;
}

// Full weekday names, Monday to Friday — kept as full names rather than
// initials in BOTH languages, for the reason CardDateNav's comment used to
// give only for French: React needs a distinct key per column, and the day
// strip renders one button per weekday. The reason holds in English too —
// Tuesday and Thursday share a first letter — just not for the same pair, so a
// stored "letter" per language would be one more table to keep in step.
// Callers derive the initial from the first character instead.
const WEEKDAYS_FR = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi"];
const WEEKDAYS_EN = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

export function weekdayNamesFor(locale: Locale): readonly string[] {
  return locale === "fr" ? WEEKDAYS_FR : WEEKDAYS_EN;
}

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

// locale has no default: its one caller (CardDateNav) always has one to hand,
// and a default would let a future call site silently render English.
export function formatWeekRange(start: Date, end: Date, locale: Locale): string {
  const months = monthNamesFor(locale);
  const from = `${months[start.getUTCMonth()]} ${start.getUTCDate()}`;
  const to = `${months[end.getUTCMonth()]} ${end.getUTCDate()}`;

  // A week straddling New Year needs both years or the range reads as though
  // it runs backwards.
  if (start.getUTCFullYear() !== end.getUTCFullYear()) {
    return `${from}, ${start.getUTCFullYear()} → ${to}, ${end.getUTCFullYear()}`;
  }

  return `${from} → ${to}, ${end.getUTCFullYear()}`;
}
