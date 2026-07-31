import { PageTile } from "@/components/ui/PageTile";
import { HtmlPreview } from "@/components/ui/HtmlPreview";
import { pageGrid } from "@/components/card-styles";
import { formatLongDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export function FilesTab({
  pages,
}: {
  pages: { slug: string; title: string; createdAt: Date }[];
}) {
  if (pages.length === 0) {
    return (
      <p className="text-center font-[family-name:var(--card-font-serif)] italic text-[var(--card-moss)]">
        Rien ici pour l&apos;instant.
      </p>
    );
  }

  // The old 560px cap was sized for one column of rows and would pin the grid
  // at two columns forever.
  return (
    <ul className={cn("mx-auto max-w-[880px]", pageGrid)}>
      {pages.map((page) => (
        <li key={page.slug}>
          <PageTile
            href={`/p/${page.slug}`}
            title={page.title}
            eyebrow={formatLongDate(page.createdAt)}
            preview={<HtmlPreview slug={page.slug} />}
          />
        </li>
      ))}
    </ul>
  );
}
