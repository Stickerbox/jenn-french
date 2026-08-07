"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { PageTile } from "@/components/ui/PageTile";
import { HtmlPreview } from "@/components/ui/HtmlPreview";
import { LinkPreview } from "@/components/ui/LinkPreview";
import { PdfPreview } from "@/components/ui/PdfPreview";
import { PinIcon } from "@/components/ui/PinIcon";
import { PencilIcon } from "@/components/ui/PencilIcon";
import { KindFilter } from "@/components/ui/KindFilter";
import { SearchField } from "@/components/admin/SearchField";
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
import { filterPages } from "@/lib/admin-search";
import { filterPagesByKind, type KindFilter as Kind } from "@/lib/page-filters";
import { FilterDisclosure } from "@/components/ui/FilterDisclosure";
import { DEFAULT_KIND, DEFAULT_SORT, filtersAreActive } from "@/lib/shelf-filters";
import type { PageKind } from "@/lib/page-kind";
import { pageTarget } from "@/lib/page-target";
import { shelfSlotCount } from "@/lib/page-versions";
import { formatLongDate } from "@/lib/format";
import { pageVersion } from "@/lib/page-version";
import { cn } from "@/lib/utils";
import type { Locale } from "@/lib/i18n";
import { getStrings } from "@/lib/strings";

export type ShelfPage = {
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
  worksheet: boolean;
  versions: { fromTeacher: boolean; updatedAt: Date }[];
};

