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

  // Freezes the animated present onto a clone.
  //
  // An SVG image renders in the browser's secure static mode: no scripts, no
  // network, AND NO ANIMATIONS — every CSS animation is pinned at its first
  // keyframe. The Dia artifacts this feature exists for are full of
  // \`@keyframes fade-in { from { opacity: 0 } }\`, so a straight serialisation
  // photographs them at opacity 0 and stores a picture of an empty page under a
  // real page's title. Two of the three real artifacts tested captured as bare
  // background colour before this existed.
  //
  // The cure is to copy what is ACTUALLY on screen right now — the computed
  // value, after the animation has run — onto the clone as an inline style, and
  // turn the animation off so nothing rewinds it. Only opacity and transform,
  // and only when they are not already the default: those two carry every
  // reveal effect worth naming, and copying every property of every node would
  // cost more than the picture is worth.
  function settle(live, copy) {
    var from = live.querySelectorAll("*");
    var to = copy.querySelectorAll("*");
    // Lockstep, and it holds because the copy is a deep clone of the live tree
    // taken a moment ago and nothing has mutated either since.
    var n = Math.min(from.length, to.length);
    for (var i = 0; i < n; i++) {
      var s = window.getComputedStyle(from[i]);
      if (!s) continue;
      var style = to[i].style;
      if (s.opacity !== "" && s.opacity !== "1") style.opacity = s.opacity;
      if (s.transform && s.transform !== "none") style.transform = s.transform;
      // Belt and braces: without this a keyframe could still win over the
      // inline value once the image is rasterised.
      style.animation = "none";
      style.transition = "none";
    }
  }

  // True when nearly every pixel matches the first one — a page of one colour,
  // which is what a failed rasterisation looks like. Deliberately crude: it has
  // to separate "a document" from "a rectangle", not judge composition. The
  // threshold is low so a genuinely minimal page — a title on a plain ground —
  // still counts as content.
  function isBlank(ctx, canvas) {
    try {
      var d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      var r0 = d[0], g0 = d[1], b0 = d[2];
      var differing = 0, sampled = 0;
      // Every fourth pixel. Enough to find a paragraph of text, cheap enough
      // not to be felt on a 320px canvas.
      for (var i = 0; i < d.length; i += 16) {
        sampled++;
        if (Math.abs(d[i] - r0) + Math.abs(d[i+1] - g0) + Math.abs(d[i+2] - b0) > 24) {
          differing++;
        }
      }
      return sampled === 0 || differing / sampled < 0.005;
    } catch (e) {
      // A tainted canvas throws here. Not blank as far as we can tell, and the
      // toBlob below will fail on its own if the taint is real.
      return false;
    }
  }

  // Waits for the document's own webfonts before photographing it.
  //
  // Not a nicety. These artifacts inline their typefaces as data: URLs, and a
  // document serialised before they are ready rasterises with no text at all —
  // not fallback text, NONE — so the picture is the page's background colour
  // and nothing else. That failure was observed on real artifacts and is
  // timing-dependent, which is the worst kind: it passes on a warm machine and
  // fails on a cold one. document.fonts.ready is the actual signal, so it is
  // waited on rather than guessed at with a longer delay.
  //
  // Both arms of the then() run the capture: a font that fails to load is a
  // page rendered in a fallback face, which is still worth a picture.
  function whenReady(go) {
    if (document.fonts && document.fonts.ready && document.fonts.ready.then) {
      document.fonts.ready.then(go, go);
    } else {
      go();
    }
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
    //
    // A clone, because the live tree must not be touched — this document is
    // also what the student is looking at if the capture ever runs anywhere
    // visible, and settle() below writes inline styles.
    var clone = root.cloneNode(true);
    settle(root, clone);
    var markup = new XMLSerializer().serializeToString(clone);
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

        // A BLANK PICTURE IS WORSE THAN NO PICTURE, and this is the guard that
        // makes that true rather than aspirational. foreignObject rasterisation
        // is browser-dependent and sometimes draws a document's background and
        // none of its content — observed on real artifacts, not hypothetically.
        // Such a result is still a valid JPEG, so without this check it would
        // be stored, and a stored picture REPLACES the live iframe: the tile
        // would go from a working preview to a flat rectangle, which is exactly
        // the "working feature showing the wrong thing" this design keeps
        // refusing. Reporting null instead leaves the iframe in place.
        if (isBlank(ctx, canvas)) { reply(null); return; }

        canvas.toBlob(function (blob) { reply(blob); }, "image/jpeg", 0.6);
      } catch (e) {
        // A tainted canvas throws here. It resolves to the live iframe, which
        // is a working preview.
        reply(null);
      }
    };
    // data: and NOT blob:, and this was measured rather than assumed. Both are
    // in img-src, so the CSP permits either; a blob URL minted inside this
    // frame's opaque origin simply never loads, and swapping to one took the
    // capture from four pages in four to zero in four, three runs running.
    // An SVG image loads no external subresources anyway, so the encoding cost
    // buys nothing back — it is just the only one of the two that works here.
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
      whenReady(function () {
        try {
          capture();
        } catch (e) {
          reply(null);
        }
      });
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
