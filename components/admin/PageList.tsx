"use client";

import { useState } from "react";
import Link from "next/link";
import { PageTile } from "@/components/ui/PageTile";
import { HtmlPreview } from "@/components/ui/HtmlPreview";
import { LinkPreview } from "@/components/ui/LinkPreview";
import { PdfPreview } from "@/components/ui/PdfPreview";
import { PinIcon } from "@/components/ui/PinIcon";
import { FilterChip } from "@/components/ui/FilterChip";
import { KindFilter } from "@/components/ui/KindFilter";
import { filterPagesByKind, type KindFilter as Kind } from "@/lib/page-filters";
import type { PageKind } from "@/lib/page-kind";
import {
  pageGrid,
  pageSectionHeading,
  pageSectionList,
  tileActionClass,
} from "@/components/card-styles";
import { sectionPages } from "@/lib/page-sections";
import { adminSectionLabel } from "@/lib/page-section-labels";
import { pageAudienceLabel } from "@/lib/page-tile";
import { pageTarget } from "@/lib/page-target";
import { SearchField } from "@/components/admin/SearchField";
import {
  filterPages,
  filterPagesByGroup,
  pageGroupNames,
} from "@/lib/admin-search";
import { formatLongDate } from "@/lib/format";
import { pageVersion } from "@/lib/page-version";
import { cn } from "@/lib/utils";

export type PageSummary = {
  id: string;
  slug: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  pinnedAt: Date | null;
  kind: PageKind;
  url: string | null;
  pdfSize: number | null;
  // The preview's existence signal and its cache version; see PdfPreview.
  pdfThumbAt: Date | null;
  addedByStudent: boolean;
  groupNames: string[];
  sharedWithEveryone: boolean;
};

// A pencil laid across a baseline: the nib, the barrel, the line it writes on.
function PencilIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

// Same three strokes as a download icon anywhere: a shaft, a chevron, a floor.
function DownloadIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3v12" />
      <path d="m7 12 5 5 5-5" />
      <path d="M5 21h14" />
    </svg>
  );
}

// A lid, a can, and the two ribs. Same stroke idiom as the two above, so the
// three read as one set in a tile's action row.
function TrashIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="m19 6-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

