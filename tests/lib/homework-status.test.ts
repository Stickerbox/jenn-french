import { describe, expect, it } from "vitest";
import { homeworkStatus, CORRECTION_WINDOW_MS } from "@/lib/homework-status";

const t = (iso: string) => new Date(iso);
const now = t("2026-08-07T12:00:00Z");

describe("homeworkStatus", () => {
  it("is not-opened when nothing has happened", () => {
    expect(
      homeworkStatus({
        openedAt: null,
        studentSentAt: null,
        teacherSavedAt: null,
        now,
      }),
    ).toBe("not-opened");
  });

  it("is started once opened with nothing handed in", () => {
    expect(
      homeworkStatus({
        openedAt: t("2026-08-06T09:00:00Z"),
        studentSentAt: null,
        teacherSavedAt: null,
        now,
      }),
    ).toBe("started");
  });

  it("is awaiting-correction once handed in", () => {
    expect(
      homeworkStatus({
        openedAt: t("2026-08-06T09:00:00Z"),
        studentSentAt: t("2026-08-06T10:00:00Z"),
        teacherSavedAt: null,
        now,
      }),
    ).toBe("awaiting-correction");
  });

  it("is settled once a correction is newer than the hand-in", () => {
    expect(
      homeworkStatus({
        openedAt: t("2026-08-06T09:00:00Z"),
        studentSentAt: t("2026-08-06T10:00:00Z"),
        teacherSavedAt: t("2026-08-06T11:00:00Z"),
        now,
      }),
    ).toBe("settled");
  });

  it("ignores a correction older than the hand-in", () => {
    // Jenn corrected, then the student handed in a revision. That is new work
    // owed back, not settled.
    expect(
      homeworkStatus({
        openedAt: t("2026-08-01T09:00:00Z"),
        studentSentAt: t("2026-08-06T10:00:00Z"),
        teacherSavedAt: t("2026-08-02T11:00:00Z"),
        now,
      }),
    ).toBe("awaiting-correction");
  });

  it("still awaits correction one millisecond inside the window", () => {
    const sent = new Date(now.getTime() - CORRECTION_WINDOW_MS + 1);
    expect(
      homeworkStatus({
        openedAt: sent,
        studentSentAt: sent,
        teacherSavedAt: null,
        now,
      }),
    ).toBe("awaiting-correction");
  });

  it("settles on the window boundary", () => {
    // Jenn often corrects live in the lesson and files nothing. A task that
    // never clears becomes a permanent mark she stops reading.
    const sent = new Date(now.getTime() - CORRECTION_WINDOW_MS);
    expect(
      homeworkStatus({
        openedAt: sent,
        studentSentAt: sent,
        teacherSavedAt: null,
        now,
      }),
    ).toBe("settled");
  });

  it("reports handed-in work even when no open was recorded", () => {
    // WorksheetOpen shipped after some worksheets had already been handed in,
    // so an absent open must not outrank a real hand-in.
    expect(
      homeworkStatus({
        openedAt: null,
        studentSentAt: t("2026-08-06T10:00:00Z"),
        teacherSavedAt: null,
        now,
      }),
    ).toBe("awaiting-correction");
  });

  it("holds a seven-day window", () => {
    expect(CORRECTION_WINDOW_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });
});
