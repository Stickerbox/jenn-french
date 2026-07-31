import { slugify, uniqueSlug } from "@/lib/page-slug";

// Jenn types a name; she never types a slug. Lowercasing alone is not enough —
// "Marie Dupont" would become "marie dupont", and that string ends up in a URL
// path AND in a cookie name (`student-token-…`), where a space produces a
// broken link and a malformed Set-Cookie header. slugify already handles this
// for page titles, accents and ligatures included, so this reuses that rule
// rather than growing a second one that would drift from it.
export function studentSlug(name: string, taken: string[]): string {
  return uniqueSlug(slugify(name), taken);
}
