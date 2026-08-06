"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { cardFocusRing } from "@/components/card-styles";
import { accentFocusRing } from "@/components/ui/field";

// Two skins because there are two palettes: the admin app in --color-* and the
// flashcard template in --card-*. Same control, and the student's shelf has to
// look like the student's shelf.
export type ChipTone = "admin" | "card";

const TONES: Record<ChipTone, { on: string; off: string; ring: string }> = {
  admin: {
    on: "border-[var(--color-accent)] bg-[var(--color-accent)] font-medium text-white",
    off: "border-[var(--color-field-border)] bg-[var(--color-field)] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]",
    ring: accentFocusRing,
  },
  card: {
    on: "border-[var(--card-bleu)] bg-[var(--card-bleu)] font-medium text-white",
    off: "border-[var(--card-line)] bg-[var(--card-paper)] text-[var(--card-moss)] hover:text-[var(--card-ink)]",
    ring: cardFocusRing,
  },
};

export function FilterChip({
  active,
  tone,
  onClick,
  children,
}: {
  active: boolean;
  tone: ChipTone;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex min-h-[44px] items-center rounded-full border px-4 py-1.5 font-[family-name:var(--font-body)] text-sm transition-colors duration-150 motion-reduce:transition-none",
        active ? TONES[tone].on : TONES[tone].off,
        TONES[tone].ring,
      )}
    >
      {children}
    </button>
  );
}
