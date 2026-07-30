"use client";

import { useState } from "react";
import { Tile } from "@/components/ui/Tile";
import { SearchField } from "@/components/admin/SearchField";
import { filterPages } from "@/lib/admin-search";
import { formatLongDate } from "@/lib/format";

export type PageSummary = {
  id: string;
  slug: string;
  title: string;
  createdAt: Date;
  groupNames: string[];
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

export function PageList({ pages }: { pages: PageSummary[] }) {
  const [query, setQuery] = useState("");
  const visible = filterPages(pages, query);

  if (pages.length === 0) {
    return (
      <p className="mb-8 text-center text-sm text-[var(--color-ink-muted)]">
        No pages yet.
      </p>
    );
  }

  return (
    <div className="mb-10">
      <SearchField
        label="Search pages"
        value={query}
        onChange={setQuery}
        shown={visible.length}
        total={pages.length}
      />

      {visible.length === 0 ? (
        <p className="text-center text-sm text-[var(--color-ink-muted)]">
          Nothing matches that.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {visible.map((page) => (
            <li key={page.id}>
              <Tile
                href={`/admin/pages/${page.slug}`}
                title={page.title}
                eyebrow={`${formatLongDate(page.createdAt)} · ${
                  page.groupNames.length === 0
                    ? "no groups"
                    : page.groupNames.join(", ")
                }`}
                action={
                  // No server support needed: `download` on a same-origin
                  // response forces a save-as, so the raw route keeps its
                  // exact behaviour and its CSP, and no new authenticated
                  // surface appears. That route is already public.
                  <a
                    href={`/p/${page.slug}/raw`}
                    download={`${page.slug}.html`}
                    aria-label={`Download ${page.title}`}
                    title="Download"
                    className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--card-bleu)] transition-colors hover:bg-[var(--card-bleu-soft)]"
                  >
                    <DownloadIcon />
                  </a>
                }
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
