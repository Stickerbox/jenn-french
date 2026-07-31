"use client";

import { useId, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Collapsible({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls={id}
        className="mx-auto flex items-center gap-2 font-[family-name:var(--font-display)] text-2xl italic text-[var(--color-ink)]"
      >
        {label}
        <span
          aria-hidden="true"
          className={cn(
            "text-base not-italic text-[var(--color-ink-muted)] transition-transform duration-300",
            open && "rotate-90",
          )}
        >
          ›
        </span>
      </button>

      {/* grid-rows 0fr→1fr rather than a max-height guess: it animates to the
          content's real height, so a form that grows a field later still
          opens cleanly instead of being clipped by a number picked today. */}
      <div
        id={id}
        inert={!open}
        className={cn(
          "grid transition-[grid-template-rows,opacity] duration-300 ease-out",
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        )}
      >
        {/* The animating row has to hide the overflow; the padding lives here
            so it collapses with the content instead of holding the row open. */}
        <div className="overflow-hidden">
          <div className="pt-5">{children}</div>
        </div>
      </div>
    </div>
  );
}
