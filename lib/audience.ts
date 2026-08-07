// Who the admin DRAWS, which is not the same question as who exists. Exactly
// one group row carries `isEveryone`, and it is not a student: it has no chat,
// no whiteboard, no password and no email, and `studentGate` refuses it in its
// first clause. Listing it beside Marie and Luc invited Jenn to treat it as
// one.
//
// This module withholds controls. It grants nothing and it authorises nothing —
// every guard that reads `isEveryone` (chatRole, shelfRole, studentGate,
// worksheetOpenable) is untouched and keeps its present answers.

// The Students tab. A generic so a caller can pass its own row shape and get
// the same shape back, rather than the three fields this file cares about.
export function visibleStudents<T extends { isEveryone: boolean }>(
  groups: T[],
): T[] {
  return groups.filter((group) => !group.isEveryone);
}

export type AudienceOption = { id: string; label: string };

// The three audience forms — NewPageForm, AddLinkForm, PageEditor.
//
// The everyone row STAYS here, under a different name. Its job in this form is
// to name an audience, and it is a real one: a page assigned to it appears on
// every student's shelf through effectivePages. Removing it would end the
// ability to share one page with everyone, which is a feature and not a
// leftover.
//
// The label comes from the dictionary rather than from Group.name, so renaming
// the row in the database cannot change what the form says — and so the word is
// translated like every other word on the screen.
//
// It keeps its position rather than moving to the front. The list arrives
// sorted by name, and a second ordering rule here would be one more thing to
// keep in step with that one.
export function audienceOptions(
  groups: { id: string; name: string; isEveryone: boolean }[],
  allStudentsLabel: string,
): AudienceOption[] {
  return groups.map((group) => ({
    id: group.id,
    label: group.isEveryone ? allStudentsLabel : group.name,
  }));
}

// The Pages tab's student chips.
//
// Names, not rows, because that is the shape this list already has:
// `pageGroupNames` reads the names off the pages themselves and
// `filterPagesByGroup` matches on the name. Converting to rows here would mean
// converting back at the call site.
//
// The consequence of matching on a name is that an ordinary student named
// "Everyone" would lose their chip. That collision already exists inside
// filterPagesByGroup, which compares the same two strings, so this adds no new
// failure — it inherits one. Group.name is not unique; if that ever needs
// fixing, fix it in both places at once.
export function visibleGroupChips(
  names: string[],
  everyoneName: string | null,
): string[] {
  if (everyoneName === null) return names;
  return names.filter((name) => name !== everyoneName);
}
