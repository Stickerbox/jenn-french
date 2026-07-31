import { weekRange } from "@/lib/week";

// `month` is 0-indexed, matching getUTCMonth() and the MONTHS array in
// lib/week.ts, so a label can index straight into it.
export type SectionKey =
  | { kind: "pinned" }
  | { kind: "thisWeek" }
  | { kind: "lastWeek" }
  | { kind: "month"; year: number; month: number };

export type PageSection<T> = { key: SectionKey; pages: T[] };

type Sectionable = { createdAt: Date; pinnedAt: Date | null };

// Keys, not labels. The admin says "This week" and the student says "Cette
// semaine"; a function returning display strings would have to know which
// surface called it, and the rule and the copy would be stuck in one file.
export function sectionPages<T extends Sectionable>(
  pages: T[],
  today: Date,
): PageSection<T>[] {
  const thisWeekStart = weekRange(today).start;
  const lastWeekStart = new Date(thisWeekStart);
  lastWeekStart.setUTCDate(lastWeekStart.getUTCDate() - 7);

  const pinned: T[] = [];
  const thisWeek: T[] = [];
  const lastWeek: T[] = [];
  // Keyed by year AND month so two Julys a year apart stay two sections.
  const months = new Map<string, T[]>();

  for (const page of pages) {
    if (page.pinnedAt) {
      // Only here, never also under its date: "always at the top" means one
      // place, not two.
      pinned.push(page);
    } else if (page.createdAt >= thisWeekStart) {
      // No upper bound. weekRange ends on Friday, so a closed range would drop
      // a page added on the Saturday into a month section below pages a week
      // older than it — and the weekend belongs to the week that just ended
      // everywhere else in this project too.
      thisWeek.push(page);
    } else if (page.createdAt >= lastWeekStart) {
      lastWeek.push(page);
    } else {
      const key = `${page.createdAt.getUTCFullYear()}-${page.createdAt.getUTCMonth()}`;
      const bucket = months.get(key);
      if (bucket) bucket.push(page);
      else months.set(key, [page]);
    }
  }

  const byNewest = (a: T, b: T) => b.createdAt.getTime() - a.createdAt.getTime();

  const sections: PageSection<T>[] = [];

  if (pinned.length > 0) {
    sections.push({
      key: { kind: "pinned" },
      // By pinnedAt, not createdAt — the whole reason the column is a
      // timestamp. The ?? 0 is unreachable: every page in here has one.
      pages: [...pinned].sort(
        (a, b) => (b.pinnedAt?.getTime() ?? 0) - (a.pinnedAt?.getTime() ?? 0),
      ),
    });
  }

  if (thisWeek.length > 0) {
    sections.push({ key: { kind: "thisWeek" }, pages: [...thisWeek].sort(byNewest) });
  }

  if (lastWeek.length > 0) {
    sections.push({ key: { kind: "lastWeek" }, pages: [...lastWeek].sort(byNewest) });
  }

  const monthSections = [...months.values()]
    .map((bucket) => {
      const sorted = [...bucket].sort(byNewest);
      return {
        key: {
          kind: "month" as const,
          year: sorted[0].createdAt.getUTCFullYear(),
          month: sorted[0].createdAt.getUTCMonth(),
        },
        pages: sorted,
      };
    })
    .sort((a, b) => b.key.year - a.key.year || b.key.month - a.key.month);

  return [...sections, ...monthSections];
}
