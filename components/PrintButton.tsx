"use client";

import { PRINT_MESSAGE } from "@/lib/printable-bootstrap";

// The frame is found by id rather than through a ref so the shell can stay a
// server component and this button is the only thing shipped to the browser on
// this route. There is exactly one frame here, fixed to the viewport, so there
// is nothing for an id to be ambiguous about.
export const PAGE_FRAME_ID = "page-document";

// A sheet of paper with a corner turned down, and an arrow into it. Not a
// printer: the thing most students want here is a file on their phone, and a
// printer glyph says the one outcome that needs hardware.
function SaveIcon() {
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
      <path d="M12 3v10" />
      <path d="m8 11 4 4 4-4" />
      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </svg>
  );
}

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
      // The label is VISIBLE now rather than hidden in a tooltip. It used to
      // read "PDF" on the button with the full sentence only in the title
      // attribute, which is invisible on a phone — where most of these students
      // are — so the control looked like a file-type badge rather than
      // something to press.
      //
      // "Enregistrer en PDF" and not "Télécharger": this opens the browser's
      // print dialog, where Save as PDF is a destination the student chooses.
      // Promising a download would be a promise the dialog can break.
      title="Imprimer ou enregistrer en PDF"
      className="fixed bottom-5 right-5 z-10 flex items-center gap-2 rounded-full bg-[var(--card-bleu)] px-5 py-3 font-[family-name:var(--card-font-serif)] text-sm text-white shadow-[var(--card-shadow)] transition-opacity hover:opacity-90 print:hidden"
    >
      <SaveIcon />
      {/* The word is hidden on the narrowest screens, where a full-width pill
          would sit over the document it is offering to save. The icon and the
          accessible name below carry it there. */}
      <span className="hidden sm:inline">Enregistrer en PDF</span>
      <span className="sr-only sm:hidden">Enregistrer en PDF</span>
    </button>
  );
}
