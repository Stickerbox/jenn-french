import { describe, it, expect } from "vitest";
import { dayHeading, listStamp } from "@/lib/chat-stamp";

const MONTREAL = "America/Toronto";
const EN = { today: "Today" };
const FR = { today: "Aujourd'hui" };

describe("dayHeading", () => {
  it("says today when the key matches today's", () => {
    expect(dayHeading("2026-08-04", "2026-08-04", EN, "en-CA")).toBe("Today");
  });

  it("uses the label it is given, not a hardcoded word", () => {
    expect(dayHeading("2026-08-04", "2026-08-04", FR, "fr-CA")).toBe(
      "Aujourd'hui",
    );
  });

  it("formats any other day as a full date", () => {
    expect(dayHeading("2026-07-28", "2026-08-04", EN, "en-CA")).toContain("28");
    expect(dayHeading("2026-07-28", "2026-08-04", EN, "en-CA")).toContain(
      "2026",
    );
  });

  // Retention is forever, so a heading without a year is ambiguous on an old
  // conversation.
  it("includes the year", () => {
    expect(dayHeading("2025-07-28", "2026-08-04", EN, "en-CA")).toContain(
      "2025",
    );
  });

  // The key is ALREADY a local calendar day. Re-reading it in the reader's zone
  // would shift it by one; it has to be read back in UTC to survive intact.
  it("does not shift the day it was handed", () => {
    expect(dayHeading("2026-07-28", "2026-08-04", EN, "en-CA")).not.toContain(
      "27",
    );
  });
});

describe("listStamp", () => {
  const labels = { yesterday: "Yesterday" };
  // 2026-08-04 15:00 UTC is 11:00 on the 4th in Montreal.
  const now = new Date("2026-08-04T15:00:00Z");

  it("shows a time for something sent today", () => {
    const result = listStamp(
      new Date("2026-08-04T14:41:00Z"),
      now,
      "en-CA",
      labels,
      MONTREAL,
    );
    expect(result).toContain("41");
  });

  it("says yesterday for the day before", () => {
    expect(
      listStamp(
        new Date("2026-08-03T14:41:00Z"),
        now,
        "en-CA",
        labels,
        MONTREAL,
      ),
    ).toBe("Yesterday");
  });

  it("shows a short date for anything older", () => {
    const result = listStamp(
      new Date("2026-07-28T14:41:00Z"),
      now,
      "en-CA",
      labels,
      MONTREAL,
    );
    expect(result).toContain("28");
    expect(result).not.toBe("Yesterday");
  });

  // "Yesterday" is derived by stepping the calendar key back one day, not by
  // subtracting 24 hours of elapsed time. On a day a clock shifts, 24 hours
  // earlier is not reliably the previous calendar day.
  it("still says yesterday across a daylight-saving change", () => {
    // 2026-11-01 is the fall-back Sunday in America/Toronto.
    const afterFallBack = new Date("2026-11-02T15:00:00Z");
    expect(
      listStamp(
        new Date("2026-11-01T15:00:00Z"),
        afterFallBack,
        "en-CA",
        labels,
        MONTREAL,
      ),
    ).toBe("Yesterday");
  });

  it("treats a message from a month ago as a date, not a time", () => {
    const result = listStamp(
      new Date("2026-07-04T14:41:00Z"),
      now,
      "en-CA",
      labels,
      MONTREAL,
    );
    expect(result).not.toContain(":");
  });
});
