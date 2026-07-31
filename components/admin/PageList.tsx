"use client";

import { useState, type ReactNode } from "react";
import { Tile } from "@/components/ui/Tile";
import { SearchField } from "@/components/admin/SearchField";
import {
  filterPages,
  filterPagesByGroup,
  pageGroupNames,
} from "@/lib/admin-search";
import { formatLongDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export type PageSummary = {
  id: string;
  slug: string;
  title: string;
  createdAt: Date;
  groupNames: string[];
  sharedWithEveryone: boolean;
};

const pageActionClass =
  "flex h-9 w-9 items-center justify-center rounded-full text-[var(--card-bleu)] transition-colors hover:bg-[var(--card-bleu-soft)]";

function EyeIcon() {
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
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
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

function GroupChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full border px-4 py-1.5 font-[family-name:var(--font-body)] text-sm transition-colors",
        active
          ? "border-[var(--color-accent)] bg-[var(--color-accent)] font-medium text-white"
          : "border-[var(--color-field-border)] bg-[var(--color-field)] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]",
      )}
    >
      {children}
    </button>
  );
}

export function PageList({
  pages,
  everyoneName,
}: {
  pages: PageSummary[];
  // Read from the flagged row rather than from a constant: the name is the
  // teacher's to change, and a stale literal here would silently stop a
  // student's chip widening to their inherited pages.
  everyoneName: string | null;
}) {
  const [query, setQuery] = useState("");
  // One group at a time rather than a set. With a handful of groups, "which
  // one am I looking at" is a question a chip row can answer at a glance,
  // and it avoids the empty-selection ambiguity of checkboxes — does nothing
  // ticked mean everything or nothing?
  const [group, setGroup] = useState<string | null>(null);

  const groupNames = pageGroupNames(pages);
  const visible = filterPagesByGroup(
    filterPages(pages, query),
    group,
    everyoneName ?? undefined,
  );

  if (pages.length === 0) {
    return (
      <p className="mb-8 text-center text-sm text-[var(--color-ink-muted)]">
        No pages yet.
      </p>
    );
  }

  return (
    <div className="mb-10">
      <SearchField label="Search pages" value={query} onChange={setQuery} />

      {groupNames.length > 0 && (
        <div
          role="group"
          aria-label="Filter by student"
          className="mb-5 flex flex-wrap justify-center gap-2"
        >
          <GroupChip active={group === null} onClick={() => setGroup(null)}>
            All
          </GroupChip>
          {groupNames.map((name) => (
            <GroupChip
              key={name}
              active={group === name}
              // Clicking the active chip clears it, so the row never becomes
              // a trap she has to find "All" to escape.
              onClick={() => setGroup(group === name ? null : name)}
            >
              {name}
            </GroupChip>
          ))}
        </div>
      )}

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
                  page.sharedWithEveryone
                    ? "shared with everyone"
                    : page.groupNames.length === 0
                      ? "no students"
                      : page.groupNames.join(", ")
                }`}
                action={
                  <div className="flex items-center gap-1">
                    {/* /p/[slug] is the page itself, sandboxed exactly as a
                        student gets it — a page has no group-scoped URL, so
                        this is the link whatever groups it belongs to. */}
                    <a
                      href={`/p/${page.slug}`}
                      target="_blank"
                      rel="noopener"
                      aria-label={`View ${page.title}`}
                      title="View"
                      className={pageActionClass}
                    >
                      <EyeIcon />
                    </a>

                    {/* No server support needed: `download` on a same-origin
                        response forces a save-as, so the raw route keeps its
                        exact behaviour and its CSP, and no new authenticated
                        surface appears. That route is already public. */}
                    <a
                      href={`/p/${page.slug}/raw`}
                      download={`${page.slug}.html`}
                      aria-label={`Download ${page.title}`}
                      title="Download"
                      className={pageActionClass}
                    >
                      <DownloadIcon />
                    </a>
                  </div>
                }
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
