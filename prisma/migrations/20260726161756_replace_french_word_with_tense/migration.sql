/*
  Warnings:

  - You are about to drop the column `frenchWord` on the `Card` table. All the data in the column will be lost.
  - You are about to drop the column `wordType` on the `Card` table. All the data in the column will be lost.
  - You are about to drop the column `frenchWord` on the `GlobalCard` table. All the data in the column will be lost.
  - You are about to drop the column `wordType` on the `GlobalCard` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Card" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "groupId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "tense" TEXT,
    "pronunciation" TEXT,
    "englishPrompt" TEXT NOT NULL,
    "frenchAnswer" TEXT NOT NULL,
    "examples" TEXT NOT NULL,
    "tip" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Card_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Card" ("createdAt", "date", "englishPrompt", "examples", "frenchAnswer", "groupId", "id", "pronunciation", "tip") SELECT "createdAt", "date", "englishPrompt", "examples", "frenchAnswer", "groupId", "id", "pronunciation", "tip" FROM "Card";
DROP TABLE "Card";
ALTER TABLE "new_Card" RENAME TO "Card";
CREATE UNIQUE INDEX "Card_groupId_date_key" ON "Card"("groupId", "date");
CREATE TABLE "new_GlobalCard" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL,
    "tense" TEXT,
    "pronunciation" TEXT,
    "englishPrompt" TEXT NOT NULL,
    "frenchAnswer" TEXT NOT NULL,
    "examples" TEXT NOT NULL,
    "tip" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_GlobalCard" ("createdAt", "date", "englishPrompt", "examples", "frenchAnswer", "id", "pronunciation", "tip") SELECT "createdAt", "date", "englishPrompt", "examples", "frenchAnswer", "id", "pronunciation", "tip" FROM "GlobalCard";
DROP TABLE "GlobalCard";
ALTER TABLE "new_GlobalCard" RENAME TO "GlobalCard";
CREATE UNIQUE INDEX "GlobalCard_date_key" ON "GlobalCard"("date");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
