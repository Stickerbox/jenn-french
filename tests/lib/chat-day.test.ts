import { describe, it, expect } from "vitest";
import { groupByDay } from "@/lib/chat-day";

const MONTREAL = "America/Toronto";
const at = (iso: string) => ({ createdAt: new Date(iso) });

describe("groupByDay", () => {
  it("returns nothing for no messages", () => {
    expect(groupByDay([], MONTREAL)).toEqual([]);
  });

  it("puts one day's messages under one heading", () => {
    const result = groupByDay(
      [at("2026-07-30T14:00:00Z"), at("2026-07-30T22:30:00Z")],
      MONTREAL,
    );
    expect(result).toHaveLength(1);
    expect(result[0].day).toBe("2026-07-30");
    expect(result[0].messages).toHaveLength(2);
  });

  it("splits messages across two days", () => {
    const result = groupByDay(
      [at("2026-07-30T14:00:00Z"), at("2026-07-31T14:00:00Z")],
      MONTREAL,
    );
    expect(result.map((g) => g.day)).toEqual(["2026-07-30", "2026-07-31"]);
  });

  // The inversion. This instant is 20:00 on the 30th in Montreal. The UTC rule
  // this replaces filed it under the 31st, which was defensible until a clock
  // time was printed beside it. See the 2026-08-04 chat inbox design.
  it("keeps a late-evening Montreal message on the day it was typed", () => {
    expect(groupByDay([at("2026-07-31T00:00:00Z")], MONTREAL)[0].day).toBe(
      "2026-07-30",
    );
  });

  it("groups the same instants differently in a different zone", () => {
    const messages = [at("2026-07-31T00:00:00Z")];
    expect(groupByDay(messages, MONTREAL)[0].day).toBe("2026-07-30");
    expect(groupByDay(messages, "Europe/Paris")[0].day).toBe("2026-07-31");
  });

  it("preserves the order messages arrived in within a day", () => {
    const first = at("2026-07-30T14:00:00Z");
    const second = at("2026-07-30T15:00:00Z");
    expect(groupByDay([first, second], MONTREAL)[0].messages).toEqual([
      first,
      second,
    ]);
  });

  it("keeps the caller's own fields on the messages it returns", () => {
    const rich = [
      { createdAt: new Date("2026-07-30T14:00:00Z"), body: "salut" },
    ];
    expect(groupByDay(rich, MONTREAL)[0].messages[0].body).toBe("salut");
  });

  it("starts a new group when the day changes back and forth", () => {
    const result = groupByDay(
      [
        at("2026-07-30T14:00:00Z"),
        at("2026-07-31T14:00:00Z"),
        at("2026-08-01T14:00:00Z"),
      ],
      MONTREAL,
    );
    expect(result).toHaveLength(3);
  });
});
