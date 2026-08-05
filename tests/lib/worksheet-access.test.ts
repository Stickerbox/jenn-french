import { describe, expect, it } from "vitest";
import { worksheetOpenable } from "@/lib/worksheet-access";

const ok = {
  role: "student" as const,
  worksheet: true,
  kind: "html" as const,
  onShelf: true,
};

describe("worksheetOpenable", () => {
  it("admits both parties for a worksheet on their shelf", () => {
    expect(worksheetOpenable(ok)).toBe(true);
    expect(worksheetOpenable({ ...ok, role: "teacher" })).toBe(true);
    expect(worksheetOpenable({ ...ok, kind: "pdf" })).toBe(true);
  });

  it("refuses a visitor chatRole already refused", () => {
    // chatRole answers null for the everyone group before it checks anything
    // else, which is how /g/all is kept out without a clause here.
    expect(worksheetOpenable({ ...ok, role: null })).toBe(false);
  });

  it("refuses a page Jenn has not ticked", () => {
    expect(worksheetOpenable({ ...ok, worksheet: false })).toBe(false);
  });

  it("refuses a link, which has nothing to fill in", () => {
    expect(worksheetOpenable({ ...ok, kind: "link" })).toBe(false);
  });

  it("refuses a page that is not on this shelf", () => {
    // Without this a guessable page slug would let anyone attach versions to
    // any document in the database.
    expect(worksheetOpenable({ ...ok, onShelf: false })).toBe(false);
  });
});
