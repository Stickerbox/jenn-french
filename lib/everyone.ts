// The row that already exists in production. Read by the migration's seed and
// by its create-if-absent fallback, and nowhere else — every rule keys off the
// flag below, not off this string.
export const EVERYONE_SLUG = "all";
export const EVERYONE_NAME = "Everyone";

// A predicate rather than an inline check in deleteGroup, because this is the
// one rule here whose failure is silent and wide: that row is what assembles
// every student's shelf, so removing it empties all of them at once and
// nothing reports an error.
export function canDeleteGroup(group: { isEveryone: boolean; [key: string]: unknown }): boolean {
  return !group.isEveryone;
}
