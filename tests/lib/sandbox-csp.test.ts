import { describe, expect, it } from "vitest";
import { SANDBOXED_DOCUMENT_CSP } from "@/lib/sandbox-csp";

describe("SANDBOXED_DOCUMENT_CSP", () => {
  // The named tests below each pin one property a directive must keep, but a
  // new directive — img-src *, media-src *, a protocol-relative
  // //cdn.example.com — could satisfy all of them while still reopening the
  // exfiltration path the module comment describes. Only a whole-string
  // comparison catches a widening the named tests would let through; this is
  // the primary containment boundary for two live sandboxed routes.
  it("matches its exact known-good policy string", () => {
    expect(SANDBOXED_DOCUMENT_CSP).toBe(
      "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' blob:; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'; frame-ancestors 'self'; form-action 'none'; base-uri 'none'",
    );
  });

  it("admits no network destination at all", () => {
    // The load-bearing property. A subresource load is a real GET request, so
    // ONE directive admitting https: would reopen the exfiltration path
    // connect-src 'none' closes for fetch/XHR/beacon.
    expect(SANDBOXED_DOCUMENT_CSP).not.toContain("https:");
    expect(SANDBOXED_DOCUMENT_CSP).not.toContain("http:");
    expect(SANDBOXED_DOCUMENT_CSP).toContain("connect-src 'none'");
  });

  it("starts closed", () => {
    expect(SANDBOXED_DOCUMENT_CSP).toContain("default-src 'none'");
  });

  it("lets a self-contained document render itself", () => {
    // inlinePage folds every external asset into the document, so these three
    // are what a published page needs and the whole of what it needs.
    expect(SANDBOXED_DOCUMENT_CSP).toContain("script-src 'unsafe-inline'");
    expect(SANDBOXED_DOCUMENT_CSP).toContain("style-src 'unsafe-inline'");
    expect(SANDBOXED_DOCUMENT_CSP).toContain("img-src data:");
  });

  it("refuses to be framed off-origin, and refuses form posts", () => {
    expect(SANDBOXED_DOCUMENT_CSP).toContain("frame-ancestors 'self'");
    expect(SANDBOXED_DOCUMENT_CSP).toContain("form-action 'none'");
    expect(SANDBOXED_DOCUMENT_CSP).toContain("base-uri 'none'");
  });
});
