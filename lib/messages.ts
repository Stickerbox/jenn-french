import { prisma } from "@/lib/prisma";
import { chatBus } from "@/lib/chat-bus";

// The quoted message, inlined rather than a second round trip: MessageList
// draws the quote from what it already has, and the SSE route stringifies
// this whole select, so a nested query here is a nested payload there for
// free — no separate fetch when a reply arrives live.
export type QuotedMessage = { id: string; body: string; fromTeacher: boolean };

export type StoredMessage = {
  id: string;
  groupId: string;
  fromTeacher: boolean;
  body: string;
  // True for a message this app posted itself, never one either party typed —
  // see versionNotice and the schema comment on Message.automated.
  automated: boolean;
  // Structural, not a substring of body: where an automated message points,
  // when it points anywhere.
  href: string | null;
  replyToId: string | null;
  // Null both when there is no quote and when the quoted row was deleted —
  // replyToId SetNull on delete, so the two cases are indistinguishable here
  // by design: a reply whose quote is gone still has its own text.
  replyTo: QuotedMessage | null;
  createdAt: Date;
};

const SELECT = {
  id: true,
  groupId: true,
  fromTeacher: true,
  body: true,
  automated: true,
  href: true,
  replyToId: true,
  replyTo: {
    select: { id: true, body: true, fromTeacher: true },
  },
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

// The teacher stream's replay. Same (createdAt, id) total order as the
// per-group version, and the same reason for it: a message sharing a
// millisecond with the anchor would otherwise be dropped on every future
// reconnect, not just once.
//
// Two deliberate differences from messagesAfter:
//
// 1. An unknown anchor returns NOTHING rather than falling back to everything.
//    "Everything" there is one conversation; here it is every conversation Jenn
//    has ever had, and shipping it is precisely the cost this stream exists to
//    avoid. She loses nothing: the list comes down with the page and selecting
//    a conversation loads its own history.
// 2. It is capped. A tab left open on a sleeping laptop can accumulate an
//    unbounded gap, and the cap keeps a reconnect from becoming a table scan.
//    Ordered DESC and reversed so the cap drops the OLDEST of the gap — the
//    newest are what a live view is for, and anything dropped is still in the
//    database behind the conversation's own history load.
const MAX_REPLAY = 500;

export async function messagesAfterAll(
  afterId: string,
): Promise<StoredMessage[]> {
  const anchor = await prisma.message.findUnique({
    where: { id: afterId },
    select: { createdAt: true },
  });
  if (!anchor) return [];

  const newest = await prisma.message.findMany({
    where: {
      // The everyone group has no conversation. No message can exist for it —
      // chatRole refuses the POST route before anything else — but the query
      // mirrors the access rule rather than assuming the other end held.
      group: { isEveryone: false },
      OR: [
        { createdAt: { gt: anchor.createdAt } },
        { createdAt: anchor.createdAt, id: { gt: afterId } },
      ],
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: MAX_REPLAY,
    select: SELECT,
  });

  // Reversed on the way out: SSE has to arrive oldest-first, and the client
  // appends in the order it receives.
  return newest.reverse();
}

// An options object rather than positional booleans, so a caller cannot add
// automated: true and forget href, or add a reply without noticing there is
// now something to add — the two new fields are optional and default to a
// plain human message, but they are named at every call site rather than
// slotted in by position.
export type CreateMessageInput = {
  groupId: string;
  fromTeacher: boolean;
  body: string;
  automated?: boolean;
  href?: string | null;
  replyToId?: string | null;
};

export async function createMessage(
  input: CreateMessageInput,
): Promise<StoredMessage> {
  const message = await prisma.message.create({
    data: {
      groupId: input.groupId,
      fromTeacher: input.fromTeacher,
      body: input.body,
      automated: input.automated ?? false,
      href: input.href ?? null,
      replyToId: input.replyToId ?? null,
    },
    select: SELECT,
  });

  // Published after the write, never before: a viewer that received a message
  // the database then failed to store would show something nobody can reload.
  chatBus.publish(input.groupId, message);
  return message;
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
