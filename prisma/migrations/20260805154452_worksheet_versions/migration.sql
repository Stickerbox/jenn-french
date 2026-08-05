-- CreateTable
CREATE TABLE "PageVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pageId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "fromTeacher" BOOLEAN NOT NULL,
    "kind" TEXT NOT NULL,
    "snapshot" BLOB,
    "pdf" BLOB,
    "pdfSize" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PageVersion_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PageVersion_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

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
    "worksheet" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Page" ("addedByStudent", "createdAt", "html", "id", "kind", "pdf", "pdfSize", "slug", "thumb", "thumbAt", "title", "updatedAt", "url") SELECT "addedByStudent", "createdAt", "html", "id", "kind", "pdf", "pdfSize", "slug", "thumb", "thumbAt", "title", "updatedAt", "url" FROM "Page";
DROP TABLE "Page";
ALTER TABLE "new_Page" RENAME TO "Page";
CREATE UNIQUE INDEX "Page_slug_key" ON "Page"("slug");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "PageVersion_pageId_groupId_fromTeacher_key" ON "PageVersion"("pageId", "groupId", "fromTeacher");
