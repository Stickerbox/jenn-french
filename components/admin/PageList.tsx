import Link from "next/link";

export type PageSummary = {
  id: string;
  slug: string;
  title: string;
  groupNames: string[];
};

export function PageList({ pages }: { pages: PageSummary[] }) {
  if (pages.length === 0) {
    return (
      <p className="mb-6 text-sm text-[var(--color-ink-muted)]">No pages yet.</p>
    );
  }

  return (
    <ul className="mb-6 flex flex-col gap-2">
      {pages.map((page) => (
        <li key={page.id} className="flex items-baseline justify-between gap-4">
          <Link
            href={`/admin/pages/${page.slug}`}
            className="text-[var(--color-accent)] underline"
          >
            {page.title} (/p/{page.slug})
          </Link>
          <span className="shrink-0 text-sm text-[var(--color-ink-muted)]">
            {page.groupNames.length === 0
              ? "no groups"
              : page.groupNames.join(", ")}
          </span>
        </li>
      ))}
    </ul>
  );
}
