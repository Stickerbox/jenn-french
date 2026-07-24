"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentTeacher } from "@/lib/session";

async function requireTeacher() {
  const teacher = await getCurrentTeacher();
  if (!teacher) throw new Error("Unauthorized");
  return teacher;
}

export type CardInput = {
  date: string; // YYYY-MM-DD
  frenchWord: string;
  wordType: string;
  pronunciation: string;
  englishPrompt: string;
  frenchAnswer: string;
  examples: string;
  tip: string;
};

function toCardData(input: CardInput) {
  return {
    frenchWord: input.frenchWord,
    wordType: input.wordType || null,
    pronunciation: input.pronunciation || null,
    englishPrompt: input.englishPrompt,
    frenchAnswer: input.frenchAnswer,
    examples: input.examples,
    tip: input.tip || null,
  };
}

export async function upsertGlobalCard(input: CardInput) {
  await requireTeacher();

  const date = new Date(`${input.date}T00:00:00`);

  await prisma.globalCard.upsert({
    where: { date },
    create: { date, ...toCardData(input) },
    update: toCardData(input),
  });

  revalidatePath("/admin");
}

export async function createGroup(name: string, slug: string) {
  await requireTeacher();

  await prisma.group.create({ data: { name, slug } });

  revalidatePath("/admin");
}

export async function upsertOverrideCard(groupId: string, input: CardInput) {
  await requireTeacher();

  const date = new Date(`${input.date}T00:00:00`);

  await prisma.card.upsert({
    where: { groupId_date: { groupId, date } },
    create: { groupId, date, ...toCardData(input) },
    update: toCardData(input),
  });

  revalidatePath(`/admin`);
}
