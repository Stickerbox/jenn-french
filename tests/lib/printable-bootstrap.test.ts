import { describe, expect, it } from "vitest";
import {
  CAPTURE_MESSAGE,
  PRINT_MESSAGE,
  withCaptureBootstrap,
  withPrintableBootstrap,
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

describe("the two bootstraps are independent", () => {
  // Neither gate implies the other. The admin's <a download> hits the raw route
  // with no parameter at all and has to get Jenn's bytes back; a student's
  // print must not carry a capture listener, and a capture must not carry a
  // print one.
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

  it("uses two different messages", () => {
    expect(CAPTURE_MESSAGE).not.toBe(PRINT_MESSAGE);
  });
});
