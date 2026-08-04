"use client";

// Impure, and therefore NOT in lib/. In this codebase lib/ means "a rule with a
// test"; this needs a DOM canvas and a web worker and has neither. The whiteboard
// already made exactly this split — lib/whiteboard-thumbnail.ts is the validator
// and renderThumbnail lives at the bottom of BoardEditor.tsx — and this sits in
// its own module only because two forms call it.
//
// The "use client" directive is not strictly required for a plain module, and is
// here to make the boundary explicit: importing this from a server component
// should fail loudly rather than drag a PDF renderer into the server bundle.

// The same width BoardEditor renders a board thumbnail at, and about the rendered
// width of a tile in the 1152px four-column grid — so nothing upscales. The
// natural aspect ratio is kept: the 4:3 crop is CSS, so changing the crop later
// does not mean re-rendering every stored thumbnail.
export const THUMB_WIDTH = 320;

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
    return await Promise.race([
      render(file),
      new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), RENDER_TIMEOUT_MS),
      ),
    ]);
  } catch {
    return null;
  }
}

async function render(file: File): Promise<Blob | null> {
  // Dynamic, and this is the load-bearing line of the whole feature. A static
  // import would put a PDF renderer into a chunk the router could ship anywhere;
  // like this it is fetched by Jenn, on the admin screen, the first time she
  // stages a PDF, and no student request ever touches it.
  //
  // It is also what makes this change consistent with the 2026-08-03 spec's
  // refusal of pdf.js — that refusal was about a shelf mounting a dozen
  // renderers at once, which is not what happens here.
  const pdfjs = await import("pdfjs-dist");

  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();

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
