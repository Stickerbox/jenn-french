import { visibleSlots } from "@/lib/worksheet-slots";
import type { VersionAudience } from "@/lib/version-labels";

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

// How many versions of a worksheet THIS reader can actually open. Not a count
// of rows: it goes through visibleSlots, which is the one place that knows a
// student has no blank tab and Jenn does.
//
// It replaced a `versions.length + 1` that counted the blank for everybody.
// That was right while both parties saw three tabs, and became a lie the day
// the student dropped to their own copy: one saved attempt read as two, so the
// shelf drew a "2" badge and the tile opened a chooser offering a blank the
// student could not have — a dialog to pick between one thing and a thing that
// does not exist.
//
// Deriving it from visibleSlots rather than re-deciding it here is the point.
// The badge, the chooser and the version tabs now answer to one rule, and the
// next change to who-sees-what cannot leave the shelf behind.
//
// Jenn's numbers are unchanged: blank, plus each row that exists.
export function shelfSlotCount(
  versions: { fromTeacher: boolean }[],
  audience: VersionAudience,
): number {
  return visibleSlots({
    audience,
    hasStudent: versions.some((version) => !version.fromTeacher),
    hasTeacher: versions.some((version) => version.fromTeacher),
  }).length;
}
