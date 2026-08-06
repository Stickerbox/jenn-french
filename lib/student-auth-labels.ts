import {
  MIN_PASSWORD_LENGTH,
  type CredentialProblem,
} from "@/lib/student-credentials";
import type { Strings } from "@/lib/strings";

// Used to be hardcoded French, because the student was always French. It now
// takes the resolved dictionary instead of picking a language itself: the
// server actions in app/student-auth-actions.ts read their own locale and
// call getStrings once, and this client-reachable pre-check
// (StudentAuthPanel's convenience validation, run before the action) is handed
// the same object as a prop rather than re-deriving it — a client component
// cannot call headers().
export function credentialProblemLabel(
  problem: CredentialProblem,
  strings: Strings,
): string {
  const auth = strings.student.auth;
  switch (problem) {
    case "bad-email":
      return auth.badEmail;
    case "too-short":
      // Interpolated rather than written into either sentence, so raising the
      // minimum cannot leave one language claiming the old one.
      return auth.tooShort(MIN_PASSWORD_LENGTH);
    case "too-long":
      return auth.tooLong;
  }
}
