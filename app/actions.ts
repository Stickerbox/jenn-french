"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentTeacher } from "@/lib/session";
import { normaliseSections, type CardSection } from "@/lib/sections";
import { canDeleteGroup } from "@/lib/everyone";
import { newToken } from "@/lib/student-tokens";

async function requireTeacher() {
  const teacher = await getCurrentTeacher();
  if (!teacher) throw new Error("Unauthorized");
  return teacher;
}

export type CardInput = {
  date: string; // YYYY-MM-DD
  subject: string;
  usage: string;
  englishPrompt: string;
  hint: string;
  frenchAnswer: string;
  sections: CardSection[];
};

// Split in two on purpose. `update` omits examples/pronunciation/tip/idiom
// entirely, so Prisma leaves those columns exactly as the backfill left them —
// which is what makes them a usable rollback path. `create` has to supply
// `examples` because the column is non-nullable.
function toCreateData(input: CardInput) {
  return {
    subject: input.subject || null,
    usage: input.usage || null,
    englishPrompt: input.englishPrompt,
    hint: input.hint || null,
    frenchAnswer: input.frenchAnswer,
    examples: "",
    sections: normaliseSections(input.sections),
  };
}

function toUpdateData(input: CardInput) {
  return {
    subject: input.subject || null,
    usage: input.usage || null,
    englishPrompt: input.englishPrompt,
    hint: input.hint || null,
    frenchAnswer: input.frenchAnswer,
    sections: normaliseSections(input.sections),
  };
}

export async function upsertGlobalCard(input: CardInput) {
  await requireTeacher();

  const date = new Date(`${input.date}T00:00:00Z`);

  await prisma.globalCard.upsert({
    where: { date },
    create: { date, ...toCreateData(input) },
    update: toUpdateData(input),
  });

  revalidatePath("/admin");
}

export async function createGroup(name: string, slug: string) {
  await requireTeacher();

  try {
    await prisma.group.create({
      data: { name, slug, chatToken: newToken(), filesToken: newToken() },
    });
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

export async function deleteGroup(groupId: string) {
  await requireTeacher();

  // Checked here rather than only in the UI: hiding a button is not a guard.
  // This action is still reachable from a stale tab, and deleting this row
  // would empty every student's shelf at once with nothing reporting an error.
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: { isEveryone: true },
  });
  if (group && !canDeleteGroup(group)) {
    throw new Error("The everyone group can't be deleted.");
  }

  await prisma.$transaction([
    prisma.card.deleteMany({ where: { groupId } }),
    prisma.group.deleteMany({ where: { id: groupId } }),
  ]);

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
    create: { groupId, date, ...toCreateData(input) },
    update: toUpdateData(input),
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
