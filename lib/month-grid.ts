export type MonthCell = { date: string; inMonth: boolean };

// Rows of exactly five cells, Monday to Friday. The weekend dates of each week
// are absent rather than blanked out: the admin calendar's whole purpose is
// that there is no Saturday cell to click, and a greyed-out one would be a
// weaker version of the same idea.
//
// Rows run from the Monday of the week containing the 1st to the Friday of the
// week containing the last day, so days from the neighbouring months appear at
// both ends. They stay selectable — Monday 31 August and Tuesday 1 September
// are consecutive teaching days, and changing month between them would be
// absurd. `month` is 0-indexed, matching Date.UTC.
export function monthWeekdayRows(year: number, month: number): MonthCell[][] {
  const first = new Date(Date.UTC(year, month, 1));
  const last = new Date(Date.UTC(year, month + 1, 0));

  // Sunday counts back six days, not none: a Sunday belongs to the week that
  // has just ended, the same rule lib/week.ts uses.
  const firstDayOfWeek = first.getUTCDay();
  const cursor = new Date(first);
  cursor.setUTCDate(
    cursor.getUTCDate() - (firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1),
  );

  const rows: MonthCell[][] = [];
  // The cursor sits on a Monday at the top of each pass, so this asks "does the
  // month reach into this week?" — true for the week holding the last day even
  // when that day is a Saturday or Sunday.
  while (cursor.getTime() <= last.getTime()) {
    const row: MonthCell[] = [];
    for (let i = 0; i < 5; i++) {
      row.push({
        date: cursor.toISOString().slice(0, 10),
        inMonth:
          cursor.getUTCFullYear() === year && cursor.getUTCMonth() === month,
      });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    cursor.setUTCDate(cursor.getUTCDate() + 2); // step over Saturday and Sunday
    rows.push(row);
  }

  return rows;
}
