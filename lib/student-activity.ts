import { prisma } from "@/lib/prisma";
import { listPagesForGroup } from "@/lib/pages";
import { countUnseen, pageIsUnseen } from "@/lib/unseen";
import { homeworkStatus } from "@/lib/homework-status";
import type { SummaryCounts } from "@/lib/student-summary";

// Everything on a student's card EXCEPT the unread count.
//
// Unread is absent deliberately. listConversations already owns that number and
// the Students tab already calls it; computing it a second time here would be
// two query paths for one figure, which is exactly why unreadCounts was removed
// when listConversations absorbed it. The caller merges the two.
export type ActivityCounts = Omit<SummaryCounts, "unreadMessages">;

// The everyone group is absent rather than empty, matching listConversations:
// it has no deck, no checklist and a public shelf, so there is no student whose
// activity it would summarise.
//
// This runs 1 + 8N queries for N students against a SQLite file on the same
// box: four directly below, plus listPagesForGroup's own four (own pages,
// everyone's pages, pins, shelf versions). listConversations is 1 + 2N, so this
// is roughly four times its size — read its note as the argument rather than
// this line, because the SHAPE is what they share. Legible at one tutor's
// scale; if N ever justifies otherwise the thing to reach for is a maintained
// count column, with nothing outside this module changing.
//
// Two of those are knowingly redundant across students: the everyone-group half
// of listPagesForGroup returns the same rows every time, and the pageVersion
// read below covers a group listShelfVersions has just read. Both are cheap
// enough here that hoisting them would buy less than it complicated.
export async function listStudentActivity(
  // Passed in, never read as new Date() here: homeworkStatus needs it, and a
  // clock read buried in a read model is untestable from the outside.
  now: Date,
): Promise<Map<string, ActivityCounts>> {
  const groups = await prisma.group.findMany({
    where: { isEveryone: false },
    select: {
      id: true,
      teacherSeenFilesAt: true,
      teacherSeenDeckAt: true,
      teacherSeenTodoAt: true,
    },
  });

  const entries = await Promise.all(
    groups.map(async (group) => {
      const [flashcards, items, pages, versions, opens] = await Promise.all([
        prisma.flashcard.findMany({
          where: { groupId: group.id },
          select: { createdAt: true, fromTeacher: true },
        }),
        prisma.actionItem.findMany({
          where: { groupId: group.id, doneAt: { not: null } },
          select: { doneAt: true, doneByTeacher: true },
        }),
        // The EFFECTIVE shelf, which matters for the homework loop below: a
        // worksheet Jenn assigned to the whole class is still owed per student,
        // and inheritance is invisible to callers by design.
        //
        // It does NOT mean sharing one page lights every card. newFiles passes
        // viewerIsTeacher, so pageIsUnseen's author filter drops anything Jenn
        // added — her own upload is not news to her. What reaches that count is
        // the student's own additions and their saved versions.
        listPagesForGroup(group.id),
        // Queried here rather than taken from the `versions` listPagesForGroup
        // already folds onto each page, which does not carry sentAt. A separate
        // read keeps ShelfPage — and therefore FilesTab — untouched.
        prisma.pageVersion.findMany({
          where: { groupId: group.id },
          select: {
            pageId: true,
            fromTeacher: true,
            sentAt: true,
            updatedAt: true,
          },
        }),
        prisma.worksheetOpen.findMany({
          where: { groupId: group.id },
          select: { pageId: true, openedAt: true },
        }),
      ]);

      const openedAt = new Map(opens.map((open) => [open.pageId, open.openedAt]));
      const byPage = new Map<string, typeof versions>();
      for (const version of versions) {
        const list = byPage.get(version.pageId) ?? [];
        list.push(version);
        byPage.set(version.pageId, list);
      }

      let toCorrect = 0;
      let started = 0;
      let notOpened = 0;

      for (const page of pages) {
        if (!page.worksheet) continue;
        // worksheetOpenable already refuses a link, so a flagged link can never
        // have a version or an open — left in it would sit on the card as "not
        // opened" forever with no way to clear it.
        //
        // Compared directly rather than through readPageKind: listPagesForGroup
        // has already resolved every row's kind through it, and resolving a
        // resolved value a second time invites the two answers drifting.
        if (page.kind === "link") continue;

        const rows = byPage.get(page.id) ?? [];

        // The three-slot rule means at most one row per party, enforced by
        // @@unique([pageId, groupId, fromTeacher]) — so `find` is exact rather
        // than a first-of-many.
        const student = rows.find((row) => !row.fromTeacher);
        const teacher = rows.find((row) => row.fromTeacher);

        const state = homeworkStatus({
          openedAt: openedAt.get(page.id) ?? null,
          // Row existence, not sentAt: an unannounced save still proves they
          // opened it. The two questions are different and this is the only
          // place that asks the first one.
          studentSaved: student !== undefined,
          studentSentAt: student?.sentAt ?? null,
          teacherSavedAt: teacher?.updatedAt ?? null,
          now,
        });

        if (state === "awaiting-correction") toCorrect += 1;
        else if (state === "started") started += 1;
        else if (state === "not-opened") notOpened += 1;
      }

      const counts: ActivityCounts = {
        toCorrect,
        started,
        notOpened,

        newFlashcards: countUnseen(
          flashcards.map((card) => ({
            at: card.createdAt,
            fromTeacher: card.fromTeacher,
          })),
          group.teacherSeenDeckAt,
          true,
        ),

        // filter().length and not a count query: pageIsUnseen is the shelf's one
        // predicate, and a page that was added AND had a version saved to it is
        // one unseen file rather than two. A ShelfPage satisfies UnseenPage as
        // it stands — its own comment says so — so the row goes in whole rather
        // than being rebuilt from the query above.
        newFiles: pages.filter((page) =>
          pageIsUnseen(page, group.teacherSeenFilesAt, true),
        ).length,

        // flatMap rather than a non-null assertion: the where clause guarantees
        // doneAt, and the type does not.
        //
        // A row ticked before this shipped has a null doneByTeacher and reads as
        // the student's. It never reaches the count anyway — the migration
        // backfilled every watermark to a time after those ticks.
        itemsDone: countUnseen(
          items.flatMap((item) =>
            item.doneAt
              ? [{ at: item.doneAt, fromTeacher: item.doneByTeacher ?? false }]
              : [],
          ),
          group.teacherSeenTodoAt,
          true,
        ),
      };

      return [group.id, counts] as const;
    }),
  );

  return new Map(entries);
}
