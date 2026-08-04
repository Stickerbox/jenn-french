"use client";

// Impure, and therefore NOT in lib/. In this codebase lib/ means "a rule with a
// test"; this needs a DOM, an iframe and a message channel, and has no rule in
// it to test. The same split components/pdf-thumbnail.ts makes beside it, and
// the same one lib/whiteboard-thumbnail.ts and BoardEditor.renderThumbnail make.
//
// The "use client" directive is not strictly required for a plain module, and is
// here to make the boundary explicit: importing this from a server component
// should fail loudly rather than pretend an iframe exists.

import { CAPTURE_MESSAGE } from "@/lib/printable-bootstrap";
import { MAX_THUMB_BYTES } from "@/lib/page-thumb";

// A laptop, not a tile. The page has to lay out the way opening it would —
// sizing the frame to a thumbnail would render the document's own mobile
// breakpoint instead, a layout that opening it never produces. It is the same
// reason HtmlPreview frames at 500% and scales down rather than framing small.
const FRAME_WIDTH = 1024;
const FRAME_HEIGHT = 768;

// Long enough for a CDN-driven layout to settle — a Tailwind build rewriting
// the DOM, a chart drawing itself — and short enough not to be felt. `load`
// fires when the document and its subresources are done, not when the scripts
// they started have finished doing what they do.
const SETTLE_MS = 600;

// The same register as renderPdfThumbnail's RENDER_TIMEOUT_MS, and for the same
// reason: past this she is waiting on a preview she did not ask for. A page
// with an infinite script must not be able to hang a save.
const CAPTURE_TIMEOUT_MS = 10_000;

/**
 * Photographs a stored page and returns a JPEG, or null.
 *
 * NEVER THROWS AND NEVER REJECTS, and that totality is the point of the module
 * rather than a courtesy. A frame that will not load, a document that will not
 * serialise, a tainted canvas, a render past the timeout and an oversized
 * result all resolve `null`, and `null` means "leave the live iframe in place"
 * — which is a working preview, not a broken one. It is the contract
 * renderPdfThumbnail has, for the reason it has it: A SAVE MUST NEVER FAIL
 * BECAUSE A PREVIEW DID NOT RENDER.
 *
 * Because the contract is total, what happens inside here can be replaced —
 * with html2canvas, or with nothing at all — without a single caller learning
 * about it.
 *
 * `version` may be null, which omits ?v= and takes the raw route's `no-store`
 * response. That is what a page written a moment ago wants: any token the
 * caller could hold would be stale by construction.
 */
export async function captureHtmlThumbnail(
  slug: string,
  version: string | null,
): Promise<Blob | null> {
  try {
    return await Promise.race([
      capture(slug, version),
      new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), CAPTURE_TIMEOUT_MS),
      ),
    ]);
  } catch {
    return null;
  }
}

async function capture(
  slug: string,
  version: string | null,
): Promise<Blob | null> {
  const frame = document.createElement("iframe");

  // Offscreen rather than hidden. `display: none` and `visibility: hidden` give
  // a document no layout to photograph, and a zero-sized frame lays out at zero
  // width — all three produce an empty picture rather than no picture.
  frame.style.position = "fixed";
  frame.style.left = "-10000px";
  frame.style.top = "0";
  frame.style.width = `${FRAME_WIDTH}px`;
  frame.style.height = `${FRAME_HEIGHT}px`;
  frame.style.border = "0";
  frame.setAttribute("aria-hidden", "true");

  // allow-scripts so the page's own JavaScript runs — which is the entire
  // feature, since a page whose layout is drawn by a CDN build previews blank
  // without it.
  //
  // NEVER allow-same-origin. With allow-scripts beside it the framed document
  // can remove its own sandbox, and this frame runs whatever a page contains.
  // The opaque origin it leaves us with is why the document rasterises itself
  // and posts the result out, rather than the parent reading into its DOM.
  //
  // A dozen of these at once on a student's phone is the thing the shelf's
  // sandbox="" refuses, and that refusal is untouched. This is one frame, once,
  // in Jenn's own browser, at a moment she initiated — the trade
  // renderPdfThumbnail already makes for pdf.js.
  frame.setAttribute("sandbox", "allow-scripts");

  const query =
    version === null
      ? "capture=1"
      : `v=${encodeURIComponent(version)}&capture=1`;

  try {
    // The listener goes on BEFORE the load is allowed to start, and the order
    // is load-bearing rather than tidy: this route is served from the same box,
    // so `load` can fire before a listener attached afterwards exists, and the
    // capture then waits out its full ten seconds for an event that already
    // happened. Every shape failed at exactly the timeout until this moved.
    const loaded = new Promise<boolean>((resolve) => {
      frame.addEventListener("load", () => resolve(true), { once: true });
      frame.addEventListener("error", () => resolve(false), { once: true });
    });

    frame.src = `/p/${encodeURIComponent(slug)}/raw?${query}`;
    document.body.appendChild(frame);

    // A 404 still fires `load` — the route answers "Not found" with a body — so
    // this is not the check that catches a missing page. The bootstrap is
    // absent from that response, nobody answers the message, and the timeout is
    // what resolves it.
    if (!(await loaded)) return null;

    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));

    const blob = await request(frame);
    if (blob === null) return null;

    // The server is the authority and validates this again. Checking here only
    // avoids a pointless round trip with 128 KB in it.
    if (blob.size > MAX_THUMB_BYTES) return null;

    return blob;
  } catch {
    return null;
  } finally {
    // Always. An abandoned frame keeps a document — and whatever its scripts
    // are doing — alive for the life of the tab.
    frame.remove();
  }
}

function request(frame: HTMLIFrameElement): Promise<Blob | null> {
  return new Promise<Blob | null>((resolve) => {
    const onMessage = (event: MessageEvent) => {
      // Which window answered is the question, exactly as it is on the frame's
      // side of this exchange. The frame has an opaque origin and posts with
      // "*" because it has no origin string to target.
      if (event.source !== frame.contentWindow) return;
      const data = event.data as { type?: unknown; blob?: unknown } | null;
      if (!data || data.type !== CAPTURE_MESSAGE) return;

      window.removeEventListener("message", onMessage);
      resolve(data.blob instanceof Blob ? data.blob : null);
    };

    window.addEventListener("message", onMessage);
    frame.contentWindow?.postMessage(CAPTURE_MESSAGE, "*");
  });
}
