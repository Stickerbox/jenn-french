// The first word of Group.name, which holds the student's full name. A greeting
// is the one place the full name reads wrong — "Bonjour Marie Dupont" is a
// summons, not a hello.
//
// The caller suppresses this on the everyone group: that row is named
// "Everyone", and "Bonjour Everyone" is wrong in both languages. The rule lives
// there rather than here because this module has no business knowing the flag.
export function greeting(name: string): string | null {
  const first = name.trim().split(/\s+/)[0];
  if (!first) return null;
  return `Bonjour ${first}`;
}
