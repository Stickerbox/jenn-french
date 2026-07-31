import { Tile } from "@/components/ui/Tile";
import { formatLongDate } from "@/lib/format";

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

  return (
    <ul className="mx-auto flex max-w-[560px] flex-col gap-3">
      {pages.map((page) => (
        <li key={page.slug}>
          <Tile
            href={`/p/${page.slug}`}
            title={page.title}
            eyebrow={formatLongDate(page.createdAt)}
          />
        </li>
      ))}
    </ul>
  );
}
