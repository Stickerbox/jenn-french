"use client";

import { PRINT_MESSAGE } from "@/lib/printable-bootstrap";

// The frame is found by id rather than through a ref so the shell can stay a
// server component and this button is the only thing shipped to the browser on
// this route. There is exactly one frame here, fixed to the viewport, so there
// is nothing for an id to be ambiguous about.
export const PAGE_FRAME_ID = "page-document";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => {
        const frame = document.getElementById(PAGE_FRAME_ID);
        if (!(frame instanceof HTMLIFrameElement)) return;
        // "*" because the frame's origin is opaque — there is no origin string
        // that would match it. The listener authenticates us from the other
        // side instead, by checking that the sender is its own parent.
        frame.contentWindow?.postMessage(PRINT_MESSAGE, "*");
      }}
      // "Imprimer ou enregistrer en PDF" and not "Télécharger": this opens the
      // browser's print dialog, where Save as PDF is a destination the student
      // chooses. Promising a download would be a promise the dialog can break.
      title="Imprimer ou enregistrer en PDF"
      aria-label="Imprimer ou enregistrer en PDF"
      className="fixed bottom-5 right-5 z-10 rounded-full border border-[var(--card-line)] bg-[var(--card-paper)] px-5 py-2.5 font-[family-name:var(--card-font-mono)] text-[11px] uppercase tracking-[2px] text-[var(--card-ink)] shadow-[var(--card-shadow)] transition-opacity hover:opacity-80 print:hidden"
    >
      PDF
    </button>
  );
}
