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

// The EDIT form's pills, and only that form's. `audienceOptions` above still
// carries the everyone row for the two create forms, so sharing one page with
// the whole class is still a thing Jenn can do — she just does it when the page
// is made, not afterwards.
//
// The consequence is stated plainly and was chosen knowingly: a page already
// assigned to the everyone group shows NO pill for it here, and saving keeps
// that assignment anyway, because `groupIds` starts from the stored list and
// nothing in this form can remove an id it never drew. So an everyone-share
// survives an edit and cannot be undone from this screen. The alternative —
// dropping ids with no pill — would mean a save meant to fix a typo silently
// pulled a page off every student's shelf, which is worse.
//
// That invisible id is also why `hasAudienceSelection` below compares against
// the DRAWN options rather than counting `groupIds`: without that, a page
// shared only with everyone would satisfy the "pick a student" rule while not
// a single pill was lit, which reads as the form being broken.
export function studentAudienceOptions(
  groups: { id: string; name: string; isEveryone: boolean }[],
): AudienceOption[] {
  return visibleStudents(groups).map((group) => ({
    id: group.id,
    label: group.name,
  }));
}

// Has she picked anybody? The three audience forms gate their submit on this.
//
// Against the OPTIONS ON SCREEN, not against `selected.length`. A selection
// the form cannot show is a selection she cannot change, so counting it would
// disable the message while leaving every pill grey — see the note above. It
// also means a form rendering no options at all answers false, which is
// correct: there is nobody to publish to yet.
export function hasAudienceSelection(
  selected: readonly string[],
  options: readonly AudienceOption[],
): boolean {
  return options.some((option) => selected.includes(option.id));
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
