import { toBCP47, type Locale } from "@/lib/i18n";

export type NamedBoard = {
  id: string;
  date: Date;
  createdAt: Date;
};

// Built per call rather than once at module scope, because the locale is per
// request. Two formatters cached in a Map would be the optimisation, and it is
// not worth it: this runs once per render of one tab.
//
// timeZone: "UTC" like every other date in this codebase. Without it a board
// stamped at UTC midnight renders as the previous day for anyone west of
// Greenwich, which is everyone using this site.
function dayFormatFor(locale: Locale) {
  return new Intl.DateTimeFormat(toBCP47(locale), {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

const dayKey = (date: Date) => date.toISOString().slice(0, 10);

// Takes the whole set rather than one board, because "disambiguate only when
// ambiguous" cannot be decided from a single row — and a per-board format call
// would inevitably regress into either always suffixing or never doing it.
//
// The locale is OPTIONAL and defaults to French, which is this site's fallback
// everywhere else too — see lib/i18n.ts. That default is also what keeps every
// existing test calling this with one argument.
export function boardLabels(
  boards: NamedBoard[],
  locale: Locale = "fr",
): Map<string, string> {
  const byDay = new Map<string, NamedBoard[]>();
  for (const board of boards) {
    const key = dayKey(board.date);
    const day = byDay.get(key);
    if (day) day.push(board);
    else byDay.set(key, [board]);
  }

  const labels = new Map<string, string>();

  const dayFormat = dayFormatFor(locale);

  for (const day of byDay.values()) {
    // Oldest first, so the counter reads as the order she drew them. The id
    // tiebreak keeps labels unique when two boards share a timestamp.
    const ordered = [...day].sort(
      (a, b) =>
        a.createdAt.getTime() - b.createdAt.getTime() ||
        a.id.localeCompare(b.id),
    );

    ordered.forEach((board, index) => {
      const name = dayFormat.format(board.date);
      labels.set(board.id, index === 0 ? name : `${name} (${index + 1})`);
    });
  }

  return labels;
}
