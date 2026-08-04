import { localDayKey, formatTime } from "@/lib/chat-time";

export type DayHeadingLabels = { today: string };
export type ListStampLabels = { yesterday: string };

// A day key is a plain calendar label — "2026-07-28" — that localDayKey already
// resolved in the reader's zone. Reading it back through the reader's zone a
// second time would shift it by a day, so it is parsed and formatted in UTC.
// That looks like a violation of the local rule and is the opposite of one.
function formatDayKey(
  day: string,
  locale: string,
  options: Intl.DateTimeFormatOptions,
): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString(locale, {
    ...options,
    timeZone: "UTC",
  });
}

// Steps a calendar key back one day in UTC space, where there is no daylight
// saving to trip over. Subtracting 86_400_000 milliseconds from the instant
// would be wrong on the two days a year a clock moves.
function previousDayKey(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

// "Today", or the date. Deliberately no "Yesterday": a heading is read in
// place, where the date says more than the word does.
export function dayHeading(
  day: string,
  todayKey: string,
  labels: DayHeadingLabels,
  locale: string,
): string {
  if (day === todayKey) return labels.today;
  return formatDayKey(day, locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// The conversation list's compact stamp. This one DOES have a "Yesterday",
// because the list is scanned rather than read, and a bare "Jul 28" on
// something eight hours old reads as older than it is.
export function listStamp(
  date: Date,
  now: Date,
  locale: string,
  labels: ListStampLabels,
  timeZone?: string,
): string {
  const day = localDayKey(date, timeZone);
  const today = localDayKey(now, timeZone);

  if (day === today) return formatTime(date, locale, timeZone);
  if (day === previousDayKey(today)) return labels.yesterday;

  return formatDayKey(day, locale, { day: "numeric", month: "short" });
}
