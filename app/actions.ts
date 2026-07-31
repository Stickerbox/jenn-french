"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentTeacher } from "@/lib/session";
import { normaliseSections, type CardSection } from "@/lib/sections";
import { canDeleteGroup } from "@/lib/everyone";
import { newToken } from "@/lib/student-tokens";
import { deleteMessageById, markTeacherRead } from "@/lib/messages";
import { chatBus } from "@/lib/chat-bus";
import { studentSlug } from "@/lib/student-slug";

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

export async function createGroup(name: string) {
  await requireTeacher();

  const trimmed = name.trim();
  if (trimmed === "") throw new Error("A student needs a name.");

  // Derived, never typed. The slug is a URL path segment and a cookie name,
  // and a hand-typed one could be neither — see lib/student-slug.ts.
  const taken = await prisma.group.findMany({ select: { slug: true } });
  const slug = studentSlug(
    trimmed,
    taken.map((g) => g.slug),
  );

  try {
    await prisma.group.create({
      data: { name: trimmed, slug, chatToken: newToken(), filesToken: newToken() },
    });
  } catch (err) {
    // uniqueSlug only checks the slugs that existed when we read them. A second
    // submission landing in between computes the same candidate and loses the
    // race — rare with one teacher, but the raw Prisma message is not something
    // to show her.
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      throw new Error("That name is already taken — try adding a surname.");
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
    throw new Error("Everyone can't be deleted.");
  }

  await prisma.group.deleteMany({ where: { id: groupId } });

  revalidatePath("/admin");
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

export async function deleteMessage(messageId: string) {
  await requireTeacher();
  await deleteMessageById(messageId);
  revalidatePath("/admin");
}

// Revoking a leaked bookmark. Both tokens move together: a link that leaked
// probably leaked from the same place as its sibling.
export async function regenerateStudentLinks(groupId: string) {
  await requireTeacher();

  await prisma.group.update({
    where: { id: groupId },
    data: { chatToken: newToken(), filesToken: newToken() },
  });

  // A token check only happens when a stream connects, so without this a tab
  // left open on a leaked link would keep receiving messages after the link
  // was supposedly revoked, until that connection happened to drop on its
  // own. Published after the update commits, so a stream that reconnects
  // immediately always sees the new token already in place.
  chatBus.publishRevoke(groupId);

  revalidatePath("/admin");
}

// Stamps the chat as read at the moment Jenn actually opens the panel, not
// whenever she happens to visit /admin/[slug] to edit a card — the two used
// to be conflated, which silently zeroed the unread badge for messages she
// never read.
export async function markChatRead(groupId: string) {
  await requireTeacher();
  await markTeacherRead(groupId);
  revalidatePath("/admin");
}
