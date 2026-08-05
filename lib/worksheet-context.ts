import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getCurrentTeacher } from "@/lib/session";
import { chatRole } from "@/lib/chat-access";
import { readToken, cookieNameFor } from "@/lib/student-tokens";
import { readPageKind } from "@/lib/page-kind";
import { worksheetOpenable } from "@/lib/worksheet-access";

export type WorksheetContext = {
  group: { id: string; name: string; slug: string };
  page: { id: string; slug: string; title: string; kind: "html" | "pdf" };
  role: "teacher" | "student";
};

// One answer for the three routes that need it, written here rather than inline
// in each for the reason chatRole gives about itself: a rule duplicated across
// three files is a rule that will eventually differ in one of them, and the
// difference would be a hole rather than a bug report.
//
// chatRole is reused VERBATIM. Its clause order is already what this needs — it
// refuses the everyone group before it checks the teacher, so neither party can
// save a version on /g/all, where there is no student for one to belong to.
export async function resolveWorksheet(
  groupSlug: string,
  pageSlug: string,
): Promise<WorksheetContext | null> {
  const group = await prisma.group.findUnique({
    where: { slug: groupSlug },
    select: { id: true, name: true, slug: true, isEveryone: true, chatToken: true },
  });
  if (!group) return null;

  const teacher = await getCurrentTeacher();
  const cookieStore = await cookies();
  const role = chatRole({
    isTeacher: Boolean(teacher),
    isEveryone: group.isEveryone,
    chatToken: group.chatToken,
    presented: readToken(
      undefined,
      cookieStore.get(cookieNameFor(group.slug))?.value,
    ),
  });

  const page = await prisma.page.findUnique({
    where: { slug: pageSlug },
    select: {
      id: true,
      slug: true,
      title: true,
      kind: true,
      url: true,
      pdfSize: true,
      worksheet: true,
      groups: {
        select: { group: { select: { id: true, isEveryone: true } } },
      },
    },
  });
  if (!page) return null;

  // The effective shelf, not the assignment list: a page shared with everyone
  // is a page this student has, and effectivePages is what makes that true on
  // the shelf itself.
  const onShelf = page.groups.some(
    (row) => row.group.id === group.id || row.group.isEveryone,
  );

  const kind = readPageKind(page);
  if (!worksheetOpenable({ role, worksheet: page.worksheet, kind, onShelf })) {
    return null;
  }
  // Narrowed by worksheetOpenable, which refuses "link" — restated here because
  // the compiler cannot follow it through a boolean.
  if (kind === "link" || !role) return null;

  return {
    group: { id: group.id, name: group.name, slug: group.slug },
    page: { id: page.id, slug: page.slug, title: page.title, kind },
    role,
  };
}
