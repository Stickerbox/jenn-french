import { sectionPages, type SectionKey } from "@/lib/page-sections";

// Which of a page's two timestamps orders — and, for "created", also
// sections — the list. "created" is the long-standing implicit default
// (sectionPages has always bucketed by createdAt); this just gives that
// default a name a control can offer beside a second option.
export type PageSort = "created" | "modified";

type Row = { createdAt: Date; updatedAt: Date; pinnedAt: Date | null };

function sortDate(page: Row, sort: PageSort): Date {
  return sort === "modified" ? page.updatedAt : page.createdAt;
}

// Newest first. Ties are broken on the pages' ORIGINAL array position rather
// than left to the engine's sort stability: that guarantee is easy to lose
// without noticing (a caller re-deriving the array between renders, or a
// future refactor that maps before sorting), and this list has a real way to
// produce a tie — two pages published by the same script in the same
// millisecond, or a backfill that touches a batch of rows at once.
export function sortPages<T extends Row>(pages: T[], sort: PageSort): T[] {
  return pages
    .map((page, index) => ({ page, index }))
    .sort((a, b) => {
      const diff =
        sortDate(b.page, sort).getTime() - sortDate(a.page, sort).getTime();
      return diff !== 0 ? diff : a.index - b.index;
    })
    .map(({ page }) => page);
}

// One rendered group: `heading` names the section to label, or is `null` for
// a group that renders with no heading — see orderPages below for why that
// exists.
export type PageGroup<T> = { heading: SectionKey | null; pages: T[] };

// The interaction with sectionPages, decided once here rather than left for
// each caller (the student shelf, the admin Pages tab) to invent its own
// answer.
//
// sectionPages buckets by createdAt, and its headings say things about WHEN
// A PAGE WAS MADE — "This week", "July 2026". Ordering the list by
// last-modified and keeping those headings would be dishonest: a page
// created in March but edited an hour ago would sit under a "This week"
// heading that is describing March. Rather than teach sectionPages a second
// axis to bucket by — it is relied on elsewhere as reading "nothing but
// pinnedAt" plus createdAt, and a second date would double every branch in
// it for a feature only one sort option needs — "modified" bypasses
// bucketing entirely: every unpinned page becomes ONE flat group with no
// heading, newest edit first.
//
// Pinned is unaffected by which sort is chosen. It already orders by
// pinnedAt — a THIRD timestamp neither sort option touches — and CLAUDE.md
// is explicit about why: pinned pages order by when they were pinned, not
// when they were made, so that re-pinning does something. Running
// sectionPages on the pinned-only slice, rather than re-deriving that order
// here, keeps there being exactly one place that sorts a pin.
export function orderPages<T extends Row>(
  pages: T[],
  sort: PageSort,
  today: Date,
): PageGroup<T>[] {
  if (sort === "created") {
    return sectionPages(pages, today).map((section) => ({
      heading: section.key,
      pages: section.pages,
    }));
  }

  const pinned = pages.filter((page) => page.pinnedAt !== null);
  const rest = pages.filter((page) => page.pinnedAt === null);
  const groups: PageGroup<T>[] = [];

  // Every row here has pinnedAt set, so sectionPages buckets all of them
  // into its "pinned" section (or returns [] when there are none) — the
  // same sort sectionPages always applies to pinned rows, reused rather
  // than re-implemented.
  const [pinnedSection] = sectionPages(pinned, today);
  if (pinnedSection) {
    groups.push({ heading: pinnedSection.key, pages: pinnedSection.pages });
  }

  if (rest.length > 0) {
    groups.push({ heading: null, pages: sortPages(rest, "modified") });
  }

  return groups;
}
