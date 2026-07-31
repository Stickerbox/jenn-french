// Both the query and the field go through this, so "passe" finds "passé" and
// "passé" finds "passe". Almost every title Jenn writes has an accent in it,
// and a search box that demands the right accent is a search box she cannot
// use.
export function normalise(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

export type SearchablePage = { title: string; groupNames: string[] };

export type SearchableGroup = { name: string; slug: string };

function matches(query: string, fields: string[]): boolean {
  const needle = normalise(query);
  return fields.some((field) => normalise(field).includes(needle));
}

export function filterPages<T extends SearchablePage>(
  pages: T[],
  query: string,
): T[] {
  if (query.trim() === "") return pages;
  return pages.filter((page) =>
    matches(query, [page.title, ...page.groupNames]),
  );
}

// Built from the pages themselves rather than from the full group list, so a
// group with nothing in it never offers a filter chip that empties the screen.
export function pageGroupNames<T extends SearchablePage>(pages: T[]): string[] {
  return [...new Set(pages.flatMap((page) => page.groupNames))].sort((a, b) =>
    a.localeCompare(b, "fr-CA"),
  );
}

// Exact match, deliberately not the accent-insensitive compare the search box
// uses: this name arrived from a chip built out of the data, not from someone
// typing it, so a near-miss here would mean the chip list is wrong.
export function filterPagesByGroup<T extends SearchablePage>(
  pages: T[],
  groupName: string | null,
): T[] {
  if (groupName === null) return pages;
  return pages.filter((page) => page.groupNames.includes(groupName));
}

export function filterGroups<T extends SearchableGroup>(
  groups: T[],
  query: string,
): T[] {
  if (query.trim() === "") return groups;
  return groups.filter((group) => matches(query, [group.name, group.slug]));
}
