import type { Locale } from "@/lib/i18n";

// The first word of Group.name, which holds the student's full name. A greeting
// is the one place the full name reads wrong — "Bonjour Marie Dupont" is a
// summons, not a hello.
//
// The caller suppresses this on the everyone group: that row is named
// "Everyone", and "Bonjour Everyone" is wrong in both languages. The rule lives
// there rather than here because this module has no business knowing the flag.
//
// Locale used to be implicit — this always answered in French, because the
// student was always French and the teacher was always English (see
// teacherPageLabel below). That split is retired: BOTH now follow whoever is
// looking at the page, from their own browser, which is why this takes a
// locale instead of assuming one.
export function greeting(name: string, locale: Locale): string | null {
  const first = name.trim().split(/\s+/)[0];
  if (!first) return null;
  return locale === "en" ? `Hello ${first}` : `Bonjour ${first}`;
}

// The header line when the TEACHER is looking at a student's page — the whole
// name rather than the first word, the opposite of greeting(), deliberately. A
// greeting wants the first name because "Bonjour Marie Dupont" is a summons;
// this line wants the full one because her question is WHICH student, and two
// students can share a first name.
//
// The English possessive is always 's, including a name that ends in s —
// "Jonas's page". One rule with no special case, which is Chicago's position
// and is written down so the special case does not get added back as a fix.
// French needs no such branch: "de" carries the possessive regardless of how
// the name ends.
//
// The caller suppresses this on the everyone group, for the same reason it
// suppresses greeting() there: that row is named "Everyone" and this module has
// no business knowing about the flag.
export function teacherPageLabel(name: string, locale: Locale): string | null {
  const full = name.trim().split(/\s+/).join(" ");
  if (!full) return null;
  return locale === "en" ? `${full}'s page` : `La page de ${full}`;
}
