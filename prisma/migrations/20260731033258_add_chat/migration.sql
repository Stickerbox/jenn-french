-- AlterTable
ALTER TABLE "Group" ADD COLUMN "chatToken" TEXT;
ALTER TABLE "Group" ADD COLUMN "filesToken" TEXT;
ALTER TABLE "Group" ADD COLUMN "teacherLastReadAt" DATETIME;

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "groupId" TEXT NOT NULL,
    "fromTeacher" BOOLEAN NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Message_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Message_groupId_createdAt_idx" ON "Message"("groupId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Group_chatToken_key" ON "Group"("chatToken");

-- CreateIndex
CREATE UNIQUE INDEX "Group_filesToken_key" ON "Group"("filesToken");

-- Existing students predate tokens and would otherwise have no way in.
-- hex(randomblob(16)) is SQLite's equivalent of the 32-hex-character token
-- lib/student-tokens.ts mints, so backfilled rows are indistinguishable from
-- new ones. The everyone group is skipped: it has no private surface.
UPDATE "Group"
SET "chatToken" = lower(hex(randomblob(16))),
    "filesToken" = lower(hex(randomblob(16)))
WHERE "isEveryone" = false AND "chatToken" IS NULL;
