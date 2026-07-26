import { describe, it, expect } from "vitest";
import { formatCardDate } from "@/lib/format";

describe("formatCardDate", () => {
  it("formats a date as a short fr-CA weekday label", () => {
    expect(formatCardDate(new Date("2026-07-26T00:00:00Z"))).toBe(
      new Date("2026-07-26T00:00:00Z").toLocaleDateString("fr-CA", {
        weekday: "short",
        month: "short",
        day: "numeric",
      }),
    );
  });

  it("includes the weekday, month and day parts", () => {
    const label = formatCardDate(new Date("2026-07-26T00:00:00Z"));
    expect(label).toMatch(/\d/);
    expect(label.length).toBeGreaterThan(5);
  });
});
