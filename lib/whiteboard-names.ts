export type NamedBoard = {
  id: string;
  date: Date;
  createdAt: Date;
};

// timeZone: "UTC" like every other date in this codebase. Without it a board
// stamped at UTC midnight renders as the previous day for anyone west of
// Greenwich, which is everyone using this site.
const dayFormat = new Intl.DateTimeFormat("fr-CA", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const dayKey = (date: Date) => date.toISOString().slice(0, 10);

// Takes the whole set rather than one board, because "disambiguate only when
// ambiguous" cannot be decided from a single row — and a per-board format call
// would inevitably regress into either always suffixing or never doing it.
export function boardLabels(boards: NamedBoard[]): Map<string, string> {
  const byDay = new Map<string, NamedBoard[]>();
  for (const board of boards) {
    const key = dayKey(board.date);
    const day = byDay.get(key);
    if (day) day.push(board);
    else byDay.set(key, [board]);
  }

  const labels = new Map<string, string>();

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
