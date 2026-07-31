import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { cardEyebrow, pageTileFrame } from "@/components/card-styles";

export function PageTile({
  href,
  title,
  eyebrow,
  preview,
  action,
  className,
}: {
  href: string;
  title: string;
  eyebrow: string;
  // A node rather than a slug, deliberately. Support for links to pages we do
  // not host is planned; that variant passes its own renderer here and this
  // component does not change, because it never learns what kind of thing it
  // is previewing. A cross-origin URL generally cannot be framed at all, so
  // that renderer will not be HtmlPreview with a different src.
  preview: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn(pageTileFrame, className)}>
      {preview}

      <div className="flex items-start justify-between gap-2 border-t border-[var(--card-line)] px-4 py-3">
        <div className="min-w-0">
          {/* Stretched over the whole tile rather than wrapping it: `action`
              is itself made of anchors, and an anchor inside an anchor is
              invalid HTML that browsers repair by splitting the element. */}
          <Link
            href={href}
            className="block truncate font-[family-name:var(--card-font-serif)] text-[15px] text-[var(--card-ink)] after:absolute after:inset-0"
          >
            {title}
          </Link>
          <span className={cn("mt-0.5 block truncate", cardEyebrow)}>
            {eyebrow}
          </span>
        </div>

        {action && <div className="relative z-10 shrink-0">{action}</div>}
      </div>
    </div>
  );
}
