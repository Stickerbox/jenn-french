// Its own module, with no imports at all, because middleware runs on the Edge
// Runtime and importing it from lib/student-tokens.ts would drag Node's crypto
// into that bundle. That survives today only because the bundler stubs the
// unused import lazily — a module-level crypto call added to that file later
// would break every /g/* request, and nothing here would warn us.
//
// Exported so lib/landing-redirect.ts can recognise a student cookie by its
// prefix without importing this module's logic twice — a bare string constant
// is as dependency-free as this file already is.
export const STUDENT_TOKEN_PREFIX = "student-token-";

export function cookieNameFor(slug: string): string {
  return `${STUDENT_TOKEN_PREFIX}${slug}`;
}
