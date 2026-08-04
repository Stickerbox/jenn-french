-- Renames Page.pdfThumb -> Page.thumb and Page.pdfThumbAt -> Page.thumbAt.
--
-- EDITED BY HAND, and the edit is the whole point of this file. Prisma read the
-- schema change as a DROP plus an ADD, not as a rename, and generated an
-- INSERT ... SELECT that carried neither column — which would have thrown away
-- the stored preview of every PDF already uploaded, silently, with a green
-- migration. The two columns are named in both lists below so the bytes move.
--
-- The generated "you are about to drop the column" warnings were removed with
-- the data loss they described.
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Page" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'html',
    "html" TEXT,
    "url" TEXT,
    "pdf" BLOB,
    "pdfSize" INTEGER,
    "thumb" BLOB,
    "thumbAt" DATETIME,
    "addedByStudent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Page" ("addedByStudent", "createdAt", "html", "id", "kind", "pdf", "pdfSize", "slug", "thumb", "thumbAt", "title", "updatedAt", "url") SELECT "addedByStudent", "createdAt", "html", "id", "kind", "pdf", "pdfSize", "slug", "pdfThumb", "pdfThumbAt", "title", "updatedAt", "url" FROM "Page";
DROP TABLE "Page";
ALTER TABLE "new_Page" RENAME TO "Page";
CREATE UNIQUE INDEX "Page_slug_key" ON "Page"("slug");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
