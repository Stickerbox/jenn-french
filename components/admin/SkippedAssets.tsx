import type { SkippedRef } from "@/lib/page-inline";
import type { Strings } from "@/lib/strings";

// Publishing folds a page's external scripts, stylesheets, images and fonts into
// the document, and never fails over one it could not fetch — it reports it
// instead. Both admin write paths render this, because a page created from the
// FAB can be just as incomplete as one edited at /admin/pages/[slug], and a
// warning only one of them shows is a warning nobody sees on the other.
export function SkippedAssets({
  skipped,
  strings,
}: {
  skipped: SkippedRef[];
  strings: Strings;
}) {
  if (skipped.length === 0) return null;

  return (
    <div role="status" className="text-sm text-[var(--color-ink-muted)]">
      {/* card-rouge, not the accent — see CardEditor's identical note: since
          Task F, --color-accent is the brand's lilac, not a colour that reads
          as "this needs attention". */}
      <p className="text-[var(--card-rouge)]">
        {strings.admin.skippedAssets.notIncluded(skipped.length)}
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
