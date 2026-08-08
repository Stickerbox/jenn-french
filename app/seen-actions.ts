"use server";

import { cookies } from "next/headers";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentTeacher } from "@/lib/session";
import { chatRole, type ChatRole } from "@/lib/chat-access";
import { readToken, cookieNameFor } from "@/lib/student-tokens";

// The three tabs that carry a dot. Not `card` and not `board`: the card is the
// same global card for everyone, and a board is Jenn's to draw.
export type SeenSurface = "files" | "deck" | "todo";

// Which column each (role, surface) pair writes.
//
// A lookup table and NOT a name assembled from the argument. A column name
// built by concatenation is a column name the caller steers, and this action is
// reachable by both parties — the same reason addActionItem takes its author
// from the role rather than from the request.
const COLUMN = {
  teacher: {
    files: "teacherSeenFilesAt",
    deck: "teacherSeenDeckAt",
    todo: "teacherSeenTodoAt",
  },
  student: {
    files: "studentSeenFilesAt",
    deck: "studentSeenDeckAt",
    todo: "studentSeenTodoAt",
  },
} as const satisfies Record<
  Exclude<ChatRole, null>,
  Record<SeenSurface, keyof Prisma.GroupUpdateInput>
>;

// Resolves the caller's role without throwing. requireDeckRole in
// app/deck-actions.ts throws, which is right for an action somebody pressed;
// everything in this file is fired unawaited from an effect, where a throw is
// an uncaught rejection in the browser with nothing to catch it and nothing to
// show. markFlashcardViewed makes the same trade for the same reason.
async function readRole(groupId: string): Promise<ChatRole> {
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: { slug: true, isEveryone: true, chatToken: true },
  });
  if (!group) return null;

  const cookieStore = await cookies();
  // chatRole and not shelfRole. It refuses the everyone group before it checks
  // anything else, so /g/all gets no watermarks — correct, because there is no
  // student there for a visit to belong to.
  return chatRole({
    isTeacher: Boolean(await getCurrentTeacher()),
    isEveryone: group.isEveryone,
    chatToken: group.chatToken,
    presented: readToken(
      undefined,
      cookieStore.get(cookieNameFor(group.slug))?.value,
    ),
  });
}

// A WRITE ON READ, and the second one in this codebase. markFlashcardViewed is
// the first and this follows it on both of the things that matter.
//
// It does NOT revalidate. The dot stays while the reader is on the tab and
// clears on the next navigation, which is when it matters. Revalidating would
// clear the dot out from under the person still looking at what it pointed to.
//
// It returns silently on every refusal rather than throwing, for the reason
// readRole gives above.
export async function markTabSeen(
  groupId: string,
  surface: SeenSurface,
): Promise<void> {
  const role = await readRole(groupId);
  if (!role) return;

  await prisma.group.update({
    where: { id: groupId },
    data: { [COLUMN[role][surface]]: new Date() },
  });
}

// REFUSED FOR THE TEACHER, exactly as markFlashcardViewed is, and for a
// stronger reason: this feeds a bullet that says whether the STUDENT has looked
// at their homework. Jenn opening it to write a correction is not the student
// opening it, and stamping here would tell her they had started work they have
// never seen.
export async function markWorksheetOpened(
  groupId: string,
  pageId: string,
): Promise<void> {
  const role = await readRole(groupId);
  if (role !== "student") return;

  // Rewritten on each open, so the row means "last opened" rather than
  // "opened once". Nothing reads the value except homeworkStatus, which only
  // asks whether it is there — but a stale timestamp in a table is a fact
  // waiting to be believed.
  await prisma.worksheetOpen.upsert({
    where: { pageId_groupId: { pageId, groupId } },
    create: { pageId, groupId, openedAt: new Date() },
    update: { openedAt: new Date() },
  });
}
