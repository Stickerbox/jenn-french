import { describe, it, expect } from "vitest";
import { parseStudentTab } from "@/lib/student-tab";

describe("parseStudentTab", () => {
  it("defaults to the card when the param is absent", () => {
    expect(parseStudentTab(undefined, true)).toBe("card");
  });

  it("returns the files tab when asked for and available", () => {
    expect(parseStudentTab("files", true)).toBe("files");
  });

  it("returns the card when asked for explicitly", () => {
    expect(parseStudentTab("card", true)).toBe("card");
  });

  it("falls back to the card when there are no files to show", () => {
    expect(parseStudentTab("files", false)).toBe("card");
  });

  it("falls back to the card for an unrecognised value", () => {
    expect(parseStudentTab("chat", true)).toBe("card");
  });

  it("is case sensitive, so a capitalised value falls back", () => {
    expect(parseStudentTab("Files", true)).toBe("card");
  });
});
