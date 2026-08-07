"use client";

import type { ReactNode } from "react";
import {
  ShellBar,
  type ShellBarBack,
} from "@/components/ui/ShellBar";

// The page around PdfDocumentView's scrolling column of canvases: the shared
// ShellBar in its `sticky` form, over the document.
//
// It used to carry its own copy of that bar. WorksheetShell had the other,
// with a comment asking whoever edited one to keep the other in step by eye —
// which is how the two came to differ in how they aligned their middle track.
// One component now, one place to change.
export function PdfShell({
  back,
  center,
  actions,
  ariaLabel,
  children,
}: {
  back: ShellBarBack;
  center: ReactNode;
  actions?: ReactNode;
  ariaLabel: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-[var(--card-paper-back)]">
      <ShellBar
        variant="sticky"
        ariaLabel={ariaLabel}
        back={back}
        center={center}
        actions={actions}
      />
      {children}
    </div>
  );
}
