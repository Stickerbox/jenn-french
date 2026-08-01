// The Pages tab's active student chip, as a group id the editor can pre-tick.
// Returns one id rather than a list because the chip row is single-select.
export function defaultGroupId(
  activeChip: string | null,
  groups: { id: string; name: string }[],
): string | null {
  if (activeChip === null) return null;
  return groups.find((group) => group.name === activeChip)?.id ?? null;
}
