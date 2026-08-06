"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { cardFocusRing } from "@/components/card-styles";

// The chrome around PdfDocumentView's scrolling column: a back control at the
// left, arbitrary content in the middle (a plain title on /p/[slug], the
// worksheet's own version tab strip on /g/[slug]/w/[pageSlug]/pdf), and an
// actions slot at the right. Styled like WorksheetShell's own top bar on
// purpose — the two are siblings, one for an html worksheet's iframe and this
// one for a PDF's canvases, and they should read as one feature.
//
// `sticky`, not `fixed` — unlike WorksheetShell, this bar sits above content
// that scrolls in normal document flow rather than a `fixed inset-0` iframe
// with its own internal scroll, so there is no separate document to reach
// into and no padding-to-clear-the-bar arithmetic to keep in step with the
// bar's own height. Sticky reserves its own space by staying in flow until it
// starts sticking.
export const pdfShellButtonClass = cn(
  "flex h-11 shrink-0 items-center gap-1.5 rounded-full border border-[var(--card-line)] bg-[var(--card-paper)] px-3 font-[family-name:var(--card-font-serif)] text-sm text-[var(--card-moss)] shadow-[var(--card-shadow)] transition-colors duration-150 hover:bg-[var(--card-section)] motion-reduce:transition-none",
  cardFocusRing,
);

type PdfShellBack =
  // A real target: rendered as an <a>. CLAUDE.md states why an anchor
  // matters wherever one is possible — the whiteboard's leave-guard is a
  // capture-phase click listener on `document` that inspects real anchors,
  // so this is protected by it for free without knowing it exists, and a
  // `router.push` handler would slip past it.
  | { kind: "link"; href: string; label: string }
  // No target exists — see app/p/[slug]/page.tsx, the one caller with
  // nothing to go "back to" inside this app. Not an anchor, and therefore
  // not covered by the leave-guard, which is accepted here because there is
  // nothing on this route for the guard to protect: no live board, no
  // unsaved worksheet, just a stateless viewer over a public document.
  | { kind: "history"; label: string };

export function PdfShell({
  back,
  center,
  actions,
  children,
}: {
  back: PdfShellBack;
  center: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-[var(--card-paper-back)]">
      <nav
        aria-label={back.label}
        // Three tracks, the same grid WorksheetShell's own nav uses and for
        // the same reason: the two `1fr` edges are equal, so the strip is
        // centred on the viewport rather than on whatever room the back
        // control and the actions slot happen to leave over — but they are
        // `1fr`, not `minmax(0,1fr)`, so neither can shrink below its own
        // content and let the middle track overlap it. The middle track
        // absorbs the shortfall instead, by scrolling.
        className="sticky top-0 z-10 grid grid-cols-[1fr_auto_1fr] items-start gap-2 border-b border-[var(--card-line)] bg-[var(--card-paper-back)] px-4 py-4 print:hidden"
      >
        <div className="flex justify-start">
          {back.kind === "link" ? (
            <a href={back.href} aria-label={back.label} className={pdfShellButtonClass}>
              <BackIcon />
              <span className="hidden whitespace-nowrap sm:inline">{back.label}</span>
            </a>
          ) : (
            <button
              type="button"
              onClick={() => window.history.back()}
              aria-label={back.label}
              className={pdfShellButtonClass}
            >
              <BackIcon />
              <span className="hidden whitespace-nowrap sm:inline">{back.label}</span>
            </button>
          )}
        </div>
        {/* `items-center`, and matching the back control's own height: the
            middle track used to align to the top of a row whose other tracks
            are 44px tall, which left the title sitting high and reading as
            though it belonged to nothing. */}
        <div className="flex h-11 min-w-0 max-w-full items-center justify-center overflow-x-auto">
          {center}
        </div>
        {/* min-w-0 so a wide action — UploadVersion's drop zone, on the
            worksheet route — can shrink and wrap its own text rather than
            forcing the row to overflow. The nav is `sticky`, not `fixed`, on
            purpose: a taller actions track (that drop zone is taller than the
            back button) simply grows the whole bar, and the document below
            starts lower with nothing to overlap — there is no fixed height
            here to keep in step with padding on the content underneath. */}
        <div className="flex min-w-0 justify-end">{actions}</div>
      </nav>
      {children}
    </div>
  );
}

// The same left-pointing arrow WorksheetShell draws for its own back control,
// duplicated rather than imported: this codebase keeps single-purpose icons
// local to the file that draws them (PrintButton's SaveIcon is the same
// pattern) rather than a shared icon module for a handful of one-off glyphs.
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
