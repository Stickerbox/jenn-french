-- Rename tense -> subject (preserves existing data) and add idiom field
ALTER TABLE "GlobalCard" RENAME COLUMN "tense" TO "subject";
ALTER TABLE "GlobalCard" ADD COLUMN "idiom" TEXT;
ALTER TABLE "Card" RENAME COLUMN "tense" TO "subject";
ALTER TABLE "Card" ADD COLUMN "idiom" TEXT;
