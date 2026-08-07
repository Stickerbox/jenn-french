import { describe, expect, it } from "vitest";
import { boardLabels, type NamedBoard } from "@/lib/whiteboard-names";

const board = (id: string, date: string, createdAt: string): NamedBoard => ({
  id,
  date: new Date(`${date}T00:00:00Z`),
  createdAt: new Date(createdAt),
});

describe("boardLabels", () => {
  it("names a board after its date, in French", () => {
    const labels = boardLabels([board("a", "2026-07-31", "2026-07-31T18:00:00Z")]);
    expect(labels.get("a")).toBe("31 juillet 2026");
  });

  it("leaves a lone board on a date unsuffixed", () => {
    const labels = boardLabels([
      board("a", "2026-07-31", "2026-07-31T18:00:00Z"),
      board("b", "2026-07-24", "2026-07-24T18:00:00Z"),
    ]);
    expect(labels.get("a")).toBe("31 juillet 2026");
    expect(labels.get("b")).toBe("24 juillet 2026");
  });

  // A counter and not a time: every date here is formatted in UTC, and a 7pm
  // Quebec lesson would label itself "23 h 00".
  it("numbers the second and later boards on one date, in drawing order", () => {
    const labels = boardLabels([
      board("second", "2026-07-31", "2026-07-31T20:00:00Z"),
      board("first", "2026-07-31", "2026-07-31T18:00:00Z"),
      board("third", "2026-07-31", "2026-07-31T22:00:00Z"),
    ]);
    expect(labels.get("first")).toBe("31 juillet 2026");
    expect(labels.get("second")).toBe("31 juillet 2026 (2)");
    expect(labels.get("third")).toBe("31 juillet 2026 (3)");
  });

  it("returns an empty map for no boards", () => {
    expect(boardLabels([]).size).toBe(0);
  });

  // Two boards whose createdAt collides must still get distinct labels rather
  // than both claiming to be the first.
  it("breaks a createdAt tie by id so labels stay unique", () => {
    const labels = boardLabels([
      board("bbb", "2026-07-31", "2026-07-31T18:00:00Z"),
      board("aaa", "2026-07-31", "2026-07-31T18:00:00Z"),
    ]);
    expect(new Set([labels.get("aaa"), labels.get("bbb")]).size).toBe(2);
  });

  it("formats a date in UTC, so a board never drifts to the day before", () => {
    const labels = boardLabels([board("a", "2026-01-01", "2026-01-01T00:00:00Z")]);
    expect(labels.get("a")).toBe("1 janvier 2026");
  });

  it("formats the day in English when asked", () => {
    const labels = boardLabels(
      [board("a", "2026-06-03", "2026-06-03T18:00:00Z")],
      "en",
    );
    expect(labels.get("a")).toBe("June 3, 2026");
  });

  it("defaults to French, so every existing caller is unchanged", () => {
    const labels = boardLabels([board("a", "2026-06-03", "2026-06-03T18:00:00Z")]);
    expect(labels.get("a")).toBe("3 juin 2026");
  });
});
