import { prisma } from "@/lib/prisma";
import { savePage } from "@/lib/pages";
import { extractLinks } from "@/lib/chat-links";
import { titleFromUrl } from "@/lib/link-title";

// Whether this URL already reaches this shelf.
//
// The everyone group is in the OR because listPagesForGroup fetches both sets
// and hands them to effectivePages: a link Jenn put on the shared shelf is
// already on this student's, so a second copy on re-share would show the same
// URL twice in one grid.
async function alreadyShelved(groupId: string, url: string): Promise<boolean> {
  const existing = await prisma.page.findFirst({
    where: {
      url,
      kind: "link",
      groups: {
        some: { OR: [{ groupId }, { group: { isEveryone: true } }] },
      },
    },
    select: { id: true },
  });

  return existing !== null;
}

// Files every link in a chat message onto that conversation's shelf and returns
// the slugs it created.
//
// IT NEVER THROWS. Each URL is attempted on its own and a failure is dropped —
// the same degrade-rather-than-throw contract readSections, readOps,
// readPageKind and inlinePage's `skipped` have, for a stronger reason than any
// of them: the message is the thing being sent, and a link that could not be
// filed must not cost the sentence that mentioned it.
//
// A duplicate leaves the EXISTING row completely alone — its createdAt, its
// pin, its addedByStudent. Re-sharing a link is not a reason to reorder
// somebody's shelf.
export async function addChatLinks(input: {
  groupId: string;
  body: string;
  fromTeacher: boolean;
}): Promise<string[]> {
  const created: string[] = [];

  for (const url of extractLinks(input.body)) {
    try {
      if (await alreadyShelved(input.groupId, url)) continue;

      created.push(
        await savePage({
          slug: null,
          kind: "link",
          title: titleFromUrl(url),
          url,
          groupIds: [input.groupId],
          // Mirrors the sender, and this is not cosmetic: canStudentDelete
          // reads exactly this flag, so a link the student shared is one they
          // can remove and a link Jenn shared is not.
          //
          // It is also why this cannot simply call addShelfLink — that action
          // derives the flag from shelfRole reading cookies, and this caller
          // resolved the role already.
          addedByStudent: !input.fromTeacher,
        }),
      );
    } catch {
      // Dropped on purpose. See the contract above.
    }
  }

  return created;
}
