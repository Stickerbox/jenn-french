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
        "relative flex items-center justify-between gap-4 rounded-[14px] border border-[var(--card-line)] bg-[var(--card-paper)] px-5 py-4 shadow-[var(--card-shadow)] transition-opacity hover:opacity-85",
        className,
      )}
    >
      <div className="min-w-0">
        {/* The link is stretched over the whole tile rather than wrapping it:
            `action` is itself interactive, and an anchor inside an anchor is
            invalid HTML that browsers repair by splitting the element. */}
        <Link
          href={href}
          className="font-[family-name:var(--card-font-serif)] text-lg text-[var(--card-ink)] after:absolute after:inset-0"
        >
          {title}
        </Link>
        <span className={cn("mt-1 block", cardEyebrow)}>{eyebrow}</span>
      </div>

      {action && <div className="relative z-10 shrink-0">{action}</div>}
    </div>
  );
}
