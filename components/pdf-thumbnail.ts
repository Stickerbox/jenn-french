"use client";

import { setPageThumb } from "@/app/page-actions";

// Impure, and therefore NOT in lib/. In this codebase lib/ means "a rule with a
// test"; this needs a DOM canvas and a web worker and has neither. The whiteboard
// already made exactly this split — lib/whiteboard-thumbnail.ts is the validator
// and renderThumbnail lives at the bottom of BoardEditor.tsx — and this sits in
// its own module only because two forms call it.
//
// The "use client" directive is not strictly required for a plain module, and is
// here to make the boundary explicit: importing this from a server component
// should fail loudly rather than drag a PDF renderer into the server bundle.
//
// It moved out of components/admin/ when a student gained the ability to upload
// a PDF to their own shelf. It is no longer Jenn's browser only, and the
// accepted cost is stated plainly: A STUDENT STAGING A PDF FETCHES pdf.js ONCE,
// at that moment, on their phone. The dynamic import below is what keeps that
// to the students who actually upload something, and the two timeouts below
// are what keep a slow connection to a glyph rather than to a stuck form.

// The same width BoardEditor renders a board thumbnail at, and about the rendered
// width of a tile in the 1152px four-column grid — so nothing upscales. The
// natural aspect ratio is kept: the 4:3 crop is CSS, so changing the crop later
// does not mean re-rendering every stored thumbnail.
export const THUMB_WIDTH = 320;

// Two budgets, not one. A single 10-second race used to cover BOTH fetching
// pdf.js itself (the dynamic import below begins with that) and rendering with
// it, and on weak LTE the renderer and its worker are most of a megabyte —
// downloading them alone could eat the whole budget, so a student on a slow
// connection got the glyph even for a PDF that would have rendered fine once
// the library arrived. Loading gets its own generous window; only the actual
// render is held to the tight one.
const LOAD_TIMEOUT_MS = 30_000;

// A big scan can take a while, and past this she is waiting on a preview she did
// not ask for. The glyph is a working answer.
const RENDER_TIMEOUT_MS = 10_000;

// Never throws and never rejects. An encrypted PDF, a corrupt PDF, a zero-page
// PDF, a worker that failed to load and a render that ran long all come back
// null, and null means "draw the glyph".
//
// AN UPLOAD MUST NOT FAIL BECAUSE A PREVIEW DID NOT RENDER. The document is the
// thing being saved; this is decoration on top of it.
export async function renderPdfThumbnail(file: File): Promise<Blob | null> {
  try {
    const pdfjs = await Promise.race([
      loadPdfjs(),
      new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), LOAD_TIMEOUT_MS),
      ),
    ]);
    if (pdfjs === null) return null;

    return await Promise.race([
      render(file, pdfjs),
      new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), RENDER_TIMEOUT_MS),
      ),
    ]);
  } catch {
    return null;
  }
}

// Dynamic, and this is the load-bearing line of the whole feature — MORE so
// now than when it was written. A static import would put a PDF renderer into
// a chunk the router could serve to a student who never uploads anything;
// like this it is fetched only by whoever actually stages a PDF, at the
// moment they stage it.
//
// It is also what makes this consistent with the 2026-08-03 spec's refusal of
// pdf.js — that refusal was about a shelf mounting a dozen renderers at once,
// which is still not what happens here. One renderer, on demand, once.
//
// Split out from render() so LOAD_TIMEOUT_MS can cover only this — the network
// fetch of the library and its worker — and RENDER_TIMEOUT_MS covers only the
// decode-and-draw that follows.
type PdfjsModule = typeof import("pdfjs-dist");

async function loadPdfjs(): Promise<PdfjsModule> {
  const pdfjs = await import("pdfjs-dist");

  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();

  return pdfjs;
}

async function render(
  file: File,
  pdfjs: PdfjsModule,
): Promise<Blob | null> {
  const data = new Uint8Array(await file.arrayBuffer());
  // The loading task is held rather than discarded because in pdf.js 6 it, and
  // not the document proxy, is what owns destroy() — the proxy has only
  // cleanup(), which frees rendered resources and leaves the worker's copy of
  // the file behind.
  const task = pdfjs.getDocument({ data });
  const doc = await task.promise;

  try {
    if (doc.numPages < 1) return null;
    const page = await doc.getPage(1);

    const unscaled = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({
      scale: THUMB_WIDTH / unscaled.width,
    });

    const canvas = document.createElement("canvas");
    canvas.width = THUMB_WIDTH;
    canvas.height = Math.round(viewport.height);

    const context = canvas.getContext("2d");
    if (!context) return null;

    // White first. A PDF page carries no background of its own and an unpainted
    // canvas is transparent, which a JPEG encodes as black — so skipping this
    // produces a page of white text on black.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);

    // `canvas` and not `canvasContext`: pdf.js 6 deprecated the context form and
    // asks for the element, taking the context from it. The white fill above
    // survives because it is the same canvas — pdf.js draws over it rather than
    // resetting it.
    await page.render({ canvas, viewport }).promise;

    return await new Promise<Blob | null>((resolve) =>
      // 0.6 rather than lossless: this is a 320px preview stored in SQLite for
      // every PDF, and validatePageThumb caps it at 128 KB.
      canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.6),
    );
  } finally {
    // Frees the worker's copy of the document. Without it a session of uploads
    // accumulates parsed PDFs in the worker for the life of the tab.
    void task.destroy();
  }
}

/**
 * Renders and stores a preview for an already-uploaded pdf row, for
 * ThumbBackfill. The set this covers is exactly a student's failed render on
 * their own upload — ShelfFab.submitPdf no longer waits out a slow one (see
 * THUMB_WAIT_MS there), so whatever it dropped lands here with thumbAt still
 * null.
 *
 * Fetches the stored bytes back through the PUBLIC /p/[slug]/pdf route rather
 * than a teacher-only one: this runs in the same admin browser
 * captureHtmlThumbnail already renders in, and refetching the row from the
 * database would need a second server action just to hand bytes to a
 * File constructor that already exists as a route.
 *
 * Same total contract as captureAndStoreThumbnail: returns false on ANY
 * failure — the fetch, the render, the store — and never throws. A backfill
 * that could itself fail loudly would defeat the reason it exists.
 */
export async function renderAndStorePdfThumbnail(
  slug: string,
): Promise<boolean> {
  try {
    const response = await fetch(`/p/${encodeURIComponent(slug)}/pdf`);
    if (!response.ok) return false;

    const blob = await response.blob();
    // The renderer takes a File, the shape staging already hands it; the name
    // is never shown anywhere, so it says nothing about the page's real title.
    const file = new File([blob], "document.pdf", { type: "application/pdf" });

    const thumb = await renderPdfThumbnail(file);
    if (thumb === null) return false;

    const formData = new FormData();
    // The field name readThumb reads, matching captureAndStoreThumbnail.
    formData.set("thumb", thumb, "thumb.jpg");
    await setPageThumb(slug, formData);
    return true;
  } catch {
    return false;
  }
}
