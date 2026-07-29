// One-off, run once per environment. Removing Saturday from the teaching week
// moves content rather than deleting it, so this re-dates every card at or
// after the anchor onto consecutive Monday-Friday slots.
//
//   npx --yes tsx scripts/reschedule-five-day-week.mjs            # dry run
//   npx --yes tsx scripts/reschedule-five-day-week.mjs --apply    # writes
import { PrismaClient } from "@prisma/client";
import { shiftToFiveDayWeek } from "../lib/reschedule.ts";

const prisma = new PrismaClient();

// Hardcoded rather than derived from the clock: a run on the server a week
// after the dry run has to produce the same result as the dry run.
const ANCHOR = new Date("2026-07-27T00:00:00Z");

const apply = process.argv.includes("--apply");
const iso = (date) => date.toISOString().slice(0, 10);

async function finish(code) {
  await prisma.$disconnect();
  process.exit(code);
}

// Descending: date is unique on GlobalCard and (groupId, date) on Card, SQLite
// has no deferred constraint checking, and every card moves forward or stays
// put. Writing the furthest-future row first means each one always moves into a
// slot that has just been vacated.
const globals = await prisma.globalCard.findMany({
  where: { date: { gte: ANCHOR } },
  orderBy: { date: "desc" },
});
const overrides = await prisma.card.findMany({
  where: { date: { gte: ANCHOR } },
  orderBy: { date: "desc" },
});

const sundays = [
  ...globals.map((card) => ({ card, table: "GlobalCard" })),
  ...overrides.map((card) => ({ card, table: "Card" })),
].filter(({ card }) => card.date.getUTCDay() === 0);
if (sundays.length > 0) {
  console.error("Cards sit on a Sunday at or after the anchor:");
  for (const { card, table } of sundays)
    console.error(`  ${table}  ${iso(card.date)}  ${card.id}`);
  console.error("A Sunday has no slot in either week. Resolve these first.");
  await finish(1);
}

// The mapping is not idempotent — applied twice, a card on the second week's
// Tuesday moves to Wednesday and then to Thursday. After a successful apply no
// card sits on a Saturday, so this check makes a second run a no-op.
if (![...globals, ...overrides].some((card) => card.date.getUTCDay() === 6)) {
  console.log("already migrated, nothing to do");
  await finish(0);
}

const plan = (cards) =>
  cards.map((card) => ({ card, to: shiftToFiveDayWeek(card.date, ANCHOR) }));

const globalPlan = plan(globals);
const overridePlan = plan(overrides);

// Every card at or after the anchor is listed, unchanged ones included, so the
// printout is the whole affected set rather than a diff.
for (const { card, to } of globalPlan) {
  const same = card.date.getTime() === to.getTime();
  console.log(`GlobalCard  ${iso(card.date)} -> ${iso(to)}${same ? "  (unchanged)" : ""}`);
}
for (const { card, to } of overridePlan) {
  const same = card.date.getTime() === to.getTime();
  console.log(`Card ${card.groupId}  ${iso(card.date)} -> ${iso(to)}${same ? "  (unchanged)" : ""}`);
}

const moving = [...globalPlan, ...overridePlan].filter(
  ({ card, to }) => card.date.getTime() !== to.getTime(),
);

if (!apply) {
  console.log(`\n${moving.length} card(s) would move. Re-run with --apply to write.`);
  await finish(0);
}

await prisma.$transaction([
  ...globalPlan
    .filter(({ card, to }) => card.date.getTime() !== to.getTime())
    .map(({ card, to }) =>
      prisma.globalCard.update({ where: { id: card.id }, data: { date: to } }),
    ),
  ...overridePlan
    .filter(({ card, to }) => card.date.getTime() !== to.getTime())
    .map(({ card, to }) =>
      prisma.card.update({ where: { id: card.id }, data: { date: to } }),
    ),
]);

console.log(`\napplied: ${moving.length} card(s) moved`);
await finish(0);
