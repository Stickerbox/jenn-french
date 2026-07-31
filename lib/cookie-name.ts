// Its own module, with no imports at all, because middleware runs on the Edge
// Runtime and importing it from lib/student-tokens.ts would drag Node's crypto
// into that bundle. That survives today only because the bundler stubs the
// unused import lazily — a module-level crypto call added to that file later
// would break every /g/* request, and nothing here would warn us.
export function cookieNameFor(slug: string): string {
  return `student-token-${slug}`;
}
