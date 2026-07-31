import { PageTile } from "@/components/ui/PageTile";
import { HtmlPreview } from "@/components/ui/HtmlPreview";
import { PinIcon } from "@/components/ui/PinIcon";
import {
  pageGrid,
  pageSectionHeading,
  pageSectionList,
} from "@/components/card-styles";
import { sectionPages } from "@/lib/page-sections";
import { studentSectionLabel } from "@/lib/page-section-labels";
import { formatLongDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export function FilesTab({
  pages,
}: {
  pages: {
    slug: string;
    title: string;
    createdAt: Date;
    pinnedAt: Date | null;
  }[];
}) {
  if (pages.length === 0) {
    return (
      <p className="text-center font-[family-name:var(--card-font-serif)] italic text-[var(--card-moss)]">
        Rien ici pour l&apos;instant.
      </p>
    );
  }

  const sections = sectionPages(pages, new Date());

  // The old 560px cap was sized for one column of rows and would pin the grid
  // at two columns forever. 1152px is the admin's own content width, so a tile
  // is the same size on both sides — which is the point of the two lists
  // looking alike.
  return (
    <div className={cn("mx-auto max-w-[1152px]", pageSectionList)}>
      {sections.map((section) => (
        <section key={`${section.key.kind}-${studentSectionLabel(section.key)}`}>
          <h2 className={pageSectionHeading}>
            {studentSectionLabel(section.key)}
          </h2>

          <ul className={pageGrid}>
            {section.pages.map((page) => (
              <li key={page.slug}>
                <PageTile
                  href={`/p/${page.slug}`}
                  title={page.title}
                  eyebrow={formatLongDate(page.createdAt)}
                  preview={<HtmlPreview slug={page.slug} />}
                  // Students get the marker but no control. Without it a page
                  // sitting above a newer one looks like a sorting bug.
                  badge={
                    page.pinnedAt ? (
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--card-paper)] text-[var(--card-bleu)] shadow-[var(--card-shadow)]">
                        <PinIcon filled />
                      </span>
                    ) : undefined
                  }
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
