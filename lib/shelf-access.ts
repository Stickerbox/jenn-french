import type { PageKind } from "@/lib/page-kind";

export type ShelfRole = "teacher" | "student" | null;

// A sibling of chatRole, deliberately ordered differently. chatRole refuses the
// everyone group BEFORE it checks the teacher, so that not even Jenn can open a
// conversation there by accident. That is right for a conversation and wrong
// for curation — the shared shelf is hers to fill and to pin, and reusing
// chatRole here would lock her out of a workflow she already has for pages.
export function shelfRole(input: {
  isTeacher: boolean;
  isEveryone: boolean;
  chatToken: string | null;
  presented: string | null;
}): ShelfRole {
  if (input.isTeacher) return "teacher";

  // A student can never write to the everyone shelf. Its chatToken is null so
  // no token could match anyway; the flag is checked as well so the guarantee
  // does not rest on a data invariant a later migration could quietly break.
  if (input.isEveryone) return null;

  // Both halves must be present, for the reason chatRole gives: a group with no
  // token must not be enterable by presenting the string "null".
  if (input.chatToken && input.presented === input.chatToken) return "student";

  return null;
}

// Which rows a student may remove from their own shelf. Both remaining
// conditions matter: the second is what makes the first safe, because a Page
// row is shared and deleting one assigned to several groups removes it from all
// of them at once.
//
// The kind is deliberately no longer checked. It used to stand in for "a
// student could only have added a link", which stopped being true when they
// gained the ability to publish a page. `addedByStudent` says the same thing
// directly and keeps saying it if a third kind ever appears.
export function canStudentDelete(
  page: { kind: PageKind; addedByStudent: boolean; groupIds: string[] },
  groupId: string,
): boolean {
  if (!page.addedByStudent) return false;
  return page.groupIds.length === 1 && page.groupIds[0] === groupId;
}
