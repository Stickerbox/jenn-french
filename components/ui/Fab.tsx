"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useOverlayCount } from "@/components/ui/OverlayProvider";
import { accentFocusRing } from "@/components/ui/field";

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
  // AddSheet and ChatPanel were `z-50`, same as this button, and render earlier
  // in the tree — so on a phone they lost the document-order tiebreak and this
  // button painted on top of them. Both are `z-[60]` now, which fixes the
  // overlap but not the ask: over a dimmed backdrop the button would still be
  // visible, just behind the card. Hiding it is the fix — but only below `md`:
  // at desktop size the chat panel
  // floats at bottom-24 right-4 with the page still readable behind it, and
  // this button is what closes it, so hiding it there would strand the panel.
  const overlayOpen = useOverlayCount() > 0;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={expanded}
      aria-label={label}
      className={cn(
        "fixed z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-accent)] text-white shadow-lg transition-opacity duration-150 hover:opacity-90 motion-reduce:transition-none",
        accentFocusRing,
        overlayOpen && "hidden md:flex",
        className,
      )}
    >
      {children}
      {badge}
    </button>
  );
}
