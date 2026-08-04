import { describe, it, expect } from "vitest";
import { localDayKey, formatTime } from "@/lib/chat-time";

const MONTREAL = "America/Toronto";

describe("localDayKey", () => {
  it("returns a YYYY-MM-DD key", () => {
    expect(localDayKey(new Date("2026-08-04T15:00:00Z"), MONTREAL)).toBe(
      "2026-08-04",
    );
  });

  // The point of the whole change: this instant is 20:00 on the 4th in
  // Montreal, and the UTC rule this replaces filed it under the 5th.
  it("files a late-evening Montreal message under the day it was typed", () => {
    expect(localDayKey(new Date("2026-08-05T00:00:00Z"), MONTREAL)).toBe(
      "2026-08-04",
    );
  });

  it("files an early-morning Tokyo message under the day it was typed", () => {
    expect(localDayKey(new Date("2026-08-04T23:00:00Z"), "Asia/Tokyo")).toBe(
      "2026-08-05",
    );
  });

  it("pads single-digit months and days", () => {
    expect(localDayKey(new Date("2026-01-02T12:00:00Z"), "UTC")).toBe(
      "2026-01-02",
    );
  });

  it("reads the runtime zone when none is given", () => {
    // Not asserting a value — the runtime's zone is whatever the machine says.
    // Asserting the shape is what matters: production passes no zone.
    expect(localDayKey(new Date("2026-08-04T15:00:00Z"))).toMatch(
      /^\d{4}-\d{2}-\d{2}$/,
    );
  });
});

describe("formatTime", () => {
  it("formats an afternoon time in English", () => {
    expect(formatTime(new Date("2026-08-04T18:41:00Z"), "en-CA", MONTREAL)).toBe(
      "2:41 p.m.",
    );
  });

  it("shifts with the zone it is given", () => {
    const instant = new Date("2026-08-04T18:41:00Z");
    expect(formatTime(instant, "en-CA", "UTC")).not.toBe(
      formatTime(instant, "en-CA", MONTREAL),
    );
  });

  // Asserted loosely on purpose: fr-CA renders this as "20 h 02", but the exact
  // spacing character has changed between ICU versions and pinning it would
  // make this test fail on a Node upgrade for no behavioural reason.
  it("formats in French with both parts present", () => {
    const result = formatTime(
      new Date("2026-08-05T00:02:00Z"),
      "fr-CA",
      MONTREAL,
    );
    expect(result).toContain("20");
    expect(result).toContain("02");
  });

  it("pads the minute", () => {
    expect(formatTime(new Date("2026-08-04T13:05:00Z"), "en-CA", MONTREAL)).toBe(
      "9:05 a.m.",
    );
  });
});
