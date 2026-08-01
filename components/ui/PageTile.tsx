import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { cardEyebrow, pageTileFrame } from "@/components/card-styles";

export function PageTile({
  href,
  external,
  title,
  eyebrow,
  preview,
  badge,
  action,
  className,
}: {
  href: string;
  // An off-site destination. The title has to become a plain <a> rather than a
  // next/link <Link>, and it must carry rel="noopener" — without it the opened
  // page gets a window.opener handle back to this tab and can navigate it
  // somewhere else while the student is reading (reverse tabnabbing).
  external?: boolean;
  title: string;
  eyebrow: string;
  // A node rather than a slug, deliberately. Support for links to pages we do
  // not host is planned; that variant passes its own renderer here and this
  // component does not change, because it never learns what kind of thing it
  // is previewing. A cross-origin URL generally cannot be framed at all, so
  // that renderer will not be HtmlPreview with a different src.
  preview: ReactNode;
  // A marker over the preview's corner — today a pin. A slot for the same
  // reason as `preview`: the tile does not learn what a pin is, and a later
  // marker needs no change here. Decorative only; it never takes a click.
  badge?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn(pageTileFrame, className)}>
      {preview}

      {/* pointer-events-none so the marker never eats the tile's stretched
          link. The interactive pin lives in `action`, in the footer. */}
      {badge && (
        <div className="pointer-events-none absolute right-2 top-2 z-10">
          {badge}
        </div>
      )}

      <div className="min-w-0 border-t border-[var(--card-line)] px-4 py-3">
        {/* Stretched over the whole tile rather than wrapping it: `action`
            is itself made of anchors, and an anchor inside an anchor is
            invalid HTML that browsers repair by splitting the element. */}
        {/* The duplicated class string is deliberate: hoisting it to a constant
            to avoid repeating it twice reads worse than the repetition. */}
        {external ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="block truncate font-[family-name:var(--card-font-serif)] text-[15px] text-[var(--card-ink)] after:absolute after:inset-0"
          >
            {title}
          </a>
        ) : (
          <Link
            href={href}
            className="block truncate font-[family-name:var(--card-font-serif)] text-[15px] text-[var(--card-ink)] after:absolute after:inset-0"
          >
            {title}
          </Link>
        )}
        {/* Wraps rather than truncating: at a tile's width the admin's eyebrow
            is a date AND an audience, and truncating cut it to
            "31 JUILLET 2026 · NO STUDEN…". Tiles in a row stretch to the
            tallest, so a second line costs alignment nothing. */}
        <span className={cn("mt-0.5 block", cardEyebrow)}>{eyebrow}</span>

        {/* Below the date and left-aligned, on their own line rather than
            opposite the title: the title is what needs the width, and a
            truncated title beside two icons truncates sooner than it has to. */}
        {action && <div className="relative z-10 mt-2">{action}</div>}
      </div>
    </div>
  );
}
