import { describe, it, expect } from "vitest";
import { monthWeekdayRows } from "@/lib/month-grid";

const dates = (rows: { date: string }[][]) => rows.map((r) => r.map((c) => c.date));

describe("monthWeekdayRows", () => {
  it("leads with the previous month when the 1st falls on a Saturday", () => {
    // August 2026 begins on a Saturday, so the week containing the 1st has no
    // August weekdays in it at all.
    const rows = monthWeekdayRows(2026, 7);
    expect(dates(rows)).toEqual([
      ["2026-07-27", "2026-07-28", "2026-07-29", "2026-07-30", "2026-07-31"],
      ["2026-08-03", "2026-08-04", "2026-08-05", "2026-08-06", "2026-08-07"],
      ["2026-08-10", "2026-08-11", "2026-08-12", "2026-08-13", "2026-08-14"],
      ["2026-08-17", "2026-08-18", "2026-08-19", "2026-08-20", "2026-08-21"],
      ["2026-08-24", "2026-08-25", "2026-08-26", "2026-08-27", "2026-08-28"],
      ["2026-08-31", "2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04"],
    ]);
  });

  it("marks cells outside the month", () => {
    const rows = monthWeekdayRows(2026, 7);
    expect(rows[0].every((c) => !c.inMonth)).toBe(true);
    expect(rows[1].every((c) => c.inMonth)).toBe(true);
    expect(rows[5].map((c) => c.inMonth)).toEqual([
      true,
      false,
      false,
      false,
      false,
    ]);
  });

  it("has no leading cells when the 1st falls on a Monday", () => {
    // June 2026 begins on a Monday and ends on Tuesday the 30th.
    const rows = monthWeekdayRows(2026, 5);
    expect(rows[0][0].date).toBe("2026-06-01");
    expect(rows[0].every((c) => c.inMonth)).toBe(true);
    expect(rows[rows.length - 1].map((c) => c.date)).toEqual([
      "2026-06-29",
      "2026-06-30",
      "2026-07-01",
      "2026-07-02",
      "2026-07-03",
    ]);
  });

  it("leads with the previous month when the 1st falls on a Sunday", () => {
    // November 2026 begins on a Sunday, which belongs to October's last week.
    const rows = monthWeekdayRows(2026, 10);
    expect(dates(rows)[0]).toEqual([
      "2026-10-26",
      "2026-10-27",
      "2026-10-28",
      "2026-10-29",
      "2026-10-30",
    ]);
    expect(rows[1][0].date).toBe("2026-11-02");
  });

  it("includes the 29th in a leap February", () => {
    // February 2028 begins on a Tuesday and ends on Tuesday the 29th.
    const rows = monthWeekdayRows(2028, 1);
    const inMonth = rows.flat().filter((c) => c.inMonth);
    expect(inMonth[0].date).toBe("2028-02-01");
    expect(inMonth[inMonth.length - 1].date).toBe("2028-02-29");
  });

  it("never produces a Saturday or Sunday, in any month of a year", () => {
    for (let month = 0; month < 12; month++) {
      for (const cell of monthWeekdayRows(2026, month).flat()) {
        const day = new Date(`${cell.date}T00:00:00Z`).getUTCDay();
        expect(day).toBeGreaterThanOrEqual(1);
        expect(day).toBeLessThanOrEqual(5);
      }
    }
  });

  it("always produces rows of exactly five cells", () => {
    for (let month = 0; month < 12; month++) {
      for (const row of monthWeekdayRows(2026, month)) {
        expect(row).toHaveLength(5);
      }
    }
  });

  it("marks inMonth for exactly the weekdays of the requested month", () => {
    // September 2026 has 22 weekdays.
    const inMonth = monthWeekdayRows(2026, 8)
      .flat()
      .filter((c) => c.inMonth);
    expect(inMonth).toHaveLength(22);
    expect(inMonth.every((c) => c.date.startsWith("2026-09-"))).toBe(true);
  });
});
