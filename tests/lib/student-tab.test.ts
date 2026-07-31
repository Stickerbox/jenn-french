import { describe, expect, it } from "vitest";
import { parseStudentTab } from "@/lib/student-tab";

const all = { files: true, board: true };
const none = { files: false, board: false };

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
    expect(parseStudentTab("board", { files: false, board: true })).toBe("board");
    expect(parseStudentTab("files", { files: false, board: true })).toBe("card");
  });

  it("returns the card when asked for explicitly", () => {
    expect(parseStudentTab("card", all)).toBe("card");
  });

  it("is case sensitive, so a capitalised value falls back", () => {
    expect(parseStudentTab("Files", all)).toBe("card");
    expect(parseStudentTab("Board", all)).toBe("card");
  });
});
