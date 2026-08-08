// One worksheet on one shelf is in exactly one of these. Disjoint by
// construction, so the three bullets built from them can never double-count a
// worksheet.
export type HomeworkState =
  | "not-opened"
  | "started"
  | "awaiting-correction"
  | "settled";

// Seven days, and this is the one rule here about Jenn's real week rather than
// about data.
//
// "Awaiting correction" is a TASK, not news. It must not clear because she
// glanced at the card — an interruption would spend the only signal that a
// student is waiting, which is why it has no watermark. But she often corrects
// live in the lesson and files nothing at all, and a task that never clears
// becomes a permanent mark she stops reading. This is the compromise.
export const CORRECTION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export function homeworkStatus({
  openedAt,
  studentSaved,
  studentSentAt,
  teacherSavedAt,
  now,
}: {
  openedAt: Date | null;
  // The student has a row on this worksheet, announced or not. A SECOND proof
  // of an open, and it outranks the absent WorksheetOpen row rather than being
  // a nicety: you cannot save a worksheet you never opened.
  //
  // Without it, work saved before WorksheetOpen existed — and work saved and
  // then edited, since every save nulls sentAt — reads as never opened. The
  // migration backfills a row per existing student version for exactly this
  // reason, and this clause is what keeps the answer right for anything the
  // backfill could not reach.
  studentSaved: boolean;
  // The student's own row, announced. Null covers both "no row" and "saved but
  // never sent" — sendState already treats an unannounced row as unfinished,
  // and Jenn is not owed a correction of work nobody handed her.
  studentSentAt: Date | null;
  teacherSavedAt: Date | null;
  // Passed in, never read as new Date() here, for the reason FilesTab takes a
  // `today` prop: a clock read inside a pure function is untestable and, on a
  // component, straddles hydration.
  now: Date;
}): HomeworkState {
  // Handed in outranks everything below it. WorksheetOpen shipped after some
  // worksheets had already been handed in, so those rows have no open and an
  // absent open must not outrank a real hand-in.
  if (studentSentAt !== null) {
    // Strictly newer, so a revision handed in after a correction is owed a
    // second one. Both timestamps are written by the client on separate
    // requests, so this is a real ordering rather than the two-clock
    // comparison PageVersion.sentAt refuses.
    if (
      teacherSavedAt !== null &&
      teacherSavedAt.getTime() > studentSentAt.getTime()
    ) {
      return "settled";
    }

    // Elapsed milliseconds, deliberately NOT lib/week.ts. That module answers
    // which teaching day a card belongs to; this is a duration, with no zone
    // in it and no weekend rule.
    if (now.getTime() - studentSentAt.getTime() >= CORRECTION_WINDOW_MS) {
      return "settled";
    }

    return "awaiting-correction";
  }

  if (openedAt !== null || studentSaved) return "started";
  return "not-opened";
}
