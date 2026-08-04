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

// Every date a student may open a card for: one row per GlobalCard, bounded,
// newest first.
//
// The bound is applied HERE rather than in the browser, so the dates of
// pre-posted cards never reach it. Students must not read ahead, and shipping
// tomorrow's date to a page that then greys the cell out would still be telling
// them a card exists for tomorrow.
//
// A new function, not a resurrection: getArchiveDates and mergeArchiveDates
// were deleted on 2026-07-31 because they queried the dropped `Card` table.
// This reads GlobalCard, which is the one that remains.
//
// Uncapped, deliberately. One row per teaching day is about 260 strings a year —
// a couple of kilobytes — and it makes the enabled-day rule a pure function of
// props with a test. A cap would silently make old cards unreachable, which is
// the opposite of what an archive is for. If the size ever matters, the shape to
// reach for is a server action fetching one visible month at a time.
export async function listCardDates(upTo: Date): Promise<string[]> {
  const rows = await prisma.globalCard.findMany({
    where: { date: { lte: upTo } },
    orderBy: { date: "desc" },
    select: { date: true },
  });

  // Every date in this project is UTC midnight, so slicing the ISO string is
  // the same operation the rest of the codebase performs on one.
  return rows.map((row) => row.date.toISOString().slice(0, 10));
}
