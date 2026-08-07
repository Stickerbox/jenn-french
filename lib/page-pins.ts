export type ShelfPin = { pageId: string; pinnedAt: Date };

// Which shelves may carry a pin at all.
//
// A pin orders ONE shelf — `PagePin` is keyed (page, group) and pins
// deliberately do not inherit, so a pin on the shared shelf showed at `/g/all`
// and nowhere else. Reaching it meant selecting the everyone chip in the admin
// Pages tab, and that chip was removed on 2026-08-07 because it drew the
// shared group as if it were a student.
//
// Rather than leave a capability the UI could no longer reach, pinning there is
// retired: a pin is a per-student ordering. The rows that existed were deleted
// by prisma/migrations/20260807160000_drop_everyone_pins.
//
// A separate predicate rather than a clause inside shelfRole, and that
// distinction is load-bearing. shelfRole answers "may this caller WRITE to this
// shelf", and it answers "teacher" before it looks at isEveryone ON PURPOSE —
// its own comment says the shared shelf is hers to fill. Jenn must keep being
// able to put pages and links there. Only the ORDERING is withdrawn.
export function canPinToShelf(group: { isEveryone: boolean }): boolean {
  return !group.isEveryone;
}

// Folds one shelf's pins onto its pages. Pins are per-(page, group), so the
// same page carries a different pinnedAt on two students' shelves — and
// sectionPages, which only ever reads `pinnedAt`, needs no knowledge of that.
export function applyPins<T extends { id: string }>(
  pages: T[],
  pins: ShelfPin[],
): (T & { pinnedAt: Date | null })[] {
  const byPage = new Map(pins.map((pin) => [pin.pageId, pin.pinnedAt]));
  return pages.map((page) => ({
    ...page,
    pinnedAt: byPage.get(page.id) ?? null,
  }));
}
