import { prisma } from "@/lib/prisma";

export type ConversationSummary = {
  groupId: string;
  name: string;
  slug: string;
  unread: number;
  // Has this student signed up (2026-08-03 student sign-in). The same fact
  // studentGate calls `claimed`, read from the same column and deliberately not
  // re-derived: two definitions of "signed up" would eventually differ, and the
  // difference would be a composer pointed at someone who cannot read it.
  //
  // A boolean, not the hash. passwordHash must never leave the server.
  claimed: boolean;
  lastMessage: {
    body: string;
    fromTeacher: boolean;
    createdAt: Date;
  } | null;
};

// Enough that the CSS clamp is what visibly truncates the preview, small enough
// that a 2000-character message is not shipped to draw a list row.
const PREVIEW_CHARS = 200;

// The everyone group is absent, not empty: chatRole refuses it before it checks
// anything else, so it has no conversation to list.
export async function listConversations(): Promise<ConversationSummary[]> {
  const groups = await prisma.group.findMany({
    where: { isEveryone: false },
    select: {
      id: true,
      name: true,
      slug: true,
      teacherLastReadAt: true,
      // Selected only to be turned into a boolean below. It is never returned,
      // never logged, and never crosses the RSC boundary.
      passwordHash: true,
    },
    orderBy: { name: "asc" },
  });

  // 2N queries, where N is the number of students Jenn teaches, against a
  // SQLite file on the same box. A single-query version needs either a window
  // function — this project has no raw SQL anywhere — or the message table
  // pulled into JS and reduced, which gets worse as the log grows and retention
  // is forever. If N ever justifies otherwise, the shape to reach for is a
  // lastMessageAt column maintained on write, and nothing outside this function
  // would change.
  return Promise.all(
    groups.map(async (group) => {
      const [last, unread] = await Promise.all([
        prisma.message.findFirst({
          where: { groupId: group.id },
          // (createdAt, id) descending — the same total order everything else
          // here uses, so "the last message" means one thing project-wide.
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          select: { body: true, fromTeacher: true, createdAt: true },
        }),
        prisma.message.count({
          where: {
            groupId: group.id,
            fromTeacher: false,
            ...(group.teacherLastReadAt
              ? { createdAt: { gt: group.teacherLastReadAt } }
              : {}),
          },
        }),
      ]);

      return {
        groupId: group.id,
        name: group.name,
        slug: group.slug,
        unread,
        claimed: group.passwordHash !== null,
        lastMessage: last
          ? { ...last, body: last.body.slice(0, PREVIEW_CHARS) }
          : null,
      };
    }),
  );
}
