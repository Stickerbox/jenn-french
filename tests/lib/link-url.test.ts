import { describe, expect, it } from "vitest";
import { parseLinkUrl } from "@/lib/link-url";

describe("parseLinkUrl", () => {
  it("accepts an https URL", () => {
    expect(parseLinkUrl("https://example.com/a")).toEqual({
      ok: true,
      url: "https://example.com/a",
    });
  });

  it("accepts http", () => {
    const result = parseLinkUrl("http://example.com/");
    expect(result.ok).toBe(true);
  });

  it("prefixes a bare host, which is what a paste from the address bar looks like", () => {
    expect(parseLinkUrl("docs.google.com/document/d/abc")).toEqual({
      ok: true,
      url: "https://docs.google.com/document/d/abc",
    });
  });

  it("trims surrounding whitespace", () => {
    expect(parseLinkUrl("  https://example.com/  ")).toEqual({
      ok: true,
      url: "https://example.com/",
    });
  });

  for (const hostile of [
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    "  javascript:alert(1)  ",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
  ]) {
    it(`rejects ${hostile.trim().slice(0, 20)}`, () => {
      // The prefixing branch must never turn one of these into
      // "https://javascript:alert(1)" and quietly accept it.
      expect(parseLinkUrl(hostile).ok).toBe(false);
    });
  }

  it("rejects an empty or blank string", () => {
    expect(parseLinkUrl("").ok).toBe(false);
    expect(parseLinkUrl("   ").ok).toBe(false);
  });

  it("rejects a non-string", () => {
    expect(parseLinkUrl(null).ok).toBe(false);
    expect(parseLinkUrl(42).ok).toBe(false);
  });

  it("rejects something too long to be a link anyone pasted", () => {
    expect(parseLinkUrl(`https://example.com/${"a".repeat(2100)}`).ok).toBe(false);
  });

  it("rejects a host:port with no scheme, which reads as a scheme", () => {
    // Documented, accepted false negative: "localhost:3000/x" parses as scheme
    // "localhost:". Rejecting is the safe direction and Jenn pastes public URLs.
    expect(parseLinkUrl("localhost:3000/x").ok).toBe(false);
  });
});
