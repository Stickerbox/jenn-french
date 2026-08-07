import type { KindFilter } from "@/lib/page-filters";
import type { PageSort } from "@/lib/page-sort";

// What the shelf opens with. Named rather than written as two literals inside
// FilesTab's useState calls, because the disclosure's dot compares against
// exactly these values and a default that moved in one place and not the other
// would light the dot on a shelf nobody had touched.
export const DEFAULT_KIND: KindFilter = "all";
export const DEFAULT_SORT: PageSort = "created";

// Whether a HIDDEN control is doing something.
//
// This exists because the chip rows are closed by default. A filtered list is
// a short list, and with the controls out of sight there is nothing on screen
// to explain why — which reads as a fault rather than as a filter. The
// disclosure draws a dot on its icon when this answers true.
//
// A function rather than two comparisons written inline, so a third filter
// added later has one place to be added to instead of being silently missed.
export function filtersAreActive(state: {
  kind: KindFilter;
  sort: PageSort;
}): boolean {
  return state.kind !== DEFAULT_KIND || state.sort !== DEFAULT_SORT;
}
