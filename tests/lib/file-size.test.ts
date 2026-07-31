import { describe, it, expect } from "vitest";
import { formatFileSize } from "@/lib/file-size";
import { MAX_PAGE_BYTES } from "@/lib/page-html";

describe("formatFileSize", () => {
  it("rounds a tiny file up to 1 KB rather than showing 0 KB", () => {
    expect(formatFileSize(200)).toBe("1 KB");
  });

  it("shows whole kilobytes with no decimals under 1 MB", () => {
    expect(formatFileSize(921_600)).toBe("900 KB");
  });

  it("switches to megabytes at exactly 1 MB", () => {
    expect(formatFileSize(1024 * 1024)).toBe("1.0 MB");
  });

  it("shows one decimal for a fractional megabyte", () => {
    expect(formatFileSize(1.5 * 1024 * 1024)).toBe("1.5 MB");
  });

  it("formats the 2 MB upload cap", () => {
    expect(formatFileSize(MAX_PAGE_BYTES)).toBe("2.0 MB");
  });
});
