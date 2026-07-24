import { prisma } from "@/lib/prisma";
import {
  pickEffectiveCard,
  mergeArchiveDates,
  type CardContent,
} from "@/lib/card-resolution";

export async function getEffectiveCard(
  groupId: string,
  onOrBefore: Date,
): Promise<CardContent | null> {
  const [override, fallback] = await Promise.all([
    prisma.card.findFirst({
      where: { groupId, date: { lte: onOrBefore } },
      orderBy: { date: "desc" },
    }),
    prisma.globalCard.findFirst({
      where: { date: { lte: onOrBefore } },
      orderBy: { date: "desc" },
    }),
  ]);

  return pickEffectiveCard(override, fallback);
}

export async function getArchiveDates(groupId: string): Promise<Date[]> {
  const [overrides, globals] = await Promise.all([
    prisma.card.findMany({ where: { groupId }, select: { date: true } }),
    prisma.globalCard.findMany({ select: { date: true } }),
  ]);

  return mergeArchiveDates(
    overrides.map((c) => c.date),
    globals.map((c) => c.date),
  );
}
