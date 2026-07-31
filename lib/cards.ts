import { prisma } from "@/lib/prisma";
import type { CardContent } from "@/lib/card-resolution";
import type { CardInput } from "@/app/actions";
import { readSections } from "@/lib/sections";

// GlobalCard's shape (minus id/date/createdAt) — the nullable optional fields
// need to become "" for the editor's controlled inputs, since CardInput's
// fields are all `string`.
type StoredCardFields = {
  subject: string | null;
  usage: string | null;
  englishPrompt: string;
  hint: string | null;
  frenchAnswer: string;
  sections: unknown;
};

export function toCardFormValues(
  card: StoredCardFields | null,
): Partial<CardInput> {
  if (!card) return {};
  return {
    subject: card.subject ?? "",
    usage: card.usage ?? "",
    englishPrompt: card.englishPrompt,
    hint: card.hint ?? "",
    frenchAnswer: card.frenchAnswer,
    sections: readSections(card.sections),
  };
}

// A card belongs to a date, and every student sees the same one. This used to
// take a groupId and prefer that student's override; the override feature was
// removed on 2026-07-31 with zero rows in either database.
export async function getEffectiveCard(
  date: Date,
): Promise<CardContent | null> {
  const row = await prisma.globalCard.findUnique({ where: { date } });
  if (!row) return null;

  return {
    date: row.date,
    subject: row.subject,
    usage: row.usage,
    englishPrompt: row.englishPrompt,
    hint: row.hint,
    frenchAnswer: row.frenchAnswer,
    sections: readSections(row.sections),
  };
}
