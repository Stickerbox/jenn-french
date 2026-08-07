"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { cardFocusRing } from "@/components/card-styles";

// The one bar above a full-screen document, whichever kind it is: an html
// worksheet's sandboxed iframe, a PDF's rasterised canvases, or a plain
// published page. It was two copies until 2026-08-06 — WorksheetShell had one
// and PdfShell had the other, with a comment on the second telling the reader
// to keep them in step BY EYE. That is a promise no future edit keeps, and the
// two had already drifted: only one of them centred its middle track.

export const shellBarButtonClass = cn(
  "flex h-11 shrink-0 items-center gap-1.5 rounded-full border border-[var(--card-line)] bg-[var(--card-paper)] px-3 font-[family-name:var(--card-font-serif)] text-sm text-[var(--card-moss)] shadow-[var(--card-shadow)] transition-colors duration-150 hover:bg-[var(--card-section)] motion-reduce:transition-none",
  cardFocusRing,
);

// The document's name, when the middle track has no tabs to show. Shared so
// the weight is decided once: `text-base font-semibold` against the controls'
// regular `text-sm` is what makes it read as the heading of the page rather
// than a third label competing with them.
export function ShellTitle({ children }: { children: ReactNode }) {
  return (
    <h1 className="truncate px-2 font-[family-name:var(--card-font-serif)] text-base font-semibold text-[var(--card-ink)]">
      {children}
    </h1>
  );
}

export type ShellBarBack =
  // A real target, rendered as an <a>. CLAUDE.md states why that matters
  // wherever one exists: the whiteboard's leave-guard is a capture-phase
  // click listener on `document` that inspects real anchors, so this is
  // protected by it for free, and a router.push handler would slip past it.
  | { kind: "link"; href: string; label: string }
  // No target exists — /p/[slug] has only a slug and no group to go back to.
  // Not an anchor, and so not covered by the leave-guard, which is accepted
  // there because that route has nothing for the guard to protect: no live
  // board, no unsaved worksheet, just a viewer over a public document.
  | { kind: "history"; label: string };

export function ShellBar({
  back,
  center,
  actions,
  variant,
  ariaLabel,
}: {
  back: ShellBarBack;
  center: ReactNode;
  actions?: ReactNode;
  // `floating` sits over a `fixed inset-0` document that scrolls inside
  // itself, so it carries no background of its own and nothing beneath it
  // moves. `sticky` sits over content in normal flow, so it needs a ground to
  // stop the document sliding visibly under the words — and it reserves its
  // own space by staying in flow until it starts sticking, which is what
  // spares the caller the padding arithmetic a fixed bar would demand.
  variant: "floating" | "sticky";
  ariaLabel: string;
}) {
  return (
    <nav
      aria-label={ariaLabel}
      // Three tracks rather than a centred row with the controls laid over
      // it. The two `1fr` edges are equal, so the middle is centred on the
      // VIEWPORT and not on the space left over — but they are `1fr` and not
      // `minmax(0,1fr)`, so neither can shrink below its own content and let
      // a control overlap the middle. The middle absorbs the shortfall
      // instead, by scrolling: three French version labels are wider than a
      // phone.
      //
      // Back sits in the FIRST track. Leaving is a backwards move and the
      // reading order should meet it first — and on the shelf this returns
      // to, the tile it came from is at the top left.
      className={cn(
        "z-10 grid grid-cols-[1fr_auto_1fr] items-start gap-2 px-4 print:hidden",
        variant === "floating"
          ? "fixed inset-x-0 top-0 pt-4"
          : "sticky top-0 border-b border-[var(--card-line)] bg-[var(--card-paper-back)] py-4",
      )}
    >
      <div className="flex justify-start">
        {back.kind === "link" ? (
          <a
            href={back.href}
            aria-label={back.label}
            className={shellBarButtonClass}
          >
            <BackIcon />
            <span className="hidden whitespace-nowrap sm:inline">
              {back.label}
            </span>
          </a>
        ) : (
          <button
            type="button"
            onClick={() => window.history.back()}
            aria-label={back.label}
            className={shellBarButtonClass}
          >
            <BackIcon />
            <span className="hidden whitespace-nowrap sm:inline">
              {back.label}
            </span>
          </button>
        )}
      </div>

      {/* `h-11` and `items-center`: the middle track used to align to the top
          of a row whose other tracks are 44px tall, which left a title sitting
          high and reading as though it belonged to nothing. */}
      <div className="flex h-11 min-w-0 max-w-full items-center justify-center overflow-x-auto">
        {center}
      </div>

      {/* min-w-0 so a wide action — the worksheet upload's drop zone — can
          shrink and wrap rather than forcing the row to overflow. With the
          sticky variant a taller action simply grows the bar and the document
          below starts lower, which is the other half of why that variant is
          not `fixed`. */}
      <div className="flex min-w-0 justify-end">{actions}</div>
    </nav>
  );
}

// Local to the file that draws it, the same way PrintButton keeps its own save
// glyph, rather than an icon module for a handful of one-off shapes.
function BackIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M19 12H5" />
      <path d="m12 19-7-7 7-7" />
    </svg>
  );
}
