import { describe, expect, it } from "vitest";
import { countUnseen, pageIsUnseen } from "@/lib/unseen";

const t = (iso: string) => new Date(iso);

describe("countUnseen", () => {
  it("counts the other party's rows newer than the watermark", () => {
    const rows = [
      { at: t("2026-08-05T10:00:00Z"), fromTeacher: false },
      { at: t("2026-08-07T10:00:00Z"), fromTeacher: false },
    ];
    expect(countUnseen(rows, t("2026-08-06T00:00:00Z"), true)).toBe(1);
  });

  it("never counts your own rows", () => {
    // The whole point of the author filter: a dot means "something happened
    // that you have not seen", so your own upload must not light your own tab.
    const rows = [{ at: t("2026-08-07T10:00:00Z"), fromTeacher: true }];
    expect(countUnseen(rows, t("2026-08-06T00:00:00Z"), true)).toBe(0);
    expect(countUnseen(rows, t("2026-08-06T00:00:00Z"), false)).toBe(1);
  });

  it("counts everything when the watermark is null", () => {
    // Null means "has never looked", not "has seen it all" — the same reading
    // teacherLastReadAt has.
    const rows = [
      { at: t("2020-01-01T00:00:00Z"), fromTeacher: false },
      { at: t("2026-08-07T10:00:00Z"), fromTeacher: false },
    ];
    expect(countUnseen(rows, null, true)).toBe(2);
  });

  it("excludes a row exactly on the watermark", () => {
    // Strictly newer. The watermark is stamped when the tab renders, so a row
    // written in that same millisecond was on screen.
    const rows = [{ at: t("2026-08-06T00:00:00Z"), fromTeacher: false }];
    expect(countUnseen(rows, t("2026-08-06T00:00:00Z"), true)).toBe(0);
  });

  it("counts nothing in an empty list", () => {
    expect(countUnseen([], null, true)).toBe(0);
  });
});

describe("pageIsUnseen", () => {
  const base = {
    createdAt: t("2026-08-01T00:00:00Z"),
    updatedAt: t("2026-08-01T00:00:00Z"),
    addedByStudent: false,
    versions: [],
  };

  it("is true for a page the other party added since the watermark", () => {
    const page = {
      ...base,
      createdAt: t("2026-08-07T10:00:00Z"),
      updatedAt: t("2026-08-07T10:00:00Z"),
      addedByStudent: true,
    };
    expect(pageIsUnseen(page, t("2026-08-06T00:00:00Z"), true)).toBe(true);
  });

  it("is false for a page you added yourself", () => {
    const page = {
      ...base,
      createdAt: t("2026-08-07T10:00:00Z"),
      updatedAt: t("2026-08-07T10:00:00Z"),
      addedByStudent: true,
    };
    expect(pageIsUnseen(page, t("2026-08-06T00:00:00Z"), false)).toBe(false);
  });

  it("is true for a version the other party saved", () => {
    const page = {
      ...base,
      versions: [{ fromTeacher: true, updatedAt: t("2026-08-07T10:00:00Z") }],
    };
    expect(pageIsUnseen(page, t("2026-08-06T00:00:00Z"), false)).toBe(true);
  });

  it("treats a content change on an older page as the teacher's", () => {
    // Only updatePage, updatePdfPage and updatePageMeta write updatedAt and
    // all three are requireTeacher(), so an edit is always Jenn's.
    const page = { ...base, updatedAt: t("2026-08-07T10:00:00Z") };
    expect(pageIsUnseen(page, t("2026-08-06T00:00:00Z"), false)).toBe(true);
    expect(pageIsUnseen(page, t("2026-08-06T00:00:00Z"), true)).toBe(false);
  });

  it("does not read a student's own fresh upload as a teacher edit", () => {
    // THE TWO-CLOCK TRAP. createdAt comes from SQLite's CURRENT_TIMESTAMP and
    // updatedAt from the client's Date, so on a fresh row they differ by
    // milliseconds in either direction. Comparing them would light the
    // student's own tile the instant they uploaded.
    const page = {
      ...base,
      createdAt: t("2026-08-07T10:00:00.000Z"),
      updatedAt: t("2026-08-07T10:00:00.004Z"),
      addedByStudent: true,
    };
    expect(pageIsUnseen(page, t("2026-08-06T00:00:00Z"), false)).toBe(false);
  });

  it("is false for a page nothing has touched since the watermark", () => {
    expect(pageIsUnseen(base, t("2026-08-06T00:00:00Z"), true)).toBe(false);
  });
});
