import type { PageKind } from "@/lib/page-kind";

export type KindFilter = "all" | PageKind;

// Takes an already-resolved `kind` rather than the raw row: the query layer
// runs readPageKind once, so a component never sees the widened column.
export function filterPagesByKind<T extends { kind: PageKind }>(
  pages: T[],
  filter: KindFilter,
): T[] {
  if (filter === "all") return pages;
  return pages.filter((page) => page.kind === filter);
}
