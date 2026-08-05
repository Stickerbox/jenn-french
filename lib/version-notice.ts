// The line a save posts into that student's conversation. It rides the existing
// unread dot and SSE stream, so it arrives wherever each party already looks and
// costs no new notification model.
//
// French on BOTH sides, which is the one place this codebase's English-for-Jenn
// split does not apply: the teacher inbox renders the same message the student
// reads, so there is one text and it belongs to the student's language.
//
// Posted as the party who saved — fromTeacher mirrors the slot — so the line
// reads as something they said rather than as a system banner.
export function versionNotice(title: string, fromTeacher: boolean): string {
  return fromTeacher
    ? `J'ai corrigé « ${title} ».`
    : `« ${title} » : mes réponses sont enregistrées.`;
}
