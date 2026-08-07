"use client";

import { useState } from "react";
import Link from "next/link";
import { PageTile } from "@/components/ui/PageTile";
import { HtmlPreview } from "@/components/ui/HtmlPreview";
import { LinkPreview } from "@/components/ui/LinkPreview";
import { PdfPreview } from "@/components/ui/PdfPreview";
import { PinIcon } from "@/components/ui/PinIcon";
import { PencilIcon } from "@/components/ui/PencilIcon";
import { TrashIcon } from "@/components/ui/TrashIcon";
import { FilterChip } from "@/components/ui/FilterChip";
import { KindFilter } from "@/components/ui/KindFilter";
import { filterPagesByKind, type KindFilter as Kind } from "@/lib/page-filters";
import type { PageKind } from "@/lib/page-kind";
import {
  emptyStateText,
  pageGrid,
  pageSectionHeading,
  pageSectionList,
  tileActionClass,
} from "@/components/card-styles";
import { sectionLabel } from "@/lib/page-section-labels";
import { orderPages, type PageSort } from "@/lib/page-sort";
import { SortFilter } from "@/components/ui/SortFilter";
import { FilterDisclosure } from "@/components/ui/FilterDisclosure";
import { DEFAULT_KIND, DEFAULT_SORT, filtersAreActive } from "@/lib/shelf-filters";
import { pageAudienceLabel } from "@/lib/page-tile";
import { pageTarget } from "@/lib/page-target";
import { SearchField } from "@/components/admin/SearchField";
import {
  filterPages,
  filterPagesByGroup,
  pageGroupNames,
} from "@/lib/admin-search";
import { visibleGroupChips } from "@/lib/audience";
import { formatLongDate } from "@/lib/format";
import { pageVersion } from "@/lib/page-version";
import type { Locale } from "@/lib/i18n";
import { getStrings } from "@/lib/strings";
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
  thumbAt: Date | null;
  addedByStudent: boolean;
  // Decides pageTarget's destination below. No `versions` field beside it:
  // "All" is not a shelf, and the student chip already scopes the list
  // without owning a shelf's rows to list them from.
  worksheet: boolean;
  groupNames: string[];
  sharedWithEveryone: boolean;
};

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

