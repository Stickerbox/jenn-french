import { describe, expect, it } from "vitest";
import { pickRevisionDate, teachingDaysBetween } from "@/lib/card-revision";

// August 2026: the 3rd is a Monday, so 3-7 is a full teaching week, 8 and 9
// are the weekend, and the 10th is the following Monday.
const MON = "2026-08-03";
const TUE = "2026-08-04";
const WED = "2026-08-05";
const THU = "2026-08-06";
const FRI = "2026-08-07";
const SAT = "2026-08-08";
const SUN = "2026-08-09";
const NEXT_MON = "2026-08-10";

describe("teachingDaysBetween", () => {
  it("counts the days after `from`, up to and including `to`", () => {
    expect(teachingDaysBetween(MON, TUE)).toBe(1);
    expect(teachingDaysBetween(MON, FRI)).toBe(4);
  });

  it("is zero for the same day and for a `to` in the past", () => {
    expect(teachingDaysBetween(WED, WED)).toBe(0);
    expect(teachingDaysBetween(WED, MON)).toBe(0);
  });

  it("counts neither Saturday nor Sunday", () => {
    expect(teachingDaysBetween(FRI, SAT)).toBe(0);
    expect(teachingDaysBetween(FRI, SUN)).toBe(0);
  });

  it("steps over the weekend rather than through it", () => {
    // Friday to the following Monday is ONE teaching day. Counting calendar
    // days would say three, and the cycle in pickRevisionDate would skip two
    // cards every weekend.
    expect(teachingDaysBetween(FRI, NEXT_MON)).toBe(1);
  });

  it("crosses a month boundary", () => {
    // 2026-07-31 is a Friday, so the days counted are Aug 3-7 and Aug 10.
    expect(teachingDaysBetween("2026-07-31", NEXT_MON)).toBe(6);
  });
});

describe("pickRevisionDate", () => {
  const archive = [MON, TUE, WED];

  it("returns null when there is nothing behind the date", () => {
    expect(pickRevisionDate([], THU)).toBeNull();
  });

  it("walks the archive oldest-first, one card per teaching day", () => {
    expect(pickRevisionDate(archive, THU)).toBe(MON);
    expect(pickRevisionDate(archive, FRI)).toBe(TUE);
    expect(pickRevisionDate(archive, NEXT_MON)).toBe(WED);
  });

  it("cycles back to the oldest once every card has come round", () => {
    expect(pickRevisionDate(archive, "2026-08-11")).toBe(MON);
    expect(pickRevisionDate(archive, "2026-08-12")).toBe(TUE);
  });

  it("gives the same answer every time it is asked about a date", () => {
    // Stability is the property that stops a reload handing the reader a
    // different card, so it is pinned rather than assumed.
    const first = pickRevisionDate(archive, FRI);
    expect(pickRevisionDate(archive, FRI)).toBe(first);
    expect(pickRevisionDate(archive, FRI)).toBe(first);
  });

  it("does not care what order the caller's list is in", () => {
    // listCardDates returns newest-first, for the calendar's benefit.
    expect(pickRevisionDate([WED, TUE, MON], FRI)).toBe(TUE);
  });

  it("never returns the date itself", () => {
    expect(pickRevisionDate(archive, WED)).not.toBe(WED);
    expect(pickRevisionDate(archive, WED)).toBe(MON);
  });

  it("never returns a card dated after the day being viewed", () => {
    // A pre-posted card must not become reachable through this door — that
    // would be reading ahead, which every date clamp in the app exists to
    // prevent. Dropping NEXT_MON also moves the newest eligible card back to
    // TUE, which is what the cycle counts from: THU is two teaching days past
    // it, FRI three.
    expect(pickRevisionDate([MON, TUE, NEXT_MON], THU)).toBe(TUE);
    expect(pickRevisionDate([MON, TUE, NEXT_MON], FRI)).toBe(MON);
  });

  it("returns the only card there is when the archive holds one", () => {
    expect(pickRevisionDate([MON], THU)).toBe(MON);
    expect(pickRevisionDate([MON], NEXT_MON)).toBe(MON);
  });

  it("answers on a weekend, where no teaching day has passed", () => {
    // latestViewableDate makes this rare rather than impossible. Without the
    // floor in pickRevisionDate the index would be -1 and the lookup
    // undefined.
    expect(pickRevisionDate([MON, TUE, WED, THU], SAT)).toBe(MON);
  });
});
