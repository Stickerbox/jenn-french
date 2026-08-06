import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { cardEyebrow } from "@/components/card-styles";

// The flashcard palette, deliberately, in the admin lists as well as the
// student one: the point of the pages list looking like the student's list is
// that Jenn can see what she published without leaving the admin screen.
export function Tile({
  href,
  title,
  eyebrow,
  action,
  className,
}: {
  href: string;
  title: string;
  eyebrow: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        // has-[a:focus-visible]:ring-2 — the same reason PageTile's
        // pageTileFrame rings the whole card rather than relying on the
        // browser's own outline: the title link below is stretched over the
        // row with `after:absolute after:inset-0`, so an outline on the
        // anchor itself would draw around the small title text underneath
        // that overlay, not around the row a mouse user would call "the
        // tile" — a keyboard user tabbing through the list would see nothing.
        "relative flex items-center justify-between gap-4 rounded-[14px] border border-[var(--card-line)] bg-[var(--card-paper)] px-5 py-4 shadow-[var(--card-shadow)] transition-opacity duration-150 hover:opacity-85 motion-reduce:transition-none has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-[var(--card-bleu)] has-[a:focus-visible]:ring-offset-2 has-[a:focus-visible]:ring-offset-[var(--card-paper)]",
        className,
      )}
    >
      <div className="min-w-0">
        {/* The link is stretched over the whole tile rather than wrapping it:
            `action` is itself interactive, and an anchor inside an anchor is
            invalid HTML that browsers repair by splitting the element.
            focus-visible:outline-none here — the ring is drawn on the tile
            itself, above, via has-[a:focus-visible]; an outline here too
            would double the signal with a mismatched shape (a thin rectangle
            around the text, inside a ring around the card). */}
        <Link
          href={href}
          className="font-[family-name:var(--card-font-serif)] text-lg text-[var(--card-ink)] after:absolute after:inset-0 focus-visible:outline-none"
        >
          {title}
        </Link>
        <span className={cn("mt-1 block", cardEyebrow)}>{eyebrow}</span>
      </div>

      {action && <div className="relative z-10 shrink-0">{action}</div>}
    </div>
  );
}
