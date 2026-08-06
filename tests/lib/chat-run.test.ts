import { describe, it, expect } from "vitest";
import { groupIntoRuns, RUN_GAP_MS } from "@/lib/chat-run";
import type { ChatMessage } from "@/lib/chat-message";

let n = 0;
const at = (iso: string, fromTeacher: boolean): ChatMessage => ({
  id: `m${++n}`,
  groupId: "g1",
  fromTeacher,
  body: "salut",
  automated: false,
  href: null,
  replyToId: null,
  replyTo: null,
  createdAt: new Date(iso),
});

describe("groupIntoRuns", () => {
  it("returns nothing for no messages", () => {
    expect(groupIntoRuns([])).toEqual([]);
  });

  it("puts a single message in its own run", () => {
    const result = groupIntoRuns([at("2026-08-05T10:00:00Z", true)]);
    expect(result).toHaveLength(1);
    expect(result[0].fromTeacher).toBe(true);
    expect(result[0].messages).toHaveLength(1);
  });

  it("collapses two close messages from the same sender into one run", () => {
    const result = groupIntoRuns([
      at("2026-08-05T10:00:00Z", true),
      at("2026-08-05T10:01:00Z", true),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].messages).toHaveLength(2);
  });

  it("splits two messages from the same sender across a gap longer than RUN_GAP_MS", () => {
    const first = at("2026-08-05T10:00:00Z", true);
    const second = at(
      new Date(first.createdAt.getTime() + RUN_GAP_MS + 1).toISOString(),
      true,
    );
    const result = groupIntoRuns([first, second]);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.messages.length)).toEqual([1, 1]);
  });

  it("stays in one run exactly at the gap boundary", () => {
    const first = at("2026-08-05T10:00:00Z", true);
    const second = at(
      new Date(first.createdAt.getTime() + RUN_GAP_MS).toISOString(),
      true,
    );
    expect(groupIntoRuns([first, second])).toHaveLength(1);
  });

  it("splits an alternating thread into one run per message", () => {
    const result = groupIntoRuns([
      at("2026-08-05T10:00:00Z", true),
      at("2026-08-05T10:00:10Z", false),
      at("2026-08-05T10:00:20Z", true),
    ]);
    expect(result.map((r) => r.fromTeacher)).toEqual([true, false, true]);
    expect(result.every((r) => r.messages.length === 1)).toBe(true);
  });

  it("preserves message order and identity within a run", () => {
    const first = at("2026-08-05T10:00:00Z", true);
    const second = at("2026-08-05T10:00:05Z", true);
    const result = groupIntoRuns([first, second]);
    expect(result[0].messages).toEqual([first, second]);
  });
});
