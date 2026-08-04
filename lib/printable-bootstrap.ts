export const PRINT_MESSAGE = "print-page";

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
