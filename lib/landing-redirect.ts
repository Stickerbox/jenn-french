import { STUDENT_TOKEN_PREFIX } from "@/lib/cookie-name";

// The escape hatch for the redirect in app/page.tsx. A student or Jenn who
// deliberately wants the marketing page — to send someone the link, say —
// needs a way back to it that does not depend on clearing cookies.
export const STAY_PARAM = "stay";
export const STAY_VALUE = "1";

export function wantsLanding(stay: string | string[] | undefined): boolean {
  return stay === STAY_VALUE;
}

// One student has exactly one chatToken and therefore exactly one
// student-token-<slug> cookie — see the decision recorded in the redesign
// plan. That means there is nothing to disambiguate here: the first matching
// name is taken and a second is never looked for.
export function studentSlugFromCookies(names: string[]): string | null {
  const match = names.find((name) => name.startsWith(STUDENT_TOKEN_PREFIX));
  if (!match) return null;
  return match.slice(STUDENT_TOKEN_PREFIX.length);
}
