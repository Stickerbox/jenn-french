import { firstNameOf } from "@/lib/student-greeting";

// The line a save posts into that student's conversation. It rides the existing
// unread dot and SSE stream, so it arrives wherever each party already looks and
// costs no new notification model.
//
// French on BOTH sides, which is the one place this codebase's English-for-Jenn
// split does not apply: the teacher inbox renders the same message the student
// reads, so there is one text and it belongs to the student's language.
//
// Posted as the party who saved — fromTeacher mirrors the slot — so the line
// still arrives on the correct side of the thread. But the copy itself is
// THIRD PERSON, naming who acted, not first person: the same string is read
// by both parties, and a first-person "mes réponses sont enregistrées" only
// reads correctly to the one who typed it — Jenn scanning her inbox saw her
// own words describing a student's save. Naming the actor moves that
// knowledge into the sentence, so the bubble's own side no longer has to
// carry it alone.
//
// The student's name is first-word-only — firstNameOf is the same rule
// greeting() draws, reused rather than re-split, because "Marie Dupont a
// terminé son devoir" reads like a report card, not a note in a chat. "Jenn"
// is hardcoded on the teacher branch, exactly as lib/version-labels.ts already
// hardcodes "La correction de Jenn" — there is exactly one teacher.
//
// "son devoir" is grammatically the WORKSHEET's gender (le devoir), not the
// student's: French has no gender-neutral third-person possessive, and this
// sidesteps needing one, since no student's gender is known here.
//
// No URL in the body any more. It used to sit at the end with nothing after
// it, and the bubble linkified it — now the caller passes the worksheet's
// address as createMessage's `href` and `automated: true` instead, and the
// bubble itself is the link (see components/chat/MessageList.tsx). Body is
// prose only, so it reads correctly with no trailing punctuation to reason
// about. Messages saved before this change still carry the old URL inside
// their body and still linkify it — see CLAUDE.md's Lesson chat note; nothing
// here rewrites them.
export function versionNotice(
  title: string,
  fromTeacher: boolean,
  studentName: string,
): string {
  if (fromTeacher) {
    return `Jenn a déposé sa correction de « ${title} »`;
  }

  const first = firstNameOf(studentName) ?? studentName;
  return `${first} a terminé son devoir : « ${title} »`;
}
