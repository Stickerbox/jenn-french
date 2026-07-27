// One-off, run once per environment after the migration. Idempotent: a card
// that already has sections is skipped, so re-running is safe.
import { PrismaClient } from "@prisma/client";
import { backfillSections, readSections } from "../lib/sections.ts";

const prisma = new PrismaClient();

async function backfill(name, findMany, update) {
  const cards = await findMany();
  let filled = 0;
  let skipped = 0;

  for (const card of cards) {
    if (readSections(card.sections).length > 0) {
      skipped += 1;
      continue;
    }
    const sections = backfillSections(card);
    await update(card.id, sections);
    filled += 1;
  }

  console.log(`${name}: ${filled} filled, ${skipped} already had sections`);
}

await backfill(
  "GlobalCard",
  () => prisma.globalCard.findMany(),
  (id, sections) => prisma.globalCard.update({ where: { id }, data: { sections } }),
);

await backfill(
  "Card",
  () => prisma.card.findMany(),
  (id, sections) => prisma.card.update({ where: { id }, data: { sections } }),
);

await prisma.$disconnect();
