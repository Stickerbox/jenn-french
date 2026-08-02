"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// The round button in the bottom-right corner. Extracted from ChatFab so the
// chat bubble and the add button are one object rendered twice: they sit side
// by side, and two copies of the same class string would drift the first time
// one of them was adjusted.
//
// Position comes in through `className` rather than a prop, because there are
// exactly two positions and both are one Tailwind pair. The accent colour is
// the admin palette's on both surfaces, deliberately — the chat button has
// always been --color-accent on the student page, and the add button standing
// beside it in --card-bleu would read as a different kind of control.
export function Fab({
  label,
  expanded,
  onClick,
  className,
  badge,
  children,
}: {
  label: string;
  expanded?: boolean;
  onClick: () => void;
  className?: string;
  // A dot over the corner. Decorative; it never takes a click.
  badge?: ReactNode;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={expanded}
      aria-label={label}
      className={cn(
        "fixed z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-accent)] text-white shadow-lg transition-opacity hover:opacity-90",
        className,
      )}
    >
      {children}
      {badge}
    </button>
  );
}
