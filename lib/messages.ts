import { prisma } from "@/lib/prisma";
import { chatBus } from "@/lib/chat-bus";

export type StoredMessage = {
  id: string;
  groupId: string;
  fromTeacher: boolean;
  body: string;
  createdAt: Date;
};

const SELECT = {
  id: true,
  groupId: true,
  fromTeacher: true,
  body: true,
  createdAt: true,
} as const;

export function listMessages(groupId: string): Promise<StoredMessage[]> {
  return prisma.message.findMany({
    where: { groupId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: SELECT,
  });
}

// All queries use a total order on (createdAt, id), so "after" is well-defined
// even when multiple messages land in the same millisecond. Comparison is
// lexicographic: either createdAt is strictly later, or it is equal and id is
// strictly larger. cuid values are not chronological, but id is unique and
// stable, which is all a tiebreaker needs. SSE reconnects hand back the last id
// seen; without this ordering, a message sharing a millisecond with the anchor
// would be silently lost forever on every future reconnect.
export async function messagesAfter(
  groupId: string,
  afterId: string,
): Promise<StoredMessage[]> {
  const anchor = await prisma.message.findUnique({
    where: { id: afterId },
    select: { createdAt: true },
  });
  // An unknown id means the client is holding something we no longer have —
  // a deleted message, or another deployment's data. Replaying everything is
  // the safe answer: the client de-duplicates by id.
  if (!anchor) return listMessages(groupId);

  return prisma.message.findMany({
    where: {
      groupId,
      // Lexicographic on (createdAt, id). A strict `gt` on createdAt alone
      // drops a message that shares a millisecond with the anchor, and drops
      // it on every future reconnect rather than just once — the client would
      // never see it again. id is a cuid, so it is not chronological, but it
      // is unique and stable, which is all a tiebreaker has to be.
      OR: [
        { createdAt: { gt: anchor.createdAt } },
        { createdAt: anchor.createdAt, id: { gt: afterId } },
      ],
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: SELECT,
  });
}

export async function createMessage(
  groupId: string,
  fromTeacher: boolean,
  body: string,
): Promise<StoredMessage> {
  const message = await prisma.message.create({
    data: { groupId, fromTeacher, body },
    select: SELECT,
  });

  // Published after the write, never before: a viewer that received a message
  // the database then failed to store would show something nobody can reload.
  chatBus.publish(groupId, message);
  return message;
}

// One grouped query rather than one per student — the Students tab renders
// every group at once.
export async function unreadCounts(): Promise<Map<string, number>> {
  const groups = await prisma.group.findMany({
    where: { isEveryone: false },
    select: { id: true, teacherLastReadAt: true },
  });

  const counts = new Map<string, number>();
  for (const group of groups) {
    counts.set(
      group.id,
      await prisma.message.count({
        where: {
          groupId: group.id,
          fromTeacher: false,
          ...(group.teacherLastReadAt
            ? { createdAt: { gt: group.teacherLastReadAt } }
            : {}),
        },
      }),
    );
  }
  return counts;
}

export async function markTeacherRead(groupId: string): Promise<void> {
  await prisma.group.update({
    where: { id: groupId },
    data: { teacherLastReadAt: new Date() },
  });
}

// deleteMany rather than delete, matching this codebase's convention: a
// double-click or a stale tab is a no-op rather than a P2025.
export async function deleteMessageById(id: string): Promise<void> {
  await prisma.message.deleteMany({ where: { id } });
}
