import type { SkippedRef } from "@/lib/page-inline";

// Publishing folds a page's external scripts, stylesheets, images and fonts into
// the document, and never fails over one it could not fetch — it reports it
// instead. Both admin write paths render this, because a page created from the
// FAB can be just as incomplete as one edited at /admin/pages/[slug], and a
// warning only one of them shows is a warning nobody sees on the other.
export function SkippedAssets({ skipped }: { skipped: SkippedRef[] }) {
  if (skipped.length === 0) return null;

  return (
    <div role="status" className="text-sm text-[var(--color-ink-muted)]">
      <p className="text-[var(--color-accent)]">
        The page is published, but {skipped.length}{" "}
        {skipped.length === 1 ? "file" : "files"} could not be included:
      </p>
      <ul className="mt-1 space-y-0.5">
        {/* url and reason together: the same URL can legitimately appear twice
            with different reasons, and a duplicate key would drop one line. */}
        {skipped.map((item) => (
          <li key={`${item.url}${item.reason}`}>
            <span className="break-all">{item.url}</span> — {item.reason}
          </li>
        ))}
      </ul>
    </div>
  );
}