export function PageList({
  pages,
  everyoneName,
  group,
  groupSlug,
  onGroup,
  canPin,
  onTogglePin,
  onDelete,
  today,
  locale,
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
  // The chip's group, as a slug rather than the name `group` carries — what
  // pageTarget needs to build a worksheet route. Null under "All", where there
  // is no shelf, and null for the everyone chip too: /g/all is public and has
  // no student for a version to belong to, the same reason the everyone
  // group's own shelf never sends one.
  groupSlug: string | null;
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
  // This is a client component reached directly from PagesTabClient, which is
  // itself reached from app/admin/page.tsx, so it takes `locale` rather than
  // the resolved `strings` object — a `Strings` value holds functions and
  // cannot cross that boundary. See lib/strings.ts.
  locale: Locale;
}) {
  const strings = getStrings(locale);
  const labels = strings.admin.pageList;
  const [query, setQuery] = useState("");
  // The shared defaults, not two literals. The disclosure's dot compares
  // against exactly these, and a default that moved here and not there would
  // light the dot on a list nobody had touched — the reason lib/shelf-filters
  // names them at all.
  const [kind, setKind] = useState<Kind>(DEFAULT_KIND);
  const [sort, setSort] = useState<PageSort>(DEFAULT_SORT);

  // The everyone chip is dropped, and the everyone NAME is still passed to
  // filterPagesByGroup below. That is not an inconsistency: the name's job
  // there is to widen a student's chip to include pages shared with everyone,
  // which is how Jenn finds a shared page now that it has no chip of its own.
  const groupNames = visibleGroupChips(pageGroupNames(pages), everyoneName);
  const visible = filterPagesByKind(
    filterPagesByGroup(
      filterPages(pages, query),
      group,
      everyoneName ?? undefined,
    ),
    kind,
  );

  // Groups form over the FILTERED set, not the whole list — a heading above
  // nothing would be a bug the search field caused. See lib/page-sort.ts for
  // why "modified" collapses the date headings rather than keeping ones that
  // would then be describing the wrong timestamp.
  const groups = orderPages(visible, sort, today);

  if (pages.length === 0) {
    return <p className={cn("mb-8", emptyStateText)}>{labels.noPagesYet}</p>;
  }

  return (
    <div className="mb-10">
      {/* The controls stay at the admin's usual 560px column while the grid
          below breaks out to the full width. A search field as wide as four
          tiles reads as a page-wide banner rather than a control, and the
          tiles are the thing worth the room. */}
      <div className="mx-auto w-full max-w-[560px]">
        <SearchField
          label={labels.searchLabel}
          value={query}
          onChange={setQuery}
          clearLabel={strings.common.clear}
        />

        {/* Behind the icon since 2026-08-07, the same disclosure the student
            shelf uses — three stacked control rows above the tiles was most of
            a screen of chrome over the thing Jenn opened the tab to see.

            ONLY THE KIND AND SORT ROWS. The student chip row below stays where
            it is, and that is the whole of the exception this file used to
            claim outright: that row is not only a filter — the same selection
            decides which shelf a pin lands on and the default audience for a
            new page, so folding it away would hide a control that does more
            than narrow a list. The two rows in here do nothing but narrow one.

            tone="card": KindFilter/FilterChip already had both skins (see
            FilterChip's own comment) — the student shelf's kind filter uses
            "card" too, so this is a caller-side flip, not a new capability. */}
        <FilterDisclosure
          toggleLabel={labels.filterToggle}
          activeLabel={labels.filterActive}
          active={filtersAreActive({ kind, sort })}
        >
          <KindFilter
            value={kind}
            onChange={setKind}
            tone="card"
            labels={labels.kindFilter}
          />
          <SortFilter
            value={sort}
            onChange={setSort}
            tone="card"
            labels={labels.sortFilter}
          />
        </FilterDisclosure>

        {groupNames.length > 0 && (
          <div
            role="group"
            aria-label={labels.filterByStudentAria}
            className="mb-5 flex flex-wrap justify-center gap-2"
          >
            <FilterChip
              tone="card"
              active={group === null}
              onClick={() => onGroup(null)}
            >
              {labels.allChip}
            </FilterChip>
            {groupNames.map((name) => (
              <FilterChip
                key={name}
                tone="card"
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

      {groups.length === 0 ? (
        <p className={emptyStateText}>{strings.admin.noMatches}</p>
      ) : (
        <div className={pageSectionList}>
          {groups.map((pageGroup, groupIndex) => (
            <section
              key={
                pageGroup.heading
                  ? `${pageGroup.heading.kind}-${sectionLabel(pageGroup.heading, locale)}`
                  : `flat-${groupIndex}`
              }
            >
            {pageGroup.heading && (
              <h3 className={pageSectionHeading}>
                {sectionLabel(pageGroup.heading, locale)}
              </h3>
            )}

            <ul className={pageGrid}>
              {pageGroup.pages.map((page) => {
                const target = pageTarget(page, groupSlug);
                // One expression for both previews, because one pair of columns
                // now serves both kinds. Null means nothing has been captured
                // yet, and each preview has its own working fallback for that —
                // the glyph for a pdf, the live iframe for a document.
                const thumbVersion = page.thumbAt
                  ? new Date(page.thumbAt).getTime()
                  : null;
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
                      eyebrow={`${formatLongDate(page.createdAt, locale)} · ${pageAudienceLabel(page, locale)}${
                        page.addedByStudent ? ` · ${labels.addedByStudent}` : ""
                      }`}
                      preview={
                        page.kind === "link" && page.url ? (
                          <LinkPreview url={page.url} />
                        ) : page.kind === "pdf" ? (
                          <PdfPreview
                            slug={page.slug}
                            size={page.pdfSize}
                            thumbVersion={thumbVersion}
                          />
                        ) : (
                          <HtmlPreview
                            slug={page.slug}
                            version={pageVersion(page.updatedAt)}
                            thumbVersion={thumbVersion}
                          />
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
                                aria-label={labels.deleteAria(page.title)}
                                title={strings.common.delete}
                                className={tileActionClass}
                              >
                                <TrashIcon />
                              </button>
                            </form>
                          ) : (
                            <>
                              {/* A search param, not a route and not local
                                  state, and it buys four things. Back closes
                                  the overlay rather than leaving the page,
                                  which matters most on a phone. It has a URL,
                                  which is what lets the dia script open the
                                  editor for the page it just published. The
                                  list stays mounted behind it, so a rename no
                                  longer costs the scroll position, the search
                                  text, or — the one that actually matters — the
                                  active student chip, which drives which pin
                                  applies and a new page's default audience.

                                  AND IT MUST STAY AN ANCHOR. The whiteboard's
                                  leave-guard is a capture-phase click listener
                                  on document that inspects anchors, written
                                  that way so "a future link is protected
                                  without knowing the guard exists". A button
                                  calling router.push would slip past it, and
                                  opening this overlay during a live board would
                                  destroy the op log with no prompt. The same
                                  link on the student shelf relies on it. */}
                              <Link
                                href={`?tab=pages&edit=${page.slug}`}
                                aria-label={labels.editAria(page.title)}
                                title={strings.common.edit}
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
                                aria-label={labels.downloadAria(page.title)}
                                title={strings.common.download}
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
                                    ? labels.unpinAria(page.title)
                                    : labels.pinAria(page.title)
                                  : labels.pinDisabled
                              }
                              title={
                                canPin
                                  ? page.pinnedAt
                                    ? strings.common.unpin
                                    : strings.common.pin
                                  : labels.pinDisabled
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
