import { describe, expect, it } from "vitest";
import { SANDBOXED_DOCUMENT_CSP } from "@/lib/sandbox-csp";

describe("SANDBOXED_DOCUMENT_CSP", () => {
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
