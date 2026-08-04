import { describe, expect, it } from "vitest";
import {
  PRINT_MESSAGE,
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
});
