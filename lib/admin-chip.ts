// Which student chip is active on the admin Pages tab.
//
// The row used to open with an "All" chip meaning *no filter*, and `null` was
// that state. It was removed on 2026-08-07: every page now reaches at least one
// student (the three audience forms refuse to save otherwise), so "everything"
// and "one student's shelf" stopped being a distinction worth a control — and
// "All" is not a shelf, which made it the one selection where pinning was dead
// and the Pinned section silently absent.
//
// With the chip gone there is no "nothing selected" state left to render, so
// this resolves one. It is a DERIVATION and not a state write, deliberately:
// the chip lives in AdminChrome, one component up, and setting a parent's state
// from a child's render is the "Cannot update a component while rendering a
// different component" error. The render-phase correction NewPageForm and
// PageEditor use works only on a component's own state.
//
// `names` is the row as drawn — `visibleGroupChips(pageGroupNames(pages))` —
// so the answer is always a chip that exists. Two cases fall to the first
// name: nothing chosen yet, and a chip that has gone stale because the last
// page under that student was deleted or renamed out from under it. A stale
// chip would otherwise filter the list to nothing with no lit chip to explain
// why, which reads as an empty shelf rather than as a dead filter.
export function resolveChip(
  chip: string | null,
  names: readonly string[],
): string | null {
  if (chip !== null && names.includes(chip)) return chip;
  // Null only when there is no row at all, which is the no-pages-yet case the
  // list already answers with its own empty state.
  return names[0] ?? null;
}