export function FilesTab({
  pages,
  today,
  canWrite,
  canDeleteAny = false,
  canEdit = false,
  groupSlug,
  onTogglePin,
  onDeleteLink,
  locale,
}: {
  pages: ShelfPage[];
  // Passed in, never read as `new Date()` here. This component renders on both
  // sides of hydration, and a clock read that straddles a week boundary would
  // produce different sections for the same list — a mismatch appearing once a
  // week, at midnight, and unreproducible by daylight.
  today: Date;
  // False on the everyone group's public shelf and for an untokened visitor.
  canWrite: boolean;
  // True only for the teacher. deleteShelfLink already authorises her to remove
  // anything on a student's shelf; this stops the tile withholding the control.
  //
  // Every row rather than link rows only: she can already pin anything here,
  // and a delete that applies to some tiles and not others is a rule to explain
  // where there is no rule.
  canDeleteAny?: boolean;
  // The teacher, and only on /g/[slug] — false on /f/[token], which is
  // read-only because filesToken addresses a shelf and nothing else.
  //
  // NO NEW AUTHORITY IS GRANTED BY THIS. updatePage, updatePdfPage and
  // deletePage are all already requireTeacher(); this draws a control where
  // that authority already reached, so that the two screens agree about which
  // tiles are editable. Reused below to pick the chooser's audience: it is
  // already exactly "is the viewer the teacher, on a shelf that has one".
  canEdit?: boolean;
  // Null on /f/[token], which is read-only, and on the everyone group's public
  // shelf at /g/all — pageTarget only builds a worksheet route when it is
  // given a shelf to belong to, and neither of those is one: a version belongs
  // to (page, student), and /f/[token] has no write path while /g/all has no
  // student. Passing null there is what keeps a worksheet tile falling back to
  // the public page instead of linking a visible tile at a 404.
  groupSlug: string | null;
  // `studentName` used to sit here, for the version dialog's teacher-facing
  // labels ("Marie Dupont's answers"). The dialog is gone and the worksheet
  // page builds those labels itself from the group it already resolved, so
  // this shelf no longer needs to know whose it is.
  onTogglePin?: (slug: string, pinned: boolean) => Promise<void>;
  onDeleteLink?: (slug: string) => Promise<void>;
  // This is a client component, so it cannot call headers() itself — both
  // server callers (app/g/[slug]/page.tsx and app/f/[token]/page.tsx) read
  // the locale once and hand it down; getStrings(locale) below rebuilds the
  // dictionary here rather than taking the resolved object as a prop — see
  // lib/strings.ts on why that object cannot cross the boundary.
  locale: Locale;
}) {
  const strings = getStrings(locale);
  // framer-motion does NOT read prefers-reduced-motion by itself — the
  // `motion-reduce:` utilities elsewhere in this codebase are CSS and reach
  // none of this. Asking for it and zeroing the duration is the equivalent.
  const reduceMotion = useReducedMotion();
  const motionTransition = {
    duration: reduceMotion ? 0 : 0.3,
    ease: [0.4, 0.15, 0.2, 1] as const,
  };
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<Kind>(DEFAULT_KIND);
  const [sort, setSort] = useState<PageSort>(DEFAULT_SORT);

  // The same expression the chooser below already used for its labels, lifted
  // out because the badge and the chooser now both need it: `canEdit` is
  // already exactly "is the viewer the teacher, on a shelf that has one".
  const audience = canEdit ? "teacher" : "student";

  const visible = filterPagesByKind(filterPages(pages, query), kind);
  // Groups form over the filtered set — a heading above nothing would be a
  // bug the search field caused. See lib/page-sort.ts for why "modified"
  // collapses the date headings rather than keeping ones that would then be
  // describing the wrong timestamp.
  const groups = orderPages(visible, sort, today);

  // The old 560px cap was sized for one column of rows and would pin the grid
  // at two columns forever. 1152px is the admin's own content width, so a tile
  // is the same size on both sides — which is the point of the two lists
  // looking alike.
  return (
    <div className={cn("mx-auto max-w-[1152px]")}>
      {pages.length > 0 && (
        <div className="mx-auto w-full max-w-[560px]">
          <SearchField
            label={strings.student.files.searchLabel}
            value={query}
            onChange={setQuery}
            clearLabel={strings.common.clear}
          />
          <FilterDisclosure
            toggleLabel={strings.student.files.filterToggle}
            activeLabel={strings.student.files.filterActive}
            active={filtersAreActive({ kind, sort })}
          >
            <KindFilter
              value={kind}
              onChange={setKind}
              tone="card"
              labels={strings.student.files.kindFilter}
            />
            <SortFilter
              value={sort}
              onChange={setSort}
              tone="card"
              labels={strings.student.files.sortFilter}
            />
          </FilterDisclosure>
        </div>
      )}

      {pages.length === 0 ? (
        <p className={emptyStateText}>{strings.student.files.emptyShelf}</p>
      ) : groups.length === 0 ? (
        <p className={emptyStateText}>{strings.student.files.noMatches}</p>
      ) : (
        <div className={pageSectionList}>
          {groups.map((group, groupIndex) => (
            <section
              key={
                group.heading
                  ? `${group.heading.kind}-${sectionLabel(group.heading, locale)}`
                  : `flat-${groupIndex}`
              }
            >
              {group.heading && (
                <h2 className={pageSectionHeading}>
                  {sectionLabel(group.heading, locale)}
                </h2>
              )}

              <ul className={pageGrid}>
                {/* `initial={false}` so a shelf of twenty tiles does not replay
                    twenty entrances on every mount, or on every keystroke in
                    the search field above. Only a page that arrives while this
                    list is on screen animates. */}
                <AnimatePresence initial={false}>
                {group.pages.map((page) => {
                  const target = pageTarget(page, groupSlug);
                  // One expression for both previews; see PageList, which
                  // computes the same thing for the same reason.
                  const thumbVersion = page.thumbAt
                    ? new Date(page.thumbAt).getTime()
                    : null;
                  // A WORKSHEET TILE NAVIGATES. It used to intercept the click
                  // and open a version-picker dialog once there was more than
                  // one version, for both parties.
                  //
                  // That dialog is gone (2026-08-07) and neither party gets it
                  // now. It was answering a question the destination already
                  // answers better: the worksheet page carries the same
                  // versions as tabs, in the same order, above the document
                  // itself — so the dialog asked which version to open, and
                  // then opened a page whose first control was the same
                  // choice. For a student it was worse than redundant, since
                  // it made "open my homework" a two-step with a question in
                  // the middle that has one obvious answer.
                  //
                  // The tile is a plain anchor again, which the whiteboard's
                  // capture-phase leave-guard protects for free — the reason
                  // the version rows themselves had to stay anchors.
                  return (
                    <motion.li
                      key={page.id}
                      layout={reduceMotion ? false : "position"}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      transition={motionTransition}
                    >
                      <PageTile
                        href={target.href}
                        newTab={target.newTab}
                        title={page.title}
                        eyebrow={formatLongDate(page.createdAt, locale)}
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
                        // A worksheet's version count wins over the pin
                        // marker. The count is what THIS reader can open, so
                        // it never fires for a page nobody has saved to — and,
                        // for a student, never until Jenn has corrected. It
                        // used to reach 2 the moment they saved their own
                        // answers, badging their homework as though something
                        // had arrived when the only thing there was their own
                        // typing. Gated on groupSlug the same way dialogDue is
                        // above: /f/[token] passes null because it is
                        // read-only, and a count badge with nothing behind it
                        // is worse than none.
                        badge={
                          groupSlug &&
                          shelfSlotCount(page.versions, audience) > 1 ? (
                            <span className="rounded-full bg-[var(--card-bleu)] px-2 py-0.5 text-xs font-semibold text-white">
                              {shelfSlotCount(page.versions, audience)}
                            </span>
                          ) : page.pinnedAt && !canWrite ? (
                            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--card-paper)] text-[var(--card-bleu)] shadow-[var(--card-shadow)]">
                              <PinIcon filled />
                            </span>
                          ) : undefined
                        }
                        action={
                          canWrite && onTogglePin ? (
                            <div className="flex items-center gap-1">
                              {/* Same rule PageList applies: html and pdf rows
                                  get a pencil, a link row does not — renaming a
                                  link is impossible on both sides, and the two
                                  screens agreeing is worth more than either
                                  rule alone.

                                  AN ANCHOR, AND THAT IS NOT A STYLE CHOICE.
                                  The whiteboard's leave-guard is a
                                  capture-phase click listener on document that
                                  inspects anchors, written that way so "a
                                  future link is protected without knowing the
                                  guard exists". A button calling router.push
                                  would slip past it, and opening this overlay
                                  during a live board would destroy the op log
                                  with no prompt. */}
                              {canEdit && page.kind !== "link" && (
                                <Link
                                  href={`?tab=files&edit=${page.slug}`}
                                  aria-label={strings.student.files.edit(page.title)}
                                  title={strings.student.files.editTitle}
                                  className={tileActionClass}
                                >
                                  <PencilIcon />
                                </Link>
                              )}

                              <form
                                action={onTogglePin.bind(
                                  null,
                                  page.slug,
                                  page.pinnedAt === null,
                                )}
                              >
                                <button
                                  type="submit"
                                  aria-label={
                                    page.pinnedAt
                                      ? strings.student.files.unpin(page.title)
                                      : strings.student.files.pin(page.title)
                                  }
                                  title={
                                    page.pinnedAt
                                      ? strings.student.files.unpinTitle
                                      : strings.student.files.pinTitle
                                  }
                                  className={tileActionClass}
                                >
                                  <PinIcon filled={page.pinnedAt !== null} />
                                </button>
                              </form>

                              {/* For a student: anything they published, link
                                  or page, while nobody else can see it yet —
                                  the server re-checks with canStudentDelete and
                                  this only avoids showing a control that would
                                  fail. For the teacher: everything, which
                                  deleteShelfLink has always allowed her.
                                  Chat-filed links land here with
                                  addedByStudent false, and hers were the rows
                                  she could not reach. */}
                              {(page.addedByStudent || canDeleteAny) &&
                                onDeleteLink && (
                                  <form action={onDeleteLink.bind(null, page.slug)}>
                                    <button
                                      type="submit"
                                      aria-label={strings.student.files.delete(page.title)}
                                      title={strings.student.files.deleteTitle}
                                      className={cn(tileActionClass, "text-[var(--card-moss)]")}
                                    >
                                      ×
                                    </button>
                                  </form>
                                )}
                            </div>
                          ) : undefined
                        }
                      />
                    </motion.li>
                  );
                })}
                </AnimatePresence>
              </ul>
            </section>
          ))}
        </div>
      )}

    </div>
  );
}
