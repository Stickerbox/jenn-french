import type { PageKind } from "@/lib/page-kind";

export type PageTarget = { href: string; newTab: boolean };

// Both page lists render the same tile and were both about to grow the same
// three-way ternary. The rule is that a link is off-site and opens in a new
// tab; an html page and a pdf both open here, in this tab, since 2026-08-06
// both render inside the site's own chrome — see the pdf branch below for why
// a PDF no longer needs the new tab it used to.
//
// A worksheet overrides all of that, and it needs a group to do it — a version
// belongs to (page, student), and there is no student in a page row. So the
// worksheet destination is returned ONLY when a shelf supplied one: the admin
// Pages tab under "All" and /f/[token] pass none and keep the targets they had.
// That is the same rule the pin control already follows, and for the same
// reason — "All" is not a shelf.
export function pageTarget(
  page: {
    kind: PageKind;
    slug: string;
    url: string | null;
    worksheet?: boolean;
  },
  groupSlug?: string | null,
): PageTarget {
  // kind !== "link" keeps this agreeing with worksheetOpenable, which refuses
  // a link for the same reason: it is not hosted here and has nothing to fill
  // in. Nothing sets `worksheet` on a link row today — a link has no edit form
  // — but that is a property of today's write paths, not a guarantee this
  // function should rely on.
  if (page.worksheet && page.kind !== "link" && groupSlug) {
    return { href: `/g/${groupSlug}/w/${page.slug}`, newTab: false };
  }
  if (page.kind === "link") return { href: page.url ?? "#", newTab: true };
  // Used to point straight at the bytes with newTab: true, because a PDF took
  // over the tab in the browser's own viewer and a shelf tile should not make
  // that browser ask twice. As of 2026-08-06 a PDF opens INSIDE the site —
  // /p/[slug] renders PdfShell over PdfDocumentView instead of redirecting —
  // so the reason for a new tab is gone and the destination is the same
  // /p/[slug] an html page already gets: same tab, our own chrome.
  return { href: `/p/${page.slug}`, newTab: false };
}
