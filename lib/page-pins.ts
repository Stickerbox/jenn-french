export type ShelfPin = { pageId: string; pinnedAt: Date };

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
