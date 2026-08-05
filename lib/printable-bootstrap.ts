import { MAX_SNAPSHOT_BYTES } from "@/lib/page-snapshot";
import { snapshotDocument } from "@/lib/snapshot-dom";

export const PRINT_MESSAGE = "print-page";
export const CAPTURE_MESSAGE = "capture-page";

// The marker that lets snapshotDocument (lib/snapshot-dom.ts) find and strip
// everything a bootstrap injects, not only <script> tags. Without it,
// PRINT_STYLE below survives a save: HTML parsing relocates a trailing
// <style> into <body> before the walk ever runs, so it is inside the tree
// snapshotDocument clones and its script-only cleanup leaves it in place —
// which meant open → save → reopen → save added one copy of that <style> per
// round trip, monotonically, to a document the codebase's own rule says
// "carries no code of ours" (see the comment on snapshotDocument itself).
//
// Every element the three bootstraps below inject carries this attribute, so
// the walk can remove all of them with one selector rather than one exception
// per tag shape. Both sides import this instead of writing the string
// themselves — the same agree-by-construction fix worksheet-field.ts uses for
// its FormData contract — EXCEPT snapshot-dom.ts, which cannot: its source is
// inlined into a browser <script> via Function.prototype.toString() and may
// not reference module scope, so its copy is a literal with a comment
// pointing back here.
export const BOOTSTRAP_MARKER_ATTR = "data-bootstrap-injected";

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
// Marked like PRINT_STYLE below even though snapshotDocument already strips
// every <script> unconditionally — that stronger, unconditional rule stays,
// and the marker is what lets a NON-script injection get the same treatment.
const BOOTSTRAP = `<script ${BOOTSTRAP_MARKER_ATTR}>
addEventListener("message", function (event) {
  if (event.source !== window.parent) return;
  if (event.data !== ${JSON.stringify(PRINT_MESSAGE)}) return;
  window.print();
});
</script>`;

// Backgrounds and colours survive the print dialog.
//
// Chrome's "Background graphics" checkbox is OFF by default and there is no API
// to tick it — a page cannot reach the print dialog's controls. What a page CAN
// do is declare that its colours are content rather than decoration, which is
// what print-color-adjust: exact means, and Chrome honours that regardless of
// the checkbox. So the box stays unticked and the backgrounds print anyway.
//
// THIS NARROWS A DOCUMENTED REFUSAL AND THE DISTINCTION IS THE WHOLE ARGUMENT.
// The rule is that a print stylesheet injected here "would be a guess about
// someone else's design". This is the one print declaration that guesses at
// nothing: it changes no layout, no spacing, no typography, no page breaks. It
// does not decide how the document should look — it stops the browser
// discarding colours the document already chose. Anything that moved a box
// would still be forbidden.
//
// No !important, and it is set on `html` alone rather than on `*`, because the
// property inherits: that makes it a DEFAULT the document can still override.
// A page that deliberately asks for `economy` somewhere keeps it, which is the
// same "author intent wins" the refusal above is protecting.
//
// Gated with the listener, so the stored document, the admin's download and
// every preview are untouched. Marked so a saved worksheet snapshot strips it
// too — see BOOTSTRAP_MARKER_ATTR above for why a <style> needed one where the
// <script>s did not.
const PRINT_STYLE = `<style ${BOOTSTRAP_MARKER_ATTR}>
@media print {
  html {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
}
</style>`;

// Appended rather than spliced before </body>. A document that has been through
// a text editor may have no </body>, or several, and every parser moves a
// trailing script into the body anyway. The original is a prefix of the result,
// which is the property the test pins.
//
// No separating "\n" between html and what follows, and none between the
// injected tags either — deliberately, not by omission. A separator would be a
// text node the parser relocates into <body> beside PRINT_STYLE and BOOTSTRAP,
// and the marker-based cleanup in snapshotDocument only removes the elements
// it marks, not stray whitespace around them: a document opened and saved
// through this bootstrap twice would keep the blank line snapshotDocument left
// behind the first time and add another, growing by one line per cycle even
// with the elements themselves cleaned up correctly.
export function withPrintableBootstrap(html: string): string {
  return `${html}${PRINT_STYLE}${BOOTSTRAP}`;
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
const CAPTURE_BOOTSTRAP = `<script ${BOOTSTRAP_MARKER_ATTR}>
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

// Appended, for the reason withPrintableBootstrap is, including the absence
// of a separating "\n" — see that function's comment. A capture is never fed
// back into snapshotDocument today, but nothing here should rely on that
// staying true to avoid the same accumulation.
export function withCaptureBootstrap(html: string): string {
  return `${html}${CAPTURE_BOOTSTRAP}`;
}

export const SNAPSHOT_MESSAGE = "snapshot-page";

// The third injection, and the same gate rule as the other two: only the
// worksheet shell asks for ?snapshot=1, and none of the three implies another.
//
// The walk lives in lib/snapshot-dom.ts and is inlined here by its own source —
// the technique Playwright uses for page.evaluate. That is not cleverness for
// its own sake: it is ~80 lines of DOM traversal whose failure mode is a
// student's homework saved silently wrong, and a string in this file can only
// be tested for what it CONTAINS. As a module it is tested for what it DOES,
// against real DOM fixtures, including a test that runs this very toString()
// output. The alternative — a hand-maintained second copy in here — is two
// implementations of one rule, which is the drift this codebase keeps
// designing against.
//
// It replies ALWAYS, which inverts the contract of the capture bootstrap above
// it. That one answers null on every failure because a missing preview leaves a
// working iframe in place; a silent save loses a student's homework.
const SNAPSHOT_BOOTSTRAP = `<script ${BOOTSTRAP_MARKER_ATTR}>
(function () {
  var MESSAGE = ${JSON.stringify(SNAPSHOT_MESSAGE)};
  var MAX_BYTES = ${MAX_SNAPSHOT_BYTES};
  var snapshotDocument = ${snapshotDocument.toString()};

  function reply(payload) {
    try {
      window.parent.postMessage(payload, "*");
    } catch (e) {}
  }

  addEventListener("message", function (event) {
    // event.source, not event.origin — this document has an opaque origin and
    // no origin string to compare against. Which window is asking is the
    // precise question, and the sandbox forbids popups, so no other window can
    // obtain a handle to post through.
    if (event.source !== window.parent) return;
    if (event.data !== MESSAGE) return;

    try {
      var html = snapshotDocument(document.documentElement);
      // Measured here rather than server-side alone, so an over-large save is a
      // sentence in the shell instead of a raw 413 nginx returns and Next never
      // sees.
      if (new TextEncoder().encode(html).length > MAX_BYTES) {
        reply({ type: MESSAGE, ok: false, reason: "too-large" });
        return;
      }
      reply({ type: MESSAGE, ok: true, html: html });
    } catch (e) {
      // Nothing may throw out of here. A thrown error inside the frame is
      // invisible to the parent, and here that would cost a student their work
      // with no explanation.
      reply({ type: MESSAGE, ok: false, reason: "failed" });
    }
  });
})();
</script>`;

// Appended, for the reason withPrintableBootstrap is, including the absence
// of a separating "\n" — see that function's comment. This one matters most:
// it is composed with withPrintableBootstrap on the worksheet route, and their
// output is exactly what snapshotDocument later walks, so a stray separator
// left here is the same accumulation, one more layer down.
export function withSnapshotBootstrap(html: string): string {
  return `${html}${SNAPSHOT_BOOTSTRAP}`;
}
