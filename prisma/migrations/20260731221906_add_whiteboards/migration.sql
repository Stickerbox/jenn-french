-- CreateTable
CREATE TABLE "Whiteboard" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "groupId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "thumbnail" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Whiteboard_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WhiteboardPage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "whiteboardId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "ops" JSONB NOT NULL,
    CONSTRAINT "WhiteboardPage_whiteboardId_fkey" FOREIGN KEY ("whiteboardId") REFERENCES "Whiteboard" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Whiteboard_groupId_createdAt_idx" ON "Whiteboard"("groupId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WhiteboardPage_whiteboardId_index_key" ON "WhiteboardPage"("whiteboardId", "index");
