// A student's shelf is their own pages plus the everyone group's, sorted into
// one list rather than two stacked ones — from the student's side there is no
// such thing as "inherited", there is only what they have.
export function effectivePages<T extends { id: string; createdAt: Date }>(
  own: T[],
  everyone: T[],
): T[] {
  const byId = new Map<string, T>();
  // Own first, so a page assigned both directly and to everyone keeps the row
  // the student's own query returned.
  for (const page of [...own, ...everyone]) {
    if (!byId.has(page.id)) byId.set(page.id, page);
  }

  return [...byId.values()].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  );
}
