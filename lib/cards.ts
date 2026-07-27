import { prisma } from "@/lib/prisma";
import {
  pickEffectiveCard,
  mergeArchiveDates,
  type CardContent,
} from "@/lib/card-resolution";
import type { CardInput } from "@/app/actions";

// Shape shared by GlobalCard and Card (minus id/date/createdAt/groupId) — the
// nullable optional fields need to become "" for the editor's controlled
// inputs, since CardInput's fields are all `string`.
type StoredCardFields = {
  subject: string | null;
  usage: string | null;
  pronunciation: string | null;
  englishPrompt: string;
  hint: string | null;
  frenchAnswer: string;
  examples: string;
  tip: string | null;
  idiom: string | null;
};

export function toCardFormValues(
  card: StoredCardFields | null,
): Partial<CardInput> {
  if (!card) return {};
  return {
    subject: card.subject ?? "",
    usage: card.usage ?? "",
    pronunciation: card.pronunciation ?? "",
    englishPrompt: card.englishPrompt,
    hint: card.hint ?? "",
    frenchAnswer: card.frenchAnswer,
    examples: card.examples,
    tip: card.tip ?? "",
    idiom: card.idiom ?? "",
  };
}

// Looks up that day and no other. An earlier version returned the most recent
// card on or before the date, so a day with nothing posted silently showed the
// previous day's card — which made the week picker lie: a student could select
// Tuesday and be shown Monday's word with Tuesday highlighted. Now a day with
// no card resolves to null and the page says so.
export async function getEffectiveCard(
  groupId: string,
  date: Date,
): Promise<CardContent | null> {
  const [override, fallback] = await Promise.all([
    prisma.card.findUnique({ where: { groupId_date: { groupId, date } } }),
    prisma.globalCard.findUnique({ where: { date } }),
  ]);

  return pickEffectiveCard(override, fallback);
}

export async function getArchiveDates(
  groupId: string,
  onOrBefore: Date,
): Promise<Date[]> {
  const [overrides, globals] = await Promise.all([
    prisma.card.findMany({
      where: { groupId, date: { lte: onOrBefore } },
      select: { date: true },
    }),
    prisma.globalCard.findMany({
      where: { date: { lte: onOrBefore } },
      select: { date: true },
    }),
  ]);

  return mergeArchiveDates(
    overrides.map((c) => c.date),
    globals.map((c) => c.date),
  );
}
