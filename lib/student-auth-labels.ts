import {
  MIN_PASSWORD_LENGTH,
  type CredentialProblem,
} from "@/lib/student-credentials";

// French, because the student reads these. Kept beside the rules rather than
// inside them for the reason lib/page-section-labels.ts exists: the rule is one
// thing and the language it is announced in is another.

export function credentialProblemLabel(problem: CredentialProblem): string {
  switch (problem) {
    case "bad-email":
      return "Ce courriel ne semble pas valide.";
    case "too-short":
      // Interpolated rather than written out, so raising the minimum cannot
      // leave the sentence claiming the old one.
      return `Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères.`;
    case "too-long":
      return "Ce mot de passe est trop long.";
  }
}

// One message for every sign-in failure — wrong courriel, wrong mot de passe, or
// a student who has no account at all. Naming both halves is the point: it
// cannot reveal which one was wrong, and so cannot tell someone guessing slugs
// which students exist.
export const SIGN_IN_FAILED =
  "Le courriel ou le mot de passe ne correspond pas.";

export const TOO_MANY_TRIES =
  "Trop d'essais. Réessayez dans quinze minutes ou écrivez à Jenn.";

// Shown when an invite has already been spent. Jenn is named because she is the
// only recovery — nothing here sends email.
export const INVITE_USED =
  "Ce lien a déjà été utilisé. Écrivez à Jenn pour en recevoir un nouveau.";

export const GENERIC_FAILURE = "Une erreur est survenue. Réessayez.";
