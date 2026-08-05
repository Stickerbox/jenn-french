import { describe, expect, it } from "vitest";
import { MAX_SNAPSHOT_BYTES } from "@/lib/page-snapshot";
import {
  CAPTURE_MESSAGE,
  PRINT_MESSAGE,
  SNAPSHOT_MESSAGE,
  withCaptureBootstrap,
  withPrintableBootstrap,
  withSnapshotBootstrap,
} from "@/lib/printable-bootstrap";

const DOC = "<!doctype html><html><body><p>Bonjour</p></body></html>";

describe("withPrintableBootstrap", () => {
  it("leaves the teacher's document byte-identical and appends after it", () => {
    // The document is never rewritten. The admin's download hits the same route
    // without the query parameter and has to be exactly what she uploaded, so
    // anything that edited the markup here would eventually edit her source.
    expect(withPrintableBootstrap(DOC).startsWith(DOC)).toBe(true);
  });

  it("adds a script", () => {
    expect(withPrintableBootstrap(DOC)).toContain("<script>");
  });

  it("calls print", () => {
    expect(withPrintableBootstrap(DOC)).toContain("window.print()");
  });

  it("authenticates the sender by window, not by origin", () => {
    // The frame has an opaque origin, so there is no origin string it could
    // compare against. The only window that can legitimately drive it is the
    // shell that framed it.
    expect(withPrintableBootstrap(DOC)).toContain("event.source !== window.parent");
  });

  it("listens for exactly the message the shell sends", () => {
    expect(withPrintableBootstrap(DOC)).toContain(JSON.stringify(PRINT_MESSAGE));
  });

  it("works on a document with no body tag to splice into", () => {
    // Not a hypothetical: a hand-edited or fragment-shaped upload may have no
    // </body> at all, or several. Appending needs neither.
    const result = withPrintableBootstrap("<p>fragment</p>");
    expect(result).toContain("<p>fragment</p>");
    expect(result).toContain("window.print()");
  });

  it("asks the browser to keep the document's own colours when printing", () => {
    // Chrome's "Background graphics" box is off by default and unreachable
    // from a page; print-color-adjust is how a document says its colours are
    // content rather than decoration.
    const result = withPrintableBootstrap(DOC);
    expect(result).toContain("print-color-adjust: exact");
    expect(result).toContain("-webkit-print-color-adjust: exact");
  });

  it("scopes that to print and to nothing else", () => {
    expect(withPrintableBootstrap(DOC)).toContain("@media print");
  });

  it("leaves it overridable, so it is a default and not a decision", () => {
    // No !important, and on `html` rather than `*`: the property inherits, so a
    // document that deliberately asks for `economy` still wins. Injecting a
    // print rule at all narrows a documented refusal; this is what keeps it to
    // "do not discard the author's colours" rather than "the author is wrong".
    const result = withPrintableBootstrap(DOC);
    expect(result).not.toContain("print-color-adjust: exact !important");
    expect(result).not.toContain("* {");
  });
});

describe("withCaptureBootstrap", () => {
  it("leaves the teacher's document byte-identical and appends after it", () => {
    expect(withCaptureBootstrap(DOC).startsWith(DOC)).toBe(true);
  });

  it("authenticates the sender by window, not by origin", () => {
    // The capture frame is sandboxed without allow-same-origin, so it has an
    // opaque origin and no origin string it could compare against.
    expect(withCaptureBootstrap(DOC)).toContain(
      "event.source !== window.parent",
    );
  });

  it("listens for exactly the message the harness sends", () => {
    expect(withCaptureBootstrap(DOC)).toContain(
      JSON.stringify(CAPTURE_MESSAGE),
    );
  });

  it("paints the canvas white before drawing", () => {
    // An unpainted canvas is transparent, which a JPEG encodes as black.
    expect(withCaptureBootstrap(DOC)).toContain("fillRect");
  });

  it("works on a document with no body tag to splice into", () => {
    const result = withCaptureBootstrap("<p>fragment</p>");
    expect(result).toContain("<p>fragment</p>");
    expect(result).toContain("foreignObject");
  });
});

