// A row somebody authored, at a time. Structural rather than a model type:
// four tables feed this and none of them agrees on a column name for either
// half — Page has addedByStudent, PageVersion and Flashcard have fromTeacher,
// ActionItem has doneByTeacher.
export type AuthoredRow = {
  at: Date;
  fromTeacher: boolean;
};

// Rows newer than the watermark, authored by the OTHER party.
//
// The author filter is the rule and not an optimisation. A dot means
// "something happened that you have not seen", so your own upload must never
// light your own tab. Every row this counts already carries an author, which
// is what makes this a filter rather than a column.
//
// A null watermark counts everything — it means "has never looked", not "has
// seen it all", the same reading teacherLastReadAt has.
//
// Strictly newer, so a row written in the millisecond the tab rendered is
// treated as seen. It was on screen.
export function countUnseen(
  rows: AuthoredRow[],
  seenAt: Date | null,
  viewerIsTeacher: boolean,
): number {
  return rows.filter(
    (row) =>
      row.fromTeacher !== viewerIsTeacher &&
      (seenAt === null || row.at.getTime() > seenAt.getTime()),
  ).length;
}

// Only what deciding a dot needs. Satisfied by lib/pages.ts's ShelfPage
// without a cast, which is why the fields are named as they are.
export type UnseenPage = {
  createdAt: Date;
  updatedAt: Date;
  addedByStudent: boolean;
  versions: { fromTeacher: boolean; updatedAt: Date }[];
};

// THE SHELF'S ONE PREDICATE. The tile dot, the tab dot and the admin card's
// file count all go through this, so a tab can never claim work that no tile
// shows — the failure the worksheet rules record about shelfSlotCount, whose
// fix was deriving badge, tabs and count from one module.
export function pageIsUnseen(
  page: UnseenPage,
  seenAt: Date | null,
  viewerIsTeacher: boolean,
): boolean {
  const rows: AuthoredRow[] = [
    { at: page.createdAt, fromTeacher: !page.addedByStudent },
    ...page.versions.map((version) => ({
      at: version.updatedAt,
      fromTeacher: version.fromTeacher,
    })),
  ];

  // A content change has no author column and needs none: updatePage,
  // updatePdfPage and updatePageMeta are the only writers of updatedAt and all
  // three are requireTeacher(), so an edit is always Jenn's.
  //
  // Gated on the page pre-dating the WATERMARK, and deliberately NOT on
  // updatedAt > createdAt. Prisma writes those two from different clocks —
  // SQLite's CURRENT_TIMESTAMP for the default and the client's Date for
  // @updatedAt — so on a fresh row they differ by milliseconds in either
  // direction, and comparing them would read a student's own upload as a
  // teacher edit in the instant they made it. This is the same two-clock trap
  // PageVersion.sentAt records.
  //
  // A page newer than the watermark needs no such row: its creation entry
  // above already decides it, with the correct author.
  if (seenAt !== null && page.createdAt.getTime() <= seenAt.getTime()) {
    rows.push({ at: page.updatedAt, fromTeacher: true });
  }

  return countUnseen(rows, seenAt, viewerIsTeacher) > 0;
}
