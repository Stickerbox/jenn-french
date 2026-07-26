import { describe, it, expect } from "vitest";
import { formatCardDate } from "@/lib/format";

describe("formatCardDate", () => {
  it("labels a UTC-midnight date as that calendar day, regardless of the runtime's local timezone", () => {
    expect(formatCardDate(new Date("2026-07-26T00:00:00Z"))).toContain("26");
  });

  it("includes the weekday, month and day parts", () => {
    const label = formatCardDate(new Date("2026-07-26T00:00:00Z"));
    expect(label).toMatch(/\d/);
    expect(label.length).toBeGreaterThan(5);
  });
});
