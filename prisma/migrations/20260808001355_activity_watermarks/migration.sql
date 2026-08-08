-- AlterTable
ALTER TABLE "ActionItem" ADD COLUMN "doneByTeacher" BOOLEAN;

-- AlterTable
ALTER TABLE "Group" ADD COLUMN "studentSeenDeckAt" DATETIME;
ALTER TABLE "Group" ADD COLUMN "studentSeenFilesAt" DATETIME;
ALTER TABLE "Group" ADD COLUMN "studentSeenTodoAt" DATETIME;
ALTER TABLE "Group" ADD COLUMN "teacherSeenDeckAt" DATETIME;
ALTER TABLE "Group" ADD COLUMN "teacherSeenFilesAt" DATETIME;
ALTER TABLE "Group" ADD COLUMN "teacherSeenTodoAt" DATETIME;

-- CreateTable
CREATE TABLE "WorksheetOpen" (
    "pageId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "openedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("pageId", "groupId"),
    CONSTRAINT "WorksheetOpen_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WorksheetOpen_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Flashcard" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "groupId" TEXT NOT NULL,
    "front" TEXT NOT NULL,
    "back" TEXT NOT NULL,
    "note" TEXT,
    "fromTeacher" BOOLEAN NOT NULL DEFAULT false,
    "lastViewedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Flashcard_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Flashcard" ("back", "createdAt", "front", "groupId", "id", "lastViewedAt", "note") SELECT "back", "createdAt", "front", "groupId", "id", "lastViewedAt", "note" FROM "Flashcard";
DROP TABLE "Flashcard";
ALTER TABLE "new_Flashcard" RENAME TO "Flashcard";
CREATE INDEX "Flashcard_groupId_createdAt_idx" ON "Flashcard"("groupId", "createdAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- Existing students have already been seen. Without this the first render
-- tells Jenn she has 47 new flashcards, all of them written by her, months
-- ago — and a feature whose first impression is a wrong number is one she
-- learns to ignore.
--
-- CURRENT_TIMESTAMP is what Prisma itself writes for a DEFAULT on this
-- connector (see Flashcard.createdAt in 20260807195633), so the stored form is
-- the one the client already reads back.
UPDATE "Group" SET
  "teacherSeenFilesAt" = CURRENT_TIMESTAMP,
  "teacherSeenDeckAt"  = CURRENT_TIMESTAMP,
  "teacherSeenTodoAt"  = CURRENT_TIMESTAMP,
  "studentSeenFilesAt" = CURRENT_TIMESTAMP,
  "studentSeenDeckAt"  = CURRENT_TIMESTAMP,
  "studentSeenTodoAt"  = CURRENT_TIMESTAMP;
