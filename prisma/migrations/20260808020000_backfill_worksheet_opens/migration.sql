-- A student who has saved a version has obviously opened the worksheet, but
-- WorksheetOpen shipped after those saves and has no row for any of them.
--
-- Without this, every worksheet handed in before the table existed reads as
-- "not opened" on its student's card. That number is large: savePage sets
-- worksheet = true for every html page on create, so almost every page ever
-- published is a worksheet, and the not-opened state has no watermark and no
-- expiry — it would never clear.
--
-- Teacher rows are excluded. Her correction says nothing about whether the
-- student ever looked, which is the same rule markWorksheetOpened enforces by
-- refusing her.
--
-- INSERT OR IGNORE against the compound primary key, so re-running this leaves
-- any row the app has since written alone rather than resetting its openedAt.
INSERT OR IGNORE INTO "WorksheetOpen" ("pageId", "groupId", "openedAt")
SELECT "pageId", "groupId", "updatedAt"
FROM "PageVersion"
WHERE "fromTeacher" = 0;
