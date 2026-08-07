-- Retire pins on the shared shelf.
--
-- A pin orders one shelf and does not inherit, so these rows only ever affected
-- /g/all. The admin control that created them was the everyone chip on the
-- Pages tab, removed the same day because it drew the shared group as a
-- student. Rather than leave rows no UI can create, edit or remove, pinning
-- there is retired outright and lib/page-pins.ts refuses it from now on.
--
-- DESTRUCTIVE AND NOT REVERSIBLE. /g/all is public, so any page pinned there
-- drops back into date order for anyone who has it bookmarked. There is no
-- version history behind a pin; the row is simply gone.
--
-- Keyed on the flag rather than on the slug 'all', because every rule in this
-- codebase keys off isEveryone and a slug comparison is the thing lib/everyone.ts
-- exists to avoid. `= 1` because SQLite stores a Prisma Boolean as an integer.
DELETE FROM "PagePin"
WHERE "groupId" IN (SELECT "id" FROM "Group" WHERE "isEveryone" = 1);
