export type ShelfVersion = {
  pageId: string;
  fromTeacher: boolean;
  updatedAt: Date;
};

export type WithVersions<T> = T & {
  versions: { fromTeacher: boolean; updatedAt: Date }[];
};

// Folds one shelf's versions onto its pages, the way applyPins folds one
// shelf's pins. Versions are per-(page, group), so the same worksheet carries
// different versions on two students' shelves.
//
// The snapshots themselves are never in here. A shelf query that loaded a blob
// to draw a badge would have paid for the thing the badge was avoiding — the
// lesson pdfSize and thumbAt each record one column apart.
export function applyVersions<T extends { id: string }>(
  pages: T[],
  versions: ShelfVersion[],
): WithVersions<T>[] {
  const byPage = new Map<string, { fromTeacher: boolean; updatedAt: Date }[]>();
  for (const version of versions) {
    const list = byPage.get(version.pageId) ?? [];
    list.push({ fromTeacher: version.fromTeacher, updatedAt: version.updatedAt });
    byPage.set(version.pageId, list);
  }

  return pages.map((page) => ({
    ...page,
    // Student first, then teacher: a stable order so the chooser does not
    // reshuffle between renders, and it is the order the work happens in.
    versions: (byPage.get(page.id) ?? []).sort(
      (a, b) => Number(a.fromTeacher) - Number(b.fromTeacher),
    ),
  }));
}

// The blank is not a row — it is Page.html or Page.pdf — so a page with no
// saved versions still has one version. That is why the tile's badge starts at
// two.
export function versionCount(versions: { fromTeacher: boolean }[]): number {
  return versions.length + 1;
}