describe("withSnapshotBootstrap", () => {
  it("leaves the teacher's document byte-identical and appends after it", () => {
    expect(withSnapshotBootstrap(DOC).startsWith(DOC)).toBe(true);
  });

  it("authenticates the sender by window, not by origin", () => {
    expect(withSnapshotBootstrap(DOC)).toContain("event.source !== window.parent");
  });

  it("listens for exactly the message the shell sends", () => {
    expect(withSnapshotBootstrap(DOC)).toContain(JSON.stringify(SNAPSHOT_MESSAGE));
  });

  it("carries the walk itself, not a call to a module it cannot reach", () => {
    // The frame has no module system and no import map. If this ever stops
    // being the function's own source, the save fails in the browser only.
    expect(withSnapshotBootstrap(DOC)).toContain("querySelectorAll(\"script\")");
  });

  it("refuses an over-large snapshot before posting it", () => {
    // So the failure is a sentence rather than a raw 413 that Next never sees.
    expect(withSnapshotBootstrap(DOC)).toContain(String(MAX_SNAPSHOT_BYTES));
    expect(withSnapshotBootstrap(DOC)).toContain("too-large");
  });

  it("always replies, so a failure is never silence", () => {
    // This INVERTS captureHtmlThumbnail's contract beside it, and the inversion
    // is the point: a missing preview leaves a working iframe, a silent save
    // loses a student's homework.
    expect(withSnapshotBootstrap(DOC)).toContain("ok: false");
  });

  it("works on a document with no body tag to splice into", () => {
    const result = withSnapshotBootstrap("<p>fragment</p>");
    expect(result).toContain("<p>fragment</p>");
    expect(result).toContain(JSON.stringify(SNAPSHOT_MESSAGE));
  });
});

describe("the three bootstraps are mutually exclusive", () => {
  // No gate implies another. The admin's <a download> hits the raw route with
  // no parameter at all and has to get Jenn's bytes back; a print must not
  // carry a capture or snapshot listener, and a snapshot must not carry a print
  // one — they are separate listeners on one message channel, and a document
  // holding two would answer a message it was never sent.
  it("does not inject the capture listener when asked to print", () => {
    expect(withPrintableBootstrap(DOC)).not.toContain(
      JSON.stringify(CAPTURE_MESSAGE),
    );
    expect(withPrintableBootstrap(DOC)).not.toContain("foreignObject");
  });

  it("does not inject the print listener when asked to capture", () => {
    expect(withCaptureBootstrap(DOC)).not.toContain(
      JSON.stringify(PRINT_MESSAGE),
    );
    expect(withCaptureBootstrap(DOC)).not.toContain("window.print()");
  });

  it("keeps the snapshot listener out of the other two", () => {
    expect(withPrintableBootstrap(DOC)).not.toContain(JSON.stringify(SNAPSHOT_MESSAGE));
    expect(withCaptureBootstrap(DOC)).not.toContain(JSON.stringify(SNAPSHOT_MESSAGE));
  });

  it("keeps the other two out of the snapshot bootstrap", () => {
    expect(withSnapshotBootstrap(DOC)).not.toContain(JSON.stringify(PRINT_MESSAGE));
    expect(withSnapshotBootstrap(DOC)).not.toContain(JSON.stringify(CAPTURE_MESSAGE));
    expect(withSnapshotBootstrap(DOC)).not.toContain("window.print()");
    expect(withSnapshotBootstrap(DOC)).not.toContain("foreignObject");
  });

  it("uses three different messages", () => {
    expect(new Set([PRINT_MESSAGE, CAPTURE_MESSAGE, SNAPSHOT_MESSAGE]).size).toBe(3);
  });
});
