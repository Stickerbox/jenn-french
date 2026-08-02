"use client";

import { useState } from "react";
import { PageTile } from "@/components/ui/PageTile";
import { HtmlPreview } from "@/components/ui/HtmlPreview";
import { LinkPreview } from "@/components/ui/LinkPreview";
import { PinIcon } from "@/components/ui/PinIcon";
import { KindFilter } from "@/components/ui/KindFilter";
import { SearchField } from "@/components/admin/SearchField";
import {
  pageGrid,
  pageSectionHeading,
  pageSectionList,
} from "@/components/card-styles";
import { sectionPages } from "@/lib/page-sections";
import { studentSectionLabel } from "@/lib/page-section-labels";
import { filterPages } from "@/lib/admin-search";
import { filterPagesByKind, type KindFilter as Kind } from "@/lib/page-filters";
import type { PageKind } from "@/lib/page-kind";
import { formatLongDate } from "@/lib/format";
import { pageVersion } from "@/lib/page-version";
import { cn } from "@/lib/utils";

export type ShelfPage = {
  id: string;
  slug: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  pinnedAt: Date | null;
  kind: PageKind;
  url: string | null;
  addedByStudent: boolean;
};

export function FilesTab({
  pages,
  today,
  canWrite,
  onTogglePin,
  onDeleteLink,
}: {
  pages: ShelfPage[];
  // Passed in, never read as `new Date()` here. This component renders on both
  // sides of hydration, and a clock read that straddles a week boundary would
  // produce different sections for the same list — a mismatch appearing once a
  // week, at midnight, and unreproducible by daylight.
  today: Date;
  // False on the everyone group's public shelf and for an untokened visitor.
  canWrite: boolean;
  onTogglePin?: (slug: string, pinned: boolean) => Promise<void>;
  onDeleteLink?: (slug: string) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<Kind>("all");

  const visible = filterPagesByKind(filterPages(pages, query), kind);
  // Sections form over the filtered set — a heading above nothing would be a
  // bug the search field caused.
  const sections = sectionPages(visible, today);

  // The old 560px cap was sized for one column of rows and would pin the grid
  // at two columns forever. 1152px is the admin's own content width, so a tile
  // is the same size on both sides — which is the point of the two lists
  // looking alike.
  return (
    <div className={cn("mx-auto max-w-[1152px]")}>
      {pages.length > 0 && (
        <div className="mx-auto w-full max-w-[560px]">
          <SearchField label="Chercher" value={query} onChange={setQuery} />
          <KindFilter
            value={kind}
            onChange={setKind}
            tone="card"
            labels={{
              group: "Filtrer par type",
              all: "Tout",
              html: "Les pages",
              link: "Les liens",
            }}
          />
        </div>
      )}

      {pages.length === 0 ? (
        <p className="text-center font-[family-name:var(--card-font-serif)] italic text-[var(--card-moss)]">
          Rien ici pour l&apos;instant.
        </p>
      ) : sections.length === 0 ? (
        <p className="text-center font-[family-name:var(--card-font-serif)] italic text-[var(--card-moss)]">
          Rien ne correspond.
        </p>
      ) : (
        <div className={pageSectionList}>
          {sections.map((section) => (
            <section key={`${section.key.kind}-${studentSectionLabel(section.key)}`}>
              <h2 className={pageSectionHeading}>
                {studentSectionLabel(section.key)}
              </h2>

              <ul className={pageGrid}>
                {section.pages.map((page) => (
                  <li key={page.id}>
                    <PageTile
                      href={page.kind === "link" ? (page.url ?? "#") : `/p/${page.slug}`}
                      external={page.kind === "link"}
                      title={page.title}
                      eyebrow={formatLongDate(page.createdAt)}
                      preview={
                        page.kind === "link" && page.url ? (
                          <LinkPreview url={page.url} />
                        ) : (
                          <HtmlPreview slug={page.slug} version={pageVersion(page.updatedAt)} />
                        )
                      }
                      // Kept for a read-only visitor: without it a page sitting
                      // above a newer one looks like a sorting bug.
                      badge={
                        page.pinnedAt && !canWrite ? (
                          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--card-paper)] text-[var(--card-bleu)] shadow-[var(--card-shadow)]">
                            <PinIcon filled />
                          </span>
                        ) : undefined
                      }
                      action={
                        canWrite && onTogglePin ? (
                          <div className="flex items-center gap-1">
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
                                    ? `Désépingler ${page.title}`
                                    : `Épingler ${page.title}`
                                }
                                title={page.pinnedAt ? "Désépingler" : "Épingler"}
                                className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--card-bleu)] transition-colors hover:bg-[var(--card-bleu-soft)]"
                              >
                                <PinIcon filled={page.pinnedAt !== null} />
                              </button>
                            </form>

                            {/* Anything they published, link or page, while
                                nobody else can see it yet. The server
                                re-checks with canStudentDelete; this just
                                avoids showing a control that would fail. */}
                            {page.addedByStudent &&
                              onDeleteLink && (
                                <form action={onDeleteLink.bind(null, page.slug)}>
                                  <button
                                    type="submit"
                                    aria-label={`Supprimer ${page.title}`}
                                    title="Supprimer"
                                    className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--card-moss)] transition-colors hover:bg-[var(--card-bleu-soft)]"
                                  >
                                    ×
                                  </button>
                                </form>
                              )}
                          </div>
                        ) : undefined
                      }
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
