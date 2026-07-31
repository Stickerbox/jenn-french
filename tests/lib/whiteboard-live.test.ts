import { beforeEach, describe, expect, it } from "vitest";
import { PALETTE, type StrokeOp } from "@/lib/whiteboard-ops";
import { liveBoards } from "@/lib/whiteboard-live";

// StrokeOp rather than Op, so the same helper serves both an `Op[]` argument
// and the `DrawOp | null` pending slot without a cast at either call site.
const op = (id: string, page = 0): StrokeOp => ({
  id,
  page,
  kind: "stroke",
  points: [0, 0, 1, 1],
  colour: PALETTE[0],
  width: 5,
});

const date = new Date("2026-07-31T00:00:00Z");

describe("liveBoards", () => {
  beforeEach(() => {
    liveBoards.discard("g1");
    liveBoards.discard("g2");
  });

  it("has no board for a group that has not opened one", () => {
    expect(liveBoards.get("g1")).toBeNull();
  });

  it("opens a board and reports it", () => {
    expect(liveBoards.open("g1", date)).toBe(true);
    expect(liveBoards.get("g1")).toEqual({
      date,
      ops: [],
      currentPage: 0,
      pending: null,
    });
  });

  // The map is keyed by group, and one student cannot be watching two boards.
  it("refuses a second open for the same group", () => {
    liveBoards.open("g1", date);
    expect(liveBoards.open("g1", date)).toBe(false);
  });

  it("keeps groups independent", () => {
    liveBoards.open("g1", date);
    expect(liveBoards.open("g2", date)).toBe(true);
  });

  it("appends ops in order", () => {
    liveBoards.open("g1", date);
    expect(liveBoards.append("g1", [op("a")], 0, null)).toBe(true);
    expect(liveBoards.append("g1", [op("b")], 0, null)).toBe(true);
    expect(liveBoards.get("g1")?.ops.map((o) => o.id)).toEqual(["a", "b"]);
  });

  it("refuses an append with no board open", () => {
    expect(liveBoards.append("g1", [op("a")], 0, null)).toBe(false);
  });

  // currentPage is presentation state, not content: it rides alongside the ops
  // so the student's view follows hers, and is never stored.
  it("tracks the page she is presenting", () => {
    liveBoards.open("g1", date);
    liveBoards.append("g1", [op("a", 2)], 2, null);
    expect(liveBoards.get("g1")?.currentPage).toBe(2);
  });

  it("accepts a page change with no ops", () => {
    liveBoards.open("g1", date);
    expect(liveBoards.append("g1", [], 1, null)).toBe(true);
    expect(liveBoards.get("g1")?.currentPage).toBe(1);
  });

  // The stroke under her cursor is held in its own slot rather than appended,
  // so a growing line needs no id games and no retraction: the next flush
  // replaces it, and the committed stroke clears it.
  it("holds the in-progress stroke separately from the log", () => {
    liveBoards.open("g1", date);
    liveBoards.append("g1", [], 0, op("pending"));
    expect(liveBoards.get("g1")?.ops).toEqual([]);
    expect(liveBoards.get("g1")?.pending?.id).toBe("pending");
  });

  it("replaces the in-progress stroke on each flush", () => {
    liveBoards.open("g1", date);
    liveBoards.append("g1", [], 0, op("first"));
    liveBoards.append("g1", [], 0, op("second"));
    expect(liveBoards.get("g1")?.pending?.id).toBe("second");
  });

  it("clears the in-progress stroke when a committed op arrives", () => {
    liveBoards.open("g1", date);
    liveBoards.append("g1", [], 0, op("pending"));
    liveBoards.append("g1", [op("a")], 0, null);
    expect(liveBoards.get("g1")?.pending).toBeNull();
  });

  it("does not count the in-progress stroke against the op ceiling", () => {
    liveBoards.open("g1", date);
    for (let i = 0; i < 100; i += 1) {
      liveBoards.append("g1", [], 0, op(`p${i}`));
    }
    expect(liveBoards.get("g1")?.ops).toEqual([]);
  });

  it("discards a board", () => {
    liveBoards.open("g1", date);
    liveBoards.discard("g1");
    expect(liveBoards.get("g1")).toBeNull();
  });

  it("tolerates discarding a board that is not there", () => {
    expect(() => liveBoards.discard("g1")).not.toThrow();
  });

  // A board that grows without bound is a memory leak wearing a lesson as a
  // disguise, so the cap is enforced here rather than trusted to the client.
  it("refuses an append past the op ceiling", () => {
    liveBoards.open("g1", date);
    const many = Array.from({ length: 20_001 }, (_, i) => op(`o${i}`));
    expect(liveBoards.append("g1", many, 0, null)).toBe(false);
  });
});
