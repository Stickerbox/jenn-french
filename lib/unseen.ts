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
//
// `updatedAt` is deliberately absent — see pageIsUnseen.
export type UnseenPage = {
  createdAt: Date;
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

  // THERE IS NO CONTENT-CHANGE SIGNAL, and that is a knowing gap rather than an
  // oversight. Replacing a PDF at the same slug lights nothing.
  //
  // `Page.updatedAt` was it, on the reasoning that only updatePage,
  // updatePdfPage and updatePageMeta write that column and all three are
  // requireTeacher(). That was wrong: setPageThumbnail is a fourth writer, and
  // Prisma bumps @updatedAt on its updateMany like any other. ThumbBackfill
  // calls it on every visit to /admin?tab=pages, for every row published
  // without a browser to capture in — so a student's own PDF, whose preview
  // rendered late, grew a red dot attributed to Jenn for a document nobody had
  // touched.
  //
  // A preview is not content, and from this column the two are
  // indistinguishable. A dot that fires for a write nobody made is worse than a
  // missing dot on a replacement, so the signal is withdrawn until it can be
  // told truthfully: a `contentAt` column written by savePage alone would do
  // it, and nothing here would change but this comment and one field.
  return countUnseen(rows, seenAt, viewerIsTeacher) > 0;
}
