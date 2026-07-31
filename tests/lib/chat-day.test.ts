import { describe, it, expect } from "vitest";
import { groupByDay } from "@/lib/chat-day";

const at = (iso: string) => ({ createdAt: new Date(iso) });

describe("groupByDay", () => {
  it("returns nothing for no messages", () => {
    expect(groupByDay([])).toEqual([]);
  });

  it("puts one day's messages under one heading", () => {
    const result = groupByDay([
      at("2026-07-30T10:00:00Z"),
      at("2026-07-30T18:30:00Z"),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].day).toBe("2026-07-30");
    expect(result[0].messages).toHaveLength(2);
  });

  it("splits messages across two days", () => {
    const result = groupByDay([
      at("2026-07-30T10:00:00Z"),
      at("2026-07-31T09:00:00Z"),
    ]);
    expect(result.map((g) => g.day)).toEqual(["2026-07-30", "2026-07-31"]);
  });

  it("groups in UTC, so a late-evening Montreal message lands on the next day", () => {
    // 20:00 in Montreal on the 30th is 00:00 UTC on the 31st.
    expect(groupByDay([at("2026-07-31T00:00:00Z")])[0].day).toBe("2026-07-31");
  });

  it("preserves the order messages arrived in within a day", () => {
    const first = at("2026-07-30T10:00:00Z");
    const second = at("2026-07-30T11:00:00Z");
    expect(groupByDay([first, second])[0].messages).toEqual([first, second]);
  });

  it("keeps the caller's own fields on the messages it returns", () => {
    const rich = [{ createdAt: new Date("2026-07-30T10:00:00Z"), body: "salut" }];
    expect(groupByDay(rich)[0].messages[0].body).toBe("salut");
  });

  it("starts a new group when the day changes back and forth", () => {
    const result = groupByDay([
      at("2026-07-30T10:00:00Z"),
      at("2026-07-31T10:00:00Z"),
      at("2026-08-01T10:00:00Z"),
    ]);
    expect(result).toHaveLength(3);
  });
});
