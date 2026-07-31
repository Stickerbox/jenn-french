-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Group" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "isEveryone" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Group" ("createdAt", "id", "name", "slug") SELECT "createdAt", "id", "name", "slug" FROM "Group";
DROP TABLE "Group";
ALTER TABLE "new_Group" RENAME TO "Group";
CREATE UNIQUE INDEX "Group_slug_key" ON "Group"("slug");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- The everyone group already exists in production as the only group row.
-- Flag it rather than creating a second one.
UPDATE "Group" SET "isEveryone" = true WHERE "slug" = 'all';

-- A rebuilt box has no rows at all, and a missing everyone group is a silent
-- failure: every student's shelf would simply be short. Create it if the
-- UPDATE above matched nothing.
INSERT INTO "Group" ("id", "name", "slug", "isEveryone", "createdAt")
SELECT 'everyone-seeded', 'Everyone', 'all', true, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "Group" WHERE "isEveryone" = true);
