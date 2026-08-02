import { describe, expect, it } from "vitest";
import { parseStudentTab } from "@/lib/student-tab";

const all = { card: true, files: true, board: true };
const none = { card: true, files: false, board: false };

describe("parseStudentTab", () => {
  it("defaults to the card", () => {
    expect(parseStudentTab(undefined, all)).toBe("card");
  });

  it("returns files when files exist", () => {
    expect(parseStudentTab("files", all)).toBe("files");
  });

  it("returns board when the board tab is available", () => {
    expect(parseStudentTab("board", all)).toBe("board");
  });

  // A forwarded ?tab= link must not land a stranger on a tab that should not
  // exist for them, so an unavailable tab falls back rather than 404s.
  it("falls back to the card when files are unavailable", () => {
    expect(parseStudentTab("files", none)).toBe("card");
  });

  it("falls back to the card when the board is unavailable", () => {
    expect(parseStudentTab("board", none)).toBe("card");
  });

  it("falls back to the card for an unknown value", () => {
    expect(parseStudentTab("chat", all)).toBe("card");
    expect(parseStudentTab("", all)).toBe("card");
  });

  it("treats the two tabs independently", () => {
    const boardOnly = { card: true, files: false, board: true };
    expect(parseStudentTab("board", boardOnly)).toBe("board");
    expect(parseStudentTab("files", boardOnly)).toBe("card");
  });

  it("returns the card when asked for explicitly", () => {
    expect(parseStudentTab("card", all)).toBe("card");
  });

  it("is case sensitive, so a capitalised value falls back", () => {
    expect(parseStudentTab("Files", all)).toBe("card");
    expect(parseStudentTab("Board", all)).toBe("card");
  });

  // The teacher, who opens a student to see their shelf and their board. The
  // global card is the one she just edited in /admin.
  it("lands on files when the card is unavailable", () => {
    expect(
      parseStudentTab(undefined, { card: false, files: true, board: true }),
    ).toBe("files");
  });

  it("takes the board when the card and files are both unavailable", () => {
    expect(
      parseStudentTab(undefined, { card: false, files: false, board: true }),
    ).toBe("board");
  });

  it("refuses an explicit ?tab=card when the card is unavailable", () => {
    expect(
      parseStudentTab("card", { card: false, files: true, board: true }),
    ).toBe("files");
  });

  // Unreachable in the app — the card is only withheld from a teacher, who is
  // unlocked and therefore has both other tabs — but a total function needs a
  // last resort, and the card branch degrades to "nothing posted yet".
  it("returns the card as a last resort when nothing is available", () => {
    expect(
      parseStudentTab(undefined, { card: false, files: false, board: false }),
    ).toBe("card");
  });
});
