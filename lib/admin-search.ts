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

export function filterGroups<T extends SearchableGroup>(
  groups: T[],
  query: string,
): T[] {
  if (query.trim() === "") return groups;
  return groups.filter((group) => matches(query, [group.name, group.slug]));
}
