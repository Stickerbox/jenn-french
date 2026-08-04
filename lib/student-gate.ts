// Which of six states a visitor to /g/[slug] is in. A third sibling of
// chatRole (lib/chat-access.ts) and shelfRole (lib/shelf-access.ts), written
// here rather than inline in the page for the reason chatRole gives: a rule
// duplicated across two files is a rule that will eventually differ in one of
// them, and the difference would be a hole rather than a bug report.
export type StudentGate =
  | "none" // nothing to sign in to
  | "signed-in" // the old `unlocked`
  | "unclaimed" // teacher, student has not signed up yet
  | "teacher-stale" // teacher, claimed, her token is out of date
  | "signup" // holds a live invite, no account yet
  | "login"; // everyone else

// The ORDER of these clauses is the specification. Each comment records the
// failure that put the clause where it is.
export function studentGate(input: {
  isTeacher: boolean;
  isEveryone: boolean;
  chatToken: string | null;
  presented: string | null;
  claimed: boolean;
}): StudentGate {
  // Refused first, as chatRole refuses it, so that no later clause can admit
  // the everyone group by accident. It has no chatToken, so there is nothing to
  // sign in to and never will be.
  if (input.isEveryone || input.chatToken === null) return "none";

  // chatToken is non-null past the clause above, which is what makes this
  // comparison safe: a group with no token must never be enterable by
  // presenting the string "null".
  const holdsToken = input.presented === input.chatToken;

  if (holdsToken && input.claimed) return "signed-in";

  // Jenn opens student pages from the admin, with ?k= in the URL. Without this
  // clause she would be handed the sign-up form for a student who has not
  // signed up yet — and could complete it, claiming their account herself.
  if (input.isTeacher && !input.claimed) return "unclaimed";

  // A claim rotates the chatToken, so her stored cookie for that slug goes
  // stale the moment a student signs up. Without this clause she would land on
  // her own student's page and be shown a *student sign-in form*, which invites
  // exactly the wrong action. The admin's link always carries the current
  // token, so this is a one-click fix.
  if (input.isTeacher) return "teacher-stale";

  if (holdsToken) return "signup";

  // Not a fallback — a security requirement. The form renders identically
  // whether or not this student has an account, so its presence cannot tell
  // someone guessing slugs which students exist and which are still claimable.
  return "login";
}
