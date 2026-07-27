import { describe, it, expect } from "vitest";
import { weekRange, formatWeekRange, latestViewableDate } from "@/lib/week";

const utc = (iso: string) => new Date(`${iso}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);

describe("weekRange", () => {
  it("returns Monday to Saturday for a Monday", () => {
    const { start, end } = weekRange(utc("2026-07-27"));
    expect(iso(start)).toBe("2026-07-27");
    expect(iso(end)).toBe("2026-08-01");
  });

  it("returns the same week from a midweek day", () => {
    const { start, end } = weekRange(utc("2026-07-29"));
    expect(iso(start)).toBe("2026-07-27");
    expect(iso(end)).toBe("2026-08-01");
  });

  it("returns the same week from the Saturday itself", () => {
    const { start, end } = weekRange(utc("2026-08-01"));
    expect(iso(start)).toBe("2026-07-27");
    expect(iso(end)).toBe("2026-08-01");
  });

  it("treats Sunday as the end of the week just finished, not the start of the next", () => {
    const { start, end } = weekRange(utc("2026-08-02"));
    expect(iso(start)).toBe("2026-07-27");
    expect(iso(end)).toBe("2026-08-01");
  });

  it("does not mutate the date it was given", () => {
    const input = utc("2026-07-29");
    weekRange(input);
    expect(iso(input)).toBe("2026-07-29");
  });
});

describe("latestViewableDate", () => {
  it("returns today on a teaching day", () => {
    for (const d of [
      "2026-07-27", // Mon
      "2026-07-29", // Wed
      "2026-08-01", // Sat
    ]) {
      expect(iso(latestViewableDate(utc(d)))).toBe(d);
    }
  });

  it("returns Saturday when today is Sunday", () => {
    expect(iso(latestViewableDate(utc("2026-08-02")))).toBe("2026-08-01");
  });

  it("steps back across a month boundary on Sunday", () => {
    // Sunday 1 March 2026 — the Saturday before is in February.
    expect(iso(latestViewableDate(utc("2026-03-01")))).toBe("2026-02-28");
  });

  it("does not mutate the date it was given", () => {
    const input = utc("2026-08-02");
    latestViewableDate(input);
    expect(iso(input)).toBe("2026-08-02");
  });
});

describe("formatWeekRange", () => {
  it("formats a week spanning two months with one year", () => {
    const { start, end } = weekRange(utc("2026-07-27"));
    expect(formatWeekRange(start, end)).toBe("JULY 27 → AUGUST 1, 2026");
  });

  it("formats a week inside a single month", () => {
    const { start, end } = weekRange(utc("2026-07-08"));
    expect(formatWeekRange(start, end)).toBe("JULY 6 → JULY 11, 2026");
  });

  it("shows both years when the week straddles New Year", () => {
    const { start, end } = weekRange(utc("2026-12-31"));
    expect(formatWeekRange(start, end)).toBe(
      "DECEMBER 28, 2026 → JANUARY 2, 2027",
    );
  });
});
