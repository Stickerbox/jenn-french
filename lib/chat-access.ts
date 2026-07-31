export type ChatRole = "teacher" | "student" | null;

// One answer for both the POST route and the SSE route. Written here rather
// than inline in each because a rule duplicated across two files is a rule
// that will eventually differ in one of them, and the difference would be a
// hole rather than a bug report.
export function chatRole(input: {
  isTeacher: boolean;
  isEveryone: boolean;
  chatToken: string | null;
  presented: string | null;
}): ChatRole {
  // The everyone group has no conversation to join. Checked first, so not even
  // the teacher can open one there by accident.
  if (input.isEveryone) return null;

  if (input.isTeacher) return "teacher";

  // Both halves must be present: a group with no token cannot be entered by
  // presenting the string "null", and a visitor with no token cannot match a
  // group that happens to have none.
  if (input.chatToken && input.presented === input.chatToken) return "student";

  return null;
}