export function PageList({
  pages,
  everyoneName,
  group,
  onGroup,
  canPin,
  onTogglePin,
  onDelete,
  today,
}: {
  pages: PageSummary[];
  // Read from the flagged row rather than from a constant: the name is the
  // teacher's to change, and a stale literal here would silently stop a
  // student's chip widening to their inherited pages.
  everyoneName: string | null;
  // Lifted to PagesTabClient. The same selection drives three things now — the
  // filter, which shelf a pin lands on, and a new page's default audience — so
  // it cannot live in here any more.
  group: string | null;
  onGroup: (group: string | null) => void;
  // False when no student chip is active. "All" is not a shelf, so there is no
  // pin to toggle.
  canPin: boolean;
  onTogglePin: (slug: string, pinned: boolean) => Promise<void>;
  // Links only, in the UI below. It is the plain teacher-only deletePage, which
  // has never cared what kind a row is — the pencil that used to be the only
  // route to it is what excluded links.
  onDelete: (slug: string) => Promise<void>;
  // Passed in rather than read as `new Date()` here. This is a client
  // component that also renders on the server, and a clock read on both sides
  // of hydration can straddle a week boundary and produce different sections
  // for the same list — a hydration mismatch that would appear once a week, at
  // midnight, and be unreproducible by daylight.
  today: Date;
}) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<Kind>("all");

  const groupNames = pageGroupNames(pages);
  const visible = filterPagesByKind(
    filterPagesByGroup(
      filterPages(pages, query),
      group,
      everyoneName ?? undefined,
    ),
    kind,
  );

  // Sections form over the FILTERED set, not the whole list — a heading above
  // nothing would be a bug the search field caused.
  const sections = sectionPages(visible, today);

  if (pages.length === 0) {
    return (
      <p className="mb-8 text-center text-sm text-[var(--color-ink-muted)]">
        No pages yet.
      </p>
    );
  }

  return (
    <div className="mb-10">
      {/* The controls stay at the admin's usual 560px column while the grid
          below breaks out to the full width. A search field as wide as four
          tiles reads as a page-wide banner rather than a control, and the
          tiles are the thing worth the room. */}
      <div className="mx-auto w-full max-w-[560px]">
        <SearchField label="Search pages" value={query} onChange={setQuery} />

        <KindFilter
          value={kind}
          onChange={setKind}
          tone="admin"
          labels={{
            group: "Filter by kind",
            all: "All",
            html: "Pages",
            link: "Links",
            pdf: "PDFs",
          }}
        />

        {groupNames.length > 0 && (
          <div
            role="group"
            aria-label="Filter by student"
            className="mb-5 flex flex-wrap justify-center gap-2"
          >
            <FilterChip
              tone="admin"
              active={group === null}
              onClick={() => onGroup(null)}
            >
              All
            </FilterChip>
            {groupNames.map((name) => (
              <FilterChip
                key={name}
                tone="admin"
                active={group === name}
                // Clicking the active chip clears it, so the row never becomes
                // a trap she has to find "All" to escape.
                onClick={() => onGroup(group === name ? null : name)}
              >
                {name}
              </FilterChip>
            ))}
          </div>
        )}
      </div>

      {sections.length === 0 ? (
        <p className="text-center text-sm text-[var(--color-ink-muted)]">
          Nothing matches that.
        </p>
      ) : (
        <div className={pageSectionList}>
          {sections.map((section) => (
            <section
              key={`${section.key.kind}-${adminSectionLabel(section.key)}`}
            >
            <h3 className={pageSectionHeading}>
              {adminSectionLabel(section.key)}
            </h3>

            <ul className={pageGrid}>
              {section.pages.map((page) => {
                const target = pageTarget(page);
                return (
                  <li key={page.id}>
                    {/* The tile opens the page, the way the student's does, and
                        the way the thumbnail already promises. /p/[slug] is the
                        page itself, sandboxed exactly as a student gets it — a
                        page has no group-scoped URL, so this is the link
                        whatever groups it belongs to. Editing moved to its own
                        icon: the preview is what she recognises a page by, so
                        following it should show her the page, not a form. */}
                    <PageTile
                      href={target.href}
                      newTab={target.newTab}
                      title={page.title}
                      eyebrow={`${formatLongDate(page.createdAt)} · ${pageAudienceLabel(page)}${
                        page.addedByStudent ? " · added by student" : ""
                      }`}
                      preview={
                        page.kind === "link" && page.url ? (
                          <LinkPreview url={page.url} />
                        ) : page.kind === "pdf" ? (
                          <PdfPreview
                              slug={page.slug}
                              size={page.pdfSize}
                              thumbVersion={
                                page.pdfThumbAt
                                  ? new Date(page.pdfThumbAt).getTime()
                                  : null
                              }
                            />
                        ) : (
                          <HtmlPreview slug={page.slug} version={pageVersion(page.updatedAt)} />
                        )
                      }
                      action={
                        <div className="flex items-center gap-1">
                          {/* A link has no document to edit or download, so it
                              gets neither control rather than two that fail —
                              and this is that sentence's third clause. It
                              trades the two it cannot use for the one it can.
                              Until this existed a link could not be deleted at
                              all: /admin/pages/[slug] 404s on a link row and
                              PageEditor held the admin's only delete.

                              A PDF and a page keep both of theirs: editing
                              replaces the file or changes the audience, and the
                              download is the same <a download> pointed at the
                              bytes.

                              No confirmation, matching PageEditor's own bare
                              Delete page button. A link is a URL and a derived
                              title; re-adding one is a paste. */}
                          {page.kind === "link" ? (
                            <form action={onDelete.bind(null, page.slug)}>
                              <button
                                type="submit"
                                aria-label={`Delete ${page.title}`}
                                title="Delete"
                                className={tileActionClass}
                              >
                                <TrashIcon />
                              </button>
                            </form>
                          ) : (
                            <>
                              <Link
                                href={`/admin/pages/${page.slug}`}
                                aria-label={`Edit ${page.title}`}
                                title="Edit"
                                className={tileActionClass}
                              >
                                <PencilIcon />
                              </Link>

                              {/* No server support needed: `download` on a
                                  same-origin response forces a save-as, so the
                                  raw route keeps its exact behaviour and its
                                  CSP, and no new authenticated surface appears.
                                  That route is already public. */}
                              <a
                                href={
                                  page.kind === "pdf"
                                    ? `/p/${page.slug}/pdf`
                                    : `/p/${page.slug}/raw`
                                }
                                download={`${page.slug}.${page.kind === "pdf" ? "pdf" : "html"}`}
                                aria-label={`Download ${page.title}`}
                                title="Download"
                                className={tileActionClass}
                              >
                                <DownloadIcon />
                              </a>
                            </>
                          )}

                          {/* A form, not a link: it mutates. Bound with the
                              NEGATION of the current state, so the button says
                              what it will do rather than what is true. */}
                          <form
                            action={onTogglePin.bind(
                              null,
                              page.slug,
                              page.pinnedAt === null,
                            )}
                          >
                            <button
                              type="submit"
                              disabled={!canPin}
                              aria-label={
                                canPin
                                  ? page.pinnedAt
                                    ? `Unpin ${page.title}`
                                    : `Pin ${page.title}`
                                  : "Pick a student to pin for"
                              }
                              title={
                                canPin
                                  ? page.pinnedAt
                                    ? "Unpin"
                                    : "Pin"
                                  : "Pick a student to pin for"
                              }
                              className={cn(tileActionClass, "disabled:opacity-40")}
                            >
                              <PinIcon filled={page.pinnedAt !== null} />
                            </button>
                          </form>
                        </div>
                      }
                    />
                  </li>
                );
              })}
            </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
