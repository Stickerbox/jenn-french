import type { PageKind } from "@/lib/page-kind";

export type PageTarget = { href: string; newTab: boolean };

// Both page lists render the same tile and were both about to grow the same
// three-way ternary. The rule is that only an html page opens in this tab: a
// link is off-site, and a PDF opens in a new one so the shelf a student is
// browsing stays where they left it.
export function pageTarget(page: {
  kind: PageKind;
  slug: string;
  url: string | null;
}): PageTarget {
  if (page.kind === "link") return { href: page.url ?? "#", newTab: true };
  if (page.kind === "pdf") return { href: `/p/${page.slug}/pdf`, newTab: true };
  return { href: `/p/${page.slug}`, newTab: false };
}
