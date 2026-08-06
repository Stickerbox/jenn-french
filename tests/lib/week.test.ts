import { describe, it, expect } from "vitest";
import {
  weekRange,
  formatWeekRange,
  latestViewableDate,
  mondayOf,
  weekDates,
  monthNamesFor,
  weekdayNamesFor,
} from "@/lib/week";

const utc = (iso: string) => new Date(`${iso}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);

describe("weekRange", () => {
  it("returns Monday to Friday for a Monday", () => {
    const { start, end } = weekRange(utc("2026-07-27"));
    expect(iso(start)).toBe("2026-07-27");
    expect(iso(end)).toBe("2026-07-31");
  });

  it("returns the same week from a midweek day", () => {
    const { start, end } = weekRange(utc("2026-07-29"));
    expect(iso(start)).toBe("2026-07-27");
    expect(iso(end)).toBe("2026-07-31");
  });

  it("returns the same week from the Friday itself", () => {
    const { start, end } = weekRange(utc("2026-07-31"));
    expect(iso(start)).toBe("2026-07-27");
    expect(iso(end)).toBe("2026-07-31");
  });

  it("treats Saturday as part of the week just finished", () => {
    const { start, end } = weekRange(utc("2026-08-01"));
    expect(iso(start)).toBe("2026-07-27");
    expect(iso(end)).toBe("2026-07-31");
  });

  it("treats Sunday as the end of the week just finished, not the start of the next", () => {
    const { start, end } = weekRange(utc("2026-08-02"));
    expect(iso(start)).toBe("2026-07-27");
    expect(iso(end)).toBe("2026-07-31");
  });

  it("does not mutate the date it was given", () => {
    const input = utc("2026-07-29");
    weekRange(input);
    expect(iso(input)).toBe("2026-07-29");
  });
});

describe("mondayOf", () => {
  it("returns the date itself for a Monday", () => {
    expect(iso(mondayOf(utc("2026-07-27")))).toBe("2026-07-27");
  });

  it("steps back to Monday from a midweek day", () => {
    expect(iso(mondayOf(utc("2026-07-29")))).toBe("2026-07-27");
  });

  it("steps back to Monday from the Friday itself", () => {
    expect(iso(mondayOf(utc("2026-07-31")))).toBe("2026-07-27");
  });

  it("treats Saturday as part of the week just finished", () => {
    expect(iso(mondayOf(utc("2026-08-01")))).toBe("2026-07-27");
  });

  it("counts a Sunday back six days, not none", () => {
    // The rule the whole module turns on: a Sunday belongs to the week that has
    // just ended, so it must not resolve to the Monday of the week ahead.
    expect(iso(mondayOf(utc("2026-08-02")))).toBe("2026-07-27");
  });

  it("steps back across a month boundary", () => {
    expect(iso(mondayOf(utc("2026-09-02")))).toBe("2026-08-31");
  });

  it("does not mutate the date it was given", () => {
    const input = utc("2026-07-29");
    mondayOf(input);
    expect(iso(input)).toBe("2026-07-29");
  });
});

describe("weekDates", () => {
  const july = [
    "2026-07-27",
    "2026-07-28",
    "2026-07-29",
    "2026-07-30",
    "2026-07-31",
  ];

  it("returns the five teaching days, Monday first", () => {
    expect(weekDates(utc("2026-07-29")).map(iso)).toEqual(july);
  });

  it("returns the same five days from any day of that week, weekend included", () => {
    for (const day of ["2026-07-27", "2026-07-31", "2026-08-01", "2026-08-02"]) {
      expect(weekDates(utc(day)).map(iso)).toEqual(july);
    }
  });

  it("crosses a month boundary inside one week", () => {
    expect(weekDates(utc("2026-09-01")).map(iso)).toEqual([
      "2026-08-31",
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
      "2026-09-04",
    ]);
  });

  it("does not mutate the date it was given", () => {
    const input = utc("2026-09-01");
    weekDates(input);
    expect(iso(input)).toBe("2026-09-01");
  });
});

describe("latestViewableDate", () => {
  it("returns today on a teaching day", () => {
    for (const d of [
      "2026-07-27", // Mon
      "2026-07-29", // Wed
      "2026-07-31", // Fri
    ]) {
      expect(iso(latestViewableDate(utc(d)))).toBe(d);
    }
  });

  it("returns Friday when today is Saturday", () => {
    expect(iso(latestViewableDate(utc("2026-08-01")))).toBe("2026-07-31");
  });

  it("returns Friday when today is Sunday", () => {
    expect(iso(latestViewableDate(utc("2026-08-02")))).toBe("2026-07-31");
  });

  it("steps back across a month boundary on Sunday", () => {
    // Sunday 1 March 2026 — the Friday that closed the week is in February.
    expect(iso(latestViewableDate(utc("2026-03-01")))).toBe("2026-02-27");
  });

  it("does not mutate the date it was given", () => {
    const input = utc("2026-08-02");
    latestViewableDate(input);
    expect(iso(input)).toBe("2026-08-02");
  });
});

describe("formatWeekRange", () => {
  it("formats a week spanning two months with one year, in English", () => {
    const { start, end } = weekRange(utc("2026-08-31"));
    expect(formatWeekRange(start, end, "en")).toBe(
      "AUGUST 31 → SEPTEMBER 4, 2026",
    );
  });

  it("formats a week inside a single month, in English", () => {
    const { start, end } = weekRange(utc("2026-07-08"));
    expect(formatWeekRange(start, end, "en")).toBe("JULY 6 → JULY 10, 2026");
  });

  it("shows both years when the week straddles New Year, in English", () => {
    const { start, end } = weekRange(utc("2026-12-31"));
    expect(formatWeekRange(start, end, "en")).toBe(
      "DECEMBER 28, 2026 → JANUARY 1, 2027",
    );
  });

  it("formats the same week in French", () => {
    const { start, end } = weekRange(utc("2026-08-31"));
    expect(formatWeekRange(start, end, "fr")).toBe(
      "AOÛT 31 → SEPTEMBRE 4, 2026",
    );
  });

  it("shows both years across New Year in French too", () => {
    const { start, end } = weekRange(utc("2026-12-31"));
    expect(formatWeekRange(start, end, "fr")).toBe(
      "DÉCEMBRE 28, 2026 → JANVIER 1, 2027",
    );
  });
});

describe("monthNamesFor", () => {
  it("gives twelve English months, matching MONTHS' own casing", () => {
    expect(monthNamesFor("en")[0]).toBe("JANUARY");
    expect(monthNamesFor("en")[11]).toBe("DECEMBER");
  });

  it("gives twelve French months in the same ALL-CAPS convention", () => {
    expect(monthNamesFor("fr")[0]).toBe("JANVIER");
    expect(monthNamesFor("fr")[11]).toBe("DÉCEMBRE");
  });
});

describe("weekdayNamesFor", () => {
  it("gives the five teaching days, Monday first, in English", () => {
    expect(weekdayNamesFor("en")).toEqual([
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
    ]);
  });

  it("gives the five teaching days, Monday first, in French", () => {
    expect(weekdayNamesFor("fr")).toEqual([
      "Lundi",
      "Mardi",
      "Mercredi",
      "Jeudi",
      "Vendredi",
    ]);
  });
});
