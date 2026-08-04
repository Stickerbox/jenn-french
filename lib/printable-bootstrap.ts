export const PRINT_MESSAGE = "print-page";
export const CAPTURE_MESSAGE = "capture-page";

// A listener appended to the served document — never to the stored one. The
// `?printable=1` gate on the raw route is what keeps it out of the admin's
// download, which has to be a byte-exact copy of what Jenn uploaded so the
// round trip through her own editor does not accumulate our code.
//
// `event.source` and not `event.origin`: the frame on /p/[slug] is sandboxed
// without allow-same-origin, so this document has an opaque origin and no
// reliable origin string to compare against. The precise question is which
// window is asking, and only the shell that framed it can be window.parent —
// the sandbox forbids popups, so no other window can obtain a handle to post
// through.
//
// The raw route's CSP admits 'unsafe-inline' for scripts, so this runs.
const BOOTSTRAP = `<script>
addEventListener("message", function (event) {
  if (event.source !== window.parent) return;
  if (event.data !== ${JSON.stringify(PRINT_MESSAGE)}) return;
  window.print();
});
</script>`;

// Appended rather than spliced before </body>. A document that has been through
// a text editor may have no </body>, or several, and every parser moves a
// trailing script into the body anyway. The original is a prefix of the result,
// which is the property the test pins.
export function withPrintableBootstrap(html: string): string {
  return `${html}\n${BOOTSTRAP}\n`;
}

// The width a tile renders at, matching THUMB_WIDTH in
// components/pdf-thumbnail.ts, so a stored preview never upscales. Repeated
// rather than imported: that module is "use client" and pulls in a PDF
// renderer, and this one is read by a route handler.
const CAPTURE_WIDTH = 320;

// The second injection, and the same gate rule as the first: only the capture
// harness asks for it. Two injections in one module rather than two modules,
// because the thing worth keeping in one place is the reasoning about who is
// allowed to drive a sandboxed document.
//
// Why the document rasterises ITSELF. The capture frame is sandboxed with
// allow-scripts and WITHOUT allow-same-origin — which it must never gain, since
// the two together let a page remove its own sandbox — so the frame has an
// opaque origin and the parent cannot reach into its DOM. Serialising has to
// happen in here and the result has to be posted out.
//
// The route it is served from is the same one a student opens, under the same
// CSP. That is deliberate and is the whole reason the capture happens AFTER the
// save rather than against the HTML in memory: a preview rendered from markup
// the stored page cannot actually load would be a working feature showing the
// wrong thing. An asset the CSP blocks must show up blocked here too.
//
// This needs NO CSP change. `img-src data:` and `script-src 'unsafe-inline'`
// are already in the policy, for other reasons. Nothing here may be a reason to
// widen it.
const CAPTURE_BOOTSTRAP = `<script>
(function () {
  var MESSAGE = ${JSON.stringify(CAPTURE_MESSAGE)};
  var WIDTH = ${CAPTURE_WIDTH};

  // A blob or null, never an absence. The parent times out either way, but a
  // silent frame costs it the full timeout on every failure.
  function reply(blob) {
    try {
      window.parent.postMessage({ type: MESSAGE, blob: blob }, "*");
    } catch (e) {}
  }

  function capture() {
    var root = document.documentElement;
    // The frame's own viewport, which the parent sized to a laptop. The page
    // lays out the way opening it would, and anything below the fold is clipped
    // by the foreignObject — which is the crop the tile shows anyway.
    var w = root.clientWidth || 1024;
    var h = root.clientHeight || 768;

    // Serialised AFTER scripts have run, which is the point: a page whose
    // layout is drawn by JavaScript is captured as it ends up, not as it was
    // delivered. The known cost is that a <canvas> serialises blank.
    var markup = new XMLSerializer().serializeToString(root);
    var svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '">' +
      '<foreignObject x="0" y="0" width="' + w + '" height="' + h + '">' +
      markup +
      '</foreignObject></svg>';

    var img = new Image();
    img.onerror = function () { reply(null); };
    img.onload = function () {
      try {
        var canvas = document.createElement("canvas");
        canvas.width = WIDTH;
        canvas.height = Math.max(1, Math.round((WIDTH * h) / w));

        var ctx = canvas.getContext("2d");
        if (!ctx) { reply(null); return; }

        // White first. An unpainted canvas is transparent, which a JPEG encodes
        // as black — the same trap renderPdfThumbnail documents, and a page
        // with no background of its own hits it.
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        canvas.toBlob(function (blob) { reply(blob); }, "image/jpeg", 0.6);
      } catch (e) {
        // A tainted canvas throws here. It resolves to the live iframe, which
        // is a working preview.
        reply(null);
      }
    };
    // data: and not blob:. Both are in img-src, but a blob URL minted inside an
    // opaque origin is the fragile one, and an SVG image never loads external
    // subresources anyway — every asset it can draw was already inlined.
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }

  addEventListener("message", function (event) {
    // event.source, not event.origin — this document has an opaque origin and
    // no origin string to compare against. Which window is asking is the
    // precise question, and the sandbox forbids popups, so no other window can
    // obtain a handle to post through.
    if (event.source !== window.parent) return;
    if (event.data !== MESSAGE) return;
    // Nothing may throw out of here. A thrown error inside the frame is
    // invisible to the parent and would cost it the full timeout.
    try {
      capture();
    } catch (e) {
      reply(null);
    }
  });
})();
</script>`;

// Appended, for the reason withPrintableBootstrap is.
export function withCaptureBootstrap(html: string): string {
  return `${html}\n${CAPTURE_BOOTSTRAP}\n`;
}
