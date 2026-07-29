import { describe, it, expect } from "vitest";
import { shiftToFiveDayWeek } from "@/lib/reschedule";

const utc = (iso: string) => new Date(`${iso}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);

const ANCHOR = utc("2026-07-27"); // a Monday
const shift = (date: string) => iso(shiftToFiveDayWeek(utc(date), ANCHOR));

describe("shiftToFiveDayWeek", () => {
  it("leaves the anchor week's Monday to Friday where they are", () => {
    expect(shift("2026-07-27")).toBe("2026-07-27");
    expect(shift("2026-07-28")).toBe("2026-07-28");
    expect(shift("2026-07-29")).toBe("2026-07-29");
    expect(shift("2026-07-30")).toBe("2026-07-30");
    expect(shift("2026-07-31")).toBe("2026-07-31");
  });

  it("moves the first Saturday to the following Monday", () => {
    expect(shift("2026-08-01")).toBe("2026-08-03");
  });

  it("pushes the week after it forward by one day", () => {
    expect(shift("2026-08-03")).toBe("2026-08-04");
    expect(shift("2026-08-04")).toBe("2026-08-05");
    expect(shift("2026-08-05")).toBe("2026-08-06");
    expect(shift("2026-08-06")).toBe("2026-08-07");
  });

  it("compounds: the second Saturday costs another day", () => {
    // Friday of week two lands on Monday of week three, three days later.
    expect(shift("2026-08-07")).toBe("2026-08-10");
    expect(shift("2026-08-08")).toBe("2026-08-11");
    expect(shift("2026-08-10")).toBe("2026-08-12");
  });

  it("keeps compounding into later weeks", () => {
    // Three Saturdays have been removed by week four, so its Monday lands on
    // the Thursday. Note the calendar gap is not the number of Saturdays
    // crossed — a weekend absorbs part of it — which is why the slot index,
    // not a day count, is the thing being tested.
    expect(shift("2026-08-17")).toBe("2026-08-20");
  });

  it("crosses a month boundary", () => {
    expect(shift("2026-08-29")).toBe("2026-09-04");
  });

  it("returns a date before the anchor unchanged", () => {
    expect(shift("2026-07-24")).toBe("2026-07-24");
  });

  it("returns a Sunday before the anchor unchanged rather than throwing", () => {
    expect(shift("2026-07-26")).toBe("2026-07-26");
  });

  it("throws for a Sunday at or after the anchor", () => {
    expect(() => shift("2026-08-02")).toThrow(/Sunday/);
  });

  it("does not mutate the date it was given", () => {
    const input = utc("2026-08-01");
    shiftToFiveDayWeek(input, ANCHOR);
    expect(iso(input)).toBe("2026-08-01");
  });

  it("does not mutate the anchor it was given", () => {
    const anchor = utc("2026-07-27");
    shiftToFiveDayWeek(utc("2026-08-08"), anchor);
    expect(iso(anchor)).toBe("2026-07-27");
  });
});
