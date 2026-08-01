-- CreateTable
CREATE TABLE "PagePin" (
    "pageId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "pinnedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("pageId", "groupId"),
    CONSTRAINT "PagePin_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PagePin_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Backfill: an existing pin was global, so it becomes one pin per shelf the
-- page is actually on. Prisma does not generate this; without it the rebuild
-- below silently discards every pin. A page pinned but assigned to no group
-- loses its pin, which is correct — it was on no shelf.
INSERT INTO "PagePin" ("pageId", "groupId", "pinnedAt")
SELECT p."id", pg."groupId", p."pinnedAt"
FROM "Page" p
JOIN "PageGroup" pg ON pg."pageId" = p."id"
WHERE p."pinnedAt" IS NOT NULL;

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
    "addedByStudent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Page" ("createdAt", "html", "id", "slug", "title", "updatedAt") SELECT "createdAt", "html", "id", "slug", "title", "updatedAt" FROM "Page";
DROP TABLE "Page";
ALTER TABLE "new_Page" RENAME TO "Page";
CREATE UNIQUE INDEX "Page_slug_key" ON "Page"("slug");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
