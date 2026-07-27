"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentTeacher } from "@/lib/session";

async function requireTeacher() {
  const teacher = await getCurrentTeacher();
  if (!teacher) throw new Error("Unauthorized");
  return teacher;
}

export type CardInput = {
  date: string; // YYYY-MM-DD
  subject: string;
  usage: string;
  pronunciation: string;
  englishPrompt: string;
  hint: string;
  frenchAnswer: string;
  examples: string;
  tip: string;
  idiom: string;
};

function toCardData(input: CardInput) {
  return {
    subject: input.subject || null,
    usage: input.usage || null,
    pronunciation: input.pronunciation || null,
    englishPrompt: input.englishPrompt,
    hint: input.hint || null,
    frenchAnswer: input.frenchAnswer,
    examples: input.examples,
    tip: input.tip || null,
    idiom: input.idiom || null,
  };
}

export async function upsertGlobalCard(input: CardInput) {
  await requireTeacher();

  const date = new Date(`${input.date}T00:00:00Z`);

  await prisma.globalCard.upsert({
    where: { date },
    create: { date, ...toCardData(input) },
    update: toCardData(input),
  });

  revalidatePath("/admin");
}

export async function createGroup(name: string, slug: string) {
  await requireTeacher();

  try {
    await prisma.group.create({ data: { name, slug } });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      throw new Error("That link is already taken — pick a different slug.");
    }
    throw err;
  }

  revalidatePath("/admin");
}

export async function upsertOverrideCard(
  groupId: string,
  slug: string,
  input: CardInput,
) {
  await requireTeacher();

  const date = new Date(`${input.date}T00:00:00Z`);

  await prisma.card.upsert({
    where: { groupId_date: { groupId, date } },
    create: { groupId, date, ...toCardData(input) },
    update: toCardData(input),
  });

  revalidatePath(`/admin/${slug}`);
}

// deleteMany rather than delete: delete throws P2025 when the row is already
// gone, which turns a double-click or a stale tab into an error the teacher
// cannot act on. Deleting nothing is the same outcome they asked for.
export async function deleteGlobalCard(dateStr: string) {
  await requireTeacher();

  const date = new Date(`${dateStr}T00:00:00Z`);
  await prisma.globalCard.deleteMany({ where: { date } });

  revalidatePath("/admin");
}

export async function deleteOverrideCard(
  groupId: string,
  slug: string,
  dateStr: string,
) {
  await requireTeacher();

  const date = new Date(`${dateStr}T00:00:00Z`);
  await prisma.card.deleteMany({ where: { groupId, date } });

  revalidatePath(`/admin/${slug}`);
}
